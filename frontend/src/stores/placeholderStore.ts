import { writable, derived, get } from 'svelte/store';
import { detectPlaceholders } from '$lib/variables';
import { persistCsvToDocument } from '$lib/documentCsv';
import { editorContent } from '$store/editorStore';
import type { LocalReceiptDocument } from '$types/index';

/**
 * placeholderStore — Manages all placeholder-system state for ReceiptDesigner.
 *
 * Why a dedicated store instead of component-local state?
 * Multiple components need this state simultaneously:
 *   - TopBar shows "Fill & Print", "Load CSV", and "Edit Fields" buttons
 *   - Preview needs CSV rows + current row index to render batch previews
 *   - BatchCsvDialog, PlaceholderMetaEditor need open/close state
 * A store provides a shared, consistent view without prop-drilling.
 * See docs/design.md §9.2.
 *
 * Internal writables are prefixed _ and not exported (store rules §4.1).
 * Only { subscribe } views and named action functions are exported.
 */

// ---------------------------------------------------------------------------
// Internal writables
// ---------------------------------------------------------------------------

/** CSV rows loaded by the user (empty until a CSV is loaded) */
const _csvRows = writable<Record<string, string>[]>([]);

/**
 * CSV mode:
 *   'batch'     — one receipt per CSV row (scalar placeholders mapped to columns)
 *   'line-item' — all rows form a single receipt's {{#items}} block
 *   null        — no CSV loaded
 */
const _csvMode = writable<'batch' | 'line-item' | null>(null);

/**
 * Index of the currently previewed row in batch mode.
 * Ignored when csvMode is 'line-item' or null.
 */
const _previewRowIndex = writable<number>(0);

/** Whether the CSV upload dialog is open */
const _isBatchCsvDialogOpen = writable<boolean>(false);

/** Whether the PlaceholderMeta editor dialog is open */
const _isPlaceholderMetaEditorOpen = writable<boolean>(false);

// ---------------------------------------------------------------------------
// Derived stores
// ---------------------------------------------------------------------------

/**
 * Detected placeholder names from the current editor content.
 *
 * This is a derived store because the placeholder list is always a pure
 * function of the editor content — whenever the content changes, the list
 * updates automatically without any manual synchronisation.
 *
 * We derive from `editorContent` (the live editor buffer) rather than the
 * saved document so the list reflects what the user is currently typing,
 * even before saving.
 */
export const detectedPlaceholders = derived(editorContent, ($content) =>
  detectPlaceholders($content),
);

// ---------------------------------------------------------------------------
// Read-only public views
// ---------------------------------------------------------------------------

/** Currently loaded CSV data rows */
export const csvRows = { subscribe: _csvRows.subscribe };

/** Current CSV mode ('batch' | 'line-item' | null) */
export const csvMode = { subscribe: _csvMode.subscribe };

/** Index of the row currently previewed in batch mode */
export const previewRowIndex = { subscribe: _previewRowIndex.subscribe };

/** Whether the CSV upload dialog is visible */
export const isBatchCsvDialogOpen = { subscribe: _isBatchCsvDialogOpen.subscribe };

/** Whether the PlaceholderMeta editor is visible */
export const isPlaceholderMetaEditorOpen = { subscribe: _isPlaceholderMetaEditorOpen.subscribe };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Open the CSV upload/mode-selection dialog */
export function openBatchCsvDialog(): void {
  _isBatchCsvDialogOpen.set(true);
}

/** Close the CSV upload dialog */
export function closeBatchCsvDialog(): void {
  _isBatchCsvDialogOpen.set(false);
}

/** Open the PlaceholderMeta editor dialog */
export function openMetaEditor(): void {
  _isPlaceholderMetaEditorOpen.set(true);
}

/** Close the PlaceholderMeta editor dialog */
export function closeMetaEditor(): void {
  _isPlaceholderMetaEditorOpen.set(false);
}

/**
 * Load CSV data into the store and set the mode.
 * Resets the preview row index to 0 so the first row is shown immediately.
 * Persists csvRows and csvMode to the current document so they survive page reload.
 * No-op persist when no document is open (e.g. scratch mode).
 */
export function loadCsv(rows: Record<string, string>[], mode: 'batch' | 'line-item'): void {
  _csvRows.set(rows);
  _csvMode.set(mode);
  _previewRowIndex.set(0);
  persistCsvToDocument(rows, mode);
}

/**
 * Switch the CSV mode without reloading rows.
 * Resets the preview row index to 0 so the first row is shown immediately.
 * No-op when no CSV is loaded.
 * Persists the updated mode to the current document when one is open.
 */
export function setCsvMode(mode: 'batch' | 'line-item'): void {
  // Capture the resolved value inside the updater so the persist call uses the
  // exact value that was written — a separate get() after update() could race
  // with batched Svelte updates and capture the pre-update value.
  let persisted: 'batch' | 'line-item' | null = null;
  _csvMode.update((current) => {
    persisted = current === null ? null : mode;
    return persisted;
  });
  _previewRowIndex.set(0);
  if (persisted !== null) {
    const rows = get(_csvRows);
    persistCsvToDocument(rows, persisted);
  }
}

/**
 * Clear the loaded CSV data and reset CSV-related state.
 * Persists the cleared state to the current document when one is open.
 * Silent no-op persist in scratch mode (no document open).
 */
export function clearCsv(): void {
  _csvRows.set([]);
  _csvMode.set(null);
  _previewRowIndex.set(0);
  persistCsvToDocument([], null);
}

/**
 * Restore CSV state from a loaded document without triggering a re-save.
 * Called by documentStore.selectDocument() after switching to a document.
 * This avoids a save-loop: loadCsv/clearCsv → saveCurrentDocument → selectDocument → loadCsv…
 */
export function loadCsvFromDocument(doc: LocalReceiptDocument): void {
  const rows = doc.csvRows ?? [];
  const mode = doc.csvMode ?? null;
  _csvRows.set(rows);
  _csvMode.set(mode);
  _previewRowIndex.set(0);
}

/**
 * Set the current CSV preview row index (for batch mode navigation).
 * Clamps to valid range automatically.
 */
export function setPreviewRowIndex(n: number): void {
  const rows = get(_csvRows);
  if (rows.length === 0) {
    _previewRowIndex.set(0);
    return;
  }
  // Clamp to [0, rows.length - 1]
  const clamped = Math.max(0, Math.min(n, rows.length - 1));
  _previewRowIndex.set(clamped);
}
