"""
Caulky — standalone entry point (SQLite, no Docker, no PostgreSQL).

Data is stored in ~/Caulky/ by default.
Override with the CAULKY_DATA_DIR environment variable.
"""
import os
import sys
import asyncio
import threading
import webbrowser
from pathlib import Path

# ── Data directory (must be set before app imports) ───────────────────────────
DATA_DIR = Path(os.environ.get("CAULKY_DATA_DIR") or Path.home() / "Caulky")
DATA_DIR.mkdir(parents=True, exist_ok=True)

UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# ── Secret key: generate once per installation and persist ────────────────────
import secrets as _secrets
_secret_file = DATA_DIR / ".secret_key"
if _secret_file.exists():
    _secret_key = _secret_file.read_text().strip()
else:
    _secret_key = _secrets.token_hex(32)
    _secret_file.write_text(_secret_key)

# ── Env vars (before any app import reads them) ───────────────────────────────
os.environ.setdefault("DATABASE_URL",       f"sqlite+aiosqlite:///{DATA_DIR / 'caulky.db'}")
os.environ.setdefault("CAULKY_DATA_DIR",    str(DATA_DIR))
os.environ.setdefault("CAULKY_UPLOADS_DIR", str(UPLOADS_DIR))
os.environ.setdefault("SECRET_KEY",         _secret_key)
os.environ.setdefault("CORS_ORIGINS",       "http://localhost:7842")
os.environ.setdefault("COOKIE_SECURE",      "false")

# ── App import (after env setup) ──────────────────────────────────────────────
from app.main import app          # noqa: E402  (env must be set first)
from app.database import engine, Base  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
import uvicorn  # noqa: E402

PORT = 7842

# ── Static files location ─────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    # PyInstaller bundle: static files are in sys._MEIPASS/static
    STATIC_DIR = Path(sys._MEIPASS) / "static"  # type: ignore[attr-defined]
else:
    # Running from source for local testing
    STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"

# ── Serve React SPA (catch-all, registered after all /api routes) ─────────────
if STATIC_DIR.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        target = STATIC_DIR / full_path
        if target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(STATIC_DIR / "index.html"))

# ── DB init ───────────────────────────────────────────────────────────────────
async def _init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(_init_db())

    def _open_browser():
        import time
        time.sleep(2)
        webbrowser.open(f"http://localhost:{PORT}")

    threading.Thread(target=_open_browser, daemon=True).start()

    print(f"\n  Caulky corriendo en http://localhost:{PORT}")
    print(f"  Datos guardados en: {DATA_DIR}")
    print("  Pulsa Ctrl+C para salir.\n")

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
