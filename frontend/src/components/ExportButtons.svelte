<script lang="ts">
  import { toSVG, toPNG } from '$lib/receiptjs';
  import { editorContent, printerSettings } from '$store/editorStore';
  import { currentDocument, autoSaveIfDirty } from '$store/documentStore';

  let isExportingSvg = $state(false);
  let isExportingPng = $state(false);
  let errorMessage = $state<string | null>(null);

  /**
   * Download a string or URL as a file in the browser.
   * Uses a temporary <a> element with the `download` attribute — this is
   * the standard browser way to trigger a file download without a server.
   */
  function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Revoke the object URL after a short delay to free the memory reference.
    // The delay ensures the download has started before the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Download a data URL (e.g. PNG from Receipt.js toPNG()) as a file.
   */
  function downloadDataUrl(dataUrl: string, filename: string): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  function getFilename(extension: string): string {
    const name = $currentDocument?.name ?? 'receipt';
    // Replace characters that are invalid in filenames
    const safe = name.replace(/[/\\?%*:|"<>]/g, '-');
    return `${safe}.${extension}`;
  }

  async function handleExportSvg(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    isExportingSvg = true;
    errorMessage = null;
    try {
      const svg = await toSVG($editorContent, $printerSettings);
      if (svg === '') {
        errorMessage = 'Receipt.js is not loaded. Cannot export SVG.';
        return;
      }
      downloadFile(svg, getFilename('svg'), 'image/svg+xml');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'SVG export failed';
      if (import.meta.env.DEV) console.error('[ExportButtons] SVG export:', err);
    } finally {
      isExportingSvg = false;
    }
  }

  async function handleExportPng(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    isExportingPng = true;
    errorMessage = null;
    try {
      const dataUrl = await toPNG($editorContent, $printerSettings);
      downloadDataUrl(dataUrl, getFilename('png'));
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'PNG export failed';
      if (import.meta.env.DEV) console.error('[ExportButtons] PNG export:', err);
    } finally {
      isExportingPng = false;
    }
  }
</script>

<div class="export-buttons" role="group" aria-label="Export options">
  <button
    class="export-btn"
    onclick={() => {
      void handleExportSvg();
    }}
    disabled={isExportingSvg}
    aria-label="Export as SVG"
  >
    {isExportingSvg ? 'Exporting…' : 'Export SVG'}
  </button>
  <button
    class="export-btn"
    onclick={() => {
      void handleExportPng();
    }}
    disabled={isExportingPng}
    aria-label="Export as PNG"
  >
    {isExportingPng ? 'Exporting…' : 'Export PNG'}
  </button>

  {#if errorMessage !== null}
    <p class="export-error" role="alert">{errorMessage}</p>
  {/if}
</div>

<style>
  .export-buttons {
    display: flex;
    gap: var(--rd-space-2);
    flex-wrap: wrap;
    align-items: center;
  }

  .export-btn {
    padding: var(--rd-space-2) var(--rd-space-3);
    background-color: var(--rd-color-bg-secondary);
    color: var(--rd-color-text-primary);
    border: 1px solid var(--rd-color-border-strong);
    border-radius: var(--rd-radius-sm);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .export-btn:hover:not(:disabled) {
    background-color: var(--rd-color-bg-tertiary);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-error {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-error);
  }
</style>
