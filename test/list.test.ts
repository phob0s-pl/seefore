import { expect, test } from 'vitest';
import { listLines } from '../src/model/list.ts';
import type { ListAsked } from '../src/model/list.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const review = (id: string, points: string[]): SourceFile => file(`reviews/${id}`, ['read: "4c1d9a70"', 'points:', ...points, ''].join('\n'));
const point = (id: string, severity: 'block' | 'note', status?: string): string[] => [
  `  ${id}:`,
  `    name: Point ${id}`,
  `    severity: ${severity}`,
  '    about: [need]',
  '    finding: Something is wrong.',
  ...(status !== undefined ? [`    status: ${status}`] : []),
];
/**
 * A shop with a flow, a rule and a line of context; a change that adds a ledger, updates the API
 * and removes the clerk; a change the check cannot lay; and three changes that are an input alone,
 * each with a review that waits for somebody else.
 */
const MODEL: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('people/person-customer', 'name: Customer\n'),
  file('people/person-clerk', 'name: Clerk\n'),
  file('systems/system-shop', 'name: Shop\n'),
  file('apps/app-api', 'name: API\nin: system-shop\nkind: service\ntechnology: [tech-go]\nsource: [api/, api/main.go]\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nname: Places an order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\n'),
  file('technologies/tech-go', 'name: Go\n'),
  file('features/feature-ordering', 'name: Ordering\n'),
  file(
    'flows/flow-placing',
    'name: Placing an order\nstarts: A customer orders\nends: The order is kept\nfeature: feature-ordering\nsteps:\n  - {id: places, does: connection-customer-orders}\n  - {id: checks, does: app-api, name: Checks the stock}\n',
  ),
  file('rules/rule-api-in-go', 'name: The API is written in Go\neach: {id: app-api}\nmust: {technology: tech-go}\n'),
  file('context/context-one-host', 'must: All of it runs on one host.\nwhy: The budget is fixed for a year.\nsystem: system-shop\n'),
  file(
    'changes/ledger',
    ['name: A ledger', 'prompt: Keep a ledger of the orders.', 'add:', '  stores/store-ledger: {name: Ledger, in: system-shop, kind: database}', 'update:', '  apps/app-api: {description: Takes the orders and keeps a ledger.}', 'remove: [people/person-clerk]', ''].join('\n'),
  ),
  file('changes/broken', 'name: A broken change\nprompt: Change what is not there.\nupdate:\n  apps/app-nothing: {name: Nothing}\n'),
  file('changes/fixing', 'name: Fixing\nprompt: Fix it.\n'),
  file('changes/waiting', 'name: Waiting\nprompt: Wait.\n'),
  file('changes/done', 'name: Done\nprompt: Done.\n'),
  review('ledger', [...point('one', 'block'), ...point('two', 'block'), ...point('three', 'note'), ...point('four', 'block', 'fixed')]),
  review('fixing', [...point('one', 'block', 'fixed'), ...point('two', 'block', 'declined')]),
  review('waiting', [...point('one', 'block', 'declined'), ...point('two', 'block', 'reopened'), ...point('three', 'note')]),
  review('done', [...point('one', 'block', 'closed'), ...point('two', 'note')]),
];
const model = readModel(MODEL);
const lines = (asked: ListAsked): string[] => {
  const listed = listLines(model, asked);
  if ('error' in listed) throw new Error(listed.error);
  return listed.lines;
};
const error = (asked: ListAsked): string | undefined => {
  const listed = listLines(model, asked);
  return 'error' in listed ? listed.error : undefined;
};

test('the model is as the tests take it: only the broken change is faulted, and every other is laid', () => {
  expect(model.problems.map((problem) => problem.file)).toEqual(['changes/broken.yaml']);
  expect(model.laid.map((laid) => laid.change)).toEqual(['done', 'fixing', 'ledger', 'waiting']);
});

test('a line a record, in the order of the folders and then of the ids: its path, its name, what it is in or its two ends or its feature, its kind and its source', () => {
  expect(lines({})).toEqual([
    'people/person-clerk  Clerk',
    'people/person-customer  Customer',
    'systems/system-shop  Shop',
    'apps/app-api  API  in system-shop  service  api/, api/main.go',
    'stores/store-orders  Orders  in system-shop  database',
    'connections/connection-api-writes-orders  No name  app-api -> store-orders',
    'connections/connection-customer-orders  Places an order  person-customer -> app-api',
    'technologies/tech-go  Go',
    'features/feature-ordering  Ordering',
    'flows/flow-placing  Placing an order  feature-ordering  2 steps',
    'rules/rule-api-in-go  The API is written in Go',
    'context/context-one-host  All of it runs on one host.',
  ]);
});

test('some folders alone; a folder that is not there is an error that names the folders', () => {
  expect(lines({ folders: ['connections', 'apps'] })).toEqual([
    'apps/app-api  API  in system-shop  service  api/, api/main.go',
    'connections/connection-api-writes-orders  No name  app-api -> store-orders',
    'connections/connection-customer-orders  Places an order  person-customer -> app-api',
  ]);
  expect(error({ folders: ['apps', 'app'] })).toBe(
    '`app` is not a folder of the model. The nearest is `apps`. The folders are `people`, `systems`, `apps`, `stores`, `components`, `connections`, `infrastructure`, `owners`, `technologies`, `features`, `flows`, `data`, `rules` and `context`, and `changes` lists the changes.',
  );
  // A review is no record of the model; the folder `changes` alone is the list of the changes.
  expect(error({ folders: ['reviews'] })).toMatch(/^`reviews` holds no records of the model\./);
  expect(lines({ folders: ['changes'] })).toEqual(lines({ changes: true }));
});

test('near a record: its line, what it names, and what names it, a flow by its step and a rule by its selector among them', () => {
  expect(lines({ near: 'app-api' })).toEqual([
    'apps/app-api  API  in system-shop  service  api/, api/main.go',
    'names:',
    '  systems/system-shop  Shop',
    '  technologies/tech-go  Go',
    'named by:',
    '  connections/connection-api-writes-orders  No name  app-api -> store-orders',
    '  connections/connection-customer-orders  Places an order  person-customer -> app-api',
    '  flows/flow-placing  Placing an order  feature-ordering  2 steps',
    '  rules/rule-api-in-go  The API is written in Go',
  ]);
  // A section with nothing in it is left out; a record may be asked for by its path too.
  expect(lines({ near: 'tech-go' })).toEqual(['technologies/tech-go  Go', 'named by:', '  apps/app-api  API  in system-shop  service  api/, api/main.go', '  rules/rule-api-in-go  The API is written in Go']);
  expect(lines({ near: 'people/person-clerk' })).toEqual(['people/person-clerk  Clerk']);
  // The folders asked for keep what is near.
  expect(lines({ near: 'app-api', folders: ['flows'] })).toEqual(['apps/app-api  API  in system-shop  service  api/, api/main.go', 'named by:', '  flows/flow-placing  Placing an order  feature-ordering  2 steps']);
  expect(error({ near: 'app-apu' })).toBe('No record has the id `app-apu`. The nearest id is `app-api`.');
  expect(error({ near: 'app-elsewhere' })).toBe('No record has the id `app-elsewhere`.');
});

test('the model as a change would make it: each record it adds, updates and removes marked, the one it removes still listed', () => {
  expect(lines({ change: 'ledger' })).toEqual([
    '- people/person-clerk  Clerk',
    '  people/person-customer  Customer',
    '  systems/system-shop  Shop',
    '~ apps/app-api  API  in system-shop  service  api/, api/main.go',
    '+ stores/store-ledger  Ledger  in system-shop  database',
    '  stores/store-orders  Orders  in system-shop  database',
    '  connections/connection-api-writes-orders  No name  app-api -> store-orders',
    '  connections/connection-customer-orders  Places an order  person-customer -> app-api',
    '  technologies/tech-go  Go',
    '  features/feature-ordering  Ordering',
    '  flows/flow-placing  Placing an order  feature-ordering  2 steps',
    '  rules/rule-api-in-go  The API is written in Go',
    '  context/context-one-host  All of it runs on one host.',
  ]);
  expect(lines({ change: 'ledger', folders: ['stores', 'people'] })).toEqual(['- people/person-clerk  Clerk', '  people/person-customer  Customer', '+ stores/store-ledger  Ledger  in system-shop  database', '  stores/store-orders  Orders  in system-shop  database']);
  // A record the change adds is near only with the change.
  expect(lines({ change: 'ledger', near: 'store-ledger' })).toEqual(['+ stores/store-ledger  Ledger  in system-shop  database', 'names:', '    systems/system-shop  Shop']);
  expect(error({ near: 'store-ledger' })).toBe('No record has the id `store-ledger`.');
  expect(lines({ change: 'ledger', near: 'system-shop', folders: ['stores'] })).toEqual([
    '  systems/system-shop  Shop',
    'named by:',
    '  + stores/store-ledger  Ledger  in system-shop  database',
    '    stores/store-orders  Orders  in system-shop  database',
  ]);
  expect(error({ change: 'ledgr' })).toBe('There is no change `ledgr`. The nearest is `ledger`.');
  expect(error({ change: 'elsewhere' })).toBe('There is no change `elsewhere`. The changes are `broken`, `done`, `fixing`, `ledger` and `waiting`.');
  expect(error({ change: 'broken' })).toBe(
    'The check could not lay the change `broken` over the model, so the model as it would be is not known. Run `seefore check` and mend changes/broken.yaml.',
  );
});

test('a line a change, with who is next from its blocks; a note waits for nobody', () => {
  expect(lines({ changes: true })).toEqual([
    'changes/broken  A broken change  no review',
    'changes/done  Done  nothing open',
    'changes/fixing  Fixing  the second reading: 1 fixed',
    'changes/ledger  A ledger  the corrector: 2 open',
    'changes/waiting  Waiting  the person: 1 declined, 1 reopened',
  ]);
  expect(error({ changes: true, near: 'app-api' })).toBe('The changes are listed alone, with no record near and no change laid over the model.');
  expect(listLines(readModel(MODEL.filter((each) => !each.path.startsWith('changes/'))), { changes: true })).toEqual({ lines: [] });
});
