/**
 * Central type definitions for ReceiptDesigner.
 * All data shapes used across components, stores, and adapters are defined here.
 *
 * Convention:
 *   - `interface` for object shapes (data models, props, API responses)
 *   - `type` for unions and intersections
 */

// ---------------------------------------------------------------------------
// Folder model
// ---------------------------------------------------------------------------

/**
 * A Folder groups documents in the left sidebar.
 * Single-level only — folders cannot contain other folders.
 * See docs/design.md §7.4.
 */
export interface Folder {
  id: string;
  name: string;
  createdAt: string; // ISO 8601 UTC
}

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

/**
 * A Document is the single top-level storage entity.
 * Any document whose content contains `{{` is considered a template — this is
 * derived at runtime and never stored as a separate flag.
 * See docs/design.md §2.1 for the full definition.
 */
export interface ReceiptDocument {
  id: string;
  name: string;
  description?: string;
  content: string; // ReceiptLine markdown, may contain placeholder syntax
  placeholderMeta: PlaceholderMeta[];
  printerSettings: PrinterSettings;
  tags: string[];
  folderId: string | null; // null = document lives at the root (no folder)
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  isTemplate: boolean; // derived: true when content contains {{
}

// ---------------------------------------------------------------------------
// Placeholder metadata
// ---------------------------------------------------------------------------

/**
 * Optional metadata declared per-document to improve the fill-in dialog UX.
 * The `name` field matches the `{{name}}` tag in the document content.
 */
export interface PlaceholderMeta {
  name: string;
  label: string;
  defaultValue?: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Printer settings
// ---------------------------------------------------------------------------

/**
 * All Receipt.js render options for a single document.
 * These control how the ReceiptLine markdown is rendered to SVG and ESC/POS.
 */
export interface PrinterSettings {
  cpl: number; // characters per line (24–96)
  language: string; // Receipt.js language code: en, ja, ko, zh-hans, etc.
  command: string; // escpos | epson | sii | citizen | generic | star
  spacing: boolean;
  cutting: boolean;
  upsideDown: boolean;
  marginLeft: number; // 0–24
  marginRight: number; // 0–24
  gamma: number; // 0.1–10.0
  threshold: number; // 0–255
  printAsImage: boolean;
  landscape: boolean;
}

/**
 * Default printer settings used when creating a new document or resetting the editor.
 * 80 mm paper at 48 cpl is the most common thermal receipt printer width.
 * Defined here (alongside PrinterSettings) so every consumer imports from one place.
 */
export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  cpl: 48,
  language: 'en',
  command: 'escpos',
  spacing: false,
  cutting: true,
  upsideDown: false,
  marginLeft: 0,
  marginRight: 0,
  gamma: 1.0,
  threshold: 128,
  printAsImage: false,
  landscape: false,
};

// ---------------------------------------------------------------------------
// App configuration
// ---------------------------------------------------------------------------

/**
 * Runtime configuration injected via window.__APP_CONFIG__ before the app boots.
 * In demo mode this is baked into index.html. In production mode the FastAPI
 * server replaces the inline script to set mode: 'production'.
 * See docs/design.md §3.1.
 */
export interface AppConfig {
  mode: 'demo' | 'production';
}

// ---------------------------------------------------------------------------
// Print result
// ---------------------------------------------------------------------------

/**
 * Returned by lib/printing.ts after a print attempt.
 * 'unavailable' means the required API (e.g. Web Serial) is not supported
 * by this browser, not that an error occurred.
 */
export interface PrintResult {
  status: 'success' | 'error' | 'unavailable';
  message?: string;
}

// ---------------------------------------------------------------------------
// App settings (persisted to localStorage)
// ---------------------------------------------------------------------------

/**
 * Application-level preferences, separate from per-document PrinterSettings.
 */
export interface AppSettings {
  theme: 'light' | 'dark';
  fontSize: number; // editor font size in px
  defaultPrinterSettings: PrinterSettings;
}

// ---------------------------------------------------------------------------
// Global window augmentation
// ---------------------------------------------------------------------------

// Extend the browser's Window interface so TypeScript knows about
// __APP_CONFIG__ without needing a cast.
declare global {
  interface Window {
    __APP_CONFIG__: AppConfig;
  }
}
