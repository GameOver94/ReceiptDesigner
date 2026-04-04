<script lang="ts">
  import { encodeToCommands, encodeToCommandsDebounced, encodeToBytes } from '$lib/encoder';
  import type { EncoderCommandLine } from '$lib/encoder';
  import bwipjs from 'bwip-js';
  import type { EncoderCommandsOutput, EncoderLinesOutput, EncoderCommand } from '$lib/encoder';
  import { resolveContent } from '$lib/pipeline';
  import { currentDocument } from '$store/documentStore';
  import { editorContent, imagePreviewScale, printerSettings } from '$store/editorStore';
  import { csvRows, csvMode, previewRowIndex, setPreviewRowIndex } from '$store/placeholderStore';

  // ---------------------------------------------------------------------------
  // Tab state
  // ---------------------------------------------------------------------------

  type PreviewTab = 'text' | 'commands' | 'encoded' | 'output';
  const TABS: { id: PreviewTab; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'commands', label: 'Commands' },
    { id: 'encoded', label: 'Encoded' },
    { id: 'output', label: 'Output' },
  ];

  let activeTab = $state<PreviewTab>('text');
  let commandRunVersion = 0;
  let outputRunVersion = 0;

  // ---------------------------------------------------------------------------
  // Encode output state
  // ---------------------------------------------------------------------------

  let commandsOutput = $state<EncoderCommandsOutput | null>(null);
  let encodeError = $state<string | null>(null);

  function lineItemModeError(content: string, mode: 'batch' | 'line-item' | null): string | null {
    if (!content.includes('{{#items}}') && !content.includes('{{/items}}')) {
      return null;
    }
    if (mode === 'batch' || mode === null) {
      return 'Line-item placeholders ({{#items}}...{{/items}}) require CSV line-item mode.';
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Derived values for navigation
  // ---------------------------------------------------------------------------

  let isBatchMode = $derived($csvMode === 'batch' && $csvRows.length > 0);
  let totalRows = $derived($csvRows.length);
  let currentRow = $derived($previewRowIndex + 1);

  // ---------------------------------------------------------------------------
  // Main render effect
  // ---------------------------------------------------------------------------

  /**
   * Resolved effective content reused across tabs/effects.
   * Keeps placeholder resolution centralized in one reactive computation.
   */
  let effectiveContent = $derived(
    $editorContent.trim() === ''
      ? null
      : (resolveContent(
          $editorContent,
          $csvRows,
          $csvMode,
          $previewRowIndex,
          true,
          $currentDocument?.placeholderMeta ?? [],
        )[0] ?? $editorContent),
  );

  $effect(() => {
    const content = $editorContent;
    const settings = $printerSettings;
    const mode = $csvMode;
    const modeError = lineItemModeError(content, mode);

    if (modeError !== null) {
      commandsOutput = null;
      encodeError = modeError;
      return;
    }

    const contentToEncode = effectiveContent ?? content;
    const runVersion = commandRunVersion + 1;
    commandRunVersion = runVersion;

    if (isBatchMode) {
      // Immediate render when navigating batch rows — skip debounce.
      void encodeToCommands(contentToEncode, settings)
        .then((result) => {
          if (runVersion !== commandRunVersion) return;
          commandsOutput = result;
          encodeError = null;
        })
        .catch((err: unknown) => {
          if (runVersion !== commandRunVersion) return;
          commandsOutput = null;
          encodeError = err instanceof Error ? err.message : String(err);
        });
      return;
    }

    encodeToCommandsDebounced(contentToEncode, settings, (result, error) => {
      if (runVersion !== commandRunVersion) return;
      commandsOutput = result;
      encodeError = error;
    });
  });

  $effect(() => {
    if (activeTab !== 'output' || effectiveContent === null || modeValidationError !== null) {
      hexDump = [];
      return;
    }

    const content = effectiveContent;
    const settings = $printerSettings;
    const runVersion = outputRunVersion + 1;
    outputRunVersion = runVersion;

    void encodeToBytes(content, settings)
      .then((bytes) => {
        if (outputRunVersion !== runVersion) return;
        hexDump = _buildHexDump(bytes);
      })
      .catch(() => {
        if (outputRunVersion !== runVersion) return;
        hexDump = [];
      });
  });

  // ---------------------------------------------------------------------------
  // Derived per-tab data (computed lazily from commandsOutput)
  // ---------------------------------------------------------------------------

  /** Columns for the current settings — used by Text tab for line width */
  let columns = $derived($printerSettings.columns);

  let modeValidationError = $derived(lineItemModeError($editorContent, $csvMode));
  let encodeErrorTitle = $derived(
    encodeError !== null && encodeError.startsWith('Line-item placeholders')
      ? 'Template mode warning:'
      : 'Encoder error:',
  );

  /**
   * A single rendered character cell, matching the playground's per-character model.
   *
   * The playground (Text.svelte) renders every character as its own <span class="character">.
   * Each cell has a fixed pixel width (8px for Font A, 6px for Font B) and the same
   * line-height (16px for both). Scale commands (double-wide, double-tall, etc.) multiply
   * the cell width and line-height by the respective scale factor.
   *
   * Playground reference values:
   *   Font A: font-size 13px, cell width 8px,  line-height 16px
   *   Font B: font-size 10px, cell width 6px,  line-height 16px
   *   line margin-bottom: 4px (= 16px / 4)
   */
  interface TextChar {
    ch: string;
    font: 'a' | 'b';
    bold: boolean;
    italic: boolean;
    underline: boolean;
    invert: boolean;
    /** width multiplier from size command (1–4) */
    scaleX: number;
    /** height multiplier from size command (1–4) */
    scaleY: number;
    align: 'left' | 'center' | 'right';
  }

  interface RenderableBarcode {
    symbology: string;
    data: string;
    width: number;
    height: number;
    text: boolean;
    align: 'left' | 'center' | 'right';
  }

  interface RenderableQrcode {
    data: string;
    size: number;
    errorlevel: 'l' | 'm' | 'q' | 'h';
    align: 'left' | 'center' | 'right';
  }

  interface RenderablePdf417 {
    data: string;
    rows: number;
    columns: number;
    width: number;
    height: number;
    errorlevel: number;
    align: 'left' | 'center' | 'right';
  }

  interface RenderableImage {
    width: number;
    chunks: { width: number; height: number; mode: string; payload: number[] }[];
    align: 'left' | 'center' | 'right';
    language: string;
    previewScale: number;
  }

  /** A line of printable characters, cut marker, or machine-code symbol preview. */
  type TextLine =
    | { kind: 'chars'; chars: TextChar[] }
    | { kind: 'feed' }
    | { kind: 'cut' }
    | { kind: 'barcode'; barcode: RenderableBarcode }
    | { kind: 'qrcode'; qrcode: RenderableQrcode }
    | { kind: 'pdf417'; pdf417: RenderablePdf417 }
    | { kind: 'image'; image: RenderableImage };

  let textLines: TextLine[] = $derived(
    commandsOutput === null
      ? []
      : _commandsToTextLines(
          commandsOutput,
          $printerSettings.feedBeforeCut,
          $printerSettings.language,
        ),
  );

  function _commandsToTextLines(
    output: EncoderCommandsOutput,
    feedBeforeCut: number,
    language: string,
  ): TextLine[] {
    const lines: TextLine[] = [];

    // All printer state is initialised ONCE and carries over across line boundaries,
    // exactly matching the playground (Text.svelte in ReceiptPrinterPlayground).
    // A real ESC/POS printer never resets state at end-of-line — it accumulates
    // until an explicit command changes it.
    let bold = false;
    let italic = false;
    let underline = false;
    let invert = false;
    let scaleX = 1;
    let scaleY = 1;
    let align: 'left' | 'center' | 'right' = 'left';
    let font: 'a' | 'b' = 'a';

    const isEmptyOnlyLine = (lineObj: EncoderCommandLine): boolean =>
      lineObj.commands.length > 0 && lineObj.commands.every((c) => c.type === 'empty');
    const isCutLine = (lineObj: EncoderCommandLine): boolean =>
      lineObj.commands.some((c) => c.type === 'cut');
    const isConfiguredFeedBeforeCutAt = (index: number): boolean => {
      const configuredFeed = Math.max(0, feedBeforeCut);
      if (configuredFeed === 0) return false;
      if (!isEmptyOnlyLine(output[index] as EncoderCommandLine)) return false;

      // Find the next non-empty line after this empty line.
      let nextNonEmpty = -1;
      for (let i = index + 1; i < output.length; i += 1) {
        const next = output[i] as EncoderCommandLine;
        if (!isEmptyOnlyLine(next)) {
          nextNonEmpty = i;
          break;
        }
      }

      if (nextNonEmpty === -1 || !isCutLine(output[nextNonEmpty] as EncoderCommandLine)) {
        return false;
      }

      // Only highlight the last `feedBeforeCut` empty lines immediately before the cut.
      const lastEmptyBeforeCut = nextNonEmpty - 1;
      let firstEmptyBeforeCut = lastEmptyBeforeCut;
      while (
        firstEmptyBeforeCut >= 0 &&
        isEmptyOnlyLine(output[firstEmptyBeforeCut] as EncoderCommandLine)
      ) {
        firstEmptyBeforeCut -= 1;
      }
      firstEmptyBeforeCut += 1;

      const highlightedStart = Math.max(
        firstEmptyBeforeCut,
        lastEmptyBeforeCut - configuredFeed + 1,
      );
      return index >= highlightedStart && index <= lastEmptyBeforeCut;
    };

    for (let lineIndex = 0; lineIndex < output.length; lineIndex += 1) {
      const lineObj = output[lineIndex] as EncoderCommandLine;
      const chars: TextChar[] = [];
      let barcode: RenderableBarcode | null = null;
      let qrcode: RenderableQrcode | null = null;
      let pdf417: RenderablePdf417 | null = null;
      let image: RenderableImage | null = null;

      let barcodeState: Partial<RenderableBarcode> = {};
      let qrcodeState: Partial<Omit<RenderableQrcode, 'align'>> = {};
      let pdf417State: Partial<Omit<RenderablePdf417, 'align'>> = {};
      const imageChunks: { width: number; height: number; mode: string; payload: number[] }[] = [];

      for (const cmd of lineObj.commands) {
        if (cmd.type === 'text' && typeof cmd.value === 'string') {
          for (const ch of cmd.value) {
            chars.push({ ch, font, bold, italic, underline, invert, scaleX, scaleY, align });
          }
        } else if (cmd.type === 'align') {
          // playground: command.type === 'align' (top-level, not a style property)
          const v = cmd.value;
          if (v === 'left' || v === 'center' || v === 'right') align = v;
        } else if (cmd.type === 'font') {
          // playground: font = `font${command.value.toLowerCase()}`  ('A'→'fonta', 'B'→'fontb')
          const v = cmd.value;
          font = v === 'B' || v === 'b' ? 'b' : 'a';
        } else if (cmd.type === 'style') {
          // playground: classes.add/delete(command.property) for boolean style properties
          if (cmd.property === 'bold') {
            bold = cmd.value === true;
          } else if (cmd.property === 'italic') {
            italic = cmd.value === true;
          } else if (cmd.property === 'underline') {
            underline = cmd.value === true;
          } else if (cmd.property === 'invert') {
            invert = cmd.value === true;
          } else if (cmd.property === 'size') {
            // playground: size = command.value.width > 1 || command.value.height > 1
            //               ? `scale w${w} h${h}` : ''
            const sizeVal = cmd.value as { width?: number; height?: number } | undefined;
            scaleX = sizeVal?.width ?? 1;
            scaleY = sizeVal?.height ?? 1;
          }
        } else if (cmd.type === 'barcode') {
          if (cmd.property === 'width' && typeof cmd.value === 'number') {
            barcodeState.width = cmd.value;
          } else if (cmd.property === 'height' && typeof cmd.value === 'number') {
            barcodeState.height = cmd.value;
          } else if (cmd.property === 'text' && typeof cmd.value === 'boolean') {
            barcodeState.text = cmd.value;
          } else if (cmd.value !== null && typeof cmd.value === 'object') {
            const value = cmd.value as Record<string, unknown>;
            const data = value['data'];
            const symbology = value['symbology'];
            if (typeof data === 'string' && data.length > 0 && typeof symbology === 'string') {
              barcode = {
                symbology,
                data,
                width: barcodeState.width ?? 2,
                height: barcodeState.height ?? 60,
                text: barcodeState.text ?? false,
                align,
              };
              barcodeState = {};
            }
          }
        } else if (cmd.type === 'qrcode') {
          if (cmd.property === 'size' && typeof cmd.value === 'number') {
            qrcodeState.size = cmd.value;
          } else if (
            cmd.property === 'errorlevel' &&
            typeof cmd.value === 'string' &&
            ['l', 'm', 'q', 'h'].includes(cmd.value)
          ) {
            qrcodeState.errorlevel = cmd.value as 'l' | 'm' | 'q' | 'h';
          } else if (
            cmd.property === 'data' &&
            typeof cmd.value === 'string' &&
            cmd.value.length > 0
          ) {
            qrcodeState.data = cmd.value;
          } else if (cmd.command === 'print' && typeof qrcodeState.data === 'string') {
            qrcode = {
              data: qrcodeState.data,
              size: qrcodeState.size ?? 6,
              errorlevel: qrcodeState.errorlevel ?? 'm',
              align,
            };
            qrcodeState = {};
          }
        } else if (cmd.type === 'pdf417') {
          if (cmd.property === 'rows' && typeof cmd.value === 'number') {
            pdf417State.rows = cmd.value;
          } else if (cmd.property === 'columns' && typeof cmd.value === 'number') {
            pdf417State.columns = cmd.value;
          } else if (cmd.property === 'width' && typeof cmd.value === 'number') {
            pdf417State.width = cmd.value;
          } else if (cmd.property === 'height' && typeof cmd.value === 'number') {
            pdf417State.height = cmd.value;
          } else if (cmd.property === 'errorlevel' && typeof cmd.value === 'number') {
            pdf417State.errorlevel = cmd.value;
          } else if (
            cmd.property === 'data' &&
            typeof cmd.value === 'string' &&
            cmd.value.length > 0
          ) {
            pdf417State.data = cmd.value;
          } else if (cmd.command === 'print' && typeof pdf417State.data === 'string') {
            pdf417 = {
              data: pdf417State.data,
              rows: pdf417State.rows ?? 0,
              columns: pdf417State.columns ?? 0,
              width: pdf417State.width ?? 3,
              height: pdf417State.height ?? 3,
              errorlevel: pdf417State.errorlevel ?? 1,
              align,
            };
            pdf417State = {};
          }
        } else if (cmd.type === 'image') {
          const maybeWidth = (cmd as { width?: unknown }).width;
          const maybeHeight = (cmd as { height?: unknown }).height;
          const maybeMode = cmd.value;
          const maybePayload = cmd.payload;

          if (
            typeof maybeWidth === 'number' &&
            typeof maybeHeight === 'number' &&
            Array.isArray(maybePayload)
          ) {
            imageChunks.push({
              width: maybeWidth,
              height: Math.max(1, maybeHeight),
              mode: typeof maybeMode === 'string' ? maybeMode : 'image',
              payload: maybePayload,
            });

            image = {
              width: imageChunks[0]?.width ?? maybeWidth,
              chunks: [...imageChunks],
              align,
              language,
              previewScale: $imagePreviewScale,
            };
          }
        }
        // initialize / codepage / character-mode — no visible output
      }
      // A cut command gets its own cut-marker entry; everything else (including
      // empty lines from newline()) is pushed as a chars line so blank lines
      // render as visible vertical space via the min-height on .receipt-line.
      const hasCut = lineObj.commands.some((c) => c.type === 'cut');
      if (hasCut) {
        if (chars.length > 0) {
          lines.push({ kind: 'chars', chars });
        }
        lines.push({ kind: 'cut' });
      } else if (barcode !== null) {
        lines.push({ kind: 'barcode', barcode });
      } else if (qrcode !== null) {
        lines.push({ kind: 'qrcode', qrcode });
      } else if (pdf417 !== null) {
        lines.push({ kind: 'pdf417', pdf417 });
      } else if (image !== null) {
        lines.push({ kind: 'image', image });
      } else if (chars.length === 0 && isConfiguredFeedBeforeCutAt(lineIndex)) {
        lines.push({ kind: 'feed' });
      } else {
        lines.push({ kind: 'chars', chars });
      }
    }
    return lines;
  }

  /**
   * Colour for a command type badge (Commands tab).
   * Mirrors the playground's colour scheme.
   */
  function commandColor(type: string): string {
    const map: Record<string, string> = {
      text: 'cmd-text',
      style: 'cmd-style',
      initialize: 'cmd-initialize',
      'character-mode': 'cmd-charmode',
      font: 'cmd-font',
      codepage: 'cmd-codepage',
      empty: 'cmd-newline',
      cut: 'cmd-cut',
      image: 'cmd-image',
      barcode: 'cmd-barcode',
      qrcode: 'cmd-qrcode',
      pdf417: 'cmd-pdf417',
      raw: 'cmd-raw',
    };
    return map[type] ?? 'cmd-default';
  }

  /** Format a command value for display */
  function formatCommandValue(cmd: EncoderCommand): string {
    if (cmd.value === undefined || cmd.value === null) return '';
    if (typeof cmd.value === 'string') {
      const escaped = cmd.value.replace(/\n/g, '↵').replace(/\t/g, '→');
      return escaped.length > 30 ? `"${escaped.slice(0, 30)}…"` : `"${escaped}"`;
    }
    if (typeof cmd.value === 'boolean') return String(cmd.value);
    if (typeof cmd.value === 'number') return String(cmd.value);
    return JSON.stringify(cmd.value).slice(0, 40);
  }

  // ---------------------------------------------------------------------------
  // Encoded tab data
  // ---------------------------------------------------------------------------

  let linesOutput: EncoderLinesOutput = $derived(
    (() => {
      if (activeTab !== 'encoded') return [];
      if (commandsOutput === null || modeValidationError !== null) return [];
      return commandsOutput.map((lineObj) => lineObj.commands);
    })(),
  );

  function payloadToHex(payload: number[] | undefined): string {
    if (payload === undefined || payload.length === 0) return '';
    return payload.map((b) => b.toString(16).padStart(2, '0')).join(' ');
  }

  function cmdSummary(cmd: EncoderCommand): string {
    const parts: string[] = [cmd.type];
    if (cmd.property !== undefined) parts.push(cmd.property);
    if (cmd.value !== undefined && cmd.value !== null) {
      const v =
        typeof cmd.value === 'string'
          ? `"${cmd.value.slice(0, 20)}"`
          : JSON.stringify(cmd.value).slice(0, 20);
      parts.push(v);
    }
    return parts.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Output tab data (hex dump)
  // ---------------------------------------------------------------------------

  interface HexDumpRow {
    offset: string;
    hex: string;
    ascii: string;
  }

  let hexDump = $state<HexDumpRow[]>([]);

  function _buildHexDump(bytes: Uint8Array): HexDumpRow[] {
    const COLS = 16;
    const rows: HexDumpRow[] = [];
    for (let i = 0; i < bytes.length; i += COLS) {
      const chunk = bytes.slice(i, i + COLS);
      const hex = Array.from(chunk)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
        .padEnd(COLS * 3 - 1, ' ');
      const ascii = Array.from(chunk)
        .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'))
        .join('');
      rows.push({
        offset: i.toString(16).padStart(8, '0'),
        hex,
        ascii,
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Batch navigation
  // ---------------------------------------------------------------------------

  function handlePrevRow(): void {
    setPreviewRowIndex($previewRowIndex - 1);
  }

  function handleNextRow(): void {
    setPreviewRowIndex($previewRowIndex + 1);
  }

  const BARCODE_BCIDS: Record<string, string> = {
    upca: 'upca',
    upce: 'upce',
    ean13: 'ean13',
    ean8: 'ean8',
    code39: 'code39',
    coda39: 'code39',
    itf: 'interleaved2of5',
    'interleaved-2-of-5': 'interleaved2of5',
    'nw-7': 'rationalizedCodabar',
    codabar: 'rationalizedCodabar',
    code93: 'code93',
    code128: 'code128',
    'gs1-128': 'gs1-128',
    'gs1-databar-omni': 'databaromni',
    'gs1-databar-truncated': 'databartruncated',
    'gs1-databar-limited': 'databarlimited',
    'gs1-databar-expanded': 'databarexpanded',
    'code128-auto': 'code128',
  };

  const SYMBOL_PREVIEW_SCALE = 0.33;

  function clearCanvas(node: HTMLCanvasElement): void {
    const ctx = node.getContext('2d');
    if (ctx !== null) {
      ctx.clearRect(0, 0, node.width, node.height);
    }
  }

  function setCanvasDisplayScale(node: HTMLCanvasElement, scale: number): void {
    const safeScale = Math.max(0.05, scale);
    node.style.width = `${Math.max(1, Math.round(node.width * safeScale))}px`;
    node.style.height = `${Math.max(1, Math.round(node.height * safeScale))}px`;
  }

  function drawWithFallback(node: HTMLCanvasElement, drawFn: () => void, scale: number = 1): void {
    try {
      drawFn();
      setCanvasDisplayScale(node, scale);
    } catch {
      clearCanvas(node);
    }
  }

  function drawBarcode(node: HTMLCanvasElement, barcode: RenderableBarcode): void {
    drawWithFallback(node, () => {
      const bcid = BARCODE_BCIDS[barcode.symbology] ?? 'code128';
      const height = Math.max(1, barcode.height / Math.max(1, barcode.width) / 4);

      bwipjs.toCanvas(node, {
        bcid,
        text: barcode.data,
        height,
        scale: Math.max(1, barcode.width),
        includetext: barcode.text,
        textsize: 8,
        paddingwidth: 0,
        paddingheight: 0,
      });
    });
  }

  function barcodeAction(node: HTMLCanvasElement, barcode: RenderableBarcode) {
    drawBarcode(node, barcode);
    return {
      update(next: RenderableBarcode) {
        drawBarcode(node, next);
      },
    };
  }

  function drawQrcode(node: HTMLCanvasElement, qrcode: RenderableQrcode): void {
    drawWithFallback(
      node,
      () => {
        bwipjs.toCanvas(node, {
          bcid: 'qrcode',
          text: qrcode.data,
          eclevel: qrcode.errorlevel.toUpperCase(),
          scale: Math.max(1, qrcode.size),
          paddingwidth: 0,
          paddingheight: 0,
        });
      },
      SYMBOL_PREVIEW_SCALE,
    );
  }

  function qrcodeAction(node: HTMLCanvasElement, qrcode: RenderableQrcode) {
    drawQrcode(node, qrcode);
    return {
      update(next: RenderableQrcode) {
        drawQrcode(node, next);
      },
    };
  }

  function drawPdf417(node: HTMLCanvasElement, pdf417: RenderablePdf417): void {
    drawWithFallback(
      node,
      () => {
        bwipjs.toCanvas(node, {
          bcid: 'pdf417',
          text: pdf417.data,
          eclevel: pdf417.errorlevel,
          rows: pdf417.rows,
          columns: pdf417.columns,
          scaleX: Math.max(1, pdf417.width * 2),
          scaleY: Math.max(1, Math.round((pdf417.height * pdf417.width) / 2)),
          paddingwidth: 0,
          paddingheight: 0,
        });
      },
      SYMBOL_PREVIEW_SCALE,
    );
  }

  function pdf417Action(node: HTMLCanvasElement, pdf417: RenderablePdf417) {
    drawPdf417(node, pdf417);
    return {
      update(next: RenderablePdf417) {
        drawPdf417(node, next);
      },
    };
  }

  function drawImagePreview(node: HTMLCanvasElement, image: RenderableImage): void {
    const width = Math.max(8, image.width);
    const height = Math.max(
      8,
      image.chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.height), 0),
    );
    node.width = width;
    node.height = height;

    const ctx = node.getContext('2d');
    if (ctx === null) {
      return;
    }

    const styles = getComputedStyle(node);
    const paperColor = styles.getPropertyValue('--rd-color-bg-primary').trim() || '#fff';
    const inkColor = styles.getPropertyValue('--rd-color-text-primary').trim() || '#111';

    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, width, height);

    let yOffset = 0;
    for (const chunk of image.chunks) {
      const chunkWidth = Math.max(8, chunk.width);
      const chunkHeight = Math.max(1, chunk.height);
      // ESC/POS image rows are zero-padded to full bytes, so use ceil(width/8).
      const bytesPerRow = Math.ceil(chunkWidth / 8);
      // Header byte offsets by mode/language:
      //   raster  (GS v0) : 4-byte fixed header + 4-byte size fields = 8 bytes
      //   column  esc-pos : 3-byte command + 1-byte x/y density + 1-byte columns = 5 bytes
      //   column  star    : 3-byte command + 1-byte columns = 4 bytes
      const skip = chunk.mode === 'raster' ? 8 : image.language === 'esc-pos' ? 5 : 4;

      for (let y = 0; y < chunkHeight; y += 1) {
        for (let x = 0; x < chunkWidth; x += 1) {
          let bit = 0;

          if (chunk.mode === 'raster') {
            const byteIndex = y * bytesPerRow + (x >> 3) + skip;
            const byte = chunk.payload[byteIndex] ?? 0;
            bit = (byte >> (7 - (x % 8))) & 1;
          } else {
            const byteIndex = x * 3 + Math.floor(y / 8) + skip;
            const byte = chunk.payload[byteIndex] ?? 0;
            bit = (byte >> (7 - (y % 8))) & 1;
          }

          if (bit === 1) {
            ctx.fillStyle = inkColor;
            ctx.fillRect(x, y + yOffset, 1, 1);
          }
        }
      }

      yOffset += chunkHeight;
    }

    setCanvasDisplayScale(node, image.previewScale);
  }

  function imageAction(node: HTMLCanvasElement, image: RenderableImage) {
    drawImagePreview(node, image);
    return {
      update(next: RenderableImage) {
        drawImagePreview(node, next);
      },
    };
  }
</script>

<!--
  Preview pane — 4-tab playground-style preview.
  Tabs: Text | Commands | Encoded | Output.
  See docs/design.md §10.5.
-->
<section class="preview-pane" aria-label="Receipt preview">
  <!-- Tab bar -->
  <div class="preview-toolbar">
    <div class="tab-bar" role="tablist" aria-label="Preview tabs">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:is-active={activeTab === tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          onclick={() => {
            activeTab = tab.id;
          }}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    {#if $csvMode !== null}
      <span class="csv-mode-label">
        {$csvMode === 'batch' ? 'Batch mode' : 'Line-item mode'}
      </span>
    {/if}
  </div>

  <!-- Tab panels -->
  <div class="preview-scroll">
    <!-- ── Text tab ─────────────────────────────────────────────────── -->
    {#if activeTab === 'text'}
      <div id="panel-text" role="tabpanel" aria-labelledby="tab-text" class="panel-text">
        {#if encodeError !== null}
          <div class="encode-error">
            <strong>{encodeErrorTitle}</strong>
            <pre class="error-pre">{encodeError}</pre>
          </div>
        {:else if textLines.length === 0}
          <div class="preview-placeholder">
            <p>Start typing encoder code to see the receipt preview.</p>
            <p>
              Example: <code>encoder.initialize().line('Hello World').newline().cut()</code>
            </p>
          </div>
        {:else}
          <div class="receipt-paper" style:--receipt-cols={columns}>
            {#each textLines as line}
              {#if line.kind === 'cut'}
                <div class="receipt-cut" aria-label="Paper cut"></div>
              {:else if line.kind === 'feed'}
                <div class="receipt-feed-line" aria-label="Feed before cut"></div>
              {:else if line.kind === 'barcode'}
                <div
                  class="receipt-line receipt-symbol-line"
                  class:align-center={line.barcode.align === 'center'}
                  class:align-right={line.barcode.align === 'right'}
                >
                  <div class="symbol-wrap barcode-wrap" aria-label="Barcode">
                    <canvas use:barcodeAction={line.barcode} class="barcode-canvas"></canvas>
                  </div>
                </div>
              {:else if line.kind === 'qrcode'}
                <div
                  class="receipt-line receipt-symbol-line"
                  class:align-center={line.qrcode.align === 'center'}
                  class:align-right={line.qrcode.align === 'right'}
                >
                  <div class="symbol-wrap qrcode-wrap" aria-label="QR code">
                    <canvas use:qrcodeAction={line.qrcode} class="qrcode-canvas"></canvas>
                  </div>
                </div>
              {:else if line.kind === 'pdf417'}
                <div
                  class="receipt-line receipt-symbol-line"
                  class:align-center={line.pdf417.align === 'center'}
                  class:align-right={line.pdf417.align === 'right'}
                >
                  <div class="symbol-wrap pdf417-wrap" aria-label="PDF417">
                    <canvas use:pdf417Action={line.pdf417} class="pdf417-canvas"></canvas>
                  </div>
                </div>
              {:else if line.kind === 'image'}
                <div
                  class="receipt-line receipt-symbol-line"
                  class:align-center={line.image.align === 'center'}
                  class:align-right={line.image.align === 'right'}
                >
                  <div class="symbol-wrap image-wrap" aria-label="Image preview">
                    <canvas use:imageAction={line.image} class="image-canvas"></canvas>
                  </div>
                </div>
              {:else}
                <div
                  class="receipt-line"
                  class:align-center={line.chars[0]?.align === 'center'}
                  class:align-right={line.chars[0]?.align === 'right'}
                >
                  {#each line.chars as char}
                    <span
                      class="receipt-char"
                      class:is-font-b={char.font === 'b'}
                      class:is-bold={char.bold}
                      class:is-italic={char.italic}
                      class:is-underline={char.underline}
                      class:is-invert={char.invert}
                      class:is-scaled={char.scaleX > 1 || char.scaleY > 1}
                      style:--sx={char.scaleX}
                      style:--sy={char.scaleY}>{char.ch}</span
                    >
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Commands tab ──────────────────────────────────────────────── -->
    {#if activeTab === 'commands'}
      <div
        id="panel-commands"
        role="tabpanel"
        aria-labelledby="tab-commands"
        class="panel-commands"
      >
        {#if encodeError !== null}
          <div class="encode-error">
            <strong>{encodeErrorTitle}</strong>
            <pre class="error-pre">{encodeError}</pre>
          </div>
        {:else if commandsOutput === null || commandsOutput.length === 0}
          <div class="preview-placeholder">
            <p>No commands yet. Start typing encoder code.</p>
          </div>
        {:else}
          <div class="commands-list">
            {#each commandsOutput as lineObj, lineIdx}
              <div class="commands-line">
                <span class="line-num">{lineIdx + 1}</span>
                <div class="line-tokens">
                  {#each lineObj.commands as cmd}
                    <span class="cmd-token {commandColor(cmd.type)}">
                      <span class="cmd-name"
                        >{cmd.type}{cmd.property !== undefined ? ` ${cmd.property}` : ''}</span
                      >
                      {#if cmd.value !== undefined && cmd.value !== null && cmd.value !== ''}
                        <span class="cmd-value">{formatCommandValue(cmd)}</span>
                      {/if}
                      {#if cmd.codepage !== undefined && cmd.codepage !== null}
                        <span class="cmd-codepage">{cmd.codepage}</span>
                      {/if}
                    </span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Encoded tab ───────────────────────────────────────────────── -->
    {#if activeTab === 'encoded'}
      <div id="panel-encoded" role="tabpanel" aria-labelledby="tab-encoded" class="panel-encoded">
        {#if linesOutput.length === 0}
          <div class="preview-placeholder">
            <p>No encoded output yet.</p>
          </div>
        {:else}
          <div class="encoded-list">
            {#each linesOutput as lineCommands, idx}
              <div class="encoded-line">
                <span class="line-num">{idx + 1}</span>
                <div class="encoded-cmds">
                  {#each lineCommands as cmd}
                    <span class="encoded-cmd {commandColor(cmd.type)}">
                      <span class="encoded-cmd-label">{cmdSummary(cmd)}</span>
                      {#if cmd.payload !== undefined && cmd.payload.length > 0}
                        <span class="encoded-cmd-hex">{payloadToHex(cmd.payload)}</span>
                      {/if}
                    </span>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Output tab ────────────────────────────────────────────────── -->
    {#if activeTab === 'output'}
      <div id="panel-output" role="tabpanel" aria-labelledby="tab-output" class="panel-output">
        {#if hexDump.length === 0}
          <div class="preview-placeholder">
            <p>No output yet.</p>
          </div>
        {:else}
          <div class="hex-dump">
            <div class="hex-header">
              <span class="hex-offset">Offset</span>
              <span class="hex-bytes">Bytes</span>
              <span class="hex-ascii">ASCII</span>
            </div>
            {#each hexDump as row}
              <div class="hex-row">
                <span class="hex-offset">{row.offset}</span>
                <span class="hex-bytes">{row.hex}</span>
                <span class="hex-ascii">{row.ascii}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Batch navigation bar -->
  {#if isBatchMode}
    <div class="batch-nav" aria-label="Batch navigation">
      <button
        class="nav-btn"
        onclick={handlePrevRow}
        disabled={$previewRowIndex === 0}
        aria-label="Previous row"
      >
        ← Prev
      </button>
      <span class="row-indicator" aria-live="polite">
        Row {currentRow} of {totalRows}
      </span>
      <button
        class="nav-btn"
        onclick={handleNextRow}
        disabled={$previewRowIndex >= totalRows - 1}
        aria-label="Next row"
      >
        Next →
      </button>
    </div>
  {/if}
</section>

<style>
  .preview-pane {
    grid-area: preview;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--rd-color-preview-bg);
    border-right: 1px solid var(--rd-color-outline-variant);
  }

  /* ── Tab bar ─────────────────────────────────────────────────────── */

  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: var(--rd-space-3);
    padding: 0 var(--rd-space-3);
    border-bottom: 1px solid var(--rd-color-outline-variant);
    background-color: var(--rd-color-surface-container);
    flex-shrink: 0;
  }

  .tab-bar {
    display: flex;
    gap: 0;
  }

  .tab-btn {
    padding: var(--rd-space-2) var(--rd-space-3);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    color: var(--rd-color-on-surface-variant);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition:
      color var(--rd-transition-fast),
      border-color var(--rd-transition-fast);
  }

  .tab-btn:hover {
    color: var(--rd-color-text-primary);
  }

  .tab-btn.is-active {
    color: var(--rd-color-primary);
    border-bottom-color: var(--rd-color-primary);
  }

  .csv-mode-label {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-placeholder);
    background-color: var(--rd-color-placeholder-bg);
    padding: var(--rd-space-px) var(--rd-space-2);
    border-radius: var(--rd-radius-full);
    font-weight: var(--rd-font-weight-medium);
    margin-left: auto;
    margin-right: var(--rd-space-1);
  }

  /* ── Scrollable panel area ───────────────────────────────────────── */

  .preview-scroll {
    flex: 1;
    overflow-y: auto;
    padding: var(--rd-space-4);
  }

  .preview-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--rd-space-2);
    color: var(--rd-color-on-surface-variant);
    font-size: var(--rd-font-base);
    text-align: center;
    max-width: 360px;
    margin: var(--rd-space-8) auto;
  }

  .preview-placeholder code {
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-sm);
    background-color: var(--rd-color-surface-high);
    padding: var(--rd-space-px) var(--rd-space-1);
    border-radius: var(--rd-radius-sm);
  }

  .encode-error {
    background-color: color-mix(in srgb, var(--rd-color-error) 10%, transparent);
    border: 1px solid var(--rd-color-error);
    border-radius: var(--rd-radius-sm);
    padding: var(--rd-space-3);
    color: var(--rd-color-error);
    font-size: var(--rd-font-sm);
  }

  .error-pre {
    margin: var(--rd-space-2) 0 0;
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-xs);
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* ── Text tab — receipt paper simulation ────────────────────────── */

  /*
   * Per-character cell model matching the ReceiptPrinterPlayground exactly.
   * Every character is its own <span class="receipt-char"> with a fixed pixel
   * width. Font A and B have different cell widths but the same line-height.
   *
   * Playground reference values (Text.svelte in ReceiptPrinterPlayground):
   *   Font A: font-size 13px, cell width  8px, line-height 16px
   *   Font B: font-size 10px, cell width  6px, line-height 16px
   *   line margin-bottom: 4px  (= 16px / 4)
   *
   * Font stack from playground app.css:
   *   ui-monospace, 'SF Mono', SFMono-Regular, Menlo,
   *   "Cascadia Mono", Consolas, monospace
   */

  .receipt-paper {
    /* Font A sizing tokens */
    --size-a: 13px;
    --width-a: 8px;
    --height-a: 16px;
    /* Font B sizing tokens */
    --size-b: 10px;
    --width-b: 6px;
    --height-b: 16px;

    background-color: var(--rd-color-bg-primary);
    box-shadow: var(--rd-shadow-md);
    border-radius: var(--rd-radius-sm);
    padding: var(--rd-space-6) var(--rd-space-8);
    /*
     * Paper content width = columns × Font-A cell width.
     * Use box-sizing: content-box (the default) so padding is added on top,
     * identical to the playground's layout. The line characters fill exactly
     * columns × 8px regardless of padding.
     */
    box-sizing: content-box;
    width: calc(var(--receipt-cols, 48) * var(--width-a));
    overflow-x: auto;
    margin: 0 auto;
  }

  .receipt-line {
    display: flex;
    flex-wrap: wrap;
    min-height: var(--height-a);
    /* 4px gap between lines, matching playground: margin-bottom = height-a / 4 */
    margin-bottom: calc(var(--height-a) / 4);
    font-family:
      ui-monospace, 'SF Mono', SFMono-Regular, Menlo, 'Cascadia Mono', Consolas, monospace;
  }

  .receipt-line.align-center {
    justify-content: center;
  }

  .receipt-line.align-right {
    justify-content: flex-end;
  }

  .receipt-symbol-line {
    min-height: unset;
  }

  .symbol-wrap {
    width: fit-content;
    max-width: 100%;
    overflow-x: hidden;
  }

  .symbol-wrap * {
    display: block;
  }

  .barcode-wrap {
    width: auto;
  }

  .barcode-canvas {
    display: block;
    max-width: 100%;
  }

  .qrcode-canvas {
    display: block;
  }

  .pdf417-canvas {
    display: block;
  }

  .image-canvas {
    display: block;
  }

  .image-wrap {
    transform-origin: top left;
  }

  .receipt-line.align-center .symbol-wrap {
    margin: 0 auto;
  }

  .receipt-line.align-right .symbol-wrap {
    margin-left: auto;
  }

  /* Each character cell — Font A defaults */
  .receipt-char {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--width-a);
    font-size: var(--size-a);
    line-height: var(--height-a);
    white-space: pre;
  }

  /* Font B overrides — narrower, smaller font, same line-height */
  .receipt-char.is-font-b {
    width: var(--width-b);
    font-size: var(--size-b);
    line-height: var(--height-b);
  }

  .receipt-char.is-bold {
    font-weight: var(--rd-font-weight-bold);
  }

  .receipt-char.is-italic {
    font-style: italic;
  }

  .receipt-char.is-underline {
    text-decoration: underline;
  }

  /*
   * Inverted text: swap foreground and background — dark glyph on dark background
   * becomes white glyph on dark background, matching ESC/POS invert mode.
   * Mirrors the playground's .invert rule:
   *   background: var(--text); color: var(--paper);
   */
  .receipt-char.is-invert {
    background-color: var(--rd-color-text-primary);
    color: var(--rd-color-bg-primary);
  }

  /*
   * Scale (double-wide / double-tall / etc.).
   * --sx and --sy are set inline from scaleX / scaleY on the TextChar.
   * We widen the cell and scale the glyph via CSS transform.
   * The transform is applied from the left edge so cells stack correctly.
   */
  .receipt-char.is-scaled {
    width: calc(var(--width-a) * var(--sx, 1));
    line-height: calc(var(--height-a) * var(--sy, 1));
    transform: scale(var(--sx, 1), var(--sy, 1));
    transform-origin: left center;
  }

  /* Font B scaled */
  .receipt-char.is-font-b.is-scaled {
    width: calc(var(--width-b) * var(--sx, 1));
    line-height: calc(var(--height-b) * var(--sy, 1));
  }

  /*
   * Cut indicator — a dashed line spanning the full paper width (including
   * padding), achieved by bleeding out with negative margins.
   * Mirrors the playground's .cut rule:
   *   border-top: 2px dashed #fff; width: calc(100% + 64px); margin: 0 -32px;
   */
  .receipt-cut {
    border-top: 2px dashed var(--rd-color-border-strong);
    width: calc(100% + 2 * var(--rd-space-8));
    margin: var(--rd-space-2) calc(-1 * var(--rd-space-8));
  }

  .receipt-feed-line {
    min-height: var(--height-a);
    margin-bottom: calc(var(--height-a) / 4);
    border-left: 2px dotted var(--rd-color-outline);
    opacity: 0.45;
    margin-left: var(--rd-space-1);
  }

  /* ── Commands tab ────────────────────────────────────────────────── */

  .commands-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-size: var(--rd-font-sm);
    font-family: var(--rd-font-mono);
    border-radius: var(--rd-radius-md);
    overflow: hidden;
    border: 1px solid var(--rd-color-outline-variant);
  }

  .commands-line {
    display: flex;
    align-items: flex-start;
    gap: var(--rd-space-2);
    min-height: 1.8em;
    padding: var(--rd-space-1) var(--rd-space-2);
    background-color: var(--rd-color-bg-primary);
    border-bottom: 1px solid var(--rd-color-outline-variant);
  }

  .commands-line:last-child {
    border-bottom: none;
  }

  .commands-line:nth-child(even) {
    background-color: var(--rd-color-bg-secondary);
  }

  .line-num {
    min-width: 2.5em;
    text-align: right;
    color: var(--rd-color-outline);
    font-size: var(--rd-font-xs);
    padding-top: 0.25em;
    flex-shrink: 0;
  }

  .line-tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--rd-space-1);
  }

  .cmd-token {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    padding: 0.15em 0.5em;
    border-radius: var(--rd-radius-full);
    font-size: var(--rd-font-xs);
    border: 1px solid transparent;
  }

  .cmd-name {
    font-weight: var(--rd-font-weight-bold);
  }

  .cmd-value {
    opacity: 0.8;
    max-width: 20em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cmd-codepage {
    opacity: 0.6;
    font-style: italic;
  }

  /* Command token colours — keyed to cmd.type values */
  .cmd-text {
    background: color-mix(in srgb, var(--rd-color-primary) 15%, transparent);
    border-color: var(--rd-color-primary);
    color: var(--rd-color-primary);
  }
  .cmd-style {
    background: color-mix(in srgb, var(--rd-color-warning) 15%, transparent);
    border-color: var(--rd-color-warning);
    color: var(--rd-color-warning);
  }
  .cmd-initialize {
    background: color-mix(in srgb, var(--rd-color-success) 10%, transparent);
    border-color: var(--rd-color-success);
    color: var(--rd-color-success);
  }
  .cmd-charmode,
  .cmd-font {
    background: color-mix(in srgb, var(--rd-color-on-surface-variant) 10%, transparent);
    border-color: var(--rd-color-outline);
    color: var(--rd-color-on-surface-variant);
  }
  .cmd-newline {
    background: color-mix(in srgb, var(--rd-color-on-surface-variant) 10%, transparent);
    border-color: var(--rd-color-outline);
    color: var(--rd-color-on-surface-variant);
  }
  .cmd-cut {
    background: color-mix(in srgb, var(--rd-color-error) 15%, transparent);
    border-color: var(--rd-color-error);
    color: var(--rd-color-error);
  }
  .cmd-image {
    background: color-mix(in srgb, var(--rd-color-primary) 15%, transparent);
    border-color: var(--rd-color-primary);
    color: var(--rd-color-primary);
  }
  .cmd-barcode {
    background: color-mix(in srgb, var(--rd-color-warning) 15%, transparent);
    border-color: var(--rd-color-warning);
    color: var(--rd-color-warning);
  }
  .cmd-qrcode {
    background: color-mix(in srgb, var(--rd-color-success) 15%, transparent);
    border-color: var(--rd-color-success);
    color: var(--rd-color-success);
  }
  .cmd-pdf417 {
    background: color-mix(in srgb, var(--rd-color-placeholder) 15%, transparent);
    border-color: var(--rd-color-placeholder);
    color: var(--rd-color-placeholder);
  }
  .cmd-codepage {
    background: color-mix(in srgb, var(--rd-color-on-surface-variant) 10%, transparent);
    border-color: var(--rd-color-outline);
    color: var(--rd-color-on-surface-variant);
  }
  .cmd-raw {
    background: color-mix(in srgb, var(--rd-color-on-surface-variant) 15%, transparent);
    border-color: var(--rd-color-outline);
    color: var(--rd-color-on-surface-variant);
  }
  .cmd-default {
    background: color-mix(in srgb, var(--rd-color-on-surface-variant) 10%, transparent);
    border-color: var(--rd-color-outline);
    color: var(--rd-color-on-surface-variant);
  }

  /* ── Encoded tab ─────────────────────────────────────────────────── */

  .encoded-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-xs);
    border-radius: var(--rd-radius-md);
    overflow: hidden;
    border: 1px solid var(--rd-color-outline-variant);
  }

  .encoded-line {
    display: flex;
    align-items: flex-start;
    gap: var(--rd-space-2);
    padding: var(--rd-space-1) var(--rd-space-2);
    background-color: var(--rd-color-bg-primary);
    border-bottom: 1px solid var(--rd-color-outline-variant);
  }

  .encoded-line:last-child {
    border-bottom: none;
  }

  .encoded-line:nth-child(even) {
    background-color: var(--rd-color-bg-secondary);
  }

  .encoded-cmds {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .encoded-cmd {
    display: inline-flex;
    flex-direction: column;
    gap: 1px;
    padding: 0.15em 0.4em;
    border-radius: var(--rd-radius-sm);
    /* background and border come from the cmd-* colour classes shared with Commands tab */
  }

  .encoded-cmd-label {
    font-weight: var(--rd-font-weight-medium);
    /* colour comes from the cmd-* colour class */
  }

  .encoded-cmd-hex {
    opacity: 0.65;
    font-size: 0.65rem;
    overflow-wrap: break-word;
    word-break: break-all;
    /* inherits colour from the cmd-* class so hex stays in the same hue family */
  }

  /* ── Output tab — hex dump ───────────────────────────────────────── */

  .hex-dump {
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-xs);
    border-radius: var(--rd-radius-md);
    overflow: hidden;
    border: 1px solid var(--rd-color-outline-variant);
  }

  .hex-header {
    display: grid;
    grid-template-columns: 6em 1fr 10em;
    gap: var(--rd-space-3);
    padding: var(--rd-space-1) var(--rd-space-2);
    border-bottom: 1px solid var(--rd-color-outline-variant);
    background-color: var(--rd-color-bg-secondary);
    color: var(--rd-color-outline);
    font-weight: var(--rd-font-weight-medium);
  }

  .hex-row {
    display: grid;
    grid-template-columns: 6em 1fr 10em;
    gap: var(--rd-space-3);
    padding: var(--rd-space-1) var(--rd-space-2);
    background-color: var(--rd-color-bg-primary);
    border-bottom: 1px solid var(--rd-color-outline-variant);
  }

  .hex-row:last-child {
    border-bottom: none;
  }

  .hex-row:nth-child(even) {
    background-color: var(--rd-color-bg-secondary);
  }

  .hex-row:hover {
    background-color: var(--rd-color-bg-tertiary);
  }

  .hex-offset {
    color: var(--rd-color-outline);
  }

  .hex-bytes {
    color: var(--rd-color-text-primary);
    overflow-wrap: break-word;
    word-break: break-all;
  }

  .hex-ascii {
    color: var(--rd-color-on-surface-variant);
    overflow-wrap: break-word;
    word-break: break-all;
  }

  /* ── Batch navigation bar ────────────────────────────────────────── */

  .batch-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--rd-space-4);
    padding: var(--rd-space-2) var(--rd-space-4);
    background-color: var(--rd-color-surface-container);
    border-top: 1px solid var(--rd-color-outline-variant);
    flex-shrink: 0;
  }

  .nav-btn {
    padding: var(--rd-space-1) var(--rd-space-3);
    font-size: var(--rd-font-sm);
    font-weight: var(--rd-font-weight-medium);
    background-color: var(--rd-color-surface);
    border: 1px solid var(--rd-color-outline-variant);
    border-radius: var(--rd-radius-sm);
    color: var(--rd-color-on-surface-variant);
    cursor: pointer;
    transition: background-color var(--rd-transition-fast);
  }

  .nav-btn:hover:not(:disabled) {
    background-color: var(--rd-color-primary-container);
    color: var(--rd-color-on-primary-container);
    border-color: var(--rd-color-primary);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .row-indicator {
    font-size: var(--rd-font-sm);
    color: var(--rd-color-on-surface-variant);
    min-width: var(--rd-required-col-width);
    text-align: center;
  }
</style>
