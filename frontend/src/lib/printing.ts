import WebSerialReceiptPrinter from '@point-of-sale/webserial-receipt-printer';
import { toEscPos } from './pipeline';
import type { PrintResult, PrinterSettings } from '$types/index';

/**
 * printing.ts — Single entry point for all print operations.
 *
 * Components and stores never call navigator.serial or WebSerialReceiptPrinter directly.
 * This module wraps @point-of-sale/webserial-receipt-printer, manages the connection
 * lifecycle, and exposes a clean status subscription API.
 *
 * Print paths:
 *   Path A — Web Serial API via WebSerialReceiptPrinter (demo mode)
 *   Path B/C — POST ESC/POS binary to server (production mode, Milestone 4)
 *
 * Connection lifecycle
 * ─────────────────────
 * WebSerialReceiptPrinter wraps navigator.serial internally. We:
 *   1. Create a single shared instance with baud rate 115200.
 *   2. Register 'connected' / 'disconnected' event listeners on it.
 *   3. Call printer.connect() to show the browser port picker.
 *   4. On 'connected' event → set status 'online'.
 *   5. On 'disconnected' event → set status 'disconnected'.
 *   6. To print: call printer.print(Uint8Array).
 *   7. To disconnect: call printer.disconnect().
 *
 * See docs/design.md §9.6.
 */

// ---------------------------------------------------------------------------
// Ambient types for WebSerialReceiptPrinter
// (The package ships no .d.ts files — we declare only the surface we use.)
// ---------------------------------------------------------------------------

interface PrinterDevice {
  vendorId: number | null;
  productId: number | null;
  language: string | null;
  codepageMapping: string | null;
}

interface WebSerialPrinterInstance {
  connect(): Promise<void>;
  reconnect(device: PrinterDevice): Promise<void>;
  disconnect(): Promise<void>;
  print(data: Uint8Array): Promise<void>;
  addEventListener(event: 'connected', fn: (device: PrinterDevice) => void): void;
  addEventListener(event: 'disconnected', fn: () => void): void;
  addEventListener(event: 'data', fn: (data: Uint8Array) => void): void;
}

// ---------------------------------------------------------------------------
// Public serial-connection status type
// ---------------------------------------------------------------------------

/**
 * Public summary of the Web Serial connection state shown in PrinterPanel.
 *
 * 'unsupported'  — browser doesn't support Web Serial API (Firefox, Safari)
 * 'disconnected' — no active connection
 * 'connecting'   — port picker shown / port opening
 * 'online'       — connected and ready
 * 'error'        — connection failed
 */
export type SerialStatus = 'unsupported' | 'disconnected' | 'connecting' | 'online' | 'error';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** The shared WebSerialReceiptPrinter instance (created lazily). */
let _printer: WebSerialPrinterInstance | null = null;

/** Registered UI callbacks for status changes. */
const _statusListeners: Set<(status: SerialStatus) => void> = new Set();

let _currentStatus: SerialStatus = 'serial' in navigator ? 'disconnected' : 'unsupported';

function _setStatus(s: SerialStatus): void {
  _currentStatus = s;
  _statusListeners.forEach((fn) => fn(s));
}

/**
 * Return the shared printer instance, creating it once if necessary.
 * Registers 'connected' / 'disconnected' event handlers the first time.
 */
function _getPrinter(): WebSerialPrinterInstance {
  if (_printer !== null) return _printer;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = new (WebSerialReceiptPrinter as any)({
    baudRate: 115200,
  }) as WebSerialPrinterInstance;

  instance.addEventListener('connected', (_device: PrinterDevice) => {
    _setStatus('online');
  });

  instance.addEventListener('disconnected', () => {
    _setStatus('disconnected');
  });

  _printer = instance;
  return instance;
}

// ---------------------------------------------------------------------------
// Public connection management API
// ---------------------------------------------------------------------------

/**
 * Subscribe to serial connection status changes.
 * Calls fn immediately with the current status. Returns an unsubscribe function.
 */
export function subscribeSerialStatus(fn: (status: SerialStatus) => void): () => void {
  fn(_currentStatus);
  _statusListeners.add(fn);
  return () => {
    _statusListeners.delete(fn);
  };
}

/**
 * Open a Web Serial connection. Shows the browser port picker.
 * If already connected (status === 'online') this is a no-op.
 */
export function connectSerial(): void {
  if (_currentStatus === 'unsupported') return;
  if (_currentStatus === 'connecting') return;
  if (_currentStatus === 'online') return;

  _setStatus('connecting');

  const printer = _getPrinter();
  printer.connect().catch((err: unknown) => {
    if (import.meta.env.DEV) console.error('[printing] connectSerial error:', err);
    _setStatus('error');
  });
}

/** Close the active Web Serial connection and release the port. */
export function disconnectSerial(): void {
  if (_printer === null) {
    _setStatus('disconnected');
    return;
  }

  _printer.disconnect().catch((err: unknown) => {
    if (import.meta.env.DEV) console.error('[printing] disconnectSerial error:', err);
  });

  // Status will be updated to 'disconnected' via the 'disconnected' event listener.
  // Set it immediately too so the UI updates without waiting for the event.
  if (_currentStatus !== 'unsupported') {
    _setStatus('disconnected');
  }
}

// ---------------------------------------------------------------------------
// Public print API
// ---------------------------------------------------------------------------

/**
 * Print a single resolved document.
 *
 * @param resolvedContent - JS encoder code with all placeholders already replaced
 * @param settings        - Printer settings for ESC/POS generation
 * @param printerId       - Optional server printer ID (production mode only, Milestone 4)
 */
export async function print(
  resolvedContent: string,
  settings: PrinterSettings,
  printerId?: string,
): Promise<PrintResult> {
  const mode = window.__APP_CONFIG__?.mode ?? 'demo';

  if (mode === 'production' && printerId !== undefined) {
    return {
      status: 'unavailable',
      message:
        'Server-forwarded printing (Paths B/C) is not yet implemented. Coming in Milestone 4.',
    };
  }

  if (!('serial' in navigator)) {
    return {
      status: 'unavailable',
      message:
        'Web Serial is not supported in this browser. Use Chrome or Edge for direct printing.',
    };
  }

  // Auto-connect if not already connected.
  if (_currentStatus !== 'online') {
    connectSerial();
  }

  // Wait for the port to open (up to 15 s).
  const isOnline = await _waitForOnline(15000);
  if (!isOnline) {
    return {
      status: 'error',
      message: `Printer port did not open (status: ${_currentStatus}). Check the connection and try again.`,
    };
  }

  const printer = _printer;
  if (printer === null) {
    return { status: 'error', message: 'No active printer connection.' };
  }

  let bytes: Uint8Array;
  try {
    bytes = toEscPos(resolvedContent, settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate ESC/POS command';
    if (import.meta.env.DEV) console.error('[printing] toEscPos error:', err);
    return { status: 'error', message };
  }

  try {
    await printer.print(bytes);
    return { status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown print error';
    if (import.meta.env.DEV) console.error('[printing] print error:', err);
    return { status: 'error', message };
  }
}

/**
 * Print multiple resolved documents as a batch (sequentially).
 *
 * @param jobs      - Array of { content, settings } pairs to print in order
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
    if (result.status !== 'success') break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the printer port to reach 'online' status, up to `timeoutMs`.
 * Resolves true when online, false on timeout or error/disconnected.
 */
function _waitForOnline(timeoutMs: number): Promise<boolean> {
  if (_currentStatus === 'online') return Promise.resolve(true);

  return new Promise<boolean>((res) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        _statusListeners.delete(onStatus);
        res(false);
      }
    }, timeoutMs);

    const onStatus = (s: SerialStatus): void => {
      if (settled) return;
      if (s === 'online') {
        settled = true;
        clearTimeout(timer);
        _statusListeners.delete(onStatus);
        res(true);
      } else if (s === 'error' || s === 'disconnected') {
        settled = true;
        clearTimeout(timer);
        _statusListeners.delete(onStatus);
        res(false);
      }
    };

    _statusListeners.add(onStatus);
  });
}
