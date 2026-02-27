/**
 * editorSetup.ts — CodeMirror extension list for the ReceiptLine editor.
 *
 * Extracted here so that Editor.svelte stays under the ~80-line <script> guideline
 * and so that the extension list can be imported in both `initEditor` (initial mount)
 * and `EditorView.setState` (document switch) without duplication.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { receiptLineSyntax } from './receiptLineSyntax';
import { placeholderHighlight } from './placeholderHighlight';
import { setContent } from '$store/editorStore';
import { markDirty } from '$store/documentStore';
import type { Extension } from '@codemirror/state';

/**
 * The full extension list for the ReceiptLine editor.
 *
 * Must be a stable reference — `EditorView.setState` is called with the same
 * array on document switch, so recreating the array on every call would break
 * extension identity and could cause duplicate listeners.
 */
export const editorExtensions: Extension[] = [
  // Line numbers in the gutter — useful for debugging ReceiptLine syntax
  lineNumbers(),
  highlightActiveLineGutter(),

  // Undo/redo history — users expect Ctrl+Z to work in a text editor
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),

  // ReceiptLine syntax highlighting (pipes, properties, separators)
  receiptLineSyntax,
  syntaxHighlighting(defaultHighlightStyle),

  // Placeholder tag highlighting — marks {{...}} regions amber
  placeholderHighlight,

  // Wrap long lines so the user never has to scroll horizontally
  EditorView.lineWrapping,

  // Listen for document changes and sync to editorStore
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const newContent = update.state.doc.toString();
      // setContent updates the store so the Preview component re-renders.
      // setState (used in Editor.svelte's $effect) bypasses the update listener, so
      // this callback only fires for genuine user-initiated keystrokes — there
      // is no risk of calling markDirty() when loading a different document.
      setContent(newContent);
      markDirty();
    }
  }),

  // Base editor theme — minimal styling; most visual styling comes from tokens.css
  EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px',
      fontFamily: 'var(--rd-font-mono)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--rd-font-mono)',
    },
    '.cm-content': {
      caretColor: 'var(--rd-color-text-primary)',
    },
  }),
];
