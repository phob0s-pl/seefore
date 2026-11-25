import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { readOptions, readRenameOptions, run } from '../src/server/command.ts';
import { listFiles, readFolder } from '../src/server/files.ts';

test('the options read right', () => {
  expect(readOptions([], '/here')).toEqual({ server: false, check: false, json: false, workdir: '/here', port: 4400 });
  expect(readOptions(['--server', '--workdir=models/shop', '--port=4411'], '/here')).toEqual({
    server: true,
    check: false,
    json: false,
    workdir: 'models/shop',
    port: 4411,
  });
});

test('the options read wrong', () => {
  expect(readOptions(['--x'], '/here')).toEqual({ error: 'unknown option "--x"' });
  expect(readOptions(['shop'], '/here')).toEqual({ error: 'unknown option "shop"' });
  expect(readOptions(['--port=abc'], '/here')).toEqual({ error: 'the port must be a number from 1 to 65535, not "abc"' });
  expect(readOptions(['--port=70000'], '/here')).toHaveProperty('error');
  expect(readOptions(['--workdir='], '/here')).toHaveProperty('error');
});

test('a folder that is not there, or no --server, ends with 1 and one line', async () => {
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };

  expect(await run(['--server', '--workdir=nowhere'], '/here', io)).toBe(1);
  expect(lines).toEqual(['seefore: cannot read the folder "nowhere"']);

  lines.length = 0;
  expect(await run(['--workdir=nowhere'], '/here', io)).toBe(1);
  expect(lines).toEqual([
    'seefore: run it as "seefore --server [--workdir=<dir>] [--port=<n>]", "seefore check [--workdir=<dir>] [--json]" or "seefore rename <old> <new> [--workdir=<dir>] [--dry-run]"',
  ]);
});

test('a folder with no seefore.yaml is not a model', async () => {
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  expect(await run(['--server', `--workdir=${folder}`], '/here', io)).toBe(1);
  expect(lines).toEqual([`seefore: "${folder}" is not a model: it has no seefore.yaml`]);
});

/** A small model in a folder of its own: an app, the component in it, a connection that names it in its id, and a line of prose. */
async function shopFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-rename-'));
  const files: Record<string, string> = {
    'seefore.yaml': 'format: 1\nname: Shop\n',
    'systems/system-shop.yaml': 'name: Shop\n',
    'apps/app-api.yaml': 'name: API\nin: system-shop\n',
    'stores/store-orders.yaml': 'name: Orders\nin: system-shop\n',
    'components/component-checkout.yaml': 'name: Checkout\nin: app-api\ndescription: Runs inside `app-api`.\n',
    'connections/connection-api-writes-orders.yaml': 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\n',
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
  return folder;
}

/** The lines the command prints, to either stream, and how it ends. */
async function runLines(args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, '/here', { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

const RENAMED = [
  'app-api -> app-backend',
  'connection-api-writes-orders -> connection-backend-writes-orders, with its end app-api',
  'apps/app-api.yaml -> apps/app-backend.yaml',
  'components/component-checkout.yaml: 1 place',
  'connections/connection-api-writes-orders.yaml -> connections/connection-backend-writes-orders.yaml: 1 place',
  'components/component-checkout.yaml:3: in prose, left as it is: description: Runs inside `app-api`.',
  '2 records renamed, 2 places rewritten in 3 files.',
];

test('rename rewrites the folder, moves the files and prints a file a line', async () => {
  const folder = await shopFolder();
  const ran = await runLines(['rename', 'app-api', 'app-backend', `--workdir=${folder}`]);
  expect(ran).toEqual({ code: 0, out: RENAMED, err: [] });
  expect(await listFiles(folder)).toEqual([
    'apps/app-backend.yaml',
    'components/component-checkout.yaml',
    'connections/connection-backend-writes-orders.yaml',
    'seefore.yaml',
    'stores/store-orders.yaml',
    'systems/system-shop.yaml',
  ]);
  expect(await readFile(join(folder, 'components/component-checkout.yaml'), 'utf8')).toBe('name: Checkout\nin: app-backend\ndescription: Runs inside `app-api`.\n');
  expect((await readFolder(folder)).problems).toEqual([]);
});

test('a dry run prints the same and writes nothing', async () => {
  const folder = await shopFolder();
  const before = await listFiles(folder);
  const ran = await runLines([`--workdir=${folder}`, 'rename', '--dry-run', 'app-api', 'app-backend']);
  expect(ran).toEqual({ code: 0, out: [...RENAMED, 'A dry run: nothing is written.'], err: [] });
  expect(await listFiles(folder)).toEqual(before);
  expect(await readFile(join(folder, 'components/component-checkout.yaml'), 'utf8')).toContain('in: app-api\n');
});

test('rename takes a list from a file', async () => {
  const folder = await shopFolder();
  const list = join(folder, '..', `${folder.split('/').pop()}-list.txt`);
  await writeFile(list, 'app-api app-backend\nstore-orders store-orderbook\n');
  const ran = await runLines(['rename', `--list=${list}`, `--workdir=${folder}`]);
  expect(ran.code).toBe(0);
  expect(ran.out[0]).toBe('app-api -> app-backend');
  expect(ran.out[1]).toBe('store-orders -> store-orderbook');
  expect(ran.out).toContain('connection-api-writes-orders -> connection-backend-writes-orderbook, with its end app-api and store-orders');
  expect(await listFiles(folder)).toContain('connections/connection-backend-writes-orderbook.yaml');
  expect((await readFolder(folder)).problems).toEqual([]);
});

test('a refusal prints its lines, gives 1 and writes nothing', async () => {
  const folder = await shopFolder();
  const before = await listFiles(folder);
  expect(await runLines(['rename', 'app-api', 'store-orders', `--workdir=${folder}`])).toEqual({
    code: 1,
    out: [],
    err: ['seefore: `store-orders` is taken: `stores/store-orders.yaml` has it. Give `app-api` another id, or rename that one too in a list.', 'seefore: nothing is renamed'],
  });
  expect(await listFiles(folder)).toEqual(before);
  expect(await runLines(['rename', 'app-api', `--workdir=${join(folder, 'nowhere')}`])).toEqual({
    code: 1,
    out: [],
    err: ['seefore: run it as "seefore rename <old> <new> [--workdir=<dir>] [--dry-run]" or "seefore rename --list=<file> [--workdir=<dir>] [--dry-run]"'],
  });
  expect((await runLines(['rename', 'app-api', 'app-backend', `--workdir=${join(folder, 'nowhere')}`])).err).toEqual([`seefore: cannot read the folder "${join(folder, 'nowhere')}"`]);
  expect((await runLines(['rename', '--list=nowhere.txt', `--workdir=${folder}`])).err).toEqual(['seefore: cannot read the list "nowhere.txt"']);
});

test('the options of rename read right and wrong', () => {
  expect(readRenameOptions(['rename', 'app-api', 'app-backend'], '/here')).toEqual({ workdir: '/here', dryRun: false, ids: ['app-api', 'app-backend'] });
  expect(readRenameOptions(['--dry-run', 'rename', '--list=names.txt', '--workdir=shop'], '/here')).toEqual({ workdir: 'shop', dryRun: true, ids: [], list: 'names.txt' });
  expect(readRenameOptions(['rename', 'a', 'b', '--list=names.txt'], '/here')).toEqual({ error: 'give "<old> <new>" or "--list=<file>", not both' });
  expect(readRenameOptions(['rename', 'a', 'b', '--json'], '/here')).toEqual({ error: '"--json" does not go with "rename"' });
  expect(readRenameOptions(['rename', '--list='], '/here')).toHaveProperty('error');
});
