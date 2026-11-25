import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const RULE = file('rules/orders-by-the-api', 'name: The orders are written only by the API\neach: {to: {id: orders}, access: [write, read-write]}\nmust: {from: {id: api}}\n');
/** A small shop: a customer orders through the API, which writes the orders. One rule of the team's own. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/shop', 'name: Shop\ndescription: Sells things online.\n'),
  file('apps/api', 'name: API\nin: shop\n'),
  file('stores/orders', 'name: Orders\nin: shop\nkind: database\n'),
  file('people/customer', 'name: Customer\n'),
  file('connections/customer-orders', 'from: customer\nto: api\nname: Places an order\n'),
  file('connections/api-writes-orders', 'from: api\nto: orders\naccess: write\nname: Saves the order\n'),
  file('features/ordering', 'name: Ordering\n'),
  file(
    'flows/placing',
    'name: Placing an order\nstarts: A customer places an order\nends: The order is kept\nfeature: ordering\nsteps:\n  - {id: places, does: customer-orders}\n  - {id: saves, does: api-writes-orders}\n  - {id: confirms, reply: places, name: Confirms the order}\n',
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
    '  apps/worker: {name: Worker, in: shop}',
    '  connections/api-calls-worker: {from: api, to: worker, name: Hands the order on}',
    'update:',
    '  systems/shop: {description: Sells things online and in shops.}',
    '  flows/placing:',
    '    steps: [places, saves, {id: hands-on, does: api-calls-worker}, confirms]',
    '',
  ].join('\n');
  const model = read(body);
  expect(model.problems).toEqual([]);
  const record = model.records.find((each) => each.kind === 'changes');
  expect(record?.id).toBe('a-change');
  expect(Object.keys(record?.fields ?? {})).toEqual(['name', 'prompt', 'add', 'update']);
  expect(read('').problems).toEqual([]);
  // The change is open: the model of today is what the answer holds, and its rule is judged on it.
  expect(model.records.some((each) => each.id === 'worker')).toBe(false);
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
  expect(said('add:\n  apps/worker:\n    name: Worker\n    colour: red\n  stores/entries:\n    in: shop\n')).toEqual([
    ['key-missing', 'error', 5, '`in` is missing from `apps/worker`.'],
    ['key-unknown', 'error', 6, '`colour` is not a key of `apps/worker`. Its keys are `name`, `in`, `only`, `description`, `kind`, `technology` and `owner`.'],
    ['key-missing', 'error', 8, '`name` is missing from `stores/entries`.'],
  ]);
  expect(said('update:\n  apps/api:\n    colour: red\n  stores/orders: {}\n  systems/shop: Sells more.\n')).toEqual([
    ['key-unknown', 'error', 5, '`colour` is not a key of an app. Its keys are `name`, `in`, `only`, `description`, `kind`, `technology` and `owner`.'],
    ['value-too-small', 'error', 6, '`stores/orders` under `update` names no key.'],
    ['value-wrong-kind', 'error', 7, '`systems/shop` under `update` must be a mapping: the keys of the record that change.'],
  ]);
  expect(said('add: {}\n').map((each) => each[3])).toEqual(['`add` is empty.']);
  expect(said('remove: []\n').map((each) => each[3])).toEqual(['`remove` is an empty list.']);
});

test('a record is in a change once', () => {
  expect(said('add:\n  apps/worker: {name: Worker, in: shop}\nupdate:\n  apps/api: {description: New words.}\nremove:\n  - apps/api\n  - stores/worker\n  - people/customer\n  - people/customer\n')).toEqual([
    ['change-twice', 'error', 8, '`api` is in this change under `update` and under `remove`. A record is in a change once.'],
    ['change-twice', 'error', 9, '`worker` is in this change under `add` and under `remove`. A record is in a change once.'],
    ['change-twice', 'error', 11, '`customer` is in this change twice under `remove`. A record is in a change once.'],
  ]);
});

test('against the model: what a change adds is not there, and what it updates and removes is', () => {
  const body = 'add:\n  apps/api: {name: API, in: shop}\n  apps/orders: {name: Orders, in: shop}\nupdate:\n  apps/apy: {description: New words.}\n  stores/customer: {description: New words.}\nremove:\n  - connections/nothing-here\n';
  expect(said(body)).toEqual([
    ['change-add-exists', 'error', 4, '`add` holds `apps/api`, but `apps/api.yaml` is there already.'],
    ['change-add-exists', 'error', 5, '`add` holds `apps/orders`, but `stores/orders.yaml` is there already.'],
    ['change-no-record', 'error', 7, '`update` names `apps/apy`, but no record has that id. The nearest id is `api`.'],
    ['change-no-record', 'error', 8, '`update` names `stores/customer`, but `customer` is in `people`.'],
    ['change-no-record', 'error', 10, '`remove` names `connections/nothing-here`, but no record has that id.'],
  ]);
  expect(read(body).problems.map((problem) => problem.fix)).toEqual([
    'To change it, write it under `update`.',
    'An id names one record in the whole model, whatever its folder. Give the new record another id.',
    'Use the path of a record that is there, or, if the record is new, write it whole under `add`.',
    'Write `people/customer`.',
    'Use the path of a record that is there, or take the line out.',
  ]);
});

test('a key that changes nothing is a warning, and a bare step id is a step the flow has', () => {
  expect(said('update:\n  systems/shop:\n    description: Sells things online.\n    owner: null\n  flows/placing:\n    steps: [places, pays, confirms]\n')).toEqual([
    ['change-no-effect', 'warning', 5, '`description` of `systems/shop` under `update` is what the record says already.'],
    ['change-no-effect', 'warning', 6, '`update` takes `owner` out of `systems/shop`, but the record has no `owner`.'],
    ['change-step-unknown', 'error', 8, '`steps` of `flows/placing` names the step `pays`, but the flow has no step with that id.'],
  ]);
  // The steps as they are today, written by their ids, change nothing either.
  expect(said('update:\n  flows/placing:\n    steps: [places, saves, confirms]\n').map((each) => each[0])).toEqual(['change-no-effect']);
});

test('the model as it would be is read by the whole check, and what it finds is told at the change', () => {
  // A record that goes while a step still names it.
  expect(said('remove:\n  - connections/api-writes-orders\n')).toEqual([
    ['reference-unknown', 'error', 4, 'With this change, `flows/placing`: `does` of the second step names `api-writes-orders`, but no record has that id.'],
    ['rule-looks-at-nothing', 'warning', 4, 'With this change, `rules/orders-by-the-api`: `each` chooses no record, so the rule looks at nothing.'],
  ]);
  // A new record that names nothing, at the key at fault; and a key taken out that the shape needs.
  expect(said('add:\n  apps/worker:\n    name: Worker\n    in: shopp\nupdate:\n  stores/orders:\n    name: null\n')).toEqual([
    ['reference-unknown', 'error', 6, 'With this change, `apps/worker`: `in` names `shopp`, but no record has that id. The nearest id is `shop`.'],
    ['key-missing', 'error', 9, 'With this change, `stores/orders`: `name` is missing from a store.'],
  ]);
});

test('a flow gains a step, loses one and keeps the rest by their ids', () => {
  // The step that named the connection goes with it, and the reply still finds the step it answers.
  const gone = 'remove:\n  - connections/api-writes-orders\n  - rules/orders-by-the-api\nupdate:\n  flows/placing:\n    steps:\n      - places\n      - {id: checks, does: api, name: Checks the stock}\n      - confirms\n';
  expect(said(gone)).toEqual([]);
  // With the step kept by its id, it still names what is removed.
  expect(said(gone.replace('      - places\n', '      - places\n      - saves\n')).map((each) => [each[0], each[3]])).toEqual([
    ['reference-unknown', 'With this change, `flows/placing`: `does` of the second step names `api-writes-orders`, but no record has that id.'],
  ]);
  // A reply before the step it answers: the order of the list is the order after.
  expect(said('update:\n  flows/placing:\n    steps: [confirms, places, saves]\n').map((each) => each[0])).toEqual(['step-earlier']);
});

test('a rule of the team that a change breaks is told at the record that breaks it, and a debt it pays is told', () => {
  const adds = 'add:\n  apps/worker: {name: Worker, in: shop}\n  connections/worker-writes-orders: {from: worker, to: orders, access: write}\n';
  expect(said(adds)).toEqual([
    ['rules/orders-by-the-api', 'error', 5, 'With this change, `connections/worker-writes-orders`: `worker-writes-orders` breaks the rule `orders-by-the-api`: The orders are written only by the API.'],
  ]);
  // A model where the worker writes the orders already, as a debt of the rule: taking the worker's write out pays it.
  const debt = [
    ...SHOP.filter((each) => each !== RULE),
    file('apps/worker', 'name: Worker\nin: shop\n'),
    file('connections/worker-writes-orders', 'from: worker\nto: orders\naccess: write\n'),
    file('rules/orders-by-the-api', `${RULE.text}debt: [worker-writes-orders]\n`),
  ];
  expect(readModel(debt).problems).toEqual([]);
  expect(said('remove:\n  - connections/worker-writes-orders\n', debt).map((each) => [each[0], each[3]])).toEqual([
    ['reference-unknown', 'With this change, `rules/orders-by-the-api`: `debt` names `worker-writes-orders`, but no record has that id.'],
  ]);
  expect(said('remove:\n  - connections/worker-writes-orders\nupdate:\n  rules/orders-by-the-api: {debt: null}\n', debt)).toEqual([]);
});

test('a faulty change stops nothing else, and the id of a change is its own', () => {
  const model = read('add:\n  worker: {name: Worker}\n');
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.record])).toEqual([['change-path', 'changes/a-change.yaml', 'a-change']]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([['orders-by-the-api', 'holds']]);
  // A change may have the id of a record, as one named for the part it adds: the rule that names `api` is judged all the same.
  const named = read('', SHOP, 'api');
  expect(named.problems).toEqual([]);
  expect(named.rulings.map((ruling) => ruling.state)).toEqual(['holds']);
  // Two changes are held each alone against the model: both may add the same record.
  const both = readModel([...SHOP, file('changes/one', 'name: One\nprompt: Add a worker.\nadd:\n  apps/worker: {name: Worker, in: shop}\n'), file('changes/two', 'name: Two\nprompt: Add a worker.\nadd:\n  apps/worker: {name: Worker, in: shop}\n')]);
  expect(both.problems).toEqual([]);
});
