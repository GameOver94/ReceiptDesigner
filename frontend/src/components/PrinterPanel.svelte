<script lang="ts">
  import { printerSettings, updatePrinterSettings } from '$store/editorStore';
  import { connectSerial, disconnectSerial, subscribeSerialStatus } from '$lib/printing';
  import type { SerialStatus } from '$lib/printing';

  // Paper width presets — const object per coding-style.md §6.3 (no enums)
  const PAPER_PRESETS = {
    '58mm': { label: '58 mm', cpl: 32 },
    '80mm': { label: '80 mm', cpl: 48 },
    custom: { label: 'Custom', cpl: null },
  } as const;

  type PresetKey = keyof typeof PAPER_PRESETS;

  // Precomputed typed key array — avoids a double `as` expression in the template
  // ({#each ... as PresetKey[] as key} is ambiguous; a named const is clearer).
  const PRESET_KEYS = Object.keys(PAPER_PRESETS) as PresetKey[];

  // Available command sets supported by Receipt.js
  const COMMANDS = ['escpos', 'epson', 'sii', 'citizen', 'generic', 'star'] as const;

  // Available language/encoding codes
  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh-hans', label: 'Chinese (Simplified)' },
    { code: 'zh-hant', label: 'Chinese (Traditional)' },
    { code: 'th', label: 'Thai' },
  ] as const;

  // Determine the currently selected preset from CPL value.
  // $derived recomputes whenever $printerSettings.cpl changes.
  let selectedPreset: PresetKey = $derived(
    $printerSettings.cpl === 32 ? '58mm' : $printerSettings.cpl === 48 ? '80mm' : 'custom',
  );

  function handlePresetChange(preset: PresetKey): void {
    const presetValue = PAPER_PRESETS[preset];
    if (presetValue.cpl !== null) {
      updatePrinterSettings({ cpl: presetValue.cpl });
    }
  }

  function handleCplChange(event: Event): void {
    // event.target is the <input type="number"> that fired this onchange handler.
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 24 && value <= 96) {
      updatePrinterSettings({ cpl: value });
    }
  }

  function handleCommandChange(event: Event): void {
    // event.target is the <select> for command set bound to this onchange handler.
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ command: select.value });
  }

  function handleLanguageChange(event: Event): void {
    // event.target is the <select> for language/encoding bound to this onchange handler.
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ language: select.value });
  }

  function handleSpacingChange(event: Event): void {
    // event.target is the <input type="checkbox"> for spacing bound to this onchange handler.
    const checkbox = event.target as HTMLInputElement;
    updatePrinterSettings({ spacing: checkbox.checked });
  }

  function handleCuttingChange(event: Event): void {
    // event.target is the <input type="checkbox"> for cutting bound to this onchange handler.
    const checkbox = event.target as HTMLInputElement;
    updatePrinterSettings({ cutting: checkbox.checked });
  }

  // ---------------------------------------------------------------------------
  // Printer connection
  // ---------------------------------------------------------------------------

  let serialStatus = $state<SerialStatus>('disconnected');

  $effect(() => {
    const unsub = subscribeSerialStatus((s) => {
      serialStatus = s;
    });
    return unsub;
  });

  const STATUS_LABEL: Record<SerialStatus, string> = {
    unsupported: 'Not supported',
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    online: 'Connected',
    offline: 'Printer offline',
    coveropen: 'Cover open',
    paperempty: 'Paper empty',
    error: 'Connection error',
  };

  function handleConnect(): void {
    connectSerial();
  }

  function handleDisconnect(): void {
    disconnectSerial();
  }
</script>

<!--
  Printer settings panel in the right sidebar (grid area: printer).
  Flexbox column layout — all controls stack vertically.
-->
<aside class="printer-panel" aria-label="Printer settings">
  <div class="panel-header">
    <span class="panel-title">Printer Settings</span>
  </div>

  <div class="panel-body">
    <!-- ── Printer connection ──────────────────────────────────────────── -->
    <div class="setting-group">
      <span class="group-label" id="connection-group-label">Printer Connection</span>
      <div
        class="connection-status"
        class:is-online={serialStatus === 'online'}
        class:is-warning={serialStatus === 'coveropen' || serialStatus === 'paperempty'}
        class:is-offline={serialStatus === 'offline' || serialStatus === 'error'}
        aria-live="polite"
      >
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-text">{STATUS_LABEL[serialStatus]}</span>
      </div>
      {#if serialStatus === 'unsupported'}
        <p class="setting-hint">
          Web Serial requires Chrome or Edge. Export as SVG/PNG for other browsers.
        </p>
      {:else if serialStatus === 'coveropen'}
        <p class="setting-hint">Close the printer cover to continue.</p>
        <button class="btn-disconnect" onclick={handleDisconnect}>Disconnect</button>
      {:else if serialStatus === 'paperempty'}
        <p class="setting-hint">Load paper into the printer to continue.</p>
        <button class="btn-disconnect" onclick={handleDisconnect}>Disconnect</button>
      {:else if serialStatus === 'online' || serialStatus === 'offline'}
        <button class="btn-disconnect" onclick={handleDisconnect}>Disconnect</button>
      {:else}
        <button
          class="btn-connect"
          onclick={handleConnect}
          disabled={serialStatus === 'connecting'}
        >
          {serialStatus === 'connecting' ? 'Connecting…' : 'Connect to printer'}
        </button>
      {/if}
    </div>

    <!-- Paper width presets -->
    <div class="setting-group">
      <!-- This is a group label (not a <label for=...>) — it describes a button group.
           Using a <span> with role="group" + aria-labelledby is the correct pattern here
           because <label> must be associated with a form control, not a button group. -->
      <span class="group-label" id="paper-width-group-label">Paper Width</span>
      <div class="preset-buttons" role="group" aria-labelledby="paper-width-group-label">
        {#each PRESET_KEYS as key}
          <button
            class="preset-btn"
            class:is-active={selectedPreset === key}
            onclick={() => handlePresetChange(key)}
            aria-pressed={selectedPreset === key}
          >
            {PAPER_PRESETS[key].label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Characters per line -->
    <div class="setting-group">
      <label class="setting-label" for="cpl-input"> Characters per Line (CPL) </label>
      <input
        id="cpl-input"
        type="number"
        class="setting-input"
        min="24"
        max="96"
        value={$printerSettings.cpl}
        onchange={handleCplChange}
        aria-describedby="cpl-hint"
      />
      <span id="cpl-hint" class="setting-hint">24–96 characters</span>
    </div>

    <!-- Command set -->
    <div class="setting-group">
      <label class="setting-label" for="command-select">Command Set</label>
      <select
        id="command-select"
        class="setting-select"
        value={$printerSettings.command}
        onchange={handleCommandChange}
      >
        {#each COMMANDS as cmd}
          <option value={cmd}>{cmd}</option>
        {/each}
      </select>
    </div>

    <!-- Language / encoding -->
    <div class="setting-group">
      <label class="setting-label" for="language-select">Language / Encoding</label>
      <select
        id="language-select"
        class="setting-select"
        value={$printerSettings.language}
        onchange={handleLanguageChange}
      >
        {#each LANGUAGES as lang}
          <option value={lang.code}>{lang.label}</option>
        {/each}
      </select>
    </div>

    <!-- Toggles -->
    <div class="setting-group">
      <!-- Span acting as a visual group heading — not a form label for a single control -->
      <span class="group-label" id="options-group-label">Options</span>

      <label class="checkbox-label">
        <input type="checkbox" checked={$printerSettings.spacing} onchange={handleSpacingChange} />
        Line spacing
      </label>

      <label class="checkbox-label">
        <input type="checkbox" checked={$printerSettings.cutting} onchange={handleCuttingChange} />
        Auto cut
      </label>
    </div>
  </div>
</aside>

<style>
  .printer-panel {
    grid-area: printer;
    display: flex;
    flex-direction: column;
    background-color: var(--rd-color-bg-secondary);
    border-left: 1px solid var(--rd-color-border);
    overflow: hidden;
  }

  .panel-header {
    padding: var(--rd-space-3) var(--rd-space-4);
    border-bottom: 1px solid var(--rd-color-border);
    flex-shrink: 0;
  }

  .panel-title {
    font-size: var(--rd-font-base);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--rd-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-5);
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-2);
  }

  .group-label {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .setting-label {
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-primary);
    font-weight: var(--rd-font-weight-medium);
  }

  .setting-input,
  .setting-select {
    padding: var(--rd-space-2) var(--rd-space-3);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-base);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    width: 100%;
  }

  .setting-input:focus,
  .setting-select:focus {
    outline: 2px solid var(--rd-color-accent);
    outline-offset: 1px;
  }

  .setting-hint {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-muted);
  }

  .preset-buttons {
    display: flex;
    gap: var(--rd-space-2);
  }

  .preset-btn {
    flex: 1;
    padding: var(--rd-space-2);
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-secondary);
    font-size: var(--rd-font-sm);
    cursor: pointer;
    transition:
      background-color var(--rd-transition-fast),
      color var(--rd-transition-fast),
      border-color var(--rd-transition-fast);
  }

  .preset-btn.is-active {
    background-color: var(--rd-color-accent-light);
    color: var(--rd-color-accent);
    border-color: var(--rd-color-accent);
    font-weight: var(--rd-font-weight-medium);
  }

  .preset-btn:hover:not(.is-active) {
    background-color: var(--rd-color-bg-tertiary);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    font-size: var(--rd-font-base);
    color: var(--rd-color-text-primary);
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    width: var(--rd-space-4);
    height: var(--rd-space-4);
    cursor: pointer;
    accent-color: var(--rd-color-accent);
  }

  /* ── Printer connection ─────────────────────────────────────────────── */

  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-muted);
  }

  .status-dot {
    width: var(--rd-status-dot-size);
    height: var(--rd-status-dot-size);
    border-radius: var(--rd-radius-full);
    background-color: var(--rd-color-text-muted);
    flex-shrink: 0;
    transition: background-color var(--rd-transition-fast);
  }

  .connection-status.is-online .status-dot {
    background-color: var(--rd-color-success);
  }

  .connection-status.is-online .status-text {
    color: var(--rd-color-success);
  }

  .connection-status.is-warning .status-dot {
    background-color: var(--rd-color-warning);
  }

  .connection-status.is-warning .status-text {
    color: var(--rd-color-warning);
  }

  .connection-status.is-offline .status-dot {
    background-color: var(--rd-color-error);
  }

  .connection-status.is-offline .status-text {
    color: var(--rd-color-error);
  }

  .btn-connect,
  .btn-disconnect {
    padding: var(--rd-space-2) var(--rd-space-3);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    cursor: pointer;
    width: 100%;
    transition: background-color var(--rd-transition-fast);
  }

  .btn-connect {
    background-color: var(--rd-color-accent);
    color: var(--rd-color-text-inverse);
    border: none;
  }

  .btn-connect:hover:not(:disabled) {
    background-color: var(--rd-color-accent-hover);
  }

  .btn-connect:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-disconnect {
    background: none;
    border: 1px solid var(--rd-color-border-strong);
    color: var(--rd-color-text-secondary);
  }

  .btn-disconnect:hover {
    background-color: var(--rd-color-bg-tertiary);
  }
</style>
