// Builds the seefore command into one file, dist/seefore.cjs, with the core library inside it,
// and beside it dist/layout-worker.cjs, the worker a layout runs in. Both are CommonJS because
// the YAML library's Node build asks for Node's own modules with require. ELK is in neither: it
// is a dependency of the package, installed beside it under its own licence.
//
// The page is built into dist/viewer by packages/viewer/build.mjs before this runs. Last, this
// writes dist/THIRD-PARTY-NOTICES.txt from the licences of every library whose code is in dist/.
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const { version, dependencies } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

/** Libraries installed beside the command as its dependencies, and never copied into its files. */
const INSTALLED = ['elkjs'];

/** What the command and the worker are built with. */
const forNode = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: INSTALLED,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
  absWorkingDir: here,
};

const outfile = join(dist, 'seefore.cjs');
const command = await build({
  ...forNode,
  entryPoints: [join(here, 'src', 'bin.ts')],
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  define: { SEEFORE_VERSION: JSON.stringify(version) },
});
chmodSync(outfile, 0o755);

// The worker comes with the layout package. Until that package has one, there is none to build.
const workerSource = join(here, '..', 'layout', 'src', 'worker.ts');
const workerFile = join(dist, 'layout-worker.cjs');
let worker;
if (existsSync(workerSource)) worker = await build({ ...forNode, entryPoints: [workerSource], outfile: workerFile });
else rmSync(workerFile, { force: true });

// The page's entry is bundled once more, in memory and written nowhere, only to learn which
// libraries are in the page. A file that is not code, such as a font, is taken as empty.
const page = await build({
  entryPoints: [join(here, '..', 'viewer', 'src', 'main.tsx')],
  bundle: true,
  write: false,
  metafile: true,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: join(dist, 'viewer'),
  absWorkingDir: here,
  logLevel: 'silent',
  plugins: [codeOnly()],
});

const libraries = new Map();
librariesIn(command, 'the command', libraries);
if (worker) librariesIn(worker, "the layout's worker", libraries);
librariesIn(page, 'the page', libraries);
writeFileSync(join(dist, 'THIRD-PARTY-NOTICES.txt'), notices(libraries));

console.log(`built ${outfile} (seefore ${version})${worker ? `, ${workerFile}` : ''}, and the notices for ${libraries.size} libraries`);

/** An esbuild plugin that loads every file but code and styles as empty. */
function codeOnly() {
  return {
    name: 'code-only',
    setup(build) {
      build.onLoad({ filter: /.*/ }, ({ path }) => (/\.([cm]?[jt]sx?|json|css)$/.test(path) ? undefined : { contents: '', loader: 'empty' }));
    },
  };
}

/** Adds the libraries whose code is in a build's output, by the folder each is installed in, with the part of the package it is in. */
function librariesIn(result, part, found) {
  for (const output of Object.values(result.metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      if (bytesInOutput === 0) continue;
      const folder = packageFolder(resolve(here, input));
      if (folder === undefined) continue;
      if (!found.has(folder)) found.set(folder, new Set());
      found.get(folder).add(part);
    }
  }
}

/** The folder of the installed package a file belongs to. Missing for the project's own files. */
function packageFolder(file) {
  const mark = `${sep}node_modules${sep}`;
  const at = file.lastIndexOf(mark);
  if (at < 0) return undefined;
  const [first, second] = file.slice(at + mark.length).split(sep);
  return file.slice(0, at + mark.length) + (first.startsWith('@') ? `${first}${sep}${second}` : first);
}

/** The text of the notices: ELK, which is installed beside, then each library inside, with its licence. */
function notices(found) {
  const elkManifest = createRequire(import.meta.url).resolve('elkjs/package.json');
  const elk = JSON.parse(readFileSync(elkManifest, 'utf8'));
  if (elk.version !== dependencies.elkjs) {
    throw new Error(`elkjs ${elk.version} is installed, but the package pins ${dependencies.elkjs}. Run npm install.`);
  }
  const inside = [...found.entries()]
    .map(([folder, parts]) => ({ folder, parts: [...parts], ...JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const rule = '='.repeat(80);
  const files = worker
    ? "seefore.cjs, the command; layout-worker.cjs, the worker a layout runs in; and viewer/, the page"
    : 'seefore.cjs, the command, and viewer/, the page';
  const lines = [
    `seefore ${version}: the libraries it is built with, and their licences`,
    '',
    `The code of the libraries listed below is inside the files of this folder: ${files}.`,
    'Each is given with its licence, as its package gives it.',
    '',
    'ELK is not inside them. It is installed beside seefore, as its dependency elkjs:',
    '',
    `  elkjs ${elk.version}, the Eclipse Layout Kernel for JavaScript`,
    '  Licence: EPL-2.0 (Eclipse Public License 2.0). The package is offered under EPL-2.0 or',
    '  GPL-3.0-or-later; seefore uses it under EPL-2.0.',
    `  Its source: ${sourceOf(elk)}, built from the Eclipse Layout Kernel,`,
    '  whose source is at https://github.com/eclipse/elk.',
    '',
    ...licenceTexts(dirname(elkManifest)),
  ];
  for (const library of inside) {
    lines.push(
      '',
      rule,
      `${library.name} ${library.version}`,
      `Licence: ${licenceOf(library)}`,
      `In: ${library.parts.join(', ')}`,
      `Source: ${sourceOf(library)}`,
      '',
      ...licenceTexts(library.folder),
    );
  }
  return lines.join('\n') + '\n';
}

/** The licence a package names in its package.json. */
function licenceOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((licence) => licence.type).join(' OR ');
  return 'not given in its package';
}

/** Where a package's source is, as an address a browser opens. */
function sourceOf(pkg) {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (repository) {
    const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(repository);
    if (shorthand) return `https://github.com/${shorthand[1]}`;
    return repository.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
  }
  return pkg.homepage ?? `https://www.npmjs.com/package/${pkg.name}`;
}

/** The texts of the licence and notice files a package carries, each as it is written. */
function licenceTexts(folder) {
  const files = readdirSync(folder)
    .filter((name) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name))
    .sort();
  if (files.length === 0) {
    console.warn(`warning: ${folder} has no licence file; the notices give only the licence its package names.`);
    return ['This package carries no licence file of its own.'];
  }
  return files.flatMap((name) => [readFileSync(join(folder, name), 'utf8').trimEnd(), '']).slice(0, -1);
}
