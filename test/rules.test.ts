import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { run } from '../src/server/command.ts';

const BASE: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\n' },
  { path: 'apps/api.yaml', text: 'name: API\nin: shop\n' },
  { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\n' },
  { path: 'people/clerk.yaml', text: 'name: Clerk\n' },
];

const file = (path: string, text: string): SourceFile => ({ path, text });
const read = (...files: SourceFile[]) => readModel([...BASE, ...files]);
const rulesOf = (...files: SourceFile[]) => read(...files).problems.map((problem) => problem.rule);

test('a model with no fault has no problem, and a connection may start at a store and open with access', () => {
  const model = read(
    file('connections/a.yaml', 'from: orders\nto: orders\naccess: read\nopens: to\n'),
    file('connections/b.yaml', 'from: clerk\nto: api\n'),
  );
  expect(model.problems).toEqual([]);
});

test('id-twice is one problem that names every file, at the first', () => {
  const model = read(file('owners/clerk.yaml', 'name: Clerks\n'));
  expect(model.problems).toHaveLength(1);
  expect(model.problems[0]).toMatchObject({ rule: 'id-twice', file: 'owners/clerk.yaml', severity: 'error', second: { file: 'people/clerk.yaml' } });
  expect(model.problems[0]?.message).toContain('`people/clerk.yaml`');
});

test('reference-unknown names the nearest id, with the place of the value', () => {
  const [problem] = read(file('connections/a.yaml', 'from: clerk\nto: ordres\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-unknown', file: 'connections/a.yaml', line: 2, column: 5, field: 'to' });
  expect(problem?.message).toContain('`orders`');
  expect(problem?.fix).toContain('`orders`');
});

test('a reference to an id that two files claim gives no follow-on error', () => {
  expect(rulesOf(file('owners/clerk.yaml', 'name: Clerks\n'), file('connections/a.yaml', 'from: api\nto: clerk\n'))).toEqual(['id-twice']);
});

test('a store in a store is a reference-wrong-kind with its own fix', () => {
  const [problem] = read(file('stores/jobs.yaml', 'name: Jobs\nin: orders\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-wrong-kind', file: 'stores/jobs.yaml', line: 2, column: 5 });
  expect(problem?.message).toBe('`in` names `orders`, which is a store. A store is never in a store.');
  expect(problem?.fix).toContain('Put both stores in the system.');
});

test('an app in an app, a component in a system, via a store and an owner that is no owner each have their fix', () => {
  const model = read(
    file('apps/web.yaml', 'name: Web\nin: api\n'),
    file('components/part.yaml', 'name: Part\nin: shop\n'),
    file('connections/a.yaml', 'from: clerk\nto: api\nvia: [orders]\n'),
    file('systems/other.yaml', 'name: Other\nowner: clerk\n'),
  );
  const fixes = model.problems.map((problem) => problem.fix);
  expect(model.problems.map((problem) => problem.rule)).toEqual(Array(4).fill('reference-wrong-kind'));
  expect(fixes.some((fix) => fix.includes('component of the host'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('somebody else'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('one connection to it from each side'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('owners/'))).toBe(true);
});

test('access-not-store is an error where to is no store', () => {
  const [problem] = read(file('connections/a.yaml', 'from: clerk\nto: api\naccess: read\n')).problems;
  expect(problem).toMatchObject({ rule: 'access-not-store', field: 'access', line: 3 });
});

test('via-end warns for a hop that is an end, and not for a hop that is inside one', () => {
  const part = file('components/part.yaml', 'name: Part\nin: api\n');
  const inside = read(part, file('connections/a.yaml', 'from: clerk\nto: api\nvia: [part]\n'));
  expect(inside.problems).toEqual([]);
  const [problem] = read(file('connections/a.yaml', 'from: api\nto: orders\nvia: [api]\n')).problems;
  expect(problem).toMatchObject({ rule: 'via-end', severity: 'warning', field: 'via', line: 3, column: 7 });
});

test('connection-twice warns once for named connections that agree in every field', () => {
  const text = 'from: clerk\nto: api\nname: Place order\n';
  const twice = read(file('connections/a.yaml', text), file('connections/b.yaml', text));
  expect(twice.problems).toHaveLength(1);
  expect(twice.problems[0]).toMatchObject({ rule: 'connection-twice', severity: 'warning', file: 'connections/a.yaml', second: { file: 'connections/b.yaml' } });
  expect(rulesOf(file('connections/a.yaml', text), file('connections/b.yaml', `${text}only: at night\n`))).toEqual([]);
  expect(rulesOf(file('connections/a.yaml', 'from: clerk\nto: api\n'), file('connections/b.yaml', 'from: clerk\nto: api\n'))).toEqual([]);
});

test('record-unused is a count, given only when every file read', () => {
  const files = [file('owners/ops.yaml', 'name: Ops\n'), file('technologies/go.yaml', 'name: Go\n'), file('apps/web.yaml', 'name: Web\nin: shop\nowner: ops\n')];
  const counted = read(...files);
  expect(counted.problems).toEqual([]);
  expect(counted.counts[0]).toMatchObject({ rule: 'record-unused', checked: 2, found: [{ record: 'go', file: 'technologies/go.yaml' }] });
  const broken = read(...files, file('people/bob.yaml', 'name: [\n'));
  expect(broken.counts[0]).toMatchObject({ checked: null, found: [] });
});

test('a broken file stands for its id and gives no follow-on error', () => {
  const model = read(file('stores/bad.yaml', 'name: [\n'), file('connections/a.yaml', 'from: clerk\nto: bad\n'));
  expect(model.problems.map((problem) => problem.rule)).toEqual(['yaml-syntax']);
  expect(read(file('apps/web.yaml', 'name: Web\nin: missing\ncolour: red\n')).problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
});

test('a problem of B1 carries its column too', () => {
  expect(read(file('apps/web.yaml', 'name: Web\nin: shop\ncolour: red\n')).problems[0]).toMatchObject({ line: 3, column: 1 });
});

test('seefore check ends with 1 on an error and 0 on a warning, and --json gives the problems as data', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const write = async (files: SourceFile[]) => {
    for (const { path, text } of files) {
      await mkdir(dirname(join(folder, path)), { recursive: true });
      await writeFile(join(folder, path), text);
    }
  };
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };

  await write([...BASE, file('connections/a.yaml', 'from: api\nto: orders\nvia: [api]\n')]);
  expect(await run(['check', `--workdir=${folder}`], '/here', io)).toBe(0);
  expect(lines).toContain('connections/a.yaml:3:7: warning: `api` is in `via`, and it is also the `from` of this connection. A connection does not pass through its own end.');
  expect(lines.at(-1)).toBe('5 records read. 0 errors, 1 warning.');

  await write([file('stores/jobs.yaml', 'name: Jobs\nin: orders\n')]);
  lines.length = 0;
  expect(await run(['check', '--json', `--workdir=${folder}`], '/here', io)).toBe(1);
  expect(lines).toHaveLength(1);
  const json = JSON.parse(lines[0] as string);
  expect(json).toMatchObject({ records: 6, errors: 1, warnings: 1 });
  expect(json.problems.map((problem: { rule: string }) => problem.rule)).toEqual(['via-end', 'reference-wrong-kind']);
  expect(json.counts[0]).toMatchObject({ rule: 'record-unused', checked: 0 });
});
