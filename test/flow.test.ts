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
  file('people/fan.yaml', 'name: Fan\n'),
  file('systems/shop.yaml', 'name: Shop\n'),
  file('systems/bank.yaml', 'name: Bank\nexternal: true\n'),
  file('systems/mailer.yaml', 'name: Mailer\nexternal: true\n'),
  file('apps/web.yaml', 'name: Web\nin: shop\n'),
  file('apps/api.yaml', 'name: API\nin: shop\n'),
  file('components/checkout.yaml', 'name: Checkout\nin: api\n'),
  file('components/cart.yaml', 'name: Cart\nin: api\n'),
  file('stores/orders.yaml', 'name: Orders\nin: shop\n'),
  connection('fan-uses-web', 'fan', 'web', 'Opens the shop'),
  connection('web-calls-checkout', 'web', 'checkout', 'Asks to pay'),
  connection('checkout-pays', 'checkout', 'bank', 'Charges the card'),
  connection('bank-calls-back', 'bank', 'checkout', 'Reports the payment'),
  connection('web-reads-orders', 'web', 'orders', 'Reads the orders'),
  connection('cart-mails', 'cart', 'mailer', 'Mails a receipt'),
  file('features/paying.yaml', 'name: Paying\n'),
  file('features/accounts.yaml', 'name: Accounts\n'),
  file('data/payment.yaml', 'name: Payment\n'),
  file(
    'flows/pays.yaml',
    `name: Paying for an order
starts: A fan pays
ends: The order is paid
only: in Europe
feature: paying
steps:
  - {id: opens, does: fan-uses-web}
  - {id: asks, does: web-calls-checkout}
  - {id: charges, does: checkout-pays, only: when the fan pays by card}
  - {id: link, reply: charges, name: A link, only: when the fan pays by card, data: [payment]}
  - {id: calls-back, does: bank-calls-back, only: when the fan pays by card}
  - {id: keeps, does: checkout, name: Keeps the payment}
  - {id: tells, after: [asks], name: Tells the fan}
  - {id: receipt, does: receipt, only: when the fan pays by card}
`,
  ),
  file('flows/receipt.yaml', 'name: Sending a receipt\nstarts: A payment\nends: A receipt is sent\nfeature: paying\nsteps:\n  - {id: mails, does: cart-mails}\n'),
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
const steps = (...files: SourceFile[]): FlowStep[] => flowSteps(records(...files), 'pays')?.steps ?? [];
const step = (id: string, ...files: SourceFile[]): FlowStep | undefined => steps(...files).find((each) => each.id === id);

test("the view of a flow holds the lines its steps walk, their ends, the parts it happens in and their frames, and nothing else", () => {
  expect(drawn(flowView(records(), 'pays'))).toEqual({
    // No orders, no cart, no mailer: the flow it runs adds nothing.
    boxes: ['fan', 'bank', '[shop]', '[api] in shop', 'web in shop', 'checkout in api'],
    // The two ways between Checkout and the bank are one arrow, from the box that comes first.
    arrows: ['fan > web: fan-uses-web', 'bank > checkout: bank-calls-back < checkout-pays', 'web > checkout: web-calls-checkout'],
  });
  expect(flowView(records(), 'receipt').boxes.map((box) => box.id)).toEqual(['mailer', 'shop', 'api', 'cart']);
  expect(flowView(records(), 'nothing')).toEqual({ boxes: [], arrows: [] });
});

test('a step on a connection says who acts on what, and lights its arrow the way it travels', () => {
  expect(step('opens')).toMatchObject({ number: 1, happens: 'Opens the shop', kind: 'connection', acts: 'Fan to Web', lights: { arrow: 'fan->web', back: false } });
  // Checkout to the bank is held in the arrow's `back`: it travels from the arrow's end to its start.
  expect(step('charges')).toMatchObject({ acts: 'Checkout to Bank', lights: { arrow: 'bank->checkout', back: true } });
  expect(step('calls-back')).toMatchObject({ acts: 'Bank to Checkout', lights: { arrow: 'bank->checkout', back: false } });
});

test('a reply reads "replies to" with the number of its step, and lights its arrow back towards that step', () => {
  expect(step('link')).toMatchObject({
    number: 4,
    happens: 'A link',
    kind: 'reply',
    acts: 'Bank replies to Checkout',
    reply: { number: 3, words: 'Charges the card' },
    data: [{ id: 'payment', name: 'Payment' }],
    lights: { arrow: 'bank->checkout', back: false },
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
    'flows/pays.yaml',
    'name: Paying\nstarts: A fan pays\nends: Paid\nfeature: paying\nsteps:\n  - {id: opens, does: fan-uses-web}\n  - {id: asks, does: web-calls-checkout}\n  - {id: tells, after: [opens, asks], name: Tells the fan}\n',
  );
  const read = readModel([...SHOP.filter((each) => each.path !== 'flows/pays.yaml'), more]);
  expect(flowSteps(read.records, 'pays')?.steps[2]).toMatchObject({ strand: 'Also after 1 and 2', inStrand: true });
});

test('a step in a part, one with no place and one that runs a flow read as such; only the part is lit', () => {
  expect(step('keeps')).toMatchObject({ kind: 'part', acts: 'In Checkout', lights: { box: 'checkout' } });
  expect(step('tells')).toMatchObject({ kind: 'unplaced', acts: 'Where this happens is not known' });
  expect(step('tells')?.lights).toBeUndefined();
  expect(step('receipt')).toMatchObject({ kind: 'flow', happens: 'Sending a receipt', acts: 'Runs Sending a receipt', runs: 'receipt' });
  expect(step('receipt')?.lights).toBeUndefined();
  // A box lights itself and the frames it is in; an arrow lights as a pick of it does.
  const view = flowView(records(), 'pays');
  expect(litByStep(view, { box: 'checkout' })).toEqual({ boxes: ['shop', 'api', 'checkout'], arrows: [] });
  expect(litByStep(view, { arrow: 'fan->web', back: false })).toEqual({ boxes: ['fan', 'shop', 'web'], arrows: ['fan->web'] });
});

test('the head of a flow, with its feature', () => {
  expect(flowSteps(records(), 'pays')).toMatchObject({ name: 'Paying for an order', starts: 'A fan pays', ends: 'The order is paid', only: 'in Europe', feature: { id: 'paying', name: 'Paying' } });
  expect(flowSteps(records(), 'shop')).toBeUndefined();
});

test('a step whose `does` names nothing, and a reply to a step that is not there, say what can be said', () => {
  const broken = file(
    'flows/broken.yaml',
    'name: Broken\nstarts: Something\nends: Nothing\nfeature: lost\nsteps:\n  - {id: lost, does: nowhere}\n  - {id: answer, reply: missing, name: An answer}\n',
  );
  const read = readModel([...SHOP, broken]);
  expect(read.problems.length).toBeGreaterThan(0);
  expect(flowSteps(read.records, 'broken')).toMatchObject({
    feature: { id: 'lost', name: 'lost' },
    steps: [
      { number: 1, happens: 'lost', kind: 'unplaced', acts: 'Where this happens is not known', after: [] },
      { number: 2, happens: 'An answer', kind: 'unplaced', acts: 'Where this happens is not known' },
    ],
  });
  expect(flowView(read.records, 'broken')).toEqual({ boxes: [], arrows: [] });
});
