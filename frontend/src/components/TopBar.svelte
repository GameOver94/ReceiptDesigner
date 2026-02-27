<script lang="ts">
  import Button from './common/Button.svelte';
  import NameModal from './common/NameModal.svelte';
  import DeleteModal from './common/DeleteModal.svelte';
  import {
    currentDocument,
    isDirty,
    isScratch,
    saveAsScratch,
    saveCurrentDocument,
    renameDocument,
    deleteDocument,
    autoSaveIfDirty,
    openScratch,
    clearDirty,
  } from '../stores/documentStore';
  import {
    editorContent,
    printerSettings,
    resetEditor,
    setContent,
    setPrinterSettings,
  } from '../stores/editorStore';

  let isSaving = $state(false);
  let errorMessage = $state<string | null>(null);

  // NameModal state — reused for rename and first-save
  type ModalMode = 'save-as' | 'rename' | null;
  let modalMode = $state<ModalMode>(null);
  let modalInitialValue = $state('');

  // Delete confirmation modal state
  let showDeleteModal = $state(false);

  let hasDirtyFlag = $derived($isDirty);
  let hasDocument = $derived($currentDocument !== null);
  let isInScratch = $derived($isScratch);
  let isDemo = $derived(window.__APP_CONFIG__?.mode === 'demo');

  // Center label: scratch shows "Untitled", saved doc shows its name
  let centerLabel = $derived(
    isInScratch ? 'Untitled' : ($currentDocument?.name ?? 'No document open'),
  );
  // Whether the center label should be interactive (opens rename)
  let canRename = $derived(hasDocument && !isInScratch);

  // Open the "New" flow: auto-save if dirty, then enter scratch mode
  async function handleNew(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    openScratch();
    resetEditor();
  }

  // Open the rename modal pre-filled with the current document name
  function handleRename(): void {
    if (!canRename) return;
    modalInitialValue = $currentDocument?.name ?? '';
    modalMode = 'rename';
  }

  async function handleModalConfirm(name: string): Promise<void> {
    const mode = modalMode;
    modalMode = null;
    errorMessage = null;

    if (mode === 'save-as') {
      isSaving = true;
      try {
        await saveAsScratch(name, $editorContent, $printerSettings);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Failed to save document';
        if (import.meta.env.DEV) console.error('[TopBar] save-as error:', err);
      } finally {
        isSaving = false;
      }
    } else if (mode === 'rename') {
      isSaving = true;
      try {
        await renameDocument(name);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Rename failed';
        if (import.meta.env.DEV) console.error('[TopBar] rename error:', err);
      } finally {
        isSaving = false;
      }
    }
  }

  function handleModalCancel(): void {
    modalMode = null;
  }

  async function handleSave(): Promise<void> {
    errorMessage = null;

    // Scratch mode: open the "Save as" modal to name the document first
    if (isInScratch) {
      modalInitialValue = '';
      modalMode = 'save-as';
      return;
    }

    if (!hasDocument) return;
    isSaving = true;
    try {
      await saveCurrentDocument({
        content: $editorContent,
        printerSettings: $printerSettings,
      });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed';
      if (import.meta.env.DEV) console.error('[TopBar] save error:', err);
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete(): Promise<void> {
    if (!hasDocument || $currentDocument === null) return;
    showDeleteModal = true;
  }

  async function handleDeleteConfirm(): Promise<void> {
    if ($currentDocument === null) return;
    showDeleteModal = false;
    errorMessage = null;
    await deleteDocument($currentDocument.id);
    resetEditor();
  }

  function handleDeleteCancel(): void {
    showDeleteModal = false;
  }

  /**
   * Revert the editor to the last-saved content, discarding unsaved changes.
   * Uses setState (via setContent → $effect in Editor.svelte) which also clears
   * the CodeMirror undo history for the reverted content, so the user cannot
   * Ctrl+Z back to the discarded state.
   */
  function handleDiscard(): void {
    if ($currentDocument === null) return;
    setContent($currentDocument.content);
    setPrinterSettings($currentDocument.printerSettings);
    clearDirty();
  }
</script>

{#if modalMode !== null}
  <NameModal
    title={modalMode === 'save-as' ? 'Save document' : 'Rename document'}
    initialValue={modalInitialValue}
    placeholder="Document name"
    confirmLabel={modalMode === 'save-as' ? 'Save' : 'Rename'}
    onconfirm={handleModalConfirm}
    oncancel={handleModalCancel}
  />
{/if}

{#if showDeleteModal && $currentDocument !== null}
  <DeleteModal
    documentName={$currentDocument.name}
    onconfirm={handleDeleteConfirm}
    oncancel={handleDeleteCancel}
  />
{/if}

<header class="top-bar">
  <div class="top-bar-left">
    <span class="app-name">ReceiptDesigner</span>
    {#if isDemo}
      <span class="mode-badge" title="Running in demo mode — documents saved to localStorage">
        Demo
      </span>
    {/if}
  </div>

  <div class="top-bar-center">
    {#if canRename}
      <!--
        Clicking the document name opens the rename modal.
        The title attribute explains this affordance to keyboard/screen reader users.
      -->
      <button
        class="document-name"
        class:is-dirty={hasDirtyFlag}
        onclick={handleRename}
        title="Click to rename"
        aria-label="Rename document: {centerLabel}"
      >
        {centerLabel}{hasDirtyFlag ? ' *' : ''}
      </button>
    {:else}
      <!--
        Scratch mode or no document: non-interactive label.
        Shows "Untitled *" while typing (dirty scratch), "Untitled" otherwise.
      -->
      <span
        class="document-name-static"
        class:is-scratch={isInScratch}
        class:is-dirty={hasDirtyFlag}
      >
        {centerLabel}{isInScratch && hasDirtyFlag ? ' *' : ''}
      </span>
    {/if}
  </div>

  <nav class="top-bar-actions" aria-label="Document actions">
    <Button
      variant="ghost"
      onclick={() => {
        void handleNew();
      }}
      ariaLabel="New document"
    >
      + New
    </Button>
    <Button
      variant="primary"
      onclick={() => {
        void handleSave();
      }}
      isDisabled={!isInScratch && (!hasDocument || isSaving)}
      ariaLabel={isInScratch ? 'Save document as…' : 'Save document'}
    >
      {isSaving ? 'Saving…' : isInScratch ? 'Save as…' : 'Save'}
    </Button>
    {#if hasDirtyFlag && hasDocument && !isInScratch}
      <Button variant="ghost" onclick={handleDiscard} ariaLabel="Discard unsaved changes">
        Discard
      </Button>
    {/if}
    <Button
      variant="ghost"
      onclick={() => {
        void handleDelete();
      }}
      isDisabled={!hasDocument}
      ariaLabel="Delete document"
    >
      Delete
    </Button>
  </nav>

  {#if errorMessage !== null}
    <div class="error-banner" role="alert">
      {errorMessage}
    </div>
  {/if}
</header>

<style>
  .top-bar {
    grid-area: top-bar;
    display: flex;
    align-items: center;
    gap: var(--rd-space-4);
    padding: 0 var(--rd-space-4);
    background-color: var(--rd-color-bg-primary);
    border-bottom: 1px solid var(--rd-color-border);
    box-shadow: var(--rd-shadow-sm);
    position: relative;
    z-index: 10;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    flex-shrink: 0;
  }

  .app-name {
    font-size: var(--rd-font-lg);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
  }

  .mode-badge {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    padding: 2px var(--rd-space-2);
    background-color: var(--rd-color-accent-light);
    color: var(--rd-color-accent);
    border-radius: var(--rd-radius-full);
  }

  .top-bar-center {
    flex: 1;
    text-align: center;
  }

  /* Clickable rename button — looks like plain text but responds on hover */
  .document-name {
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--rd-space-1) var(--rd-space-2);
    border-radius: var(--rd-radius-sm);
    transition: background-color var(--rd-transition-fast);
  }

  .document-name:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .document-name.is-dirty {
    color: var(--rd-color-warning);
  }

  /* Non-interactive name (scratch or no document) */
  .document-name-static {
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-muted);
  }

  /* Scratch mode: italic to visually distinguish from a saved document */
  .document-name-static.is-scratch {
    font-style: italic;
  }

  .document-name-static.is-dirty {
    color: var(--rd-color-warning);
  }

  .top-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    flex-shrink: 0;
  }

  .error-banner {
    position: absolute;
    bottom: calc(-1 * var(--rd-topbar-height));
    left: 50%;
    transform: translateX(-50%);
    padding: var(--rd-space-2) var(--rd-space-4);
    background-color: var(--rd-color-error-light);
    color: var(--rd-color-error);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    white-space: nowrap;
    z-index: 20;
  }
</style>
