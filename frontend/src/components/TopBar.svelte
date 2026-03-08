<script lang="ts">
  import Button from './common/Button.svelte';
  import NameModal from './common/NameModal.svelte';
  import DeleteModal from './common/DeleteModal.svelte';
  import PlaceholderMetaEditor from './PlaceholderMetaEditor.svelte';
  import {
    currentDocument,
    isDirty,
    isScratch,
    clearDirty,
    saveCurrentDocument,
  } from '$store/documentStore';
  import { editorContent, printerSettings } from '$store/editorStore';
  import {
    detectedPlaceholders,
    csvRows,
    csvMode,
    isPlaceholderMetaEditorOpen,
    openMetaEditor,
    closeMetaEditor,
  } from '$store/placeholderStore';
  import { print, printBatch } from '$lib/printing';
  import { doNew, doSaveAs, doRename, doSave, doDelete, doRevert } from '$lib/topBarActions';
  import { isTemplate } from '$lib/variables';
  import { resolveContent } from '$lib/pipeline';
  import type { PlaceholderMeta } from '$types/index';

  let isSaving = $state(false);
  let errorMessage = $state<string | null>(null);
  let printStatusMessage = $state<string | null>(null);
  // Plain let — not reactive; $state() here would cause unnecessary re-renders
  // on every setTimeout/clearTimeout call.
  let _printStatusTimer: ReturnType<typeof setTimeout> | null = null;

  // Cancel any pending status-banner timer when the component is destroyed.
  $effect(() => () => {
    if (_printStatusTimer !== null) clearTimeout(_printStatusTimer);
  });

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

  /**
   * Whether the current document is a template (content contains {{}}).
   * Derived from the live editor content rather than the saved document so the
   * placeholder buttons appear/disappear as the user types.
   */
  let currentIsTemplate = $derived(isTemplate($editorContent));

  // Center label: scratch shows "Untitled", saved doc shows its name
  let centerLabel = $derived(
    isInScratch ? 'Untitled' : ($currentDocument?.name ?? 'No document open'),
  );
  // Whether the center label should be interactive (opens rename)
  let canRename = $derived(hasDocument && !isInScratch);

  // Current document's placeholder meta (empty array when none selected)
  let currentMeta = $derived($currentDocument?.placeholderMeta ?? []);

  // ---------------------------------------------------------------------------
  // Document action handlers
  // ---------------------------------------------------------------------------

  async function handleNew(): Promise<void> {
    await doNew($editorContent, $printerSettings);
  }

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
        await doSaveAs(name, $editorContent, $printerSettings);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Failed to save document';
        if (import.meta.env.DEV) console.error('[TopBar] save-as error:', err);
      } finally {
        isSaving = false;
      }
    } else if (mode === 'rename') {
      isSaving = true;
      try {
        await doRename(name);
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
      await doSave($editorContent, $printerSettings);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Save failed';
      if (import.meta.env.DEV) console.error('[TopBar] save error:', err);
    } finally {
      isSaving = false;
    }
  }

  function handleDelete(): void {
    if (!hasDocument || $currentDocument === null) return;
    showDeleteModal = true;
  }

  async function handleDeleteConfirm(): Promise<void> {
    if ($currentDocument === null) return;
    showDeleteModal = false;
    errorMessage = null;
    await doDelete($currentDocument.id);
  }

  function handleDeleteCancel(): void {
    showDeleteModal = false;
  }

  /**
   * Revert the editor to the last-saved content, discarding unsaved changes.
   */
  function handleDiscard(): void {
    if ($currentDocument === null) return;
    doRevert($currentDocument.content, $currentDocument.printerSettings);
    clearDirty();
  }

  // ---------------------------------------------------------------------------
  // Placeholder system handlers
  // ---------------------------------------------------------------------------

  /**
   * "Fill & Print" — resolves placeholders via the unified pipeline and prints.
   *
   * - batch mode CSV: prints one receipt per CSV row (all rows), using each
   *   row's columns as scalar values.
   * - line-item mode CSV: prints one receipt with all rows as {{#items}} block.
   * - no CSV: resolves defaultValues from Edit Fields (scalar only).
   */
  async function handleFillAndPrint(): Promise<void> {
    const content = $editorContent;
    const mode = $csvMode;
    const rows = $csvRows;

    // Build meta-default scalar overrides (used by line-item and no-CSV paths).
    const defaultScalars: Record<string, string> = {};
    for (const name of $detectedPlaceholders) {
      const metaEntry = currentMeta.find((m) => m.name === name);
      if (metaEntry?.defaultValue !== undefined && metaEntry.defaultValue !== '') {
        defaultScalars[name] = metaEntry.defaultValue;
      }
    }

    if (mode === 'batch' && rows.length > 0) {
      // One receipt per CSV row — resolveContent returns all rows as an array.
      const resolved = resolveContent(content, rows, mode, 0, false, defaultScalars);
      const jobs = resolved.map((c) => ({ content: c, settings: $printerSettings }));
      printStatusMessage = null;
      try {
        const results = await printBatch(jobs);
        const failed = results.find((r) => r.status !== 'success');
        if (failed !== undefined) {
          printStatusMessage = failed.message ?? 'Batch print failed.';
        } else {
          printStatusMessage = `Printed ${String(results.length)} receipt(s).`;
        }
      } catch (err) {
        printStatusMessage = err instanceof Error ? err.message : 'Print failed.';
        if (import.meta.env.DEV) console.error('[TopBar] batch print error:', err);
      }
      clearTimeout(_printStatusTimer ?? undefined);
      _printStatusTimer = setTimeout(() => {
        printStatusMessage = null;
      }, 8000);
      return;
    }

    // Line-item mode or no CSV: resolveContent returns a single resolved string.
    const [resolved = content] = resolveContent(content, rows, mode, 0, false, defaultScalars);
    await _doPrint(resolved);
  }

  /**
   * Plain "Print" for non-template documents — prints the current editor content
   * directly without any placeholder resolution.
   */
  async function handlePrint(): Promise<void> {
    await _doPrint($editorContent);
  }

  /**
   * Shared print dispatch: generate ESC/POS and send to printer.
   * Shows a status banner for 8 s on success or error.
   */
  async function _doPrint(content: string): Promise<void> {
    printStatusMessage = null;
    try {
      const result = await print(content, $printerSettings);
      if (result.status === 'success') {
        printStatusMessage = 'Sent to printer.';
      } else {
        printStatusMessage = result.message ?? 'Print failed.';
      }
    } catch (err) {
      printStatusMessage = err instanceof Error ? err.message : 'Print failed.';
      if (import.meta.env.DEV) console.error('[TopBar] print error:', err);
    }
    clearTimeout(_printStatusTimer ?? undefined);
    _printStatusTimer = setTimeout(() => {
      printStatusMessage = null;
    }, 8000);
  }

  /**
   * Called by PlaceholderMetaEditor when the user saves updated field metadata.
   * Persists the updated meta to the current document via documentStore.
   */
  async function handleMetaSave(updatedMeta: PlaceholderMeta[]): Promise<void> {
    closeMetaEditor();
    try {
      await saveCurrentDocument({ placeholderMeta: updatedMeta });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to save field metadata';
      if (import.meta.env.DEV) console.error('[TopBar] meta save error:', err);
    }
  }
</script>

<!-- ─── Modals (rendered outside the header so they overlay the whole page) ─── -->

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

{#if $isPlaceholderMetaEditorOpen}
  <PlaceholderMetaEditor
    placeholders={$detectedPlaceholders}
    meta={currentMeta}
    onsave={handleMetaSave}
    oncancel={closeMetaEditor}
  />
{/if}

<!-- ─── Top bar ─────────────────────────────────────────────────────────────── -->

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

    <!--
      Template badge: shown when the current editor content contains {{...}}.
      Derives from live editor content so it appears/disappears without saving.
    -->
    {#if currentIsTemplate}
      <span class="template-badge" title="This document contains placeholder fields">
        Template
      </span>
    {/if}
  </div>

  <nav class="top-bar-actions" aria-label="Document actions">
    <!-- Standard document actions -->
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
      onclick={handleDelete}
      isDisabled={!hasDocument}
      ariaLabel="Delete document"
    >
      Delete
    </Button>

    <!-- ── Print actions ─────────────────────────────────────────────────── -->
    <div class="actions-divider" aria-hidden="true"></div>

    {#if currentIsTemplate}
      <!-- Template: show Fill & Print + Edit Fields -->
      <Button
        variant="primary"
        onclick={() => {
          void handleFillAndPrint();
        }}
        isDisabled={isInScratch}
        ariaLabel={isInScratch
          ? 'Save document before filling placeholders'
          : 'Fill in template fields and print'}
      >
        Fill &amp; Print
      </Button>

      <Button
        variant="ghost"
        onclick={openMetaEditor}
        isDisabled={isInScratch}
        ariaLabel={isInScratch
          ? 'Save document before editing fields'
          : 'Edit template field definitions'}
      >
        Edit Fields
      </Button>
    {:else}
      <!-- Non-template: plain Print button -->
      <Button
        variant="primary"
        onclick={() => {
          void handlePrint();
        }}
        isDisabled={!hasDocument}
        ariaLabel="Print document"
      >
        Print
      </Button>
    {/if}
  </nav>

  {#if errorMessage !== null}
    <div class="error-banner" role="alert">
      {errorMessage}
    </div>
  {/if}

  {#if printStatusMessage !== null}
    <div class="status-banner" role="status">
      {printStatusMessage}
      <button
        class="banner-dismiss"
        onclick={() => {
          printStatusMessage = null;
        }}
        aria-label="Dismiss">✕</button
      >
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
    z-index: var(--rd-z-topbar);
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
    padding: var(--rd-space-px) var(--rd-space-2);
    background-color: var(--rd-color-accent-light);
    color: var(--rd-color-accent);
    border-radius: var(--rd-radius-full);
  }

  .top-bar-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--rd-space-2);
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

  /*
   * Amber pill badge indicating the current document is a template.
   * Uses the placeholder colour token to reinforce the visual language
   * of {{...}} highlighting in the editor.
   */
  .template-badge {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    padding: var(--rd-space-px) var(--rd-space-2);
    background-color: var(--rd-color-placeholder-bg);
    color: var(--rd-color-placeholder);
    border-radius: var(--rd-radius-full);
    flex-shrink: 0;
  }

  .top-bar-actions {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    flex-shrink: 0;
  }

  /* Visual separator between standard actions and placeholder actions */
  .actions-divider {
    width: 1px;
    height: var(--rd-space-4);
    background-color: var(--rd-color-border-strong);
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
    z-index: var(--rd-z-banner);
  }

  .status-banner {
    position: absolute;
    bottom: calc(-1 * var(--rd-topbar-height));
    left: 50%;
    transform: translateX(-50%);
    padding: var(--rd-space-2) var(--rd-space-4);
    background-color: var(--rd-color-accent-light);
    color: var(--rd-color-accent);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    white-space: nowrap;
    z-index: var(--rd-z-banner);
    display: flex;
    align-items: center;
    gap: var(--rd-space-3);
  }

  .banner-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--rd-font-sm);
    color: inherit;
    padding: 0;
    line-height: 1;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .banner-dismiss:hover {
    opacity: 1;
  }
</style>
