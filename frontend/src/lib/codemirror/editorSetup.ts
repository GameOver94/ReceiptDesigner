/**
 * editorSetup.ts — CodeMirror extension list for the JavaScript encoder editor.
 *
 * Extracted here so that Editor.svelte stays under the ~80-line <script> guideline
 * and so that the extension list can be imported in both `initEditor` (initial mount)
 * and `EditorView.setState` (document switch) without duplication.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { javascriptSyntax } from './javascriptSyntax';
import { placeholderHighlight } from './placeholderHighlight';
import { base64FoldingExtensions } from './base64Folding';
import { setContent } from '$store/editorStore';
import { markDirty } from '$store/documentStore';
import type { Extension } from '@codemirror/state';

/**
 * The full extension list for the JavaScript encoder editor.
 *
 * Must be a stable reference — `EditorView.setState` is called with the same
 * array on document switch, so recreating the array on every call would break
 * extension identity and could cause duplicate listeners.
 */
export const editorExtensions: Extension[] = [
  // Line numbers in the gutter — useful for debugging encoder JS code
  lineNumbers(),
  highlightActiveLineGutter(),

  // Undo/redo history — users expect Ctrl+Z to work in a text editor
  history(),
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),

  // JavaScript syntax highlighting for encoder code
  javascriptSyntax,
  syntaxHighlighting(defaultHighlightStyle),
  ...base64FoldingExtensions,

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

  // Base editor theme — maps CodeMirror internals to --rd-* tokens so the
  // editor follows the active Material theme. CodeMirror generates its own DOM
  // outside Svelte's scoped style system, so these must be set here via
  // EditorView.theme rather than in a component <style> block.
  EditorView.theme({
    // Root — background and font
    '&': {
      height: '100%',
      fontSize: 'var(--rd-font-sm)',
      fontFamily: 'var(--rd-font-mono)',
      backgroundColor: 'var(--rd-color-bg-primary)',
      color: 'var(--rd-color-text-primary)',
    },
    // Scroll container
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--rd-font-mono)',
    },
    // Editable content area
    '.cm-content': {
      caretColor: 'var(--rd-color-text-primary)',
    },
    // Gutter (line numbers column)
    '.cm-gutters': {
      backgroundColor: 'var(--rd-color-bg-secondary)',
      color: 'var(--rd-color-text-muted)',
      borderRight: '1px solid var(--rd-color-border)',
    },
    '.cm-gutterElement': {
      color: 'var(--rd-color-text-muted)',
    },
    // Active line highlight
    '.cm-activeLine': {
      backgroundColor: 'var(--rd-color-surface-container)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--rd-color-bg-tertiary)',
      color: 'var(--rd-color-text-secondary)',
    },
    // Selection
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--rd-color-primary-container)',
    },
    // Cursor
    '.cm-cursor': {
      borderLeftColor: 'var(--rd-color-text-primary)',
    },
    // Placeholder highlight classes — explicit color mapping here ensures they
    // stay distinct even when nested inside language tokens (e.g. JS strings).
    '& .cm-content .cm-placeholder-tag': {
      color: 'var(--rd-color-placeholder)',
      fontWeight: 'var(--rd-font-weight-medium)',
    },
    '& .cm-content .cm-placeholder-tag span': {
      color: 'var(--rd-color-placeholder)',
      fontWeight: 'var(--rd-font-weight-medium)',
    },
    '.cm-placeholder-invalid': {
      color: 'var(--rd-color-error)',
    },
  }),
];
