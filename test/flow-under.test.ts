import { expect, test } from 'vitest';
import { changesOf, fieldRows } from '../src/model/changes.ts';
import { orderOfBoth } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
/** A shop whose one flow passes the customer, the API, the orders, a worker and its audit trail. */
const MODEL: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/system-shop', 'name: Shop\n'),
  file('apps/app-api', 'name: API\nin: system-shop\n'),
  file('apps/app-worker', 'name: Worker\nin: system-shop\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('stores/store-audit', 'name: Audit\nin: system-shop\nkind: database\n'),
  file('people/person-customer', 'name: Customer\n'),
  file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nname: Places an order\n'),
  file('connections/connection-api-reads-orders', 'from: app-api\nto: store-orders\naccess: read\nname: Reads the order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\n'),
  file('connections/connection-api-calls-worker', 'from: app-api\nto: app-worker\nname: Hands the order on\n'),
  file('connections/connection-worker-writes-audit', 'from: app-worker\nto: store-audit\naccess: write\nname: Notes it\n'),
  file('features/feature-ordering', 'name: Ordering\n'),
  file(
    'flows/flow-placing',
    [
      'name: Placing an order',
      'starts: A customer places an order',
      'ends: The order is kept',
      'description: How an order is placed.',
      'feature: feature-ordering',
      'steps:',
      '  - {id: places, does: connection-customer-orders}',
      '  - {id: reads, does: connection-api-reads-orders}',
      '  - {id: saves, does: connection-api-writes-orders, only: when the customer has paid}',
      '  - {id: hands-on, does: connection-api-calls-worker}',
      '  - {id: notes, does: connection-worker-writes-audit}',
      '  - {id: confirms, reply: places, name: Confirms the order}',
      '',
    ].join('\n'),
  ),
];
/** A change that takes two steps out, adds two, changes two, and leaves the rest by their ids. */
const BODY = [
  'add:',
  '  stores/store-ledger: {name: Ledger, in: system-shop, kind: database}',
  '  connections/connection-api-writes-ledger: {from: app-api, to: store-ledger, access: write, name: Keeps an entry}',
  'update:',
  '  apps/app-api: {description: Takes the orders.}',
  '  stores/store-audit: {description: The audit trail.}',
  '  connections/connection-customer-orders: {name: Orders something}',
  '  flows/flow-placing:',
  '    description: Now with a ledger.',
  '    steps:',
  '      - places',
  '      - {id: checks, does: app-api, name: Checks the stock}',
  '      - {id: saves, does: connection-api-writes-orders}',
  '      - {id: keeps, does: connection-api-writes-ledger}',
  '      - {id: hands-on, does: connection-api-calls-worker, description: At once.}',
  '      - confirms',
  'remove:',
  '  - connections/connection-api-reads-orders',
  '',
].join('\n');
/** The flow `flow-placing` under one change of the body given. */
const under = (body: string, flow = 'flow-placing') => {
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
  const { read, flow } = under('update:\n  flows/flow-placing:\n    steps: [saves, places, reads, hands-on, notes, confirms]\n');
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
  expect(boxes).toEqual(['app-api', 'app-worker', 'person-customer', 'store-audit', 'store-ledger', 'store-orders', 'system-shop']);
  // A box is green when the flow newly passes it, red when it no longer does, yellow when it is in both and the change updates its record.
  expect(mark('store-ledger')).toBe('added');
  expect(mark('app-api')).toBe('updated');
  expect(mark('app-worker')).toBe('same');
  // The change updates the audit store, yet the flow no longer passes it: what the flow passes comes first.
  expect(mark('store-audit')).toBe('removed');
  // A connection the same way.
  expect(mark('connection-api-writes-ledger')).toBe('added');
  expect(mark('connection-api-reads-orders')).toBe('removed');
  expect(mark('connection-worker-writes-audit')).toBe('removed');
  expect(mark('connection-customer-orders')).toBe('updated');
  expect(mark('connection-api-calls-worker')).toBe('same');
  // A line of two connections that loses one is updated: one goes while another stays.
  const line = flow?.view.arrows.find((arrow) => arrow.connections.includes('connection-api-writes-orders'));
  expect(line?.connections.includes('connection-api-reads-orders')).toBe(true);
  expect(line && mark(line.id)).toBe('updated');
  // The records the view is drawn from hold what the change removes, as it is today.
  expect(flow?.records.some((record) => record.id === 'connection-api-reads-orders')).toBe(true);
});

test('a step that stays and is put on another connection leaves its old line and box on the view, in red', () => {
  // `notes` stays, and now writes the orders: the audit trail and the line to it are passed no more.
  const { read, flow } = under('update:\n  flows/flow-placing:\n    steps:\n      - places\n      - reads\n      - saves\n      - hands-on\n      - {id: notes, does: connection-api-writes-orders, name: Notes it in the order}\n      - confirms\n');
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
  // Who acts on what, and the title, each with what it says today.
  expect(flow?.steps[4]?.was).toEqual([
    { key: 'does', today: 'Worker to Audit' },
    { key: 'name', today: 'Notes it' },
  ]);
  expect(flow?.steps[4]?.acts).toBe('API to Orders');
  // Its old line and the box at the far end are drawn still, and marked as passed no more.
  expect(flow?.view.boxes.some((box) => box.id === 'store-audit')).toBe(true);
  expect(flow?.view.arrows.some((arrow) => arrow.connections.includes('connection-worker-writes-audit'))).toBe(true);
  expect(flow?.marks.get('store-audit')).toBe('removed');
  expect(flow?.marks.get('connection-worker-writes-audit')).toBe('removed');
  // The worker is passed still, by the step before.
  expect(flow?.marks.get('app-worker')).toBe('same');
});

test('a step that goes lights its own line, on the view of both', () => {
  const { flow } = under(BODY);
  const lit = (id: string) => flow?.steps.find((step) => step.id === id)?.lights;
  const arrowOf = (connection: string) => flow?.view.arrows.find((arrow) => arrow.connections.includes(connection))?.id;
  expect(lit('reads')).toEqual({ arrow: arrowOf('connection-api-reads-orders'), back: false });
  expect(lit('notes')).toEqual({ arrow: arrowOf('connection-worker-writes-audit'), back: false });
  expect(lit('keeps')).toEqual({ arrow: arrowOf('connection-api-writes-ledger'), back: false });
  expect(lit('checks')).toEqual({ box: 'app-api' });
});

test('a flow that a change adds or removes comes in the same form, with no mark on a step, a box or a line', () => {
  const added = under('add:\n  flows/flow-reading:\n    name: Reading an order\n    starts: A customer asks\n    ends: The order is shown\n    feature: feature-ordering\n    steps:\n      - {id: asks, does: connection-customer-orders}\n      - {id: reads, does: connection-api-reads-orders}\n', 'flow-reading');
  expect(added.read.problems).toEqual([]);
  expect(added.flow).toMatchObject({ verb: 'add', count: 2, was: [] });
  expect(added.flow?.steps.map((step) => [step.number, step.mark])).toEqual([
    [1, 'same'],
    [2, 'same'],
  ]);
  expect(added.flow?.marks.size).toBe(0);
  const removed = under('remove:\n  - flows/flow-placing\n');
  expect(removed.read.problems).toEqual([]);
  expect(removed.flow).toMatchObject({ verb: 'remove', count: 6, flow: { name: 'Placing an order' } });
  expect(removed.flow?.steps.every((step) => step.mark === 'same')).toBe(true);
  expect(removed.flow?.view.boxes.length).toBe(6);
});

test('a flow the change does not name, and a change the check could not lay, have no flow under the change', () => {
  expect(under('update:\n  apps/app-api: {description: Takes the orders.}\n').flow).toBeUndefined();
  expect(under(BODY, 'flow-nothing-here').flow).toBeUndefined();
  // The change updates a record that is not there: it is not laid.
  const faulty = under('update:\n  flows/flow-placings: {description: Other words.}\n');
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

// ---- each row is read from its own side

/** The flow `flow-placing` with its text given, in place of the model's. */
const withFlow = (steps: string[]): SourceFile[] => [
  ...MODEL.filter((each) => each.path !== 'flows/flow-placing.yaml'),
  file('flows/flow-placing', ['name: Placing an order', 'starts: A customer places an order', 'ends: The order is kept', 'feature: feature-ordering', 'steps:', ...steps, ''].join('\n')),
];
const underModel = (model: SourceFile[], body: string) => {
  const read = readModel([...model, file('changes/more', `name: More\nprompt: Make it so.\n${body}`)]);
  return { read, flow: changesOf(read.records, read.laid).flow('more', 'flow-placing') };
};

test('a reply that goes is read against the step it answers as that step is today, and lights today own line', () => {
  // `places` stays and is put on another connection; the reply to it goes.
  const { read, flow } = under('update:\n  flows/flow-placing:\n    steps:\n      - {id: places, does: connection-api-calls-worker}\n      - reads\n      - saves\n      - hands-on\n      - notes\n');
  expect(read.problems).toEqual([]);
  const gone = flow?.steps.find((step) => step.id === 'confirms');
  expect(gone).toMatchObject({ mark: 'removed', number: 6, happens: 'Confirms the order', acts: 'API replies to Customer', kind: 'reply' });
  // It names the step it answered by the number that step bears in the list, with today's words for it.
  expect(gone?.reply).toEqual({ number: 1, words: 'Places an order' });
  // It lights the line it travelled today, backwards, and not the line `places` is put on.
  const line = flow?.view.arrows.find((arrow) => arrow.connections.includes('connection-customer-orders'));
  expect(gone?.lights).toEqual({ arrow: line?.id, back: true });
  expect(flow?.marks.get('connection-customer-orders')).toBe('removed');
  expect(flow?.marks.get('person-customer')).toBe('removed');
  // The step that stays reads as it would be, with today's words under what changed.
  expect(flow?.steps[0]).toMatchObject({ id: 'places', mark: 'updated', happens: 'Hands the order on', acts: 'API to Worker' });
  expect(flow?.steps[0]?.was).toEqual([
    { key: 'does', today: 'Customer to API' },
    { key: 'name', today: 'Places an order' },
  ]);
});

test('a step that goes keeps today name and ends of its connection, also where the change rewrites that connection', () => {
  const steps = '    steps: [places, saves, hands-on, confirms]\n';
  // The change renames the connection of `reads` and moves an end of the connection of `notes`; both steps go.
  const { read, flow } = under(`update:\n  connections/connection-api-reads-orders: {name: Looks the order up}\n  connections/connection-worker-writes-audit: {from: app-api}\n  flows/flow-placing:\n${steps}`);
  expect(read.problems).toEqual([]);
  const step = (id: string) => flow?.steps.find((each) => each.id === id);
  expect(step('reads')).toMatchObject({ mark: 'removed', happens: 'Reads the order', acts: 'API to Orders' });
  expect(step('notes')).toMatchObject({ mark: 'removed', happens: 'Notes it', acts: 'Worker to Audit' });
  // The line of `notes` is drawn between its ends of today, and no box bears a mark that neither side passes.
  const line = flow?.view.arrows.find((arrow) => arrow.connections.includes('connection-worker-writes-audit'));
  expect([line?.from, line?.to]).toEqual(['app-worker', 'store-audit']);
  expect(step('notes')?.lights).toEqual({ arrow: line?.id, back: false });
  expect(flow?.view.boxes.map((box) => [box.id, flow.marks.get(box.id)]).filter(([, mark]) => mark === 'added')).toEqual([]);
  expect(flow?.marks.get('store-audit')).toBe('removed');
  expect(flow?.marks.get('app-worker')).toBe('same');
});

test('a step that goes opens no strand over the steps that stay, and a condition stands over its first step in the list', () => {
  const model = withFlow([
    '  - {id: places, does: connection-customer-orders}',
    '  - {id: reads, does: connection-api-reads-orders}',
    '  - {id: saves, does: connection-api-writes-orders, only: when the customer has paid}',
    '  - {id: hands-on, does: connection-api-calls-worker, after: [places], only: when the customer has paid}',
    '  - {id: notes, does: connection-worker-writes-audit}',
    '  - {id: confirms, reply: places, name: Confirms the order}',
  ]);
  expect(readModel(model).problems).toEqual([]);
  // The step with `after` goes: after the change no step opens a strand.
  const { read, flow } = underModel(model, 'update:\n  flows/flow-placing:\n    steps: [places, reads, saves, notes, confirms]\n');
  expect(read.problems).toEqual([]);
  expect(flow?.steps.map((step) => [step.id, step.mark, step.strand ?? null, step.group ?? null])).toEqual([
    ['places', 'same', null, null],
    ['reads', 'same', null, null],
    ['saves', 'same', null, 'Only when the customer has paid'],
    // It stands under the condition it shares with the step before it, and says what it came after in its bar, not as a heading.
    ['hands-on', 'removed', null, null],
    ['notes', 'same', null, null],
    ['confirms', 'same', null, null],
  ]);
  expect(flow?.steps[3]).toMatchObject({ conditioned: true, after: [{ number: 1, words: 'Places an order' }] });
});

test("a step's source is one of its own keys: written otherwise, the step is updated, with today's paths", () => {
  const model = withFlow([
    '  - {id: places, does: connection-customer-orders}',
    '  - {id: reads, does: connection-api-reads-orders, source: [api/orders/read.go]}',
    '  - {id: saves, does: connection-api-writes-orders, source: [api/orders/save.go, api/db.go]}',
    '  - {id: hands-on, does: connection-api-calls-worker}',
    '  - {id: notes, does: connection-worker-writes-audit, source: [worker/audit.go]}',
    '  - {id: confirms, reply: places, name: Confirms the order}',
  ]);
  expect(readModel(model).problems).toEqual([]);
  const { read, flow } = underModel(
    model,
    [
      'update:',
      '  flows/flow-placing:',
      '    steps:',
      '      - places',
      '      - {id: reads, does: connection-api-reads-orders, source: [api/orders/find.go]}',
      '      - {id: saves, does: connection-api-writes-orders}',
      '      - {id: hands-on, does: connection-api-calls-worker, source: [worker/main.go]}',
      '      - notes',
      '      - confirms',
      '',
    ].join('\n'),
  );
  expect(read.problems).toEqual([]);
  // A path that changes says today's; one that is new has nothing for today; one taken out is gone. A step whose paths stay is the same.
  expect(flow?.steps.map((step) => [step.id, step.mark, step.source, step.was])).toEqual([
    ['places', 'same', [], []],
    ['reads', 'updated', ['api/orders/find.go'], [{ key: 'source', today: 'api/orders/read.go' }]],
    ['saves', 'updated', [], [{ key: 'source', today: 'api/orders/save.go, api/db.go', gone: true }]],
    ['hands-on', 'updated', ['worker/main.go'], [{ key: 'source' }]],
    ['notes', 'same', ['worker/audit.go'], []],
    ['confirms', 'same', [], []],
  ]);
});

test('a flow with a step id twice has no step told from another: it is shown as it would be, with no mark', () => {
  // The change gives a second step the id `reads`; the check tells it, and the change is laid all the same.
  const { read, flow } = under('update:\n  flows/flow-placing:\n    description: Twice.\n    steps:\n      - places\n      - reads\n      - {id: reads, does: connection-api-calls-worker}\n      - confirms\n');
  expect(read.problems.map((problem) => problem.rule)).toEqual(['step-twice']);
  expect(flow?.steps.map((step) => [step.number, step.id, step.mark])).toEqual([
    [1, 'places', 'same'],
    [2, 'reads', 'same'],
    [3, 'reads', 'same'],
    [4, 'confirms', 'same'],
  ]);
  expect(flow?.count).toBe(4);
  expect(flow?.marks.size).toBe(0);
  expect(flow?.was).toEqual([{ key: 'description', today: 'How an order is placed.' }]);
});

test('an updated flow has its result too: the flow as it would be alone, with no step that goes and no mark', () => {
  const { flow } = under(BODY);
  const result = flow?.result;
  // The steps as they would be, with the numbers they bear in the list of both, and none of the two that go.
  expect(result?.steps.map((step) => [step.number, step.id, step.mark, step.was])).toEqual(
    flow?.steps.filter((step) => step.mark !== 'removed').map((step) => [step.number, step.id, 'same', []]),
  );
  expect(result).toMatchObject({ verb: 'update', count: 6, was: [], flow: { description: 'Now with a ledger.' } });
  expect(result?.steps.length).toBe(6);
  expect(result?.marks.size).toBe(0);
  // Its view holds what the flow would pass: the ledger, and not the audit trail that only today's flow passes.
  const boxes = result?.view.boxes.map((box) => box.id);
  expect(boxes).toContain('store-ledger');
  expect(boxes).not.toContain('store-audit');
  expect(flow?.view.boxes.map((box) => box.id)).toContain('store-audit');
  expect(result?.result).toBeUndefined();
  // A flow the change adds or removes is one view already.
  expect(under('remove:\n  - flows/flow-placing\n').flow?.result).toBeUndefined();
});

