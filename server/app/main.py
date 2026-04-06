"""
main.py — FastAPI application factory for ReceiptDesigner.

Responsibilities:
  - Register API routers (/api/v1/auth, /api/v1/documents, /api/v1/folders).
  - Global exception middleware: catches unhandled errors, logs the traceback,
    and returns a generic 500 (no stack trace exposed to the client).
  - In production: serve the built frontend (frontend/dist) via StaticFiles and
    inject window.__APP_CONFIG__ into index.html before serving it.
  - Create the SQLite schema on first startup (via SQLAlchemy Base.metadata.create_all).
"""

from __future__ import annotations

import logging
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server.app.config import settings
from server.app.db.database import Base, engine
from server.app.db.models import Document, Folder  # noqa: F401 – ensure models are registered
from server.app.routes import auth, documents, folders

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Create tables on startup (idempotent — safe to run on every boot)
# ---------------------------------------------------------------------------

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ReceiptDesigner API",
    version="0.3.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------------------
# Global error middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def global_error_middleware(request: Request, call_next: object) -> object:
    """
    Catch all unhandled exceptions, log the traceback server-side, and return
    a generic 500 to the client (no stack trace exposed).
    """
    from collections.abc import Awaitable, Callable

    handler: Callable[[Request], Awaitable[object]] = call_next  # type: ignore[assignment]
    try:
        return await handler(request)
    except Exception:
        logger.error("Unhandled exception\n%s", traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

app.include_router(auth.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(folders.router, prefix="/api/v1")

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health", tags=["meta"], summary="Health check")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Frontend static file serving
# ---------------------------------------------------------------------------
# The built frontend dist/ is served from the same process.
# index.html is served with window.__APP_CONFIG__ injected so the frontend
# knows it is in production mode and uses ApiAdapter.

_FRONTEND_DIST = Path(settings.frontend_dist)

_APP_CONFIG_SCRIPT = '<script>window.__APP_CONFIG__ = {"mode":"production"};</script>'
_APP_CONFIG_PLACEHOLDER = "<!--APP_CONFIG-->"


def _inject_app_config(html: str) -> str:
    """Replace the APP_CONFIG comment placeholder with the production config script."""
    if _APP_CONFIG_PLACEHOLDER in html:
        return html.replace(_APP_CONFIG_PLACEHOLDER, _APP_CONFIG_SCRIPT)
    # Fallback: inject just before </head>
    return html.replace("</head>", f"{_APP_CONFIG_SCRIPT}</head>", 1)


if _FRONTEND_DIST.is_dir():
    # Mount static assets (JS, CSS, images, etc.) — exclude index.html so we
    # can inject the config before serving it.
    app.mount(
        "/assets",
        StaticFiles(directory=str(_FRONTEND_DIST / "assets")),
        name="assets",
    )

    # Mount other static files (theme CSS, public/ files, etc.) that are not
    # under /assets.  html=False so the SPA fallback is handled by our route.
    _public_dirs = [d for d in _FRONTEND_DIST.iterdir() if d.is_dir() and d.name != "assets"]
    for _pub_dir in _public_dirs:
        app.mount(
            f"/{_pub_dir.name}",
            StaticFiles(directory=str(_pub_dir)),
            name=_pub_dir.name,
        )

    # Serve individual static files at the dist root (favicon, robots.txt, etc.)
    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> FileResponse:
        favicon_path = _FRONTEND_DIST / "favicon.ico"
        if favicon_path.exists():
            return FileResponse(str(favicon_path))
        return FileResponse(str(_FRONTEND_DIST / "favicon.svg"))

    # SPA fallback — serve index.html with injected config for all non-API routes.
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> HTMLResponse:
        index_path = _FRONTEND_DIST / "index.html"
        if not index_path.exists():
            return HTMLResponse("<h1>Frontend not built</h1>", status_code=503)
        html = index_path.read_text(encoding="utf-8")
        return HTMLResponse(_inject_app_config(html))
