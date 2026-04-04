import { javascript } from '@codemirror/lang-javascript';
import type { Extension } from '@codemirror/state';

/**
 * javascriptSyntax.ts — CodeMirror 6 JavaScript language extension.
 *
 * Replaces the old ReceiptLine-specific StreamLanguage tokeniser now that
 * the editor content format has changed from ReceiptLine markdown to JavaScript
 * encoder code (e.g. encoder.initialize().line('Hello').rule().cut()).
 *
 * @codemirror/lang-javascript provides full JS syntax highlighting, bracket
 * matching, and auto-completion via a Lezer grammar — no custom implementation needed.
 */
export const javascriptSyntax: Extension = javascript();
