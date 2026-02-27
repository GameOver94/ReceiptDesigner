import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  // base: './' ensures asset paths are relative, which is required for
  // GitHub Pages hosting where the app lives at a subpath like /ReceiptDesigner/
  base: './',

  plugins: [svelte()],

  resolve: {
    alias: {
      // Path aliases mirror tsconfig.json "paths" so both tsc and Vite resolve identically
      $lib: resolve(__dirname, './src/lib'),
      $store: resolve(__dirname, './src/stores'),
      $types: resolve(__dirname, './src/types'),
    },
  },
});
