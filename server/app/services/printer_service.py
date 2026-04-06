"""
printer_service.py — Transparent ESC/POS forwarding proxy.

The server NEVER generates or parses ESC/POS bytes. It receives a binary blob
from the browser and forwards it verbatim to the configured printer connection.

This module is a stub for Milestone 3 — actual TCP/serial forwarding is
implemented in Milestone 4. The API surface is defined here so the rest of
the codebase compiles and mypy is happy.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class PrinterService:
    """
    Registry of printer connections loaded from config.toml.

    In Milestone 3 this is a no-op stub.  Milestone 4 will fill in:
      - TCP socket forwarding (Path B)
      - pyserial forwarding (Path C)
    """

    def list_printers(self) -> list[dict[str, Any]]:
        """Return the list of configured printer summaries."""
        return []

    def forward(self, printer_id: str, data: bytes) -> dict[str, Any]:
        """
        Forward raw ESC/POS bytes to a printer.

        Raises:
            KeyError: if printer_id is not in the registry.
        """
        logger.info("PrinterService.forward printer=%s bytes=%d", printer_id, len(data))
        raise KeyError(f"Printer not found: {printer_id}")


# Module-level singleton.
printer_service = PrinterService()
