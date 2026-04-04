import { describe, expect, it } from 'vitest';

import { resolveContent } from './pipeline';
import type { PlaceholderMeta } from '$types/index';

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
