# ReceiptDesigner — Coding and Style Guidelines

**Version:** 0.4
**Date:** 2026-02-25
**Applies to:** `frontend/` (TypeScript / Svelte), `server/` (Python)

These guidelines are the single source of truth for code style, structure, and conventions.
All contributors and AI coding agents must follow them. When a guideline conflicts with a
library's own recommendations, these guidelines take precedence unless a documented exception
is noted.

---

## 1. General Principles

1. **Simple over clever.** This is a hobby project written to learn. Prefer the solution a
   reader unfamiliar with the codebase can understand in 30 seconds.
2. **Explicit over implicit.** Name things clearly. Avoid magic — if something non-obvious is
   happening, add a comment explaining why.
3. **One responsibility per unit.** Each function, module, and component does one thing.
4. **No premature abstraction.** Don't create a utility function, base class, or shared module
   until the pattern appears at least twice in the codebase.
5. **Consistency beats personal preference.** Follow these rules even when you disagree — open
   a discussion to change the rules instead.

---

## 2. Frontend — TypeScript and Svelte

### 2.1 Language Rules

- All source files are `.ts` or `.svelte`. No plain `.js` files inside `frontend/src/`.
- TypeScript is set to `strict: true` in `tsconfig.json`. This means:
  - `noImplicitAny: true`
  - `strictNullChecks: true`
  - `noUncheckedIndexedAccess: true`
- The type `any` is **banned**. Use `unknown` and narrow it with a type guard.
- `as` type assertions are a last resort. Prefer type guard functions.
- `@ts-ignore` requires a comment explaining why it is necessary.

### 2.2 ESLint

Config file: `eslint.config.js` (flat config).

Key rules:
- `@typescript-eslint/no-explicit-any` — error.
- `@typescript-eslint/consistent-type-imports` — always use `import type` for type-only imports.
- `@typescript-eslint/no-floating-promises` — error; all promises must be handled or returned.
- `import/no-cycle` — error; circular imports are forbidden.
- `svelte/valid-compile` — error.

### 2.3 Prettier

Config file: `.prettierrc` at root.

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "all",
  "arrowParens": "always",
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    { "files": "*.svelte", "options": { "parser": "svelte" } }
  ]
}
```

Never manually reformat code in a PR that also contains logic changes — format in a separate
commit.

---

## 3. Svelte Component Rules

### 3.1 File Structure

Every `.svelte` file follows this section order:

```svelte
<script lang="ts">
  // 1. Imports — external, then internal, then types
  import { onMount } from 'svelte';
  import { documentStore } from '../stores/documentStore';
  import type { Document } from '../types';

  // 2. Props (Svelte 5 runes syntax)
  let { document, onSave }: { document: Document; onSave: (d: Document) => void } = $props();

  // 3. Local reactive state
  let isDirty = $state(false);

  // 4. Derived values
  let title = $derived(document.name ?? 'Untitled');

  // 5. Effects
  $effect(() => {
    // runs when dependencies change
  });

  // 6. Event handlers (named functions, not inline arrows for non-trivial logic)
  function handleSave() {
    onSave(document);
    isDirty = false;
  }
</script>

<!-- 7. Template -->
<div class="container">
  <h1>{title}</h1>
  <button onclick={handleSave}>Save</button>
</div>

<!-- 8. Scoped styles -->
<style>
  .container {
    padding: var(--rd-space-4);
  }
</style>
```

### 3.2 Props

- Use Svelte 5 runes (`$props()`, `$state()`, `$derived()`, `$effect()`).
- Destructure props immediately in the `$props()` call with an inline type annotation.
- Boolean props use positive naming: `isLoading`, not `notLoading` or `disabled` (prefer
  `isDisabled` if it needs to be a prop rather than an HTML attribute).
- Callback props are prefixed `on`: `onChange`, `onSave`, `onDelete`.

### 3.3 Event Handlers

Name them `handle<Event>`. Avoid inline arrow functions for anything beyond one expression:

```svelte
<!-- Bad -->
<button onclick={() => { validate(); save(); setDirty(false); }}>Save</button>

<!-- Good -->
<button onclick={handleSave}>Save</button>
```

### 3.4 Component Size

- If a component template exceeds ~150 lines, split it into smaller components.
- If `<script>` exceeds ~80 lines of logic, extract a helper module in `lib/`.

### 3.5 Reactivity

- Prefer `$derived` over `$effect` for computed values.
- `$effect` is for side effects (DOM manipulation, calling external APIs). It must not return
  reactive state — use `$derived` for that.
- Never call Receipt.js directly from a component. Use `lib/receiptjs.ts`.

---

## 4. Svelte Stores

### 4.1 Store Structure

Each store file exports one or more Svelte `writable` / `derived` / `readable` stores plus
any actions that mutate them.

```typescript
// stores/documentStore.ts
import { writable, derived } from 'svelte/store';
import type { Document } from '../types';
import { getAdapter } from './adapterStore';

const _documents = writable<Document[]>([]);
const _currentId = writable<string | null>(null);

export const documents = { subscribe: _documents.subscribe };

export const currentDocument = derived(
  [_documents, _currentId],
  ([$docs, $id]) => $docs.find((d) => d.id === $id) ?? null,
);

export const templates = derived(_documents, ($docs) =>
  $docs.filter((d) => d.isTemplate),
);

export async function loadDocuments(): Promise<void> {
  const adapter = getAdapter();
  const docs = await adapter.listDocuments();
  _documents.set(docs);
}
```

### 4.2 Rules

- Stores do not import adapters directly — they call `getAdapter()` from `adapterStore`.
- Components subscribe to stores with the `$` prefix syntax in templates (`$documents`).
- Do not put UI state (dialog open/closed, hover, focus) into a global store — keep it in
  the component with `$state`.

---

## 5. Styling

### 5.1 CSS Custom Properties (Design Tokens)

All tokens are defined in `frontend/src/styles/tokens.css`. Components consume them
with `var()`.

Naming convention: `--rd-<category>-<name>[-variant]`

```css
:root {
  /* Colour */
  --rd-color-bg-primary:    #ffffff;
  --rd-color-bg-secondary:  #f5f5f5;
  --rd-color-text-primary:  #1a1a1a;
  --rd-color-text-secondary:#666666;
  --rd-color-accent:        #2563eb;
  --rd-color-border:        #e2e8f0;
  --rd-color-placeholder:   #f59e0b;  /* highlight colour for {{...}} */

  /* Typography */
  --rd-font-mono:   'JetBrains Mono', 'Fira Code', monospace;
  --rd-font-ui:     system-ui, sans-serif;
  --rd-font-sm:     0.75rem;
  --rd-font-base:   0.875rem;
  --rd-font-lg:     1rem;

  /* Spacing (multiples of 4 px) */
  --rd-space-1: 4px;
  --rd-space-2: 8px;
  --rd-space-3: 12px;
  --rd-space-4: 16px;
  --rd-space-6: 24px;
  --rd-space-8: 32px;

  /* Radius */
  --rd-radius-sm: 4px;
  --rd-radius-md: 8px;

  /* Shadow */
  --rd-shadow-sm: 0 1px 2px rgba(0,0,0,0.08);
}
```

### 5.2 Scoped Component Styles

- Styles live in the `<style>` block of the `.svelte` file — no separate `.css` file per component.
- Class names use `kebab-case` inside component `<style>` blocks (Svelte convention).
- Do not hardcode colours, spacing, or font sizes — always use tokens.
- Do not use `!important`.
- No global selectors inside a component `<style>` block except `:global()` for third-party
  library overrides.

### 5.3 Layout

- Use CSS Grid for two-dimensional layout (the main editor / preview split pane).
- Use Flexbox for one-dimensional alignment within components.
- Do not use absolute positioning for general layout — reserve it for overlays and tooltips.

---

## 6. TypeScript Conventions (Frontend)

### 6.1 Types vs. Interfaces

- `interface` for object shapes that describe data models, props, and API responses.
- `type` for unions, intersections, and derived types.

```typescript
// Interface: data shape
interface Document {
  id: string;
  name: string;
}

// Type: union
type PrinterCommand = 'escpos' | 'epson' | 'sii' | 'citizen' | 'generic' | 'star';
```

### 6.2 Null vs. Undefined

- Prefer `undefined` for optional fields in TypeScript interfaces.
- Use `null` only when a value can be intentionally absent (e.g. `currentDocument` when none
  is selected) or when interacting with JSON that uses `null`.

### 6.3 No Enums

Use `const` objects with `as const` instead:

```typescript
// Bad
enum Mode { Demo = 'demo', Production = 'production' }

// Good
const MODES = { Demo: 'demo', Production: 'production' } as const;
type Mode = typeof MODES[keyof typeof MODES];
```

### 6.4 Type Guards

Prefer type guard functions over `as` assertions:

```typescript
function isDocument(value: unknown): value is Document {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string'
  );
}
```

---

## 7. File and Folder Naming (Frontend)

| Item | Convention | Example |
|------|------------|---------|
| Svelte component | `PascalCase.svelte` | `Editor.svelte` |
| Store file | `camelCase.ts`, suffix `Store` | `documentStore.ts` |
| Lib / utility | `camelCase.ts` | `variables.ts` |
| Type file | `camelCase.ts` | `index.ts` |
| CodeMirror extension | `camelCase.ts` | `receiptLineSyntax.ts` |
| Test file | same name + `.test.ts` | `variables.test.ts` |
| E2E spec | `camelCase.spec.ts` | `editor.spec.ts` |

No abbreviations except well-known ones: `id`, `url`, `svg`, `png`, `cpl`.

---

## 8. Python (Backend)

### 8.1 Language Version and Style

- Python 3.12+.
- All files use type annotations. Run `mypy --strict` as part of CI.
- `ruff` handles linting and formatting (replaces flake8 + black + isort).
  Config in `pyproject.toml`:

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM", "ANN"]
ignore  = ["ANN101"]  # no annotation for `self`

[tool.mypy]
strict = true
python_version = "3.12"
```

### 8.2 File and Folder Naming

| Item | Convention | Example |
|------|------------|---------|
| Module / file | `snake_case.py` | `printer_service.py` |
| Class | `PascalCase` | `PrinterService` |
| Function / method | `snake_case` | `resolve_placeholders` |
| Constant | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| Pydantic model | `PascalCase` | `DocumentCreate` |

### 8.3 FastAPI Route Handlers

- Route files live in `server/app/routes/`. One file per resource noun (plural).
- Each route file creates an `APIRouter` and the main `app` includes it.
- Route handler functions are `async def`. They do I/O; they do not contain business logic.
- Business logic lives in `server/app/services/`.
- Request bodies are Pydantic models. Never accept `dict` directly.

```python
# routes/documents.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_session
from ..services import document_service
from ..schemas.document import DocumentCreate, DocumentRead

router = APIRouter(prefix='/documents', tags=['documents'])


@router.post('/', response_model=DocumentRead, status_code=201)
def create_document(
    body: DocumentCreate,
    session: Session = Depends(get_session),
) -> DocumentRead:
    return document_service.create(session, body)
```

### 8.4 Pydantic Models

- Separate Pydantic models for request input (`DocumentCreate`, `DocumentUpdate`) and response
  output (`DocumentRead`).
- Use `model_config = ConfigDict(from_attributes=True)` on response models so they can be
  built from SQLAlchemy ORM objects.
- Never expose ORM model objects directly to route handlers.

### 8.5 SQLAlchemy / Database

- Use the synchronous SQLAlchemy session injected via `Depends(get_session)`.
- This is intentional: the app is single-user and SQLite has no concurrency problem that
  async DB access would solve. The sync API is simpler and easier to read.
- All mutations (INSERT, UPDATE, DELETE) are committed explicitly — never rely on auto-commit.
- Complex queries are named methods on a service module, not inline in route handlers.
- Alembic handles all schema migrations. Never modify the database schema manually.

```python
# Correct — sync session, no await needed
def get_document(doc_id: str, session: Session = Depends(get_session)) -> DocumentRead:
    doc = session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return DocumentRead.model_validate(doc)
```

### 8.6 Error Handling

- Raise `HTTPException` for client errors (4xx) with a clear `detail` string.
- Unexpected server errors are caught by a global exception handler middleware that logs the
  traceback and returns a generic 500 response. Stack traces are never exposed to the client.

```python
# Good
if document is None:
    raise HTTPException(status_code=404, detail=f'Document {doc_id} not found')
```

### 8.7 Async and I/O

- FastAPI supports both sync and async route handlers. Use **sync** `def` for all routes —
  database operations are fast SQLite calls and printer forwarding is a short blocking write.
- There is no `async def` route in this codebase. ESC/POS command generation happens entirely
  in the browser; the server only receives a finished binary blob and forwards it.
- TCP forwarding uses the standard-library `socket` module (blocking, with `socket.settimeout`).
- Serial forwarding uses `pyserial` (blocking). Both are wrapped in a try/except that raises
  `HTTPException(503)` on failure.
- Do **not** use `asyncio.create_subprocess_exec` or any subprocess for printer operations.

### 8.8 Configuration

- All configuration is loaded from `config.toml` at startup and validated by a Pydantic
  `Settings` model.
- Environment variables override `config.toml` values (12-factor style).
- Sensitive values (future: API tokens) must come from environment variables, never from
  `config.toml` committed to version control.

---

## 9. Shared Conventions (Both Languages)

### 9.1 Placeholder Logic is Frontend-Only

All placeholder resolution lives in `frontend/src/lib/variables.ts`. There is no server-side
counterpart. The server never parses or evaluates ReceiptLine markdown or placeholder
syntax — it only stores and retrieves document text as an opaque string.

If the placeholder rules change, update `variables.ts` and its unit tests. No Python code
needs to change.

### 9.2 Date/Time Handling

- All dates and times passed between frontend and server use ISO 8601 format:
  `YYYY-MM-DDTHH:MM:SSZ` (UTC).
- The frontend formats dates for display using the browser's `Intl.DateTimeFormat` API.
- The server stores and returns UTC timestamps. Time zone conversion is the client's
  responsibility.

### 9.3 IDs

- All entity IDs are UUID4 strings.
- The frontend generates IDs for `LocalStorageAdapter` using `crypto.randomUUID()`.
- The server generates IDs for database-backed storage using Python's `uuid.uuid4()`.

---

## 10. Error Handling

### 10.1 Frontend

- Use `try`/`catch` in event handlers and store actions that call async operations.
- Show user-facing errors in a toast notification or inline error element — never silent.
- In development builds (`import.meta.env.DEV`), log errors to the console for debugging.
  In production builds, swallow the console output but still show the user-facing message.

```typescript
async function handlePrint() {
  try {
    await print(currentDocument);
  } catch (err) {
    showToast({ type: 'error', message: 'Print failed. Check printer status.' });
    if (import.meta.env.DEV) console.error(err);
  }
}
```

### 10.2 Backend

- Validation errors → 422 (FastAPI handles Pydantic validation automatically).
- Not found → 404 with `HTTPException`.
- Printer unreachable → 503 with a `detail` describing which printer.
- Unexpected → 500, logged server-side with traceback, generic message to client.

---

## 11. Imports

### 11.1 TypeScript Import Order

Groups separated by a blank line:

1. External packages: `svelte`, `codemirror`, etc.
2. Internal absolute (path alias): `$lib/...`, `../stores/...`
3. Type-only imports (`import type`): at the end of the relevant group

### 11.2 Python Import Order

Managed by `ruff`'s isort-compatible sorter (`I` rules). Order:

1. Standard library
2. Third-party packages
3. Local application modules

### 11.3 Path Aliases (Frontend)

Vite and tsconfig aliases:

```
$lib/   → frontend/src/lib/
$store/ → frontend/src/stores/
$types/ → frontend/src/types/
```

Prefer aliases over relative paths with more than two `../` segments.

---

## 12. Testing

### 12.1 Frontend (Vitest + Testing Library)

- Unit tests live next to source files: `variables.ts` → `variables.test.ts`.
- Component tests use `@testing-library/svelte`. Test behaviour (what the user sees and does),
  not implementation details.
- Use `describe` to group; `it('does X when Y')` for individual cases.
- The placeholder resolution module (`variables.ts`) requires 100% branch coverage — it is
  critical business logic.

### 12.2 Backend (pytest)

- Tests live in `server/tests/`.
- All tests are synchronous — use `httpx.TestClient` (synchronous) with the FastAPI app.
  No `pytest-asyncio`, no async boilerplate. There are no `async def` routes to test.
- Database tests use an in-memory SQLite instance via a session-scoped fixture.
- The printer forwarding helpers (`tcp_print`, `serial_print`) are tested by mocking the
  socket/serial layer with `unittest.mock.patch`.

### 12.3 Frontend Fixture Files

`frontend/src/lib/__tests__/fixtures/` contains `.json` files with input/expected-output
pairs used by the `variables.test.ts` suite. Keeping test cases in data files makes it easy
to add new edge cases without touching test logic.

### 12.4 E2E (Playwright)

- E2E tests live in `frontend/e2e/`.
- Mock API calls with `page.route()` — tests must not require a running server.
- One spec file per user-visible scenario.

---

## 13. Git and Commit Conventions

### 13.1 Branch Naming

`<type>/<short-description>` — lowercase, hyphens only.

- `feat/placeholder-csv-batch`
- `fix/preview-debounce`
- `chore/upgrade-receiptjs`
- `docs/update-design`

### 13.2 Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description in present tense>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`.  
Scope: `frontend`, `server`, `editor`, `placeholder`, `printer`, `ci`.

Examples:
```
feat(editor): add placeholder tag highlighting in CodeMirror
fix(printer): handle TCP connection timeout correctly
feat(placeholder): implement CSV line-item batch resolution
chore(deps): update receipt.js to 5.0.0
```

### 13.3 Pull Requests

- One logical change per PR.
- PR title follows Conventional Commits format.
- All CI checks must pass before merge.
- No force-push to `main`.

---

## 14. Security

- Never commit secrets, credentials, or `.env` files with real values.
  Add `.env*` and `config.local.toml` to `.gitignore`.
- The server validates all input with Pydantic before processing.
- ESC/POS byte streams arrive from the browser as opaque binary blobs — never log or
  display them. The server forwards them without inspection.
- The server binds to `127.0.0.1` by default. Expose it via a reverse proxy in production.

---

## 15. Accessibility

- All interactive elements must be keyboard accessible.
- Use semantic HTML: `<button>`, `<dialog>`, `<nav>`, `<main>`, `<aside>`.
- Every icon-only button must have an `aria-label`.
- When a dialog opens, focus moves into it. When it closes, focus returns to the trigger.
- Colour contrast must meet WCAG 2.1 AA minimum.

---

## 16. Documentation

- All exported functions and types in `frontend/src/lib/` and `server/app/` must have brief
  docstrings / JSDoc comments.
- Comment the *why*, not the *what*:

```typescript
// Bad: restates the code
// Set isDirty to true
isDirty = true;

// Good: explains intent
// Mark dirty so the auto-save effect fires on the next 1-second tick
isDirty = true;
```

- Design-level documentation belongs in `docs/`. Code-level documentation belongs in docstrings.

---

## 17. Educational Comments

This project is partly a learning exercise in web development. Code should include comments
that explain *web-specific* decisions and patterns that would not be obvious to someone with
embedded/systems programming experience but no web background.

### 17.1 What to Comment

Add a comment when the code uses a web or framework concept that is not self-evident from
the code itself. Target the gap between "knows programming" and "knows web dev".

**Comment these things:**

- **Why a Svelte rune is used instead of a plain variable** — e.g. why `$state()` is needed
  for reactivity when a `let` would look equivalent in plain TypeScript.
- **Why a store exists instead of passing props** — e.g. when state needs to be shared across
  components that are not in a direct parent/child relationship.
- **Why an effect is used** — `$effect` is a web-specific concept. Explain what it's watching
  and what side effect it triggers, and why that can't be a `$derived`.
- **Why an async function returns a Promise here** — especially in event handlers where the
  caller doesn't visibly await it.
- **Why a CSS layout choice was made** — e.g. why Grid is used instead of Flexbox for a
  particular container, or why `position: absolute` is acceptable in this one place.
- **Why an API call is debounced** — explain the user-experience reason (avoid hammering the
  render function on every keystroke) and the chosen delay.
- **Why a particular HTTP method or status code is used** — especially 201 vs 200, or 422
  vs 400, if it's not immediately obvious.
- **Why a Pydantic model is separate from the SQLAlchemy model** — explain the layering
  purpose (validation at the boundary, ORM internals stay internal).
- **Why `crypto.randomUUID()` is used on the frontend** — explain that IDs are generated
  client-side in demo mode because there is no server to assign them.

### 17.2 What Not to Comment

Do **not** add comments that explain things any programmer already knows:

- Basic control flow (`if`, `for`, `return`)
- Variable assignments that are self-explanatory
- What a standard-library function does (e.g. `// split the string on commas`)
- Type annotations (the type already says what it is)

### 17.3 Format

Keep educational comments short — one to three lines. If an explanation needs more than that,
add a link to the relevant section of `docs/design.md` instead.

```typescript
// $state() makes this variable reactive — Svelte tracks reads and writes to it
// and re-renders any part of the template that uses it. A plain `let` would not
// trigger updates.
let content = $state('');

// Debounce the preview render so we don't call receipt.js on every single keystroke.
// 300 ms is short enough to feel live but long enough to skip intermediate characters.
const renderPreview = debounce(_renderPreview, 300);
```

```python
# Pydantic model (DocumentRead) is separate from the SQLAlchemy model (Document).
# The SQLAlchemy model is the database row; the Pydantic model is what we expose
# over the API. Keeping them separate means internal schema changes don't
# accidentally leak to the client.
return DocumentRead.model_validate(doc)
```
