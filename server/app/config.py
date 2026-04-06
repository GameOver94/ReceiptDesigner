"""
config.py — Load server configuration from config.toml and environment variables.

Priority (highest wins):
  1. Environment variables (prefixed RD_)
  2. config.toml values
  3. Built-in defaults

The API token is sensitive — never log it. It is loaded at startup and held in memory.
"""

from __future__ import annotations

import os
import tomllib
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Config file location
# ---------------------------------------------------------------------------

# Default to a config.toml next to the server/ package root.
_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config.toml"
CONFIG_PATH = Path(os.environ.get("RD_CONFIG_PATH", str(_DEFAULT_CONFIG_PATH)))


def _load_toml() -> dict[str, Any]:
    """Load config.toml if it exists; return an empty dict otherwise."""
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("rb") as fh:
            return tomllib.load(fh)
    return {}


# ---------------------------------------------------------------------------
# Settings dataclass
# ---------------------------------------------------------------------------


class Settings:
    """
    Runtime configuration for the ReceiptDesigner server.

    All values can be overridden via environment variables:
        RD_API_TOKEN       — required in production mode
        RD_DB_PATH         — path to the SQLite database file
        RD_HOST            — bind address (default 127.0.0.1)
        RD_PORT            — bind port (default 8000)
        RD_COOKIE_MAX_AGE  — session cookie max-age in seconds (default 7776000 = 90 days)
        RD_DEBUG           — set to '1' to enable debug mode
    """

    def __init__(self) -> None:
        raw = _load_toml()
        server_section: dict[str, Any] = raw.get("server", {})

        # API token — required for authentication. Read from env first, then config.toml.
        # An empty string is treated as "not set" so the app boots in unconfigured state.
        self.api_token: str = os.environ.get(
            "RD_API_TOKEN", str(server_section.get("api_token", ""))
        )

        # SQLite database file path.
        default_db = str(Path(__file__).parent.parent / "data" / "receipt_designer.db")
        self.db_path: str = os.environ.get(
            "RD_DB_PATH", str(server_section.get("db_path", default_db))
        )

        # Server bind address — never expose 0.0.0.0 by default.
        self.host: str = os.environ.get("RD_HOST", str(server_section.get("host", "127.0.0.1")))

        self.port: int = int(os.environ.get("RD_PORT", int(server_section.get("port", 8000))))

        # Session cookie max-age: 90 days.
        self.cookie_max_age: int = int(
            os.environ.get(
                "RD_COOKIE_MAX_AGE", int(server_section.get("cookie_max_age", 7_776_000))
            )
        )

        self.debug: bool = os.environ.get("RD_DEBUG", "0") == "1"

        # Path to the built frontend dist/ directory.
        default_dist = str(Path(__file__).parent.parent.parent / "frontend" / "dist")
        self.frontend_dist: str = os.environ.get(
            "RD_FRONTEND_DIST", str(server_section.get("frontend_dist", default_dist))
        )


# Module-level singleton — loaded once at import time.
settings = Settings()
