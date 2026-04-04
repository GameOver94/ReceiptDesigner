import type { PlaceholderMeta } from '$types/index';

/**
 * variables.ts — Placeholder detection and resolution for encoder JS documents.
 *
 * All placeholder logic lives here. The server never sees placeholder syntax —
 * it stores document content as an opaque string and this module handles
 * everything in the browser. See docs/design.md §9.5 for the full spec.
 *
 * Placeholder syntax (from docs/design.md §6):
 *   {{field_name}}               — scalar replacement
 *   {{date}} {{time}} {{datetime}} — auto-filled from system clock
 *   {{random:length:charset}}    — random string (e.g. {{random:16:A-Z,a-z,0-9,#%<>}})
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
 * Matches random placeholder syntax:
 *   {{random:16}}
 *   {{random:16:A-Z,a-z,0-9,#%<>}}
 */
const RANDOM_RE = /\{\{random:(\d+)(?::([^}]+))?\}\}/g;

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const DEFAULT_RANDOM_CHARSET = `${UPPERCASE}${LOWERCASE}${DIGITS}`;

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

function charsetFromSpec(spec: string | undefined): string {
  if (spec === undefined || spec.trim() === '') {
    return DEFAULT_RANDOM_CHARSET;
  }

  const chars: string[] = [];
  for (const rawToken of spec.split(',')) {
    const token = rawToken.trim();
    if (token === '') continue;

    if (token === 'A-Z') {
      chars.push(...UPPERCASE);
      continue;
    }
    if (token === 'a-z') {
      chars.push(...LOWERCASE);
      continue;
    }
    if (token === '0-9') {
      chars.push(...DIGITS);
      continue;
    }

    chars.push(...token);
  }

  if (chars.length === 0) return DEFAULT_RANDOM_CHARSET;
  return Array.from(new Set(chars)).join('');
}

function randomString(length: number, charset: string): string {
  if (length <= 0 || charset.length === 0) return '';

  const out: string[] = [];
  const maxUnbiased = 256 - (256 % charset.length);

  while (out.length < length) {
    const bytes = new Uint8Array(Math.max(16, (length - out.length) * 2));
    crypto.getRandomValues(bytes);

    for (const b of bytes) {
      if (b >= maxUnbiased) continue;
      out.push(charset[b % charset.length] ?? '');
      if (out.length >= length) break;
    }
  }

  return out.join('');
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
 * Build a scalar value map from per-field placeholder metadata.
 *
 * Only entries with a non-empty defaultValue are included.
 */
export function defaultsFromMeta(meta: PlaceholderMeta[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const entry of meta) {
    const value = entry.defaultValue;
    if (value !== undefined && value !== '') {
      defaults[entry.name] = value;
    }
  }
  return defaults;
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
 * @param content - The encoder JS code string with {{field}} tags
 * @param values - Map of field name → replacement string
 */
export function resolveScalars(content: string, values: Record<string, string>): string {
  // Merge built-in values first so user-supplied values take precedence
  const merged: Record<string, string> = { ...builtinDateValues(), ...values };

  const withRandom = content.replace(RANDOM_RE, (match, lenRaw: string, charsetSpec?: string) => {
    const length = Number.parseInt(lenRaw, 10);
    if (!Number.isFinite(length) || length <= 0) {
      return match;
    }
    const charset = charsetFromSpec(charsetSpec);
    return randomString(length, charset);
  });

  return withRandom.replace(SCALAR_RE, (_match, name: string) => {
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
 * @param content - The encoder JS code containing an {{#items}}...{{/items}} block
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
 * @param content - Raw encoder JS code with placeholder syntax
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
  // When items are provided, expand blocks first so row data has priority inside
  // {{#items}} bodies. Then run scalar resolution as a fallback for any remaining
  // placeholders (including outer scalars + built-in date/time).
  if (data.items !== undefined) {
    const afterItems = resolveLineItems(content, data.items);
    return resolveScalars(afterItems, data.scalars ?? {});
  }

  return resolveScalars(content, data.scalars ?? {});
}
