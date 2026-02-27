<script lang="ts">
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
  // EditorView.lineWrapping is a built-in extension — no extra package needed.
  import { EditorState, Annotation } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
  import { receiptLineSyntax } from '$lib/codemirror/receiptLineSyntax';
  import { placeholderHighlight } from '$lib/codemirror/placeholderHighlight';
  import { editorContent, setContent } from '$store/editorStore';
  import { markDirty } from '$store/documentStore';

  // The CodeMirror EditorView instance — not reactive state, just a reference
  // We keep it in a regular `let` because we don't need Svelte to track it.
  let view: EditorView | null = null;

  /**
   * Annotation used to mark programmatic dispatches (e.g. loading a new document).
   * When the updateListener sees this annotation, it skips markDirty() so that
   * switching documents does not immediately flag the new document as modified.
   */
  const programmaticChange = Annotation.define<boolean>();

  /**
   * Svelte action: initialise CodeMirror on a DOM element.
   *
   * Why a Svelte action (use:) instead of onMount?
   * An action receives the element as an argument, which is cleaner than
   * querying the DOM manually. It also provides a cleanup function (destroy)
   * that runs when the element is removed from the DOM. See Svelte docs on actions.
   *
   * The action pattern is: function(node, params?) => { destroy() }
   */
  function initEditor(node: HTMLElement): { destroy(): void } {
    const startContent = $editorContent;

    // Build the CodeMirror state with our extensions
    const state = EditorState.create({
      doc: startContent,
      extensions: [
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
            // setContent updates the store so the Preview component re-renders
            setContent(newContent);
            // Only mark dirty for user-initiated changes, not programmatic ones
            // (e.g. loading a different document via setContent from DocumentList).
            const isProgrammatic = update.transactions.some(
              (tr) => tr.annotation(programmaticChange) === true,
            );
            if (!isProgrammatic) {
              markDirty();
            }
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
      ],
    });

    view = new EditorView({ state, parent: node });

    return {
      destroy() {
        // Clean up the CodeMirror instance when the component unmounts.
        // Without this, the editor would leak event listeners and DOM nodes.
        view?.destroy();
        view = null;
      },
    };
  }

  // $effect runs when the editorContent store changes from outside the editor
  // (e.g. when the user selects a different document from the DocumentList).
  // We need to sync the external content change into CodeMirror's document.
  //
  // Why $effect and not $derived?
  // This is a side effect — we are calling an imperative API (EditorView.dispatch)
  // to update an external system (CodeMirror). Side effects belong in $effect.
  $effect(() => {
    const incoming = $editorContent;
    if (view === null) return;

    const current = view.state.doc.toString();
    // Only dispatch if the content actually differs to avoid an infinite update loop:
    // onChange → setContent → $editorContent changes → $effect → dispatch → onChange…
    if (current !== incoming) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: incoming },
        // Mark as programmatic so the updateListener does not call markDirty()
        annotations: programmaticChange.of(true),
      });
    }
  });
</script>

<!--
  Editor panel occupies the "editor" grid area.
  The CodeMirror instance fills the full height of its container via the
  EditorView theme setting height: 100% above.
-->
<section class="editor-panel" aria-label="ReceiptLine editor">
  <div class="editor-toolbar">
    <span class="toolbar-label">ReceiptLine Editor</span>
  </div>
  <!-- CodeMirror mounts into this div via the initEditor action -->
  <div class="editor-container" use:initEditor></div>
</section>

<style>
  .editor-panel {
    grid-area: editor;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--rd-color-border);
    background-color: var(--rd-color-bg-primary);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    padding: var(--rd-space-2) var(--rd-space-3);
    border-bottom: 1px solid var(--rd-color-border);
    background-color: var(--rd-color-bg-secondary);
    flex-shrink: 0;
  }

  .toolbar-label {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
    font-weight: var(--rd-font-weight-medium);
  }

  /* editor-container fills the remaining height in the flex column */
  .editor-container {
    flex: 1;
    overflow: hidden;
    /* CodeMirror's own scroller handles overflow inside */
  }

  /* Make the CodeMirror editor fill its container.
     :global() is required because CodeMirror generates its DOM outside
     Svelte's scoped style system — scoped selectors would not match. */
  :global(.editor-container .cm-editor) {
    height: 100%;
  }

  :global(.editor-container .cm-scroller) {
    height: 100%;
  }
</style>
