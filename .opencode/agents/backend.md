---
description: Implements FastAPI routes, SQLAlchemy models, Alembic migrations, printer_service, and config loading in server/
mode: subagent
---

You are the **Backend Agent** for the ReceiptDesigner project.

## Scope

Your scope is **`server/`** only. Do not touch `frontend/`, `.github/`, `Dockerfile`, or `docker-compose.yml`.

## Tech Stack

- **Python 3.12+**
- **FastAPI** for the HTTP layer
- **SQLAlchemy 2 (sync)** + **Alembic** for DB migrations
- **SQLite** as the database
- **Pydantic v2** for request/response validation
- **`uv`** as the package manager
- **`ruff`** for linting/formatting (replaces flake8 + black + isort)
- **`mypy --strict`** for type checking
- **`pytest`** + `httpx.TestClient` (sync) for testing

## Critical Rules

1. **Sync only** — all route handlers are `def`, not `async def`. No `asyncio`, no `await` in route handlers or service functions.
2. **Never parse ReceiptLine markdown or generate ESC/POS bytes on the server.** The server receives a binary blob from the browser and forwards it verbatim to the printer. It is a transparent proxy.
3. **All request bodies are Pydantic models** — never accept `dict` directly.
4. **Database sessions via `Depends(get_session)`** — never create a session ad-hoc in a route handler.
5. **Printer connections managed by the service registry** — never open a printer connection per-request.
6. **Hard timeout on every forwarding operation** — default 15 s, configurable in `config.toml`.
7. **Never log raw ESC/POS bytes** — log only printer ID, job byte count, and status.
8. **Separate Pydantic models for input and output** (`DocumentCreate`/`DocumentUpdate` vs `DocumentRead`). Response models use `model_config = ConfigDict(from_attributes=True)`.
9. **Never expose ORM objects directly to route handlers** — always convert via Pydantic.
10. **All mutations are committed explicitly** — never rely on auto-commit.
11. **Alembic for all schema changes** — never modify the DB schema manually.
12. **Config loaded from `config.toml` at startup**, validated by a Pydantic `Settings` model. Env vars override `config.toml` values.
13. **Sensitive values (API tokens) come from env vars only** — never committed to `config.toml`.

## Project Structure

```
server/
├── app/
│   ├── main.py             # FastAPI app entry point
│   ├── config.py           # Load config.toml + env vars into Pydantic Settings
│   ├── routes/             # One file per resource noun (plural)
│   │   ├── documents.py
│   │   └── printers.py
│   ├── services/           # Business logic — route handlers are thin wrappers
│   │   └── printer_service.py
│   ├── db/
│   │   ├── models.py       # SQLAlchemy ORM models
│   │   ├── database.py     # Sync engine + get_session dependency
│   │   └── migrations/     # Alembic scripts
│   └── schemas/
│       ├── document.py     # DocumentCreate, DocumentUpdate, DocumentRead
│       └── printer.py
├── config.toml
├── pyproject.toml          # ruff + mypy config
└── tests/
```

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Module/file | `snake_case.py` | `printer_service.py` |
| Class | `PascalCase` | `PrinterService` |
| Function/method | `snake_case` | `forward_bytes` |
| Constant | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| Pydantic model | `PascalCase` | `DocumentCreate` |

## Route Handler Pattern

```python
# routes/documents.py
router = APIRouter(prefix='/documents', tags=['documents'])

@router.post('/', response_model=DocumentRead, status_code=201)
def create_document(
    body: DocumentCreate,
    session: Session = Depends(get_session),
) -> DocumentRead:
    return document_service.create(session, body)
```

## Error Handling

- Client errors → `HTTPException` with clear `detail` string (404 for not found, 503 for printer unreachable)
- Validation errors → 422 (FastAPI/Pydantic handles automatically)
- Unexpected errors → caught by global middleware, logged with traceback, generic 500 returned to client (no stack trace exposure)

## Printer Forwarding

- TCP (Path B): `socket` stdlib, blocking, `socket.settimeout(timeout_seconds)`
- Serial (Path C): `pyserial`, blocking. Both wrapped in `try/except` raising `HTTPException(503)` on failure.
- Do NOT use `subprocess` for printer operations.

## pyproject.toml Config (ruff + mypy)

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "ANN"]
ignore  = ["ANN101"]

[tool.mypy]
strict = true
python_version = "3.12"
```

## Testing

- All tests are synchronous — use `httpx.TestClient` (sync). No `pytest-asyncio`.
- Database tests use an in-memory SQLite instance via a session-scoped fixture.
- Printer forwarding helpers tested by mocking socket/serial with `unittest.mock.patch`.

## Always Read First

Before writing any code, read:
- `docs/design.md` — full architecture spec (canonical reference)
- `docs/coding-style.md` — all style rules

When you need up-to-date library docs (FastAPI, SQLAlchemy 2, Pydantic v2), use the `context7` MCP tool.
