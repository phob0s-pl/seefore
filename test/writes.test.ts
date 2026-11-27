import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import type { SourceFile } from '../src/model/read.ts';
import { removeRecords } from '../src/model/remove.ts';
import { renameRecords } from '../src/model/rename.ts';
import { run } from '../src/server/command.ts';
import { blockedWrites, writeApplied, writeRenamed } from '../src/server/files.ts';

/** A small shop: the API writes the orders, and a clerk whom nothing names. */
const SHOP: Record<string, string> = {
  'seefore.yaml': 'format: 1\nname: Shop\n',
  'systems/system-shop.yaml': 'name: Shop\n',
  'apps/app-api.yaml': 'name: API\nin: system-shop\n',
  'stores/store-orders.yaml': 'name: Orders\nin: system-shop\nkind: database\n',
  'people/person-clerk.yaml': 'name: Clerk\n',
  'connections/connection-api-writes-orders.yaml': 'from: app-api\nto: store-orders\naccess: write\n',
};
const sources = (files: Record<string, string>): SourceFile[] => Object.entries(files).map(([path, text]) => ({ path, text }));

/** A new folder that holds the files given. */
async function folderOf(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-writes-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
  return folder;
}

/** Every file under a folder with its text, at any depth: what a refused call must leave as it was. */
async function everything(folder: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.isFile()) found[prefix + entry.name] = await readFile(join(dir, entry.name), 'utf8');
      else found[prefix + entry.name] = '(a link)';
    }
  };
  await walk(folder, '');
  return found;
}

/** The lines the command prints in a folder, to either stream, and how it ends. */
async function runIn(folder: string, ...args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run([...args, `--workdir=${folder}`], '/here', { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

test('remove takes no file that is not a record: not at the root of a project, nor below it, nor deeper in a folder of the model', async () => {
  const folder = await folderOf({ ...SHOP, 'docker-compose.yml': 'services: {}\n', 'k8s/deploy.yaml': 'kind: Deployment\n', 'apps/charts/app-deep.yaml': 'name: Deep\n' });
  const before = await everything(folder);
  expect(await runIn(folder, 'remove', 'docker-compose', 'deploy')).toEqual({ code: 1, out: [], err: ['seefore: there is no record `docker-compose`', 'seefore: there is no record `deploy`', 'seefore: nothing is removed'] });
  for (const name of ['k8s/deploy', 'k8s/deploy.yaml', 'docker-compose.yml', 'app-deep', 'apps/charts/app-deep', 'seefore', 'seefore.yaml'])
    expect((await runIn(folder, 'remove', name)).err).toEqual([`seefore: there is no record \`${name}\``, 'seefore: nothing is removed']);
  // One name that is no record stops the whole call, though the other is one.
  expect((await runIn(folder, 'remove', 'person-clerk', 'deploy')).code).toBe(1);
  expect(await everything(folder)).toEqual(before);
  // A record goes as before, and nothing else with it.
  expect(await runIn(folder, 'remove', 'person-clerk')).toEqual({ code: 0, out: ['people/person-clerk.yaml', '1 record removed.'], err: [] });
  const { 'people/person-clerk.yaml': _gone, ...rest } = before;
  expect(await everything(folder)).toEqual(rest);
});

test('remove takes neither a change nor its review, by any name, and says what keeps a record', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-writes-'));
  await cp('test/shop', folder, { recursive: true });
  const before = await everything(folder);
  // The clerk is named by an open change: the hint is to decide the change, not to remove it.
  const alone = await runIn(folder, 'remove', 'person-clerk');
  expect(alone.code).toBe(1);
  expect(alone.err[0]).toMatch(/^seefore: `person-clerk` stays: changes\/orders-by-post\.yaml:\d+:\d+ names it$/);
  expect(alone.err.slice(1)).toEqual(['seefore: an open change or its review names it: decide the change first', 'seefore: nothing is removed']);
  // The call that took the three before.
  expect(await runIn(folder, 'remove', 'person-clerk', 'changes/orders-by-post', 'reviews/orders-by-post')).toEqual({
    code: 1,
    out: [],
    err: [
      'seefore: `changes/orders-by-post` is a change, and `remove` takes records of the model alone. A change ends when it is applied or rejected.',
      'seefore: `reviews/orders-by-post` is a review, and `remove` takes records of the model alone. A review stays with its change.',
      'seefore: nothing is removed',
    ],
  });
  expect((await runIn(folder, 'remove', 'changes/orders-by-post.yaml', '--dry-run')).err[0]).toMatch(/is a change/);
  // A change's id is its own: as a bare name it is no record.
  expect((await runIn(folder, 'remove', 'orders-by-post')).err).toEqual(['seefore: there is no record `orders-by-post`', 'seefore: nothing is removed']);
  // A store that records name and that the review names gets both hints.
  const store = await runIn(folder, 'remove', 'store-orders');
  expect(store.err.slice(-3)).toEqual(['seefore: remove what names it in the same call, or change it first', 'seefore: an open change or its review names it: decide the change first', 'seefore: nothing is removed']);
  expect(await everything(folder)).toEqual(before);
});

test('a name with no ending is a `.yaml` file, a name with its ending is that very file, and one id in two folders is named with its folder', () => {
  const files = sources({ ...SHOP, 'apps/app-test.yaml': 'name: Test\nin: system-shop\n', 'apps/app-odd.yml': 'name: Odd\nin: system-shop\n', 'stores/app-test.yaml': 'name: Misplaced\nin: system-shop\n' });
  const one = files.filter((file) => file.path !== 'stores/app-test.yaml');
  // The ending typed is the ending meant: `.yml` does not take the `.yaml` file.
  expect(removeRecords(one, ['apps/app-test.yml'])).toEqual({ refusals: ['there is no record `apps/app-test.yml`'] });
  for (const name of ['app-test', 'apps/app-test', 'app-test.yaml', 'apps/app-test.yaml']) expect(removeRecords(one, [name])).toEqual({ files: ['apps/app-test.yaml'] });
  // A file that the check faults for its ending goes by its whole name alone.
  expect(removeRecords(one, ['app-odd'])).toEqual({ refusals: ['there is no record `app-odd`'] });
  for (const name of ['app-odd.yml', 'apps/app-odd.yml']) expect(removeRecords(one, [name])).toEqual({ files: ['apps/app-odd.yml'] });
  expect(removeRecords(files, ['app-test'])).toEqual({ refusals: ['2 records have the id `app-test`: `apps/app-test`, `stores/app-test`. Name one with its folder, as `apps/app-test`.'] });
  expect(removeRecords(files, ['stores/app-test'])).toEqual({ files: ['stores/app-test.yaml'] });
});

test('nothing is removed while the marker does not read, since nothing that names a record would be seen', () => {
  const named = { ...SHOP, 'connections/connection-clerk-uses-api.yaml': 'from: person-clerk\nto: app-api\n' };
  expect(removeRecords(sources(named), ['person-clerk'])).toEqual({ refusals: ['`person-clerk` stays: connections/connection-clerk-uses-api.yaml:1:7 names it', 'remove what names it in the same call, or change it first'] });
  const refusal = { refusals: ['`seefore.yaml` does not read as format 1, so no record is read and none could be held against the rest: mend it first'] };
  expect(removeRecords(sources({ ...named, 'seefore.yaml': 'format: 2\nname: Shop\n' }), ['person-clerk'])).toEqual(refusal);
  expect(removeRecords(sources({ ...named, 'seefore.yaml': 'format: [\n' }), ['person-clerk'])).toEqual(refusal);
});

const ADDS = 'name: A worker\nprompt: Add a worker behind a gateway, with a cache.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop}\n  infrastructure/infra-gateway: {name: Gateway, in: system-shop}\n  stores/store-cache: {name: Cache, in: system-shop, kind: cache}\n  technologies/tech-redis: {name: Redis}\n';

test('apply writes no file through a link, and nothing at all while one is in the way; a dry run says the same', async () => {
  const folder = await folderOf({ ...SHOP, 'changes/a-worker.yaml': ADDS });
  const outside = await folderOf({ 'target.yaml': 'kept: outside the model\n', 'dir/there.txt': 'kept\n' });
  // A link to a file outside, a link to a folder outside, and a link to nothing. The reader passes over each.
  await symlink(join(outside, 'target.yaml'), join(folder, 'apps/app-worker.yaml'));
  await symlink(join(outside, 'dir'), join(folder, 'infrastructure'));
  await symlink(join(outside, 'nowhere.yaml'), join(folder, 'stores/store-cache.yaml'));
  const before = [await everything(folder), await everything(outside)];
  const refused = {
    code: 1,
    out: [],
    err: [
      'seefore: `apps/app-worker.yaml` cannot be written: `apps/app-worker.yaml` is a link, and seefore writes no file through one',
      'seefore: `infrastructure/infra-gateway.yaml` cannot be written: `infrastructure` is a link, and seefore writes no file through one',
      'seefore: `stores/store-cache.yaml` cannot be written: `stores/store-cache.yaml` is a link, and seefore writes no file through one',
      'seefore: nothing is applied',
    ],
  };
  expect(await runIn(folder, 'apply', 'a-worker', '--dry-run')).toEqual(refused);
  expect(await runIn(folder, 'apply', 'a-worker')).toEqual(refused);
  // Not the file outside, not the folder outside, not the one record whose path was free, not the status.
  expect([await everything(folder), await everything(outside)]).toEqual(before);
  expect(existsSync(join(folder, 'technologies/tech-redis.yaml'))).toBe(false);
});

test('a name that differs only by case is in the way of a new file and of a new folder, on any disk', async () => {
  const kept = 'kept: not a record\n';
  const folder = await folderOf({ ...SHOP, 'apps/App-New.yaml': kept });
  const before = await everything(folder);
  const refused = { code: 1, out: [], err: ['seefore: `apps/app-new.yaml` cannot be written: `apps/App-New.yaml` is there, and the two differ only by case, which not every disk tells apart', 'seefore: nothing is renamed'] };
  expect(await runIn(folder, 'rename', 'app-api', 'app-new', '--dry-run')).toEqual(refused);
  expect(await runIn(folder, 'rename', 'app-api', 'app-new')).toEqual(refused);
  expect(await everything(folder)).toEqual(before);

  const other = await folderOf({ ...SHOP, 'Infrastructure/notes.txt': kept, 'changes/a-gateway.yaml': 'name: A gateway\nprompt: Add a gateway.\nadd:\n  infrastructure/infra-gateway: {name: Gateway, in: system-shop}\n' });
  const was = await everything(other);
  expect(await runIn(other, 'apply', 'a-gateway')).toEqual({
    code: 1,
    out: [],
    err: ['seefore: `infrastructure/infra-gateway.yaml` cannot be written: `Infrastructure` is there, and the two differ only by case, which not every disk tells apart', 'seefore: nothing is applied'],
  });
  expect(await everything(other)).toEqual(was);
});

test('a path that is free is not in the way, and a new file is written only where nothing is, though one came after the look', async () => {
  const open = 'name: A worker\nprompt: Add one.\n';
  const folder = await folderOf({ ...SHOP, 'changes/a-worker.yaml': open });
  // A file in a folder that is there, and one in a folder that is yet to be made.
  expect(await blockedWrites(folder, ['apps/app-worker.yaml', 'infrastructure/infra-gateway.yaml'])).toEqual([]);
  expect(await blockedWrites(folder, ['apps/app-api.yaml', 'seefore.yaml/app-x.yaml'])).toEqual([
    '`apps/app-api.yaml` cannot be written: it is there already, and was not when the model was read',
    '`seefore.yaml/app-x.yaml` cannot be written: `seefore.yaml` is no folder',
  ]);
  // The file came between the look and the write: the write fails, and the file is as it was.
  await writeFile(join(folder, 'apps/app-worker.yaml'), 'kept: came later\n');
  const change = { path: 'changes/a-worker.yaml', text: `${open}status: applied\n` };
  await expect(writeApplied(folder, [{ path: 'apps/app-worker.yaml', text: 'name: Worker\nin: system-shop\n' }], [], change, ['apps/app-worker.yaml'])).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(join(folder, 'apps/app-worker.yaml'), 'utf8')).toBe('kept: came later\n');
  expect(await readFile(join(folder, 'changes/a-worker.yaml'), 'utf8')).toBe(open);
  await expect(writeRenamed(folder, [{ path: 'apps/app-worker.yaml', text: SHOP['apps/app-api.yaml'] as string }], [{ from: 'apps/app-api.yaml', to: 'apps/app-worker.yaml' }])).rejects.toMatchObject({ code: 'EEXIST' });
  expect(await readFile(join(folder, 'apps/app-worker.yaml'), 'utf8')).toBe('kept: came later\n');
  expect(existsSync(join(folder, 'apps/app-api.yaml'))).toBe(true);
  // A record that is updated is written over, as it must be.
  await writeApplied(folder, [{ path: 'apps/app-api.yaml', text: 'name: The API\nin: system-shop\n' }], [], change, []);
  expect(await readFile(join(folder, 'apps/app-api.yaml'), 'utf8')).toBe('name: The API\nin: system-shop\n');
});

test('an id that one line of a list leaves and another takes stays taken: a connection that would follow its end there keeps its id, and no file is lost', async () => {
  const model = {
    ...SHOP,
    'apps/app-a.yaml': 'name: A\nin: system-shop\n',
    'connections/connection-a.yaml': 'from: app-a\nto: app-api\nname: Follows its end\n',
    'connections/connection-x.yaml': 'from: app-api\nto: app-a\nname: Is renamed to b\n',
    'connections/connection-b.yaml': 'from: app-api\nto: app-api\nname: Is renamed to c\n',
  };
  // `connection-a` names its end `app-a` in its id, so it would follow it to `connection-b`, which the second line takes.
  const renames = [
    { old: 'app-a', new: 'app-b' },
    { old: 'connection-x', new: 'connection-b' },
    { old: 'connection-b', new: 'connection-c' },
  ];
  const done = renameRecords(sources(model), renames);
  if ('refusals' in done) throw new Error(done.refusals.join('\n'));
  expect(done.account.left).toEqual([{ id: 'connection-a', would: 'connection-b', why: '`connection-b` is taken' }]);
  const folder = await folderOf({ ...model, 'moves.txt': 'app-a app-b\nconnection-x connection-b\nconnection-b connection-c\n' });
  expect((await runIn(folder, 'rename', `--list=${join(folder, 'moves.txt')}`)).code).toBe(0);
  const after = await everything(folder);
  expect(Object.keys(after).filter((path) => path.startsWith('connections/connection-') && !path.includes('writes')).sort()).toEqual(['connections/connection-a.yaml', 'connections/connection-b.yaml', 'connections/connection-c.yaml']);
  expect(after['connections/connection-a.yaml']).toBe('from: app-b\nto: app-api\nname: Follows its end\n');
  expect(after['connections/connection-b.yaml']).toBe('from: app-api\nto: app-b\nname: Is renamed to b\n');
  expect(after['connections/connection-c.yaml']).toBe('from: app-api\nto: app-api\nname: Is renamed to c\n');
  expect((await runIn(folder, 'check')).out[0]).toMatch(/^9 records read\. No problem/);
});
