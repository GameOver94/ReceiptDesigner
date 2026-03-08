/**
 * pipeline.ts — The single processing pipeline for ReceiptDesigner.
 *
 * All document content flows through this module before it is rendered or sent
 * to a printer. Two stages:
 *
 *   Stage 1 — Resolution (resolveContent)
 *   ───────────────────────────────────────
 *   Takes the raw editor content + the current CSV state and returns an array
 *   of fully-resolved ReceiptLine markdown strings, one per output receipt:
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
 *   Takes a single resolved string + PrinterSettings and returns a Uint8Array
 *   of raw printer bytes, ready to be written to Web Serial or downloaded as
 *   a .bin file. This step was previously duplicated between printing.ts and
 *   ExportButtons.svelte.
 *
 * The existing receiptjs.ts (Receipt.js wrapper) and variables.ts (placeholder
 * logic) are unchanged — this module composes them.
 *
 * See docs/design.md §9.4–9.6 for the full pipeline description.
 */

import { resolve } from './variables';
import { settingsToOptions, toCommand } from './receiptjs';
import type { PrinterSettings } from '$types/index';

// ---------------------------------------------------------------------------
// Stage 1 — Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve raw ReceiptLine content against the current CSV/placeholder state.
 *
 * Returns an array of fully-resolved ReceiptLine strings. The array length
 * reflects the number of output receipts that should be produced:
 *   - batch mode with N rows  → N strings, one per row (scalar substitution)
 *   - line-item mode          → 1 string (all rows in {{#items}} block)
 *   - no CSV                  → 1 string (raw content, unchanged)
 *
 * This is the canonical branch point for the entire pipeline. All consumers
 * (Preview, ExportButtons, TopBar print) must go through this function rather
 * than duplicating the batch/line-item/plain switching logic.
 *
 * @param rawContent  - ReceiptLine markdown from the editor, may contain placeholders
 * @param csvRows     - Loaded CSV rows (empty array when no CSV is loaded)
 * @param csvMode     - 'batch' | 'line-item' | null
 * @param rowIndex    - The row currently shown in the preview (batch mode only).
 *                      Pass 0 when producing all rows for printing/export.
 * @param singleRow   - When true and csvMode === 'batch', return only the row at rowIndex
 *                      (used by Preview to show one row at a time). When false (default),
 *                      return all rows (used by print/export to process the full batch).
 * @param scalars     - Optional map of extra scalar values to apply after CSV resolution.
 *                      Used by TopBar to inject PlaceholderMeta defaultValues on top of
 *                      any CSV data. Applied to the fully-resolved string(s) at the end,
 *                      so they can fill in placeholders not covered by the CSV.
 */
export function resolveContent(
  rawContent: string,
  csvRows: Record<string, string>[],
  csvMode: 'batch' | 'line-item' | null,
  rowIndex: number,
  singleRow: boolean = false,
  scalars: Record<string, string> = {},
): string[] {
  const hasExtraScalars = Object.keys(scalars).length > 0;

  if (csvMode === 'batch' && csvRows.length > 0) {
    if (singleRow) {
      // Preview mode — show only the row at rowIndex (clamped defensively).
      const row = csvRows[rowIndex] ?? csvRows[0] ?? {};
      // Merge extra scalars under the CSV row values — CSV takes precedence.
      const merged: Record<string, string> = hasExtraScalars ? { ...scalars, ...row } : row;
      return [resolve(rawContent, { scalars: merged })];
    }
    // Print/export mode — produce one resolved string per CSV row.
    return csvRows.map((row) => {
      const merged: Record<string, string> = hasExtraScalars ? { ...scalars, ...row } : row;
      return resolve(rawContent, { scalars: merged });
    });
  }

  if (csvMode === 'line-item' && csvRows.length > 0) {
    // All rows are injected into the {{#items}} block of a single receipt.
    // Extra scalars apply to the outer document (not inside the items block).
    return [resolve(rawContent, { scalars, items: csvRows })];
  }

  // No CSV: apply only the extra scalars (e.g. PlaceholderMeta defaultValues).
  return [resolve(rawContent, { scalars })];
}

// ---------------------------------------------------------------------------
// Stage 2 — ESC/POS rendering
// ---------------------------------------------------------------------------

/**
 * Generate raw ESC/POS printer bytes from a single resolved ReceiptLine string.
 *
 * This is the canonical ESC/POS rendering step. Both the print path (printing.ts)
 * and the .bin export path (ExportButtons.svelte) must go through this function.
 * The binary string returned by Receipt.js is converted to a Uint8Array here so
 * no caller ever needs to repeat the `charCodeAt & 0xff` loop.
 *
 * @param resolvedContent - ReceiptLine markdown with all placeholders already replaced
 * @param settings        - Printer settings controlling CPL, encoding, command, etc.
 * @returns A Promise<Uint8Array> of raw printer command bytes
 * @throws  If Receipt.js is not loaded, or if toCommand() fails internally
 */
export async function toEscPos(
  resolvedContent: string,
  settings: PrinterSettings,
): Promise<Uint8Array> {
  const options = settingsToOptions(settings);
  const command = await toCommand(resolvedContent, options);

  // Convert the raw binary string returned by Receipt.js to a Uint8Array.
  // Each character's char code is exactly one byte — this is the standard
  // pattern for Receipt.js output. Both print and export go through here so
  // the conversion is never duplicated.
  const bytes = new Uint8Array(command.length);
  for (let i = 0; i < command.length; i++) {
    bytes[i] = command.charCodeAt(i) & 0xff;
  }
  return bytes;
}
