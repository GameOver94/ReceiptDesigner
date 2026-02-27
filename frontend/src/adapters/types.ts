import type { Folder, ReceiptDocument } from '$types/index';

/**
 * StorageAdapter is the interface that both LocalStorageAdapter (demo mode)
 * and ApiAdapter (production mode) must implement.
 *
 * Why an interface instead of a concrete class?
 * The adapter is injected at runtime based on window.__APP_CONFIG__.mode.
 * Defining a shared interface lets the rest of the app work with either
 * implementation without knowing which one is active. See docs/design.md §9.1.
 */
export interface StorageAdapter {
  // ── Documents ─────────────────────────────────────────────────────────────
  listDocuments(): Promise<ReceiptDocument[]>;
  getDocument(id: string): Promise<ReceiptDocument>;
  /**
   * Create a new document. The adapter generates the id and timestamps.
   * Omitting id/createdAt/updatedAt/isTemplate here because:
   *   - id: generated client-side (crypto.randomUUID) or server-side
   *   - createdAt/updatedAt: set by the adapter at save time
   *   - isTemplate: always derived from content, never stored
   */
  saveDocument(
    doc: Omit<ReceiptDocument, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>,
  ): Promise<ReceiptDocument>;
  updateDocument(
    id: string,
    doc: Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>,
  ): Promise<ReceiptDocument>;
  deleteDocument(id: string): Promise<void>;

  // ── Folders ───────────────────────────────────────────────────────────────
  /** Returns all folders, ordered by name. */
  listFolders(): Promise<Folder[]>;
  /** Create a new folder with the given name. */
  createFolder(name: string): Promise<Folder>;
  /** Rename an existing folder. */
  renameFolder(id: string, name: string): Promise<Folder>;
  /**
   * Delete a folder. Any documents inside it are moved to the root
   * (their folderId is set to null). Mirrors the SQL ON DELETE SET NULL behaviour.
   */
  deleteFolder(id: string): Promise<void>;
}
