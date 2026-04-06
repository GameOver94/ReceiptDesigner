---
applyTo: "frontend/**"
---

# Frontend Instructions (Svelte 5 + TypeScript)

These instructions apply to all files under `frontend/`.

## Svelte 5 Runes — Required Patterns

```svelte
<script lang="ts">
  // 1. Imports (external → internal → import type), blank line between groups
  // 2. Props
  const { label, onClick }: { label: string; onClick: () => void } = $props();
  // 3. Local state
  let count = $state(0);
  // 4. Derived values (prefer over $effect for computed values)
  const doubled = $derived(count * 2);
  // 5. Effects (side effects only — never use to compute state)
  $effect(() => { document.title = label; });
  // 6. Event handlers — named, prefixed handleEvent
  function handleClick(): void { count++; }
</script>
```

**Never use:** `export let`, `$:`, `createEventDispatcher`, `onMount` for data fetching.  
**Always use:** `$props()`, `$state()`, `$derived()`, `$effect()`.

## TypeScript Rules

- Strict mode: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
- No `any` — use `unknown` + type guards. Write a named type guard function; avoid `as` assertions.
- `interface` for data shapes, props, API responses. `type` for unions and intersections.
- `undefined` for optional fields; `null` only for intentionally absent values or JSON interop.
- No enums — use `const THING = { ... } as const` and `typeof THING[keyof typeof THING]`.
- All promises must be handled or returned (`no-floating-promises` is an error).
- No circular imports (`import/no-cycle` is an error).
- Always `import type` for type-only imports.

**Import order** (blank line between groups):
1. External packages (`svelte`, `codemirror`, …)
2. Internal (`$lib/…`, `$store/…`, `$types/…`)
3. Type-only (`import type`) at end of relevant group

**Path aliases** (prefer over deep `../../..`):
- `$lib/` → `frontend/src/lib/`
- `$store/` → `frontend/src/stores/`
- `$types/` → `frontend/src/types/`

## Store Pattern

```typescript
// Internal writables are prefixed _ and not exported.
const _items = writable<Item[]>([]);
export const items = { subscribe: _items.subscribe };
export async function loadItems(): Promise<void> { … }
// Always use getAdapter() from adapterStore — never import adapters directly.
```

## CSS Rules

- Use `--rd-*` tokens from `styles/tokens.css` exclusively. No hardcoded colours, spacing, or fonts.
- No `!important`. Class names in `<style>` blocks use `kebab-case`.
- CSS Grid for 2D layout; Flexbox for 1D alignment; no absolute positioning for general layout.

## Component Size Limits

- Template > ~150 lines → split into sub-components.
- `<script>` > ~80 lines → extract a helper module to `lib/`.

## Key Architecture Rules

- All encoder calls go through `lib/encoder.ts` — never call `receipt-printer-encoder` directly.
- All print operations go through `lib/printing.ts` — never in a component or store.
- Preview debounce must be >= 300 ms — never run the encoder preview pipeline on every keystroke.
- Storage adapter accessed only through `adapterStore` — never import an adapter directly.

## Error Handling

`try/catch` in all async event handlers and store actions. Show a toast or inline error — never fail
silently. Log with `if (import.meta.env.DEV) console.error(err)`.

## Testing (Vitest)

- `describe` + `it('does X when Y')` format. Test behaviour, not implementation.
- Unit test files live beside source files (`foo.test.ts` next to `foo.ts`).
- `variables.ts` requires 100% branch coverage.
- Playwright e2e specs in `frontend/e2e/` — mock API calls with `page.route()`.
