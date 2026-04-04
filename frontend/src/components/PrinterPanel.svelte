<script lang="ts">
  import {
    imagePreviewScale,
    printerSettings,
    setImagePreviewScale,
    updatePrinterSettings,
  } from '$store/editorStore';
  import { connectSerial, disconnectSerial, subscribeSerialStatus } from '$lib/printing';
  import { printerModels } from '$lib/encoder';
  import type { SerialStatus } from '$lib/printing';
  import type { PrinterSettings } from '$types/index';

  // Paper width presets — const object per coding-style.md §6.3 (no enums)
  const PAPER_PRESETS = {
    '58mm': { label: '58 mm', columns: 32 },
    '80mm': { label: '80 mm', columns: 48 },
    custom: { label: 'Custom', columns: null },
  } as const;

  type PresetKey = keyof typeof PAPER_PRESETS;

  const PRESET_KEYS = Object.keys(PAPER_PRESETS) as PresetKey[];

  // Printer command languages supported by @point-of-sale/receipt-printer-encoder
  const LANGUAGES: { value: PrinterSettings['language']; label: string }[] = [
    { value: 'esc-pos', label: 'ESC/POS (Epson, most printers)' },
    { value: 'star-prnt', label: 'Star PRNT' },
    { value: 'star-line', label: 'Star Line Mode' },
  ];

  // Common codepage mapping profiles
  const CODEPAGE_MAPPINGS = [
    'epson',
    'star',
    'bixolon',
    'citizen',
    'fujitsu',
    'metapace',
    'mpt',
    'pos-5890',
    'xprinter',
    'youku',
    'zjiang',
  ] as const;

  // Determine the currently selected preset from columns value.
  let selectedPreset: PresetKey = $derived(
    $printerSettings.columns === 32 ? '58mm' : $printerSettings.columns === 48 ? '80mm' : 'custom',
  );

  function handlePresetChange(preset: PresetKey): void {
    const presetValue = PAPER_PRESETS[preset];
    if (presetValue.columns !== null) {
      updatePrinterSettings({ columns: presetValue.columns });
    }
  }

  function handleColumnsChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 24 && value <= 96) {
      updatePrinterSettings({ columns: value });
    }
  }

  function handleLanguageChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value as PrinterSettings['language'];
    updatePrinterSettings({ language: value });
  }

  function handleCodepageMappingChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ codepageMapping: select.value });
  }

  function handlePrinterModelChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ printerModel: select.value });
  }

  function handleFeedBeforeCutChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 10) {
      updatePrinterSettings({ feedBeforeCut: value });
    }
  }

  function handleNewlineChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ newline: select.value as PrinterSettings['newline'] });
  }

  function handleImageModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    updatePrinterSettings({ imageMode: select.value as PrinterSettings['imageMode'] });
  }

  function handleImagePreviewScaleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!Number.isNaN(value) && value >= 50 && value <= 150) {
      setImagePreviewScale(value / 100);
    }
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
        class:is-offline={serialStatus === 'error'}
        aria-live="polite"
      >
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-text">{STATUS_LABEL[serialStatus]}</span>
      </div>
      {#if serialStatus === 'unsupported'}
        <p class="setting-hint">
          Web Serial requires Chrome or Edge. Export ESC/POS for other browsers.
        </p>
      {:else if serialStatus === 'online'}
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

    <!-- Columns -->
    <div class="setting-group">
      <label class="setting-label" for="columns-input"> Columns </label>
      <input
        id="columns-input"
        type="number"
        class="setting-input"
        min="24"
        max="96"
        value={$printerSettings.columns}
        onchange={handleColumnsChange}
        aria-describedby="columns-hint"
      />
      <span id="columns-hint" class="setting-hint">Characters per line (24–96)</span>
    </div>

    <!-- Command language -->
    <div class="setting-group">
      <label class="setting-label" for="language-select">Command Language</label>
      <select
        id="language-select"
        class="setting-select"
        value={$printerSettings.language}
        onchange={handleLanguageChange}
      >
        {#each LANGUAGES as lang}
          <option value={lang.value}>{lang.label}</option>
        {/each}
      </select>
    </div>

    <!-- Printer model (optional) -->
    <div class="setting-group">
      <label class="setting-label" for="printer-model-select">Printer Model</label>
      <select
        id="printer-model-select"
        class="setting-select"
        value={$printerSettings.printerModel}
        onchange={handlePrinterModelChange}
        aria-describedby="printer-model-hint"
      >
        <option value="">— Generic (use codepage mapping) —</option>
        {#each printerModels as model}
          <option value={model.id}>{model.name}</option>
        {/each}
      </select>
      <span id="printer-model-hint" class="setting-hint">
        Selecting a model auto-configures language, codepage mapping, and capabilities.
      </span>
    </div>

    <!-- Codepage mapping (used when printer model is empty) -->
    <div class="setting-group">
      <label class="setting-label" for="codepage-select">Codepage Mapping</label>
      <select
        id="codepage-select"
        class="setting-select"
        value={$printerSettings.codepageMapping}
        onchange={handleCodepageMappingChange}
        disabled={$printerSettings.printerModel !== ''}
      >
        {#each CODEPAGE_MAPPINGS as mapping}
          <option value={mapping}>{mapping}</option>
        {/each}
      </select>
      {#if $printerSettings.printerModel !== ''}
        <span class="setting-hint">Overridden by printer model.</span>
      {/if}
    </div>

    <!-- Feed before cut -->
    <div class="setting-group">
      <label class="setting-label" for="feed-before-cut-input">Feed Before Cut</label>
      <input
        id="feed-before-cut-input"
        type="number"
        class="setting-input"
        min="0"
        max="10"
        value={$printerSettings.feedBeforeCut}
        onchange={handleFeedBeforeCutChange}
        aria-describedby="feed-before-cut-hint"
      />
      <span id="feed-before-cut-hint" class="setting-hint">Lines to feed before cutter (0–10)</span>
    </div>

    <!-- Toggles -->
    <div class="setting-group">
      <span class="group-label" id="options-group-label">Options</span>

      <label class="setting-label" for="newline-select">Newline</label>
      <select
        id="newline-select"
        class="setting-select"
        value={$printerSettings.newline}
        onchange={handleNewlineChange}
        aria-describedby="newline-hint"
      >
        <option value={'\n\r'}>&#92;n&#92;r (standard)</option>
        <option value={'\n'}>&#92;n only (exotic printers)</option>
      </select>
      <span id="newline-hint" class="setting-hint"
        >Use &#92;n only if your printer prints blank lines between text.</span
      >

      <label class="setting-label" for="image-mode-select">Image Mode</label>
      <select
        id="image-mode-select"
        class="setting-select"
        value={$printerSettings.imageMode}
        onchange={handleImageModeChange}
        aria-describedby="image-mode-hint"
      >
        <option value="column">Column (default)</option>
        <option value="raster">Raster (older printers)</option>
      </select>
      <span id="image-mode-hint" class="setting-hint"
        >ESC/POS only. Use Raster for printers that don&#39;t support Column mode.</span
      >

      <label class="setting-label" for="image-preview-scale-input">Image Preview Scale</label>
      <input
        id="image-preview-scale-input"
        type="number"
        class="setting-input"
        min="50"
        max="150"
        step="1"
        value={Math.round($imagePreviewScale * 100)}
        onchange={handleImagePreviewScaleChange}
        aria-describedby="image-preview-scale-hint"
      />
      <span class="setting-suffix" aria-hidden="true">%</span>
      <span id="image-preview-scale-hint" class="setting-hint"
        >Preview only. Default is 67%. Lower values shrink previewed images.</span
      >
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

  .setting-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setting-hint {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-muted);
  }

  .setting-suffix {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
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
