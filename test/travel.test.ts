import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { travelOf } from '../src/model/travel.ts';

const file = (path: string, text: string): SourceFile => ({ path, text });
const connection = (id: string, from: string, to: string, name: string): SourceFile => file(`connections/${id}.yaml`, `from: ${from}\nto: ${to}\nname: ${name}\n`);

/**
 * A fan pays through a shop and a bank. "Paying" has two flows and states a clerk and a line the
 * flows walk too; "Stock" has one flow, inside the store; "Refunds" has none.
 */
const SHOP: SourceFile[] = [
  file('seefore.yaml', 'format: 1\nname: Shop\n'),
  file('people/fan.yaml', 'name: Fan\n'),
  file('people/clerk.yaml', 'name: Clerk\n'),
  file('systems/shop.yaml', 'name: Shop\n'),
  file('systems/bank.yaml', 'name: Bank\nexternal: true\n'),
  file('apps/web.yaml', 'name: Web\nin: shop\n'),
  file('apps/api.yaml', 'name: API\nin: shop\n'),
  file('stores/orders.yaml', 'name: Orders\nin: shop\n'),
  connection('fan-uses-web', 'fan', 'web', 'Opens the shop'),
  connection('web-calls-api', 'web', 'api', 'Asks to pay'),
  connection('api-pays', 'api', 'bank', 'Charges the card'),
  connection('api-keeps-orders', 'api', 'orders', 'Keeps the order'),
  file('connections/web-reads-orders.yaml', 'from: web\nto: orders\nname: Shows the orders\naccess: read\n'),
  file('data/payment.yaml', 'name: Payment\n'),
  file('data/order.yaml', 'name: Order\n'),
  file('features/paying.yaml', 'name: Paying\ntouches: [clerk, api-keeps-orders]\n'),
  file('features/stock.yaml', 'name: Stock\n'),
  file('features/refunds.yaml', 'name: Refunds\ntouches: [orders]\n'),
  file(
    'flows/pays.yaml',
    `name: Paying for an order
starts: A fan pays
ends: The order is paid
feature: paying
steps:
  - {id: opens, does: fan-uses-web}
  - {id: asks, does: web-calls-api, data: [order]}
  - {id: charges, does: api-pays, data: [payment]}
  - {id: link, reply: charges, name: A link, data: [payment]}
  - {id: keeps, does: api, name: Keeps the payment}
  - {id: tells, reply: asks, name: Tells the fan, data: [payment]}
`,
  ),
  file(
    'flows/saves.yaml',
    'name: Saving an order\nstarts: A paid order\nends: It is kept and shown\nfeature: paying\nsteps:\n  - {id: saves, does: api-keeps-orders, data: [order]}\n  - {id: shows, does: web-reads-orders, data: [order]}\n',
  ),
  file('flows/checks.yaml', 'name: Checking stock\nstarts: A clerk asks\nends: The stock is known\nfeature: stock\nsteps:\n  - {id: counts, does: orders, name: Counts the orders}\n'),
];

const travel = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return travelOf(read.records);
};
const ids = (records: readonly { id: string }[]) => records.map((record) => record.id);

test("a feature's parts from its flows are each end and each part a step is in, once, people first and then in the order of the tree; those stated on it are as written", () => {
  const paying = travel().feature('paying');
  expect(paying.flows).toEqual([
    { id: 'pays', steps: 6 },
    { id: 'saves', steps: 2 },
  ]);
  expect(ids(paying.fromFlows)).toEqual(['fan', 'bank', 'api', 'web', 'orders']);
  expect(paying.stated).toEqual(['clerk', 'api-keeps-orders']);
  expect(ids(paying.data)).toEqual(['order', 'payment']);
  // A feature with no flow has only what is stated on it.
  expect(travel().feature('refunds')).toEqual({ flows: [], fromFlows: [], stated: ['orders'], people: [], data: [] });
});

test('the people a feature is for are those among its parts from its flows and those stated on it; a reference to nothing is not followed', () => {
  expect(ids(travel().feature('paying').people)).toEqual(['clerk', 'fan']);
  expect(travel().feature('stock').people).toEqual([]);
  // `seefore check` finds the id that names nothing; the page still reads the rest.
  const broken = travelOf(readModel([...SHOP, file('features/lost.yaml', 'name: Lost\ntouches: [nobody, fan]\n')]).records);
  expect(broken.feature('lost')).toMatchObject({ stated: ['nobody', 'fan'], people: [{ id: 'fan' }] });
});

test('the flows through a part: a step on a connection that ends at it, or a step in it, each flow once with its feature', () => {
  const through = travel();
  expect(through.flowsThrough('orders')).toEqual([
    { flow: 'checks', feature: 'stock' },
    { flow: 'saves', feature: 'paying' },
  ]);
  expect(through.flowsThrough('api')).toEqual([
    { flow: 'pays', feature: 'paying' },
    { flow: 'saves', feature: 'paying' },
  ]);
  expect(through.flowsThrough('fan')).toEqual([{ flow: 'pays', feature: 'paying' }]);
  expect(through.flowsThrough('web')).toEqual([
    { flow: 'pays', feature: 'paying' },
    { flow: 'saves', feature: 'paying' },
  ]);
  // A system no connection ends at has no flow through it, though its apps do.
  expect(through.flowsThrough('shop')).toEqual([]);
  expect(through.flowsThrough('clerk')).toEqual([]);
});

test('the data seen on a connection goes from its start to its end, on a reply back, and on a read from the store; the steps on it include the replies', () => {
  const on = travel();
  expect(on.dataOn('api-pays')).toEqual([
    { data: 'payment', from: 'api', to: 'bank', back: false },
    { data: 'payment', from: 'bank', to: 'api', back: true },
  ]);
  expect(on.dataOn('web-calls-api')).toEqual([
    { data: 'order', from: 'web', to: 'api', back: false },
    { data: 'payment', from: 'api', to: 'web', back: true },
  ]);
  expect(on.dataOn('web-reads-orders')).toEqual([{ data: 'order', from: 'orders', to: 'web', back: false }]);
  expect(on.dataOn('fan-uses-web')).toEqual([]);
  expect(on.stepsOn('api-pays').map((step) => `${step.flow}#${step.step} ${step.number} ${step.happens}`)).toEqual(['pays#charges 3 Charges the card', 'pays#link 4 A link']);
});

test('a data record is named by its steps, the flows by name and the steps in order, and is seen on each connection once a way', () => {
  const data = travel();
  expect(data.stepsWith('payment')).toEqual([
    { flow: 'pays', flowName: 'Paying for an order', step: 'charges', number: 3, happens: 'Charges the card' },
    { flow: 'pays', flowName: 'Paying for an order', step: 'link', number: 4, happens: 'A link' },
    { flow: 'pays', flowName: 'Paying for an order', step: 'tells', number: 6, happens: 'Tells the fan' },
  ]);
  expect(data.stepsWith('order').map((step) => `${step.flow}#${step.step}`)).toEqual(['pays#asks', 'saves#saves', 'saves#shows']);
  const ways = (id: string) => data.waysOf(id).map((way) => `${way.connection}: ${way.back ? 'back from ' : ''}${way.from} to ${way.to}`);
  expect(ways('payment')).toEqual(['api-pays: api to bank', 'api-pays: back from bank to api', 'web-calls-api: back from api to web']);
  expect(ways('order')).toEqual(['web-calls-api: web to api', 'api-keeps-orders: api to orders', 'web-reads-orders: orders to web']);
});
