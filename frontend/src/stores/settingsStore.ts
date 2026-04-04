import { writable } from 'svelte/store';
import { DEFAULT_PRINTER_SETTINGS } from '$types/index';
import type { AppSettings } from '$types/index';

/**
 * settingsStore manages application-level preferences that persist across sessions.
 *
 * Why persist to localStorage here rather than via the StorageAdapter?
 * App settings (theme, font size) are UI preferences tied to this browser, not
 * to any particular document. They should persist even in production mode where
 * the StorageAdapter talks to the server. Keeping them in localStorage directly
 * (bypassing the adapter) is correct here.
 *
 * Stores that bypass the adapter are the exception, not the rule. Document data
 * must always go through the adapter.
 */

const SETTINGS_KEY = 'receipt-designer:settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontSize: 14,
  defaultPrinterSettings: DEFAULT_PRINTER_SETTINGS,
};

/**
 * Type guard that narrows an unknown value to a plain `Record<string, unknown>`.
 * Used instead of `as Record<string, unknown>` to avoid an unsafe bare type assertion.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard that checks whether an unknown plain-object value has at least one
 * valid AppSettings key. Used instead of `as Partial<AppSettings>` to avoid unsafe
 * type assertions on data read back from localStorage.
 *
 * We only check the keys we actually use; any extra keys are ignored by the spread.
 */
function isPartialAppSettings(value: Record<string, unknown>): value is Partial<AppSettings> {
  if ('theme' in value && value['theme'] !== 'light' && value['theme'] !== 'dark') return false;
  if ('fontSize' in value && typeof value['fontSize'] !== 'number') return false;
  return true;
}

function loadPersistedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    // Guard: only merge if it's a plain object so a corrupt/unexpected value
    // (string, array, null) doesn't silently override defaults.
    if (!isRecord(parsed)) return DEFAULT_SETTINGS;
    if (!isPartialAppSettings(parsed)) return DEFAULT_SETTINGS;
    // Merge with defaults so new settings keys added in future releases
    // get their default values without requiring a manual migration.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ---------------------------------------------------------------------------
// Internal writable (prefixed _ per store rules)
// ---------------------------------------------------------------------------

const _settings = writable<AppSettings>(loadPersistedSettings());

// Persist to localStorage whenever settings change.
// $effect() can't be used outside a Svelte component, so we use store.subscribe()
// here to run a side effect whenever the store value changes.
_settings.subscribe((settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable (private browsing, full quota) — fail silently
    // since settings are a convenience, not critical functionality.
  }
});

// ---------------------------------------------------------------------------
// Read-only public views
// ---------------------------------------------------------------------------

export const appSettings = { subscribe: _settings.subscribe };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function updateSettings(partial: Partial<AppSettings>): void {
  _settings.update((current) => ({ ...current, ...partial }));
}

/**
 * Apply a theme by:
 * 1. Persisting the new value to the settings store (and therefore localStorage).
 * 2. Swapping the class on `<html>` so the correct Material theme CSS file activates.
 *
 * The theme CSS files live in `public/theme/` and are loaded via `<link>` tags in
 * `index.html`. Each file scopes its tokens under a class on `<html>` (e.g. `.light`,
 * `.dark`). Switching the class is the only change needed — no rebuild required.
 */
export function setTheme(theme: AppSettings['theme']): void {
  updateSettings({ theme });
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
}
