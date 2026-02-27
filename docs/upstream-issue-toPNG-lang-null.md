# Upstream Issue Draft — receiptline/receiptjs

> Copy this into a new GitHub issue at https://github.com/receiptline/receiptjs/issues/new

---

**Title:** `toPNG()` crashes with `Cannot read properties of null (reading 'toLowerCase')` for non-CJK content

---

`toPNG()` throws a `TypeError` for any receipt that doesn't contain CJK or Thai text — i.e. the common Latin/English case. This is reproducible on the [official designer demo](https://receiptline.github.io/receiptjs-designer/) — open the browser console and click the PNG download button with the default content.

## Reproduce

```js
await Receipt.from('Hello World', '-c 48 -l en -p escpos').toPNG();
// TypeError: Cannot read properties of null (reading 'toLowerCase')
```

`toSVG()` is unaffected.

## Root Cause

Inside `Base64PNG.from()`, the PNG renderer reads a `lang` attribute from the generated SVG's `<g>` element:

```js
const lang = group.getAttribute('lang').toLowerCase() || 'en';
```

The SVG renderer only writes that attribute for CJK/Thai scripts. For Latin content the attribute is never set, so `getAttribute('lang')` returns `null` and `.toLowerCase()` throws. The `-l` language option does not affect this — it controls ESC/POS encoding only, not the SVG attribute.

## Fix

```diff
- const lang = group.getAttribute('lang').toLowerCase() || 'en';
+ const lang = (group.getAttribute('lang') ?? 'en').toLowerCase() || 'en';
```
