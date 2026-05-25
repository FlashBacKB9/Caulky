import asyncio
import json
import mimetypes
import os
import re
import secrets
import shutil
import time
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.websockets import WebSocketState
from pydantic import BaseModel, field_validator  # noqa: F401
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.setup import current_active_user
from app.database import get_db
from app.models.user import User
from app.models.user_preference import UserPreference

router = APIRouter(prefix="/ai", tags=["ai-consultant"])

# Single-use WebSocket tickets: token → (user_id, expiry, write_perms_json, session_id)
_tickets: dict[str, tuple[str, float, str, str]] = {}
_TICKET_TTL = 30  # seconds


class TicketRequest(BaseModel):
    session_id: str = ""


def _sanitize_session_id(raw: str) -> str:
    """Return a filesystem-safe session id."""
    clean = re.sub(r'[^a-zA-Z0-9_-]', '', raw)[:64]
    return clean or 'default'


@router.post("/terminal/ticket")
async def create_terminal_ticket(
    body: TicketRequest = Body(default=TicketRequest()),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a 30-second single-use ticket for the terminal WebSocket."""
    now = time.time()
    expired = [k for k, (_, exp, _p, _s) in _tickets.items() if exp < now]
    for k in expired:
        _tickets.pop(k, None)

    pref_res = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == user.id,
            UserPreference.key == 'ai-write-perms',
        )
    )
    pref = pref_res.scalar_one_or_none()
    write_perms_json = pref.value if pref else '{}'

    token = secrets.token_urlsafe(32)
    session_id = _sanitize_session_id(body.session_id)
    _tickets[token] = (str(user.id), now + _TICKET_TTL, write_perms_json, session_id)
    return {"ticket": token}


def _consume_ticket(token: str) -> tuple[Optional[str], Optional[str], str]:
    entry = _tickets.pop(token, None)
    if entry is None:
        return None, None, 'default'
    user_id, expiry, write_perms_json, session_id = entry
    if time.time() > expiry:
        return None, None, 'default'
    return user_id, write_perms_json, session_id


_WELCOME_BANNER = (
    "\r\n"
    "\x1b[1;34m┌────────────────────────────────────────────────────────┐\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[1;37mCaulkAI · Tu consultor financiero personal\x1b[0m      \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m                                                        \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[90mAnalizo tus gastos, ingresos e inversiones. Puedo\x1b[0m  \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[90mcrear informes, detectar patrones y responder\x1b[0m      \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[90mcualquier pregunta sobre tus finanzas.\x1b[0m            \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m                                                        \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[90mSube documentos de contexto desde el panel lateral.\x1b[0m \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m│\x1b[0m  \x1b[90mControla mis permisos de escritura abajo a la izq.\x1b[0m  \x1b[1;34m│\x1b[0m\r\n"
    "\x1b[1;34m└────────────────────────────────────────────────────────┘\x1b[0m\r\n"
    "\r\n"
)


def _build_claude_md(user_id: str, write_perms: dict) -> str:
    # Build the list of enabled write ops for the header note
    op_labels = {'create': 'Crear', 'edit': 'Editar', 'delete': 'Borrar'}
    enabled_ops = [op_labels[k] for k in ('create', 'edit', 'delete') if write_perms.get(k)]
    write_enabled = bool(enabled_ops)

    write_section = ''
    if write_enabled:
        examples = []
        if write_perms.get('create'):
            examples.append(
                f"# Crear un movimiento\n"
                f"spendly-write \"INSERT INTO movements (name, dinero, date, user_id, paid, no_count) "
                f"VALUES ('Nombre', -50.00, CURRENT_DATE, '{user_id}', true, false)\""
            )
        if write_perms.get('edit'):
            examples.append(
                f"# Editar un movimiento\n"
                f"spendly-write \"UPDATE movements SET name = 'Nuevo nombre' "
                f"WHERE id = 123 AND user_id = '{user_id}'\""
            )
        if write_perms.get('delete'):
            examples.append(
                f"# Borrar un movimiento\n"
                f"spendly-write \"DELETE FROM movements WHERE id = 123 AND user_id = '{user_id}'\""
            )

        ops_str = ', '.join(enabled_ops)
        write_section = f"""

## Modificar la base de datos

Usa el comando `spendly-write` para realizar escrituras. Operaciones habilitadas: **{ops_str}**.

```bash
{chr(10).join(examples)}
```

**Reglas de seguridad obligatorias:**
- Incluye siempre `user_id = '{user_id}'` en todas las sentencias.
- Para UPDATE y DELETE, verifica primero con `spendly-query` que el registro existe y pertenece al usuario.
- Pide confirmación explícita al usuario antes de ejecutar borrados o ediciones masivas.
- Nunca modifiques registros sin condición WHERE que incluya `user_id`.
"""

    return f"""\
# Spendly — Consultor IA

Eres un asistente financiero personal con acceso directo a la base de datos Spendly del usuario.

## Usuario actual
- **user_id:** `{user_id}`
- Filtra **siempre** por `user_id = '{user_id}'` en todas las consultas y escrituras.

## Consultar la base de datos

Usa el comando `spendly-query` seguido de la consulta SQL entre comillas dobles:

```bash
spendly-query "SELECT name, dinero FROM movements WHERE user_id = '{user_id}' LIMIT 10"
```

- Solo se permiten SELECT y WITH (lectura pura, sin INSERT/UPDATE/DELETE).
- Incluye siempre la condición `user_id = '{user_id}'` para ver solo los datos del usuario.

## Esquema de tablas

### movements — movimientos financieros
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | int | PK |
| name | text | Descripción del movimiento |
| dinero | decimal | Importe **con signo**: negativo = gasto, positivo = ingreso/devolución |
| money | decimal | Importe absoluto (sin signo) |
| date | date | Fecha del movimiento |
| bank_date | date | Fecha valor bancaria (puede ser NULL) |
| movement_type_id | int | FK → movement_types.id (puede ser NULL) |
| account_id | int | FK → accounts.id (puede ser NULL) |
| user_id | uuid | FK → users.id |
| paid | bool | Si está confirmado/ejecutado |
| no_count | bool | Si se excluye de los análisis y resúmenes |
| notes | text | Notas libres (puede ser NULL) |

### accounts — cuentas bancarias/carteras
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | int | PK |
| name | text | Nombre de la cuenta |
| user_id | uuid | FK → users.id |

### movement_types — categorías de movimiento
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | int | PK |
| name | text | Nombre (ej. "Supermercado", "Nómina") |
| color | text | Color en hex |
| income_expense_group_id | int | FK → income_expense_groups.id |

### income_expense_groups — grupos de ingresos/gastos
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | int | PK |
| name | text | "Ingreso", "Ahorro" u otro (gastos) |

## Convenciones clave
- `dinero < 0` → gasto (importe real = `ABS(dinero)`)
- `dinero > 0` → ingreso o devolución
- `no_count = true` → excluido de resúmenes (no contar)
- `paid = false` → movimiento pendiente de confirmación

## Ejemplos de consultas útiles

```sql
-- Gasto total del mes actual por categoría
SELECT mt.name, SUM(ABS(m.dinero)) AS total
FROM movements m
JOIN movement_types mt ON mt.id = m.movement_type_id
WHERE m.user_id = '{user_id}' AND m.dinero < 0 AND m.no_count = false
  AND date_trunc('month', m.date) = date_trunc('month', CURRENT_DATE)
GROUP BY mt.name ORDER BY total DESC;

-- Balance mensual del último año
SELECT date_trunc('month', date) AS mes,
       SUM(dinero) FILTER (WHERE dinero > 0) AS ingresos,
       SUM(ABS(dinero)) FILTER (WHERE dinero < 0) AS gastos,
       SUM(dinero) AS balance
FROM movements
WHERE user_id = '{user_id}' AND no_count = false
  AND date >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY mes ORDER BY mes;

-- Top 10 gastos puntuales
SELECT name, ABS(dinero) AS importe, date
FROM movements
WHERE user_id = '{user_id}' AND dinero < 0
ORDER BY dinero ASC LIMIT 10;
```
{write_section}
## Comportamiento proactivo

- Al recibir un saludo o inicio de conversación, responde con una bienvenida breve y ofrece **2-3 sugerencias concretas** de análisis que puedes hacer ahora mismo (ej: resumen del mes, top gastos por categoría, comparativa mensual). Máximo 4 líneas.
- Durante la conversación, si el usuario menciona un período, categoría o pregunta de análisis, **ofrece proactivamente** continuar: "¿Quieres que genere un informe detallado?", "¿Comparo con el mes anterior?", etc.
- Si generas una tabla grande o gráfico, **guárdalo como archivo HTML** en el directorio de trabajo para que el usuario pueda abrirlo desde el panel de Archivos.

## Archivos de contexto

El directorio `context/` puede contener documentos subidos por el usuario (PDFs, Excel exportados, notas…). Úsalos como referencia adicional cuando el usuario los mencione.

## Idioma y estilo
- Responde siempre en **español**.
- Sé conciso y directo.
- Usa `€` para los importes, redondeado a 2 decimales.
- Presenta los resultados en texto claro (tabla markdown si hay muchas filas).
"""


@router.websocket("/terminal/ws")
async def terminal_ws(websocket: WebSocket, ticket: str):
    user_id, write_perms_json, session_id = _consume_ticket(ticket)
    if user_id is None:
        await websocket.close(code=4401)
        return

    await websocket.accept()

    try:
        write_perms = json.loads(write_perms_json or '{}')
    except Exception:
        write_perms = {}

    write_enabled = any(write_perms.values())

    # Each session gets its own subdirectory so Claude remembers its conversation
    workspace = f"/app/workspace/{user_id}/sessions/{session_id}"
    os.makedirs(workspace, exist_ok=True)

    with open(os.path.join(workspace, "CLAUDE.md"), "w") as f:
        f.write(_build_claude_md(user_id, write_perms))

    # Per-user Claude home inside the persistent workspace volume (isolated per user)
    claude_home = f"/app/workspace/{user_id}/claude-home"
    os.makedirs(claude_home, exist_ok=True)

    # Use --continue only after the first successful run; track this with a marker file
    session_marker = os.path.join(workspace, ".has_conversation")
    has_prior_conversation = os.path.exists(session_marker)
    claude_cmd = ["claude", "--continue"] if has_prior_conversation else ["claude"]
    if not has_prior_conversation:
        open(session_marker, "w").close()
        await websocket.send_text(_WELCOME_BANNER)

    env = os.environ.copy()
    env.update({
        "TERM": "xterm-256color",
        "COLUMNS": "200",
        "LINES": "50",
        "HOME": claude_home,
        "AI_USER_ID": user_id,
        "AI_WRITE_ENABLED": "true" if write_enabled else "false",
        "AI_WRITE_PERMS": json.dumps(write_perms),
    })

    try:
        import ptyprocess  # noqa: PLC0415
    except ImportError:
        await websocket.send_text(
            "\r\n\x1b[31mError: ptyprocess no instalado en el servidor.\x1b[0m\r\n"
        )
        await websocket.close()
        return

    try:
        proc = ptyprocess.PtyProcess.spawn(
            claude_cmd,
            cwd=workspace,
            env=env,
            dimensions=(50, 200),
        )
    except FileNotFoundError:
        await websocket.send_text(
            "\r\n\x1b[31mError: comando 'claude' no encontrado. "
            "¿Está instalado Node.js y el CLI de Claude Code?\x1b[0m\r\n"
        )
        await websocket.close()
        return
    except Exception as exc:
        await websocket.send_text(
            f"\r\n\x1b[31mError al iniciar Claude: {exc}\x1b[0m\r\n"
        )
        await websocket.close()
        return

    loop = asyncio.get_event_loop()

    async def pty_to_ws():
        while True:
            try:
                data = await loop.run_in_executor(None, proc.read, 4096)
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_bytes(data)
            except (EOFError, OSError):
                break

    async def ws_to_pty():
        while True:
            try:
                msg = await websocket.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if "bytes" in msg:
                    proc.write(msg["bytes"])
                elif "text" in msg:
                    text_data: str = msg["text"]
                    if text_data.startswith("resize:"):
                        _, cols, rows = text_data.split(":")
                        proc.setwinsize(int(rows), int(cols))
                    else:
                        proc.write(text_data.encode())
            except (WebSocketDisconnect, Exception):
                break

    pty_task  = asyncio.create_task(pty_to_ws())
    ws_task   = asyncio.create_task(ws_to_pty())

    await asyncio.wait([pty_task, ws_task], return_when=asyncio.FIRST_COMPLETED)

    for task in (pty_task, ws_task):
        task.cancel()
    await asyncio.gather(pty_task, ws_task, return_exceptions=True)

    try:
        proc.terminate()
    except Exception:
        pass

    if websocket.client_state == WebSocketState.CONNECTED:
        try:
            await websocket.close()
        except Exception:
            pass


# ── Workspace file browser ───────────────────────────────────────────────────

@router.get("/workspace/view/{path:path}")
async def view_workspace_file(path: str, user: User = Depends(current_active_user)):
    """Serve a workspace file inline with path-based routing so relative links work."""
    workspace = f"/app/workspace/{user.id}"
    safe = os.path.normpath(os.path.join(workspace, path))
    if not safe.startswith(os.path.join(workspace, "")):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    if not os.path.isfile(safe):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    media_type = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    return FileResponse(safe, media_type=media_type)


_SKIP_FILES = {"CLAUDE.md", ".has_conversation"}
_SKIP_DIRS  = {"sessions", "claude-home"}


@router.get("/workspace/files")
async def list_workspace_files(user: User = Depends(current_active_user)):
    workspace = f"/app/workspace/{user.id}"
    if not os.path.exists(workspace):
        return {"files": [], "dirs": []}

    files = []
    for root, dirs, filenames in os.walk(workspace):
        rel_root = os.path.relpath(root, workspace).replace("\\", "/")
        if rel_root == ".":
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _SKIP_DIRS]
        else:
            dirs[:] = [d for d in dirs if not d.startswith(".")]

        for fname in filenames:
            if fname in _SKIP_FILES:
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, workspace).replace("\\", "/")
            try:
                st = os.stat(full)
                files.append({"path": rel, "name": fname, "size": st.st_size, "modified": st.st_mtime})
            except OSError:
                continue

    files.sort(key=lambda f: f["modified"], reverse=True)

    top_dirs = sorted([
        d for d in os.listdir(workspace)
        if os.path.isdir(os.path.join(workspace, d))
        and not d.startswith(".")
        and d not in _SKIP_DIRS
    ])

    return {"files": files, "dirs": top_dirs}


@router.delete("/workspace/file")
async def delete_workspace_item(path: str, user: User = Depends(current_active_user)):
    workspace = f"/app/workspace/{user.id}"
    safe = os.path.normpath(os.path.join(workspace, path))
    if not safe.startswith(os.path.join(workspace, "")):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    if not os.path.exists(safe):
        raise HTTPException(status_code=404, detail="No encontrado")
    if os.path.isfile(safe):
        os.remove(safe)
    else:
        shutil.rmtree(safe)
    return {"deleted": path}


_ALLOWED_UPLOAD_EXTS = {
    ".txt", ".md", ".pdf", ".docx", ".doc", ".xlsx", ".xls",
    ".csv", ".json", ".html", ".htm", ".py", ".js", ".ts",
}

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/workspace/upload")
async def upload_context_file(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
):
    raw_name = os.path.basename(file.filename or "file")
    name, ext = os.path.splitext(raw_name)
    if ext.lower() not in _ALLOWED_UPLOAD_EXTS:
        raise HTTPException(status_code=400, detail=f"Extensión no permitida: {ext}")

    safe_name = re.sub(r'[^\w\-.]', '_', raw_name)
    context_dir = f"/app/workspace/{user.id}/context"
    os.makedirs(context_dir, exist_ok=True)
    dest = os.path.join(context_dir, safe_name)

    content = await file.read(_MAX_UPLOAD_BYTES + 1)
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máx 20 MB)")

    with open(dest, "wb") as f:
        f.write(content)

    return {"path": f"context/{safe_name}", "name": safe_name}


@router.get("/workspace/file")
async def download_workspace_file(path: str, inline: bool = False, user: User = Depends(current_active_user)):
    workspace = f"/app/workspace/{user.id}"
    safe = os.path.normpath(os.path.join(workspace, path))
    if not safe.startswith(os.path.join(workspace, "")):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    if not os.path.isfile(safe):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    media_type = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    if inline:
        return FileResponse(safe, media_type=media_type)
    return FileResponse(safe, filename=os.path.basename(safe), media_type=media_type)


class MkdirRequest(BaseModel):
    path: str

    @field_validator("path")
    @classmethod
    def sanitize(cls, v: str) -> str:
        clean = re.sub(r'[^\w\- ]', '', v.strip()).strip()
        if not clean:
            raise ValueError("Nombre de carpeta vacío")
        return clean


@router.post("/workspace/mkdir")
async def make_workspace_dir(body: MkdirRequest, user: User = Depends(current_active_user)):
    workspace = f"/app/workspace/{user.id}"
    target = os.path.normpath(os.path.join(workspace, body.path))
    if not target.startswith(os.path.join(workspace, "")):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    os.makedirs(target, exist_ok=True)
    return {"path": body.path}


class MoveRequest(BaseModel):
    from_: str
    to: str

    class Config:
        populate_by_name = True

    @classmethod
    def __get_validators__(cls):
        yield cls._validate

    @classmethod
    def _validate(cls, v):
        return v


@router.post("/workspace/move")
async def move_workspace_file(body: dict, user: User = Depends(current_active_user)):
    from_path = body.get("from", "")
    to_path   = body.get("to", "")
    if not from_path or not to_path:
        raise HTTPException(status_code=400, detail="Faltan campos from/to")
    workspace = f"/app/workspace/{user.id}"
    safe_from = os.path.normpath(os.path.join(workspace, from_path))
    safe_to   = os.path.normpath(os.path.join(workspace, to_path))
    if not safe_from.startswith(os.path.join(workspace, "")) or \
       not safe_to.startswith(os.path.join(workspace, "")):
        raise HTTPException(status_code=400, detail="Ruta no válida")
    if not os.path.exists(safe_from):
        raise HTTPException(status_code=404, detail="No encontrado")
    os.makedirs(os.path.dirname(safe_to), exist_ok=True)
    os.rename(safe_from, safe_to)
    return {"from": from_path, "to": to_path}
