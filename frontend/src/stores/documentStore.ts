import { writable, derived, get } from 'svelte/store';
import { getAdapter } from './adapterStore';
import { DEFAULT_PRINTER_SETTINGS } from '$types/index';
import type { ReceiptDocument } from '$types/index';
import type { LocalReceiptDocument, PrinterSettings } from '$types/index';
import { loadCsvFromDocument, clearCsv } from './placeholderStore';

/**
 * documentStore manages the document list and the currently selected document.
 *
 * Why a store instead of component-local state?
 * Multiple components need document data simultaneously — the DocumentList sidebar
 * shows all documents, the Editor shows the current one, and the TopBar buttons
 * act on it. A store gives all of them a shared, consistent view without prop-drilling
 * through every level of the component tree.
 *
 * Internal writables are prefixed _ and not exported (store rules §4.1).
 * Only { subscribe } views and named action functions are exported.
 */

// Full list of all saved documents
const _documents = writable<LocalReceiptDocument[]>([]);

// ID of the currently open document (null = nothing open or scratch mode)
const _currentId = writable<string | null>(null);

// Whether the editor content has unsaved changes
const _isDirty = writable<boolean>(false);

// Error message from the last failed operation (null = no error)
const _error = writable<string | null>(null);

// Error message specifically from loadDocuments() (null = no error)
const _loadError = writable<string | null>(null);

/**
 * Scratch mode: the editor is active with in-memory content but no backing
 * document has been saved yet. The user must explicitly name and save to persist.
 * While true, _currentId is null and autoSaveIfDirty is a no-op.
 */
const _isScratch = writable<boolean>(false);

// ---------------------------------------------------------------------------
// Read-only public views
// ---------------------------------------------------------------------------

/** Full list of documents, in the order returned by the adapter. */
export const documents = { subscribe: _documents.subscribe };

/**
 * The currently selected document, or null if none is selected.
 *
 * This is a derived store rather than a standalone writable because it is
 * always computed from the documents list + the current ID. Using $derived
 * (or derived() in store context) ensures they stay in sync automatically —
 * if the selected document is updated elsewhere, currentDocument reflects that
 * change immediately without any extra coordination.
 */
export const currentDocument = derived(
  [_documents, _currentId],
  ([$docs, $id]) => $docs.find((d) => d.id === $id) ?? null,
);

/** Whether the currently open document has unsaved changes. */
export const isDirty = { subscribe: _isDirty.subscribe };

/** Last error from an async operation, for display in the UI. */
export const documentError = { subscribe: _error.subscribe };

/**
 * Last error specifically from loadDocuments(), for display in the sidebar or app shell.
 * This is a dedicated writable — it is only set inside loadDocuments() — so consumers
 * can subscribe to load failures without seeing save/rename/delete/move errors.
 */
export const loadError = { subscribe: _loadError.subscribe };

/**
 * True when the editor has content but no backing document yet.
 * The user must call saveAsScratch() to persist it.
 */
export const isScratch = { subscribe: _isScratch.subscribe };

// ---------------------------------------------------------------------------
// Synchronous getters (for use in non-reactive contexts)
// ---------------------------------------------------------------------------

/**
 * Return the current document ID synchronously.
 * Used by placeholderStore to guard CSV persist calls — avoids calling
 * saveCurrentDocument when no document is open (e.g. scratch mode), which
 * would otherwise write a spurious 'No document is currently open' error.
 */
export function getCurrentId(): string | null {
  return get(_currentId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Load all documents from the storage adapter and populate the store.
 * Called on app mount in App.svelte.
 */
export async function loadDocuments(): Promise<void> {
  _loadError.set(null);
  try {
    const adapter = getAdapter();
    const docs = await adapter.listDocuments();
    // Cast is safe: LocalReceiptDocument extends ReceiptDocument; the extra
    // csvRows/csvMode fields are optional and will be undefined for adapter-returned docs.
    _documents.set(docs as LocalReceiptDocument[]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load documents';
    _loadError.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] loadDocuments:', err);
  }
}

/**
 * Enter scratch mode: the editor is active with a blank (or existing) buffer but
 * nothing is persisted. autoSaveIfDirty is a no-op while in this state.
 * Call this when the user opens a new blank editor before naming a document.
 */
export function openScratch(): void {
  _currentId.set(null);
  _isScratch.set(true);
  _isDirty.set(false);
  clearCsv();
}

/**
 * Persist the scratch buffer as a new named document, then select it.
 * Clears scratch mode. Called from TopBar when the user saves for the first time.
 */
export async function saveAsScratch(
  name: string,
  content: string,
  printerSettings: PrinterSettings,
): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const newDoc = await adapter.saveDocument({
      name,
      content,
      placeholderMeta: [],
      printerSettings,
      tags: [],
      folderId: null,
    });
    _documents.update((docs) => [...docs, newDoc as LocalReceiptDocument]);
    _currentId.set(newDoc.id);
    _isScratch.set(false);
    _isDirty.set(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] saveAsScratch:', err);
  }
}

/**
 * Create a blank document with a given name and select it.
 * Used when the user explicitly creates a named document from the New modal.
 */
export async function createDocument(name = 'Untitled'): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const newDoc = await adapter.saveDocument({
      name,
      content: '',
      placeholderMeta: [],
      printerSettings: DEFAULT_PRINTER_SETTINGS,
      tags: [],
      folderId: null,
    });
    _documents.update((docs) => [...docs, newDoc as LocalReceiptDocument]);
    _currentId.set(newDoc.id);
    _isScratch.set(false);
    _isDirty.set(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] createDocument:', err);
  }
}

/**
 * Save the currently open document with new content and/or printer settings.
 * Updates both the adapter and the in-memory store.
 *
 * `csvRows` and `csvMode` are local-only fields (not part of the `ReceiptDocument`
 * schema). In **production mode** they are stripped from the adapter payload so
 * the server never sees them. In **demo mode** they are included in the payload so
 * that `LocalStorageAdapter` can persist them across page reloads.
 * In both modes any new `csvRows`/`csvMode` values are applied to the in-memory
 * store after the adapter call completes.
 */
export async function saveCurrentDocument(
  updates: Partial<Omit<LocalReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>,
): Promise<void> {
  _error.set(null);

  const currentId = get(_currentId);

  if (currentId === null) {
    _error.set('No document is currently open');
    return;
  }

  try {
    const adapter = getAdapter();
    // csvRows/csvMode are local-only fields. In production mode strip them so the
    // server never sees them; in demo mode include them so LocalStorageAdapter
    // persists them across page reloads (LocalReceiptDocument is structurally a
    // superset of ReceiptDocument, so passing it as the narrower type is safe).
    const { csvRows, csvMode, ...adapterUpdates } = updates;
    const mode = window.__APP_CONFIG__?.mode ?? 'demo';
    const payload: Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>> =
      mode === 'demo'
        ? // LocalReceiptDocument extends ReceiptDocument — safe to widen.
          (updates as Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>)
        : adapterUpdates;
    const updated = await adapter.updateDocument(currentId, payload);
    _documents.update((docs) =>
      docs.map((d) => {
        if (d.id !== currentId) return d;
        // Preserve existing local-only fields (csvRows/csvMode) from the in-memory
        // document, then layer the adapter response on top, then apply any new
        // csvRows/csvMode from this update call. This prevents unrelated saves
        // (e.g. content auto-save, rename) from silently discarding CSV state.
        const merged: LocalReceiptDocument = { ...d, ...updated };
        if (csvRows !== undefined) merged.csvRows = csvRows;
        if (csvMode !== undefined) merged.csvMode = csvMode;
        return merged;
      }),
    );
    _isDirty.set(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] saveCurrentDocument:', err);
  }
}

/**
 * Delete a document by ID. If it is the currently selected document,
 * the selection is cleared and scratch mode is entered.
 */
export async function deleteDocument(id: string): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    await adapter.deleteDocument(id);
    _documents.update((docs) => docs.filter((d) => d.id !== id));

    // If we deleted the open document, enter scratch mode
    _currentId.update((currentId) => {
      if (currentId === id) {
        _isScratch.set(true);
        return null;
      }
      return currentId;
    });
    _isDirty.set(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] deleteDocument:', err);
  }
}

/**
 * Mark the current document as having unsaved changes.
 * Called by editorStore whenever the content changes.
 */
export function markDirty(): void {
  _isDirty.set(true);
}

/**
 * Select a document by ID — loads it into the editor.
 * Clears scratch mode and the dirty flag.
 * Restores any persisted CSV rows and mode from the document.
 */
export function selectDocument(id: string): void {
  _currentId.set(id);
  _isScratch.set(false);
  _isDirty.set(false);
  const doc = get(_documents).find((d) => d.id === id);
  if (doc !== undefined) {
    loadCsvFromDocument(doc);
  } else {
    clearCsv();
  }
}

/**
 * Rename the currently open document.
 */
export async function renameDocument(newName: string): Promise<void> {
  await saveCurrentDocument({ name: newName });
}

/**
 * Rename any document by ID without changing the active selection.
 * Use this when renaming a document that is not currently open, so the
 * editor/selection state is not disturbed as a side-effect.
 */
export async function renameDocumentById(id: string, newName: string): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const updated = await adapter.updateDocument(id, { name: newName });
    _documents.update((docs) =>
      docs.map((d) => {
        if (d.id !== id) return d;
        // Preserve local-only fields (csvRows, csvMode) when merging adapter response.
        return { ...d, ...updated };
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to rename document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] renameDocumentById:', err);
    throw err;
  }
}

/**
 * Auto-save the current document with the latest editor content + printer settings
 * if there are unsaved changes. Silently does nothing when in scratch mode, when
 * nothing is dirty, or when no document is open.
 */
export async function autoSaveIfDirty(
  content: string,
  printerSettings: PrinterSettings,
): Promise<void> {
  const dirty = get(_isDirty);
  const id = get(_currentId);
  const scratch = get(_isScratch);
  // Skip auto-save in scratch mode — user must explicitly name and save first
  if (!dirty || id === null || scratch) return;
  await saveCurrentDocument({ content, printerSettings });
}

/**
 * Move a document to a different folder (or to the root when folderId is null).
 * Updates both the adapter and the in-memory store. If the document is currently
 * open, saveCurrentDocument is used so editorStore stays in sync; otherwise the
 * documents list is refreshed from the adapter.
 */
export async function moveDocumentToFolder(docId: string, folderId: string | null): Promise<void> {
  _error.set(null);

  const currentId = get(_currentId);

  try {
    const adapter = getAdapter();
    if (currentId === docId) {
      // Keep editorStore / currentDocument in sync by going through saveCurrentDocument.
      // saveCurrentDocument calls adapter.updateDocument internally — do not call it twice.
      await saveCurrentDocument({ folderId });
    } else {
      // For non-current docs, update the in-memory list directly to avoid a
      // full round-trip to the adapter.
      const updated = await adapter.updateDocument(docId, { folderId });
      _documents.update((docs) =>
        docs.map((d) => {
          if (d.id !== docId) return d;
          // Preserve local-only fields (csvRows, csvMode) when merging adapter response.
          return { ...d, ...updated };
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move document';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[documentStore] moveDocumentToFolder:', err);
  }
}

/**
 * Clear the dirty flag without persisting anything.
 * Called after the editor has been reverted to the saved document content
 * (discard-changes flow). The caller is responsible for restoring the editor
 * content — this function only resets the dirty flag.
 */
export function clearDirty(): void {
  _isDirty.set(false);
}
