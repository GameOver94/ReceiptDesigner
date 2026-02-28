<script lang="ts">
  import { isTemplate } from '$lib/variables';
  import { editorContent } from '$store/editorStore';
  import {
    csvRows,
    csvMode,
    isBatchCsvDialogOpen,
    openBatchCsvDialog,
    closeBatchCsvDialog,
    loadCsv,
    clearCsv,
    setCsvMode,
  } from '$store/placeholderStore';
  import BatchCsvDialog from './BatchCsvDialog.svelte';

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const currentIsTemplate = $derived(isTemplate($editorContent));

  /** Column headers derived from the first row's keys */
  const headers = $derived($csvRows.length > 0 ? Object.keys($csvRows[0] ?? {}) : []);

  const hasRows = $derived($csvRows.length > 0);

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleCsvLoad(rows: Record<string, string>[], mode: 'batch' | 'line-item'): void {
    loadCsv(rows, mode);
    closeBatchCsvDialog();
  }
</script>

{#if $isBatchCsvDialogOpen}
  <BatchCsvDialog onload={handleCsvLoad} oncancel={closeBatchCsvDialog} />
{/if}

<!--
  CSV toolbar + data table — shown below the editor for template documents.
  When no CSV is loaded only the toolbar (with "Load CSV") is visible.
  When a CSV is loaded the table expands below the toolbar.
-->
{#if currentIsTemplate}
  <section class="csv-panel" class:has-rows={hasRows} aria-label="CSV data">
    <!-- Toolbar -->
    <div class="csv-toolbar">
      <span class="csv-toolbar-title">CSV</span>

      {#if hasRows}
        <!-- Mode toggle -->
        <div class="csv-mode-toggle" role="group" aria-label="CSV mode">
          <button
            class="csv-mode-btn"
            class:is-active={$csvMode === 'batch'}
            onclick={() => setCsvMode('batch')}
            aria-pressed={$csvMode === 'batch'}
            title="One receipt per CSV row"
          >
            Batch
          </button>
          <button
            class="csv-mode-btn"
            class:is-active={$csvMode === 'line-item'}
            onclick={() => setCsvMode('line-item')}
            aria-pressed={$csvMode === 'line-item'}
            title="All rows as line items in one receipt"
          >
            Line Items
          </button>
        </div>

        <!-- Row count pill -->
        <span class="csv-row-count">
          {String($csvRows.length)} row{$csvRows.length === 1 ? '' : 's'}
        </span>
      {/if}

      <!-- Spacer pushes remaining buttons to the right -->
      <span class="csv-toolbar-spacer" aria-hidden="true"></span>

      <button class="csv-action-btn" onclick={openBatchCsvDialog}>
        {hasRows ? 'Replace CSV' : 'Load CSV'}
      </button>

      {#if hasRows}
        <button class="csv-action-btn csv-action-btn-danger" onclick={clearCsv}> Clear </button>
      {/if}
    </div>

    <!-- Table — only when rows are loaded -->
    {#if hasRows}
      <div class="csv-table-scroll">
        <table class="csv-table">
          <thead>
            <tr>
              <th class="row-num-col">#</th>
              {#each headers as header (header)}
                <th>{header}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each $csvRows as row, i (i)}
              <tr>
                <td class="row-num-col">{String(i + 1)}</td>
                {#each headers as header (header)}
                  <td>{row[header] ?? ''}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
{/if}

<style>
  .csv-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-top: 1px solid var(--rd-color-border);
    background-color: var(--rd-color-bg-primary);
    overflow: hidden;
  }

  /* When rows are present the panel has a fixed height to show the table */
  .csv-panel.has-rows {
    height: var(--rd-csv-panel-height);
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────── */

  .csv-toolbar {
    display: flex;
    align-items: center;
    gap: var(--rd-space-2);
    padding: var(--rd-space-2) var(--rd-space-3);
    background-color: var(--rd-color-bg-secondary);
    border-bottom: 1px solid var(--rd-color-border);
    flex-shrink: 0;
  }

  .csv-toolbar-title {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-text-secondary);
    flex-shrink: 0;
  }

  /* Two-button toggle for Batch / Line Items */
  .csv-mode-toggle {
    display: flex;
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    overflow: hidden;
    flex-shrink: 0;
  }

  .csv-mode-btn {
    padding: 1px var(--rd-space-2);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    font-family: var(--rd-font-ui);
    background: none;
    border: none;
    color: var(--rd-color-text-secondary);
    cursor: pointer;
    transition:
      background-color var(--rd-transition-fast),
      color var(--rd-transition-fast);
    white-space: nowrap;
  }

  .csv-mode-btn + .csv-mode-btn {
    border-left: 1px solid var(--rd-color-border-strong);
  }

  .csv-mode-btn.is-active {
    background-color: var(--rd-color-accent-light);
    color: var(--rd-color-accent);
  }

  .csv-mode-btn:not(.is-active):hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  /* Row count pill */
  .csv-row-count {
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    padding: 1px var(--rd-space-2);
    background-color: var(--rd-color-bg-tertiary);
    color: var(--rd-color-text-secondary);
    border-radius: var(--rd-radius-full);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Pushes action buttons to the right */
  .csv-toolbar-spacer {
    flex: 1;
  }

  /* Small ghost-style action buttons (Load CSV / Replace CSV / Clear) */
  .csv-action-btn {
    padding: 1px var(--rd-space-2);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    font-family: var(--rd-font-ui);
    background: none;
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    color: var(--rd-color-text-secondary);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .csv-action-btn:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .csv-action-btn-danger {
    color: var(--rd-color-error);
    border-color: var(--rd-color-error);
  }

  .csv-action-btn-danger:hover {
    background-color: var(--rd-color-error-light);
  }

  /* ── Table ───────────────────────────────────────────────────────────── */

  .csv-table-scroll {
    flex: 1;
    overflow: auto;
  }

  .csv-table {
    border-collapse: collapse;
    font-size: var(--rd-font-sm);
    width: 100%;
    white-space: nowrap;
  }

  .csv-table th {
    position: sticky;
    top: 0;
    padding: var(--rd-space-1) var(--rd-space-3);
    background-color: var(--rd-color-bg-secondary);
    color: var(--rd-color-text-secondary);
    font-weight: var(--rd-font-weight-medium);
    border-bottom: 1px solid var(--rd-color-border);
    text-align: left;
    z-index: 1;
  }

  .csv-table td {
    padding: var(--rd-space-1) var(--rd-space-3);
    color: var(--rd-color-text-primary);
    border-bottom: 1px solid var(--rd-color-border);
  }

  .csv-table tbody tr:last-child td {
    border-bottom: none;
  }

  .csv-table tbody tr:hover td {
    background-color: var(--rd-color-bg-secondary);
  }

  /* Narrow row-number column */
  .row-num-col {
    font-family: var(--rd-font-mono);
    width: 2.5rem;
    text-align: right;
    padding-right: var(--rd-space-3);
  }

  th.row-num-col {
    color: var(--rd-color-text-muted);
  }

  td.row-num-col {
    color: var(--rd-color-text-muted);
  }
</style>
