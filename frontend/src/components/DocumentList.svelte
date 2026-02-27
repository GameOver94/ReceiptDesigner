<script lang="ts">
  import { ChevronRight, Folder as FolderIcon, MoreVertical, FolderInput } from 'lucide-svelte';
  import Button from './common/Button.svelte';
  import NameModal from './common/NameModal.svelte';
  import DeleteModal from './common/DeleteModal.svelte';
  import {
    documents,
    currentDocument,
    openScratch,
    deleteDocument,
    selectDocument,
    autoSaveIfDirty,
    renameDocument,
    renameDocumentById,
    moveDocumentToFolder,
  } from '$store/documentStore';
  import {
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    loadFolders,
  } from '$store/folderStore';
  import {
    setContent,
    setPrinterSettings,
    resetEditor,
    editorContent,
    printerSettings,
  } from '$store/editorStore';
  import type { Folder, ReceiptDocument } from '$types/index';
  // ── Search ───────────────────────────────────────────────────────────────────
  let searchQuery = $state('');

  // ── Inline error banner ──────────────────────────────────────────────────────
  // Shows above the document list when an async action (rename, delete, etc.) fails.
  let listError = $state<string | null>(null);

  // ── Kebab menu ───────────────────────────────────────────────────────────────
  // openMenu tracks which item's menu is open and which document it targets.
  type MenuKind = 'doc' | 'folder';
  interface MenuTarget {
    kind: MenuKind;
    id: string;
    // The document (only set for kind='doc') — needed to render menu items.
    doc: ReceiptDocument | null;
    folder: Folder | null;
  }
  // Fixed-position coords for the kebab menu panel.
  interface MenuPos {
    top: number;
    right: number; // distance from right edge of viewport
  }
  // Fixed-position coords for the "Move to" submenu panel.
  interface SubmenuPos {
    top: number;
    left: number; // left edge of submenu = right edge of "Move to" row + gap
  }

  let openMenu = $state<MenuTarget | null>(null);
  let menuPos = $state<MenuPos | null>(null);
  let openMoveSubmenu = $state(false);
  let submenuPos = $state<SubmenuPos | null>(null);

  // ── Folder expand/collapse state (id → expanded) ─────────────────────────────
  // userToggles holds only folders the user has explicitly toggled from their default.
  // expandedFolders merges the default (true = expanded) with user overrides.
  // Using $derived + a separate toggles record avoids the $effect-for-state-init anti-pattern:
  // $derived is a pure computation from $folders, while userToggles holds imperative overrides.
  let userToggles = $state<Record<string, boolean>>({});
  let expandedFolders = $derived(
    Object.fromEntries($folders.map((f) => [f.id, userToggles[f.id] ?? true])),
  );

  // ── NameModal state ──────────────────────────────────────────────────────────
  type ModalMode = 'doc-rename' | 'folder-create' | 'folder-rename' | null;
  let modalMode = $state<ModalMode>(null);
  let modalTitle = $state('');
  let modalInitialValue = $state('');
  let modalTarget = $state<string | null>(null);

  // ── DeleteModal state ────────────────────────────────────────────────────────
  type DeleteTarget = { kind: 'doc'; doc: ReceiptDocument } | { kind: 'folder'; folder: Folder };
  let deleteTarget = $state<DeleteTarget | null>(null);

  // ── Derived lists ────────────────────────────────────────────────────────────
  let filteredDocuments = $derived(
    $documents.filter((doc) => doc.name.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  let rootDocuments = $derived(filteredDocuments.filter((d) => d.folderId === null));

  function docsInFolder(folderId: string): ReceiptDocument[] {
    return filteredDocuments.filter((d) => d.folderId === folderId);
  }

  // ── Initialise expand state when folders load ─────────────────────────────────
  // ── Document actions ──────────────────────────────────────────────────────────

  async function handleSelectDocument(doc: ReceiptDocument): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    selectDocument(doc.id);
    setContent(doc.content);
    setPrinterSettings(doc.printerSettings);
  }

  async function handleNew(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    openScratch();
    resetEditor();
  }

  function handleDocRename(event: MouseEvent): void {
    event.stopPropagation();
    if (openMenu?.doc == null) return;
    const doc = openMenu.doc;
    closeMenu();
    modalMode = 'doc-rename';
    modalTitle = 'Rename document';
    modalInitialValue = doc.name;
    modalTarget = doc.id;
  }

  function handleDocDelete(event: MouseEvent): void {
    event.stopPropagation();
    if (openMenu?.doc == null) return;
    const doc = openMenu.doc;
    closeMenu();
    deleteTarget = { kind: 'doc', doc };
  }

  async function handleMoveToFolder(
    doc: ReceiptDocument,
    folderId: string | null,
    event: MouseEvent,
  ): Promise<void> {
    event.stopPropagation();
    closeMenu();
    await moveDocumentToFolder(doc.id, folderId);
    if (folderId !== null) {
      userToggles[folderId] = true;
    }
  }

  // ── Folder actions ─────────────────────────────────────────────────────────

  function handleNewFolder(): void {
    modalMode = 'folder-create';
    modalTitle = 'New folder';
    modalInitialValue = '';
    modalTarget = null;
  }

  function handleFolderRename(event: MouseEvent): void {
    event.stopPropagation();
    if (openMenu?.folder == null) return;
    const folder = openMenu.folder;
    closeMenu();
    modalMode = 'folder-rename';
    modalTitle = 'Rename folder';
    modalInitialValue = folder.name;
    modalTarget = folder.id;
  }

  function handleFolderDelete(event: MouseEvent): void {
    event.stopPropagation();
    if (openMenu?.folder == null) return;
    const folder = openMenu.folder;
    closeMenu();
    deleteTarget = { kind: 'folder', folder };
  }

  function toggleFolder(id: string): void {
    userToggles[id] = !(expandedFolders[id] ?? true);
  }

  // ── Modal confirm / cancel ─────────────────────────────────────────────────

  async function handleModalConfirm(name: string): Promise<void> {
    const mode = modalMode;
    const target = modalTarget;
    modalMode = null;
    modalTarget = null;
    listError = null;

    try {
      if (mode === 'doc-rename' && target !== null) {
        if ($currentDocument?.id === target) {
          await renameDocument(name);
        } else {
          await renameDocumentById(target, name);
        }
      } else if (mode === 'folder-create') {
        await createFolder(name);
      } else if (mode === 'folder-rename' && target !== null) {
        await renameFolder(target, name);
      }
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Operation failed';
      if (import.meta.env.DEV) console.error('[DocumentList] handleModalConfirm:', err);
    }
  }

  function handleModalCancel(): void {
    modalMode = null;
    modalTarget = null;
  }

  // ── Delete confirm / cancel ────────────────────────────────────────────────

  async function handleDeleteConfirm(): Promise<void> {
    const target = deleteTarget;
    deleteTarget = null;
    if (target === null) return;
    listError = null;

    try {
      if (target.kind === 'doc') {
        const wasOpen = $currentDocument?.id === target.doc.id;
        await deleteDocument(target.doc.id);
        if (wasOpen) resetEditor();
      } else {
        await deleteFolder(target.folder.id);
        // deleteFolder() refreshes documents internally (via loadDocuments()).
        // loadFolders() is still called here to remove the folder from the sidebar.
        await loadFolders();
      }
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Delete failed';
      if (import.meta.env.DEV) console.error('[DocumentList] handleDeleteConfirm:', err);
    }
  }

  function handleDeleteCancel(): void {
    deleteTarget = null;
  }

  // ── Kebab menu helpers ──────────────────────────────────────────────────────

  function closeMenu(): void {
    openMenu = null;
    menuPos = null;
    openMoveSubmenu = false;
    submenuPos = null;
  }

  function handleOpenDocMenu(doc: ReceiptDocument, event: MouseEvent): void {
    event.stopPropagation();
    // Toggle: close if already open for this doc.
    if (openMenu?.id === doc.id && openMenu.kind === 'doc') {
      closeMenu();
      return;
    }
    openMoveSubmenu = false;
    submenuPos = null;
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    menuPos = {
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    };
    openMenu = { kind: 'doc', id: doc.id, doc, folder: null };
  }

  function handleOpenFolderMenu(folder: Folder, event: MouseEvent): void {
    event.stopPropagation();
    if (openMenu?.id === folder.id && openMenu.kind === 'folder') {
      closeMenu();
      return;
    }
    openMoveSubmenu = false;
    submenuPos = null;
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    menuPos = {
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    };
    openMenu = { kind: 'folder', id: folder.id, doc: null, folder };
  }

  function handleToggleMoveSubmenu(event: MouseEvent): void {
    event.stopPropagation();
    if (openMoveSubmenu) {
      openMoveSubmenu = false;
      submenuPos = null;
      return;
    }
    // Position the submenu to the right of the "Move to" row, opening into
    // the editor area. Anchor left edge to the row's right edge.
    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    submenuPos = {
      top: rect.top,
      left: rect.right + 4,
    };
    openMoveSubmenu = true;
  }

  function handleGlobalClick(): void {
    closeMenu();
  }
</script>

<svelte:window onclick={handleGlobalClick} />

<!-- NameModal — folder create/rename and doc rename -->
{#if modalMode !== null}
  <NameModal
    title={modalTitle}
    initialValue={modalInitialValue}
    placeholder={modalMode === 'folder-create' || modalMode === 'folder-rename'
      ? 'Folder name'
      : 'Document name'}
    confirmLabel={modalMode === 'folder-create' ? 'Create' : 'Rename'}
    onconfirm={handleModalConfirm}
    oncancel={handleModalCancel}
  />
{/if}

<!-- DeleteModal — doc or folder -->
{#if deleteTarget !== null}
  <DeleteModal
    documentName={deleteTarget.kind === 'doc' ? deleteTarget.doc.name : deleteTarget.folder.name}
    onconfirm={handleDeleteConfirm}
    oncancel={handleDeleteCancel}
  />
{/if}

<aside class="document-list" aria-label="Documents">
  <div class="list-header">
    <span class="list-title">Documents</span>
    <div class="header-actions">
      <Button
        variant="ghost"
        onclick={() => {
          void handleNew();
        }}
        ariaLabel="New document"
      >
        + New
      </Button>
      <Button variant="ghost" onclick={handleNewFolder} ariaLabel="New folder">+ Folder</Button>
    </div>
  </div>

  <div class="search-wrapper">
    <input
      type="search"
      class="search-input"
      placeholder="Search documents…"
      bind:value={searchQuery}
      aria-label="Search documents"
    />
  </div>

  {#if listError !== null}
    <p class="list-error" role="alert">{listError}</p>
  {/if}

  <ul class="doc-list" role="listbox" aria-label="Document list">
    <!-- ── Folders ──────────────────────────────────────────────────────── -->
    {#each $folders as folder (folder.id)}
      {@const isExpanded = expandedFolders[folder.id] ?? true}
      {@const folderDocs = docsInFolder(folder.id)}

      {#if searchQuery === '' || folderDocs.length > 0}
        <li class="folder-item">
          <button
            class="folder-toggle"
            onclick={() => toggleFolder(folder.id)}
            aria-expanded={isExpanded}
            aria-label="{folder.name} folder, {isExpanded ? 'expanded' : 'collapsed'}"
          >
            <ChevronRight
              class="folder-chevron {isExpanded ? 'is-expanded' : ''}"
              size={12}
              aria-hidden="true"
            />
            <FolderIcon class="folder-icon" size={14} aria-hidden="true" />
            <span class="folder-name">{folder.name}</span>
          </button>

          <button
            class="kebab-btn"
            onclick={(e) => handleOpenFolderMenu(folder, e)}
            aria-label="More options for folder {folder.name}"
            aria-expanded={openMenu?.id === folder.id && openMenu.kind === 'folder'}
            aria-haspopup="menu"
            title="More options"
          >
            <MoreVertical size={14} aria-hidden="true" />
          </button>
        </li>

        {#if isExpanded}
          {#each folderDocs as doc (doc.id)}
            <li
              class="doc-item doc-item--indented"
              class:is-selected={$currentDocument?.id === doc.id}
              role="option"
              aria-selected={$currentDocument?.id === doc.id}
              onclick={() => {
                void handleSelectDocument(doc);
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void handleSelectDocument(doc);
              }}
              tabindex="0"
            >
              <div class="doc-info">
                <span class="doc-name">{doc.name}</span>
                {#if doc.isTemplate}
                  <span class="template-badge" title="This document contains placeholders"
                    >Template</span
                  >
                {/if}
              </div>
              <button
                class="kebab-btn"
                onclick={(e) => handleOpenDocMenu(doc, e)}
                aria-label="More options for {doc.name}"
                aria-expanded={openMenu?.id === doc.id && openMenu.kind === 'doc'}
                aria-haspopup="menu"
                title="More options"
              >
                <MoreVertical size={14} aria-hidden="true" />
              </button>
            </li>
          {/each}
        {/if}
      {/if}
    {/each}

    <!-- ── Root documents ────────────────────────────────────────────────── -->
    {#each rootDocuments as doc (doc.id)}
      <li
        class="doc-item"
        class:is-selected={$currentDocument?.id === doc.id}
        role="option"
        aria-selected={$currentDocument?.id === doc.id}
        onclick={() => {
          void handleSelectDocument(doc);
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') void handleSelectDocument(doc);
        }}
        tabindex="0"
      >
        <div class="doc-info">
          <span class="doc-name">{doc.name}</span>
          {#if doc.isTemplate}
            <span class="template-badge" title="This document contains placeholders">Template</span>
          {/if}
        </div>
        <button
          class="kebab-btn"
          onclick={(e) => handleOpenDocMenu(doc, e)}
          aria-label="More options for {doc.name}"
          aria-expanded={openMenu?.id === doc.id && openMenu.kind === 'doc'}
          aria-haspopup="menu"
          title="More options"
        >
          <MoreVertical size={14} aria-hidden="true" />
        </button>
      </li>
    {/each}

    {#if filteredDocuments.length === 0}
      <li class="empty-state">
        {searchQuery ? 'No documents match your search.' : 'No documents yet. Create one!'}
      </li>
    {/if}
  </ul>
</aside>

<!-- ── Fixed-position menu portal ─────────────────────────────────────────────
     Rendered outside .doc-list so overflow-y: auto on the scroll container
     cannot clip these menus. position: fixed + getBoundingClientRect coords
     place them next to the trigger regardless of scroll position. -->
{#if openMenu !== null && menuPos !== null}
  <ul
    class="kebab-menu"
    role="menu"
    aria-label="{openMenu.kind === 'folder' ? 'Folder' : 'Document'} options"
    style="top: {menuPos.top}px; right: {menuPos.right}px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') closeMenu();
    }}
  >
    {#if openMenu.kind === 'folder'}
      <li role="none">
        <button class="kebab-menu-item" role="menuitem" onclick={handleFolderRename}>
          Rename
        </button>
      </li>
      <li role="none">
        <button
          class="kebab-menu-item kebab-menu-item--danger"
          role="menuitem"
          onclick={handleFolderDelete}
        >
          Delete folder
        </button>
      </li>
    {:else if openMenu.doc !== null}
      <li role="none">
        <button class="kebab-menu-item" role="menuitem" onclick={handleDocRename}>Rename</button>
      </li>
      {#if $folders.length > 0}
        <li role="none">
          <button
            class="kebab-menu-item kebab-menu-item--has-submenu"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openMoveSubmenu}
            onclick={handleToggleMoveSubmenu}
          >
            <FolderInput size={13} aria-hidden="true" />
            Move to
            <ChevronRight size={11} class="submenu-arrow" aria-hidden="true" />
          </button>
        </li>
      {/if}
      <li role="none">
        <button
          class="kebab-menu-item kebab-menu-item--danger"
          role="menuitem"
          onclick={handleDocDelete}
        >
          Delete
        </button>
      </li>
    {/if}
  </ul>
{/if}

<!-- "Move to" submenu — also fixed-position -->
{#if openMenu !== null && openMenu.doc !== null && openMoveSubmenu && submenuPos !== null}
  {@const doc = openMenu.doc}
  <ul
    class="kebab-menu kebab-submenu-panel"
    role="menu"
    aria-label="Move to folder"
    style="top: {submenuPos.top}px; left: {submenuPos.left}px;"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        openMoveSubmenu = false;
        submenuPos = null;
      }
    }}
  >
    {#if doc.folderId !== null}
      <li role="none">
        <button
          class="kebab-menu-item"
          role="menuitem"
          onclick={(e) => {
            void handleMoveToFolder(doc, null, e);
          }}
        >
          Root (no folder)
        </button>
      </li>
    {/if}
    {#each $folders.filter((f) => f.id !== doc.folderId) as f (f.id)}
      <li role="none">
        <button
          class="kebab-menu-item"
          role="menuitem"
          onclick={(e) => {
            void handleMoveToFolder(doc, f.id, e);
          }}
        >
          {f.name}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .document-list {
    grid-area: sidebar;
    display: flex;
    flex-direction: column;
    background-color: var(--rd-color-bg-secondary);
    border-right: 1px solid var(--rd-color-border);
    overflow: hidden;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--rd-space-3);
    border-bottom: 1px solid var(--rd-color-border);
    flex-shrink: 0;
  }

  .list-title {
    font-size: var(--rd-font-base);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
  }

  .header-actions {
    display: flex;
    gap: var(--rd-space-1);
  }

  .search-wrapper {
    padding: var(--rd-space-2) var(--rd-space-3);
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-sm);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
  }

  .search-input:focus {
    outline: 2px solid var(--rd-color-accent);
    outline-offset: 1px;
  }

  .doc-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    padding: var(--rd-space-2) 0;
  }

  /* ── Folder row ─────────────────────────────────────────────────────────── */
  .folder-item {
    display: flex;
    align-items: center;
    border-left: 3px solid transparent;
    transition: background-color var(--rd-transition-fast);
    user-select: none;
  }

  .folder-item:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .folder-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    padding: var(--rd-space-2) var(--rd-space-3);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    min-width: 0;
    color: var(--rd-color-text-primary);
    font-family: inherit;
  }

  .folder-toggle :global(.folder-chevron) {
    flex-shrink: 0;
    color: var(--rd-color-text-muted);
    transition: transform var(--rd-transition-fast);
  }

  .folder-toggle :global(.folder-chevron.is-expanded) {
    transform: rotate(90deg);
  }

  .folder-toggle :global(.folder-icon) {
    flex-shrink: 0;
    color: var(--rd-color-text-secondary);
  }

  .folder-name {
    flex: 1;
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Document rows ──────────────────────────────────────────────────────── */
  .doc-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--rd-space-2) var(--rd-space-3);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
    border-left: 3px solid transparent;
  }

  .doc-item--indented {
    padding-left: calc(var(--rd-space-3) + 24px);
  }

  .doc-item:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .doc-item.is-selected {
    background-color: var(--rd-color-accent-light);
    border-left-color: var(--rd-color-accent);
  }

  .doc-info {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-1);
    min-width: 0;
  }

  .doc-name {
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .template-badge {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-placeholder);
    font-weight: var(--rd-font-weight-medium);
  }

  /* ── Kebab trigger button ───────────────────────────────────────────────── */
  .kebab-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--rd-color-text-muted);
    padding: var(--rd-space-1) var(--rd-space-2);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-base);
    line-height: 1;
    flex-shrink: 0;
    transition:
      color var(--rd-transition-fast),
      background-color var(--rd-transition-fast);
  }

  .kebab-btn:hover {
    color: var(--rd-color-text-primary);
    background-color: var(--rd-color-bg-tertiary);
  }

  /* ── Fixed-position menu panel (portal) ─────────────────────────────────── */
  .kebab-menu {
    position: fixed;
    background-color: var(--rd-color-bg-primary);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    box-shadow: var(--rd-shadow-md);
    list-style: none;
    padding: var(--rd-space-1) 0;
    min-width: 160px;
    z-index: 200;
  }

  .kebab-menu-item {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    width: 100%;
    padding: var(--rd-space-2) var(--rd-space-3);
    background: none;
    border: none;
    text-align: left;
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-primary);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .kebab-menu-item:hover {
    background-color: var(--rd-color-bg-secondary);
  }

  .kebab-menu-item--danger {
    color: var(--rd-color-error);
  }

  .kebab-menu-item--danger:hover {
    background-color: var(--rd-color-error-light);
  }

  /* "Move to" trigger — arrow pushed to the right */
  .kebab-menu-item--has-submenu :global(.submenu-arrow) {
    margin-left: auto;
    color: var(--rd-color-text-muted);
  }

  .empty-state {
    padding: var(--rd-space-4) var(--rd-space-3);
    color: var(--rd-color-text-muted);
    font-size: var(--rd-font-sm);
    text-align: center;
  }

  .list-error {
    margin: var(--rd-space-2) var(--rd-space-3);
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-sm);
    color: var(--rd-color-error);
    background-color: var(--rd-color-error-light);
    border-radius: var(--rd-radius-sm);
  }
</style>
