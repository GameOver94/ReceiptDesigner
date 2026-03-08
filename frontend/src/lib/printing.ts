import { toEscPos } from './pipeline';
import type { PrintResult, PrinterSettings } from '$types/index';

/**
 * printing.ts — Single entry point for all print operations.
 *
 * Components and stores never call receipt-serial.js or navigator.serial directly.
 * This module handles path selection (Web Serial vs. server POST), ESC/POS generation,
 * and error normalisation. See docs/design.md §9.6 for the full dispatch logic.
 *
 * Print paths:
 *   Path A — Web Serial API (demo mode, or production mode with no server printer selected)
 *   Path B/C — POST ESC/POS binary to server (production mode, implemented in Milestone 4)
 *
 * Web Serial connection lifecycle
 * ────────────────────────────────
 * We use the Web Serial API directly (navigator.serial) rather than ReceiptSerial,
 * because ReceiptSerial's connection.print() requires the printer to respond to a
 * "hello" handshake before status transitions to 'online'. Cheap ESC/POS thermal
 * printers that don't push status bytes automatically will never reach 'online' via
 * ReceiptSerial, causing print() to resolve immediately with 'offline'.
 *
 * Instead we:
 *   1. Call navigator.serial.requestPort() to let the user pick the port.
 *   2. Open the port with { baudRate: 115200, flowControl: 'none' }.
 *   3. Send DLE EOT 2 (0x10 0x04 0x02) to query printer status.
 *   4. Read the 1-byte response and set status accordingly (online / coveropen / paperempty / error).
 *   5. Start a background polling loop (every ~5 s) while connected to detect state changes.
 *   6. On disconnectSerial(): cancel the reader, stop polling, then close the port.
 *
 * Printer status response byte (DLE EOT 2):
 *   0x12 — online / ready
 *   0x36 — cover open
 *   0x32 — paper empty (near-end or out)
 *   0x52 — other error / offline
 *   (anything else treated as online — avoid false negatives on quirky printers)
 */

// ---------------------------------------------------------------------------
// Ambient type declarations for the Web Serial API
// (Not in TypeScript's standard lib.dom.d.ts as of TS 5.x)
// ---------------------------------------------------------------------------

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortOpenOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface Serial {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<WebSerialPort>;
  getPorts(): Promise<WebSerialPort[]>;
}

declare global {
  interface Navigator {
    readonly serial: Serial;
  }
}

// ---------------------------------------------------------------------------
// Session-persistent connection state
// ---------------------------------------------------------------------------

/** The single active SerialPort for this page session. */
let _port: WebSerialPort | null = null;

/** Active reader held during the polling loop; must be cancelled before closing port. */
let _reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

/** AbortController used to stop the background polling loop. */
let _pollAbort: AbortController | null = null;

/**
 * True while a DLE EOT 2 query is in progress.
 * Prevents concurrent calls to _queryPrinterStatus from locking the readable stream twice
 * (which would throw "ReadableStream is locked"). The poll loop only starts after the
 * initial connectSerial() query returns, so overlap is unlikely in practice — but the
 * guard makes the invariant explicit and safe to rely on.
 */
let _statusQueryInFlight = false;

/** Registered UI callbacks for status changes. */
const _statusListeners: Set<(status: SerialStatus) => void> = new Set();

// ---------------------------------------------------------------------------
// Public serial-connection status type
// ---------------------------------------------------------------------------

/**
 * Public summary of the Web Serial connection state shown in PrinterPanel.
 *
 * 'unsupported'  — browser doesn't support Web Serial API (Firefox, Safari)
 * 'disconnected' — no active connection
 * 'connecting'   — port picker shown / port opening
 * 'online'       — port is open and printer is ready
 * 'offline'      — port open but printer not ready (unexpected status byte)
 * 'coveropen'    — port open, printer reports cover open
 * 'paperempty'   — port open, printer reports paper near-end or out
 * 'error'        — connection failed
 */
export type SerialStatus =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'coveropen'
  | 'paperempty'
  | 'error';

let _currentStatus: SerialStatus = 'serial' in navigator ? 'disconnected' : 'unsupported';

function _setStatus(s: SerialStatus): void {
  _currentStatus = s;
  _statusListeners.forEach((fn) => fn(s));
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
 *
 * After the port opens, sends DLE EOT 2 to query the printer status, reads the
 * 1-byte response, and updates status accordingly. Then starts a background
 * polling loop that re-queries every ~5 s to detect state changes.
 *
 * If already connected (status === 'online') this is a no-op.
 */
export function connectSerial(): void {
  if (_currentStatus === 'unsupported') return;
  if (_currentStatus === 'connecting') return;
  if (_port !== null && _currentStatus === 'online') return;

  _setStatus('connecting');

  navigator.serial
    .requestPort()
    .then((port) => {
      return port.open({ baudRate: 115200, flowControl: 'none' }).then(async () => {
        _port = port;
        // Query printer status immediately after opening.
        const initialStatus = await _queryPrinterStatus(port);
        _setStatus(initialStatus);
        // Start background polling loop (non-blocking).
        void _startPollLoop(port);
      });
    })
    .catch((err: unknown) => {
      // User cancelled the port picker — treat as disconnected, not an error.
      const isDomException =
        err instanceof DOMException || (err instanceof Error && err.name === 'NotFoundError');
      if (import.meta.env.DEV) console.error('[printing] connectSerial error:', err);
      _port = null;
      _setStatus(isDomException ? 'disconnected' : 'error');
    });
}

/** Close the active Web Serial connection and release the port. */
export function disconnectSerial(): void {
  // Stop the poll loop first.
  if (_pollAbort !== null) {
    _pollAbort.abort();
    _pollAbort = null;
  }

  const portToClose = _port;
  _port = null;

  if (_currentStatus !== 'unsupported') {
    _setStatus('disconnected');
  }

  if (portToClose !== null) {
    // Cancel any active reader before closing the port; otherwise close() throws
    // because the readable stream is still locked.
    const readerToCancel = _reader;
    _reader = null;

    const doClose = (): void => {
      portToClose.close().catch((err: unknown) => {
        if (import.meta.env.DEV) console.error('[printing] disconnectSerial close error:', err);
      });
    };

    if (readerToCancel !== null) {
      readerToCancel
        .cancel()
        .catch((err: unknown) => {
          if (import.meta.env.DEV) console.error('[printing] reader cancel error:', err);
        })
        .finally(doClose);
    } else {
      doClose();
    }
  }
}

// ---------------------------------------------------------------------------
// Public print API
// ---------------------------------------------------------------------------

/**
 * Print a single resolved document.
 *
 * In demo mode:
 *   - Uses Path A (Web Serial). Auto-connects if not yet connected.
 *   - Waits up to 15 s for the port to open.
 *   - Returns status: 'unavailable' if Web Serial is not supported.
 *
 * In production mode (Milestone 4):
 *   - If a printerId is provided, uses Path B/C (POST to server). Not yet implemented.
 *
 * @param resolvedContent - ReceiptLine content with all placeholders already replaced
 * @param settings        - Printer settings for ESC/POS generation
 * @param printerId       - Optional server printer ID (production mode only)
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
        'Web Serial is not supported in this browser. Use Chrome or Edge for direct printing, or export as SVG/PNG.',
    };
  }

  // Auto-connect if not already connected. connectSerial() is async internally
  // but returns void — we poll _currentStatus below.
  if (_port === null || _currentStatus !== 'online') {
    connectSerial();
  }

  // Wait for the port to open (up to 15 s). connectSerial() resolves async.
  const isOnline = await _waitForOnline(15000);
  if (!isOnline) {
    return {
      status: 'error',
      message: `Printer port did not open (status: ${_currentStatus}). Check the connection and try again.`,
    };
  }

  const port = _port;
  if (port === null) {
    return { status: 'error', message: 'No active printer connection.' };
  }

  if (port.writable === null) {
    return { status: 'error', message: 'Serial port is not writable.' };
  }

  let bytes: Uint8Array;
  try {
    bytes = await toEscPos(resolvedContent, settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate ESC/POS command';
    if (import.meta.env.DEV) console.error('[printing] toEscPos error:', err);
    return { status: 'error', message };
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
    return { status: 'success' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown print error';
    if (import.meta.env.DEV) console.error('[printing] Web Serial write error:', err);
    return { status: 'error', message };
  } finally {
    writer.releaseLock();
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
      } else if (s === 'error' || s === 'disconnected' || s === 'coveropen' || s === 'paperempty') {
        settled = true;
        clearTimeout(timer);
        _statusListeners.delete(onStatus);
        res(false);
      }
    };

    _statusListeners.add(onStatus);
  });
}

/**
 * Interpret a DLE EOT 2 response byte as a SerialStatus.
 *
 * Known response bytes:
 *   0x12 — ready / online
 *   0x36 — cover open
 *   0x32 — paper near-end or empty
 *   0x52 — other error / offline
 *
 * Anything else is treated as 'online' to avoid false negatives on quirky printers.
 */
function _interpretStatusByte(byte: number): SerialStatus {
  switch (byte) {
    case 0x12:
      return 'online';
    case 0x36:
      return 'coveropen';
    case 0x32:
      return 'paperempty';
    case 0x52:
      return 'offline';
    default:
      return 'online';
  }
}

async function _queryPrinterStatus(port: WebSerialPort): Promise<SerialStatus> {
  // Guard against concurrent invocations (e.g. poll loop + initial connect overlap).
  // If a query is already in progress, return 'online' rather than locking the
  // readable stream a second time (which would throw "ReadableStream is locked").
  if (_statusQueryInFlight) return 'online';
  _statusQueryInFlight = true;

  try {
    return await _doQueryPrinterStatus(port);
  } finally {
    _statusQueryInFlight = false;
  }
}

/**
 * Internal implementation — call only through _queryPrinterStatus() which owns
 * the _statusQueryInFlight guard.
 *
 * Send DLE EOT 2 to the port, read the 1-byte response with a 2 s timeout,
 * and return the interpreted SerialStatus.
 *
 * If the write or read fails, returns 'online' — we assume the printer is ready
 * if it doesn't respond (avoids false negatives on printers that ignore the query).
 */
async function _doQueryPrinterStatus(port: WebSerialPort): Promise<SerialStatus> {
  // --- Write DLE EOT 2 ---
  if (port.writable === null) return 'online';

  const DLE_EOT_2 = new Uint8Array([0x10, 0x04, 0x02]);
  const writer = port.writable.getWriter();
  try {
    await writer.write(DLE_EOT_2);
  } catch (err) {
    if (import.meta.env.DEV) console.error('[printing] DLE EOT 2 write error:', err);
    return 'online';
  } finally {
    writer.releaseLock();
  }

  // --- Read 1-byte response (2 s timeout) ---
  if (port.readable === null) return 'online';

  const reader = port.readable.getReader();
  _reader = reader;

  const timeoutId = setTimeout(() => {
    reader.cancel().catch(() => {
      // ignore cancel errors during timeout
    });
  }, 2000);

  try {
    const { value, done } = await reader.read();
    clearTimeout(timeoutId);
    if (done || value === undefined || value.length === 0) return 'online';
    const byte = value[0];
    if (byte === undefined) return 'online';
    return _interpretStatusByte(byte);
  } catch {
    // Cancelled by timeout or disconnect — treat as online.
    return 'online';
  } finally {
    reader.releaseLock();
    if (_reader === reader) _reader = null;
  }
}

/**
 * Background polling loop. Sends DLE EOT 2 every ~5 s while connected.
 * Stops when _pollAbort is aborted or _port changes to a different instance.
 */
async function _startPollLoop(port: WebSerialPort): Promise<void> {
  const abort = new AbortController();
  _pollAbort = abort;

  const POLL_INTERVAL_MS = 5000;

  while (!abort.signal.aborted && _port === port) {
    // eslint-disable-next-line no-await-in-loop
    await _sleep(POLL_INTERVAL_MS, abort.signal);

    if (abort.signal.aborted || _port !== port) break;

    // eslint-disable-next-line no-await-in-loop
    const newStatus = await _queryPrinterStatus(port);

    if (abort.signal.aborted || _port !== port) break;

    // Only update status if connection is still active (not manually disconnected).
    if (
      _currentStatus !== 'disconnected' &&
      _currentStatus !== 'connecting' &&
      _currentStatus !== 'unsupported'
    ) {
      _setStatus(newStatus);
    }
  }
}

/**
 * Sleep for `ms` milliseconds. Resolves early (silently) if the AbortSignal fires.
 */
function _sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((res) => {
    const timer = setTimeout(res, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      res();
    });
  });
}
