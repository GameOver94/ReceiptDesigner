<script lang="ts">
  interface Props {
    /** Name of the item being deleted — shown in the body text. */
    documentName: string;
    /** Human-readable item type shown in the title, e.g. "document" or "folder". */
    itemType?: string;
    onconfirm: () => void;
    oncancel: () => void;
  }

  const { documentName, itemType = 'document', onconfirm, oncancel }: Props = $props();

  // Capitalise first letter for the title heading.
  const itemTypeCapitalised = $derived(itemType.charAt(0).toUpperCase() + itemType.slice(1));

  // Auto-focus the Cancel button so pressing Enter doesn't accidentally confirm.
  // Destructive actions should require a deliberate click.
  function focusCancel(node: HTMLButtonElement): void {
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
  <!-- Dialog — stop click propagation so backdrop click doesn't close it -->
  <div
    class="modal-dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="delete-modal-title"
    aria-describedby="delete-modal-desc"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <h2 class="modal-title" id="delete-modal-title">Delete {itemType}</h2>
    <p class="modal-body" id="delete-modal-desc">
      Delete {itemTypeCapitalised} <strong>"{documentName}"</strong>? This cannot be undone.
    </p>

    <div class="modal-actions">
      <button class="btn-cancel" use:focusCancel onclick={oncancel}>Cancel</button>
      <button class="btn-delete" onclick={onconfirm}>Delete</button>
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
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-4);
  }

  .modal-title {
    font-size: var(--rd-font-lg);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
    margin: 0;
  }

  .modal-body {
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-secondary);
    margin: 0;
    line-height: var(--rd-line-height-normal);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--rd-space-2);
  }

  .btn-cancel {
    padding: var(--rd-space-2) var(--rd-space-3);
    background: none;
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-secondary);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .btn-cancel:hover {
    background-color: var(--rd-color-bg-secondary);
  }

  .btn-delete {
    padding: var(--rd-space-2) var(--rd-space-3);
    background-color: var(--rd-color-error);
    border: none;
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-inverse);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .btn-delete:hover {
    background-color: var(--rd-color-error-hover);
  }
</style>
