/**
 * test-setup.ts — Vitest global test setup file.
 *
 * This file runs before every test file. It imports jest-dom so Vitest has
 * access to custom DOM matchers like `toBeInTheDocument()`, `toHaveValue()`, etc.
 *
 * The setup file is registered in vitest.config.ts via setupFiles.
 * See https://testing-library.com/docs/svelte-testing-library/setup
 */

import '@testing-library/jest-dom';

// Mock window.__APP_CONFIG__ so unit tests that import store code don't crash.
// Without this, adapterStore.ts would throw when it reads window.__APP_CONFIG__.
Object.defineProperty(window, '__APP_CONFIG__', {
  value: { mode: 'demo' },
  writable: true,
});
