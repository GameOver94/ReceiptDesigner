import type { EditorView } from '@codemirror/view';
import { foldEffect, foldable } from '@codemirror/language';

export interface CommandVariation {
  label: string;
  snippet: string;
}

export interface EditorToolbarCommand {
  id: string;
  label: string;
  icon?: string;
  snippet: string;
  preview: string;
  variations: CommandVariation[];
  docsAnchor: string;
}

export interface EditorToolbarGroup {
  id: string;
  label: string;
  commands: EditorToolbarCommand[];
}

const COMMAND_DOCS_BASE_URL =
  'https://github.com/NielsLeenheer/ReceiptPrinterEncoder/blob/main/documentation/commands.md';

export const toolbarGroups: EditorToolbarGroup[] = [
  {
    id: 'setup',
    label: 'Setup',
    commands: [
      {
        id: 'initialize',
        label: 'Initialize',
        icon: 'Power',
        snippet: '.initialize()',
        preview: '.initialize()',
        variations: [
          { label: 'Basic', snippet: '.initialize()' },
          { label: 'Init + line', snippet: ".initialize().line('Receipt')" },
        ],
        docsAnchor: '#initialize',
      },
      {
        id: 'codepage',
        label: 'Codepage',
        icon: 'Languages',
        snippet: ".codepage('auto')",
        preview: ".codepage('auto')",
        variations: [
          { label: 'Auto', snippet: ".codepage('auto')" },
          { label: 'CP850', snippet: ".codepage('cp850')" },
          { label: 'CP437', snippet: ".codepage('cp437')" },
        ],
        docsAnchor: '#codepage',
      },
      {
        id: 'variable',
        label: 'Variable',
        icon: 'Braces',
        snippet: "const storeName = 'Receipt Designer';",
        preview: "const variableName = 'value';",
        variations: [
          { label: 'Const', snippet: "const variableName = 'value';" },
          { label: 'Let', snippet: 'let variableName = 0;' },
          {
            label: 'Use in line',
            snippet: "const total = '12.50';\nencoder.line(`Total: ${total}`);",
          },
        ],
        docsAnchor: '#text',
      },
      {
        id: 'image-base64',
        label: 'Image Base64',
        icon: 'Image',
        snippet: "const imageBase64 = 'data:image/png;base64,PASTE_BASE64_HERE';",
        preview: "const imageBase64 = 'data:image/png;base64,...';",
        variations: [
          {
            label: 'Data URL',
            snippet: "const imageBase64 = 'data:image/png;base64,PASTE_BASE64_HERE';",
          },
          {
            label: 'To image element',
            snippet:
              "const imageElement = new Image();\nimageElement.src = imageBase64;\nencoder.image(imageElement, 256, 128, 'threshold');",
          },
        ],
        docsAnchor: '#image',
      },
    ],
  },
  {
    id: 'style',
    label: 'Style',
    commands: [
      {
        id: 'font',
        label: 'Font',
        icon: 'Type',
        snippet: ".font('B')",
        preview: ".font('B')",
        variations: [
          { label: 'Font A', snippet: ".font('A')" },
          { label: 'Font B', snippet: ".font('B')" },
          { label: '9x17', snippet: ".font('9x17')" },
        ],
        docsAnchor: '#font',
      },
      {
        id: 'size',
        label: 'Size',
        snippet: '.size(2)',
        preview: '.size(2)',
        variations: [
          { label: '2x', snippet: '.size(2)' },
          { label: '2x3', snippet: '.size(2, 3)' },
          { label: 'Reset', snippet: '.size(1)' },
        ],
        docsAnchor: '#size',
      },
      {
        id: 'underline',
        label: 'Underline',
        icon: 'Underline',
        snippet: '.underline()',
        preview: '.underline()',
        variations: [
          { label: 'Toggle', snippet: '.underline()' },
          { label: 'On', snippet: '.underline(true)' },
          { label: 'Off', snippet: '.underline(false)' },
        ],
        docsAnchor: '#underline',
      },
      {
        id: 'bold',
        label: 'Bold',
        icon: 'Bold',
        snippet: '.bold()',
        preview: '.bold()',
        variations: [
          { label: 'Toggle', snippet: '.bold()' },
          { label: 'On', snippet: '.bold(true)' },
          { label: 'Off', snippet: '.bold(false)' },
        ],
        docsAnchor: '#bold',
      },
      {
        id: 'italic',
        label: 'Italic',
        icon: 'Italic',
        snippet: '.italic()',
        preview: '.italic()',
        variations: [
          { label: 'Toggle', snippet: '.italic()' },
          { label: 'On', snippet: '.italic(true)' },
          { label: 'Off', snippet: '.italic(false)' },
        ],
        docsAnchor: '#italic',
      },
      {
        id: 'invert',
        label: 'Invert',
        snippet: '.invert()',
        preview: '.invert()',
        variations: [
          { label: 'Toggle', snippet: '.invert()' },
          { label: 'On', snippet: '.invert(true)' },
          { label: 'Off', snippet: '.invert(false)' },
        ],
        docsAnchor: '#invert',
      },
      {
        id: 'align',
        label: 'Align',
        icon: 'AlignLeft',
        snippet: ".align('left')",
        preview: ".align('left')",
        variations: [
          { label: 'Left', snippet: ".align('left')" },
          { label: 'Center', snippet: ".align('center')" },
          { label: 'Right', snippet: ".align('right')" },
        ],
        docsAnchor: '#align',
      },
    ],
  },
  {
    id: 'text-layout',
    label: 'Text & layout',
    commands: [
      {
        id: 'newline',
        label: 'Newline',
        icon: 'CornerDownLeft',
        snippet: '.newline()',
        preview: '.newline()',
        variations: [
          { label: '1 line', snippet: '.newline()' },
          { label: '2 lines', snippet: '.newline(2)' },
          { label: '4 lines', snippet: '.newline(4)' },
        ],
        docsAnchor: '#newline',
      },
      {
        id: 'line',
        label: 'Line',
        icon: 'Pilcrow',
        snippet: ".line('Text line')",
        preview: ".line('Text line')",
        variations: [
          { label: 'Basic', snippet: ".line('Text line')" },
          { label: 'Empty', snippet: ".line('')" },
          { label: 'Break', snippet: '.newline()' },
        ],
        docsAnchor: '#line',
      },
      {
        id: 'text',
        label: 'Text',
        icon: 'Text',
        snippet: ".text('Text block')",
        preview: ".text('Text block')",
        variations: [
          { label: 'Basic', snippet: ".text('Text block')" },
          { label: 'Long', snippet: ".text('The quick brown fox jumps over the lazy dog')" },
          { label: 'Break', snippet: '.newline(2)' },
        ],
        docsAnchor: '#text',
      },
      {
        id: 'rule',
        label: 'Rule',
        icon: 'Minus',
        snippet: ".rule({ style: 'single' })",
        preview: ".rule({ style: 'single' })",
        variations: [
          { label: 'Single', snippet: ".rule({ style: 'single' })" },
          { label: 'Double', snippet: ".rule({ style: 'double' })" },
          { label: 'Width', snippet: ".rule({ style: 'single', width: 24 })" },
        ],
        docsAnchor: '#rule',
      },
      {
        id: 'box',
        label: 'Box',
        icon: 'Square',
        snippet: ".box({ style: 'single', width: 32 }, 'Box content')",
        preview: ".box({ style: 'single', width: 32 }, 'Box content')",
        variations: [
          { label: 'Single', snippet: ".box({ style: 'single', width: 32 }, 'Box content')" },
          { label: 'Double', snippet: ".box({ style: 'double', width: 32 }, 'Box content')" },
          {
            label: 'Callback',
            snippet:
              ".box({ style: 'single', width: 32 }, (boxEncoder) => boxEncoder.line('Nested line').bold().line('Total').bold())",
          },
        ],
        docsAnchor: '#box',
      },
      {
        id: 'table',
        label: 'Table',
        icon: 'Table',
        snippet:
          ".table(\n  [\n    { width: 32, marginRight: 2, align: 'left' },\n    { width: 10, align: 'right' },\n  ],\n  [\n    ['Item', 'Price'],\n    ['Total', '0.00'],\n  ],\n)",
        preview: '.table([...columns], [...rows])',
        variations: [
          {
            label: '2 col',
            snippet:
              ".table([\n  { width: 32, marginRight: 2, align: 'left' },\n  { width: 10, align: 'right' },\n], [\n  ['Item', 'Price'],\n  ['Total', '0.00'],\n])",
          },
          {
            label: '3 col',
            snippet:
              ".table([\n  { width: 18, align: 'left' },\n  { width: 10, align: 'right' },\n  { width: 10, align: 'right' },\n], [\n  ['Item', 'Qty', 'Amt'],\n])",
          },
        ],
        docsAnchor: '#table',
      },
    ],
  },
  {
    id: 'codes-media',
    label: 'Codes & output',
    commands: [
      {
        id: 'barcode',
        label: 'Barcode',
        icon: 'Barcode',
        snippet: ".barcode('313063057461', 'ean13', { text: true })",
        preview: ".barcode('313063057461', 'ean13', { text: true })",
        variations: [
          { label: 'EAN13', snippet: ".barcode('313063057461', 'ean13', { text: true })" },
          { label: 'Code128', snippet: ".barcode('ABC-123', 'code128', { text: true })" },
          { label: 'Wide', snippet: ".barcode('313063057461', 'ean13', { width: 3, text: true })" },
        ],
        docsAnchor: '#barcode',
      },
      {
        id: 'qrcode',
        label: 'Qrcode',
        icon: 'QrCode',
        snippet: ".qrcode('https://example.com')",
        preview: ".qrcode('https://example.com')",
        variations: [
          { label: 'Basic', snippet: ".qrcode('https://example.com')" },
          { label: 'Large', snippet: ".qrcode('https://example.com', { size: 8 })" },
          { label: 'High ECC', snippet: ".qrcode('https://example.com', { errorlevel: 'h' })" },
        ],
        docsAnchor: '#qrcode',
      },
      {
        id: 'pdf417',
        label: 'PDF417',
        snippet: ".pdf417('https://example.com')",
        preview: ".pdf417('https://example.com')",
        variations: [
          { label: 'Basic', snippet: ".pdf417('https://example.com')" },
          { label: 'Dense', snippet: ".pdf417('https://example.com', { columns: 4, rows: 8 })" },
          { label: 'High ECC', snippet: ".pdf417('https://example.com', { errorlevel: 8 })" },
        ],
        docsAnchor: '#pdf417-code',
      },
      {
        id: 'image',
        label: 'Image',
        icon: 'Image',
        snippet: ".image(imageElement, 256, 128, 'threshold')",
        preview: ".image(imageElement, 256, 128, 'threshold')",
        variations: [
          { label: 'Threshold', snippet: ".image(imageElement, 256, 128, 'threshold')" },
          { label: 'Atkinson', snippet: ".image(imageElement, 256, 128, 'atkinson')" },
          { label: 'Bayer', snippet: ".image(imageElement, 256, 128, 'bayer', 140)" },
        ],
        docsAnchor: '#image',
      },
      {
        id: 'cut',
        label: 'Cut',
        icon: 'Scissors',
        snippet: ".cut('partial')",
        preview: ".cut('partial')",
        variations: [
          { label: 'Partial', snippet: ".cut('partial')" },
          { label: 'Full', snippet: ".cut('full')" },
          { label: 'Default', snippet: '.cut()' },
        ],
        docsAnchor: '#cut',
      },
      {
        id: 'pulse',
        label: 'Pulse',
        icon: 'Bell',
        snippet: '.pulse()',
        preview: '.pulse()',
        variations: [
          { label: 'Default', snippet: '.pulse()' },
          { label: 'Drawer 0', snippet: '.pulse(0, 100, 500)' },
          { label: 'Drawer 1', snippet: '.pulse(1, 100, 500)' },
        ],
        docsAnchor: '#pulse',
      },
      {
        id: 'raw',
        label: 'Raw',
        icon: 'Braces',
        snippet: '.raw([0x1c, 0x2e])',
        preview: '.raw([0x1c, 0x2e])',
        variations: [
          { label: 'Byte array', snippet: '.raw([0x1c, 0x2e])' },
          { label: 'ESC @', snippet: '.raw([0x1b, 0x40])' },
        ],
        docsAnchor: '#raw',
      },
    ],
  },
];

export function getCommandDocsUrl(docsAnchor: string): string {
  return `${COMMAND_DOCS_BASE_URL}${docsAnchor}`;
}

export function insertSnippet(view: EditorView, snippet: string): void {
  const { from, to } = view.state.selection.main;

  view.dispatch({
    changes: { from, to, insert: snippet },
    selection: { anchor: from + snippet.length },
    scrollIntoView: true,
  });

  view.focus();
}

export function insertSnippetWithAutoFold(view: EditorView, snippet: string): void {
  const { from, to } = view.state.selection.main;

  view.dispatch({
    changes: { from, to, insert: snippet },
    selection: { anchor: from + snippet.length },
    scrollIntoView: true,
  });

  if (!snippet.includes('data:image/')) {
    view.focus();
    return;
  }

  const effects: ReturnType<typeof foldEffect.of>[] = [];
  const insertedStart = from;
  const insertedEnd = from + snippet.length;
  let lineStart = view.state.doc.lineAt(insertedStart).from;

  while (lineStart <= insertedEnd) {
    const line = view.state.doc.lineAt(lineStart);

    if (line.text.includes('data:image/')) {
      const range = foldable(view.state, line.from, line.to);
      if (range !== null) {
        effects.push(foldEffect.of(range));
      }
    }

    if (line.to >= insertedEnd) {
      break;
    }
    lineStart = line.to + 1;
  }

  if (effects.length > 0) {
    view.dispatch({ effects });
  }

  view.focus();
}

export function insertSnippetAtEnd(view: EditorView, snippet: string): void {
  const end = view.state.doc.length;
  const needsLeadingNewline = end > 0 && !view.state.doc.toString().endsWith('\n');
  const text = needsLeadingNewline ? `\n${snippet}` : snippet;

  view.dispatch({
    changes: { from: end, to: end, insert: text },
    selection: { anchor: end + text.length },
    scrollIntoView: true,
  });

  view.focus();
}
