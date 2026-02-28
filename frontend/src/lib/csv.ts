/**
 * csv.ts — Browser-side CSV parser utility.
 *
 * Extracted from BatchCsvDialog so the parsing logic is independently testable
 * and reusable. Pure function with no side effects.
 *
 * Supports:
 *   - Comma separator
 *   - Quoted fields (double-quote delimited) containing commas or embedded newlines
 *   - First row as column headers (trimmed, case preserved)
 *   - Returns an array of row objects keyed by header name
 *
 * We deliberately avoid importing a CSV library here to keep the bundle lean and
 * to avoid adding another dependency for a task that is straightforward to implement.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split a single CSV line into an array of field values.
 *
 * Handles:
 *   - Plain fields: `foo,bar,baz` → ['foo','bar','baz']
 *   - Quoted fields: `"hello, world","foo"` → ['hello, world','foo']
 *   - Escaped quotes inside quoted fields: `"she said ""hi"""` → ['she said "hi"']
 *
 * @param line - A single CSV text line (without the trailing newline)
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  // An empty line has zero fields
  if (line.length === 0) return fields;

  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field: scan until closing un-escaped quote
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped double-quote inside field
            field += '"';
            i += 2;
          } else {
            // Closing quote
            i++;
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      // Skip optional comma after closing quote
      if (i < line.length && line[i] === ',') i++;
    } else {
      // Unquoted field: read until comma or end of line
      const start = i;
      while (i < line.length && line[i] !== ',') i++;
      fields.push(line.slice(start, i));
      // Skip the comma; if we consumed a comma, loop continues for next field
      if (i < line.length && line[i] === ',') {
        i++;
        // Trailing comma: the line ends right after the comma → empty last field
        if (i === line.length) fields.push('');
      }
    }
  }

  return fields;
}

/**
 * Tokenise a CSV text into logical rows, respecting quoted fields that span
 * multiple physical lines.
 *
 * Returns an array where each element is the raw text of one logical CSV row
 * (multi-line quoted fields are joined back with '\n').
 */
function tokeniseCsvRows(text: string): string[] {
  const rows: string[] = [];
  // Normalise line endings to \n
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalised.split('\n');

  let current = '';
  let inQuote = false;

  for (const line of lines) {
    if (current.length > 0) {
      // Continuation of a previous logical row
      current += '\n' + line;
    } else {
      current = line;
    }

    // Count whether we are inside a quoted field by scanning `current`
    // (re-scan rather than track incrementally so the logic stays simple)
    inQuote = false;
    for (let i = 0; i < current.length; i++) {
      if (current[i] === '"') {
        if (!inQuote) {
          inQuote = true;
        } else if (current[i + 1] === '"') {
          // Escaped quote — skip next character
          i++;
        } else {
          inQuote = false;
        }
      }
    }

    if (!inQuote) {
      // Logical row complete
      rows.push(current);
      current = '';
    }
    // If still inQuote, we continue accumulating lines
  }

  // Any remaining partial row (e.g. file without trailing newline)
  if (current.trim().length > 0) {
    rows.push(current);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a CSV text string into an array of row objects.
 *
 * The first row is treated as a header row. Header names are trimmed of
 * whitespace but otherwise preserved (not lowercased) so callers can do
 * their own case-insensitive matching if needed.
 *
 * Returns an empty array if the input has fewer than two rows (header only
 * or completely empty).
 *
 * @example
 * parseCsv('name,price\nApple,1.00\nBanana,0.50')
 * // => [{ name: 'Apple', price: '1.00' }, { name: 'Banana', price: '0.50' }]
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rawRows = tokeniseCsvRows(text).filter((r) => r.trim().length > 0);

  if (rawRows.length < 2) {
    // Need at least a header row and one data row
    return [];
  }

  const firstRow = rawRows[0];
  if (firstRow === undefined) return [];
  const headers = splitCsvLine(firstRow).map((h) => h.trim());

  const result: Record<string, string>[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row === undefined) continue;
    const fields = splitCsvLine(row);
    const obj: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = fields[j];
      // undefined/missing fields become empty strings
      if (header !== undefined) {
        obj[header] = value ?? '';
      }
    }

    result.push(obj);
  }

  return result;
}
