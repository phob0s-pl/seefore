import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { countLine, countLines } from '../src/model/counts.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { run } from '../src/server/command.ts';

const BASE: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'systems/system-shop.yaml', text: 'name: Shop\n' },
  { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\n' },
  { path: 'stores/store-orders.yaml', text: 'name: Orders\nin: system-shop\n' },
  { path: 'people/person-clerk.yaml', text: 'name: Clerk\n' },
];

const file = (path: string, text: string): SourceFile => ({ path, text });
const read = (...files: SourceFile[]) => readModel([...BASE, ...files]);
const rulesOf = (...files: SourceFile[]) => read(...files).problems.map((problem) => problem.rule);

test('a model with no fault has no problem, and a connection may start at a store and open with access', () => {
  const model = read(
    file('connections/connection-a.yaml', 'from: store-orders\nto: store-orders\naccess: read\nopens: to\n'),
    file('connections/connection-b.yaml', 'from: person-clerk\nto: app-api\n'),
  );
  expect(model.problems).toEqual([]);
});

const kindOf = (...files: SourceFile[]) => read(...files).problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.line, problem.message, problem.fix]);

test('id-kind: an id begins with the word of its folder, and the mend is the command that renames it', () => {
  // No word: the folder says the kind, and the command gives the id its word.
  expect(kindOf(file('apps/monitoring.yaml', 'name: Prometheus\nin: system-shop\n'))).toEqual([
    [
      'id-kind',
      'error',
      'apps/monitoring.yaml',
      1,
      'The id `monitoring` does not begin with `app-`. An id says its kind as its first word, and this file is in `apps/`.',
      'Run `seefore rename monitoring app-monitoring`. If it is not an app, give it the word of what it is, as `tech-monitoring`: that moves the file.',
    ],
  ]);
  // Another folder's word: it may be a name that begins with that word, or a file in the wrong folder.
  expect(kindOf(file('apps/store-front.yaml', 'name: Store front\nin: system-shop\n'))).toEqual([
    [
      'id-kind',
      'error',
      'apps/store-front.yaml',
      1,
      'The id `store-front` begins with `store-`, the word of `stores/`, and this file is in `apps/`. An id says its kind as its first word, and the folder says the kind.',
      'If it is an app, run `seefore rename store-front app-store-front`. If it is a store, move the file to `stores/`.',
    ],
  ]);
  // The word alone names nothing.
  expect(kindOf(file('technologies/tech.yaml', 'name: Tech\n')).map((each) => [each[0], each[4], each[5]])).toEqual([
    ['id-kind', 'The id `tech` is the word of its folder alone. An id says its kind as its first word, and then what the record is.', 'Give it a name after the word: run `seefore rename tech tech-<name>`.'],
  ]);
  // A name that begins with the word needs it once, and every folder of the model has its word.
  expect(
    kindOf(
      file('apps/app-store.yaml', 'name: App store\nin: system-shop\n'),
      file('features/feature-flags.yaml', 'name: Feature flags\n'),
      file('infrastructure/infra-load-balancer.yaml', 'name: Load balancer\nin: system-shop\nowner: owner-platform\n'),
      file('owners/owner-platform.yaml', 'name: Platform\n'),
      file('technologies/tech-go.yaml', 'name: Go\n'),
      file('data/data-export.yaml', 'name: Data export\n'),
      file('rules/rule-no-jobs.yaml', 'name: No app is a job\nnever: {kind: job}\n'),
      file('context/context-one-team.yaml', 'prefer: One team runs it.\nwhy: It is small.\n'),
    ),
  ).toEqual([]);
});

test('reference-unknown names the nearest id, with the place of the value', () => {
  const [problem] = read(file('connections/connection-a.yaml', 'from: person-clerk\nto: store-ordres\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-unknown', file: 'connections/connection-a.yaml', line: 2, column: 5, field: 'to' });
  expect(problem?.message).toContain('`store-orders`');
  expect(problem?.fix).toContain('`store-orders`');
});

test('a record whose id lacks its word is still read: what names it is not told as unknown, and two with one id are each told with their path', () => {
  // The connection names `clerk`, which two files hold: each is told once, by its path, and the reference is not.
  const problems = read(file('people/clerk.yaml', 'name: Clerk\n'), file('owners/clerk.yaml', 'name: Clerks\n'), file('connections/connection-a.yaml', 'from: app-api\nto: clerk\n')).problems;
  expect(problems.map((problem) => [problem.rule, problem.file, problem.fix.split('.')[0]])).toEqual([
    ['id-kind', 'owners/clerk.yaml', 'Run `seefore rename owners/clerk owner-clerk`'],
    ['id-kind', 'people/clerk.yaml', 'Run `seefore rename people/clerk person-clerk`'],
  ]);
  // One file holds it: the reference is good, and the one problem is the id.
  expect(rulesOf(file('people/customer.yaml', 'name: Customer\n'), file('connections/connection-b.yaml', 'from: customer\nto: app-api\n'))).toEqual(['id-kind']);
});

test('a store in a store is a reference-wrong-kind with its own fix', () => {
  const [problem] = read(file('stores/store-jobs.yaml', 'name: Jobs\nin: store-orders\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-wrong-kind', file: 'stores/store-jobs.yaml', line: 2, column: 5 });
  expect(problem?.message).toBe('`in` names `store-orders`, which is a store. A store is never in a store.');
  expect(problem?.fix).toContain('Put both stores in the system.');
});

test('an app in an app, a component in a system, via a store and an owner that is no owner each have their fix', () => {
  const model = read(
    file('apps/app-web.yaml', 'name: Web\nin: app-api\n'),
    file('components/component-part.yaml', 'name: Part\nin: system-shop\n'),
    file('connections/connection-a.yaml', 'from: person-clerk\nto: app-api\nvia: [store-orders]\n'),
    file('systems/system-other.yaml', 'name: Other\nowner: person-clerk\n'),
  );
  const fixes = model.problems.map((problem) => problem.fix);
  expect(model.problems.map((problem) => problem.rule)).toEqual(Array(4).fill('reference-wrong-kind'));
  expect(fixes.some((fix) => fix.includes('component of the host'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('somebody else'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('one connection to the store from each side'))).toBe(true);
  expect(fixes.some((fix) => fix.includes('owners/'))).toBe(true);
});

test('access-not-store is an error where to is no store', () => {
  const [problem] = read(file('connections/connection-a.yaml', 'from: person-clerk\nto: app-api\naccess: read\n')).problems;
  expect(problem).toMatchObject({ rule: 'access-not-store', field: 'access', line: 3 });
});

test('via-end warns for a hop that is an end, and not for a hop that is inside one', () => {
  const part = file('components/component-part.yaml', 'name: Part\nin: app-api\n');
  const inside = read(part, file('connections/connection-a.yaml', 'from: person-clerk\nto: app-api\nvia: [component-part]\n'));
  expect(inside.problems).toEqual([]);
  const [problem] = read(file('connections/connection-a.yaml', 'from: app-api\nto: store-orders\nvia: [app-api]\n')).problems;
  expect(problem).toMatchObject({ rule: 'via-end', severity: 'warning', field: 'via', line: 3, column: 7 });
});

test('connection-twice warns once for named connections that agree in every field', () => {
  const text = 'from: person-clerk\nto: app-api\nname: Place order\n';
  const twice = read(file('connections/connection-a.yaml', text), file('connections/connection-b.yaml', text));
  expect(twice.problems).toHaveLength(1);
  expect(twice.problems[0]).toMatchObject({ rule: 'connection-twice', severity: 'warning', file: 'connections/connection-a.yaml', second: { file: 'connections/connection-b.yaml' } });
  expect(rulesOf(file('connections/connection-a.yaml', text), file('connections/connection-b.yaml', `${text}only: at night\n`))).toEqual([]);
  expect(rulesOf(file('connections/connection-a.yaml', 'from: person-clerk\nto: app-api\n'), file('connections/connection-b.yaml', 'from: person-clerk\nto: app-api\n'))).toEqual([]);
});

test('record-unused is a count, given only when every file read', () => {
  const files = [file('owners/owner-ops.yaml', 'name: Ops\n'), file('technologies/tech-go.yaml', 'name: Go\n'), file('apps/app-web.yaml', 'name: Web\nin: system-shop\nowner: owner-ops\n')];
  const counted = read(...files);
  expect(counted.problems).toEqual([]);
  expect(counted.counts[0]).toMatchObject({ rule: 'record-unused', checked: 2, found: [{ record: 'tech-go', file: 'technologies/tech-go.yaml' }] });
  const broken = read(...files, file('people/person-bob.yaml', 'name: [\n'));
  expect(broken.counts[0]).toMatchObject({ checked: null, found: [] });
});

test('a broken file stands for its id and gives no follow-on error', () => {
  const model = read(file('stores/store-bad.yaml', 'name: [\n'), file('connections/connection-a.yaml', 'from: person-clerk\nto: store-bad\n'));
  expect(model.problems.map((problem) => problem.rule)).toEqual(['yaml-syntax']);
  expect(read(file('apps/app-web.yaml', 'name: Web\nin: system-missing\ncolour: red\n')).problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
});

test('a problem of B1 carries its column too', () => {
  expect(read(file('apps/app-web.yaml', 'name: Web\nin: system-shop\ncolour: red\n')).problems[0]).toMatchObject({ line: 3, column: 1 });
});

// ---- features, flows and data

/** A feature, two connections (one with no name, to a store) and a data record, for a flow to name. */
const SELLING = [
  file('features/feature-selling.yaml', 'name: Selling\n'),
  file('connections/connection-asks.yaml', 'from: person-clerk\nto: app-api\nname: Asks\n'),
  file('connections/connection-reads.yaml', 'from: app-api\nto: store-orders\naccess: read\n'),
  file('data/data-order.yaml', 'name: Order\n'),
];
/** A flow of the selling feature with the steps given as lines of YAML. */
const flow = (id: string, steps: string) => file(`flows/${id}.yaml`, `name: Sale\nstarts: A clerk sells\nends: It is sold\nfeature: feature-selling\nsteps:\n${steps}`);
const flowing = (...files: SourceFile[]) => read(...SELLING, ...files).problems;

test('step-shape: a step with both does and reply is one problem, at its reply', () => {
  const problems = flowing(flow('flow-sale', '  - {id: asks, does: connection-asks}\n  - {id: gets, does: connection-asks, reply: asks}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'step-shape', file: 'flows/flow-sale.yaml', line: 7, column: 46, field: 'steps', record: 'flow-sale' });
  expect(problems[0]?.message).toBe('The second step has both `does` and `reply`. A step either happens on a connection, a part or a flow, or is the answer to an earlier step.');
});

test('step-shape: a step needs a name on a connection that has none, and not on one that has one or on a flow', () => {
  const [problem] = flowing(flow('flow-sale', '  - {id: reads, does: connection-reads}\n'));
  expect(problem).toMatchObject({ rule: 'step-shape', line: 6, column: 5 });
  expect(problem?.message).toBe('The first step has no `name`, and the connection `connection-reads` it is on has none to lend it.');
  expect(flowing(flow('flow-sale', '  - {id: asks, does: connection-asks}\n  - {id: more, does: flow-more}\n'), flow('flow-more', '  - {id: reads, does: connection-reads, name: Reads}\n'))).toEqual([]);
});

test('step-shape: data on a step inside a part is a problem, and on a reply it is not', () => {
  const [problem] = flowing(flow('flow-sale', '  - {id: works, does: app-api, name: Works, data: [data-order]}\n'));
  expect(problem).toMatchObject({ rule: 'step-shape', line: 6, column: 51 });
  expect(problem?.message).toContain('it happens at `app-api`, which is an app');
  expect(flowing(flow('flow-sale', '  - {id: asks, does: connection-asks}\n  - {id: gets, reply: asks, name: The order, data: [data-order]}\n'))).toEqual([]);
});

test("step-twice: a step's id used twice in its flow is one problem, at the second, and the same id in another flow is none", () => {
  const problems = flowing(flow('flow-sale', '  - {id: asks, does: connection-asks}\n  - {id: asks, does: connection-asks}\n  - {id: shows, reply: asks, name: The order}\n'), flow('flow-other', '  - {id: asks, does: connection-asks}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'step-twice', line: 7, column: 10, second: { line: 6, column: 10 } });
  expect(problems[0]?.message).toBe("`asks` is the id of the first step and the second step. A step's id is used once in its flow.");
});

test('step-earlier: a reply to a later step, and a reply to a read of a store, are problems', () => {
  const later = flowing(flow('flow-sale', '  - {id: gets, reply: asks, name: The order}\n  - {id: asks, does: connection-asks}\n'));
  expect(later).toHaveLength(1);
  expect(later[0]).toMatchObject({ rule: 'step-earlier', line: 6, column: 23 });
  expect(later[0]?.message).toBe('`reply` of the first step names `asks`, the second step, which comes after it.');
  const [store] = flowing(flow('flow-sale', '  - {id: reads, does: connection-reads, name: Reads}\n  - {id: rows, reply: reads, name: The rows}\n'));
  expect(store).toMatchObject({ rule: 'step-earlier', line: 7, column: 23 });
  expect(store?.fix).toBe('A read of a store is no reply: the reader acts, along its arrow. Name the connection in `does`.');
});

test('flow-in-itself: two flows that run each other are one problem, at the first by id, naming both', () => {
  const problems = flowing(flow('flow-selling-b', '  - {id: runs, does: flow-selling-a}\n'), flow('flow-selling-a', '  - {id: asks, does: connection-asks}\n  - {id: runs, does: flow-selling-b}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'flow-in-itself', file: 'flows/flow-selling-a.yaml', line: 7, column: 22, second: { file: 'flows/flow-selling-b.yaml' } });
  expect(problems[0]?.message).toBe('`flow-selling-a` runs `flow-selling-b`, which runs `flow-selling-a` again. No flow runs itself, through any chain of steps.');
});

test('reference-wrong-kind: touches that names an owner says to name it in owner', () => {
  const [problem] = read(file('owners/owner-sales.yaml', 'name: Sales\n'), file('features/feature-selling.yaml', 'name: Selling\ntouches: [app-api, owner-sales]\n')).problems;
  expect(problem).toMatchObject({ rule: 'reference-wrong-kind', file: 'features/feature-selling.yaml', line: 2, column: 20, field: 'touches' });
  expect(problem?.message).toContain('`touches` names `owner-sales`, which is an owner.');
  expect(problem?.fix).toBe("Name the owner in the feature's `owner`, and take it out of `touches`.");
});

test('reference-unknown: a step that does nothing known is one problem, with no second about its name, its data or a reply to it', () => {
  const problems = flowing(flow('flow-sale', '  - {id: asks, does: connection-aks, data: [data-order]}\n  - {id: gets, reply: asks, name: The order}\n'));
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatchObject({ rule: 'reference-unknown', line: 6, column: 22 });
  expect(problems[0]?.message).toBe('`does` of the first step names `connection-aks`, but no record has that id. The nearest id is `connection-asks`.');
});

test('the three counts: a feature alone, a step unplaced, and data and an owner that nothing names', () => {
  const counts = read(
    ...SELLING,
    file('owners/owner-sales.yaml', 'name: Sales\n'),
    file('owners/owner-shop-floor.yaml', 'name: Shop floor\n'),
    file('features/feature-returns.yaml', 'name: Returns\nowner: owner-shop-floor\n'),
    file('features/feature-stock.yaml', 'name: Stock\ntouches: [store-orders]\n'),
    flow('flow-sale', '  - {id: asks, does: connection-asks}\n  - {id: who-pays, name: Who pays}\n'),
  ).counts;
  const found = Object.fromEntries(counts.map((count) => [count.rule, [count.checked, ...count.found.map((item) => item.record)]]));
  expect(found).toEqual({ 'record-unused': [3, 'data-order', 'owner-sales'], 'part-alone': [2], 'feature-alone': [3, 'feature-returns'], 'step-unplaced': [1, 'flow-sale'] });
  expect(counts.map(countLine)).toEqual([
    '2 owners or data records that nothing names: `owner-sales`, `data-order`.',
    undefined,
    '1 feature that no flow names and that touches nothing: `feature-returns`.',
    '1 step with neither `does` nor `reply`, in `flow-sale`.',
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

  await write([...BASE, file('connections/connection-a.yaml', 'from: app-api\nto: store-orders\nvia: [app-api]\n')]);
  expect(await run(['check', `--workdir=${folder}`], '/here', io)).toBe(0);
  expect(lines).toContain('connections/connection-a.yaml:3:7: warning: `app-api` is in `via`, and it is also the `from` of this connection. A connection does not pass through its own end.');
  expect(lines.at(-1)).toBe('5 records read. 0 errors, 1 warning.');

  await write([file('stores/store-jobs.yaml', 'name: Jobs\nin: store-orders\n')]);
  lines.length = 0;
  expect(await run(['check', '--json', `--workdir=${folder}`], '/here', io)).toBe(1);
  expect(lines).toHaveLength(1);
  const json = JSON.parse(lines[0] as string);
  expect(json).toMatchObject({ records: 6, errors: 1, warnings: 1 });
  expect(json.problems.map((problem: { rule: string }) => problem.rule)).toEqual(['via-end', 'reference-wrong-kind']);
  expect(json.counts[0]).toMatchObject({ rule: 'record-unused', checked: 0 });
});

test('part-alone is a count: an app, a store or a component that no connection names, and the counts that were not made are said in one line', () => {
  const parts = [
    file('apps/app-web.yaml', 'name: Web\nin: system-shop\n'),
    file('apps/app-jobs.yaml', 'name: Jobs\nin: system-shop\n'),
    file('components/component-cart.yaml', 'name: Cart\nin: app-web\n'),
    file('components/component-mailer.yaml', 'name: Mailer\nin: app-jobs\n'),
    file('stores/store-cache.yaml', 'name: Cache\nin: system-shop\n'),
    // A connection at a component names its app too; what a connection passes through is named.
    file('connections/connection-cart-asks.yaml', 'from: component-cart\nto: app-api\nvia: [app-jobs]\n'),
  ];
  const alone = read(...parts).counts.find((count) => count.rule === 'part-alone');
  expect(alone?.found.map((item) => item.record)).toEqual(['component-mailer', 'store-cache', 'store-orders']);
  expect(alone === undefined ? undefined : countLine(alone)).toBe('3 stores or components that no connection names: `store-cache`, `store-orders`, `component-mailer`.');
  // A count is no problem: the model reads with none.
  expect(read(...parts).problems).toEqual([]);
  const broken = read(...parts, file('people/person-bob.yaml', 'name: [\n'));
  expect(countLines(broken.counts)).toEqual([
    'Not counted until the errors are mended: owners, technologies and data that nothing names; apps, stores and components that no connection names; features that no flow names and that touch nothing; steps with neither `does` nor `reply`.',
  ]);
});

