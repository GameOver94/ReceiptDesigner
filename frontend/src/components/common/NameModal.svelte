<script lang="ts">
  interface Props {
    title: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    onconfirm: (name: string) => void;
    oncancel: () => void;
  }

  const {
    title,
    initialValue = '',
    placeholder = 'Document name',
    confirmLabel = 'OK',
    onconfirm,
    oncancel,
  }: Props = $props();

  // Snapshot the initial value once at mount time.
  // The modal is always conditionally rendered via {#if} in the parent, so the
  // component is destroyed and recreated each time it opens — this runs exactly once.
  // Intentional one-time capture at mount: the component is recreated each time the
  // modal opens, so `initialValue` is always fresh. The ignore suppresses the Svelte
  // compiler warning that would otherwise flag this as capturing a stale prop reference.
  /* svelte-ignore state_referenced_locally */
  let value = $state(initialValue);

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && value.trim() !== '') {
      onconfirm(value.trim());
    } else if (e.key === 'Escape') {
      oncancel();
    }
  }

  function handleConfirm(): void {
    if (value.trim() !== '') onconfirm(value.trim());
  }

  // Auto-focus and select the text so the user can immediately overwrite the name.
  // The selection is applied via requestAnimationFrame to ensure the $effect that
  // sets `value` from the prop has already run before we select.
  function focusAndSelect(node: HTMLInputElement): void {
    requestAnimationFrame(() => {
      node.focus();
      node.select();
    });
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
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <h2 class="modal-title" id="modal-title">{title}</h2>

    <input
      type="text"
      class="modal-input"
      bind:value
      {placeholder}
      onkeydown={handleKeydown}
      use:focusAndSelect
    />

    <div class="modal-actions">
      <button class="btn-cancel" onclick={oncancel}>Cancel</button>
      <button class="btn-confirm" onclick={handleConfirm} disabled={value.trim() === ''}>
        {confirmLabel}
      </button>
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

  .modal-input {
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-base);
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    width: 100%;
    box-sizing: border-box;
  }

  .modal-input:focus {
    outline: 2px solid var(--rd-color-accent);
    outline-offset: 1px;
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

  .btn-confirm {
    padding: var(--rd-space-2) var(--rd-space-3);
    background-color: var(--rd-color-accent);
    border: none;
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-inverse);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .btn-confirm:hover:not(:disabled) {
    background-color: var(--rd-color-accent-hover);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
