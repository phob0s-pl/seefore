// Builds the page into the command's package, packages/cli/dist/viewer, so that the installed
// command serves it with nothing else to fetch.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'cli', 'dist', 'viewer');
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
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>seefore</title>\n</head>\n<body>\n<div id="root"></div>\n<script type="module" src="/app.js"></script>\n</body>\n</html>\n',
);
console.log(`built ${out}`);
