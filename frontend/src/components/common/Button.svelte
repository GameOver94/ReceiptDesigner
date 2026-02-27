<script lang="ts">
  import type { Snippet } from 'svelte';

  // Variant type uses a union type per coding-style.md §6.3 (no enums)
  // Using a type alias for a union — interface is for data shapes, type for unions (coding-style.md §6.1)
  type Variant = 'primary' | 'secondary' | 'ghost';

  // $props() with inline type annotation (Svelte 5 runes — replaces `export let`)
  let {
    variant = 'primary' as Variant,
    type = 'button' as 'button' | 'submit' | 'reset',
    isDisabled = false,
    ariaLabel = undefined as string | undefined,
    onclick = undefined as (() => void) | undefined,
    children,
  } = $props<{
    variant?: Variant;
    type?: 'button' | 'submit' | 'reset';
    isDisabled?: boolean;
    ariaLabel?: string;
    onclick?: () => void;
    children?: Snippet;
  }>();
</script>

<!--
  A reusable button component with three visual variants.
  All styling uses --rd-* tokens — no hardcoded colours.
  The `isDisabled` prop name follows the positive-boolean convention (coding-style.md §3.2).
-->
<button {type} class="btn btn-{variant}" disabled={isDisabled} aria-label={ariaLabel} {onclick}>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--rd-space-2);
    padding: var(--rd-space-2) var(--rd-space-3);
    font-family: var(--rd-font-ui);
    font-size: var(--rd-font-base);
    font-weight: var(--rd-font-weight-medium);
    line-height: var(--rd-line-height-tight);
    border-radius: var(--rd-radius-sm);
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color var(--rd-transition-fast),
      border-color var(--rd-transition-fast),
      color var(--rd-transition-fast);
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Primary — filled accent background */
  .btn-primary {
    background-color: var(--rd-color-accent);
    color: var(--rd-color-text-inverse);
    border-color: var(--rd-color-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--rd-color-accent-hover);
    border-color: var(--rd-color-accent-hover);
  }

  /* Secondary — outlined */
  .btn-secondary {
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    border-color: var(--rd-color-border-strong);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--rd-color-bg-secondary);
  }

  /* Ghost — no border, minimal visual weight */
  .btn-ghost {
    background-color: transparent;
    color: var(--rd-color-text-secondary);
    border-color: transparent;
  }

  .btn-ghost:hover:not(:disabled) {
    background-color: var(--rd-color-bg-secondary);
    color: var(--rd-color-text-primary);
  }
</style>
