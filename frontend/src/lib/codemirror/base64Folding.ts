import { foldGutter, foldService } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

const MIN_FOLD_LENGTH = 120;

interface QuotedRange {
  quoteStart: number;
  quoteEnd: number;
  value: string;
}

function findQuotedValue(line: string, fromIndex: number): QuotedRange | null {
  let quoteStart = -1;
  let quoteChar: "'" | '"' | '`' | null = null;

  for (let index = fromIndex; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === "'" || ch === '"' || ch === '`') {
      quoteStart = index;
      quoteChar = ch;
      break;
    }
  }

  if (quoteStart === -1 || quoteChar === null) {
    return null;
  }

  let escaped = false;
  for (let index = quoteStart + 1; index < line.length; index += 1) {
    const ch = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quoteChar) {
      const value = line.slice(quoteStart + 1, index);
      return { quoteStart, quoteEnd: index, value };
    }
  }

  return null;
}

/**
 * Enable folding for long single-line base64 data URL assignments, e.g.:
 * `const logoBase64 = 'data:image/png;base64,...';`
 */
const base64DataUrlFold = foldService.of((state, lineStart, lineEnd) => {
  const line = state.sliceDoc(lineStart, lineEnd);
  if (!line.includes('data:image/')) {
    return null;
  }

  const assignIndex = line.indexOf('=');
  if (assignIndex === -1) {
    return null;
  }

  const declaration = line.slice(0, assignIndex);
  if (!/^\s*(const|let|var)\s+[A-Za-z_$][\w$]*\s*$/.test(declaration)) {
    return null;
  }

  const quoted = findQuotedValue(line, assignIndex);
  if (quoted === null) {
    return null;
  }

  if (quoted.value.includes('${')) {
    // Template interpolation changes runtime value; skip folding in that case.
    return null;
  }

  const payload = quoted.value;
  if (!payload.startsWith('data:image/') || payload.length < MIN_FOLD_LENGTH) {
    return null;
  }

  // Keep metadata visible (`data:image/...;base64,`) and fold the large payload tail.
  const base64MarkerIndex = payload.indexOf('base64,');
  const foldValueStart =
    base64MarkerIndex === -1 ? 0 : base64MarkerIndex + 'base64,'.length;

  if (payload.length - foldValueStart < MIN_FOLD_LENGTH) {
    return null;
  }

  return {
    from: lineStart + quoted.quoteStart + 1 + foldValueStart,
    to: lineStart + quoted.quoteEnd,
  };
});

export const base64FoldingExtensions: Extension[] = [foldGutter(), base64DataUrlFold];
