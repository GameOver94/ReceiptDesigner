<script lang="ts">
  import { toSVG, toPNG } from '$lib/receiptjs';
  import { resolveContent, toEscPos } from '$lib/pipeline';
  import { editorContent, printerSettings } from '$store/editorStore';
  import { currentDocument, autoSaveIfDirty } from '$store/documentStore';
  import { csvRows, csvMode, previewRowIndex } from '$store/placeholderStore';

  // Delay before revoking a blob object URL — long enough for the download to start.
  const REVOKE_OBJECT_URL_DELAY_MS = 1000;

  let isExportingSvg = $state(false);
  let isExportingPng = $state(false);
  let isExportingEscpos = $state(false);
  let errorMessage = $state<string | null>(null);

  /**
   * Compute the effective content to export via the unified pipeline.
   *
   * - Batch mode:     resolveContent returns only the row at previewRowIndex so
   *                   the exported file matches what the user sees in the preview.
   * - Line-item mode: resolveContent returns one string (all rows in {{#items}}).
   * - No CSV:         returns the raw editor content unchanged.
   *
   * Returns the first (and usually only) element. For batch mode we intentionally
   * use singleRow=true so the export reflects the previewed row, not all rows —
   * "Export all rows" is the job of a batch print, not a single-file export.
   */
  function getEffectiveContent(): string {
    const resolved = resolveContent(
      $editorContent,
      $csvRows,
      $csvMode,
      $previewRowIndex,
      true, // singleRow — export only the row currently shown in the preview
    );
    return resolved[0] ?? $editorContent;
  }

  /**
   * Trigger a browser download for any data that can be represented as a Blob.
   * - Pass a plain string for text formats (SVG, CSV).
   * - Pass a Uint8Array for binary formats (ESC/POS .bin).
   * - Pass a data-URL string and set `isDataUrl: true` for PNG from toPNG().
   *
   * A temporary <a> element with the `download` attribute is used in all cases;
   * Blob object URLs are revoked after a short delay to avoid memory leaks.
   */
  function triggerDownload(
    data: string | Uint8Array,
    filename: string,
    mimeType: string,
    isDataUrl = false,
  ): void {
    if (isDataUrl && typeof data === 'string') {
      const a = document.createElement('a');
      a.href = data;
      a.download = filename;
      a.click();
      return;
    }
    const blob = new Blob([data as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_OBJECT_URL_DELAY_MS);
  }

  function getFilename(extension: string): string {
    const name = $currentDocument?.name ?? 'receipt';
    const safe = name.replace(/[/\\?%*:|"<>]/g, '-');
    return `${safe}.${extension}`;
  }

  async function handleExportSvg(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    isExportingSvg = true;
    errorMessage = null;
    try {
      const svg = await toSVG(getEffectiveContent(), $printerSettings);
      if (svg === '') {
        errorMessage = 'Receipt.js is not loaded. Cannot export SVG.';
        return;
      }
      triggerDownload(svg, getFilename('svg'), 'image/svg+xml');
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
      const dataUrl = await toPNG(getEffectiveContent(), $printerSettings);
      triggerDownload(dataUrl, getFilename('png'), 'image/png', true);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'PNG export failed';
      if (import.meta.env.DEV) console.error('[ExportButtons] PNG export:', err);
    } finally {
      isExportingPng = false;
    }
  }

  /**
   * Export the raw ESC/POS binary that would be sent to the printer.
   *
   * Uses the identical pipeline to the real print path — resolveContent() then
   * toEscPos() — so the .bin file is byte-for-byte identical to what the printer
   * receives. Useful for debugging printer issues without needing a live connection.
   *
   *   cat receipt.bin > /dev/usb/lp0
   */
  async function handleExportEscpos(): Promise<void> {
    await autoSaveIfDirty($editorContent, $printerSettings);
    isExportingEscpos = true;
    errorMessage = null;
    try {
      const bytes = await toEscPos(getEffectiveContent(), $printerSettings);
      triggerDownload(bytes, getFilename('bin'), 'application/octet-stream');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'ESC/POS export failed';
      if (import.meta.env.DEV) console.error('[ExportButtons] ESC/POS export:', err);
    } finally {
      isExportingEscpos = false;
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
  <button
    class="export-btn"
    onclick={() => {
      void handleExportEscpos();
    }}
    disabled={isExportingEscpos}
    aria-label="Export raw ESC/POS binary"
    title="Export the raw ESC/POS bytes that would be sent to the printer"
  >
    {isExportingEscpos ? 'Exporting…' : 'Export ESC/POS'}
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
