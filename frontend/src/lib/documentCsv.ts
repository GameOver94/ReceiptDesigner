/**
 * documentCsv.ts — Helpers for persisting CSV state to the current document.
 *
 * Both documentStore and placeholderStore need access to "save CSV data to the
 * current document" logic, but importing each store from the other would create
 * a circular module dependency. This module breaks the cycle by centralising
 * the document-persist operations here:
 *
 *   placeholderStore  →  lib/documentCsv  →  stores/documentStore
 *   documentStore     →  stores/placeholderStore   (unchanged, one direction only)
 *
 * The dynamic import of documentStore is kept here (rather than inlined in each
 * caller) so there is exactly one place to maintain and one comment to explain
 * the pattern.
 *
 * Why dynamic import instead of a static import at the top of placeholderStore?
 * At module initialisation time, documentStore imports placeholderStore (to call
 * loadCsvFromDocument / clearCsv on document selection). If placeholderStore
 * also statically imported documentStore at the top level, Node/Vite would see
 * a synchronous circular dependency and one of the modules would receive an
 * incomplete (partially-evaluated) binding — causing hard-to-debug "X is not a
 * function" errors. A dynamic import() defers the resolution until after both
 * modules have finished initialising, so the binding is always complete by the
 * time it is used.
 */

/**
 * Persist CSV rows and mode to the currently open document.
 *
 * No-op when no document is open (scratch mode or nothing selected).
 * Errors are logged in DEV mode but never propagated — a CSV persist failure
 * is not critical enough to surface to the user.
 *
 * @param rows - Parsed CSV rows to persist
 * @param mode - Import mode to persist
 */
export function persistCsvToDocument(
  rows: Record<string, string>[],
  mode: 'batch' | 'line-item' | null,
): void {
  void import('../stores/documentStore')
    .then(({ saveCurrentDocument, getCurrentId }) => {
      if (getCurrentId() === null) return;
      void saveCurrentDocument({ csvRows: rows ?? [], csvMode: mode }).catch((err: unknown) => {
        if (import.meta.env.DEV)
          console.error('[documentCsv] persistCsvToDocument save error:', err);
      });
    })
    .catch((err: unknown) => {
      if (import.meta.env.DEV)
        console.error('[documentCsv] persistCsvToDocument import error:', err);
    });
}
