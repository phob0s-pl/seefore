// Makes src/widths.ts: the advance widths of Arial, regular and bold, for the characters 32 to
// 255, as Chrome measures them on a canvas at 1000 px. The layout measures every text with them.
//
// Run it from the root of the repository, on a Mac with Google Chrome and Arial:
//
//   node packages/layout/scripts/widths.mjs
//
// Another Chrome can be given as CHROME=<path to its program>. The script writes a page and a
// profile for Chrome into a folder of its own under the system's temporary folder, runs Chrome
// headless once with --dump-dom, reads the widths out of the page and writes src/widths.ts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'widths.ts');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The first and the last character of the table. */
const FIRST = 32;
const LAST = 255;

/** Widths Arial is known to have at 1000 px, to tell that Chrome measured Arial and not another font. */
const KNOWN = { regular: { i: 222.17, W: 943.85 }, bold: { i: 277.83, W: 943.85 } };

const page = `<!doctype html>
<html><head><meta charset="utf-8"></head><body><pre id="widths"></pre>
<script>
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
context.fontKerning = 'none';
const widths = {};
for (const [weight, font] of [['regular', '1000px Arial'], ['bold', 'bold 1000px Arial']]) {
  context.font = font;
  widths[weight] = [];
  for (let code = ${FIRST}; code <= ${LAST}; code += 1) widths[weight].push(context.measureText(String.fromCharCode(code)).width);
  widths[weight + 'Ellipsis'] = context.measureText('\\u2026').width;
}
document.getElementById('widths').textContent = JSON.stringify(widths);
</script></body></html>
`;

const folder = mkdtempSync(join(tmpdir(), 'seefore-widths-'));
try {
  const file = join(folder, 'widths.html');
  writeFileSync(file, page);
  const dom = execFileSync(
    chrome,
    ['--headless=new', `--user-data-dir=${join(folder, 'profile')}`, '--no-first-run', '--disable-gpu', '--dump-dom', pathToFileURL(file).href],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const json = /<pre id="widths">([^<]*)<\/pre>/.exec(dom)?.[1];
  if (json === undefined) throw new Error('Chrome gave back a page without the widths.');
  const widths = JSON.parse(json.replaceAll('&quot;', '"'));
  for (const weight of ['regular', 'bold']) {
    for (const [character, width] of Object.entries(KNOWN[weight])) {
      const measured = widths[weight][character.charCodeAt(0) - FIRST];
      if (Math.abs(measured - width) > 0.01) throw new Error(`Chrome measured ${character} in ${weight} Arial as ${measured}, not ${width}: it did not use Arial.`);
    }
  }
  writeFileSync(out, source(widths));
  console.log(`wrote ${out}`);
} finally {
  rmSync(folder, { recursive: true, force: true });
}

/** The text of src/widths.ts. */
function source(widths) {
  return `// Made by scripts/widths.mjs, which says how to run it. Do not change it by hand.

/** The code of the first character in each table. */
export const TABLE_FIRST = ${FIRST};

/** The code of the last character in each table. */
export const TABLE_LAST = ${LAST};

/** The advance width of each character from 32 to 255 in Arial, regular, at 1000 px. */
export const ARIAL_REGULAR: readonly number[] = ${table(widths.regular)};

/** The advance width of each character from 32 to 255 in Arial, bold, at 1000 px. */
export const ARIAL_BOLD: readonly number[] = ${table(widths.bold)};

/** The width of the ellipsis, which ends a cut line, in Arial at 1000 px: regular, then bold. */
export const ARIAL_ELLIPSIS = { regular: ${round(widths.regularEllipsis)}, bold: ${round(widths.boldEllipsis)} } as const;
`;
}

/** A list of widths, sixteen to a line. */
function table(widths) {
  const rows = [];
  for (let at = 0; at < widths.length; at += 16) rows.push(`  ${widths.slice(at, at + 16).map(round).join(', ')},`);
  return `[\n${rows.join('\n')}\n]`;
}

/** A width to a hundredth of a pixel at 1000 px, which is a thousandth at 10 px. */
function round(width) {
  return String(Math.round(width * 100) / 100);
}
