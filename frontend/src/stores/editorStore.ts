import { writable } from 'svelte/store';
import { DEFAULT_PRINTER_SETTINGS } from '$types/index';
import type { PrinterSettings } from '$types/index';

/**
 * editorStore tracks the raw (possibly unsaved) content in the CodeMirror editor
 * and the current printer settings.
 *
 * Why is this separate from documentStore?
 * The editor content diverges from the saved document content while the user is
 * typing. documentStore holds the last-saved state; editorStore holds the
 * in-progress state. Keeping them separate makes the dirty-flag logic simple:
 * if editorStore.content !== currentDocument.content, the document is dirty.
 *
 * Printer settings live here (not in documentStore) because they are adjusted
 * live in the PrinterPanel and affect the preview immediately, even before the
 * document is saved.
 */

// ---------------------------------------------------------------------------
// Internal writables (not exported — use the read-only views + actions below)
// ---------------------------------------------------------------------------

const _content = writable<string>('');
const _printerSettings = writable<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);

// ---------------------------------------------------------------------------
// Read-only public views
// ---------------------------------------------------------------------------

/** The current raw ReceiptLine text in the editor. */
export const editorContent = { subscribe: _content.subscribe };

/** The current printer settings controlling SVG preview and ESC/POS generation. */
export const printerSettings = { subscribe: _printerSettings.subscribe };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Set the editor content. Called by the CodeMirror editor's onChange handler
 * and also when loading a document into the editor.
 */
export function setContent(content: string): void {
  _content.set(content);
}

/**
 * Replace the entire printer settings object. Used when loading a document.
 */
export function setPrinterSettings(settings: PrinterSettings): void {
  _printerSettings.set(settings);
}

/**
 * Update individual printer settings fields without replacing the whole object.
 * Used by the PrinterPanel component when the user changes a single control.
 */
export function updatePrinterSettings(partial: Partial<PrinterSettings>): void {
  _printerSettings.update((current) => ({ ...current, ...partial }));
}

/**
 * Reset editor to a blank state. Called when creating a new document or
 * clearing the selection.
 */
export function resetEditor(): void {
  _content.set('');
  _printerSettings.set(DEFAULT_PRINTER_SETTINGS);
}
