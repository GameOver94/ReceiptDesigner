/**
 * apiAdapter.ts — Production-mode storage adapter.
 *
 * Communicates with the FastAPI backend at /api/v1/* using the native fetch API.
 * Implements the same StorageAdapter interface as LocalStorageAdapter so the rest
 * of the app is unaware of which adapter is active.
 *
 * The adapter expects the browser to hold a valid rd_session HttpOnly cookie
 * (set by POST /api/v1/auth/login). All requests automatically include credentials.
 * If any request returns 401, the adapter throws an AuthError so callers can
 * redirect to the login screen.
 *
 * JSON field naming: the server uses snake_case; the frontend uses camelCase.
 * This adapter performs the mapping in both directions.
 */

import type { Folder, ReceiptDocument } from '$types/index';

import type { StorageAdapter } from './types';

// ---------------------------------------------------------------------------
// Auth error sentinel
// ---------------------------------------------------------------------------

/**
 * Thrown when the server returns 401 (session expired or missing).
 * App.svelte catches this and shows the LoginScreen.
 */
export class AuthError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base prefix for all API calls. */
const API_BASE = '/api/v1';

/**
 * Perform a fetch against the API with credentials included.
 * Throws AuthError on 401, Error with message on other non-2xx responses.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (resp.status === 401) {
    throw new AuthError();
  }

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body: unknown = await resp.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'detail' in body &&
        typeof (body as Record<string, unknown>)['detail'] === 'string'
      ) {
        detail = (body as Record<string, string>)['detail'] ?? detail;
      }
    } catch {
      // ignore JSON parse error
    }
    throw new Error(detail);
  }

  return resp;
}

// ---------------------------------------------------------------------------
// Field-name mapping  (snake_case ↔ camelCase)
// ---------------------------------------------------------------------------

/** Wire format returned by the server for a document. */
interface ServerDocument {
  id: string;
  name: string;
  description: string | null;
  content: string;
  placeholder_meta: Array<{
    name: string;
    label: string;
    default_value: string | null;
    required: boolean;
  }>;
  printer_settings: {
    columns: number;
    language: string;
    printer_model: string;
    codepage_mapping: string;
    feed_before_cut: number;
    newline: string;
    image_mode: string;
  };
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  is_template: boolean;
}

/** Wire format returned by the server for a folder. */
interface ServerFolder {
  id: string;
  name: string;
  created_at: string;
}

function serverDocToClient(s: ServerDocument): ReceiptDocument {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? undefined,
    content: s.content,
    placeholderMeta: s.placeholder_meta.map((pm) => ({
      name: pm.name,
      label: pm.label,
      defaultValue: pm.default_value ?? undefined,
      required: pm.required,
    })),
    printerSettings: {
      columns: s.printer_settings.columns,
      language: s.printer_settings.language as ReceiptDocument['printerSettings']['language'],
      printerModel: s.printer_settings.printer_model,
      codepageMapping: s.printer_settings.codepage_mapping,
      feedBeforeCut: s.printer_settings.feed_before_cut,
      newline: s.printer_settings.newline as ReceiptDocument['printerSettings']['newline'],
      imageMode: s.printer_settings.image_mode as ReceiptDocument['printerSettings']['imageMode'],
    },
    tags: s.tags,
    folderId: s.folder_id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    isTemplate: s.is_template,
  };
}

function clientDocToServer(
  doc: Omit<ReceiptDocument, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>,
): Record<string, unknown> {
  return {
    name: doc.name,
    description: doc.description ?? null,
    content: doc.content,
    placeholder_meta: doc.placeholderMeta.map((pm) => ({
      name: pm.name,
      label: pm.label,
      default_value: pm.defaultValue ?? null,
      required: pm.required,
    })),
    printer_settings: {
      columns: doc.printerSettings.columns,
      language: doc.printerSettings.language,
      printer_model: doc.printerSettings.printerModel,
      codepage_mapping: doc.printerSettings.codepageMapping,
      feed_before_cut: doc.printerSettings.feedBeforeCut,
      newline: doc.printerSettings.newline,
      image_mode: doc.printerSettings.imageMode,
    },
    tags: doc.tags,
    folder_id: doc.folderId,
  };
}

function clientDocUpdateToServer(
  updates: Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) payload['name'] = updates.name;
  if (updates.description !== undefined) payload['description'] = updates.description ?? null;
  if (updates.content !== undefined) payload['content'] = updates.content;
  if (updates.tags !== undefined) payload['tags'] = updates.tags;
  if ('folderId' in updates) payload['folder_id'] = updates.folderId ?? null;
  if (updates.placeholderMeta !== undefined) {
    payload['placeholder_meta'] = updates.placeholderMeta.map((pm) => ({
      name: pm.name,
      label: pm.label,
      default_value: pm.defaultValue ?? null,
      required: pm.required,
    }));
  }
  if (updates.printerSettings !== undefined) {
    payload['printer_settings'] = {
      columns: updates.printerSettings.columns,
      language: updates.printerSettings.language,
      printer_model: updates.printerSettings.printerModel,
      codepage_mapping: updates.printerSettings.codepageMapping,
      feed_before_cut: updates.printerSettings.feedBeforeCut,
      newline: updates.printerSettings.newline,
      image_mode: updates.printerSettings.imageMode,
    };
  }

  return payload;
}

function serverFolderToClient(s: ServerFolder): Folder {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isServerDocument(value: unknown): value is ServerDocument {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['id'] === 'string' && typeof v['name'] === 'string';
}

function isServerFolder(value: unknown): value is ServerFolder {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['id'] === 'string' && typeof v['name'] === 'string';
}

// ---------------------------------------------------------------------------
// ApiAdapter
// ---------------------------------------------------------------------------

/**
 * ApiAdapter implements StorageAdapter using the FastAPI REST API.
 *
 * Used when window.__APP_CONFIG__.mode === 'production'. Authentication is
 * handled automatically via the HttpOnly rd_session cookie — credentials are
 * included on every fetch call. When a 401 is returned, AuthError is thrown
 * so App.svelte can show the LoginScreen.
 */
export class ApiAdapter implements StorageAdapter {
  // ── Documents ─────────────────────────────────────────────────────────────

  async listDocuments(): Promise<ReceiptDocument[]> {
    const resp = await apiFetch('/documents');
    const data: unknown = await resp.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response from server');
    return data.filter(isServerDocument).map(serverDocToClient);
  }

  async getDocument(id: string): Promise<ReceiptDocument> {
    const resp = await apiFetch(`/documents/${encodeURIComponent(id)}`);
    const data: unknown = await resp.json();
    if (!isServerDocument(data)) throw new Error('Unexpected response from server');
    return serverDocToClient(data);
  }

  async saveDocument(
    doc: Omit<ReceiptDocument, 'id' | 'createdAt' | 'updatedAt' | 'isTemplate'>,
  ): Promise<ReceiptDocument> {
    const resp = await apiFetch('/documents', {
      method: 'POST',
      body: JSON.stringify(clientDocToServer(doc)),
    });
    const data: unknown = await resp.json();
    if (!isServerDocument(data)) throw new Error('Unexpected response from server');
    return serverDocToClient(data);
  }

  async updateDocument(
    id: string,
    updates: Partial<Omit<ReceiptDocument, 'id' | 'createdAt' | 'isTemplate'>>,
  ): Promise<ReceiptDocument> {
    const resp = await apiFetch(`/documents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(clientDocUpdateToServer(updates)),
    });
    const data: unknown = await resp.json();
    if (!isServerDocument(data)) throw new Error('Unexpected response from server');
    return serverDocToClient(data);
  }

  async deleteDocument(id: string): Promise<void> {
    await apiFetch(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ── Folders ───────────────────────────────────────────────────────────────

  async listFolders(): Promise<Folder[]> {
    const resp = await apiFetch('/folders');
    const data: unknown = await resp.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response from server');
    return data.filter(isServerFolder).map(serverFolderToClient);
  }

  async createFolder(name: string): Promise<Folder> {
    const resp = await apiFetch('/folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    const data: unknown = await resp.json();
    if (!isServerFolder(data)) throw new Error('Unexpected response from server');
    return serverFolderToClient(data);
  }

  async renameFolder(id: string, name: string): Promise<Folder> {
    const resp = await apiFetch(`/folders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
    const data: unknown = await resp.json();
    if (!isServerFolder(data)) throw new Error('Unexpected response from server');
    return serverFolderToClient(data);
  }

  async deleteFolder(id: string): Promise<void> {
    await apiFetch(`/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/** POST /api/v1/auth/login with the given token. Returns true on success. */
export async function apiLogin(token: string): Promise<boolean> {
  try {
    const resp = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** POST /api/v1/auth/logout to clear the session cookie. */
export async function apiLogout(): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Best-effort logout — ignore network errors.
  }
}
