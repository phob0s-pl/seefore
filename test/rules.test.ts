import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { countLine } from '../src/model/counts.ts';
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
  expect(fixes.some((fix) => fix.includes('one connection to the store from each side'))).toBe(true);
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

// ---- features, flows and data

/** A feature, two connections (one with no name, to a store) and a data record, for a flow to name. */
const SELLING = [
  file('features/selling.yaml', 'name: Selling\n'),
  file('connections/asks.yaml', 'from: clerk\nto: api\nname: Asks\n'),
  file('connections/reads.yaml', 'from: api\nto: orders\naccess: read\n'),
  file('data/order.yaml', 'name: Order\n'),
];
/** A flow of the selling feature with the steps given as lines of YAML. */
const flow = (id: string, steps: string) => file(`flows/${id}.yaml`, `name: Sale\nstarts: A clerk sells\nends: It is sold\nfeature: selling\nsteps:\n${steps}`);
const flowing = (...files: SourceFile[]) => read(...SELLING, ...files).problems;

test('step-shape: a step with both does and reply is one problem, at its reply', () => {
  const problems = flowing(flow('sale', '  - {id: asks, does: asks}\n  - {id: gets, does: asks, reply: asks}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'step-shape', file: 'flows/sale.yaml', line: 7, column: 35, field: 'steps', record: 'sale' });
  expect(problems[0]?.message).toBe('The second step has both `does` and `reply`. A step either happens on a connection, a part or a flow, or is the answer to an earlier step.');
});

test('step-shape: a step needs a name on a connection that has none, and not on one that has one or on a flow', () => {
  const [problem] = flowing(flow('sale', '  - {id: reads, does: reads}\n'));
  expect(problem).toMatchObject({ rule: 'step-shape', line: 6, column: 5 });
  expect(problem?.message).toBe('The first step has no `name`, and the connection `reads` it is on has none to lend it.');
  expect(flowing(flow('sale', '  - {id: asks, does: asks}\n  - {id: more, does: more}\n'), flow('more', '  - {id: reads, does: reads, name: Reads}\n'))).toEqual([]);
});

test('step-shape: data on a step inside a part is a problem, and on a reply it is not', () => {
  const [problem] = flowing(flow('sale', '  - {id: works, does: api, name: Works, data: [order]}\n'));
  expect(problem).toMatchObject({ rule: 'step-shape', line: 6, column: 47 });
  expect(problem?.message).toContain('it happens at `api`, which is an app');
  expect(flowing(flow('sale', '  - {id: asks, does: asks}\n  - {id: gets, reply: asks, name: The order, data: [order]}\n'))).toEqual([]);
});

test("step-twice: a step's id used twice in its flow is one problem, at the second, and the same id in another flow is none", () => {
  const problems = flowing(flow('sale', '  - {id: asks, does: asks}\n  - {id: asks, does: asks}\n  - {id: shows, reply: asks, name: The order}\n'), flow('other', '  - {id: asks, does: asks}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'step-twice', line: 7, column: 10, second: { line: 6, column: 10 } });
  expect(problems[0]?.message).toBe("`asks` is the id of the first step and the second step. A step's id is used once in its flow.");
});

test('step-earlier: a reply to a later step, and a reply to a read of a store, are problems', () => {
  const later = flowing(flow('sale', '  - {id: gets, reply: asks, name: The order}\n  - {id: asks, does: asks}\n'));
  expect(later).toHaveLength(1);
  expect(later[0]).toMatchObject({ rule: 'step-earlier', line: 6, column: 23 });
  expect(later[0]?.message).toBe('`reply` of the first step names `asks`, the second step, which comes after it.');
  const [store] = flowing(flow('sale', '  - {id: reads, does: reads, name: Reads}\n  - {id: rows, reply: reads, name: The rows}\n'));
  expect(store).toMatchObject({ rule: 'step-earlier', line: 7, column: 23 });
  expect(store?.fix).toBe('A read of a store is no reply: the reader acts, along its arrow. Name the connection in `does`.');
});

test('flow-in-itself: two flows that run each other are one problem, at the first by id, naming both', () => {
  const problems = flowing(flow('selling-b', '  - {id: runs, does: selling-a}\n'), flow('selling-a', '  - {id: asks, does: asks}\n  - {id: runs, does: selling-b}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'flow-in-itself', file: 'flows/selling-a.yaml', line: 7, column: 22, second: { file: 'flows/selling-b.yaml' } });
  expect(problems[0]?.message).toBe('`selling-a` runs `selling-b`, which runs `selling-a` again. No flow runs itself, through any chain of steps.');
});

test('reference-wrong-kind: touches that names an owner says to name it in owner', () => {
  const [problem] = read(file('owners/sales.yaml', 'name: Sales\n'), file('features/selling.yaml', 'name: Selling\ntouches: [api, sales]\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-wrong-kind', file: 'features/selling.yaml', line: 2, column: 16, field: 'touches' });
  expect(problem?.message).toContain('`touches` names `sales`, which is an owner.');
  expect(problem?.fix).toBe("Name the owner in the feature's `owner`, and take it out of `touches`.");
});

test('reference-unknown: a step that does nothing known is one problem, with no second about its name, its data or a reply to it', () => {
  const problems = flowing(flow('sale', '  - {id: asks, does: aks, data: [order]}\n  - {id: gets, reply: asks, name: The order}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'reference-unknown', line: 6, column: 22 });
  expect(problems[0]?.message).toBe('`does` of the first step names `aks`, but no record has that id. The nearest id is `asks`.');
});

test('the three counts: a feature alone, a step unplaced, and data and an owner that nothing names', () => {
  const counts = read(
    ...SELLING,
    file('owners/sales.yaml', 'name: Sales\n'),
    file('owners/shop-floor.yaml', 'name: Shop floor\n'),
    file('features/returns.yaml', 'name: Returns\nowner: shop-floor\n'),
    file('features/stock.yaml', 'name: Stock\ntouches: [orders]\n'),
    flow('sale', '  - {id: asks, does: asks}\n  - {id: who-pays, name: Who pays}\n'),
  ).counts;
  const found = Object.fromEntries(counts.map((count) => [count.rule, [count.checked, ...count.found.map((item) => item.record)]]));
  expect(found).toEqual({ 'record-unused': [3, 'order', 'sales'], 'feature-alone': [3, 'returns'], 'step-unplaced': [1, 'sale'] });
  expect(counts.map(countLine)).toEqual([
    '2 owners or data records that nothing names: `sales`, `order`.',
    '1 feature that no flow names and that touches nothing: `returns`.',
    '1 step with neither `does` nor `reply`, in `sale`.',
  ]);
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
