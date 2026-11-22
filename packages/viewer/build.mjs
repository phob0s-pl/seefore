// Builds the page into the command's package, packages/cli/dist/viewer, so that the installed
// command serves it with nothing else to fetch: index.html, one script, app.js, and one style
// sheet, app.css, which holds React Flow's own styles and the page's.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'cli', 'dist', 'viewer');
// What an earlier build left is cleared, so that the server's list of files is this build's.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.tsx')],
  outfile: join(out, 'app.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'external',
  logLevel: 'warning',
});

writeFileSync(
  join(out, 'index.html'),
  [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<title>seefore</title>',
    '<link rel="stylesheet" href="/app.css">',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<script type="module" src="/app.js"></script>',
    '</body>',
    '</html>',
    '',
  ].join('\n'),
);
console.log(`built ${out}`);
