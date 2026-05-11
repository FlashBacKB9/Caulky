import os
import uuid

# Must be set before any app imports so settings picks up SQLite
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 – registers all models with Base.metadata
from app.models.user import User


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def user(db):
    u = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u
