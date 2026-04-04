import { StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
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

const placeholderTagMark = Decoration.mark({ class: 'cm-placeholder-tag' });
const placeholderBraceMark = Decoration.mark({ class: 'cm-placeholder-brace' });
const placeholderNameMark = Decoration.mark({ class: 'cm-placeholder-name' });
const placeholderBlockOpenMark = Decoration.mark({ class: 'cm-placeholder-block-open' });
const placeholderBlockCloseMark = Decoration.mark({ class: 'cm-placeholder-block-close' });
const placeholderSigilMark = Decoration.mark({ class: 'cm-placeholder-sigil' });
const placeholderInvalidMark = Decoration.mark({ class: 'cm-placeholder-invalid' });

// Regex that matches any {{ ... }} expression (scalar or block open/close tags)
// Non-greedy .*? ensures we match the shortest possible {{...}} on a line
const PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;

/**
 * Build decorations by scanning the full document string.
 * Used by the StateField update path where we only have the document text,
 * not an EditorView.
 */
function buildDecorationsFromDoc(docText: string): DecorationSet {
  const decorations: ReturnType<typeof placeholderTagMark.range>[] = [];
  let match: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;

  const addRange = (mark: Decoration, from: number, to: number): void => {
    if (to > from) {
      decorations.push(mark.range(from, to));
    }
  };

  while ((match = PLACEHOLDER_RE.exec(docText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const innerStart = start + 2;
    const innerEnd = end - 2;
    const inner = docText.slice(innerStart, innerEnd);
    const trimmed = inner.trim();

    addRange(placeholderTagMark, start, end);
    addRange(placeholderBraceMark, start, start + 2);
    addRange(placeholderBraceMark, end - 2, end);

    if (trimmed.length === 0) {
      addRange(placeholderInvalidMark, innerStart, innerEnd);
      continue;
    }

    const leadingWhitespace = inner.length - inner.trimStart().length;
    const trailingWhitespace = inner.length - inner.trimEnd().length;
    const trimmedStart = innerStart + leadingWhitespace;
    const trimmedEnd = innerEnd - trailingWhitespace;

    if (trimmed.startsWith('#')) {
      addRange(placeholderBlockOpenMark, trimmedStart, trimmedEnd);
      addRange(placeholderSigilMark, trimmedStart, trimmedStart + 1);
      addRange(placeholderNameMark, trimmedStart + 1, trimmedEnd);
      continue;
    }

    if (trimmed.startsWith('/')) {
      addRange(placeholderBlockCloseMark, trimmedStart, trimmedEnd);
      addRange(placeholderSigilMark, trimmedStart, trimmedStart + 1);
      addRange(placeholderNameMark, trimmedStart + 1, trimmedEnd);
      continue;
    }

    addRange(placeholderNameMark, trimmedStart, trimmedEnd);
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
  create(state) {
    // Build decorations immediately from the initial document so placeholders are
    // highlighted as soon as a document is loaded (before the first edit).
    return buildDecorationsFromDoc(state.doc.toString());
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
