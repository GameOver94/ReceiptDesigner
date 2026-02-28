import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  // ---------------------------------------------------------------------------
  // Empty / degenerate inputs
  // ---------------------------------------------------------------------------

  it('returns empty array for empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseCsv('   \n  \n')).toEqual([]);
  });

  it('returns empty array when only a header row is present', () => {
    expect(parseCsv('name,price')).toEqual([]);
  });

  it('returns empty array for a single blank line', () => {
    expect(parseCsv('\n')).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Basic happy-path cases
  // ---------------------------------------------------------------------------

  it('parses a simple 2-column CSV', () => {
    const result = parseCsv('name,price\nApple,1.00\nBanana,0.50');
    expect(result).toEqual([
      { name: 'Apple', price: '1.00' },
      { name: 'Banana', price: '0.50' },
    ]);
  });

  it('parses a single data row', () => {
    const result = parseCsv('id,title\n42,Hello World');
    expect(result).toEqual([{ id: '42', title: 'Hello World' }]);
  });

  it('handles trailing newline in the file', () => {
    const result = parseCsv('name,price\nApple,1.00\n');
    expect(result).toEqual([{ name: 'Apple', price: '1.00' }]);
  });

  it('handles Windows CRLF line endings', () => {
    const result = parseCsv('name,price\r\nApple,1.00\r\nBanana,0.50\r\n');
    expect(result).toEqual([
      { name: 'Apple', price: '1.00' },
      { name: 'Banana', price: '0.50' },
    ]);
  });

  it('handles classic Mac CR-only line endings', () => {
    const result = parseCsv('name,price\rApple,1.00\rBanana,0.50');
    expect(result).toEqual([
      { name: 'Apple', price: '1.00' },
      { name: 'Banana', price: '0.50' },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Header trimming
  // ---------------------------------------------------------------------------

  it('trims whitespace from header names', () => {
    const result = parseCsv(' name , price \nApple,1.00');
    expect(result).toEqual([{ name: 'Apple', price: '1.00' }]);
  });

  it('preserves header case', () => {
    const result = parseCsv('ProductName,UnitPrice\nApple,1.00');
    expect(result).toEqual([{ ProductName: 'Apple', UnitPrice: '1.00' }]);
  });

  // ---------------------------------------------------------------------------
  // Quoted fields
  // ---------------------------------------------------------------------------

  it('handles a quoted field containing a comma', () => {
    const result = parseCsv('name,address\nAlice,"123 Main St, Apt 4"');
    expect(result).toEqual([{ name: 'Alice', address: '123 Main St, Apt 4' }]);
  });

  it('handles escaped double-quotes inside a quoted field', () => {
    const result = parseCsv('name,quote\nBob,"She said ""hi"""');
    expect(result).toEqual([{ name: 'Bob', quote: 'She said "hi"' }]);
  });

  it('handles an entirely quoted field value', () => {
    const result = parseCsv('a,b\n"hello","world"');
    expect(result).toEqual([{ a: 'hello', b: 'world' }]);
  });

  it('handles a quoted field containing a newline (multi-line quoted field)', () => {
    const csv = 'name,bio\nAlice,"Line one\nLine two"';
    const result = parseCsv(csv);
    expect(result).toEqual([{ name: 'Alice', bio: 'Line one\nLine two' }]);
  });

  // ---------------------------------------------------------------------------
  // Missing / extra fields in data rows
  // ---------------------------------------------------------------------------

  it('fills missing fields with empty string when a data row has fewer columns', () => {
    const result = parseCsv('a,b,c\n1,2');
    expect(result).toEqual([{ a: '1', b: '2', c: '' }]);
  });

  it('ignores extra fields in data rows beyond the header column count', () => {
    // Extra columns are silently dropped because we only iterate over headers.
    const result = parseCsv('a,b\n1,2,3,4');
    expect(result).toEqual([{ a: '1', b: '2' }]);
  });

  // ---------------------------------------------------------------------------
  // Edge cases with empty fields
  // ---------------------------------------------------------------------------

  it('returns empty string for an empty unquoted field', () => {
    const result = parseCsv('a,b,c\n1,,3');
    expect(result).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('returns empty string for an empty quoted field ""', () => {
    const result = parseCsv('a,b\n"",hello');
    expect(result).toEqual([{ a: '', b: 'hello' }]);
  });

  // ---------------------------------------------------------------------------
  // Blank data rows between valid rows
  // ---------------------------------------------------------------------------

  it('skips blank lines between data rows', () => {
    const result = parseCsv('name,price\nApple,1.00\n\nBanana,0.50');
    // parseCsv filters out blank rows via filter(r => r.trim().length > 0)
    expect(result).toEqual([
      { name: 'Apple', price: '1.00' },
      { name: 'Banana', price: '0.50' },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Single-column CSV
  // ---------------------------------------------------------------------------

  it('parses a single-column CSV correctly', () => {
    const result = parseCsv('tag\nalpha\nbeta\ngamma');
    expect(result).toEqual([{ tag: 'alpha' }, { tag: 'beta' }, { tag: 'gamma' }]);
  });

  // ---------------------------------------------------------------------------
  // Many columns
  // ---------------------------------------------------------------------------

  it('parses a wide CSV with many columns', () => {
    const headers = Array.from({ length: 10 }, (_, i) => `col${String(i)}`);
    const values = Array.from({ length: 10 }, (_, i) => String(i * 10));
    const csv = `${headers.join(',')}\n${values.join(',')}`;
    const result = parseCsv(csv);
    const expected = Object.fromEntries(headers.map((h, i) => [h, String(i * 10)]));
    expect(result).toEqual([expected]);
  });

  // ---------------------------------------------------------------------------
  // Numeric-looking and special-character values
  // ---------------------------------------------------------------------------

  it('preserves numeric strings as-is without parsing', () => {
    const result = parseCsv('amount\n3.14\n0\n-42');
    expect(result).toEqual([{ amount: '3.14' }, { amount: '0' }, { amount: '-42' }]);
  });

  it('preserves special characters in unquoted fields', () => {
    const result = parseCsv('symbol\n#\n@\n!');
    expect(result).toEqual([{ symbol: '#' }, { symbol: '@' }, { symbol: '!' }]);
  });
});
