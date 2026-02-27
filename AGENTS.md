# ReceiptDesigner — Agent Context

This file is read by OpenCode at the start of every session.

## What This Project Is

ReceiptDesigner is a Svelte 5 + FastAPI web app for authoring, previewing, and printing
receipts using [ReceiptLine](https://github.com/receiptline/receiptline) markdown.

- **Demo mode** — static GitHub Pages site; `localStorage` storage; Web Serial / export for printing.
- **Production mode** — self-hosted FastAPI server; SQLite; server-forwarded ESC/POS over TCP or serial.

The frontend is a Svelte 5 + Vite SPA. Receipt.js runs in the browser to render SVG previews and
generate ESC/POS bytes. The storage adapter (`LocalStorageAdapter` vs `ApiAdapter`) switches at
runtime via `window.__APP_CONFIG__.mode`. The server is a **transparent binary proxy** — it never
parses ReceiptLine or generates ESC/POS bytes.

## Canonical References (read before writing any code)

- `docs/design.md` — architecture, data models, API design, UI layout, milestones (source of truth)
- `docs/coding-style.md` — all style rules, naming conventions, testing conventions

## Specialized Agents

| Invoke | File | Scope |
|--------|------|-------|
| `@frontend`   | `.opencode/agents/frontend.md`    | `frontend/` |
| `@backend`    | `.opencode/agents/backend.md`     | `server/`   |
| `@devops`     | `.opencode/agents/devops.md`      | `.github/`, `Dockerfile`, `docker-compose.yml` |
| `@codereview` | `.opencode/agents/codereview.md`  | Read-only review of any files; no implementation |

## MCP Tools

- **`context7`** — up-to-date library docs (Svelte 5, CodeMirror 6, FastAPI, SQLAlchemy 2, Pydantic v2)
- **`gh_grep`** — real-world code examples (Receipt.js, CodeMirror extensions, etc.)

---

## Build / Lint / Test Commands

Frontend commands run from `frontend/`; backend commands run from `server/`.

### Frontend (pnpm)

```sh
pnpm install              # install deps — use pnpm, never npm or yarn
pnpm dev                  # Vite dev server
pnpm build                # production build → frontend/dist/
pnpm lint                 # ESLint (flat config) + Prettier check
pnpm typecheck            # tsc --noEmit
pnpm test --run           # Vitest unit tests, single run (CI mode)
pnpm test                 # Vitest unit tests, watch mode
pnpm test -- variables    # run single test file by name pattern
pnpm test -- -t "does X"  # run single test by description pattern
pnpm e2e                  # Playwright e2e (requires pnpm build first)
```

### Backend (uv)

```sh
uv sync                                    # install deps from pyproject.toml
uv run ruff check server/                  # lint
uv run ruff format --check server/         # formatting check
uv run ruff format server/                 # auto-format
uv run mypy server/                        # type check (--strict enforced via pyproject.toml)
uv run pytest                              # all tests
uv run pytest server/tests/test_docs.py    # single test file
uv run pytest -k "test_create_document"    # single test by name pattern
uv run uvicorn server.app.main:app --reload  # dev server
```

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend framework | Svelte 5 + Vite |
| Language (frontend) | TypeScript strict (`noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`) |
| Editor | CodeMirror 6 |
| Receipt rendering + ESC/POS | Receipt.js (browser only) |
| Frontend package manager | pnpm |
| Backend | Python 3.12+ / FastAPI |
| Database | SQLite via SQLAlchemy 2 (sync) |
| Validation | Pydantic v2 |
| Python package manager | uv |
| Python lint/format | ruff (`line-length=100`, `select=["E","F","I","UP","B","SIM","ANN"]`) |
| Python type checking | mypy `--strict` |
| Frontend testing | Vitest + `@testing-library/svelte` + Playwright |
| Python testing | pytest + `httpx.TestClient` (sync) |

---

## Non-Negotiable Rules

1. **No `any` in TypeScript.** Use `unknown` + type guards. `@ts-ignore` requires a comment.
2. **Svelte 5 runes only** — `$props()`, `$state()`, `$derived()`, `$effect()`. No legacy `export let`, `$:`, or `createEventDispatcher`.
3. **No enums** — use `const` objects with `as const`; derive the type with `typeof CONST[keyof typeof CONST]`.
4. **Sync SQLAlchemy only** — route handlers are `def`, not `async def`. No `await` anywhere in server code.
5. **Server never parses ReceiptLine** — ESC/POS generation is 100% browser-side via Receipt.js.
6. **All Receipt.js calls via `lib/receiptjs.ts`** — never call Receipt.js directly in a component.
7. **All print operations via `lib/printing.ts`** — never directly in a component or store.
8. **Preview debounce ≥ 300 ms** — never call `toSVG()` on every keystroke.
9. **Storage adapter accessed only through `adapterStore`** — never import an adapter directly.
10. **CSS tokens only** — `--rd-*` custom properties from `styles/tokens.css`. No hardcoded values, no `!important`.
11. **Conventional Commits** — `feat(scope): description`, `fix(scope): ...`, `chore(scope): ...`
12. **No force-push to `main`.**

---

## Code Style

### Prettier (`.prettierrc`)

`semi: true` · `singleQuote: true` · `printWidth: 100` · `tabWidth: 2` · `trailingComma: "all"` · `arrowParens: "always"`

### TypeScript / Svelte

- `interface` for data shapes (models, props, API responses); `type` for unions and intersections.
- Prefer `undefined` for optional fields; use `null` only for intentionally absent values or JSON interop.
- `as` type assertions are a last resort — write a named type guard function instead.
- All promises must be handled or returned (`@typescript-eslint/no-floating-promises` is an error).
- Circular imports are forbidden (`import/no-cycle` is an error).
- Always use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`).

**TypeScript import order** (groups separated by a blank line):
1. External packages (`svelte`, `codemirror`, …)
2. Internal absolute (`$lib/…`, `$store/…`, `../stores/…`)
3. Type-only imports (`import type`) at the end of their relevant group

**Path aliases** (prefer over `../../..` with >2 `../` segments):
```
$lib/   → frontend/src/lib/
$store/ → frontend/src/stores/
$types/ → frontend/src/types/
```

### Svelte Component File Order

```svelte
<script lang="ts">
  // 1. Imports (external → internal → import type)
  // 2. Props — $props() with inline type annotation
  // 3. Local state — $state()
  // 4. Derived values — $derived()   ← prefer over $effect for computed values
  // 5. Effects — $effect()           ← side effects only, not reactive state
  // 6. Event handlers — named functions prefixed handle<Event>
</script>
<!-- 7. Template -->
<style>/* 8. Scoped styles — kebab-case classes, --rd-* tokens only */</style>
```

- Component template > ~150 lines → split into sub-components.
- `<script>` logic > ~80 lines → extract a helper module to `lib/`.
- CSS Grid for 2D layout; Flexbox for 1D alignment; no absolute positioning for general layout.
- Class names in `<style>` blocks use `kebab-case`; never use `!important`.

### Svelte Store Pattern

```typescript
// Internal writables are prefixed _ and not exported.
// Export only { subscribe } + named action functions.
const _docs = writable<Document[]>([]);
export const documents = { subscribe: _docs.subscribe };
export async function loadDocuments(): Promise<void> { … }
// Stores call getAdapter() from adapterStore — never import adapters directly.
```

### Python

- All functions and methods must be fully type-annotated; `mypy --strict` must pass.
- `ruff` handles formatting and import order (isort-compatible `I` rules).
- **Python import order**: stdlib → third-party → local application (blank line between groups).
- Route handlers are thin wrappers — business logic lives in `server/app/services/`.
- Separate Pydantic models for input (`DocumentCreate`/`DocumentUpdate`) and output (`DocumentRead`).
  Response models use `model_config = ConfigDict(from_attributes=True)`.
- Never expose ORM objects directly to route handlers — convert via Pydantic (`model_validate`).
- All DB mutations committed explicitly — never rely on auto-commit.
- Alembic for all schema changes — never modify the DB schema manually.

### Error Handling

- **Frontend**: `try/catch` in all async event handlers and store actions. Show a toast or inline
  error message — never fail silently. Log with `if (import.meta.env.DEV) console.error(err)`.
- **Backend**: `HTTPException(404)` for not found, `HTTPException(503)` for printer unreachable.
  422 is handled automatically by FastAPI/Pydantic. A global middleware catches unexpected errors,
  logs the traceback server-side, and returns a generic 500 — no stack trace exposed to the client.

---

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Svelte component | `PascalCase.svelte` | `Editor.svelte` |
| Store file | `camelCaseStore.ts` | `documentStore.ts` |
| Lib / utility (TS) | `camelCase.ts` | `variables.ts` |
| CodeMirror extension | `camelCase.ts` | `receiptLineSyntax.ts` |
| Test file | source name + `.test.ts` | `variables.test.ts` |
| E2E spec | `camelCase.spec.ts` | `editor.spec.ts` |
| Python module | `snake_case.py` | `printer_service.py` |
| Python class | `PascalCase` | `PrinterService` |
| Python constant | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |

No abbreviations except well-known ones: `id`, `url`, `svg`, `png`, `cpl`.

---

## Testing Conventions

- **Vitest**: `describe` + `it('does X when Y')` format. Test behaviour, not implementation details.
  Unit test files live beside source files. `variables.ts` requires 100% branch coverage.
- **Playwright**: E2E specs in `frontend/e2e/`. Mock API calls with `page.route()` — no server needed.
- **pytest**: All tests synchronous — use `httpx.TestClient` (sync). DB tests use in-memory SQLite
  via a session-scoped fixture. Mock `socket`/`serial` with `unittest.mock.patch`.

---

## Placeholder Syntax

```
{{field_name}}                   scalar placeholder
{{date}} {{time}} {{datetime}}   auto-filled from system clock
{{#items}} … {{/items}}          line-item block
```

All resolution is in `frontend/src/lib/variables.ts`. The server stores content as an opaque string.

---

## Git Conventions

Branch names: `<type>/<short-description>` (lowercase, hyphens) — e.g. `feat/placeholder-csv-batch`.  
Commit scopes: `frontend`, `server`, `editor`, `placeholder`, `printer`, `ci`.  
One logical change per PR; all CI checks must pass before merge.

---

## Current Milestone

**Milestone 1 — Core Editor (Demo Mode)**: Svelte + Vite scaffold, CodeMirror 6 with ReceiptLine
syntax highlighting, Receipt.js SVG preview (300 ms debounce), printer settings panel, paper width
presets (58 mm / 80 mm / custom), SVG + PNG export, `LocalStorageAdapter`, GitHub Actions CI,
GitHub Pages deploy on `v*` tags.
