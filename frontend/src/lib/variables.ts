/**
 * variables.ts — Placeholder detection and resolution for ReceiptLine documents.
 *
 * All placeholder logic lives here. The server never sees placeholder syntax —
 * it stores document content as an opaque string and this module handles
 * everything in the browser. See docs/design.md §9.5 for the full spec.
 *
 * Placeholder syntax (from docs/design.md §6):
 *   {{field_name}}               — scalar replacement
 *   {{date}} {{time}} {{datetime}} — auto-filled from system clock
 *   {{#items}} ... {{/items}}    — line-item block, repeated per row
 */

// ---------------------------------------------------------------------------
// Regex constants
// ---------------------------------------------------------------------------

/**
 * Matches a scalar placeholder: {{field_name}}
 * Capture group 1: the field name (lowercase letters, digits, underscores)
 * Global flag so matchAll works correctly.
 */
const SCALAR_RE = /\{\{([a-z0-9_]+)\}\}/g;

/**
 * Matches the full {{#items}} ... {{/items}} block, including its contents.
 * The [\s\S]*? non-greedy match handles multi-line block bodies.
 * This needs to be recreated for each call (not a cached global) to avoid
 * lastIndex state issues with the g flag.
 */
function blockRe(): RegExp {
  return /\{\{#items\}\}([\s\S]*?)\{\{\/items\}\}/g;
}

// ---------------------------------------------------------------------------
// Built-in date/time auto-fill
// ---------------------------------------------------------------------------

/**
 * Generate the built-in date/time values from the current system clock.
 * These are pre-populated into the values map before user-supplied values
 * are applied, so user-supplied values can override them.
 */
function builtinDateValues(): Record<string, string> {
  const now = new Date();
  // Format: YYYY-MM-DD
  const date = now.toISOString().slice(0, 10);
  // Format: HH:MM:SS (local time via toTimeString to respect the user's timezone)
  const timeParts = now.toTimeString().slice(0, 8);
  return {
    date,
    time: timeParts,
    datetime: `${date} ${timeParts}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan the content for all scalar placeholder names ({{field_name}}).
 * Returns a deduplicated, sorted list of field names.
 * Block tags ({{#items}}, {{/items}}) and field names inside blocks are included.
 *
 * @example
 * detectPlaceholders('Hello {{name}}, total: {{total}}')
 * // => ['name', 'total']
 */
export function detectPlaceholders(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(SCALAR_RE)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return Array.from(names).sort();
}

/**
 * Return true if the content contains any placeholder syntax.
 * A document is a "template" when this is true.
 *
 * Checks both scalar {{field}} and block {{#items}} syntax.
 */
export function isTemplate(content: string): boolean {
  return content.includes('{{');
}

/**
 * Replace all scalar placeholders in content with values from the provided map.
 *
 * Built-in date/time placeholders ({{date}}, {{time}}, {{datetime}}) are
 * pre-populated from the system clock but can be overridden by providing them
 * in the values map.
 *
 * Unresolved placeholders (names not in the map) are left as-is, so the user
 * can see which fields still need values.
 *
 * @param content - The ReceiptLine markdown string with {{field}} tags
 * @param values - Map of field name → replacement string
 */
export function resolveScalars(content: string, values: Record<string, string>): string {
  // Merge built-in values first so user-supplied values take precedence
  const merged: Record<string, string> = { ...builtinDateValues(), ...values };

  return content.replace(SCALAR_RE, (_match, name: string) => {
    const value = merged[name];
    // Leave the placeholder intact if no value was supplied, so the user
    // can see what is still unfilled.
    return value !== undefined ? value : `{{${name}}}`;
  });
}

/**
 * Expand the {{#items}}...{{/items}} block by repeating it for each row of items.
 *
 * The block body is a template string containing {{field}} placeholders. Each
 * row in the items array provides the values for one expansion.
 *
 * If no block exists in the content, the content is returned unchanged.
 *
 * @param content - The ReceiptLine markdown containing an {{#items}}...{{/items}} block
 * @param items - Array of row objects; each row maps field name → value
 */
export function resolveLineItems(content: string, items: Record<string, string>[]): string {
  return content.replace(blockRe(), (_match, blockBody: string) => {
    if (items.length === 0) return '';
    return items
      .map((row) => {
        // For each row, substitute its fields into the block body.
        // Note: we do NOT merge date/time builtins here — line items are data rows,
        // not scalar context. Date/time applies to the outer document only.
        return blockBody.replace(SCALAR_RE, (_m, fieldName: string) => {
          const value = row[fieldName];
          return value !== undefined ? value : `{{${fieldName}}}`;
        });
      })
      .join('');
  });
}

/**
 * Full resolution: apply both scalar replacement and line-item expansion.
 *
 * This is the main entry point for the placeholder system. It applies
 * scalar resolution first (which handles date/time and outer scalar fields),
 * then line-item expansion.
 *
 * @param content - Raw ReceiptLine markdown with placeholder syntax
 * @param data - Resolution data:
 *   - scalars: map of field name → value for scalar {{field}} placeholders
 *   - items: array of row objects for {{#items}}...{{/items}} expansion
 */
export function resolve(
  content: string,
  data: {
    scalars?: Record<string, string>;
    items?: Record<string, string>[];
  },
): string {
  let result = content;

  // Step 1: resolve scalar placeholders (including built-in date/time)
  result = resolveScalars(result, data.scalars ?? {});

  // Step 2: expand the line-item block
  if (data.items !== undefined) {
    result = resolveLineItems(result, data.items);
  }

  return result;
}
