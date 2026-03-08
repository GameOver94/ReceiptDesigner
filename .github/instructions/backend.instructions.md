---
applyTo: "server/**"
---

# Backend Instructions (FastAPI + Python 3.12)

These instructions apply to all files under `server/`.

## Critical Rules

- Route handlers are **`def`**, not `async def`. No `await` anywhere in server code.
- **The server never parses ReceiptLine** and never generates ESC/POS bytes. It is a transparent
  binary proxy. ESC/POS generation is 100% browser-side via Receipt.js.
- All functions and methods must be fully type-annotated. `mypy --strict` must pass.
- `ruff` handles formatting and linting. Run `uv run ruff check server/` and
  `uv run ruff format server/` before committing.

## File Structure

```
server/app/
  main.py          # FastAPI app factory, middleware, router registration
  routes/          # Thin route handlers (documents.py, printers.py, auth.py)
  services/        # Business logic (printer_service.py, …)
  db/              # models.py (SQLAlchemy ORM), database.py (engine/session), migrations/
  schemas/         # Pydantic models (document.py, printer.py)
  config.py        # Config loading from config.toml + env vars
```

## Route Handler Pattern

Route handlers are thin wrappers — business logic lives in `services/`.

```python
@router.get("/{doc_id}", response_model=DocumentRead)
def get_document(doc_id: UUID, session: Session = Depends(get_session)) -> DocumentRead:
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentRead.model_validate(doc)
```

## Pydantic Models

- Separate models for input (`DocumentCreate`, `DocumentUpdate`) and output (`DocumentRead`).
- Response models use `model_config = ConfigDict(from_attributes=True)`.
- Never expose ORM objects directly to route handlers — always convert via `model_validate`.

```python
class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    content: str
    created_at: datetime
    updated_at: datetime
```

## SQLAlchemy (Sync Only)

- Use sync sessions via `Depends(get_session)`.
- All DB mutations must be committed explicitly — never rely on auto-commit.
- All schema changes go through Alembic migrations — never modify the DB schema manually.

## Error Handling

- `HTTPException(status_code=404)` for not found.
- `HTTPException(status_code=503)` for printer unreachable.
- 422 is handled automatically by FastAPI/Pydantic.
- A global middleware catches unexpected errors, logs the traceback server-side, and returns a
  generic 500 — no stack traces exposed to the client.

## Printer Forwarding

- TCP: `socket` stdlib (blocking with `settimeout(15.0)`). No subprocess.
- Serial/USB: `pyserial` (blocking). No subprocess.
- Wrap all I/O in `try/except OSError → HTTPException(503)`.
- Never log ESC/POS bytes.

## Python Import Order (ruff `I` rules)

1. stdlib
2. third-party (blank line)
3. local application (blank line)

## Testing (pytest — all synchronous)

- Use `httpx.TestClient` (sync). No `pytest-asyncio`.
- DB tests use in-memory SQLite via a session-scoped fixture.
- Mock `socket` / `serial` with `unittest.mock.patch`.
- Run: `uv run pytest` (all) or `uv run pytest -k "test_name"` (single).

## Security

- No committed secrets. Config tokens come from env vars only.
- Server binds `127.0.0.1` by default — never `0.0.0.0` without explicit config.
- Pydantic validates all input. Never trust raw request bodies.
