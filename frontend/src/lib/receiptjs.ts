import type { PrinterSettings } from '$types/index';

/**
 * receiptjs.ts — Thin wrapper around the Receipt.js UMD globals.
 *
 * Receipt.js is loaded as <script> tags in index.html (not as an npm package)
 * because it is not published to npm. It exposes window.Receipt as a UMD global.
 * All calls to Receipt.js in the entire frontend go through this module — components
 * and stores never touch window.Receipt directly. This keeps the Receipt.js API
 * surface isolated so it is easy to update or mock in tests.
 *
 * See docs/design.md §9.4 and public/lib/README.md for how to obtain the files.
 */

// ---------------------------------------------------------------------------
// Ambient type declarations for the Receipt.js UMD globals
// ---------------------------------------------------------------------------

/**
 * The shape of a Receipt.js instance returned by Receipt.from().
 * Only the methods we actually call are typed.
 */
interface ReceiptInstance {
  /** Render the receipt as an SVG string. Async internally. */
  toSVG(): Promise<string>;
  /** Render the receipt as a PNG data URL. */
  toPNG(): Promise<string>;
}

/**
 * Minimal ambient type for the global Receipt object.
 * Using `declare const` (not `window.Receipt`) because TypeScript's strict mode
 * requires the global to be declared before use, and we don't want to cast every call.
 */
declare const Receipt:
  | {
      /**
       * Create a receipt instance from ReceiptLine markdown + CLI-style options string.
       * @param markdown - The ReceiptLine content string
       * @param options  - CLI-style option string, e.g. '-c 48 -l en -p escpos'
       */
      from(markdown: string, options: string): ReceiptInstance;
    }
  | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a PrinterSettings object into the CLI-style options string that
 * Receipt.js's parseOption() function expects.
 *
 * Flag reference (from Receipt.js source):
 *   -p <command>    printer control language (escpos, epson, star, etc.)
 *   -c <cpl>        characters per line (24–96)
 *   -l <lang>       language / locale code
 *   -u              upside down
 *   -v              landscape orientation
 *   -s              paper saving — NOTE: this *disables* line spacing, so we
 *                   include -s when spacing === false (inverted flag)
 *   -n              no paper cut — NOTE: include -n when cutting === false
 *   -m <left>,<right>  margins (0–24 each)
 *   -i              print as image
 *   -b <threshold>  image thresholding (0–255)
 *   -g <gamma>      image gamma (0.1–10.0)
 */
function settingsToOptions(settings: PrinterSettings): string {
  const parts: string[] = [];

  parts.push('-p', settings.command);
  parts.push('-c', String(settings.cpl));
  parts.push('-l', settings.language);

  if (settings.upsideDown) parts.push('-u');
  if (settings.landscape) parts.push('-v');

  // Receipt.js -s means "paper saving" which disables spacing.
  // Our `spacing: true` means spacing IS enabled, so include -s when spacing is false.
  if (!settings.spacing) parts.push('-s');

  // Receipt.js -n means "no cut". Our `cutting: true` means cut IS enabled,
  // so include -n when cutting is false.
  if (!settings.cutting) parts.push('-n');

  parts.push('-m', `${String(settings.marginLeft)},${String(settings.marginRight)}`);

  if (settings.printAsImage) parts.push('-i');

  parts.push('-b', String(settings.threshold));
  parts.push('-g', String(settings.gamma));

  return parts.join(' ');
}

/**
 * Check whether Receipt.js has been loaded.
 * Returns false if the <script> tags in index.html failed to load (e.g. the files
 * are missing from public/lib/). This is expected during development until the
 * vendored files are placed in public/lib/.
 */
export function isReceiptJsLoaded(): boolean {
  return typeof Receipt !== 'undefined';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render ReceiptLine markdown to an SVG string.
 *
 * Returns an empty string if Receipt.js is not loaded yet, so the Preview
 * component can show a placeholder message instead of crashing.
 *
 * @param content  - The ReceiptLine markdown string
 * @param settings - Printer settings controlling CPL, encoding, etc.
 */
export async function toSVG(content: string, settings: PrinterSettings): Promise<string> {
  if (!isReceiptJsLoaded()) return '';
  try {
    // TypeScript cannot narrow `declare const` union types the same way it narrows
    // local variables, so `Receipt` still has type `{ from(...) } | undefined` here
    // even though isReceiptJsLoaded() confirmed it is defined. The non-null assertion
    // is safe: the early-return above guarantees we only reach this line when
    // typeof Receipt !== 'undefined'.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return await Receipt!.from(content, settingsToOptions(settings)).toSVG();
  } catch (err) {
    if (import.meta.env.DEV) console.error('[receiptjs] toSVG error:', err);
    return '';
  }
}

/**
 * Render ReceiptLine markdown to a PNG data URL.
 *
 * @param content  - The ReceiptLine markdown string
 * @param settings - Printer settings
 * @returns A Promise<string> resolving to a data: URL (e.g. "data:image/png;base64,...")
 */
export async function toPNG(content: string, settings: PrinterSettings): Promise<string> {
  if (!isReceiptJsLoaded()) {
    throw new Error('Receipt.js is not loaded. See public/lib/README.md for setup instructions.');
  }
  // Same narrowing limitation as in toSVG — the early throw above guarantees
  // Receipt is defined here; the non-null assertion is safe.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return Receipt!.from(content, settingsToOptions(settings)).toPNG();
}

// ---------------------------------------------------------------------------
// Debounced SVG render
// ---------------------------------------------------------------------------

/**
 * A debounced version of toSVG.
 *
 * Why debounce?
 * Receipt.js parses and renders the entire ReceiptLine document on every call.
 * Calling it on every keystroke would fire 5–10 renders per second during fast
 * typing, which makes the UI feel sluggish and wastes CPU. A 300 ms debounce
 * means the preview updates once the user pauses, which feels live without the
 * performance cost. See docs/design.md §9.4.
 *
 * Usage:
 *   toSVGDebounced(content, settings, (svg) => { svgOutput = svg; });
 *
 * Calling toSVGDebounced again before 300 ms resets the timer, so only the
 * most recent content is ever rendered.
 */
let _debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function toSVGDebounced(
  content: string,
  settings: PrinterSettings,
  callback: (svg: string) => void,
): void {
  // Clear any pending render — only the most recent call within the 300 ms window matters.
  if (_debounceTimer !== undefined) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    toSVG(content, settings)
      .then(callback)
      .catch((err: unknown) => {
        if (import.meta.env.DEV) console.error('[receiptjs] toSVGDebounced error:', err);
      });
  }, 300);
}
