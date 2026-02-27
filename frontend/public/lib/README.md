# Receipt.js vendor files

Place the following three files from https://github.com/receiptline/receiptjs here:

- `receipt.js` — core ReceiptLine → SVG/PNG renderer (browser UMD bundle)
- `receipt-printer.js` — ReceiptLine → ESC/POS byte generator (browser UMD bundle)
- `receipt-serial.js` — Web Serial API wrapper for direct USB/serial printing

## How to get them

Download the raw files directly from the `lib/` folder of the repo:

```sh
curl -fsSL https://raw.githubusercontent.com/receiptline/receiptjs/main/lib/receipt.js -o receipt.js
curl -fsSL https://raw.githubusercontent.com/receiptline/receiptjs/main/lib/receipt-printer.js -o receipt-printer.js
curl -fsSL https://raw.githubusercontent.com/receiptline/receiptjs/main/lib/receipt-serial.js -o receipt-serial.js
```

Run those commands from this directory (`frontend/public/lib/`).

## Local patches

> **WARNING: `receipt.js` has been patched.** Do not replace it with a fresh download
> without re-applying the patch below, or PNG export will crash.

### Patch 1 — `toPNG()` null crash on non-CJK content (`receipt.js` line 2218)

**Symptom:** `Cannot read properties of null (reading 'toLowerCase')` when calling `toPNG()`
on any receipt that does not contain CJK or Thai text (i.e. the common Latin/English case).

**Root cause:** The `Base64PNG.from()` function reads a `lang` attribute from the SVG `<g>`
element to decide which font rendering path to use. Receipt.js only writes that attribute when
the content contains CJK/Thai characters — for all other content the attribute is absent and
`getAttribute('lang')` returns `null`. Calling `.toLowerCase()` on `null` throws.

The `-l` / language option the user provides has no bearing on this — it controls ESC/POS
encoding, not the SVG `lang` attribute. There is no way to prevent `null` from our wrapper.

**Patch** (one line, `receipt.js` ~line 2218):

```diff
- const lang = group.getAttribute('lang').toLowerCase() || 'en';
+ const lang = (group.getAttribute('lang') ?? 'en').toLowerCase() || 'en';
```

**Upstream issue:** see `docs/upstream-issue-toPNG-lang-null.md`

---

## Why vendor instead of npm?

Receipt.js is not published as an npm package. It is distributed as pre-built browser UMD
bundles that expose global variables (`window.Receipt`, `window.ReceiptPrinter`,
`window.ReceiptSerial`). The frontend wraps these globals in `src/lib/receiptjs.ts` so
TypeScript has typed access and components never call them directly. See docs/design.md §9.4.
