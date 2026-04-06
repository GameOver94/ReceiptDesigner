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
 * `isTemplate` is derived from content (true when content contains `{{`) and stored
 * as a convenience flag by the adapter — it is set at save time and kept in sync.
 * See docs/design.md §2.1 for the full definition.
 */
export interface ReceiptDocument {
  id: string;
  name: string;
  description?: string;
  content: string; // Receipt encoder JS code, stored as an opaque string
  placeholderMeta: PlaceholderMeta[];
  printerSettings: PrinterSettings;
  tags: string[];
  folderId: string | null; // null = document lives at the root (no folder)
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  isTemplate: boolean; // derived: true when content contains {{
}

/**
 * Extended document type used by local (demo-mode) storage only.
 * Adds CSV state that is persisted in localStorage but never sent to the server —
 * the server stores content as an opaque string and knows nothing about CSV.
 * See docs/design.md §7.1.
 */
export interface LocalReceiptDocument extends ReceiptDocument {
  /**
   * CSV rows last loaded for this document (persisted so they survive page reload).
   * Excluded from ApiAdapter payloads — server stores content as opaque string.
   */
  csvRows?: Record<string, string>[];
  /**
   * CSV mode last set for this document — null when no CSV is loaded.
   * Excluded from ApiAdapter payloads — server stores content as opaque string.
   */
  csvMode?: 'batch' | 'line-item' | null;
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
 * Printer settings for a single document.
 * These control how the JS encoder code is executed and how ESC/POS bytes are generated
 * via @point-of-sale/receipt-printer-encoder.
 *
 * Each field maps directly to a constructor option of ReceiptPrinterEncoder.
 * See: https://github.com/NielsLeenheer/ReceiptPrinterEncoder/blob/main/documentation/configuration.md
 */
export interface PrinterSettings {
  /** Columns / characters per line. Restricted to encoder-supported defaults. */
  columns: number;
  /**
   * Printer command language. Maps to encoder `language` option.
   * 'esc-pos' covers Epson, Citizen, Star (ESC/POS mode), and most generic printers.
   * 'star-prnt' / 'star-line' are for Star printers in their native protocols.
   */
  language: 'esc-pos' | 'star-prnt' | 'star-line';
  /**
   * Optional printer model string (e.g. 'epson-tm-t88vi').
   * When set, the encoder automatically selects the correct codepage mapping and
   * capability flags for the specific model. Overrides `codepageMapping`.
   */
  printerModel: string;
  /**
   * Codepage mapping profile (e.g. 'epson', 'star', 'bixolon').
   * Used when `printerModel` is not set. Controls which codepages the printer supports.
   */
  codepageMapping: string;
  /**
   * Number of lines to feed before the cutter fires (0 = no extra feed).
   * Maps to encoder `feedBeforeCut` option.
   * Most printers need a few lines so the cut falls below the last text line.
   */
  feedBeforeCut: number;
  /**
   * Newline sequence used by the printer.
   * '\n\r' (default) works for virtually all modern receipt printers.
   * Use '\n' only for exotic printers that interpret '\n\r' as two blank lines.
   * Maps to encoder `newline` option.
   */
  newline: '\n\r' | '\n';
  /**
   * Image encoding mode for ESC/POS printers.
   * 'column' (default) works on most modern printers.
   * Use 'raster' for older printers that do not support column mode.
   * Maps to encoder `imageMode` option (ESC/POS only — ignored for Star protocols).
   */
  imageMode: 'column' | 'raster';
}

/**
 * Supported character widths from ReceiptPrinterEncoder docs for 57 mm / 80 mm paper.
 * See configuration.md "Paper width":
 * 57 mm -> 32 or 35 columns; 80 mm -> 42, 44, or 48 columns.
 */
export const ALLOWED_PRINTER_COLUMNS = [32, 35, 42, 44, 48] as const;

/**
 * Default printer settings used when creating a new document or resetting the editor.
 * 80 mm paper at 48 columns is the most common thermal receipt printer width.
 * Defined here (alongside PrinterSettings) so every consumer imports from one place.
 */
export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  columns: 48,
  language: 'esc-pos',
  printerModel: '',
  codepageMapping: 'epson',
  feedBeforeCut: 4,
  newline: '\n\r',
  imageMode: 'column',
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
