import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import { peekTop } from '../src/model/yaml.ts';
import { findModel, readOptions, readRenameOptions, run } from '../src/server/command.ts';
import { listFiles, readFolder } from '../src/server/files.ts';
import { markerText } from '../src/server/init.ts';

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
  expect(lines).toEqual(['seefore: run it as "seefore <verb> [<options>]", the verb one of init, check, list, guide, rename and --server; see seefore --help']);
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

/** The lines the command prints, and how it ends, run from a folder of the test's own. */
async function runIn(cwd: string, args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, cwd, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

const CLAUDE_LINES = [
  '## Architecture',
  "This system's architecture is a seefore model in `architecture/`: one YAML file a record.",
  'Before you add, remove or join parts, run `seefore list` and read its context.',
  'When code moves, offer `/seefore:model`. For a design, offer `/seefore:change`.',
  'After the model changes, `seefore check` must show no error.',
];

test('init writes the marker and the lines in CLAUDE.md, once', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-init-'));
  expect(await runIn(folder, ['init', '--name=Shop'])).toEqual({
    code: 0,
    out: ['Wrote architecture/seefore.yaml, the marker of the model "Shop".', 'Wrote CLAUDE.md, with five lines under "## Architecture".', 'Next, in Claude Code: /seefore:model'],
    err: [],
  });
  expect(await readFile(join(folder, 'architecture/seefore.yaml'), 'utf8')).toBe('format: 1\nname: Shop\n');
  expect(await readFile(join(folder, 'CLAUDE.md'), 'utf8')).toBe(`${CLAUDE_LINES.join('\n')}\n`);
  expect((await readFolder(join(folder, 'architecture'))).problems).toEqual([]);

  // A second model where one is already: refused, and nothing is written.
  expect(await runIn(folder, ['init', '--name=Other'])).toEqual({ code: 1, out: [], err: ['seefore: "architecture" is a model already: it has seefore.yaml. Nothing is written.'] });
  expect(await readFile(join(folder, 'architecture/seefore.yaml'), 'utf8')).toBe('format: 1\nname: Shop\n');
  expect(await runIn(join(folder, 'architecture'), ['init', 'inner', '--name=Other'])).toEqual({ code: 1, out: [], err: ['seefore: this folder is a model already: it has seefore.yaml. Nothing is written.'] });
  expect((await readdir(folder, { recursive: true })).sort()).toEqual(['CLAUDE.md', 'architecture', 'architecture/seefore.yaml']);
});

test('init adds to a CLAUDE.md that is there, after a blank line, and not twice', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-init-'));
  await writeFile(join(folder, 'CLAUDE.md'), '# Shop\nRun the tests with npm test.');
  expect((await runIn(folder, ['init', 'models/shop', '--name=Corner shop'])).out).toEqual([
    'Wrote models/shop/seefore.yaml, the marker of the model "Corner shop".',
    'Added five lines under "## Architecture" at the end of CLAUDE.md.',
    'Next, in Claude Code: /seefore:model',
  ]);
  const lines = [CLAUDE_LINES[0], CLAUDE_LINES[1]?.replace('architecture/', 'models/shop/'), ...CLAUDE_LINES.slice(2)];
  const written = `# Shop\nRun the tests with npm test.\n\n${lines.join('\n')}\n`;
  expect(await readFile(join(folder, 'CLAUDE.md'), 'utf8')).toBe(written);
  expect(await readFile(join(folder, 'models/shop/seefore.yaml'), 'utf8')).toBe('format: 1\nname: Corner shop\n');

  // The marker is gone, the lines are not: init writes the marker again and leaves CLAUDE.md as it is.
  await rm(join(folder, 'models'), { recursive: true });
  expect(await runIn(folder, ['init', 'models/shop', '--name=Corner shop'])).toEqual({
    code: 0,
    out: ['Wrote models/shop/seefore.yaml, the marker of the model "Corner shop".', 'CLAUDE.md has the lines under "## Architecture" already: nothing is added to it.', 'Next, in Claude Code: /seefore:model'],
    err: [],
  });
  expect(await readFile(join(folder, 'CLAUDE.md'), 'utf8')).toBe(written);
});

test('init with no name, or a name the marker refuses, says so in one line and writes nothing', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-init-'));
  expect(await runIn(folder, ['init'])).toEqual({ code: 1, out: [], err: ['seefore: give the model a name, as in seefore init --name=Shop, or --name="Corner shop" for one with a space'] });
  expect(await runIn(folder, ['init', '--name='])).toHaveProperty('code', 1);
  expect((await runIn(folder, ['init', '--name= Shop'])).err).toEqual(['seefore: `name` starts or ends with a space. Take the space off. Nothing is written.']);
  expect((await runIn(folder, ['init', `--name=${'x'.repeat(101)}`])).err).toEqual(['seefore: The name is longer than 100 characters. Nothing is written.']);
  expect((await runIn(folder, ['init', 'a', 'b', '--name=Shop'])).err).toEqual(['seefore: give one folder, as in seefore init architecture --name=Shop']);
  expect((await runIn(folder, ['init', '--name=Shop', '--json'])).err).toEqual(['seefore: "--json" does not go with "init"']);
  expect(await readdir(folder)).toEqual([]);
});

test('a name YAML would misread is written in quotes, and reads back as it was given', async () => {
  for (const name of ['Shop', 'Corner shop', "Ann's shop", 'true', '1.0', 'null', 'Shop: the back office', 'Shop # two', '#1 shop', '- shop', '"Shop"', "'Shop'", '@shop', '`shop`', '[shop]', '{shop}', 'shop!', '!shop', '&shop', '*shop', '% shop', 'Shop\\n', 'Café']) {
    const text = markerText(name);
    expect(peekTop(text, 'name'), text).toBe(name);
    expect(readModel([{ path: 'seefore.yaml', text }]).problems, text).toEqual([]);
  }
  expect(markerText('Corner shop')).toBe('format: 1\nname: Corner shop\n');
  expect(markerText('true')).toBe('format: 1\nname: "true"\n');
});

test('every verb finds the model: the folder given, else this folder, else architecture/ in it', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-find-'));
  expect(findModel(folder)).toBe(folder);
  expect((await runIn(folder, ['init', '--name=Shop'])).code).toBe(0);
  const architecture = join(folder, 'architecture');
  expect(findModel(folder)).toBe(architecture);
  expect(findModel(folder, 'elsewhere')).toBe('elsewhere');
  expect(findModel(architecture)).toBe(architecture);
  expect(readOptions(['check'], folder)).toHaveProperty('workdir', architecture);
  expect(readRenameOptions(['rename', 'a', 'b'], folder)).toHaveProperty('workdir', architecture);

  const checked = await runIn(folder, ['check']);
  expect(checked.code).toBe(0);
  expect(checked.out[0]).toBe('0 records read. No problem: the keys are in form, every id that is named is there, and so is every path of `source`.');
  await mkdir(join(architecture, 'apps'));
  await writeFile(join(architecture, 'apps/app-api.yaml'), 'name: API\nin: system-shop\n');
  await mkdir(join(architecture, 'systems'));
  await writeFile(join(architecture, 'systems/system-shop.yaml'), 'name: Shop\n');
  expect((await runIn(folder, ['rename', 'app-api', 'app-backend'])).code).toBe(0);
  expect(await listFiles(architecture)).toContain('apps/app-backend.yaml');
});

test('--help says the verbs, a line each, and the options of one', async () => {
  const all = await runIn('/here', ['--help']);
  expect(all.code).toBe(0);
  expect(all.err).toEqual([]);
  const verbs = all.out.filter((line) => line.startsWith('  ')).map((line) => line.trim().split(' ')[0]);
  expect(verbs).toEqual(['init', 'check', 'list', 'guide', 'rename', '--server']);

  const check = await runIn('/here', ['check', '--help']);
  expect(check.code).toBe(0);
  expect(check.out[0]).toBe('seefore check [--workdir=<dir>] [--json]');
  expect(check.out.filter((line) => line.startsWith('  ')).map((line) => line.trim().split(' ')[0])).toEqual(['--workdir=<dir>', '--json']);
  expect((await runIn('/here', ['--server', '--help'])).out[0]).toBe('seefore --server [--workdir=<dir>] [--port=<n>]');
  expect((await runIn('/here', ['init', '--help'])).out[0]).toBe('seefore init [<dir>] --name=<name>');
  for (const verb of ['list', 'guide', 'rename']) expect((await runIn('/here', [verb, '--help'])).code).toBe(0);
  expect(await runIn('/here', ['draw', '--help'])).toEqual({ code: 1, out: [], err: ['seefore: there is no verb "draw"; see seefore --help'] });
});

/** The command run on the test model, with what it printed and what it gave. */
const onShop = async (...args: string[]) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run([...args, '--workdir=test/shop'], process.cwd(), { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
};

test('list prints one line a record, those of a folder, those near one, the model with a change, and the changes', async () => {
  const all = await onShop('list');
  expect(all.code).toBe(0);
  // A part with its source; a connection with its two ends; a flow with its feature and its steps.
  expect(all.out).toContain('apps/app-order-api  Order API  in system-shop  service  code/order-api/');
  expect(all.out).toContain('connections/connection-customer-orders  Places an order  person-customer -> app-order-api');
  expect(all.out).toContain('flows/flow-placing-an-order  Placing an order  feature-ordering  3 steps');
  expect((await onShop('list', 'stores', 'technologies')).out).toEqual(['stores/store-orders  Orders  in system-shop  database', 'technologies/tech-go  Go']);
  const near = await onShop('list', '--near=tech-go');
  expect(near.out).toEqual(['technologies/tech-go  Go', 'named by:', '  apps/app-order-api  Order API  in system-shop  service  code/order-api/']);
  // With the change: what it adds, updates and removes bears a sign, and what it removes is still listed.
  const change = await onShop('list', 'connections', 'technologies', '--change=orders-by-post');
  expect(change.out).toEqual([
    '  connections/connection-api-writes-orders  No name  app-order-api -> store-orders',
    '+ connections/connection-clerk-orders  Types in a posted order  person-clerk -> app-order-api',
    '  connections/connection-customer-orders  Places an order  person-customer -> app-order-api',
    '- technologies/tech-go  Go',
  ]);
  expect((await onShop('list', 'changes')).out).toEqual(['changes/orders-by-post  Orders by post  the corrector: 1 open', 'changes/orders-on-paper-only  Orders on paper only  nothing open']);
  // What is not there gives 1 and one line.
  for (const args of [['list', 'drafts'], ['list', '--near=app-nothing'], ['list', '--change=nothing'], ['list', '--colour']]) {
    const wrong = await onShop(...args);
    expect([wrong.code, wrong.out, wrong.err.length]).toEqual([1, [], 1]);
  }
});

test('guide prints the words of the format for a folder and for a skill, and the topics with none', async () => {
  const lines = async (...args: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(args, process.cwd(), { out: (line) => out.push(line), err: (line) => err.push(line) });
    return { code, out, err };
  };
  const apps = await lines('guide', 'apps');
  expect(apps.code).toBe(0);
  expect(apps.out[0]).toBe('# apps: one app a file');
  expect(apps.out).toContain('  source (may be left out)');
  // A skill's guide holds the guides of the folders it writes; with no topic, the topics.
  const model = await lines('guide', 'model');
  expect(model.out.filter((line) => line.startsWith('# ')).map((line) => line.split(':')[0])).toEqual(['# people', '# systems', '# apps', '# stores', '# components', '# connections', '# infrastructure', '# owners', '# technologies']);
  expect((await lines('guide')).out.some((line) => line.trim().startsWith('review '))).toBe(true);
  const wrong = await lines('guide', 'nothing');
  expect([wrong.code, wrong.out, wrong.err.length]).toEqual([1, [], 1]);
});

test('list says so when there is nothing to list, so that an empty model is told from one that is not there', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const lines = async (...args: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(args, folder, { out: (line) => out.push(line), err: (line) => err.push(line) });
    return { code, out, err };
  };
  // No model: one line of what is wrong, and 1.
  const none = await lines('list');
  expect([none.code, none.out, none.err.length]).toEqual([1, [], 1]);
  // A model with no record yet: it is there, and it says that it is empty.
  expect((await lines('init', '--name=Shop')).code).toBe(0);
  expect(await lines('list')).toEqual({ code: 0, out: ['No records yet.'], err: [] });
  expect(await lines('list', 'apps')).toEqual({ code: 0, out: ['No records yet.'], err: [] });
  expect(await lines('list', 'changes')).toEqual({ code: 0, out: ['No changes yet.'], err: [] });
});

