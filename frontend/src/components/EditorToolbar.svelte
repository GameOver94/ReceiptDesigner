<script lang="ts">
  import { redo, undo } from '@codemirror/commands';
  import {
    AlignLeft,
    Barcode,
    Bell,
    Bold,
    Braces,
    CornerDownLeft,
    Image,
    Italic,
    Languages,
    Minus,
    Pilcrow,
    Power,
    QrCode,
    Redo,
    Scissors,
    Square,
    Table,
    Text,
    Type,
    Underline,
    Undo,
  } from 'lucide-svelte';
  import ImageBase64Modal from './ImageBase64Modal.svelte';
  import { getCommandDocsUrl, insertSnippet, insertSnippetWithAutoFold, toolbarGroups } from '$lib/editorToolbar';
  import type { EditorToolbarCommand } from '$lib/editorToolbar';
  import type { EditorView } from '@codemirror/view';
  import type { Component } from 'svelte';

  const commandIcons: Record<string, Component | undefined> = {
    Type,
    Underline,
    Bold,
    Italic,
    AlignLeft,
    CornerDownLeft,
    Pilcrow,
    Text,
    Minus,
    Square,
    Table,
    Power,
    Languages,
    Barcode,
    QrCode,
    Image,
    Scissors,
    Bell,
    Braces,
  };

  let { view } = $props<{ view: EditorView | null }>();
  let hoveredCommand = $state<string | null>(null);
  let closeMenuTimer: ReturnType<typeof setTimeout> | null = null;
  let showImageBase64Modal = $state(false);

  function handleUndo(): void {
    if (view === null) return;
    undo(view);
  }

  function handleRedo(): void {
    if (view === null) return;
    redo(view);
  }

  function handleInsert(snippet: string): void {
    if (view === null) return;
    insertSnippet(view, snippet);
  }

  function handleCommandClick(command: EditorToolbarCommand): void {
    if (command.id === 'image-base64') {
      showImageBase64Modal = true;
      return;
    }

    handleInsert(command.snippet);
  }

  function handleHoverStart(commandId: string): void {
    if (closeMenuTimer !== null) {
      clearTimeout(closeMenuTimer);
      closeMenuTimer = null;
    }
    hoveredCommand = commandId;
  }

  function handleHoverEnd(commandId: string): void {
    if (hoveredCommand !== commandId) return;

    closeMenuTimer = setTimeout(() => {
      if (hoveredCommand === commandId) {
        hoveredCommand = null;
      }
      closeMenuTimer = null;
    }, 160);
  }

  function getIcon(command: EditorToolbarCommand): Component | undefined {
    if (command.icon === undefined) return undefined;
    return commandIcons[command.icon];
  }

  function commandAriaLabel(command: EditorToolbarCommand): string {
    return `Insert ${command.label} command`;
  }

  function handleModalInsert(snippet: string): void {
    if (view === null) return;

    insertSnippetWithAutoFold(view, snippet);
    showImageBase64Modal = false;
  }

  function handleModalCancel(): void {
    showImageBase64Modal = false;
  }
</script>

<div class="editor-toolbar">
  <div class="toolbar-header">
    <span class="toolbar-label">Encoder</span>
    <div class="history-actions" role="group" aria-label="Edit history">
      <button type="button" class="toolbar-btn history-btn" onclick={handleUndo} aria-label="Undo">
        <Undo size={14} aria-hidden="true" />
      </button>
      <button type="button" class="toolbar-btn history-btn" onclick={handleRedo} aria-label="Redo">
        <Redo size={14} aria-hidden="true" />
      </button>
    </div>
  </div>

  <div class="toolbar-groups" role="group" aria-label="Encoder commands">
    {#each toolbarGroups as group (group.id)}
      <div class="command-group">
        <span class="group-label">{group.label}</span>
        <div class="command-list">
          {#each group.commands as command (command.id)}
            {@const Icon = getIcon(command)}
            <div
              class="command-item"
              onmouseenter={() => handleHoverStart(command.id)}
              onmouseleave={() => handleHoverEnd(command.id)}
              onfocusin={() => handleHoverStart(command.id)}
              onfocusout={() => handleHoverEnd(command.id)}
            >
              <button
                type="button"
                class="toolbar-btn command-btn"
                onclick={() => handleCommandClick(command)}
                aria-label={commandAriaLabel(command)}
              >
                {#if Icon}
                  <Icon size={14} aria-hidden="true" />
                {/if}
                <span>{command.label}</span>
              </button>

              {#if hoveredCommand === command.id}
                <div class="hover-menu" role="dialog" aria-label={`${command.label} command details`}>
                  <div class="menu-preview">
                    <span class="menu-title">Preview</span>
                    <code>{command.preview}</code>
                  </div>

                  <div class="menu-variations">
                    <span class="menu-title">Variations</span>
                    <div class="variation-list">
                      {#each command.variations as variation (variation.label)}
                        <button
                          type="button"
                          class="variation-btn"
                          onclick={() => handleInsert(variation.snippet)}
                        >
                          <span class="variation-label">{variation.label}</span>
                          <code>{variation.snippet}</code>
                        </button>
                      {/each}
                    </div>
                  </div>

                  <a
                    href={getCommandDocsUrl(command.docsAnchor)}
                    class="menu-docs-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open docs
                  </a>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

{#if showImageBase64Modal}
  <ImageBase64Modal oninsert={handleModalInsert} oncancel={handleModalCancel} />
{/if}

<style>
  .editor-toolbar {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-2);
    padding: var(--rd-space-2) var(--rd-space-3);
    border-bottom: 1px solid var(--rd-color-border);
    background-color: var(--rd-color-bg-secondary);
    flex-shrink: 0;
  }

  .toolbar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--rd-space-2);
  }

  .toolbar-label {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
    font-weight: var(--rd-font-weight-medium);
  }

  .history-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--rd-space-1);
  }

  .toolbar-groups {
    display: flex;
    flex-wrap: wrap;
    gap: var(--rd-space-3);
    overflow: visible;
  }

  .command-group {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-1);
    min-width: 0;
    max-width: 100%;
  }

  .group-label {
    font-size: var(--rd-font-xs);
    color: var(--rd-color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .command-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--rd-space-1);
  }

  .command-item {
    position: relative;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--rd-space-1);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    background: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    font-family: var(--rd-font-ui);
    font-size: var(--rd-font-sm);
    line-height: var(--rd-line-height-tight);
    padding: var(--rd-space-1) var(--rd-space-2);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
    white-space: nowrap;
  }

  .toolbar-btn:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .history-btn {
    padding: var(--rd-space-1);
  }

  .hover-menu {
    position: absolute;
    left: 0;
    top: calc(100% + var(--rd-space-1));
    width: 280px;
    z-index: var(--rd-z-dropdown);
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-2);
    background: var(--rd-color-bg-primary);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-md);
    box-shadow: var(--rd-shadow-md);
    padding: var(--rd-space-2);
  }

  .menu-title {
    display: inline-block;
    margin-bottom: var(--rd-space-1);
    font-size: var(--rd-font-xs);
    color: var(--rd-color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .menu-preview code,
  .variation-btn code {
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-xs);
    color: var(--rd-color-text-primary);
    background: var(--rd-color-bg-tertiary);
    border-radius: var(--rd-radius-sm);
    padding: var(--rd-space-px) var(--rd-space-1);
    overflow-wrap: anywhere;
  }

  .variation-list {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-1);
  }

  .variation-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--rd-space-px);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    background: var(--rd-color-bg-primary);
    padding: var(--rd-space-1);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--rd-transition-fast);
  }

  .variation-btn:hover {
    background: var(--rd-color-bg-tertiary);
  }

  .variation-label {
    font-size: var(--rd-font-xs);
    color: var(--rd-color-text-secondary);
  }

  .menu-docs-link {
    align-self: flex-start;
    font-size: var(--rd-font-sm);
    color: var(--rd-color-accent);
    text-decoration: none;
  }

  .menu-docs-link:hover {
    text-decoration: underline;
  }

</style>
