# ReceiptDesigner — Copilot Instructions

ReceiptDesigner is a **Svelte 5 + FastAPI** web app for authoring, previewing, and printing
receipts using [ReceiptLine](https://github.com/receiptline/receiptline) markdown.

- **Demo mode** — static GitHub Pages site; `localStorage` storage; Web Serial / SVG+PNG export.
- **Production mode** — self-hosted FastAPI + SQLite; server forwards raw ESC/POS bytes over TCP or
  serial. The server is a **transparent binary proxy** — it never parses ReceiptLine or generates
  ESC/POS bytes. All receipt rendering and ESC/POS generation happens in the browser via Receipt.js.

Architecture reference: `docs/design.md`. Style reference: `docs/coding-style.md`.

---

## Project Layout

```
frontend/src/
  components/    # Svelte components (PascalCase.svelte)
  stores/        # Svelte stores (*Store.ts)
  adapters/      # types.ts, localStorageAdapter.ts, apiAdapter.ts
  lib/           # receiptjs.ts, variables.ts, printing.ts, csv.ts, codemirror/
  styles/        # global.css, tokens.css
  types/         # index.ts
server/app/
  routes/        # documents.py, printers.py
  services/      # printer_service.py
  db/            # models.py, database.py, migrations/
  schemas/       # document.py, printer.py
.github/
  workflows/     # ci.yml, deploy-pages.yml
  instructions/  # path-specific Copilot instructions
docs/            # design.md (architecture), coding-style.md (style rules)
```

Key config files: `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/eslint.config.js`,
`.prettierrc`, `server/pyproject.toml`.

---

## Build, Lint, Test Commands

All frontend commands run from `frontend/`. All backend commands run from `server/`.

### Frontend (pnpm — never npm or yarn)

```sh
pnpm install --frozen-lockfile   # always run before build/lint/test
pnpm lint                        # ESLint (flat config) + Prettier check
pnpm typecheck                   # tsc --noEmit
pnpm test --run                  # Vitest unit tests (CI mode)
pnpm build                       # production build → frontend/dist/
pnpm e2e                         # Playwright e2e (run pnpm build first)
```

### Backend (uv)

```sh
uv sync                              # install deps from pyproject.toml
uv run ruff check server/            # lint
uv run ruff format --check server/   # formatting check
uv run mypy server/                  # type check (--strict via pyproject.toml)
uv run pytest                        # all tests
uv run uvicorn server.app.main:app --reload  # dev server
```

---

## Non-Negotiable Rules

1. **No `any` in TypeScript.** Use `unknown` + type guards. `@ts-ignore` requires a comment.
2. **Svelte 5 runes only** — `$props()`, `$state()`, `$derived()`, `$effect()`. No legacy
   `export let`, `$:`, or `createEventDispatcher`.
3. **No enums** — use `const` objects with `as const`; derive the type with
   `typeof CONST[keyof typeof CONST]`.
4. **Sync SQLAlchemy only** — route handlers are `def`, not `async def`. No `await` in server code.
5. **Server never parses ReceiptLine** — ESC/POS generation is 100% browser-side via Receipt.js.
6. **All Receipt.js calls via `lib/receiptjs.ts`** — never call Receipt.js directly in a component.
7. **All print operations via `lib/printing.ts`** — never directly in a component or store.
8. **Preview debounce >= 300 ms** — never call `toSVG()` on every keystroke.
9. **Storage adapter accessed only through `adapterStore`** — never import an adapter directly.
10. **CSS tokens only** — `--rd-*` custom properties from `styles/tokens.css`. No hardcoded values,
    no `!important`.
11. **Conventional Commits** — `feat(scope): description`, `fix(scope): ...`, `chore(scope): ...`
12. **Never push to `main`** — all changes go through PRs.

---

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Svelte component | `PascalCase.svelte` | `Editor.svelte` |
| Store file | `camelCaseStore.ts` | `documentStore.ts` |
| Lib / utility (TS) | `camelCase.ts` | `variables.ts` |
| Test file | source name + `.test.ts` | `variables.test.ts` |
| E2E spec | `camelCase.spec.ts` | `editor.spec.ts` |
| Python module | `snake_case.py` | `printer_service.py` |
| Python class | `PascalCase` | `PrinterService` |

No abbreviations except well-known ones: `id`, `url`, `svg`, `png`, `cpl`.

---

## Placeholder Syntax

```
{{field_name}}                   scalar placeholder
{{date}} {{time}} {{datetime}}   auto-filled from system clock
{{#items}} … {{/items}}          line-item block
```

All resolution logic lives in `frontend/src/lib/variables.ts`. The server stores content as an
opaque string and never inspects placeholders.

---

## CI / Deployment

- **CI** (`ci.yml`): triggers on push to `main` and PRs to `main`. Runs frontend lint, typecheck,
  unit tests, and build. All checks must pass before merge.
- **GitHub Pages deploy** (`deploy-pages.yml`): triggers on `v*` tags; re-runs full CI then deploys
  `frontend/dist/` to GitHub Pages.
- Never merge a PR with failing CI. Never force-push to `main`.
