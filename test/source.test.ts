import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listLines } from '../src/model/list.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { renameRecords } from '../src/model/rename.ts';
import { readFolder } from '../src/server/files.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/system-shop', 'name: Shop\n'),
  file('apps/app-api', 'name: API\nin: system-shop\nsource: [api/main.go, api/]\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\nsource:\n  - db/schema.sql\n'),
  file('components/component-cart', 'name: Cart\nin: app-api\nsource: [api/cart/]\n'),
  file('infrastructure/infra-proxy', 'name: Proxy\nin: system-shop\nsource: [deploy/proxy.conf]\n'),
];
const said = (...files: SourceFile[]) => readModel([...SHOP, ...files]).problems.map((problem) => [problem.rule, problem.file, problem.line, problem.message]);
/** A flow of the shop whose steps are given as lines of YAML, with its feature. */
const buying = (...steps: string[]): SourceFile[] => [
  file('features/feature-buying', 'name: Buying\n'),
  file('flows/flow-buying', ['name: Buying', 'starts: A customer buys', 'ends: It is bought', 'feature: feature-buying', 'steps:', ...steps, ''].join('\n')),
];

test('source is one to three paths of the code on a part, held by its form', () => {
  expect(readModel(SHOP).problems).toEqual([]);
  expect(readModel(SHOP).records.find((record) => record.id === 'app-api')?.fields.source).toEqual(['api/main.go', 'api/']);
  const path = 'A path in `source` is a file or a folder of the code, written with `/`, with no `..`, no `*` and no `/` at its start.';
  expect(said(file('apps/app-web', 'name: Web\nin: system-shop\nsource: [../web, /srv/web, "web/*.ts"]\n'))).toEqual([
    ['value-invalid', 'apps/app-web.yaml', 3, path],
    ['value-invalid', 'apps/app-web.yaml', 3, path],
    ['value-invalid', 'apps/app-web.yaml', 3, path],
  ]);
  // No path twice, at most three, and never an empty list.
  expect(said(file('apps/app-web', 'name: Web\nin: system-shop\nsource: [web/, web/]\n')).map((each) => each[3])).toEqual(['`source` has the same path twice. Keep one.']);
  expect(said(file('apps/app-web', 'name: Web\nin: system-shop\nsource: [a, b, c, d]\n')).length).toBe(1);
  expect(said(file('apps/app-web', 'name: Web\nin: system-shop\nsource: []\n')).length).toBe(1);
  // A system, a person and a connection have no code of their own to name.
  expect(said(file('people/person-clerk', 'name: Clerk\nsource: [docs/]\n')).map((each) => each[0])).toEqual(['key-unknown']);
});

test('source-gone: a path that is not there is a warning at the path, and the check of texts alone asks nothing', () => {
  const there = new Set(['api/main.go', 'api/', 'api/cart/', 'deploy/proxy.conf']);
  const model = readModel(SHOP, { exists: (path) => there.has(path) });
  expect(model.problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.line, problem.column, problem.record, problem.message])).toEqual([
    ['source-gone', 'warning', 'stores/store-orders.yaml', 5, 5, 'store-orders', '`source` names `db/schema.sql`, which is not there.'],
  ]);
  expect(model.problems[0]?.fix).toBe("Write the path where the code is now, counted from the folder that holds the model's folder, or take it out of `source`.");
  // The record is still read, and a model with no disk to ask has no such warning.
  expect(model.records.some((record) => record.id === 'store-orders')).toBe(true);
  expect(readModel(SHOP).problems).toEqual([]);
});

test('a record that a change adds is held the same way, at the change', () => {
  const change = file('changes/a-worker', 'name: A worker\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop, source: [worker/main.go, api/]}\n');
  const model = readModel([...SHOP, change], { exists: (path) => path !== 'worker/main.go' });
  expect(model.problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.message])).toEqual([
    ['source-gone', 'warning', 'changes/a-worker.yaml', 'With this change, `apps/app-worker`: `source` names `worker/main.go`, which is not there.'],
  ]);
});

test('on the disk a path is counted from the folder that holds the model, and a rename leaves it as it is', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seefore-'));
  for (const each of SHOP) {
    await mkdir(join(root, 'architecture', each.path, '..'), { recursive: true });
    await writeFile(join(root, 'architecture', each.path), each.text);
  }
  await mkdir(join(root, 'api', 'cart'), { recursive: true });
  await writeFile(join(root, 'api', 'main.go'), 'package main\n');
  const read = await readFolder(join(root, 'architecture'));
  // `api/main.go`, `api/` and `api/cart/` are there; the schema and the proxy's file are not.
  expect(read.problems.map((problem) => [problem.rule, problem.file, problem.message.split('`')[3]])).toEqual([
    ['source-gone', 'infrastructure/infra-proxy.yaml', 'deploy/proxy.conf'],
    ['source-gone', 'stores/store-orders.yaml', 'db/schema.sql'],
  ]);
  // A path is no id: renaming the app whose folder bears its old name changes no path.
  const renamed = renameRecords(SHOP, [{ old: 'app-api', new: 'app-backend' }]);
  expect('files' in renamed && renamed.files.find((each) => each.path === 'apps/app-backend.yaml')?.text).toBe('name: API\nin: system-shop\nsource: [api/main.go, api/]\n');
  expect('files' in renamed && renamed.files.find((each) => each.path === 'components/component-cart.yaml')?.text).toBe('name: Cart\nin: app-backend\nsource: [api/cart/]\n');
  // So on a step: its `does` follows the new id, and a path that holds the old one stays as it is.
  const steps = renameRecords([...SHOP, ...buying('  - {id: keeps, does: app-api, name: Keeps the order, source: [services/app-api/keep.go]}')], [{ old: 'app-api', new: 'app-backend' }]);
  expect('files' in steps && steps.files.find((each) => each.path === 'flows/flow-buying.yaml')?.text).toContain('\n  - {id: keeps, does: app-backend, name: Keeps the order, source: [services/app-api/keep.go]}\n');
});

test('the check names what a list holds, and says that a key of one value may only be that', () => {
  // Found in the first round of the skill `model`: "Take ids out of `source`", and "`opens` must be one of `to`".
  const fixes = (...files: SourceFile[]) => readModel([...SHOP, ...files]).problems.map((problem) => [problem.rule, problem.message, problem.fix]);
  expect(fixes(file('apps/app-web', 'name: Web\nin: system-shop\nsource: [a, b, c, d]\n'))).toEqual([
    ['value-too-big', '`source` is too long a list: it may have at most 3.', 'Take paths out of `source` until it has at most 3.'],
  ]);
  expect(fixes(file('apps/app-web', 'name: Web\nin: system-shop\nsource: []\n')).map((each) => each[2])).toEqual(['Give `source` at least one path, or delete the key.']);
  expect(fixes(file('connections/connection-web-calls-api', 'from: app-api\nto: app-api\nopens: from\n')).map((each) => each[1])).toEqual(['`opens` may only be `to`. Otherwise take the key out.']);
  expect(fixes(file('systems/system-bank', 'name: Bank\nexternal: yes\n')).map((each) => each[1])).toEqual(['`external` may only be `true`. Otherwise take the key out.']);
  // A part may talk to its own copies, and two connections may join the same two parts, one for each purpose.
  expect(fixes(file('connections/connection-api-syncs-api', 'from: app-api\nto: app-api\nname: Syncs with its copies\n'), file('connections/connection-api-reads-orders', 'from: app-api\nto: store-orders\naccess: read\nname: Reads orders\n'), file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves orders\n'))).toEqual([]);
});

test('a connection says where the code shows it, and its path is held as the others are', () => {
  const saves = file('connections/connection-api-saves-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves orders\nsource: [api/orders.go]\n');
  expect(readModel([...SHOP, saves]).problems).toEqual([]);
  const gone = readModel([...SHOP, saves], { exists: (path) => path !== 'api/orders.go' });
  expect(gone.problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.message])).toEqual([
    ['source-gone', 'warning', 'connections/connection-api-saves-orders.yaml', '`source` names `api/orders.go`, which is not there.'],
  ]);
  // A connection is shown by a file: a folder that is there is a warning of its own, and on a part a folder is right.
  const wide = file('connections/connection-api-reads-orders', 'from: app-api\nto: store-orders\naccess: read\nsource: [api/]\n');
  const folders = readModel([...SHOP, wide], { exists: () => true, folder: (path) => path.endsWith('/') });
  expect(folders.problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.message, problem.fix])).toEqual([
    ['source-folder', 'warning', 'connections/connection-api-reads-orders.yaml', '`source` of a connection names the folder `api/`: a folder shows no connection.', 'Name the file in it where the code or config of `from` names `to`, or take the path out of `source`.'],
  ]);
  // The list shows it at the end of the connection's line, and a key of one value says how to mend it.
  const listed = listLines(readModel([...SHOP, saves]), { folders: ['connections'] });
  expect('lines' in listed && listed.lines).toEqual(['connections/connection-api-saves-orders  Saves orders  app-api -> store-orders  api/orders.go']);
  const opens = readModel([...SHOP, file('connections/connection-api-calls-api', 'from: app-api\nto: app-api\nopens: from\n')]).problems;
  expect(opens.map((problem) => problem.fix)).toEqual(['Write `to`, or delete the key.']);
});

test("a step says where the code does it: its paths are read, held by the same form, and it stands on a step with neither `does` nor `reply` too", () => {
  const good = buying('  - {id: adds, does: component-cart, name: Adds the tea, source: [api/cart/add.go]}', '  - {id: tells, name: Tells the customer, source: [web/told.ts, web/mail.ts]}');
  expect(readModel([...SHOP, ...good]).problems).toEqual([]);
  const steps = readModel([...SHOP, ...good]).records.find((record) => record.id === 'flow-buying')?.fields.steps as { source?: unknown }[];
  expect(steps.map((step) => step.source)).toEqual([['api/cart/add.go'], ['web/told.ts', 'web/mail.ts']]);
  // A path with `..` is an error at its line, and so is one with `/` at its start; the list is held as a part's is.
  const path = 'A path in `source` is a file or a folder of the code, written with `/`, with no `..`, no `*` and no `/` at its start.';
  expect(said(...buying('  - id: adds', '    does: component-cart', '    name: Adds the tea', '    source:', '      - ../web/add.go', '      - /srv/add.go'))).toEqual([
    ['value-invalid', 'flows/flow-buying.yaml', 10, path],
    ['value-invalid', 'flows/flow-buying.yaml', 11, path],
  ]);
  expect(said(...buying('  - {id: adds, does: component-cart, name: Adds the tea, source: [a, b, c, d]}')).map((each) => each[3])).toEqual(['`source` of the first step is too long a list: it may have at most 3.']);
});

test('source-gone and source-folder on a step: said by its address, each at the line of its path; a step with no `source` gives none', () => {
  const steps = buying(
    '  - {id: adds, does: component-cart, name: Adds the tea, source: [api/cart/add.go]}',
    '  - {id: keeps, does: app-api, name: Keeps the order}',
    '  - id: tells',
    '    name: Tells the customer',
    '    source:',
    '      - web/told.ts',
    '      - api/cart/',
  );
  const there = new Set(['api/main.go', 'api/', 'api/cart/', 'deploy/proxy.conf', 'db/schema.sql', 'api/cart/add.go']);
  const model = readModel([...SHOP, ...steps], { exists: (path) => there.has(path), folder: (path) => path.endsWith('/') });
  expect(model.problems.map((problem) => [problem.rule, problem.severity, problem.file, problem.line, problem.column, problem.record, problem.field, problem.message, problem.fix])).toEqual([
    [
      'source-gone',
      'warning',
      'flows/flow-buying.yaml',
      11,
      9,
      'flow-buying',
      'steps',
      '`source` of step `flow-buying#tells` names `web/told.ts`, which is not there.',
      "Write the path where the code is now, counted from the folder that holds the model's folder, or take it out of the step's `source`.",
    ],
    ['source-folder', 'warning', 'flows/flow-buying.yaml', 12, 9, 'flow-buying', 'steps', '`source` of step `flow-buying#tells` names the folder `api/cart/`: a folder shows no step.', 'Name the file in it where the code does this step, or take the path out of `source`.'],
  ]);
  // A flow that a change adds is held the same way, at the change.
  const change = file('changes/a-flow', 'name: A flow\nprompt: Add a flow.\nadd:\n  features/feature-paying: {name: Paying}\n  flows/flow-paying:\n    name: Paying\n    starts: A customer pays\n    ends: It is paid\n    feature: feature-paying\n    steps:\n      - {id: pays, does: app-api, name: Takes the money, source: [api/pay.go]}\n');
  expect(readModel([...SHOP, change], { exists: (path) => path !== 'api/pay.go' }).problems.map((problem) => [problem.rule, problem.file, problem.message])).toEqual([
    ['source-gone', 'changes/a-flow.yaml', 'With this change, `flows/flow-paying`: `source` of step `flow-paying#pays` names `api/pay.go`, which is not there.'],
  ]);
});
