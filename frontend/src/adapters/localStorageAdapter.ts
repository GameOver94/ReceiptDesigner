import type { Folder, ReceiptDocument } from '$types/index';
import type { StorageAdapter } from './types';

// localStorage keys
const DOCS_KEY = 'receipt-designer:documents';
const FOLDERS_KEY = 'receipt-designer:folders';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Checks whether a plain-object value from JSON.parse has the minimum shape of
 * a ReceiptDocument (id + content as strings). Used instead of `as ReceiptDocument`
 * to avoid unsafe type assertions on data that came from untrusted localStorage.
 */
function isReceiptDocument(value: unknown): value is ReceiptDocument {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['content'] === 'string' &&
    typeof v['createdAt'] === 'string'
  );
}

/**
 * LocalStorageAdapter stores documents and folders as JSON arrays in localStorage.
 *
 * Used in demo mode (window.__APP_CONFIG__.mode === 'demo'). No server is needed.
 * All CRUD operations are synchronous under the hood, but the interface is async
 * so that LocalStorageAdapter and ApiAdapter are interchangeable — the rest of the
 * app always awaits the result and doesn't need to know which adapter is active.
 *
 * IDs are generated with crypto.randomUUID() — this runs in the browser because in
 * demo mode there is no server to assign IDs. crypto.randomUUID() is available in
 * all modern browsers and requires a secure context (https or localhost).
 */
export class LocalStorageAdapter implements StorageAdapter {
  // ── Documents ───────────────────────────────────────────────────────────────

  /** Read all documents from localStorage, returning an empty array if none exist. */
  private readAllDocs(): ReceiptDocument[] {
    const raw = localStorage.getItem(DOCS_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      // Basic sanity check — if the stored value isn't an array, reset to empty.
      if (!Array.isArray(parsed)) return [];
      // Migration shim: documents saved before folderId was added won't have it.
      // We spread the stored object first, then set folderId only if absent —
      // using ?? null so existing folderId values (including null) are preserved.
      // The outer cast to the migration-shim type is safe because Array.isArray
      // confirmed it is an array; isReceiptDocument validates each element's shape.
      return (parsed as Array<Omit<ReceiptDocument, 'folderId'> & { folderId?: string | null }>)
        .map((d) => ({ ...d, folderId: d.folderId ?? null }))
        .filter(isReceiptDocument);
    } catch {
      // Corrupted storage — start fresh rather than crashing the app.
      return [];
    }
  }

  /** Persist the full document list to localStorage. */
  private writeAllDocs(docs: ReceiptDocument[]): void {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  }

  async listDocuments(): Promise<ReceiptDocument[]> {
    return this.readAllDocs();
  }

  async getDocument(id: string): Promise<ReceiptDocument> {
    const docs = this.readAllDocs();
    const doc = docs.find((d) => d.id === id);
    if (doc === undefined) {
      throw new Error(`Document not found: ${id}`);
    }
    return doc;
  }

  async saveDocument(
    doc: Omit<ReceiptDocument, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>,
  ): Promise<ReceiptDocument> {
    const now = new Date().toISOString();
    const newDoc: ReceiptDocument = {
      ...doc,
      // crypto.randomUUID() generates a UUID v4 in the browser — no server needed.
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      // isTemplate is derived from content — never stored explicitly.
      // A document is a template if its content contains any {{ placeholder.
      isTemplate: doc.content.includes('{{'),
    };

    const docs = this.readAllDocs();
    docs.push(newDoc);
    this.writeAllDocs(docs);
    return newDoc;
  }

  async updateDocument(
    id: string,
    updates: Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>,
  ): Promise<ReceiptDocument> {
    const docs = this.readAllDocs();
    const index = docs.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`Document not found: ${id}`);
    }

    const existing = docs[index];
    if (existing === undefined) {
      throw new Error(`Document not found: ${id}`);
    }

    const updated: ReceiptDocument = {
      ...existing,
      ...updates,
      id, // Prevent overwriting the ID
      createdAt: existing.createdAt, // Prevent overwriting creation time
      updatedAt: new Date().toISOString(),
      // Re-derive isTemplate from the updated content (or existing if not changed)
      isTemplate: (updates.content ?? existing.content).includes('{{'),
    };

    docs[index] = updated;
    this.writeAllDocs(docs);
    return updated;
  }

  async deleteDocument(id: string): Promise<void> {
    const docs = this.readAllDocs();
    const filtered = docs.filter((d) => d.id !== id);
    if (filtered.length === docs.length) {
      throw new Error(`Document not found: ${id}`);
    }
    this.writeAllDocs(filtered);
  }

  // ── Folders ─────────────────────────────────────────────────────────────────

  /** Read all folders from localStorage, returning an empty array if none exist. */
  private readAllFolders(): Folder[] {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      // Guard: ensure the stored value is an array of objects with at least an id field.
      // Malformed entries are dropped rather than crashing the app.
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item): item is Folder =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>)['id'] === 'string',
      );
    } catch {
      return [];
    }
  }

  /** Persist the full folder list to localStorage. */
  private writeAllFolders(folders: Folder[]): void {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }

  async listFolders(): Promise<Folder[]> {
    // Return folders sorted by name for a predictable sidebar order.
    return this.readAllFolders().sort((a, b) => a.name.localeCompare(b.name));
  }

  async createFolder(name: string): Promise<Folder> {
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    const folders = this.readAllFolders();
    folders.push(folder);
    this.writeAllFolders(folders);
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    const folders = this.readAllFolders();
    const index = folders.findIndex((f) => f.id === id);
    if (index === -1) throw new Error(`Folder not found: ${id}`);
    const existing = folders[index];
    if (existing === undefined) throw new Error(`Folder not found: ${id}`);
    const updated: Folder = { ...existing, name };
    folders[index] = updated;
    this.writeAllFolders(folders);
    return updated;
  }

  async deleteFolder(id: string): Promise<void> {
    const folders = this.readAllFolders();
    const filtered = folders.filter((f) => f.id !== id);
    if (filtered.length === folders.length) throw new Error(`Folder not found: ${id}`);
    this.writeAllFolders(filtered);

    // Move all documents that were in this folder back to the root.
    // This mirrors the SQL ON DELETE SET NULL behaviour on the folder_id FK.
    const docs = this.readAllDocs();
    const updated = docs.map((d) => (d.folderId === id ? { ...d, folderId: null } : d));
    this.writeAllDocs(updated);
  }
}
