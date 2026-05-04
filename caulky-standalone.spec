# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Caulky standalone build.
# Run from the repo root after building the frontend:
#   cd frontend && npm run build && cd ..
#   pip install pyinstaller -r backend/requirements-standalone.txt
#   pyinstaller caulky-standalone.spec

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [
    ("frontend/dist", "static"),       # React build
]

hiddenimports = [
    # uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    # DB
    "aiosqlite",
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
    # fastapi-users
    "fastapi_users.db.sqlalchemy",
    "fastapi_users.authentication.strategy.jwt",
    "fastapi_users.authentication.transport.cookie",
    # pydantic
    "pydantic.deprecated.class_validators",
    # misc
    "email_validator",
    "openpyxl",
    "multipart",
]

# Collect everything from fastapi_users and sqlalchemy to avoid missing submodules
for pkg in ("fastapi_users", "sqlalchemy", "pydantic_settings"):
    hiddenimports += collect_submodules(pkg)

a = Analysis(
    ["backend/standalone.py"],
    pathex=["backend"],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["asyncpg", "psycopg2", "alembic", "tkinter"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Caulky",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,       # Keep console so user can see the URL and Ctrl+C to quit
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
