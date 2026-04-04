<script lang="ts">
  import { resolveContent, toEscPos } from '$lib/pipeline';
  import { editorContent, printerSettings } from '$store/editorStore';
  import { currentDocument, autoSaveIfDirty } from '$store/documentStore';
  import { csvRows, csvMode, previewRowIndex } from '$store/placeholderStore';

  const REVOKE_OBJECT_URL_DELAY_MS = 1000;

  let isExportingEscpos = $state(false);
  let errorMessage = $state<string | null>(null);

  /**
   * Compute the effective content to export via the unified pipeline.
   * Returns only the row currently visible in the preview (singleRow=true).
   */
  function getEffectiveContent(): string {
    const resolved = resolveContent(
      $editorContent,
      $csvRows,
      $csvMode,
      $previewRowIndex,
      true,
      $currentDocument?.placeholderMeta ?? [],
    );
    return resolved[0] ?? $editorContent;
  }

  function triggerDownload(data: Uint8Array, filename: string, mimeType: string): void {
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
      const bytes = toEscPos(getEffectiveContent(), $printerSettings);
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
