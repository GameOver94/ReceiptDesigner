/**
 * topBarActions.ts — Pure async business-logic helpers for TopBar.svelte.
 *
 * Extracted here to keep the TopBar <script> block under the ~80-line guideline.
 * These functions take all required values as parameters (no direct store imports)
 * so they are easy to test in isolation without a Svelte component context.
 */

import {
  saveAsScratch,
  saveCurrentDocument,
  renameDocument,
  deleteDocument,
  autoSaveIfDirty,
  openScratch,
} from '$store/documentStore';
import { resetEditor, setContent, setPrinterSettings } from '$store/editorStore';
import type { PrinterSettings } from '$types/index';

/**
 * Open the "New" flow: auto-save pending changes, then enter scratch mode.
 */
export async function doNew(content: string, printerSettings: PrinterSettings): Promise<void> {
  await autoSaveIfDirty(content, printerSettings);
  openScratch();
  resetEditor();
}

/**
 * Persist the scratch buffer under a given name.
 * Throws on failure so the caller can display an error message.
 */
export async function doSaveAs(
  name: string,
  content: string,
  printerSettings: PrinterSettings,
): Promise<void> {
  await saveAsScratch(name, content, printerSettings);
}

/**
 * Rename the currently open document.
 * Throws on failure so the caller can display an error message.
 */
export async function doRename(name: string): Promise<void> {
  await renameDocument(name);
}

/**
 * Save the currently open document with the latest content and printer settings.
 * Throws on failure so the caller can display an error message.
 */
export async function doSave(content: string, printerSettings: PrinterSettings): Promise<void> {
  await saveCurrentDocument({ content, printerSettings });
}

/**
 * Delete a document by ID and reset the editor to scratch mode.
 */
export async function doDelete(docId: string): Promise<void> {
  await deleteDocument(docId);
  resetEditor();
}

/**
 * Revert the editor to the last-saved content, clearing the dirty flag via
 * `clearDirty` which must be called by the component after this returns
 * (since clearDirty is a store action and the component imports it directly).
 */
export function doRevert(savedContent: string, savedPrinterSettings: PrinterSettings): void {
  setContent(savedContent);
  setPrinterSettings(savedPrinterSettings);
}
