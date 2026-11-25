import { expect, test } from 'vitest';
import { flowSteps, flowView, litByStep } from '../src/model/flow.ts';
import type { FlowStep } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
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
