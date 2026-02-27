import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    // svelte() is needed so Vitest can compile .svelte components used in tests
    svelte({ hot: false }),
  ],

  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
      $store: resolve(__dirname, './src/stores'),
      $types: resolve(__dirname, './src/types'),
    },
  },

  test: {
    // jsdom simulates a browser DOM environment so Svelte components can render
    // and browser APIs (localStorage, crypto.randomUUID) are available in tests.
    environment: 'jsdom',
    // globals: true means describe/it/expect are available without explicit import
    globals: true,
    // Setup file runs before each test file — imports jest-dom matchers like
    // `toBeInTheDocument()` so component tests can use them.
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
