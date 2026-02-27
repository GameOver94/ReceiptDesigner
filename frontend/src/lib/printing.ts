import type { PrintResult, PrinterSettings } from '$types/index';

/**
 * printing.ts — Single entry point for all print operations.
 *
 * Components and stores never call receipt-printer.js or receipt-serial.js directly.
 * This module handles path selection (Web Serial vs. server POST), ESC/POS generation,
 * and error normalisation. See docs/design.md §9.6 for the full dispatch logic.
 *
 * Print paths:
 *   Path A — Web Serial API (demo mode, or production mode with no server printer selected)
 *   Path B/C — POST ESC/POS binary to server (production mode, implemented in Milestone 4)
 */

// ---------------------------------------------------------------------------
// Ambient type declarations for Receipt.js printer globals
// ---------------------------------------------------------------------------

/**
 * receipt-printer.js UMD global — converts ReceiptLine markdown to ESC/POS bytes.
 * Loaded via <script> in index.html. Only the methods we use are typed here.
 */
declare const ReceiptPrinter:
  | {
      /**
       * Generate ESC/POS bytes from ReceiptLine markdown + printer options.
       * Returns a Uint8Array of raw ESC/POS command bytes.
       */
      generate(markdown: string, options: Record<string, unknown>): Uint8Array;
    }
  | undefined;

/**
 * receipt-serial.js UMD global — writes ESC/POS bytes to a Web Serial port.
 */
declare const ReceiptSerial:
  | {
      /** Print a Uint8Array to the first available (or previously selected) serial port. */
      print(data: Uint8Array): Promise<void>;
    }
  | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function settingsToOptions(settings: PrinterSettings): Record<string, unknown> {
  return {
    cpl: settings.cpl,
    encoding: settings.language,
    command: settings.command,
    spacing: settings.spacing,
    cutting: settings.cutting,
    upsideDown: settings.upsideDown,
    marginLeft: settings.marginLeft,
    marginRight: settings.marginRight,
    gamma: settings.gamma,
    threshold: settings.threshold,
    printAsImage: settings.printAsImage,
    landscape: settings.landscape,
  };
}

/**
 * Generate ESC/POS bytes from resolved ReceiptLine content.
 * Returns null if receipt-printer.js is not loaded.
 */
function generateEscPos(content: string, settings: PrinterSettings): Uint8Array | null {
  if (typeof ReceiptPrinter === 'undefined') return null;
  return ReceiptPrinter.generate(content, settingsToOptions(settings));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Print a single resolved document.
 *
 * In demo mode:
 *   - Attempts Path A (Web Serial) if navigator.serial is available.
 *   - Returns status: 'unavailable' with an explanatory message if Web Serial
 *     is not supported (e.g. Firefox, Safari).
 *
 * In production mode (Milestone 4):
 *   - If a printerId is provided and the mode is 'production', uses Path B/C
 *     (POST binary blob to server). Not yet implemented.
 *
 * @param resolvedContent - ReceiptLine content with all placeholders already replaced
 * @param settings - Printer settings for ESC/POS generation
 * @param printerId - Optional server printer ID (production mode only)
 */
export async function print(
  resolvedContent: string,
  settings: PrinterSettings,
  printerId?: string,
): Promise<PrintResult> {
  const mode = window.__APP_CONFIG__?.mode ?? 'demo';

  // Production mode with a server printer — not yet implemented in Milestone 1.
  if (mode === 'production' && printerId !== undefined) {
    return {
      status: 'unavailable',
      message:
        'Server-forwarded printing (Paths B/C) is not yet implemented. Coming in Milestone 4.',
    };
  }

  // Path A — Web Serial API
  // navigator.serial is only available in Chrome, Edge, and Opera (Chromium-based).
  // Firefox and Safari do not support it. We check at runtime rather than compile
  // time because the browser is determined at runtime.
  if (!('serial' in navigator)) {
    return {
      status: 'unavailable',
      message:
        'Web Serial is not supported in this browser. Use Chrome or Edge for direct printing, or export as SVG/PNG.',
    };
  }

  const escposBytes = generateEscPos(resolvedContent, settings);
  if (escposBytes === null) {
    return {
      status: 'error',
      message: 'receipt-printer.js is not loaded. See public/lib/README.md for setup instructions.',
    };
  }

  if (typeof ReceiptSerial === 'undefined') {
    return {
      status: 'error',
      message: 'receipt-serial.js is not loaded. See public/lib/README.md for setup instructions.',
    };
  }

  try {
    await ReceiptSerial.print(escposBytes);
    return { status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown print error';
    if (import.meta.env.DEV) console.error('[printing] Web Serial error:', err);
    return { status: 'error', message };
  }
}

/**
 * Print multiple resolved documents as a batch.
 *
 * Each job is sent sequentially. This is intentional — sending multiple jobs
 * simultaneously to a serial port would interleave the byte streams.
 *
 * @param jobs - Array of { content, settings } pairs to print in order
 * @param printerId - Optional server printer ID (production mode only)
 */
export async function printBatch(
  jobs: Array<{ content: string; settings: PrinterSettings }>,
  printerId?: string,
): Promise<PrintResult[]> {
  const results: PrintResult[] = [];
  for (const job of jobs) {
    // eslint-disable-next-line no-await-in-loop
    const result = await print(job.content, job.settings, printerId);
    results.push(result);
    // Stop the batch on the first unavailable/error — no point continuing
    // if the printer isn't working or isn't connected.
    if (result.status !== 'success') break;
  }
  return results;
}
