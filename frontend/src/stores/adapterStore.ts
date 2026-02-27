import { writable } from 'svelte/store';
import { LocalStorageAdapter } from '../adapters/localStorageAdapter';
import type { StorageAdapter } from '../adapters/types';

/**
 * adapterStore holds the single active StorageAdapter instance for the app.
 *
 * Why a store instead of a module-level singleton?
 * A store lets components and other stores subscribe to adapter changes
 * reactively, which matters if the mode were ever changed at runtime. More
 * importantly, keeping the adapter in a store means we have one canonical
 * place to replace it in tests (by calling initAdapter with a mock).
 *
 * Why not import the adapter directly in components?
 * The adapter is an implementation detail of the storage layer. Components
 * should not know whether they are talking to localStorage or an HTTP API.
 * They call documentStore actions, which call getAdapter(). This is the
 * Adapter pattern — see docs/design.md §9.1.
 */

// _adapter is the internal writable — prefixed _ and not exported per store rules.
// Only { subscribe } is exported so consumers cannot call .set() from outside.
const _adapter = writable<StorageAdapter | null>(null);

/** Read the current adapter without subscribing to changes. */
let _currentAdapter: StorageAdapter | null = null;
_adapter.subscribe((val) => {
  _currentAdapter = val;
});

/**
 * Initialise the adapter from window.__APP_CONFIG__.mode.
 * Called once from main.ts before the app mounts.
 *
 * Separating initialisation from module load time makes the adapter testable —
 * tests can call initAdapter with a mock before running any store actions.
 */
export function initAdapter(): void {
  const mode = window.__APP_CONFIG__?.mode ?? 'demo';
  if (mode === 'demo') {
    _adapter.set(new LocalStorageAdapter());
  } else {
    // ApiAdapter will be implemented in Milestone 3.
    // For now, fall back to LocalStorageAdapter so production mode doesn't crash.
    console.warn(
      '[adapterStore] Production mode detected but ApiAdapter is not yet implemented. ' +
        'Falling back to LocalStorageAdapter until Milestone 3.',
    );
    _adapter.set(new LocalStorageAdapter());
  }
}

/**
 * Get the current adapter instance. Throws if initAdapter() has not been called.
 * Used by store action functions — never call this from a component directly.
 */
export function getAdapter(): StorageAdapter {
  if (_currentAdapter === null) {
    throw new Error(
      'Storage adapter not initialised. Call initAdapter() in main.ts before using stores.',
    );
  }
  return _currentAdapter;
}

/** Read-only view of the adapter store for components that need to know mode. */
export const adapterStore = { subscribe: _adapter.subscribe };
