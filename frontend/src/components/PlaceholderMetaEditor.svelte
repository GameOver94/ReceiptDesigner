<script lang="ts">
  import Button from './common/Button.svelte';
  import type { PlaceholderMeta } from '$types/index';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    /** All detected placeholder names in the current document */
    placeholders: string[];
    /** Current metadata for each field (may be a subset of placeholders) */
    meta: PlaceholderMeta[];
    /** Called with the updated meta array when the user saves */
    onsave: (meta: PlaceholderMeta[]) => void;
    /** Called when the user cancels without saving */
    oncancel: () => void;
  }

  const { placeholders, meta, onsave, oncancel }: Props = $props();

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  /**
   * Working copy of the metadata rows — one entry per detected placeholder.
   * Initialised once from the `meta` prop, then mutated locally until Save.
   *
   * $state() is used (rather than a plain let) because the template needs to
   * re-render when individual rows are edited.
   */
  // intentional: rows is a local working copy, not kept in sync with the meta prop after init
  /* svelte-ignore state_referenced_locally */
  let rows = $state<PlaceholderMeta[]>(
    placeholders.map((name) => {
      const existing = meta.find((m) => m.name === name);
      return existing ?? { name, label: '', defaultValue: undefined, required: false };
    }),
  );

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleSave(): void {
    onsave([...rows]);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel();
  }

  function updateRow(index: number, patch: Partial<PlaceholderMeta>): void {
    rows = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
  }

  // Auto-focus the dialog container when it opens so focus moves into the
  // modal for keyboard and screen reader users (ARIA modal pattern).
  function focusDialog(node: HTMLDivElement): void {
    node.focus();
  }
</script>

<!-- Backdrop -->
<div
  class="modal-backdrop"
  role="presentation"
  onclick={oncancel}
  onkeydown={(e) => {
    if (e.key === 'Escape') oncancel();
  }}
>
  <div
    class="modal-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="meta-editor-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
    use:focusDialog
  >
    <h2 class="modal-title" id="meta-editor-title">Edit template fields</h2>
    <p class="modal-description">
      Configure labels, defaults, and required flags for each placeholder.
    </p>

    {#if placeholders.length === 0}
      <p class="empty-message">No placeholder fields detected in this document.</p>
    {:else}
      <!-- Column headers -->
      <div class="table-header">
        <span class="col-name">Field</span>
        <span class="col-label">Label</span>
        <span class="col-default">Default value</span>
        <span class="col-required">Required</span>
      </div>

      <div class="rows-container">
        {#each rows as row, index (row.name)}
          <div class="table-row">
            <!-- Field name is read-only — it comes from the document content -->
            <span class="col-name field-name" title={`{{${row.name}}}`}>
              {row.name}
            </span>

            <input
              class="col-label field-input"
              type="text"
              placeholder={row.name}
              value={row.label}
              oninput={(e) => {
                if (e.currentTarget instanceof HTMLInputElement) {
                  updateRow(index, { label: e.currentTarget.value });
                }
              }}
              aria-label="Label for {row.name}"
            />

            <input
              class="col-default field-input"
              type="text"
              placeholder="(none)"
              value={row.defaultValue ?? ''}
              oninput={(e) => {
                if (e.currentTarget instanceof HTMLInputElement) {
                  const val = e.currentTarget.value;
                  updateRow(index, { defaultValue: val === '' ? undefined : val });
                }
              }}
              aria-label="Default value for {row.name}"
            />

            <div class="col-required required-cell">
              <input
                type="checkbox"
                id="req-{row.name}"
                checked={row.required}
                onchange={(e) => {
                  if (e.currentTarget instanceof HTMLInputElement) {
                    updateRow(index, { required: e.currentTarget.checked });
                  }
                }}
                aria-label="Required: {row.name}"
              />
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="modal-actions">
      <Button variant="secondary" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" onclick={handleSave}>Save</Button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: var(--rd-color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--rd-z-modal);
  }

  .modal-dialog {
    background-color: var(--rd-color-bg-primary);
    border-radius: var(--rd-radius-md);
    box-shadow: var(--rd-shadow-lg);
    padding: var(--rd-space-6);
    width: 600px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-4);
    overflow: hidden;
  }

  .modal-title {
    font-size: var(--rd-font-lg);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
    margin: 0;
    flex-shrink: 0;
  }

  .modal-description {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
    margin: 0;
    flex-shrink: 0;
  }

  .empty-message {
    color: var(--rd-color-text-secondary);
    font-size: var(--rd-font-base);
    margin: 0;
  }

  /* Use CSS Grid for the table layout — each row aligns its columns consistently */
  .table-header,
  .table-row {
    display: grid;
    grid-template-columns: 1fr 1.5fr 1.5fr var(--rd-required-col-width);
    gap: var(--rd-space-2);
    align-items: center;
  }

  .table-header {
    flex-shrink: 0;
    padding-bottom: var(--rd-space-2);
    border-bottom: 1px solid var(--rd-color-border);
  }

  .table-header span {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-secondary);
  }

  .rows-container {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-2);
    overflow-y: auto;
    flex: 1;
  }

  .field-name {
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-sm);
    color: var(--rd-color-placeholder);
    background-color: var(--rd-color-placeholder-bg);
    padding: var(--rd-space-1) var(--rd-space-2);
    border-radius: var(--rd-radius-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-input {
    padding: var(--rd-space-1) var(--rd-space-2);
    font-size: var(--rd-font-base);
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    width: 100%;
    box-sizing: border-box;
  }

  .field-input:focus {
    outline: 2px solid var(--rd-color-accent);
    outline-offset: 1px;
  }

  .required-cell {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .required-cell input[type='checkbox'] {
    width: var(--rd-space-4);
    height: var(--rd-space-4);
    accent-color: var(--rd-color-accent);
    cursor: pointer;
  }

  .col-required {
    text-align: center;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--rd-space-2);
    flex-shrink: 0;
    border-top: 1px solid var(--rd-color-border);
    padding-top: var(--rd-space-4);
  }
</style>
