"""Límite de intentos en el login y el registro, y la IP del cliente para el historial.

Por IP: tras 5 logins fallidos en un minuto se responde 429 hasta que pase el minuto; el
registro admite 5 intentos cada 10 minutos. Se cuenta en memoria: con un solo proceso de
uvicorn basta, y un reinicio solo pone los contadores a cero.
"""
import time
from collections import defaultdict, deque
from contextvars import ContextVar

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

client_ip: ContextVar[str] = ContextVar("client_ip", default="?")

LOGIN_PATH = "/api/auth/login"
REGISTER_PATH = "/api/auth/register"
# ruta → (intentos permitidos, ventana en segundos, contar solo los fallidos)
LIMITS = {
    LOGIN_PATH: (5, 60, True),
    REGISTER_PATH: (5, 600, False),
}


def request_ip(request: Request) -> str:
    # nginx sobrescribe X-Real-IP con la IP real; X-Forwarded-For lo puede rellenar el cliente
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "?")


class LoginGuardMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def _recent(self, key: tuple[str, str], window: int, now: float) -> deque[float]:
        q = self.hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        return q

    async def dispatch(self, request: Request, call_next):
        ip = request_ip(request)
        client_ip.set(ip)
        limit = LIMITS.get(request.url.path) if request.method == "POST" else None
        if limit is None:
            return await call_next(request)

        max_hits, window, failures_only = limit
        key, now = (request.url.path, ip), time.monotonic()
        q = self._recent(key, window, now)
        if len(q) >= max_hits:
            retry = int(q[0] + window - now) + 1
            return JSONResponse({"detail": "Demasiados intentos. Prueba de nuevo en un rato."},
                                status_code=429, headers={"Retry-After": str(retry)})

        response = await call_next(request)
        if not failures_only or response.status_code >= 400:
            q.append(now)
        elif failures_only:
            q.clear()   # login correcto: se perdonan los fallos anteriores
        if not q:
            self.hits.pop(key, None)
        return response
