import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { catalogueOf } from '../src/model/catalogue.ts';
import { changesOf } from '../src/model/changes.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = {
  path: 'seefore.yaml',
  text: 'format: 1\nname: Shop\n',
};
const SHOP: SourceFile = { path: 'systems/system-shop.yaml', text: 'name: Shop\n' };
const change = (id: string, text: string): SourceFile => ({
  path: `changes/${id}.yaml`,
  text,
});
/** The changes of a model of the files given. */
const changes = (...files: SourceFile[]) => {
  const read = readModel([MARKER, SHOP, ...files]);
  return changesOf(read.records, read.laid);
};
/** A record as the answer gives it, with fields the check would not let through. */
const record = (kind: string, id: string, fields: Record<string, unknown>): ModelRecord => ({ kind, id, file: `${kind}/${id}.yaml`, fields });

test('the changes stand by name, without regard to capitals, and one with no name of text after them under its id', () => {
  const read = changes(
    change('post', 'name: Orders by post\nprompt: Take orders by post.\n'),
    change('ledger', 'name: a ledger for settlement\nprompt: Move settlement onto a ledger.\nadd:\n  apps/app-ledger: {name: Ledger, in: system-shop}\n'),
    change('archive', 'name: Archive the old orders\nprompt: Keep the old orders apart.\n'),
  );
  expect(read.all).toMatchObject([
    { id: 'ledger', name: 'a ledger for settlement' },
    { id: 'archive', name: 'Archive the old orders' },
    { id: 'post', name: 'Orders by post' },
  ]);
  // The check tells a change with no name; the page shows it all the same, under its id.
  const faulty = changesOf([record('changes', 'zebra', { name: 'Zebra', prompt: 'A.' }), record('changes', 'nameless', { prompt: 'B.' }), record('changes', 'numbered', { name: 7, prompt: 'C.' })]);
  expect(faulty.all).toMatchObject([
    { id: 'zebra', name: 'Zebra' },
    { id: 'nameless', name: 'nameless' },
    { id: 'numbered', name: 'numbered' },
  ]);
});

test('a change is found by its id, also one that another record has, and another record is no change', () => {
  const read = changes(change('system-shop', 'name: A second shop\nprompt: Open a second shop.\n'), change('post', 'name: Orders by post\nprompt: Take orders by post.\n'));
  expect(read.change('post')).toMatchObject({ id: 'post', name: 'Orders by post' });
  // The change `system-shop` is read from `changes/`, not the system of that id.
  expect(read.change('system-shop')).toMatchObject({ id: 'system-shop', name: 'A second shop' });
  const without = changes(change('post', 'name: Orders by post\nprompt: Take orders by post.\n'));
  expect(without.change('system-shop')).toBeUndefined();
  expect(without.change('nobody')).toBeUndefined();
});

test('a change has its input: the prompt, and what the person answered when asked, line by line', () => {
  const read = changes(
    change('post', 'name: Orders by post\nprompt: |-\n  Some customers cannot pay online.\n\n  Let a clerk type in an order that came by post.\ngiven:\n  - A clerk types in a few orders a day.\n  - A posted order is paid on delivery.\n'),
    change('archive', 'name: Archive the old orders\nprompt: Keep orders for seven years.\n'),
  );
  expect(read.change('post')).toMatchObject({
    id: 'post',
    name: 'Orders by post',
    prompt: 'Some customers cannot pay online.\n\nLet a clerk type in an order that came by post.',
    given: ['A clerk types in a few orders a day.', 'A posted order is paid on delivery.'],
  });
  // A change that was asked nothing has no line, and no empty heading follows from it.
  expect(read.change('archive')).toMatchObject({ id: 'archive', name: 'Archive the old orders', prompt: 'Keep orders for seven years.', given: [] });
  // The check tells a prompt or a line that is no text; the page leaves it out.
  const faulty = changesOf([record('changes', 'odd', { name: 'Odd', prompt: 7, given: ['A line.', 3, '  ', 'Another.'] }), record('changes', 'worse', { name: 'Worse', given: 'One line.' })]);
  expect(faulty.change('odd')).toMatchObject({ id: 'odd', name: 'Odd', given: ['A line.', 'Another.'] });
  expect(faulty.change('worse')).toMatchObject({ id: 'worse', name: 'Worse', given: [] });
});

test('a model with no change has none, and finds none', () => {
  const read = changes();
  expect(read.all).toEqual([]);
  expect(read.change('system-shop')).toBeUndefined();
});

// ---- the records of a change: a small shop, and one change that adds, updates and removes

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const MODEL: SourceFile[] = [
  MARKER,
  file('systems/system-shop', 'name: Shop\ndescription: Sells things online.\n'),
  file('systems/system-bank', 'name: Bank\nexternal: true\n'),
  file('apps/app-api', 'name: API\nin: system-shop\ntechnology: [tech-go]\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('people/person-customer', 'name: Customer\n'),
  file('technologies/tech-go', 'name: Go\n'),
  file('technologies/tech-rust', 'name: Rust\n'),
  file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nname: Places an order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\n'),
  file('connections/connection-api-calls-bank', 'from: app-api\nto: system-bank\n'),
  file('context/context-orders-are-kept', 'must: An order is never lost.\nwhy: The shop promises it.\n'),
];
const BODY = [
  'add:',
  '  apps/app-worker: {name: Worker, in: system-shop}',
  '  connections/connection-api-calls-worker: {from: app-api, to: app-worker}',
  '  context/context-workers-are-few: {prefer: One worker is enough., why: Orders are few.}',
  'update:',
  '  systems/system-shop: {description: null}',
  '  apps/app-api: {name: Order API, description: Takes the orders., technology: [tech-rust]}',
  'remove:',
  '  - connections/connection-api-calls-bank',
  '',
].join('\n');
/** The model with one change of the body given, as the answer gives it. */
const answer = (body: string) => readModel([...MODEL, change('more-hands', `name: More hands\nprompt: The API is too slow.\n${body}`)]);
const laidChanges = (body: string) => {
  const read = answer(body);
  return { read, changes: changesOf(read.records, read.laid) };
};

test('a change names the records it touches, in the order of its file, with what it does and the keys it writes', () => {
  const { read, changes: found } = laidChanges(BODY);
  expect(read.problems).toEqual([]);
  expect(found.change('more-hands')).toMatchObject({
    laid: true,
    touched: [
      { path: 'apps/app-worker', folder: 'apps', id: 'app-worker', verb: 'add', keys: [] },
      { path: 'connections/connection-api-calls-worker', folder: 'connections', id: 'connection-api-calls-worker', verb: 'add', keys: [] },
      { path: 'context/context-workers-are-few', folder: 'context', id: 'context-workers-are-few', verb: 'add', keys: [] },
      { path: 'systems/system-shop', folder: 'systems', id: 'system-shop', verb: 'update', keys: ['description'] },
      { path: 'apps/app-api', folder: 'apps', id: 'app-api', verb: 'update', keys: ['name', 'description', 'technology'] },
      { path: 'connections/connection-api-calls-bank', folder: 'connections', id: 'connection-api-calls-bank', verb: 'remove', keys: [] },
    ],
  });
  // An input alone touches nothing, and is laid all the same.
  expect(laidChanges('').changes.change('more-hands')).toMatchObject({ touched: [], laid: true });
});

test('the model as it would be: what a change adds is in, what it removes is out, what it updates is the record the check read', () => {
  const { read, changes: found } = laidChanges(BODY);
  const world = found.world('more-hands');
  const fields = new Map(world?.records.map((each) => [`${each.kind}/${each.id}`, each.fields]));
  expect(fields.get('apps/app-worker')).toEqual({ name: 'Worker', in: 'system-shop' });
  expect(fields.has('connections/connection-api-calls-bank')).toBe(false);
  expect(fields.get('systems/system-shop')).toEqual({ name: 'Shop' });
  expect(fields.get('apps/app-api')).toEqual({ name: 'Order API', in: 'system-shop', technology: ['tech-rust'], description: 'Takes the orders.' });
  // A record the change does not touch is today's very record, and no change is in the world.
  expect(world?.records.find((each) => each.id === 'store-orders')).toBe(read.records.find((each) => each.id === 'store-orders'));
  expect(world?.records.some((each) => each.kind === 'changes')).toBe(false);
  expect(world?.records.length).toBe(read.records.length - 1 + 3 - 1);
  expect([...(world?.touch.paths ?? [])]).toEqual(['apps/app-worker', 'connections/connection-api-calls-worker', 'context/context-workers-are-few', 'systems/system-shop', 'apps/app-api', 'connections/connection-api-calls-bank']);
  expect(found.world('nobody')).toBeUndefined();
});

test('a link leads under the change to a record the change touches, and into the system to any other', () => {
  const { read, changes: found } = laidChanges(BODY);
  const world = found.world('more-hands');
  const under = catalogueOf(world?.records ?? [], world?.touch);
  const at = (kind: string, id: string) => under.address({ kind, id, file: '', fields: {} });
  expect(at('apps', 'app-worker')).toBe('/changes/more-hands/records/apps/app-worker');
  expect(at('apps', 'app-api')).toBe('/changes/more-hands/records/apps/app-api');
  expect(at('context', 'context-workers-are-few')).toBe('/changes/more-hands/records/context/context-workers-are-few');
  expect(at('stores', 'store-orders')).toBe('/models/store-orders');
  expect(at('people', 'person-customer')).toBe('/actors/person-customer');
  expect(at('context', 'context-orders-are-kept')).toBe('/context/context-orders-are-kept');
  // A removed record is drawn from the model of today, whose catalogue is told the same.
  const today = catalogueOf(read.records, found.touch('more-hands'));
  expect(today.address({ kind: 'connections', id: 'connection-api-calls-bank', file: '', fields: {} })).toBe('/changes/more-hands/records/connections/connection-api-calls-bank');
  expect(today.address({ kind: 'systems', id: 'system-bank', file: '', fields: {} })).toBe('/models/system-bank');
  // Outside a change every address is the system's.
  expect(catalogueOf(read.records).address({ kind: 'apps', id: 'app-api', file: '', fields: {} })).toBe('/models/app-api');
});

test('the sections of Records are the page own lists in its order, the rows by name, each with the record to show', () => {
  const { changes: found } = laidChanges(BODY);
  expect(found.sections('more-hands').map((section) => [section.title, section.rows.map((row) => [row.label, row.touched.verb])])).toEqual([
    ['Context', [['One worker is enough.', 'add']]],
    [
      'Software',
      [
        ['Order API', 'update'],
        ['Shop', 'update'],
        ['Worker', 'add'],
      ],
    ],
    [
      'Connections',
      // Two with one name stand by their ids: `connection-api-calls-bank` before `connection-api-calls-worker`.
      [
        ['No name', 'remove'],
        ['No name', 'add'],
      ],
    ],
  ]);
  // An updated record is shown as it would be, a removed one as it is.
  const rows = found.sections('more-hands').flatMap((section) => section.rows);
  expect(rows.find((row) => row.touched.id === 'app-api')?.record?.fields.name).toBe('Order API');
  expect(rows.find((row) => row.touched.id === 'connection-api-calls-bank')?.record?.fields).toEqual({ from: 'app-api', to: 'system-bank' });
  expect(laidChanges('').changes.sections('more-hands')).toEqual([]);
});

test('one record of a change by its path, and before and after of each key an update writes', () => {
  const { changes: found } = laidChanges(BODY);
  expect(found.record('more-hands', 'apps/app-api')).toMatchObject({ touched: { verb: 'update' }, today: { fields: { name: 'API' } }, after: { fields: { name: 'Order API' } } });
  expect(found.record('more-hands', 'apps/app-worker')).toMatchObject({ touched: { verb: 'add' }, after: { fields: { name: 'Worker' } } });
  expect(found.record('more-hands', 'apps/app-worker')?.today).toBeUndefined();
  expect(found.record('more-hands', 'connections/connection-api-calls-bank')).toMatchObject({ touched: { verb: 'remove' }, today: { fields: { to: 'system-bank' } } });
  expect(found.record('more-hands', 'connections/connection-api-calls-bank')?.after).toBeUndefined();
  // A record the change does not touch is none of its records.
  expect(found.record('more-hands', 'stores/store-orders')).toBeUndefined();
  // A text that changes, a key that is new, a list, and a key that is taken out.
  expect(found.differences('more-hands', 'apps/app-api')).toEqual([
    { key: 'name', before: 'API', after: 'Order API' },
    { key: 'description', after: 'Takes the orders.' },
    { key: 'technology', before: ['tech-go'], after: ['tech-rust'] },
  ]);
  expect(found.differences('more-hands', 'systems/system-shop')).toEqual([{ key: 'description', before: 'Sells things online.' }]);
  expect(found.differences('more-hands', 'apps/app-worker')).toEqual([]);
});

test('a change with an error of its own is not laid: its rows are read from its file, and it has no model as it would be', () => {
  // The change updates a record that is not there.
  const { read, changes: found } = laidChanges('add:\n  apps/app-worker: {name: Worker, in: system-shop}\nupdate:\n  apps/app-apy: {name: Order API}\n  apps/app-api: {name: Order API}\nremove:\n  - connections/connection-api-calls-bank\n');
  expect(read.problems.map((problem) => problem.rule)).toEqual(['change-no-record']);
  expect(read.laid).toEqual([]);
  expect(found.change('more-hands')?.laid).toBe(false);
  expect(found.world('more-hands')).toBeUndefined();
  // A record it adds is shown as its file writes it, one it updates as it is today, and a path with no record by its id.
  expect(found.sections('more-hands').map((section) => [section.title, section.rows.map((row) => [row.label, row.touched.verb, row.record?.fields.name])])).toEqual([
    [
      'Software',
      [
        ['API', 'update', 'API'],
        ['app-apy', 'update', undefined],
        ['Worker', 'add', 'Worker'],
      ],
    ],
    ['Connections', [['No name', 'remove', undefined]]],
  ]);
  expect(found.differences('more-hands', 'apps/app-api')).toEqual([]);
});
