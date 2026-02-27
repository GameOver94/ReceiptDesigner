import { StateField } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Transaction } from '@codemirror/state';

/**
 * placeholderHighlight.ts — CodeMirror extension that marks {{...}} and
 * {{#...}}...{{/...}} regions with a CSS class so they are visually distinct.
 *
 * Why a StateField rather than a ViewPlugin?
 * StateField is the correct choice when the decorations depend only on document
 * content (not viewport). It is computed once per transaction and cached, whereas
 * a ViewPlugin would recompute on every view update (including scroll). For
 * decorations derived from document text, StateField is more efficient.
 *
 * The CSS class `cm-placeholder-tag` is defined in styles/global.css so it
 * inherits the --rd-color-placeholder token. We use a global style because
 * CodeMirror renders its DOM outside of Svelte's scoped style system.
 */

// The decoration applied to {{...}} spans
const placeholderMark = Decoration.mark({
  class: 'cm-placeholder-tag',
});

// Regex that matches any {{ ... }} expression (scalar or block open/close tags)
// Non-greedy .*? ensures we match the shortest possible {{...}} on a line
const PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;

/**
 * Build decorations by scanning the full document string.
 * Used by the StateField update path where we only have the document text,
 * not an EditorView.
 */
function buildDecorationsFromDoc(docText: string): DecorationSet {
  const decorations: ReturnType<typeof placeholderMark.range>[] = [];
  let match: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(docText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    decorations.push(placeholderMark.range(start, end));
  }
  return Decoration.set(decorations, true);
}

/**
 * StateField that manages the placeholder decoration set.
 *
 * The field is recomputed on every transaction that changes the document.
 * On other transactions (cursor moves, selection changes) it maps the existing
 * decorations through the changes to avoid a full recompute.
 */
export const placeholderHighlight = StateField.define<DecorationSet>({
  create(_state) {
    // Return empty on initial load. The first transaction with docChanged === true
    // will immediately call update() and populate the decorations via
    // buildDecorationsFromDoc. This avoids needing an EditorView reference here,
    // which StateField.create does not provide.
    return Decoration.none;
  },

  update(decorations: DecorationSet, tr: Transaction): DecorationSet {
    // If the document changed, rebuild decorations from scratch.
    // If only the selection/cursor changed, map existing decorations through
    // the change set (much cheaper than a full rescan).
    if (tr.docChanged) {
      return buildDecorationsFromDoc(tr.newDoc.toString());
    }
    return decorations.map(tr.changes);
  },

  // Tell CodeMirror that this field provides decorations for the editor view.
  provide: (f) => EditorView.decorations.from(f),
});
