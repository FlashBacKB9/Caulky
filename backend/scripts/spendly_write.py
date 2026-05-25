#!/usr/bin/env python3
"""Execute write SQL statements against the Spendly PostgreSQL database (AI only).

Requires AI_WRITE_ENABLED=true and AI_WRITE_PERMS/AI_USER_ID env vars
injected by the terminal router when permissions are granted.

Usage:
    spendly-write "INSERT INTO movements (name, dinero, date, user_id, paid, no_count) VALUES ('Pago', -50, CURRENT_DATE, '<uid>', true, false)"
    spendly-write "UPDATE movements SET name = 'Nuevo' WHERE id = 123 AND user_id = '<uid>'"
    spendly-write "DELETE FROM movements WHERE id = 123 AND user_id = '<uid>'"
"""
import sys
import os
import json
import psycopg2
import psycopg2.extras
from datetime import datetime

_WRITE_OPS = {'INSERT', 'UPDATE', 'DELETE'}
_OP_PERM   = {'INSERT': 'create', 'UPDATE': 'edit', 'DELETE': 'delete'}


def _get_allowed_ops() -> set[str]:
    if os.environ.get('AI_WRITE_ENABLED', '').lower() != 'true':
        return set()
    try:
        perms = json.loads(os.environ.get('AI_WRITE_PERMS', '{}'))
    except Exception:
        return set()
    return {op for op, perm in _OP_PERM.items() if perms.get(perm)}


def main():
    if len(sys.argv) < 2:
        print('Uso: spendly-write "INSERT|UPDATE|DELETE ..."', file=sys.stderr)
        sys.exit(1)

    query = ' '.join(sys.argv[1:]).strip()
    upper = query.upper().lstrip()

    op = next((o for o in _WRITE_OPS if upper.startswith(o)), None)
    if op is None:
        print('Error: solo se permiten INSERT, UPDATE o DELETE.', file=sys.stderr)
        sys.exit(1)

    allowed = _get_allowed_ops()
    if not allowed:
        print(
            'Error: escritura IA deshabilitada. Actívala en Configuración > Consultor IA.',
            file=sys.stderr,
        )
        sys.exit(1)

    op_labels = {'INSERT': 'Crear', 'UPDATE': 'Editar', 'DELETE': 'Borrar'}
    if op not in allowed:
        print(
            f"Error: la operación '{op_labels[op]}' no está habilitada en la configuración actual.",
            file=sys.stderr,
        )
        sys.exit(1)

    user_id = os.environ.get('AI_USER_ID', '')
    if not user_id:
        print('Error: AI_USER_ID no configurado.', file=sys.stderr)
        sys.exit(1)

    if user_id.lower() not in query.lower():
        print(
            f"Error de seguridad: la consulta debe incluir user_id = '{user_id}'.",
            file=sys.stderr,
        )
        sys.exit(1)

    db_url = os.environ.get('DATABASE_URL', '').replace('postgresql+asyncpg://', 'postgresql://')
    if not db_url:
        print('Error: DATABASE_URL no configurada.', file=sys.stderr)
        sys.exit(1)

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(query)
        affected = cur.rowcount

        cur.execute(
            """INSERT INTO audit_logs
                   (user_id, created_at, entity_type, entity_id, action, summary, source)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                user_id,
                datetime.utcnow(),
                'ai_query',
                None,
                op.lower(),
                f'[IA] {op} — {query[:300]}',
                'ai',
            ),
        )

        conn.commit()
        print(json.dumps({'ok': True, 'operation': op, 'affected_rows': affected}, indent=2))
        cur.close()
        conn.close()
    except psycopg2.Error as e:
        print(f'Error de base de datos: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
