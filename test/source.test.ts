import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
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
});
