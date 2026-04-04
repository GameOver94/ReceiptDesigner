/**
 * main.ts — Application entry point.
 *
 * Responsibilities:
 * 1. Import global CSS (tokens must load before any component styles)
 * 2. Initialise the storage adapter from window.__APP_CONFIG__.mode
 * 3. Mount the root Svelte component onto #app
 *
 * The order matters: initAdapter() must run before any store action calls
 * getAdapter(). If the Svelte component tree calls loadDocuments() on mount
 * and the adapter isn't ready, it will throw.
 */

// Global styles must be imported before the app mounts so CSS custom properties
// are available when components first render.
// tokens.css must come before global.css so custom properties are defined first.
import './styles/tokens.css';
import './styles/global.css';

import { mount } from 'svelte';
import App from './App.svelte';
import { initAdapter } from './stores/adapterStore';
import { setTheme } from './stores/settingsStore';
import { get } from 'svelte/store';
import { appSettings } from './stores/settingsStore';

// Initialise the storage adapter synchronously before mounting.
// This sets the adapter in adapterStore so all subsequent store actions work.
initAdapter();

// Apply the persisted theme to <html> before the first render to prevent a
// flash of the wrong colour scheme. settingsStore.loadPersistedSettings() has
// already run at module evaluation time, so appSettings holds the correct value.
setTheme(get(appSettings).theme);

// Mount the Svelte 5 app.
// `mount()` replaces the legacy `new App({ target })` from Svelte 4.
// It returns a component instance that can be used to unmount later if needed.
mount(App, {
  target: document.getElementById('app') ?? document.body,
});
