import { describe, expect, it } from 'vitest';

import { resolveContent, toEscPos } from './pipeline';
import type { PlaceholderMeta, PrinterSettings } from '$types/index';

const TEST_SETTINGS: PrinterSettings = {
  columns: 48,
  language: 'esc-pos',
  printerModel: '',
  codepageMapping: 'epson',
  feedBeforeCut: 4,
  newline: '\n\r',
  imageMode: 'column',
};

describe('resolveContent', () => {
  it('applies placeholder metadata defaults when no CSV is loaded', () => {
    const meta: PlaceholderMeta[] = [
      { name: 'shop', label: 'Shop', defaultValue: 'Cafe Rio', required: false },
    ];

    const [resolved = ''] = resolveContent('Store: {{shop}}', [], null, 0, false, meta);
    expect(resolved).toBe('Store: Cafe Rio');
  });

  it('lets CSV row values override metadata defaults in batch mode', () => {
    const meta: PlaceholderMeta[] = [
      { name: 'shop', label: 'Shop', defaultValue: 'Default Shop', required: false },
      { name: 'cashier', label: 'Cashier', defaultValue: 'Default Cashier', required: false },
    ];
    const rows = [{ shop: 'CSV Shop' }];

    const [resolved = ''] = resolveContent('{{shop}} / {{cashier}}', rows, 'batch', 0, true, meta);

    expect(resolved).toBe('CSV Shop / Default Cashier');
  });
});

describe('toEscPos', () => {
  it('resolves to a Uint8Array for a minimal valid encoder snippet', async () => {
    const result = await toEscPos("encoder.initialize().line('Hello').cut()", TEST_SETTINGS);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('rejects when the encoder snippet contains invalid JS', async () => {
    await expect(toEscPos('this is not valid javascript }{', TEST_SETTINGS)).rejects.toThrow();
  });
});
