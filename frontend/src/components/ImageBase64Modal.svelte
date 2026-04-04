<script lang="ts">
  import { focusOnMount } from '$lib/actions';
  import Button from './common/Button.svelte';

  interface Props {
    oninsert: (snippet: string) => void;
    oncancel: () => void;
  }

  const { oninsert, oncancel }: Props = $props();

  let imageUrlInput = $state('');
  let imageVariableName = $state('imageBase64');
  let imageToolError = $state<string | null>(null);
  let imageToolBusy = $state(false);
  let generatedSnippet = $state<string | null>(null);
  let generatedSummary = $state<string | null>(null);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let selectedFileName = $state<string | null>(null);

  function isValidVariableName(name: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
  }

  function jsSingleQuoted(value: string): string {
    return value
      .replaceAll('\\', '\\\\')
      .replaceAll("'", "\\'")
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }

  function buildBase64VariableSnippet(variableName: string, base64Value: string): string {
    return `const ${variableName} = '${jsSingleQuoted(base64Value)}';`;
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Failed to read image data as base64'));
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image data'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function resetGeneratedState(): void {
    generatedSnippet = null;
    generatedSummary = null;
  }

  function handleVariableNameInput(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    imageVariableName = input.value;
    resetGeneratedState();
  }

  function handleImageUrlInput(event: Event): void {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    imageUrlInput = input.value;
    resetGeneratedState();
  }

  async function handleConvertFromUrl(): Promise<void> {
    const variableName = imageVariableName.trim();
    const imageUrl = imageUrlInput.trim();
    if (!isValidVariableName(variableName)) {
      imageToolError = 'Variable name must be a valid JavaScript identifier.';
      return;
    }
    if (imageUrl === '') {
      imageToolError = 'Please provide an image URL.';
      return;
    }

    imageToolBusy = true;
    imageToolError = null;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Image request failed (${response.status})`);
      }
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      generatedSnippet = buildBase64VariableSnippet(variableName, dataUrl);
      generatedSummary = `Ready from URL (${blob.type || 'image/*'}, ${String(blob.size)} bytes).`;
    } catch (err) {
      imageToolError =
        err instanceof Error
          ? `${err.message}. This URL must allow browser access (CORS).`
          : 'Failed to load image from URL.';
    } finally {
      imageToolBusy = false;
    }
  }

  async function handleImageUpload(event: Event): Promise<void> {
    const variableName = imageVariableName.trim();
    if (!isValidVariableName(variableName)) {
      imageToolError = 'Variable name must be a valid JavaScript identifier.';
      return;
    }

    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      imageToolError = 'Failed to read selected file.';
      return;
    }

    const file = input.files?.[0];
    if (file === undefined) {
      return;
    }
    selectedFileName = file.name;

    imageToolBusy = true;
    imageToolError = null;
    try {
      const dataUrl = await blobToDataUrl(file);
      generatedSnippet = buildBase64VariableSnippet(variableName, dataUrl);
      generatedSummary = `Ready from file ${file.name} (${file.type || 'image/*'}, ${String(file.size)} bytes).`;
      input.value = '';
    } catch (err) {
      imageToolError = err instanceof Error ? err.message : 'Failed to convert uploaded image.';
    } finally {
      imageToolBusy = false;
    }
  }

  function handleOpenFilePicker(): void {
    fileInputRef?.click();
  }

  function handleConfirmInsert(): void {
    if (generatedSnippet === null) {
      imageToolError = 'Convert an image first, then confirm insertion.';
      return;
    }
    oninsert(generatedSnippet);
  }
</script>

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
    aria-labelledby="image-base64-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    use:focusOnMount
  >
    <h2 class="modal-title" id="image-base64-title">Insert image as base64 variable</h2>

    <div class="field-block">
      <label class="field-label" for="base64-variable-input">Variable name</label>
      <input
        id="base64-variable-input"
        class="field-input"
        type="text"
        value={imageVariableName}
        oninput={handleVariableNameInput}
        placeholder="imageBase64"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div class="field-block">
      <label class="field-label" for="base64-url-input">Image URL</label>
      <div class="input-row">
        <input
          id="base64-url-input"
          class="field-input"
          type="url"
          value={imageUrlInput}
          oninput={handleImageUrlInput}
          placeholder="https://example.com/logo.png"
          autocomplete="off"
          spellcheck="false"
        />
        <Button variant="secondary" onclick={handleConvertFromUrl} isDisabled={imageToolBusy}>
          Convert URL
        </Button>
      </div>
    </div>

    <div class="field-block">
      <label class="field-label" for="base64-file-input">Upload image</label>
      <input
        id="base64-file-input"
        bind:this={fileInputRef}
        class="file-input-hidden"
        type="file"
        accept="image/*"
        onchange={handleImageUpload}
        disabled={imageToolBusy}
      />
      <div class="file-row">
        <Button variant="secondary" onclick={handleOpenFilePicker} isDisabled={imageToolBusy}>
          Choose file
        </Button>
        <span class="file-name" class:file-name-placeholder={selectedFileName === null}>
          {selectedFileName ?? 'No file selected'}
        </span>
      </div>
    </div>

    {#if generatedSummary !== null}
      <p class="success-message" role="status">{generatedSummary}</p>
    {/if}

    <a
      href="https://github.com/NielsLeenheer/ReceiptPrinterEncoder/blob/main/documentation/commands.md#image"
      target="_blank"
      rel="noreferrer"
      class="docs-link"
    >
      Open image docs
    </a>

    {#if imageToolError !== null}
      <p class="error-message" role="alert">{imageToolError}</p>
    {/if}

    <div class="modal-actions">
      <Button variant="secondary" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" onclick={handleConfirmInsert} isDisabled={generatedSnippet === null}>
        Confirm insert
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
    width: min(560px, calc(100vw - var(--rd-space-6)));
    max-height: calc(100vh - var(--rd-space-8));
    overflow: auto;
    background-color: var(--rd-color-bg-primary);
    border-radius: var(--rd-radius-md);
    box-shadow: var(--rd-shadow-lg);
    padding: var(--rd-space-6);
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-3);
  }

  .modal-title {
    font-size: var(--rd-font-lg);
    font-weight: var(--rd-font-weight-bold);
    color: var(--rd-color-text-primary);
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: var(--rd-space-1);
  }

  .field-label {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-secondary);
  }

  .field-input {
    width: 100%;
    border: 1px solid var(--rd-color-border);
    border-radius: var(--rd-radius-sm);
    background: var(--rd-color-bg-primary);
    color: var(--rd-color-text-primary);
    font-family: var(--rd-font-ui);
    font-size: var(--rd-font-sm);
    padding: var(--rd-space-2);
  }

  .input-row {
    display: flex;
    gap: var(--rd-space-2);
    align-items: center;
  }

  .input-row .field-input {
    min-width: 0;
    flex: 1;
  }

  .file-row {
    display: flex;
    gap: var(--rd-space-2);
    align-items: center;
  }

  .file-name {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-name-placeholder {
    color: var(--rd-color-text-muted);
  }

  .file-input-hidden {
    display: none;
  }

  .docs-link {
    align-self: flex-start;
    color: var(--rd-color-accent);
    text-decoration: none;
    font-size: var(--rd-font-sm);
  }

  .docs-link:hover {
    text-decoration: underline;
  }

  .success-message {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-success);
  }

  .error-message {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-error);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--rd-space-2);
  }
</style>
