/**
 * variables.test.ts — Unit tests for the placeholder resolution module.
 *
 * 100% branch coverage is required for this file (see docs/coding-style.md §12.1).
 * All placeholder resolution is pure-function logic with no side effects, so
 * it is straightforward to unit test without mocking.
 *
 * Test format: describe('function') > it('does X when Y')
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectPlaceholders,
  isTemplate,
  resolveScalars,
  resolveLineItems,
  resolve,
} from './variables';

// ---------------------------------------------------------------------------
// detectPlaceholders
// ---------------------------------------------------------------------------

describe('detectPlaceholders', () => {
  it('returns an empty array when content has no placeholders', () => {
    expect(detectPlaceholders('Hello world')).toEqual([]);
  });

  it('returns a sorted list of scalar field names', () => {
    const result = detectPlaceholders('{{total}} {{name}} {{date}}');
    expect(result).toEqual(['date', 'name', 'total']);
  });

  it('deduplicates repeated placeholder names', () => {
    const result = detectPlaceholders('{{name}} and {{name}} again');
    expect(result).toEqual(['name']);
  });

  it('detects placeholders inside a line-item block', () => {
    const content = '{{#items}}\n{{item_name}} | {{price}}\n{{/items}}';
    const result = detectPlaceholders(content);
    expect(result).toEqual(['item_name', 'price']);
  });

  it('detects both outer scalars and block field names', () => {
    const content = '{{shop}} {{#items}}{{item}}{{/items}} {{date}}';
    const result = detectPlaceholders(content);
    expect(result).toEqual(['date', 'item', 'shop']);
  });

  it('ignores block open/close tags (they are not field names)', () => {
    const content = '{{#items}}{{item}}{{/items}}';
    const result = detectPlaceholders(content);
    // #items and /items do not match the lowercase field name pattern
    expect(result).not.toContain('#items');
    expect(result).not.toContain('/items');
  });
});

// ---------------------------------------------------------------------------
// isTemplate
// ---------------------------------------------------------------------------

describe('isTemplate', () => {
  it('returns false for content with no placeholders', () => {
    expect(isTemplate('Plain receipt content')).toBe(false);
  });

  it('returns true for content with a scalar placeholder', () => {
    expect(isTemplate('Hello {{name}}')).toBe(true);
  });

  it('returns true for content with a block placeholder', () => {
    expect(isTemplate('{{#items}}{{item}}{{/items}}')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isTemplate('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveScalars
// ---------------------------------------------------------------------------

describe('resolveScalars', () => {
  it('replaces a single scalar placeholder with its value', () => {
    expect(resolveScalars('Hello {{name}}', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('replaces multiple different placeholders', () => {
    const result = resolveScalars('{{greeting}} {{name}}!', {
      greeting: 'Hi',
      name: 'Bob',
    });
    expect(result).toBe('Hi Bob!');
  });

  it('replaces all occurrences of the same placeholder', () => {
    const result = resolveScalars('{{x}} and {{x}}', { x: 'hello' });
    expect(result).toBe('hello and hello');
  });

  it('leaves unresolved placeholders intact', () => {
    const result = resolveScalars('{{name}} owes {{amount}}', { name: 'Alice' });
    expect(result).toBe('Alice owes {{amount}}');
  });

  it('auto-fills {{date}} from the system clock', () => {
    // Mock Date to a known value so the assertion is deterministic
    const fakeNow = new Date('2026-03-15T10:30:45Z');
    vi.setSystemTime(fakeNow);

    const result = resolveScalars('Date: {{date}}', {});
    expect(result).toBe('Date: 2026-03-15');

    vi.useRealTimers();
  });

  it('auto-fills {{time}} from the system clock', () => {
    const fakeNow = new Date('2026-03-15T10:30:45.000Z');
    vi.setSystemTime(fakeNow);

    const result = resolveScalars('Time: {{time}}', {});
    // Time format is HH:MM:SS — the exact value depends on local timezone in toTimeString()
    // so we just check it matches the pattern rather than a hardcoded string.
    expect(result).toMatch(/^Time: \d{2}:\d{2}:\d{2}$/);

    vi.useRealTimers();
  });

  it('auto-fills {{datetime}} from the system clock', () => {
    const fakeNow = new Date('2026-03-15T10:30:45.000Z');
    vi.setSystemTime(fakeNow);

    const result = resolveScalars('{{datetime}}', {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    vi.useRealTimers();
  });

  it('user-supplied value overrides built-in {{date}}', () => {
    const result = resolveScalars('{{date}}', { date: '2000-01-01' });
    expect(result).toBe('2000-01-01');
  });

  it('returns unchanged content when content has no placeholders', () => {
    const content = 'No placeholders here';
    expect(resolveScalars(content, { foo: 'bar' })).toBe(content);
  });

  it('returns unchanged content when values map is empty and there are no builtins', () => {
    // Only non-builtin placeholder — should remain as-is
    const result = resolveScalars('{{custom_field}}', {});
    expect(result).toBe('{{custom_field}}');
  });
});

// ---------------------------------------------------------------------------
// resolveLineItems
// ---------------------------------------------------------------------------

describe('resolveLineItems', () => {
  it('returns content unchanged when there is no block', () => {
    const content = 'No block here';
    expect(resolveLineItems(content, [{ item: 'x' }])).toBe(content);
  });

  it('removes the block when items array is empty', () => {
    const content = 'Before\n{{#items}}\n{{name}}\n{{/items}}\nAfter';
    expect(resolveLineItems(content, [])).toBe('Before\n\nAfter');
  });

  it('expands the block once per item', () => {
    const content = '{{#items}}{{name}}\n{{/items}}';
    const items = [{ name: 'Apple' }, { name: 'Banana' }];
    expect(resolveLineItems(content, items)).toBe('Apple\nBanana\n');
  });

  it('replaces multiple fields within each block iteration', () => {
    const content = '{{#items}}{{item}} | {{qty}} | {{price}}\n{{/items}}';
    const items = [
      { item: 'Coffee', qty: '2', price: '3.00' },
      { item: 'Tea', qty: '1', price: '2.50' },
    ];
    expect(resolveLineItems(content, items)).toBe('Coffee | 2 | 3.00\nTea | 1 | 2.50\n');
  });

  it('leaves unfilled fields intact inside the block', () => {
    const content = '{{#items}}{{name}} | {{missing}}\n{{/items}}';
    const items = [{ name: 'Item' }];
    expect(resolveLineItems(content, items)).toBe('Item | {{missing}}\n');
  });

  it('handles multi-line block bodies', () => {
    const content = '{{#items}}\n{{line1}}\n{{line2}}\n{{/items}}';
    const items = [{ line1: 'A', line2: 'B' }];
    expect(resolveLineItems(content, items)).toBe('\nA\nB\n');
  });
});

// ---------------------------------------------------------------------------
// resolve (combined)
// ---------------------------------------------------------------------------

describe('resolve', () => {
  it('applies scalar resolution when only scalars are provided', () => {
    const result = resolve('Hello {{name}}', { scalars: { name: 'World' } });
    expect(result).toBe('Hello World');
  });

  it('applies line-item expansion when only items are provided', () => {
    const result = resolve('{{#items}}{{x}}\n{{/items}}', { items: [{ x: 'a' }, { x: 'b' }] });
    expect(result).toBe('a\nb\n');
  });

  it('applies both scalar and line-item resolution together', () => {
    const content = '{{shop}}\n{{#items}}{{item}} {{price}}\n{{/items}}\nTotal: {{total}}';
    const result = resolve(content, {
      scalars: { shop: 'My Shop', total: '5.00' },
      items: [
        { item: 'Coffee', price: '3.00' },
        { item: 'Tea', price: '2.00' },
      ],
    });
    expect(result).toBe('My Shop\nCoffee 3.00\nTea 2.00\n\nTotal: 5.00');
  });

  it('applies scalar resolution before line-item expansion (outer scalars resolved first)', () => {
    // The outer {{date}} should be resolved even though items are present
    const content = '{{date}}\n{{#items}}{{item}}\n{{/items}}';
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const result = resolve(content, { items: [{ item: 'x' }] });
    expect(result).toMatch(/^2026-01-01\nx\n$/);
    vi.useRealTimers();
  });

  it('works with empty data object (returns content with auto date/time filled)', () => {
    // Scalar auto-fill still runs even with empty data
    vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));
    const result = resolve('{{date}}', {});
    expect(result).toBe('2026-03-15');
    vi.useRealTimers();
  });

  it('returns unchanged content when content is plain text with empty data', () => {
    const content = 'Plain receipt';
    expect(resolve(content, {})).toBe(content);
  });

  it('does not expand the line-item block when items is undefined', () => {
    const content = '{{#items}}{{item}}\n{{/items}}';
    const result = resolve(content, { scalars: { foo: 'bar' } });
    // Block should remain intact — items: undefined means no expansion
    expect(result).toBe(content);
  });
});
