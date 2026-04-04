/// <reference types="vite/client" />

// These packages ship no TypeScript declarations.
// Typed wrappers live in src/lib/encoder.ts and src/lib/printing.ts respectively.
declare module '@point-of-sale/receipt-printer-encoder' {
  interface PrinterModelEntry {
    id: string;
    name: string;
  }
  const ReceiptPrinterEncoder: {
    new (options?: Record<string, unknown>): unknown;
    readonly printerModels: PrinterModelEntry[];
  };
  export default ReceiptPrinterEncoder;
}

declare module '@point-of-sale/webserial-receipt-printer' {
  const WebSerialReceiptPrinter: new (options?: Record<string, unknown>) => unknown;
  export default WebSerialReceiptPrinter;
}
