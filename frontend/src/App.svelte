<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './components/TopBar.svelte';
  import DocumentList from './components/DocumentList.svelte';
  import Editor from './components/Editor.svelte';
  import Preview from './components/Preview.svelte';
  import PrinterPanel from './components/PrinterPanel.svelte';
  import ExportButtons from './components/ExportButtons.svelte';
  import { loadDocuments, selectDocument, openScratch, documents } from './stores/documentStore';
  import { loadFolders } from './stores/folderStore';
  import { setContent, setPrinterSettings } from './stores/editorStore';
  import { get } from 'svelte/store';

  // $state() tracks whether the initial document load has completed.
  // Used to show a loading indicator before the document list is ready.
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);

  // onMount runs after the component is first rendered to the DOM.
  // We load documents here (not at module level) because:
  // 1. The storage adapter must be initialised before we call loadDocuments.
  // 2. onMount only runs in the browser, not during SSR (though this app has no SSR).
  onMount(() => {
    void (async () => {
      try {
        await loadDocuments();
        await loadFolders();

        // After loading, pick up where the user left off:
        // - If saved documents exist, select the most recent one and load it.
        // - If nothing is saved yet, open a blank scratch buffer.
        const docs = get(documents);

        if (docs.length > 0) {
          // Select the most recently modified document and populate the editor.
          // Sort descending by updatedAt so docs.at(0) is the latest regardless
          // of insertion order (LocalStorageAdapter returns in creation order).
          const sorted = [...docs].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          const last = sorted.at(0);
          if (last !== undefined) {
            selectDocument(last.id);
            setContent(last.content);
            setPrinterSettings(last.printerSettings);
          }
        } else {
          openScratch();
        }
      } catch (err) {
        loadError = err instanceof Error ? err.message : 'Failed to load documents';
        if (import.meta.env.DEV) console.error('[App] onMount load error:', err);
      } finally {
        isLoading = false;
      }
    })();
  });
</script>

<!--
  App root — the CSS Grid defined in global.css divides the viewport into
  four named areas: top-bar, sidebar, editor, preview, printer.
  Each child component is placed in its area via the corresponding grid-area CSS rule.

  Why CSS Grid for this layout?
  The app has two dimensions: rows (top-bar + main area) and columns (four panels).
  CSS Grid is the right tool for two-dimensional layouts. Flexbox would require
  nesting and would make resizing panels harder. See docs/coding-style.md §5.3.
-->
<TopBar />
<DocumentList />

{#if isLoading}
  <div class="loading-overlay" role="status" aria-label="Loading documents">
    <span>Loading…</span>
  </div>
{:else if loadError !== null}
  <div class="load-error" role="alert">
    <p>Failed to load documents: {loadError}</p>
  </div>
{:else}
  <Editor />
{/if}

<Preview />

<div class="printer-column">
  <PrinterPanel />
  <div class="export-area">
    <ExportButtons />
  </div>
</div>

<style>
  /* Loading overlay spans the editor area while documents are being fetched */
  .loading-overlay {
    grid-area: editor;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--rd-color-text-muted);
    font-size: var(--rd-font-base);
    background-color: var(--rd-color-bg-primary);
    border-right: 1px solid var(--rd-color-border);
  }

  .load-error {
    grid-area: editor;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--rd-space-4);
    color: var(--rd-color-error);
    font-size: var(--rd-font-base);
    background-color: var(--rd-color-bg-primary);
    border-right: 1px solid var(--rd-color-border);
  }

  /* Printer column wraps the PrinterPanel and ExportButtons in the printer grid area */
  .printer-column {
    grid-area: printer;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--rd-color-border);
    background-color: var(--rd-color-bg-secondary);
  }

  /* PrinterPanel takes up the main space; export buttons sit at the bottom */
  .printer-column :global(.printer-panel) {
    flex: 1;
    overflow: hidden;
    border-left: none; /* border handled by .printer-column */
  }

  .export-area {
    padding: var(--rd-space-3) var(--rd-space-4);
    border-top: 1px solid var(--rd-color-border);
    flex-shrink: 0;
  }
</style>
