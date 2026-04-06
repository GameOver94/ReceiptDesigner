"""
routes/auth.py — Authentication endpoints.

Auth model:
  - A single API token is stored in config.toml (or RD_API_TOKEN env var).
  - POST /api/v1/auth/login validates the token and sets a long-lived HttpOnly
    SameSite=Strict cookie ("rd_session") containing a simple HMAC-signed value.
  - POST /api/v1/auth/logout clears the cookie.
  - All other /api/v1/* routes depend on `require_auth` which validates the cookie.

Cookie content: a HMAC-SHA256 signature over a fixed payload using the API token
as the key. This avoids storing server-side session state while still being
unforgeable without knowledge of the token.

Cookie flags:
  - HttpOnly:  JS cannot read it, prevents XSS token theft.
  - SameSite=Strict: prevents CSRF.
  - Secure flag: set only when the app is served over HTTPS (detected via request).
"""

from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel

from server.app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "rd_session"
_SIGNED_VALUE = "authenticated"  # the payload we sign


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_signature(token: str) -> str:
    """Return a hex HMAC-SHA256 signature of _SIGNED_VALUE keyed with token."""
    return hmac.new(token.encode(), _SIGNED_VALUE.encode(), hashlib.sha256).hexdigest()


def _verify_cookie(cookie_value: str) -> bool:
    """Return True if cookie_value matches the expected signature."""
    if not settings.api_token:
        return False
    expected = _make_signature(settings.api_token)
    return hmac.compare_digest(cookie_value, expected)


def require_auth(rd_session: str = Cookie(default="")) -> None:
    """
    FastAPI dependency: raise 401 if the session cookie is missing or invalid.

    Usage:
        @router.get("/...", dependencies=[Depends(require_auth)])
    """
    if not _verify_cookie(rd_session):
        raise HTTPException(status_code=401, detail="Authentication required")


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    token: str


class LoginResponse(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/login", response_model=LoginResponse, summary="Log in with API token")
def login(body: LoginRequest, request: Request, response: Response) -> LoginResponse:
    """
    Validate the API token.  On success set an HttpOnly session cookie.
    On failure return 401.

    The server must have a non-empty api_token configured — if it is empty,
    all login attempts are rejected to prevent accidental open access.
    """
    if not settings.api_token:
        raise HTTPException(
            status_code=503,
            detail="Server is not configured with an API token. Set RD_API_TOKEN.",
        )

    if not hmac.compare_digest(body.token, settings.api_token):
        raise HTTPException(status_code=401, detail="Invalid token")

    signature = _make_signature(settings.api_token)

    # Only set Secure flag when the client connected via HTTPS.
    is_secure = request.url.scheme == "https"

    response.set_cookie(
        key=_COOKIE_NAME,
        value=signature,
        max_age=settings.cookie_max_age,
        httponly=True,
        samesite="strict",
        secure=is_secure,
        path="/",
    )
    return LoginResponse(status="ok")


@router.post("/logout", response_model=LoginResponse, summary="Log out")
def logout(response: Response) -> LoginResponse:
    """Clear the session cookie."""
    response.delete_cookie(key=_COOKIE_NAME, path="/")
    return LoginResponse(status="ok")
