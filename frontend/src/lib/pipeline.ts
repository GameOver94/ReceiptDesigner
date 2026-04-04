/**
 * pipeline.ts — The single processing pipeline for ReceiptDesigner.
 *
 * All document content flows through this module before it is rendered or sent
 * to a printer. Two stages:
 *
 *   Stage 1 — Resolution (resolveContent)
 *   ───────────────────────────────────────
 *   Takes the raw editor JS code + the current CSV state and returns an array
 *   of fully-resolved JS code strings, one per output receipt:
 *
 *     - batch mode  →  one string per CSV row (scalar substitution only)
 *     - line-item   →  one string (all rows injected into {{#items}} block)
 *     - no CSV      →  one string (raw content, unchanged)
 *
 *   Consumers (Preview, ExportButtons, TopBar) all call resolveContent() so
 *   there is exactly one place that encodes the batch/line-item/plain logic.
 *
 *   Stage 2 — ESC/POS rendering (toEscPos)
 *   ─────────────────────────────────────────
 *   Takes a single resolved JS code string + PrinterSettings and returns a
 *   Uint8Array of raw printer bytes, ready to be written to Web Serial or
 *   downloaded as a .bin file.
 *
 * See docs/design.md §9.4–9.6 for the full pipeline description.
 */

import { defaultsFromMeta, resolve } from './variables';
import { encodeToBytes } from './encoder';
import type { PlaceholderMeta, PrinterSettings } from '$types/index';

// ---------------------------------------------------------------------------
// Stage 1 — Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve raw JS encoder code against the current CSV/placeholder state.
 *
 * Returns an array of fully-resolved JS code strings. The array length
 * reflects the number of output receipts that should be produced:
 *   - batch mode with N rows  → N strings, one per row (scalar substitution)
 *   - line-item mode          → 1 string (all rows in {{#items}} block)
 *   - no CSV                  → 1 string (raw content, unchanged)
 *
 * @param rawContent  - JS encoder code from the editor, may contain {{placeholders}}
 * @param csvRows     - Loaded CSV rows (empty array when no CSV is loaded)
 * @param csvMode     - 'batch' | 'line-item' | null
 * @param rowIndex    - The row currently shown in the preview (batch mode only).
 * @param singleRow   - When true and csvMode === 'batch', return only the row at rowIndex.
 * @param placeholderMeta - Per-document field metadata used for default values.
 * @param scalars     - Optional map of extra scalar values to layer over metadata defaults.
 */
export function resolveContent(
  rawContent: string,
  csvRows: Record<string, string>[],
  csvMode: 'batch' | 'line-item' | null,
  rowIndex: number,
  singleRow: boolean = false,
  placeholderMeta: PlaceholderMeta[] = [],
  scalars: Record<string, string> = {},
): string[] {
  const defaultScalars = defaultsFromMeta(placeholderMeta);
  const baseScalars: Record<string, string> = { ...defaultScalars, ...scalars };
  const hasBaseScalars = Object.keys(baseScalars).length > 0;

  if (csvMode === 'batch' && csvRows.length > 0) {
    if (singleRow) {
      const row = csvRows[rowIndex] ?? csvRows[0] ?? {};
      const merged: Record<string, string> = hasBaseScalars ? { ...baseScalars, ...row } : row;
      return [resolve(rawContent, { scalars: merged })];
    }
    return csvRows.map((row) => {
      const merged: Record<string, string> = hasBaseScalars ? { ...baseScalars, ...row } : row;
      return resolve(rawContent, { scalars: merged });
    });
  }

  if (csvMode === 'line-item' && csvRows.length > 0) {
    return [resolve(rawContent, { scalars: baseScalars, items: csvRows })];
  }

  return [resolve(rawContent, { scalars: baseScalars })];
}

// ---------------------------------------------------------------------------
// Stage 2 — ESC/POS rendering
// ---------------------------------------------------------------------------

/**
 * Generate raw ESC/POS printer bytes from a single resolved JS encoder code string.
 *
 * This is the canonical ESC/POS rendering step. Both the print path (printing.ts)
 * and the .bin export path (ExportButtons.svelte) must go through this function.
 *
 * @param resolvedContent - JS encoder code with all placeholders already replaced
 * @param settings        - Printer settings controlling columns, language, etc.
 * @returns A Uint8Array of raw printer command bytes
 * @throws  If encoder evaluation fails or encoding fails internally
 */
export function toEscPos(resolvedContent: string, settings: PrinterSettings): Uint8Array {
  return encodeToBytes(resolvedContent, settings);
}
