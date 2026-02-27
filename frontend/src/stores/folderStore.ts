import { writable } from 'svelte/store';
import { getAdapter } from './adapterStore';
import { loadDocuments } from './documentStore';
import type { Folder } from '$types/index';

/**
 * folderStore manages the list of folders shown in the left sidebar.
 *
 * Folders are single-level only — documents live either in a folder or at the
 * root (folderId === null). See docs/design.md §7.4.
 *
 * Internal writables are prefixed _ and not exported (store rules §4.1).
 * Only { subscribe } views and named action functions are exported.
 */

const _folders = writable<Folder[]>([]);
const _error = writable<string | null>(null);

/** Full list of folders, sorted by name. */
export const folders = { subscribe: _folders.subscribe };

/** Last error from an async folder operation. */
export const folderError = { subscribe: _error.subscribe };

/**
 * Load all folders from the storage adapter.
 * Called alongside loadDocuments() in App.svelte on mount.
 */
export async function loadFolders(): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const result = await adapter.listFolders();
    _folders.set(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load folders';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[folderStore] loadFolders:', err);
  }
}

/**
 * Create a new folder with the given name.
 */
export async function createFolder(name: string): Promise<Folder | null> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const folder = await adapter.createFolder(name);
    _folders.update((fs) => [...fs, folder].sort((a, b) => a.name.localeCompare(b.name)));
    return folder;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[folderStore] createFolder:', err);
    return null;
  }
}

/**
 * Rename a folder by ID.
 */
export async function renameFolder(id: string, name: string): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    const updated = await adapter.renameFolder(id, name);
    _folders.update((fs) =>
      fs.map((f) => (f.id === id ? updated : f)).sort((a, b) => a.name.localeCompare(b.name)),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to rename folder';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[folderStore] renameFolder:', err);
  }
}

/**
 * Delete a folder. Documents inside it are moved to root by the adapter
 * (mirrors SQL ON DELETE SET NULL). Refreshes the document store automatically
 * so the UI reflects the orphaned documents without requiring the caller to do so.
 */
export async function deleteFolder(id: string): Promise<void> {
  _error.set(null);
  try {
    const adapter = getAdapter();
    await adapter.deleteFolder(id);
    _folders.update((fs) => fs.filter((f) => f.id !== id));
    // Refresh documents so any that were in this folder now show folderId: null.
    // This is done internally to enforce the invariant — callers must not need
    // to remember to call loadDocuments() themselves.
    await loadDocuments();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete folder';
    _error.set(message);
    if (import.meta.env.DEV) console.error('[folderStore] deleteFolder:', err);
  }
}
