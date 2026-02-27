import { StreamLanguage } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';

/**
 * receiptLineSyntax.ts — CodeMirror 6 StreamLanguage for ReceiptLine markdown.
 *
 * Why StreamLanguage instead of a full Lezer grammar?
 * StreamLanguage wraps the legacy CodeMirror 5 "mode" API, which is much simpler
 * to implement for a custom DSL. A full Lezer grammar would give better incremental
 * parsing, but for a line-oriented DSL like ReceiptLine the stream approach is
 * sufficient and much less code.
 *
 * The ReceiptLine format is documented at https://github.com/receiptline/receiptline
 * Key syntax elements highlighted here:
 *   - Pipe `|` — column separator
 *   - `{key:value}` — inline properties (font, align, width, barcode params, etc.)
 *   - `^` `<` `>` — alignment shortcuts (centre, left, right)
 *   - `---` or `===` — separator lines
 *   - `//` — comment lines (not part of the receipt output)
 *   - `{{...}}` — placeholder tags (detected here but highlighted by placeholderHighlight.ts)
 */

// Token names correspond to CSS classes injected by CodeMirror's default highlight theme.
// For example, 'keyword' → cm-keyword, 'string' → cm-string, etc.
// We map ReceiptLine tokens to the closest semantic token.
const TOKEN = {
  separator: 'keyword', // --- and ===
  column: 'operator', // |
  property: 'meta', // {key:value} blocks
  alignment: 'atom', // ^ < >
  comment: 'comment', // // lines
  escape: 'string', // \n etc.
} as const;

/**
 * StreamLanguage tokenizer state. ReceiptLine is line-oriented so we track
 * whether we are inside a {property} block to avoid false matches.
 */
interface ReceiptLineState {
  inProperty: boolean;
}

export const receiptLineSyntax = StreamLanguage.define<ReceiptLineState>({
  name: 'receiptline',

  startState(): ReceiptLineState {
    return { inProperty: false };
  },

  token(stream: StringStream, state: ReceiptLineState): string | null {
    // Comment lines start with //
    if (stream.sol() && stream.match('//')) {
      stream.skipToEnd();
      return TOKEN.comment;
    }

    // Separator lines: --- or === (must be entire line content)
    if (stream.sol() && (stream.match(/^-{3,}/) || stream.match(/^={3,}/))) {
      stream.skipToEnd();
      return TOKEN.separator;
    }

    // Opening of a property block {
    if (stream.eat('{')) {
      state.inProperty = true;
      return TOKEN.property;
    }

    // Inside a property block — consume until closing }
    if (state.inProperty) {
      if (stream.eat('}')) {
        state.inProperty = false;
        return TOKEN.property;
      }
      // Consume property content char by char
      stream.next();
      return TOKEN.property;
    }

    // Column separator |
    if (stream.eat('|')) {
      return TOKEN.column;
    }

    // Alignment shortcuts (must appear at start or after whitespace in ReceiptLine)
    if (stream.eat('^') || stream.eat('<') || stream.eat('>')) {
      return TOKEN.alignment;
    }

    // Escape sequences
    if (stream.match(/^\\[\\nrt]/)) {
      return TOKEN.escape;
    }

    // Advance by one character to avoid infinite loops on unrecognised input.
    // Returning null means "no special token — use default text styling".
    stream.next();
    return null;
  },

  // Reset state at the start of each line (ReceiptLine is line-oriented)
  blankLine(state: ReceiptLineState): void {
    state.inProperty = false;
  },
});
