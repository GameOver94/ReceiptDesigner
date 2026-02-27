<script lang="ts">
  import { printerSettings, updatePrinterSettings } from '$store/editorStore';

  // Paper width presets — const object per coding-style.md §6.3 (no enums)
  const PAPER_PRESETS = {
    '58mm': { label: '58 mm', cpl: 32 },
    '80mm': { label: '80 mm', cpl: 48 },
    custom: { label: 'Custom', cpl: null },
  } as const;

  type PresetKey = keyof typeof PAPER_PRESETS;

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
    <!-- Paper width presets -->
    <div class="setting-group">
      <!-- This is a group label (not a <label for=...>) — it describes a button group.
           Using a <span> with role="group" + aria-labelledby is the correct pattern here
           because <label> must be associated with a form control, not a button group. -->
      <span class="group-label" id="paper-width-group-label">Paper Width</span>
      <div class="preset-buttons" role="group" aria-labelledby="paper-width-group-label">
        {#each Object.entries(PAPER_PRESETS) as [key, preset]}
          <button
            class="preset-btn"
            class:is-active={selectedPreset === key}
            onclick={() => handlePresetChange(key as PresetKey)}
            aria-pressed={selectedPreset === key}
          >
            {preset.label}
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
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--rd-color-accent);
  }
</style>
