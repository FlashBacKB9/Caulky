import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DB_URL = "postgresql+asyncpg://postgres:spendly@localhost:5432/spendly"

async def main():
    engine = create_async_engine(DB_URL, echo=False)
    async with engine.connect() as conn:
        res = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        ))
        print("Tablas en DB:")
        for r in res.fetchall():
            print(f"  {r[0]}")

        res2 = await conn.execute(text("SELECT id, name, initial_balance FROM accounts ORDER BY id"))
        rows = res2.fetchall()
        print()
        print(f"Cuentas ({len(rows)}):")
        for r in rows:
            print(f"  {r[0]:>3} {str(r[1]):<25} balance_inicial={r[2]}")

        res3 = await conn.execute(text("SELECT COUNT(*) FROM movements"))
        print()
        print(f"Total movimientos: {res3.scalar()}")

        res4 = await conn.execute(text(
            "SELECT EXTRACT(year FROM date) as yr, COUNT(*) FROM movements GROUP BY yr ORDER BY yr"
        ))
        for row in res4.fetchall():
            print(f"  Año {int(row[0])}: {row[1]} movimientos")

    await engine.dispose()

asyncio.run(main())
