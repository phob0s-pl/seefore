import { expect, test } from 'vitest';
import { changesOf, fieldRows } from '../src/model/changes.ts';
import { orderOfBoth } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
/** A shop whose one flow passes the customer, the API, the orders, a worker and its audit trail. */
const MODEL: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/shop', 'name: Shop\n'),
  file('apps/api', 'name: API\nin: shop\n'),
  file('apps/worker', 'name: Worker\nin: shop\n'),
  file('stores/orders', 'name: Orders\nin: shop\nkind: database\n'),
  file('stores/audit', 'name: Audit\nin: shop\nkind: database\n'),
  file('people/customer', 'name: Customer\n'),
  file('connections/customer-orders', 'from: customer\nto: api\nname: Places an order\n'),
  file('connections/api-reads-orders', 'from: api\nto: orders\naccess: read\nname: Reads the order\n'),
  file('connections/api-writes-orders', 'from: api\nto: orders\naccess: write\nname: Saves the order\n'),
  file('connections/api-calls-worker', 'from: api\nto: worker\nname: Hands the order on\n'),
  file('connections/worker-writes-audit', 'from: worker\nto: audit\naccess: write\nname: Notes it\n'),
  file('features/ordering', 'name: Ordering\n'),
  file(
    'flows/placing',
    [
      'name: Placing an order',
      'starts: A customer places an order',
      'ends: The order is kept',
      'description: How an order is placed.',
      'feature: ordering',
      'steps:',
      '  - {id: places, does: customer-orders}',
      '  - {id: reads, does: api-reads-orders}',
      '  - {id: saves, does: api-writes-orders, only: when the customer has paid}',
      '  - {id: hands-on, does: api-calls-worker}',
      '  - {id: notes, does: worker-writes-audit}',
      '  - {id: confirms, reply: places, name: Confirms the order}',
      '',
    ].join('\n'),
  ),
];
/** A change that takes two steps out, adds two, changes two, and leaves the rest by their ids. */
const BODY = [
  'add:',
  '  stores/ledger: {name: Ledger, in: shop, kind: database}',
  '  connections/api-writes-ledger: {from: api, to: ledger, access: write, name: Keeps an entry}',
  'update:',
  '  apps/api: {description: Takes the orders.}',
  '  stores/audit: {description: The audit trail.}',
  '  connections/customer-orders: {name: Orders something}',
  '  flows/placing:',
  '    description: Now with a ledger.',
  '    steps:',
  '      - places',
  '      - {id: checks, does: api, name: Checks the stock}',
  '      - {id: saves, does: api-writes-orders}',
  '      - {id: keeps, does: api-writes-ledger}',
  '      - {id: hands-on, does: api-calls-worker, description: At once.}',
  '      - confirms',
  'remove:',
  '  - connections/api-reads-orders',
  '',
].join('\n');
/** The flow `placing` under one change of the body given. */
const under = (body: string, flow = 'placing') => {
  const read = readModel([...MODEL, file('changes/more', `name: More\nprompt: Make it so.\n${body}`)]);
  return { read, flow: changesOf(read.records, read.laid).flow('more', flow) };
};

test('the steps of an updated flow are one list: as they would be, with each step that goes put back where it stood', () => {
  const { read, flow } = under(BODY);
  expect(read.problems).toEqual([]);
  expect(flow?.verb).toBe('update');
  expect(flow?.count).toBe(6);
  expect(flow?.steps.map((step) => [step.number, step.id, step.mark, step.happens])).toEqual([
    [1, 'places', 'same', 'Orders something'],
    // A step that goes stands after the nearest staying step before it, ahead of one that comes there, with the number it has today.
    [2, 'reads', 'removed', 'Reads the order'],
    [2, 'checks', 'added', 'Checks the stock'],
    [3, 'saves', 'updated', 'Saves the order'],
    [4, 'keeps', 'added', 'Keeps an entry'],
    [5, 'hands-on', 'updated', 'Hands the order on'],
    [5, 'notes', 'removed', 'Notes it'],
    [6, 'confirms', 'same', 'Confirms the order'],
  ]);
  // A reply counts the steps as they would be.
  expect(flow?.steps.at(-1)?.reply).toEqual({ number: 1, words: 'Orders something' });
  // The flow's own keys that change, with today's words.
  expect(flow?.flow.description).toBe('Now with a ledger.');
  expect(flow?.was).toEqual([{ key: 'description', today: 'How an order is placed.' }]);
});

test('a step is updated when one of its own keys is written otherwise, and not when its connection is renamed', () => {
  const { flow } = under(BODY);
  const step = (id: string) => flow?.steps.find((each) => each.id === id);
  // The connection of `places` is renamed by the change: the step's words follow, the step itself did not change.
  expect(step('places')).toMatchObject({ mark: 'same', was: [], happens: 'Orders something' });
  // A key that is new has nothing for today; one that is taken out has today's words and is gone.
  expect(step('hands-on')).toMatchObject({ mark: 'updated', was: [{ key: 'description' }], description: 'At once.' });
  expect(step('saves')).toMatchObject({ mark: 'updated', was: [{ key: 'only', today: 'when the customer has paid', gone: true }] });
  expect(step('saves')?.only).toBeUndefined();
  // A step that goes is read as it is today; a step that comes has nothing of today.
  expect(step('reads')).toMatchObject({ mark: 'removed', was: [], acts: 'API to Orders' });
  expect(step('checks')).toMatchObject({ mark: 'added', was: [], acts: 'In API' });
});

test('a step that only moves is in the list once, moved and with no mark, and the steps it passes have not moved', () => {
  const { read, flow } = under('update:\n  flows/placing:\n    steps: [saves, places, reads, hands-on, notes, confirms]\n');
  expect(read.problems).toEqual([]);
  expect(flow?.steps.map((step) => [step.number, step.id, step.mark, step.moved ?? false])).toEqual([
    [1, 'saves', 'same', true],
    [2, 'places', 'same', false],
    [3, 'reads', 'same', false],
    [4, 'hands-on', 'same', false],
    [5, 'notes', 'same', false],
    [6, 'confirms', 'same', false],
  ]);
  expect(orderOfBoth(['a', 'b', 'c', 'd'], ['x', 'b', 'y', 'd'])).toEqual(['a', 'x', 'b', 'c', 'y', 'd']);
  expect(orderOfBoth(['a', 'b'], [])).toEqual(['a', 'b']);
});

test('the view holds what the flow passes today and what it would pass, each box and line with its mark', () => {
  const { flow } = under(BODY);
  const mark = (id: string) => flow?.marks.get(id);
  const boxes = flow?.view.boxes.map((box) => box.id).sort();
  expect(boxes).toEqual(['api', 'audit', 'customer', 'ledger', 'orders', 'shop', 'worker']);
  // A box is green when the flow newly passes it, red when it no longer does, yellow when it is in both and the change updates its record.
  expect(mark('ledger')).toBe('added');
  expect(mark('api')).toBe('updated');
  expect(mark('worker')).toBe('same');
  // The change updates the audit store, yet the flow no longer passes it: what the flow passes comes first.
  expect(mark('audit')).toBe('removed');
  // A connection the same way.
  expect(mark('api-writes-ledger')).toBe('added');
  expect(mark('api-reads-orders')).toBe('removed');
  expect(mark('worker-writes-audit')).toBe('removed');
  expect(mark('customer-orders')).toBe('updated');
  expect(mark('api-calls-worker')).toBe('same');
  // A line of two connections that loses one is updated: one goes while another stays.
  const line = flow?.view.arrows.find((arrow) => arrow.connections.includes('api-writes-orders'));
  expect(line?.connections.includes('api-reads-orders')).toBe(true);
  expect(line && mark(line.id)).toBe('updated');
  // The records the view is drawn from hold what the change removes, as it is today.
  expect(flow?.records.some((record) => record.id === 'api-reads-orders')).toBe(true);
});

test('a step that stays and is put on another connection leaves its old line and box on the view, in red', () => {
  // `notes` stays, and now writes the orders: the audit trail and the line to it are passed no more.
  const { read, flow } = under('update:\n  flows/placing:\n    steps:\n      - places\n      - reads\n      - saves\n      - hands-on\n      - {id: notes, does: api-writes-orders, name: Notes it in the order}\n      - confirms\n');
  expect(read.problems).toEqual([]);
  // The list has the six steps and no other row; the step is updated, with today's words for what it was on.
  expect(flow?.steps.map((step) => [step.number, step.id, step.mark])).toEqual([
    [1, 'places', 'same'],
    [2, 'reads', 'same'],
    [3, 'saves', 'same'],
    [4, 'hands-on', 'same'],
    [5, 'notes', 'updated'],
    [6, 'confirms', 'same'],
  ]);
  expect(flow?.steps[4]?.was).toEqual([{ key: 'does', today: 'Worker to Audit' }, { key: 'name' }]);
  expect(flow?.steps[4]?.acts).toBe('API to Orders');
  // Its old line and the box at the far end are drawn still, and marked as passed no more.
  expect(flow?.view.boxes.some((box) => box.id === 'audit')).toBe(true);
  expect(flow?.view.arrows.some((arrow) => arrow.connections.includes('worker-writes-audit'))).toBe(true);
  expect(flow?.marks.get('audit')).toBe('removed');
  expect(flow?.marks.get('worker-writes-audit')).toBe('removed');
  // The worker is passed still, by the step before.
  expect(flow?.marks.get('worker')).toBe('same');
});

test('a step that goes lights its own line, on the view of both', () => {
  const { flow } = under(BODY);
  const lit = (id: string) => flow?.steps.find((step) => step.id === id)?.lights;
  const arrowOf = (connection: string) => flow?.view.arrows.find((arrow) => arrow.connections.includes(connection))?.id;
  expect(lit('reads')).toEqual({ arrow: arrowOf('api-reads-orders'), back: false });
  expect(lit('notes')).toEqual({ arrow: arrowOf('worker-writes-audit'), back: false });
  expect(lit('keeps')).toEqual({ arrow: arrowOf('api-writes-ledger'), back: false });
  expect(lit('checks')).toEqual({ box: 'api' });
});

test('a flow that a change adds or removes comes in the same form, with no mark on a step, a box or a line', () => {
  const added = under('add:\n  flows/reading:\n    name: Reading an order\n    starts: A customer asks\n    ends: The order is shown\n    feature: ordering\n    steps:\n      - {id: asks, does: customer-orders}\n      - {id: reads, does: api-reads-orders}\n', 'reading');
  expect(added.read.problems).toEqual([]);
  expect(added.flow).toMatchObject({ verb: 'add', count: 2, was: [] });
  expect(added.flow?.steps.map((step) => [step.number, step.mark])).toEqual([
    [1, 'same'],
    [2, 'same'],
  ]);
  expect(added.flow?.marks.size).toBe(0);
  const removed = under('remove:\n  - flows/placing\n');
  expect(removed.read.problems).toEqual([]);
  expect(removed.flow).toMatchObject({ verb: 'remove', count: 6, flow: { name: 'Placing an order' } });
  expect(removed.flow?.steps.every((step) => step.mark === 'same')).toBe(true);
  expect(removed.flow?.view.boxes.length).toBe(6);
});

test('a flow the change does not name, and a change the check could not lay, have no flow under the change', () => {
  expect(under('update:\n  apps/api: {description: Takes the orders.}\n').flow).toBeUndefined();
  expect(under(BODY, 'nothing-here').flow).toBeUndefined();
  // The change updates a record that is not there: it is not laid.
  const faulty = under('update:\n  flows/placings: {description: Other words.}\n');
  expect(faulty.read.problems.map((problem) => problem.rule)).toEqual(['change-no-record']);
  expect(faulty.flow).toBeUndefined();
});

test('the fields of a data record before and after are one list, matched by name', () => {
  const today = [{ name: 'amount', description: 'What is owed' }, { name: 'promoter' }, { name: 'paid on', description: 'The day' }];
  const after = [{ name: 'amount', description: 'What is owed, to the cent' }, { name: 'last entry', description: 'The last entry counted' }, { name: 'promoter' }];
  expect(fieldRows(today, after)).toEqual([
    { name: 'amount', mark: 'updated', today: 'What is owed', after: 'What is owed, to the cent' },
    { name: 'last entry', mark: 'added', after: 'The last entry counted' },
    { name: 'promoter', mark: 'same' },
    { name: 'paid on', mark: 'removed', today: 'The day' },
  ]);
  // A side that is missing has no field; a value that is no list of fields is none of this.
  expect(fieldRows(undefined, [{ name: 'amount' }])).toEqual([{ name: 'amount', mark: 'added' }]);
  expect(fieldRows(today, undefined)?.map((row) => row.mark)).toEqual(['removed', 'removed', 'removed']);
  expect(fieldRows('text', after)).toBeUndefined();
  expect(fieldRows(today, [{ description: 'No name' }])).toBeUndefined();
});
