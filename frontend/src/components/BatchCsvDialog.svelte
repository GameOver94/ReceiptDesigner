<script lang="ts">
  import { parseCsv } from '$lib/csv';
  import { focusOnMount } from '$lib/actions';
  import Button from './common/Button.svelte';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    /** Called with parsed rows + chosen mode when the user confirms */
    onload: (rows: Record<string, string>[], mode: 'batch' | 'line-item') => void;
    /** Called when the user cancels without loading */
    oncancel: () => void;
  }

  const { onload, oncancel }: Props = $props();

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  /**
   * $state() is used for all local reactive values so the template updates
   * when they change. Plain `let` variables do not trigger Svelte re-renders.
   */
  let parsedRows = $state<Record<string, string>[]>([]);
  let selectedMode = $state<'batch' | 'line-item'>('batch');
  let errorMessage = $state<string | null>(null);
  let fileName = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  /** Column headers from the first parsed row (for the preview table) */
  const headers = $derived(parsedRows.length > 0 ? Object.keys(parsedRows[0] ?? {}) : []);

  /** First 5 rows for the preview table */
  const previewRows = $derived(parsedRows.slice(0, 5));

  const canLoad = $derived(parsedRows.length > 0);

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleFileChange(e: Event): void {
    const target = e.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const file = target.files?.[0];
    if (file === undefined) return;

    fileName = file.name;
    errorMessage = null;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text !== 'string') {
        errorMessage = 'Could not read file contents.';
        return;
      }
      try {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          errorMessage = 'The CSV file must have a header row and at least one data row.';
          parsedRows = [];
        } else {
          parsedRows = rows;
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Failed to parse CSV file.';
        parsedRows = [];
        if (import.meta.env.DEV) console.error('[BatchCsvDialog] CSV parse error:', err);
      }
    };
    reader.onerror = () => {
      errorMessage = 'Failed to read the file.';
      parsedRows = [];
    };
    reader.readAsText(file);
  }

  function handleLoad(): void {
    if (!canLoad) return;
    onload(parsedRows, selectedMode);
  }

  function handleModeChange(e: Event): void {
    const target = e.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    if (value === 'batch' || value === 'line-item') {
      selectedMode = value;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel();
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
    aria-labelledby="batch-csv-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
    use:focusOnMount
  >
    <h2 class="modal-title" id="batch-csv-title">Load CSV data</h2>

    <!-- File input -->
    <div class="file-section">
      <span class="file-label">CSV or text file</span>
      <div class="file-row">
        <label class="file-btn" for="csv-file-input">
          Choose file
          <input
            id="csv-file-input"
            type="file"
            accept=".csv,.txt"
            class="file-input-hidden"
            onchange={handleFileChange}
          />
        </label>
        <span class="file-name" class:file-name-placeholder={fileName === null}>
          {fileName ?? 'No file chosen'}
        </span>
      </div>
    </div>

    {#if errorMessage !== null}
      <p class="error-message" role="alert">{errorMessage}</p>
    {/if}

    <!-- Mode selector -->
    <fieldset class="mode-fieldset">
      <legend class="mode-legend">Import mode</legend>

      <label class="mode-option">
        <input
          type="radio"
          name="csv-mode"
          value="batch"
          checked={selectedMode === 'batch'}
          onchange={handleModeChange}
        />
        <span class="mode-label">Batch — one receipt per row</span>
        <span class="mode-description">
          Each CSV row fills the scalar placeholders for one receipt. Use this to print many
          individual receipts from a single CSV.
        </span>
      </label>

      <label class="mode-option">
        <input
          type="radio"
          name="csv-mode"
          value="line-item"
          checked={selectedMode === 'line-item'}
          onchange={handleModeChange}
        />
        <span class="mode-label">Line-items — all rows form one receipt</span>
        <span class="mode-description">
          Each CSV row becomes one iteration of the <code>{`{{#items}}`}</code> block. Use this for receipts
          with a product list.
        </span>
      </label>
    </fieldset>

    <!-- Preview table (shown once data is loaded) -->
    {#if parsedRows.length > 0}
      <div class="preview-section">
        <p class="preview-label">
          Preview — showing {previewRows.length} of {parsedRows.length} rows
        </p>
        <div class="table-scroll">
          <table class="preview-table">
            <thead>
              <tr>
                {#each headers as header (header)}
                  <th>{header}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each previewRows as row, i (i)}
                <tr>
                  {#each headers as header (header)}
                    <td>{row[header] ?? ''}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <div class="modal-actions">
      <Button variant="secondary" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" onclick={handleLoad} isDisabled={!canLoad}>
        Load {parsedRows.length > 0 ? `(${String(parsedRows.length)} rows)` : ''}
      </Button>
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
    width: 560px;
    max-width: 95vw;
    max-height: 85vh;
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

  /* File input */
  .file-section {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-1);
    flex-shrink: 0;
  }

  .file-label {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-secondary);
  }

  /* Row: [Choose file button] [filename] */
  .file-row {
    display: flex;
    align-items: center;
    gap: var(--rd-space-3);
  }

  /*
   * Styled label acts as the file picker trigger.
   * Matches Button secondary variant from Button.svelte.
   */
  .file-btn {
    display: inline-flex;
    align-items: center;
    padding: var(--rd-space-2) var(--rd-space-3);
    font-family: var(--rd-font-ui);
    font-size: var(--rd-font-base);
    font-weight: var(--rd-font-weight-medium);
    line-height: var(--rd-line-height-tight);
    border-radius: var(--rd-radius-sm);
    border: 1px solid var(--rd-color-border-strong);
    background-color: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .file-btn:hover {
    background-color: var(--rd-color-bg-secondary);
  }

  /* The actual <input> is hidden — the label triggers it */
  .file-input-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .file-name {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-primary);
    font-family: var(--rd-font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-name.file-name-placeholder {
    color: var(--rd-color-text-muted);
    font-family: var(--rd-font-ui);
  }

  .error-message {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-error);
    margin: 0;
    flex-shrink: 0;
  }

  /* Mode selector fieldset — removes default browser fieldset styling */
  .mode-fieldset {
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    padding: var(--rd-space-3);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-3);
  }

  .mode-legend {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-secondary);
    padding: 0 var(--rd-space-1);
  }

  .mode-option {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--rd-space-2);
    cursor: pointer;
  }

  .mode-option input[type='radio'] {
    grid-row: 1;
    grid-column: 1;
    margin-top: var(--rd-space-1);
    accent-color: var(--rd-color-accent);
  }

  .mode-label {
    grid-row: 1;
    grid-column: 2;
    font-size: var(--rd-font-base);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-primary);
  }

  .mode-description {
    grid-row: 2;
    grid-column: 2;
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
    line-height: var(--rd-line-height-normal);
  }

  .mode-description code {
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-sm);
    background-color: var(--rd-color-placeholder-bg);
    color: var(--rd-color-placeholder);
    padding: var(--rd-space-px) var(--rd-space-1);
    border-radius: var(--rd-radius-sm);
  }

  /* Preview table */
  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-2);
    flex: 1;
    overflow: hidden;
  }

  .preview-label {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
    margin: 0;
    flex-shrink: 0;
  }

  /* Horizontally and vertically scrollable table container */
  .table-scroll {
    overflow: auto;
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    flex: 1;
  }

  .preview-table {
    border-collapse: collapse;
    font-size: var(--rd-font-sm);
    width: 100%;
    white-space: nowrap;
  }

  .preview-table th {
    padding: var(--rd-space-2) var(--rd-space-3);
    background-color: var(--rd-color-bg-secondary);
    color: var(--rd-color-text-secondary);
    font-weight: var(--rd-font-weight-medium);
    border-bottom: 1px solid var(--rd-color-border);
    text-align: left;
  }

  .preview-table td {
    padding: var(--rd-space-1) var(--rd-space-3);
    color: var(--rd-color-text-primary);
    border-bottom: 1px solid var(--rd-color-border);
  }

  .preview-table tbody tr:last-child td {
    border-bottom: none;
  }

  .preview-table tbody tr:hover td {
    background-color: var(--rd-color-bg-secondary);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--rd-space-2);
    flex-shrink: 0;
  }
</style>
