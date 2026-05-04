from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from alembic.config import Config
from alembic import command
from app.routers import income_expense_groups, movement_types, movements, stats, files, accounts, import_excel, backup, investments, admin
from app.auth.setup import fastapi_users, auth_backend
from app.auth.schemas import UserRead, UserCreate, UserUpdate
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    yield


app = FastAPI(title="Caulky API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth routes ────────────────────────────────────────────────────────────────
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)

# ── Data routes ────────────────────────────────────────────────────────────────
app.include_router(income_expense_groups.router, prefix="/api")
app.include_router(movement_types.router, prefix="/api")
app.include_router(movements.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(import_excel.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(investments.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
