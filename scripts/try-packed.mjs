// Tries the command as a person who installs it gets it. It builds and packs the package,
// installs it under a prefix of its own in a temporary folder, and from another folder runs the
// installed command: --version, check on a small source directory it makes, and --server
// --no-open on a free port, asking for the page, the state and the picture of two settings
// before stopping it.
//
// It needs the network, since installing fetches elkjs, so `npm run check` does not run it.
//
//   node scripts/try-packed.mjs          removes the temporary folder when done
//   node scripts/try-packed.mjs --keep   leaves it, to look at
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
/** How long the installed server may take to print its address. */
const START_MS = 15_000;

/** A small source directory: a person, a system with an app, and a connection. */
const MODEL = {
  'seefore.yaml': 'format: 1\nname: Packed trial\n',
  'people/reader.yaml': 'name: Reader\ndescription: Reads what the shop sells.\n',
  'systems/shop.yaml': 'name: Shop\ndescription: Sells goods.\n',
  'apps/storefront.yaml': 'name: Storefront\nin: shop\nkind: browser\ndescription: Where a reader looks at the goods.\n',
  'connections/reader-browses.yaml': 'from: reader\nto: storefront\nname: Browses the goods\n',
};

const keep = process.argv.includes('--keep');
const folder = mkdtempSync(join(tmpdir(), 'seefore-packed-'));
let failed = false;
try {
  await tryPacked(folder);
} catch (cause) {
  failed = true;
  console.error(`\nfailed: ${cause instanceof Error ? cause.message : String(cause)}`);
} finally {
  if (keep) console.log(`\nleft in ${folder}`);
  else rmSync(folder, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;

async function tryPacked(folder) {
  step('build');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: windows });

  step('pack');
  const packs = join(folder, 'pack');
  mkdirSync(packs);
  const packed = execFileSync('npm', ['pack', '--workspace', 'seefore', '--pack-destination', packs, '--json'], { cwd: root, encoding: 'utf8', shell: windows });
  const [{ filename, files }] = JSON.parse(packed);
  console.log(`  ${filename}: ${files.map((file) => file.path).join(', ')}`);

  step('install under a prefix of its own');
  const prefix = join(folder, 'prefix');
  const work = join(folder, 'work');
  mkdirSync(work);
  execFileSync('npm', ['install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', join(packs, filename)], { cwd: work, stdio: 'inherit', shell: windows });
  const installed = windows ? join(prefix, 'node_modules', 'seefore') : join(prefix, 'lib', 'node_modules', 'seefore');
  const command = windows ? join(prefix, 'seefore.cmd') : join(prefix, 'bin', 'seefore');
  expect(existsSync(command), `the installed command is at ${command}`);
  for (const file of ['seefore.cjs', 'THIRD-PARTY-NOTICES.txt', 'viewer/index.html']) {
    expect(existsSync(join(installed, 'dist', file)), `dist/${file} is beside the installed command`);
  }
  const worker = join(installed, 'dist', 'layout-worker.cjs');
  if (existsSync(join(root, 'packages', 'layout', 'src', 'worker.ts'))) expect(existsSync(worker), 'dist/layout-worker.cjs is beside the installed command');
  else console.log('  no dist/layout-worker.cjs: the layout package has no worker yet');
  const elk = JSON.parse(readFileSync(createRequire(join(installed, 'dist', 'seefore.cjs')).resolve('elkjs/package.json'), 'utf8'));
  expect(elk.version === '0.12.1', `elkjs ${elk.version} is installed as a dependency, and 0.12.1 is pinned`);
  expect(!readFileSync(join(installed, 'dist', 'seefore.cjs'), 'utf8').includes('org.eclipse.elk.alg.layered'), 'ELK is not copied into seefore.cjs');

  step('seefore --version, from another folder');
  for (const [path, text] of Object.entries(MODEL)) {
    mkdirSync(dirname(join(work, 'arch', path)), { recursive: true });
    writeFileSync(join(work, 'arch', path), text);
  }
  const version = run(command, ['--version'], work);
  expect(version.status === 0, 'it exits with 0');

  step('seefore check --workdir=arch');
  const checked = run(command, ['check', '--workdir=arch'], work);
  expect(checked.status === 0, 'it exits with 0');

  const port = await freePort();
  step(`seefore --server --no-open --workdir=arch --port=${port}`);
  const server = spawn(command, ['--server', '--no-open', '--workdir=arch', `--port=${port}`], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], shell: windows });
  let out = '';
  let err = '';
  server.stdout.on('data', (chunk) => (out += chunk));
  server.stderr.on('data', (chunk) => (err += chunk));
  const exited = new Promise((done) => server.on('exit', (code, signal) => done({ code, signal })));
  try {
    const address = await printed(() => /http:\/\/127\.0\.0\.1:\d+\//.exec(out)?.[0], () => err, START_MS);
    await waitUntil(() => out.includes('Ctrl+C'), 2000);
    indent(out);

    const page = await fetch(address);
    const html = await page.text();
    expect(page.status === 200 && html.includes('<div id="root">'), `GET / answers ${page.status} with the page (${page.headers.get('content-type')})`);

    const stateAnswer = await fetch(new URL('api/state', address));
    const state = await stateAnswer.json();
    expect(
      stateAnswer.status === 200 && state.name === 'Packed trial' && !('views' in state),
      `GET /api/state answers ${stateAnswer.status}: ${state.name}, ${state.records} records, ${state.errors} errors, ${state.scopes.length} boxes that can be the scope, revision ${state.revision}`,
    );

    // A setting is asked for as the page's address names it: everything at System depth, and the shop at Container depth.
    for (const setting of ['system', 'container~shop']) {
      const pictureAnswer = await fetch(new URL(`api/pictures/${state.revision}/${setting}`, address));
      const { view, picture } = await pictureAnswer.json();
      const what = 'failed' in picture ? `failed (${picture.failed.reason}): ${picture.failed.message}` : `${view.title}, ${picture.width} x ${picture.height}, ${picture.boxes.length} boxes, ${picture.boundaries.length} boundaries, ${picture.arrows.length} arrows`;
      expect(pictureAnswer.status === 200 && view.id === setting && !('failed' in picture), `GET /api/pictures/${state.revision}/${setting} answers ${pictureAnswer.status}: ${what}`);
    }
    const unknown = await fetch(new URL(`api/pictures/${state.revision}/shop.containers`, address));
    expect(unknown.status === 404, `GET /api/pictures/${state.revision}/shop.containers, an address of stage 5, answers ${unknown.status}`);
  } finally {
    server.kill('SIGTERM');
  }
  const { code, signal } = await exited;
  expect(code === 0 || (windows && signal === 'SIGTERM'), `stopped, with exit code ${code}${signal ? ` (${signal})` : ''}`);
  if (err) indent(err);

  console.log('\nThe packed command works.');
}

/** Runs the installed command and prints what it printed. */
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: windows });
  indent(result.stdout + result.stderr);
  return result;
}

function step(what) {
  console.log(`\n== ${what}`);
}

function indent(text) {
  for (const line of text.trimEnd().split('\n')) console.log(`  | ${line}`);
}

function expect(holds, what) {
  if (!holds) throw new Error(`not so: ${what}`);
  console.log(`  ok: ${what}`);
}

/** Waits for the server to print something, and gives it back. */
async function printed(found, err, ms) {
  const until = Date.now() + ms;
  for (;;) {
    const value = found();
    if (value) return value;
    if (Date.now() > until) throw new Error(`the server printed no address in ${ms / 1000} s.${err() ? ` It said: ${err().trim()}` : ''}`);
    await new Promise((done) => setTimeout(done, 50));
  }
}

async function waitUntil(holds, ms) {
  const until = Date.now() + ms;
  while (!holds() && Date.now() < until) await new Promise((done) => setTimeout(done, 20));
}

/** A port of 127.0.0.1 that no one listens on now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
