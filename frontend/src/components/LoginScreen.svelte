<script lang="ts">
  import { apiLogin } from '../adapters/apiAdapter';

  const { onSuccess }: { onSuccess: () => void } = $props();

  let token = $state('');
  let isLoading = $state(false);
  let errorMessage = $state<string | null>(null);

  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!token.trim()) return;

    isLoading = true;
    errorMessage = null;

    try {
      const ok = await apiLogin(token.trim());
      if (ok) {
        onSuccess();
      } else {
        errorMessage = 'Invalid token. Please check your configuration.';
      }
    } catch (err) {
      errorMessage = 'Could not reach the server. Is it running?';
      if (import.meta.env.DEV) console.error('[LoginScreen] login error:', err);
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      token = '';
      errorMessage = null;
    }
  }
</script>

<div class="login-overlay" role="main">
  <div class="login-card">
    <h1 class="login-title">ReceiptDesigner</h1>
    <p class="login-subtitle">Production mode — enter your API token to continue.</p>

    <form class="login-form" onsubmit={handleSubmit}>
      <label class="login-label" for="token-input">API Token</label>
      <input
        id="token-input"
        class="login-input"
        type="password"
        bind:value={token}
        onkeydown={handleKeydown}
        placeholder="Enter token…"
        autocomplete="current-password"
        disabled={isLoading}
        aria-describedby={errorMessage !== null ? 'login-error' : undefined}
      />

      {#if errorMessage !== null}
        <p id="login-error" class="login-error" role="alert">{errorMessage}</p>
      {/if}

      <button class="login-btn" type="submit" disabled={isLoading || !token.trim()}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--rd-color-bg-primary);
    z-index: var(--rd-z-modal);
  }

  .login-card {
    width: 100%;
    max-width: 380px;
    padding: var(--rd-space-8);
    background-color: var(--rd-color-bg-secondary);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-md);
  }

  .login-title {
    margin: 0 0 var(--rd-space-1);
    font-size: var(--rd-font-xl);
    font-weight: 600;
    color: var(--rd-color-text-primary);
  }

  .login-subtitle {
    margin: 0 0 var(--rd-space-6);
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-muted);
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-3);
  }

  .login-label {
    font-size: var(--rd-font-sm);
    font-weight: 500;
    color: var(--rd-color-text-primary);
  }

  .login-input {
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-primary);
    background-color: var(--rd-color-bg-primary);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    outline: none;
    transition: border-color 0.15s;
  }

  .login-input:focus {
    border-color: var(--rd-color-accent);
  }

  .login-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .login-error {
    margin: 0;
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-sm);
    color: var(--rd-color-error);
    background-color: color-mix(in srgb, var(--rd-color-error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--rd-color-error) 30%, transparent);
    border-radius: var(--rd-radius-sm);
  }

  .login-btn {
    padding: var(--rd-space-2) var(--rd-space-4);
    font-size: var(--rd-font-base);
    font-weight: 500;
    color: var(--rd-color-on-primary);
    background-color: var(--rd-color-accent);
    border: none;
    border-radius: var(--rd-radius-sm);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .login-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .login-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
