import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const RULE = file('rules/rule-orders-by-the-api', 'name: The orders are written only by the API\neach: {to: {id: store-orders}, access: [write, read-write]}\nmust: {from: {id: app-api}}\n');
/** A small shop: a customer orders through the API, which writes the orders. One rule of the team's own. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/system-shop', 'name: Shop\ndescription: Sells things online.\n'),
  file('apps/app-api', 'name: API\nin: system-shop\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('people/person-customer', 'name: Customer\n'),
  file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nname: Places an order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\n'),
  file('features/feature-ordering', 'name: Ordering\n'),
  file(
    'flows/flow-placing',
    'name: Placing an order\nstarts: A customer places an order\nends: The order is kept\nfeature: feature-ordering\nsteps:\n  - {id: places, does: connection-customer-orders}\n  - {id: saves, does: connection-api-writes-orders}\n  - {id: confirms, reply: places, name: Confirms the order}\n',
  ),
  RULE,
];
/** The shop with one change, whose body is the text given. */
const read = (body: string, model: SourceFile[] = SHOP, id = 'a-change') => readModel([...model, file(`changes/${id}`, `name: A change\nprompt: Make it so.\n${body}`)]);
const said = (body: string, model?: SourceFile[]) => read(body, model).problems.map((problem) => [problem.rule, problem.severity, problem.line, problem.message]);

test('a change with a body reads, so does an input alone, and a change is a record of the answer', () => {
  expect(readModel(SHOP).problems).toEqual([]);
  const body = [
    'add:',
    '  apps/app-worker: {name: Worker, in: system-shop}',
    '  connections/connection-api-calls-worker: {from: app-api, to: app-worker, name: Hands the order on}',
    'update:',
    '  systems/system-shop: {description: Sells things online and in shops.}',
    '  flows/flow-placing:',
    '    steps: [places, saves, {id: hands-on, does: connection-api-calls-worker}, confirms]',
    '',
  ].join('\n');
  const model = read(body);
  expect(model.problems).toEqual([]);
  const record = model.records.find((each) => each.kind === 'changes');
  expect(record?.id).toBe('a-change');
  expect(Object.keys(record?.fields ?? {})).toEqual(['name', 'prompt', 'add', 'update']);
  expect(read('').problems).toEqual([]);
  // The change is open: the model of today is what the answer holds, and its rule is judged on it.
  expect(model.records.some((each) => each.id === 'app-worker')).toBe(false);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['holds']);
});

test('a record is named by its path, a folder and an id, and a change names no change', () => {
  const body = 'add:\n  worker: {name: Worker}\n  boxes/worker: {name: Worker}\n  apps/Worker: {name: Worker}\n  changes/other: {name: Other}\nremove:\n  - apps/api.yaml\n';
  expect(said(body)).toEqual([
    ['change-path', 'error', 4, '`worker` is not the path of a record. A path is a folder and an id, as `apps/ledger`.'],
    [
      'change-path',
      'error',
      5,
      '`boxes/worker` is not the path of a record: there is no folder `boxes`. The folders are `people`, `systems`, `apps`, `stores`, `components`, `connections`, `infrastructure`, `owners`, `technologies`, `features`, `flows`, `data`, `rules` and `context`.',
    ],
    ['change-path', 'error', 6, '`apps/Worker` is not the path of a record. `Worker` is not an id: an id is written in lowercase, like `worker`.'],
    ['change-path', 'error', 7, '`changes/other` names a change. A change adds, updates and removes records of the model, and no change.'],
    ['change-path', 'error', 9, '`apps/api.yaml` is the name of a file. A path leaves `.yaml` off, as `apps/api`.'],
  ]);
});

test('a record under add is held by the shape of its folder at its own line, and a key under update is one of its kind', () => {
  expect(said('add:\n  apps/app-worker:\n    name: Worker\n    colour: red\n  stores/store-entries:\n    in: system-shop\n')).toEqual([
    ['key-missing', 'error', 5, '`in` is missing from `apps/app-worker`.'],
    ['key-unknown', 'error', 6, '`colour` is not a key of `apps/app-worker`. Its keys are `name`, `in`, `only`, `description`, `kind`, `technology` and `owner`.'],
    ['key-missing', 'error', 8, '`name` is missing from `stores/store-entries`.'],
  ]);
  expect(said('update:\n  apps/app-api:\n    colour: red\n  stores/store-orders: {}\n  systems/system-shop: Sells more.\n')).toEqual([
    ['key-unknown', 'error', 5, '`colour` is not a key of an app. Its keys are `name`, `in`, `only`, `description`, `kind`, `technology` and `owner`.'],
    ['value-too-small', 'error', 6, '`stores/store-orders` under `update` names no key.'],
    ['value-wrong-kind', 'error', 7, '`systems/system-shop` under `update` must be a mapping: the keys of the record that change.'],
  ]);
  expect(said('add: {}\n').map((each) => each[3])).toEqual(['`add` is empty.']);
  expect(said('remove: []\n').map((each) => each[3])).toEqual(['`remove` is an empty list.']);
});

test('a record is in a change once', () => {
  expect(said('add:\n  apps/app-worker: {name: Worker, in: system-shop}\nupdate:\n  apps/app-api: {description: New words.}\nremove:\n  - apps/app-api\n  - stores/app-worker\n  - people/person-customer\n  - people/person-customer\n')).toEqual([
    ['change-twice', 'error', 8, '`app-api` is in this change under `update` and under `remove`. A record is in a change once.'],
    ['change-twice', 'error', 9, '`app-worker` is in this change under `add` and under `remove`. A record is in a change once.'],
    ['change-twice', 'error', 11, '`person-customer` is in this change twice under `remove`. A record is in a change once.'],
  ]);
});

test('against the model: what a change adds is not there, and what it updates and removes is', () => {
  const body = 'add:\n  apps/app-api: {name: API, in: system-shop}\n  apps/store-orders: {name: Orders, in: system-shop}\nupdate:\n  apps/app-apy: {description: New words.}\n  stores/person-customer: {description: New words.}\nremove:\n  - connections/connection-nothing-here\n';
  expect(said(body)).toEqual([
    ['change-add-exists', 'error', 4, '`add` holds `apps/app-api`, but `apps/app-api.yaml` is there already.'],
    ['change-add-exists', 'error', 5, '`add` holds `apps/store-orders`, but `stores/store-orders.yaml` is there already.'],
    ['change-no-record', 'error', 7, '`update` names `apps/app-apy`, but no record has that id. The nearest id is `app-api`.'],
    ['change-no-record', 'error', 8, '`update` names `stores/person-customer`, but `person-customer` is in `people`.'],
    ['change-no-record', 'error', 10, '`remove` names `connections/connection-nothing-here`, but no record has that id.'],
  ]);
  expect(read(body).problems.map((problem) => problem.fix)).toEqual([
    'To change it, write it under `update`.',
    'An id names one record in the whole model, whatever its folder. Give the new record another id.',
    'Use the path of a record that is there, or, if the record is new, write it whole under `add`.',
    'Write `people/person-customer`.',
    'Use the path of a record that is there, or take the line out.',
  ]);
});

test('a key that changes nothing is a warning, and a bare step id is a step the flow has', () => {
  expect(said('update:\n  systems/system-shop:\n    description: Sells things online.\n    owner: null\n  flows/flow-placing:\n    steps: [places, pays, confirms]\n')).toEqual([
    ['change-no-effect', 'warning', 5, '`description` of `systems/system-shop` under `update` is what the record says already.'],
    ['change-no-effect', 'warning', 6, '`update` takes `owner` out of `systems/system-shop`, but the record has no `owner`.'],
    ['change-step-unknown', 'error', 8, '`steps` of `flows/flow-placing` names the step `pays`, but the flow has no step with that id.'],
  ]);
  // The steps as they are today, written by their ids, change nothing either.
  expect(said('update:\n  flows/flow-placing:\n    steps: [places, saves, confirms]\n').map((each) => each[0])).toEqual(['change-no-effect']);
});

test('the model as it would be is read by the whole check, and what it finds is told at the change', () => {
  // A record that goes while a step still names it.
  expect(said('remove:\n  - connections/connection-api-writes-orders\n')).toEqual([
    ['reference-unknown', 'error', 4, 'With this change, `flows/flow-placing`: `does` of the second step names `connection-api-writes-orders`, but no record has that id.'],
    ['rule-looks-at-nothing', 'warning', 4, 'With this change, `rules/rule-orders-by-the-api`: `each` chooses no record, so the rule looks at nothing.'],
  ]);
  // A new record that names nothing, at the key at fault; and a key taken out that the shape needs.
  expect(said('add:\n  apps/app-worker:\n    name: Worker\n    in: system-shopp\nupdate:\n  stores/store-orders:\n    name: null\n')).toEqual([
    ['reference-unknown', 'error', 6, 'With this change, `apps/app-worker`: `in` names `system-shopp`, but no record has that id. The nearest id is `system-shop`.'],
    ['key-missing', 'error', 9, 'With this change, `stores/store-orders`: `name` is missing from a store.'],
  ]);
});

test('a flow gains a step, loses one and keeps the rest by their ids', () => {
  // The step that named the connection goes with it, and the reply still finds the step it answers.
  const gone = 'remove:\n  - connections/connection-api-writes-orders\n  - rules/rule-orders-by-the-api\nupdate:\n  flows/flow-placing:\n    steps:\n      - places\n      - {id: checks, does: app-api, name: Checks the stock}\n      - confirms\n';
  expect(said(gone)).toEqual([]);
  // With the step kept by its id, it still names what is removed.
  expect(said(gone.replace('      - places\n', '      - places\n      - saves\n')).map((each) => [each[0], each[3]])).toEqual([
    ['reference-unknown', 'With this change, `flows/flow-placing`: `does` of the second step names `connection-api-writes-orders`, but no record has that id.'],
  ]);
  // A reply before the step it answers: the order of the list is the order after.
  expect(said('update:\n  flows/flow-placing:\n    steps: [confirms, places, saves]\n').map((each) => each[0])).toEqual(['step-earlier']);
});

test('a rule of the team that a change breaks is told at the record that breaks it, and a debt it pays is told', () => {
  const adds = 'add:\n  apps/app-worker: {name: Worker, in: system-shop}\n  connections/connection-worker-writes-orders: {from: app-worker, to: store-orders, access: write}\n';
  expect(said(adds)).toEqual([
    ['rules/rule-orders-by-the-api', 'error', 5, 'With this change, `connections/connection-worker-writes-orders`: `connection-worker-writes-orders` breaks the rule `rule-orders-by-the-api`: The orders are written only by the API.'],
  ]);
  // A model where the worker writes the orders already, as a debt of the rule: taking the worker's write out pays it.
  const debt = [
    ...SHOP.filter((each) => each !== RULE),
    file('apps/app-worker', 'name: Worker\nin: system-shop\n'),
    file('connections/connection-worker-writes-orders', 'from: app-worker\nto: store-orders\naccess: write\n'),
    file('rules/rule-orders-by-the-api', `${RULE.text}debt: [connection-worker-writes-orders]\n`),
  ];
  expect(readModel(debt).problems).toEqual([]);
  expect(said('remove:\n  - connections/connection-worker-writes-orders\n', debt).map((each) => [each[0], each[3]])).toEqual([
    ['reference-unknown', 'With this change, `rules/rule-orders-by-the-api`: `debt` names `connection-worker-writes-orders`, but no record has that id.'],
  ]);
  expect(said('remove:\n  - connections/connection-worker-writes-orders\nupdate:\n  rules/rule-orders-by-the-api: {debt: null}\n', debt)).toEqual([]);
});

test('the answer keeps what the check read from the model as it would be: the records a change adds and updates, whole', () => {
  const body = [
    'add:',
    '  apps/app-worker: {name: Worker, in: system-shop}',
    'update:',
    '  systems/system-shop: {description: null}',
    '  apps/app-api: {description: Takes the orders.}',
    '  flows/flow-placing:',
    '    steps: [places, {id: checks, does: app-api, name: Checks the stock}, confirms]',
    'remove:',
    '  - rules/rule-orders-by-the-api',
    '',
  ].join('\n');
  const model = read(body);
  expect(model.problems).toEqual([]);
  expect(model.laid.map((each) => each.change)).toEqual(['a-change']);
  const laid = new Map(model.laid[0]?.records.map((record) => [`${record.kind}/${record.id}`, record.fields]));
  // What the change removes is not among them, and nothing the change does not write.
  expect([...laid.keys()]).toEqual(['apps/app-api', 'apps/app-worker', 'flows/flow-placing', 'systems/system-shop']);
  expect(laid.get('apps/app-worker')).toEqual({ name: 'Worker', in: 'system-shop' });
  expect(laid.get('apps/app-api')).toEqual({ name: 'API', in: 'system-shop', description: 'Takes the orders.' });
  expect(laid.get('systems/system-shop')).toEqual({ name: 'Shop' });
  // A bare step id is today's whole step, and a step left out is gone.
  expect(laid.get('flows/flow-placing')?.steps).toEqual([
    { id: 'places', does: 'connection-customer-orders' },
    { id: 'checks', does: 'app-api', name: 'Checks the stock' },
    { id: 'confirms', reply: 'places', name: 'Confirms the order' },
  ]);
  // An input alone is laid and writes no record; a change with an error of its own is not laid; a model with no change lays none.
  expect(read('').laid).toEqual([{ change: 'a-change', records: [] }]);
  expect(read('add:\n  apps/app-api: {name: API, in: system-shop}\n').laid).toEqual([]);
  expect(readModel(SHOP).laid).toEqual([]);
});

test('a faulty change stops nothing else, and the id of a change is its own', () => {
  const model = read('add:\n  worker: {name: Worker}\n');
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.record])).toEqual([['change-path', 'changes/a-change.yaml', 'a-change']]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([['rule-orders-by-the-api', 'holds']]);
  // A change may have the id of a record, as one named for the part it adds: the rule that names `app-api` is judged all the same.
  const named = read('', SHOP, 'app-api');
  expect(named.problems).toEqual([]);
  expect(named.rulings.map((ruling) => ruling.state)).toEqual(['holds']);
  // Two changes are held each alone against the model: both may add the same record.
  const both = readModel([...SHOP, file('changes/one', 'name: One\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop}\n'), file('changes/two', 'name: Two\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop}\n')]);
  expect(both.problems).toEqual([]);
});
