import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { flowItems, flowSteps, flowView, itemAt, litByStep } from '../src/model/flow.ts';
import type { FlowStep, ItemPlace } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { viewOf } from '../src/model/view.ts';
import type { View } from '../src/model/view.ts';

const file = (path: string, text: string): SourceFile => ({ path, text });
const connection = (id: string, from: string, to: string, name: string): SourceFile => file(`connections/${id}.yaml`, `from: ${from}\nto: ${to}\nname: ${name}\n`);

/**
 * A fan who pays through a shop and a bank. The shop has parts no step reaches: the orders, the
 * cart, and a line from the web app to the orders. "Paying" runs "Sending a receipt", whose
 * parts are not drawn on it.
 */
const SHOP: SourceFile[] = [
  file('seefore.yaml', 'format: 1\nname: Shop\n'),
  file('people/person-fan.yaml', 'name: Fan\n'),
  file('systems/system-shop.yaml', 'name: Shop\n'),
  file('systems/system-bank.yaml', 'name: Bank\nexternal: true\n'),
  file('systems/system-mailer.yaml', 'name: Mailer\nexternal: true\n'),
  file('apps/app-web.yaml', 'name: Web\nin: system-shop\n'),
  file('apps/app-api.yaml', 'name: API\nin: system-shop\n'),
  file('components/component-checkout.yaml', 'name: Checkout\nin: app-api\n'),
  file('components/component-cart.yaml', 'name: Cart\nin: app-api\n'),
  file('stores/store-orders.yaml', 'name: Orders\nin: system-shop\n'),
  connection('connection-fan-uses-web', 'person-fan', 'app-web', 'Opens the shop'),
  connection('connection-web-calls-checkout', 'app-web', 'component-checkout', 'Asks to pay'),
  connection('connection-checkout-pays', 'component-checkout', 'system-bank', 'Charges the card'),
  connection('connection-bank-calls-back', 'system-bank', 'component-checkout', 'Reports the payment'),
  connection('connection-web-reads-orders', 'app-web', 'store-orders', 'Reads the orders'),
  connection('connection-cart-mails', 'component-cart', 'system-mailer', 'Mails a receipt'),
  file('features/feature-paying.yaml', 'name: Paying\n'),
  file('features/feature-accounts.yaml', 'name: Accounts\n'),
  file('data/data-payment.yaml', 'name: Payment\n'),
  file(
    'flows/flow-pays.yaml',
    `name: Paying for an order
starts: A fan pays
ends: The order is paid
only: in Europe
feature: feature-paying
steps:
  - {id: opens, does: connection-fan-uses-web}
  - {id: asks, does: connection-web-calls-checkout}
  - {id: charges, does: connection-checkout-pays, only: when the fan pays by card}
  - {id: link, reply: charges, name: A link, only: when the fan pays by card, data: [data-payment]}
  - {id: calls-back, does: connection-bank-calls-back, only: when the fan pays by card}
  - {id: keeps, does: component-checkout, name: Keeps the payment}
  - {id: tells, after: [asks], name: Tells the fan}
  - {id: receipt, does: flow-receipt, only: when the fan pays by card}
`,
  ),
  file('flows/flow-receipt.yaml', 'name: Sending a receipt\nstarts: A payment\nends: A receipt is sent\nfeature: feature-paying\nsteps:\n  - {id: mails, does: connection-cart-mails}\n'),
];

const records = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return read.records;
};
/** Each box as `id`, `id in frame`, and `[id]` for a frame; each arrow as `from > to: connections < back`. */
const drawn = ({ boxes, arrows }: View) => ({
  boxes: boxes.map((box) => `${box.frame ? `[${box.id}]` : box.id}${box.in ? ` in ${box.in}` : ''}`),
  arrows: arrows.map((arrow) => `${arrow.from} > ${arrow.to}: ${arrow.connections.join(' ')}${arrow.back ? ` < ${arrow.back.join(' ')}` : ''}`),
});
const steps = (...files: SourceFile[]): FlowStep[] => flowSteps(records(...files), 'flow-pays')?.steps ?? [];
const step = (id: string, ...files: SourceFile[]): FlowStep | undefined => steps(...files).find((each) => each.id === id);

test("the view of a flow holds the lines its steps walk, their ends, the parts it happens in and their frames, and nothing else", () => {
  expect(drawn(flowView(records(), 'flow-pays'))).toEqual({
    // No orders, no cart, no mailer: the flow it runs adds nothing.
    boxes: ['person-fan', 'system-bank', '[system-shop]', '[app-api] in system-shop', 'app-web in system-shop', 'component-checkout in app-api'],
    // The two ways between Checkout and the bank are one arrow, from the box that comes first.
    arrows: ['person-fan > app-web: connection-fan-uses-web', 'system-bank > component-checkout: connection-bank-calls-back < connection-checkout-pays', 'app-web > component-checkout: connection-web-calls-checkout'],
  });
  expect(flowView(records(), 'flow-receipt').boxes.map((box) => box.id)).toEqual(['system-mailer', 'system-shop', 'app-api', 'component-cart']);
  expect(flowView(records(), 'flow-nothing')).toEqual({ boxes: [], arrows: [] });
});

test('a step on a connection says who acts on what, and lights its arrow the way it travels', () => {
  expect(step('opens')).toMatchObject({ number: 1, happens: 'Opens the shop', kind: 'connection', acts: 'Fan to Web', lights: { arrow: 'person-fan->app-web', back: false } });
  // Checkout to the bank is held in the arrow's `back`: it travels from the arrow's end to its start.
  expect(step('charges')).toMatchObject({ acts: 'Checkout to Bank', lights: { arrow: 'system-bank->component-checkout', back: true } });
  expect(step('calls-back')).toMatchObject({ acts: 'Bank to Checkout', lights: { arrow: 'system-bank->component-checkout', back: false } });
});

test('a reply reads "replies to" with the number of its step, and lights its arrow back towards that step', () => {
  expect(step('link')).toMatchObject({
    number: 4,
    happens: 'A link',
    kind: 'reply',
    acts: 'Bank replies to Checkout',
    reply: { number: 3, words: 'Charges the card' },
    data: [{ id: 'data-payment', name: 'Payment' }],
    lights: { arrow: 'system-bank->component-checkout', back: false },
  });
});

test('steps in a row under one condition are one group, and the condition is said again where it comes again', () => {
  const read = steps().map((each) => [each.number, each.group ?? '', each.conditioned]);
  expect(read).toEqual([
    [1, '', false],
    [2, '', false],
    [3, 'Only when the fan pays by card', true],
    [4, '', true],
    [5, '', true],
    [6, '', false],
    [7, '', false],
    [8, 'Only when the fan pays by card', true],
  ]);
});

test('a strand names what it follows, and runs from its first step to the end or the next strand', () => {
  expect(steps().map((each) => [each.number, each.strand ?? '', each.inStrand])).toEqual([
    [1, '', false],
    [2, '', false],
    [3, '', false],
    [4, '', false],
    [5, '', false],
    [6, '', false],
    [7, 'Also after 2, Asks to pay', true],
    [8, '', true],
  ]);
  expect(step('tells')?.after).toEqual([{ number: 2, words: 'Asks to pay' }]);
  const more = file(
    'flows/flow-pays.yaml',
    'name: Paying\nstarts: A fan pays\nends: Paid\nfeature: feature-paying\nsteps:\n  - {id: opens, does: connection-fan-uses-web}\n  - {id: asks, does: connection-web-calls-checkout}\n  - {id: tells, after: [opens, asks], name: Tells the fan}\n',
  );
  const read = readModel([...SHOP.filter((each) => each.path !== 'flows/flow-pays.yaml'), more]);
  expect(flowSteps(read.records, 'flow-pays')?.steps[2]).toMatchObject({ strand: 'Also after 1 and 2', inStrand: true });
});

test('a step in a part, one with no place and one that runs a flow read as such; only the part is lit', () => {
  expect(step('keeps')).toMatchObject({ kind: 'part', acts: 'In Checkout', lights: { box: 'component-checkout' } });
  expect(step('tells')).toMatchObject({ kind: 'unplaced', acts: 'Where this happens is not known' });
  expect(step('tells')?.lights).toBeUndefined();
  expect(step('receipt')).toMatchObject({ kind: 'flow', happens: 'Sending a receipt', acts: 'Runs Sending a receipt', runs: 'flow-receipt' });
  expect(step('receipt')?.lights).toBeUndefined();
  // A box lights itself and the frames it is in; an arrow lights as a pick of it does.
  const view = flowView(records(), 'flow-pays');
  expect(litByStep(view, { box: 'component-checkout' })).toEqual({ boxes: ['system-shop', 'app-api', 'component-checkout'], arrows: [] });
  expect(litByStep(view, { arrow: 'person-fan->app-web', back: false })).toEqual({ boxes: ['person-fan', 'system-shop', 'app-web'], arrows: ['person-fan->app-web'] });
});

test('the head of a flow, with its feature', () => {
  expect(flowSteps(records(), 'flow-pays')).toMatchObject({ name: 'Paying for an order', starts: 'A fan pays', ends: 'The order is paid', only: 'in Europe', feature: { id: 'feature-paying', name: 'Paying' } });
  expect(flowSteps(records(), 'system-shop')).toBeUndefined();
});

test('a step whose `does` names nothing, and a reply to a step that is not there, say what can be said', () => {
  const broken = file(
    'flows/flow-broken.yaml',
    'name: Broken\nstarts: Something\nends: Nothing\nfeature: feature-lost\nsteps:\n  - {id: lost, does: connection-nowhere}\n  - {id: answer, reply: missing, name: An answer}\n',
  );
  const read = readModel([...SHOP, broken]);
  expect(read.problems.length).toBeGreaterThan(0);
  expect(flowSteps(read.records, 'flow-broken')).toMatchObject({
    feature: { id: 'feature-lost', name: 'feature-lost' },
    steps: [
      { number: 1, happens: 'lost', kind: 'unplaced', acts: 'Where this happens is not known', after: [] },
      { number: 2, happens: 'An answer', kind: 'unplaced', acts: 'Where this happens is not known' },
    ],
  });
  expect(flowView(read.records, 'flow-broken')).toEqual({ boxes: [], arrows: [] });
});

// ---- the items of a flow

const stored = (id: string, from: string, to: string, access: string, name: string): SourceFile => file(`connections/${id}.yaml`, `from: ${from}\nto: ${to}\naccess: ${access}\nname: ${name}\n`);

/**
 * A shop that keeps orders in a database and jobs in a queue. The web app writes the orders,
 * reads them, and touches them on a line that says no way; the worker changes them, either way,
 * takes the jobs, and notes in an audit store.
 */
const KEPT: SourceFile[] = [
  file('seefore.yaml', 'format: 1\nname: Kept\n'),
  file('systems/system-shop.yaml', 'name: Shop\n'),
  file('apps/app-web.yaml', 'name: Web\nin: system-shop\n'),
  file('apps/app-worker.yaml', 'name: Worker\nin: system-shop\n'),
  file('stores/store-orders.yaml', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('stores/store-jobs.yaml', 'name: Jobs\nin: system-shop\nkind: queue\n'),
  file('stores/store-audit.yaml', 'name: Audit\nin: system-shop\nkind: database\n'),
  stored('connection-web-writes-orders', 'app-web', 'store-orders', 'write', 'Keeps the order'),
  stored('connection-web-reads-orders', 'app-web', 'store-orders', 'read', 'Reads the order'),
  connection('connection-web-touches-orders', 'app-web', 'store-orders', 'Touches the order'),
  stored('connection-worker-changes-orders', 'app-worker', 'store-orders', 'read-write', 'Changes the order'),
  stored('connection-web-queues-jobs', 'app-web', 'store-jobs', 'write', 'Queues a job'),
  stored('connection-worker-takes-jobs', 'app-worker', 'store-jobs', 'read', 'Takes a job'),
  stored('connection-worker-notes-audit', 'app-worker', 'store-audit', 'write', 'Notes it'),
  connection('connection-web-wakes-worker', 'app-web', 'app-worker', 'Wakes the worker'),
  file('features/feature-orders.yaml', 'name: Orders\n'),
  file('data/data-order.yaml', 'name: Order\n'),
  file('data/data-job.yaml', 'name: Job\n'),
  file('data/data-note.yaml', 'name: Note\n'),
];

/** A flow of the kept shop: its steps, one to a line, and any more keys of its head. */
const flowOf = (id: string, steps: readonly string[], head = ''): SourceFile =>
  file(`flows/${id}.yaml`, `name: The flow ${id}\nstarts: Something happens\nends: It is done\nfeature: feature-orders\n${head}steps:\n${steps.map((each) => `  - ${each}\n`).join('')}`);
const kept = (...flows: SourceFile[]): ModelRecord[] => {
  const read = readModel([...KEPT, ...flows]);
  expect(read.problems).toEqual([]);
  return read.records;
};
/** Each item as `Data in Store: does number`, a `*` on an act that a flow the step runs does, and the item's condition after a bar. */
const items = (records: readonly ModelRecord[], flowId: string): string[] =>
  flowItems(records, flowId).map((item) => `${item.data.name} in ${item.store.name}: ${item.acts.map((act) => `${act.does} ${act.number}${act.byRun ? '*' : ''}`).join(', ')}${item.condition !== undefined ? ` | ${item.condition}` : ''}`);
/** What each item is at a place, with the step's word where it has one. */
const at = (records: readonly ModelRecord[], flowId: string, place: ItemPlace): string[] =>
  flowItems(records, flowId).map((item) => {
    const { is, word } = itemAt(item, place);
    return `${item.data.name} ${is}${word !== undefined ? ` ${word}` : ''}`;
  });

/** Puts an order, reads a note, queues a job and takes it; then names data where no way is said, and between two parts. */
const PLAIN = flowOf('flow-plain', [
  '{id: keeps, does: connection-web-writes-orders, data: [data-order]}',
  '{id: reads, does: connection-web-reads-orders, data: [data-note]}',
  '{id: queues, does: connection-web-queues-jobs, data: [data-job]}',
  '{id: takes, does: connection-worker-takes-jobs, removes: [data-job]}',
  '{id: touches, does: connection-web-touches-orders, data: [data-job]}',
  '{id: wakes, does: connection-web-wakes-worker, data: [data-order]}',
]);

test('a put, a read and a take give kept, only read and gone; data where no way is said, or between two parts, gives no item', () => {
  const records = kept(PLAIN);
  // No Job in Orders: step 5 says no way. Step 6 is between two apps.
  expect(items(records, 'flow-plain')).toEqual(['Order in Orders: put 1', 'Note in Orders: read 2', 'Job in Jobs: put 3, take 4']);
  expect(at(records, 'flow-plain', 'ends')).toEqual(['Order kept', 'Note only-read', 'Job gone']);
  // An act names the step of this flow, and the part that acts.
  expect(flowItems(records, 'flow-plain')[2]?.acts).toEqual([
    { number: 3, step: 'queues', does: 'put', part: { id: 'app-web', name: 'Web' }, byRun: false, order: 2 },
    { number: 4, step: 'takes', does: 'take', part: { id: 'app-worker', name: 'Worker' }, byRun: false, order: 3 },
  ]);
  expect(flowItems(records, 'flow-plain')[0]?.store).toEqual({ id: 'store-orders', name: 'Orders' });
});

test('an item is hollow before its first act, and at Ends what all its acts make it, with no word', () => {
  const records = kept(PLAIN);
  expect(at(records, 'flow-plain', 'starts')).toEqual(['Order hollow', 'Note hollow', 'Job hollow']);
  expect(at(records, 'flow-plain', 1)).toEqual(['Order kept Put', 'Note hollow', 'Job hollow']);
  expect(at(records, 'flow-plain', 2)).toEqual(['Order kept', 'Note only-read Read', 'Job hollow']);
  expect(at(records, 'flow-plain', 3)).toEqual(['Order kept', 'Note only-read', 'Job kept Put']);
  expect(at(records, 'flow-plain', 4)).toEqual(['Order kept', 'Note only-read', 'Job gone Gone']);
  expect(at(records, 'flow-plain', 6)).toEqual(['Order kept', 'Note only-read', 'Job gone']);
});

test('`removes` is a take whatever the way, also on a step that says none', () => {
  // The worker's line says `read-write`, and the step says no way of its own.
  const records = kept(flowOf('flow-clears', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: clears, does: connection-worker-changes-orders, removes: [data-order]}']));
  expect(items(records, 'flow-clears')).toEqual(['Order in Orders: put 1, take 2']);
  expect(at(records, 'flow-clears', 'ends')).toEqual(['Order gone']);
});

test('one id in both lists is a read and then a take: the step says "Gone"', () => {
  const records = kept(flowOf('flow-job', ['{id: queues, does: connection-web-queues-jobs, data: [data-job]}', '{id: takes, does: connection-worker-takes-jobs, data: [data-job], removes: [data-job]}']));
  expect(items(records, 'flow-job')).toEqual(['Job in Jobs: put 1, read 2, take 2']);
  expect(at(records, 'flow-job', 2)).toEqual(['Job gone Gone']);
});

test('a put after a take is kept again; a read after a take is kept where a put came before, and only read where none did', () => {
  const records = kept(
    flowOf('flow-again', [
      '{id: keeps, does: connection-web-writes-orders, data: [data-order, data-note]}',
      '{id: deletes, does: connection-worker-changes-orders, access: write, removes: [data-order, data-note]}',
      '{id: again, does: connection-web-writes-orders, data: [data-order]}',
      '{id: reads, does: connection-web-reads-orders, data: [data-note]}',
      '{id: takes, does: connection-worker-takes-jobs, removes: [data-job]}',
      '{id: looks, does: connection-worker-takes-jobs, data: [data-job]}',
    ]),
  );
  expect(items(records, 'flow-again')).toEqual(['Order in Orders: put 1, take 2, put 3', 'Note in Orders: put 1, take 2, read 4', 'Job in Jobs: take 5, read 6']);
  expect(at(records, 'flow-again', 2)).toEqual(['Order gone Gone', 'Note gone Gone', 'Job hollow']);
  expect(at(records, 'flow-again', 3)).toEqual(['Order kept Put', 'Note gone', 'Job hollow']);
  expect(at(records, 'flow-again', 'ends')).toEqual(['Order kept', 'Note kept', 'Job only-read']);
});

/** Notes in the audit store, which "The flow flow-main" does not draw, and in the orders. */
const NOTES = flowOf('flow-notes', ['{id: audits, does: connection-worker-notes-audit, data: [data-note]}', '{id: notes, does: connection-worker-changes-orders, access: write, data: [data-note]}'], 'only: for a big order\n');

test('a step that runs a flow acts at that step in a store this flow draws, and in no other', () => {
  const records = kept(NOTES, flowOf('flow-main', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: notes, does: flow-notes}']));
  expect(items(records, 'flow-main')).toEqual(['Order in Orders: put 1', 'Note in Orders: put 2*']);
  expect(flowItems(records, 'flow-main')[1]?.acts).toEqual([{ number: 2, step: 'notes', does: 'put', part: { id: 'app-worker', name: 'Worker' }, byRun: true, order: 1 }]);
  // The run flow's own page has both.
  expect(items(records, 'flow-notes')).toEqual(['Note in Audit: put 1', 'Note in Orders: put 2']);
});

test('through a flow that runs a flow, every act stands at the one step, under each condition on the way down', () => {
  const records = kept(
    flowOf('flow-deep', ['{id: takes, does: connection-worker-takes-jobs, data: [data-job], removes: [data-job], only: when a job waits}']),
    flowOf('flow-middle', ['{id: deep, does: flow-deep, only: when the worker is awake}', '{id: keeps, does: connection-web-writes-orders, data: [data-order]}']),
    flowOf('flow-top', ['{id: queues, does: connection-web-queues-jobs, data: [data-job]}', '{id: works, does: flow-middle, only: at night}']),
  );
  // Orders is not drawn by the top flow: what the middle flow keeps there stays on its own page.
  expect(items(records, 'flow-top')).toEqual(['Job in Jobs: put 1, read 2*, take 2*']);
  expect(flowItems(records, 'flow-top')[0]?.acts.map((act) => act.only)).toEqual([undefined, 'at night and when the worker is awake and when a job waits', 'at night and when the worker is awake and when a job waits']);
  expect(at(records, 'flow-top', 2)).toEqual(['Job gone Gone']);
});

test('a flow run twice acts twice, once at each of its two steps', () => {
  const records = kept(NOTES, flowOf('flow-twice', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: first, does: flow-notes}', '{id: reads, does: connection-web-reads-orders, data: [data-note]}', '{id: second, does: flow-notes}']));
  expect(items(records, 'flow-twice')).toEqual(['Order in Orders: put 1', 'Note in Orders: put 2*, read 3, put 4*']);
  expect(flowItems(records, 'flow-twice')[1]?.acts.map((act) => act.step)).toEqual(['first', 'reads', 'second']);
});

test('the acts of one step on two items say which comes first, where the items, by their first act, stand the other way', () => {
  const records = kept(
    flowOf('flow-both', ['{id: queues, does: connection-web-queues-jobs, data: [data-job]}', '{id: reads, does: connection-web-reads-orders, data: [data-order]}']),
    flowOf('flow-first', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: both, does: flow-both}', '{id: looks, does: connection-worker-takes-jobs, data: [data-job]}']),
  );
  expect(items(records, 'flow-first')).toEqual(['Order in Orders: put 1, read 2*', 'Job in Jobs: put 2*, read 3']);
  const second = flowItems(records, 'flow-first').flatMap((item) => item.acts.filter((act) => act.number === 2).map((act) => ({ order: act.order, does: `${act.does} ${item.data.name}` })));
  expect(second.sort((a, b) => a.order - b.order).map((act) => act.does)).toEqual(['put Job', 'read Order']);
});

test('a flow that runs itself does not loop: a flow already on the way down does nothing', () => {
  const read = readModel([
    ...KEPT,
    flowOf('flow-ping', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: pong, does: flow-pong}']),
    flowOf('flow-pong', ['{id: reads, does: connection-web-reads-orders, data: [data-order]}', '{id: ping, does: flow-ping}']),
    flowOf('flow-self', ['{id: keeps, does: connection-web-writes-orders, data: [data-order]}', '{id: again, does: flow-self}']),
  ]);
  expect(read.problems.map((problem) => problem.rule)).toEqual(['flow-in-itself', 'flow-in-itself']);
  expect(items(read.records, 'flow-ping')).toEqual(['Order in Orders: put 1, read 2*']);
  expect(items(read.records, 'flow-pong')).toEqual(['Order in Orders: read 1, put 2*']);
  expect(items(read.records, 'flow-self')).toEqual(['Order in Orders: put 1']);
  expect(flowView(read.records, 'flow-self').boxes.find((box) => box.id === 'store-orders')?.rows).toBe(1);
});

test("an item is under a condition only when every act on it is; a run step's `only` counts, a flow's own does not; two conditions are said in order", () => {
  const records = kept(
    NOTES,
    flowOf(
      'flow-maybe',
      [
        '{id: keeps, does: connection-web-writes-orders, data: [data-order], only: when the fan pays}',
        '{id: reads, does: connection-web-reads-orders, data: [data-order], only: when the fan looks}',
        '{id: queues, does: connection-web-queues-jobs, data: [data-job], only: when the fan pays}',
        '{id: takes, does: connection-worker-takes-jobs, data: [data-job], removes: [data-job]}',
        '{id: notes, does: flow-notes, only: when asked}',
        '{id: checks, does: connection-web-reads-orders, data: [data-order], only: when the fan pays}',
      ],
      'only: in Europe\n',
    ),
  );
  expect(items(records, 'flow-maybe')).toEqual([
    'Order in Orders: put 1, read 2, read 6 | Only when the fan pays; only when the fan looks',
    'Job in Jobs: put 3, read 4, take 4',
    'Note in Orders: put 5* | Only when asked',
  ]);
});

test('a step whose flow puts an item and takes it says "Gone", not "Put"', () => {
  const records = kept(
    flowOf('flow-passes', ['{id: queues, does: connection-web-queues-jobs, data: [data-job]}', '{id: takes, does: connection-worker-takes-jobs, data: [data-job], removes: [data-job]}']),
    flowOf('flow-passing', ['{id: queues, does: connection-web-queues-jobs, data: [data-job]}', '{id: passes, does: flow-passes}']),
  );
  expect(items(records, 'flow-passing')).toEqual(['Job in Jobs: put 1, put 2*, read 2*, take 2*']);
  expect(at(records, 'flow-passing', 2)).toEqual(['Job gone Gone']);
});

test('one step that reads and puts one item says "Put"', () => {
  const records = kept(
    flowOf('flow-rework', ['{id: reads, does: connection-worker-changes-orders, access: read, data: [data-order]}', '{id: writes, does: connection-worker-changes-orders, access: write, data: [data-order]}']),
    flowOf('flow-outer', ['{id: looks, does: connection-web-reads-orders, data: [data-note]}', '{id: rework, does: flow-rework}']),
  );
  // Step 1 draws the orders store: a flow that only runs another draws none, and holds no item.
  expect(items(records, 'flow-outer')).toEqual(['Note in Orders: read 1', 'Order in Orders: read 2*, put 2*']);
  expect(at(records, 'flow-outer', 2)).toEqual(['Note only-read', 'Order kept Put']);
});

test("the items stand by their first act, and a store's box says how many it holds", () => {
  const records = kept(
    flowOf('flow-order', [
      '{id: queues, does: connection-web-queues-jobs, data: [data-job]}',
      '{id: reads, does: connection-web-reads-orders, data: [data-note]}',
      '{id: keeps, does: connection-web-writes-orders, data: [data-order, data-note]}',
    ]),
    flowOf('flow-none', ['{id: touches, does: connection-web-touches-orders, data: [data-order]}']),
  );
  expect(items(records, 'flow-order')).toEqual(['Job in Jobs: put 1', 'Note in Orders: read 2, put 3', 'Order in Orders: put 3']);
  const rows = (view: View) => view.boxes.flatMap((box) => (box.rows !== undefined ? [`${box.id} ${box.rows}`] : []));
  expect(rows(flowView(records, 'flow-order'))).toEqual(['store-jobs 1', 'store-orders 2']);
  // A store that holds none has no rows; nor has a box of the whole model.
  expect(flowView(records, 'flow-none').boxes.map((box) => box.id)).toContain('store-orders');
  expect(rows(flowView(records, 'flow-none'))).toEqual([]);
  expect(rows(viewOf(records, 'containers'))).toEqual([]);
  expect(flowItems(records, 'flow-nothing')).toEqual([]);
});
