import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import type { PrinterSettings } from '$types/index';

/**
 * encoder.ts — Thin wrapper around @point-of-sale/receipt-printer-encoder.
 *
 * All calls to ReceiptPrinterEncoder in the entire frontend go through this module.
 * Components and stores never import ReceiptPrinterEncoder directly.
 *
 * The editor stores plain JavaScript code that uses the `encoder` variable, e.g.:
 *   encoder.initialize().line('Hello World').rule().cut()
 *
 * runUserCode() wraps this code in an async function, injects an `encoder` instance,
 * evaluates it, and returns the resulting encoder instance. Callers can then call
 * .encode() on the result to obtain bytes, commands, or lines depending on the
 * preview tab needed. This mirrors the playground's utils/encoder.js approach.
 *
 * See docs/design.md §9.4.
 */

// ---------------------------------------------------------------------------
// Printer model list
// ---------------------------------------------------------------------------

/**
 * A single entry from ReceiptPrinterEncoder.printerModels.
 */
interface PrinterModel {
  id: string;
  name: string;
}

/**
 * The full list of printer models supported by ReceiptPrinterEncoder,
 * sourced from the static property at module load time.
 *
 * Use this to populate a dropdown in the UI — identical to what
 * the official playground does with ReceiptPrinterEncoder.printerModels.
 */
export const printerModels: PrinterModel[] = ReceiptPrinterEncoder.printerModels;

// ---------------------------------------------------------------------------
// Ambient types for ReceiptPrinterEncoder
// (The package ships no .d.ts — we declare only the surface we use.)
// ---------------------------------------------------------------------------

/**
 * Options accepted by the ReceiptPrinterEncoder constructor.
 * Only the fields we actually pass are listed; the library accepts more.
 * See: https://github.com/NielsLeenheer/ReceiptPrinterEncoder/blob/main/documentation/configuration.md
 */
interface EncoderOptions {
  language?: string;
  columns?: number;
  printerModel?: string;
  codepageMapping?: string;
  /** Lines to feed before the cutter fires. */
  feedBeforeCut?: number;
  /** Newline sequence — '\n\r' (default) or '\n' for exotic printers. */
  newline?: string;
  /** Image encoding mode for ESC/POS: 'column' (default) or 'raster'. */
  imageMode?: string;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

/**
 * A single command token inside an encoder output line.
 *
 * Actual shape from encode('commands'):
 *   { type: 'text', value: string, codepage: string | null }
 *   { type: 'style', property: string, value: unknown }
 *   { type: 'initialize' | 'cut' | 'empty' | 'character-mode' | 'font', payload?: number[], value?: unknown }
 *
 * We expose the full union so consumers can pattern-match on `type`.
 */
export interface EncoderCommand {
  type: string;
  /** For 'style' commands — which property is being set (e.g. 'bold', 'underline', 'size') */
  property?: string;
  /** The value being set. For text: the string. For style: boolean / size object / etc. */
  value?: unknown;
  /** Codepage identifier (for 'text' tokens, e.g. 'cp437') */
  codepage?: string | null;
  /** Raw ESC/POS byte payload for this command */
  payload?: number[];
}

/**
 * A single output line from encode('commands').
 * `height` is the line height in "text lines" (2 = double-height, etc.).
 */
export interface EncoderCommandLine {
  commands: EncoderCommand[];
  height: number;
}

/**
 * Structured command output from encoder.encode('commands').
 * One element per printed line, each containing the command tokens for that line.
 */
export type EncoderCommandsOutput = EncoderCommandLine[];

/**
 * encode('lines') returns one array of command tokens per printed line
 * (the same tokens as encode('commands'), but without the line-wrapper object).
 * Used by the Encoded tab to show per-line byte payloads.
 */
export type EncoderLinesOutput = EncoderCommand[][];

/**
 * The ReceiptPrinterEncoder instance surface we use.
 * A subset of the full API — only what we actually call.
 */
interface EncoderInstance {
  /** Encode to raw Uint8Array bytes (default) */
  encode(): Uint8Array;
  /** Encode to per-line command objects (for Commands / Text preview) */
  encode(type: 'commands'): EncoderCommandsOutput;
  /** Encode to per-line command arrays (for Encoded preview) */
  encode(type: 'lines'): EncoderLinesOutput;
  /** Column count as set in constructor options — readable mid-script by user code */
  readonly columns: number;
}

// ---------------------------------------------------------------------------
// Build encoder options from PrinterSettings
// ---------------------------------------------------------------------------

/**
 * Convert PrinterSettings to the options object for ReceiptPrinterEncoder.
 */
function settingsToEncoderOptions(settings: PrinterSettings): EncoderOptions {
  const opts: EncoderOptions = {
    language: settings.language,
    columns: settings.columns,
    feedBeforeCut: settings.feedBeforeCut,
    newline: settings.newline,
    imageMode: settings.imageMode,
  };

  if (settings.printerModel !== '') {
    opts.printerModel = settings.printerModel;
  } else if (settings.codepageMapping !== '') {
    opts.codepageMapping = settings.codepageMapping;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run user-authored JavaScript encoder code and return the encoder instance.
 *
 * Supports both the fluent chain style and the full imperative style from the
 * NielsLeenheer playground:
 *
 *   // Fluent chain:
 *   encoder.initialize().line('Hello').cut()
 *
 *   // Imperative (playground style):
 *   encoder.initialize().line('Hello');
 *   let wide = encoder.columns >= 42;
 *   if (wide) { encoder.line('Wide paper!'); }
 *   encoder.cut();
 *
 * The script is evaluated via `new Function('encoder', code)` with the encoder
 * instance injected as the `encoder` variable. All encoder methods return `this`,
 * so both styles mutate the same instance. After the script runs, the same
 * instance is returned for `.encode()`.
 *
 * @param jsCode   - The user's encoder JS (full script or single chain expression)
 * @param settings - Printer settings
 * @returns The encoder instance after running user code
 * @throws  On evaluation or runtime error (caller should catch and show a toast)
 */
export function runUserCode(jsCode: string, settings: PrinterSettings): EncoderInstance {
  const opts = settingsToEncoderOptions(settings);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoder: any = new (ReceiptPrinterEncoder as any)(opts);

  const trimmed = jsCode.trim();
  if (trimmed === '') {
    return encoder as EncoderInstance;
  }

  // Pass the script as-is. The `encoder` variable is in scope as a parameter.
  // Both "encoder.initialize().line('Hi').cut()" (expression) and multi-statement
  // imperative scripts work identically — all encoder methods mutate and return `this`.
  new Function('encoder', trimmed)(encoder);

  return encoder as EncoderInstance;
}

/**
 * Run user encoder code and encode to raw ESC/POS bytes.
 *
 * @param jsCode   - The user's encoder JS code
 * @param settings - Printer settings
 * @returns Uint8Array of raw printer command bytes
 * @throws  On evaluation or encoding error
 */
export function encodeToBytes(jsCode: string, settings: PrinterSettings): Uint8Array {
  const enc = runUserCode(jsCode, settings);
  return enc.encode();
}

/**
 * Run user encoder code and encode to structured command tokens.
 * Used by the Commands and Text preview tabs.
 *
 * @param jsCode   - The user's encoder JS code
 * @param settings - Printer settings
 * @returns Array of per-line command token arrays
 */
export function encodeToCommands(jsCode: string, settings: PrinterSettings): EncoderCommandsOutput {
  const enc = runUserCode(jsCode, settings);
  return enc.encode('commands');
}

/**
 * Run user encoder code and encode to structured line objects.
 * Used by the Encoded preview tab.
 *
 * @param jsCode   - The user's encoder JS code
 * @param settings - Printer settings
 * @returns Array of line objects with type and bytes
 */
export function encodeToLines(jsCode: string, settings: PrinterSettings): EncoderLinesOutput {
  const enc = runUserCode(jsCode, settings);
  return enc.encode('lines');
}

// ---------------------------------------------------------------------------
// Debounced encode for preview
// ---------------------------------------------------------------------------

let _debounceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Debounced version of encodeToCommands.
 * Fires the callback at most once per 300 ms window.
 * Calling again before 300 ms resets the timer — only the last call runs.
 *
 * @param jsCode   - The user's encoder JS code
 * @param settings - Printer settings
 * @param callback - Called with the command output (or null on error)
 */
export function encodeToCommandsDebounced(
  jsCode: string,
  settings: PrinterSettings,
  callback: (result: EncoderCommandsOutput | null, error: string | null) => void,
): void {
  if (_debounceTimer !== undefined) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    try {
      const result = encodeToCommands(jsCode, settings);
      callback(result, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (import.meta.env.DEV) console.error('[encoder] encodeToCommandsDebounced error:', err);
      callback(null, message);
    }
  }, 300);
}
