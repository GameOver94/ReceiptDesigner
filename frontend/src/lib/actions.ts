/**
 * Shared Svelte actions for use:* directives across components.
 *
 * Actions are plain functions — they accept a DOM element and optionally
 * return a cleanup object. They are entirely outside Svelte's reactivity
 * system, so they can be shared freely between components without coupling.
 */

/**
 * Auto-focus a DOM element when it is mounted.
 * Used on modal dialog containers so that focus moves into the modal
 * immediately on open — required for ARIA modal pattern and keyboard users.
 *
 * Usage:
 *   <div role="dialog" tabindex="-1" use:focusOnMount>
 */
export function focusOnMount(node: HTMLElement): void {
  node.focus();
}
