// Builds the seefore command into one file, dist/seefore.cjs, with the core library inside it.
// It is CommonJS because the YAML library's Node build asks for Node's own modules with require.
import { chmodSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const outfile = join(here, 'dist', 'seefore.cjs');

await build({
  entryPoints: [join(here, 'src', 'bin.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
  define: { SEEFORE_VERSION: JSON.stringify(version) },
  legalComments: 'none',
  logLevel: 'warning',
});

chmodSync(outfile, 0o755);
console.log(`built ${outfile} (seefore ${version})`);
