#!/usr/bin/env python3
"""Execute read-only SQL queries against the Spendly PostgreSQL database.

Usage:
    spendly-query "SELECT name, dinero FROM movements WHERE user_id = '...' LIMIT 10"
"""
import sys
import os
import json
import psycopg2
import psycopg2.extras


def main():
    if len(sys.argv) < 2:
        print("Uso: spendly-query \"SELECT ...\"", file=sys.stderr)
        sys.exit(1)

    query = " ".join(sys.argv[1:]).strip()

    upper = query.upper().lstrip()
    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        print("Error: solo se permiten consultas SELECT o WITH (lectura).", file=sys.stderr)
        sys.exit(1)

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("Error: DATABASE_URL no configurada.", file=sys.stderr)
        sys.exit(1)

    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query)
        rows = cur.fetchall()
        result = [dict(row) for row in rows]
        print(json.dumps(result, indent=2, default=str))
        cur.close()
        conn.close()
    except psycopg2.Error as e:
        print(f"Error de base de datos: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
