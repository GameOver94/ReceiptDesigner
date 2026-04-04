<script lang="ts">
  import { EditorView } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { editorExtensions } from '$lib/codemirror/editorSetup';
  import { editorContent } from '$store/editorStore';
  import EditorToolbar from './EditorToolbar.svelte';
  import CsvDataTable from './CsvDataTable.svelte';

  // The CodeMirror EditorView instance — not reactive state, just a reference
  // We keep it in a regular `let` because we don't need Svelte to track it.
  let view: EditorView | null = null;

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
    const state = EditorState.create({
      doc: $editorContent,
      extensions: editorExtensions,
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
  // (e.g. when the user selects a different document or discards changes).
  // We need to sync the external content change into CodeMirror's state.
  //
  // Why $effect and not $derived?
  // This is a side effect — we are calling an imperative API (EditorView.setState)
  // to update an external system (CodeMirror). Side effects belong in $effect.
  //
  // Why EditorView.setState instead of view.dispatch({ changes })?
  // setState replaces the entire EditorState (document + history + selection)
  // with a fresh one. This means Ctrl+Z after switching documents cannot travel
  // back into the previous document's history — each document gets its own
  // independent undo stack. view.dispatch({ changes }) would merely append to the
  // existing history, allowing undo to bleed across documents.
  $effect(() => {
    const incoming = $editorContent;
    if (view === null) return;

    const current = view.state.doc.toString();
    // Only replace state if the content actually differs to avoid an unnecessary
    // history reset on every render cycle:
    // onChange → setContent → $editorContent changes → $effect → setState → onChange…
    if (current !== incoming) {
      view.setState(EditorState.create({ doc: incoming, extensions: editorExtensions }));
    }
  });
</script>

<!--
  Editor panel occupies the "editor" grid area.
  The CodeMirror instance fills the full height of its container via the
  EditorView theme setting height: 100% above.
-->
<section class="editor-panel" aria-label="Receipt encoder editor">
  <EditorToolbar {view} />
  <!-- CodeMirror mounts into this div via the initEditor action -->
  <div class="editor-container" use:initEditor></div>
  <!-- CSV data table — rendered below the editor when a CSV is loaded -->
  <CsvDataTable />
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
