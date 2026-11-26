import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { travelOf } from '../src/model/travel.ts';
import type { KeptAct } from '../src/model/travel.ts';

const file = (path: string, text: string): SourceFile => ({ path, text });
const connection = (id: string, from: string, to: string, name: string): SourceFile => file(`connections/${id}.yaml`, `from: ${from}\nto: ${to}\nname: ${name}\n`);

/**
 * A fan pays through a shop and a bank. "Paying" has two flows and states a clerk and a line the
 * flows walk too; "Stock" has one flow, inside the store; "Refunds" has none.
 */
const SHOP: SourceFile[] = [
  file('seefore.yaml', 'format: 1\nname: Shop\n'),
  file('people/person-fan.yaml', 'name: Fan\n'),
  file('people/person-clerk.yaml', 'name: Clerk\n'),
  file('systems/system-shop.yaml', 'name: Shop\n'),
  file('systems/system-bank.yaml', 'name: Bank\nexternal: true\n'),
  file('apps/app-web.yaml', 'name: Web\nin: system-shop\n'),
  file('apps/app-api.yaml', 'name: API\nin: system-shop\n'),
  file('stores/store-orders.yaml', 'name: Orders\nin: system-shop\n'),
  connection('connection-fan-uses-web', 'person-fan', 'app-web', 'Opens the shop'),
  connection('connection-web-calls-api', 'app-web', 'app-api', 'Asks to pay'),
  connection('connection-api-pays', 'app-api', 'system-bank', 'Charges the card'),
  connection('connection-api-keeps-orders', 'app-api', 'store-orders', 'Keeps the order'),
  file('connections/connection-web-reads-orders.yaml', 'from: app-web\nto: store-orders\nname: Shows the orders\naccess: read\n'),
  file('data/data-payment.yaml', 'name: Payment\n'),
  file('data/data-order.yaml', 'name: Order\n'),
  file('features/feature-paying.yaml', 'name: Paying\ntouches: [person-clerk, connection-api-keeps-orders]\n'),
  file('features/feature-stock.yaml', 'name: Stock\n'),
  file('features/feature-refunds.yaml', 'name: Refunds\ntouches: [store-orders]\n'),
  file(
    'flows/flow-pays.yaml',
    `name: Paying for an order
starts: A fan pays
ends: The order is paid
feature: feature-paying
steps:
  - {id: opens, does: connection-fan-uses-web}
  - {id: asks, does: connection-web-calls-api, data: [data-order]}
  - {id: charges, does: connection-api-pays, data: [data-payment]}
  - {id: link, reply: charges, name: A link, data: [data-payment]}
  - {id: keeps, does: app-api, name: Keeps the payment}
  - {id: tells, reply: asks, name: Tells the fan, data: [data-payment]}
`,
  ),
  file(
    'flows/flow-saves.yaml',
    'name: Saving an order\nstarts: A paid order\nends: It is kept and shown\nfeature: feature-paying\nsteps:\n  - {id: saves, does: connection-api-keeps-orders, data: [data-order]}\n  - {id: shows, does: connection-web-reads-orders, data: [data-order]}\n',
  ),
  file('flows/flow-checks.yaml', 'name: Checking stock\nstarts: A clerk asks\nends: The stock is known\nfeature: feature-stock\nsteps:\n  - {id: counts, does: store-orders, name: Counts the orders}\n'),
];

const travel = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return travelOf(read.records);
};
const ids = (records: readonly { id: string }[]) => records.map((record) => record.id);

test("a feature's parts from its flows are each end and each part a step is in, once, people first and then in the order of the tree; those stated on it are as written", () => {
  const paying = travel().feature('feature-paying');
  expect(paying.flows).toEqual([
    { id: 'flow-pays', steps: 6 },
    { id: 'flow-saves', steps: 2 },
  ]);
  expect(ids(paying.fromFlows)).toEqual(['person-fan', 'system-bank', 'app-api', 'app-web', 'store-orders']);
  expect(paying.stated).toEqual(['person-clerk', 'connection-api-keeps-orders']);
  expect(ids(paying.data)).toEqual(['data-order', 'data-payment']);
  // A feature with no flow has only what is stated on it.
  expect(travel().feature('feature-refunds')).toEqual({ flows: [], fromFlows: [], stated: ['store-orders'], people: [], data: [] });
});

test('the people a feature is for are those among its parts from its flows and those stated on it; a reference to nothing is not followed', () => {
  expect(ids(travel().feature('feature-paying').people)).toEqual(['person-clerk', 'person-fan']);
  expect(travel().feature('feature-stock').people).toEqual([]);
  // `seefore check` finds the id that names nothing; the page still reads the rest.
  const broken = travelOf(readModel([...SHOP, file('features/feature-lost.yaml', 'name: Lost\ntouches: [person-nobody, person-fan]\n')]).records);
  expect(broken.feature('feature-lost')).toMatchObject({ stated: ['person-nobody', 'person-fan'], people: [{ id: 'person-fan' }] });
});

test('the flows through a part: a step on a connection that ends at it or at something it holds, or a step in it, each flow once with its feature', () => {
  const through = travel();
  expect(through.flowsThrough('store-orders')).toEqual([
    { flow: 'flow-checks', feature: 'feature-stock' },
    { flow: 'flow-saves', feature: 'feature-paying' },
  ]);
  expect(through.flowsThrough('app-api')).toEqual([
    { flow: 'flow-pays', feature: 'feature-paying' },
    { flow: 'flow-saves', feature: 'feature-paying' },
  ]);
  expect(through.flowsThrough('person-fan')).toEqual([{ flow: 'flow-pays', feature: 'feature-paying' }]);
  expect(through.flowsThrough('app-web')).toEqual([
    { flow: 'flow-pays', feature: 'feature-paying' },
    { flow: 'flow-saves', feature: 'feature-paying' },
  ]);
  // A system has the flows through what it holds, each once.
  expect(through.flowsThrough('system-shop').map((each) => each.flow)).toEqual(['flow-checks', 'flow-pays', 'flow-saves']);
  expect(through.flowsThrough('person-clerk')).toEqual([]);
});

test('the data seen on a connection goes from its start to its end, on a reply back, and on a read from the store; the steps on it include the replies', () => {
  const on = travel();
  expect(on.dataOn('connection-api-pays')).toEqual([
    { data: 'data-payment', from: 'app-api', to: 'system-bank', back: false },
    { data: 'data-payment', from: 'system-bank', to: 'app-api', back: true },
  ]);
  expect(on.dataOn('connection-web-calls-api')).toEqual([
    { data: 'data-order', from: 'app-web', to: 'app-api', back: false },
    { data: 'data-payment', from: 'app-api', to: 'app-web', back: true },
  ]);
  expect(on.dataOn('connection-web-reads-orders')).toEqual([{ data: 'data-order', from: 'store-orders', to: 'app-web', back: false }]);
  expect(on.dataOn('connection-fan-uses-web')).toEqual([]);
  expect(on.stepsOn('connection-api-pays').map((step) => `${step.flow}#${step.step} ${step.number} ${step.happens}`)).toEqual(['flow-pays#charges 3 Charges the card', 'flow-pays#link 4 A link']);
});

test('the steps in a part are those that name it, not those on a connection that ends at it or at what it holds', () => {
  const steps = travel();
  expect(steps.stepsIn('app-api')).toEqual([{ flow: 'flow-pays', flowName: 'Paying for an order', step: 'keeps', number: 5, happens: 'Keeps the payment' }]);
  expect(steps.stepsIn('store-orders').map((step) => `${step.flow}#${step.step} ${step.number} ${step.happens}`)).toEqual(['flow-checks#counts 1 Counts the orders']);
  expect([steps.stepsIn('app-web'), steps.stepsIn('system-shop'), steps.stepsIn('store-nowhere')]).toEqual([[], [], []]);
});

test("`access: read` on a step turns its data round on a connection's page and a data record's; with no way said both show it as today; what a step only removes does not travel, and is among its feature's data", () => {
  const on = travel(
    file('connections/connection-api-uses-orders.yaml', 'from: app-api\nto: store-orders\naccess: read-write\nname: Uses the orders\n'),
    file('data/data-refund.yaml', 'name: Refund\n'),
    file(
      'flows/flow-refunds.yaml',
      [
        'name: Refunding an order',
        'starts: A fan asks for the money back',
        'ends: The order is refunded',
        'feature: feature-refunds',
        'steps:',
        '  - {id: finds, does: connection-api-uses-orders, access: read, data: [data-order]}',
        '  - {id: notes, does: connection-api-uses-orders, data: [data-payment]}',
        '  - {id: clears, does: connection-api-uses-orders, access: write, removes: [data-refund]}',
        '',
      ].join('\n'),
    ),
  );
  expect(on.dataOn('connection-api-uses-orders')).toEqual([
    { data: 'data-order', from: 'store-orders', to: 'app-api', back: false },
    { data: 'data-payment', from: 'app-api', to: 'store-orders', back: false },
  ]);
  expect(on.waysOf('data-order')).toContainEqual({ connection: 'connection-api-uses-orders', from: 'store-orders', to: 'app-api', back: false });
  expect(on.waysOf('data-payment')).toContainEqual({ connection: 'connection-api-uses-orders', from: 'app-api', to: 'store-orders', back: false });
  // A read the connection says goes as it did.
  expect(on.dataOn('connection-web-reads-orders')).toEqual([{ data: 'data-order', from: 'store-orders', to: 'app-web', back: false }]);
  expect([on.stepsWith('data-refund'), on.waysOf('data-refund')]).toEqual([[], []]);
  expect(on.stepsOn('connection-api-uses-orders').map((step) => step.step)).toEqual(['finds', 'notes', 'clears']);
  expect(ids(on.feature('feature-refunds').data)).toEqual(['data-order', 'data-payment', 'data-refund']);
});

test('a data record is named by its steps, the flows by name and the steps in order, and is seen on each connection once a way', () => {
  const data = travel();
  expect(data.stepsWith('data-payment')).toEqual([
    { flow: 'flow-pays', flowName: 'Paying for an order', step: 'charges', number: 3, happens: 'Charges the card' },
    { flow: 'flow-pays', flowName: 'Paying for an order', step: 'link', number: 4, happens: 'A link' },
    { flow: 'flow-pays', flowName: 'Paying for an order', step: 'tells', number: 6, happens: 'Tells the fan' },
  ]);
  expect(data.stepsWith('data-order').map((step) => `${step.flow}#${step.step}`)).toEqual(['flow-pays#asks', 'flow-saves#saves', 'flow-saves#shows']);
  const ways = (id: string) => data.waysOf(id).map((way) => `${way.connection}: ${way.back ? 'back from ' : ''}${way.from} to ${way.to}`);
  expect(ways('data-payment')).toEqual(['connection-api-pays: app-api to system-bank', 'connection-api-pays: back from system-bank to app-api', 'connection-web-calls-api: back from app-api to app-web']);
  expect(ways('data-order')).toEqual(['connection-web-calls-api: app-web to app-api', 'connection-api-keeps-orders: app-api to store-orders', 'connection-web-reads-orders: store-orders to app-web']);
});

/**
 * The API writes payments and orders and queues jobs; the web app reads the orders and takes the
 * jobs off their queue. "Answering" runs the flow that queues, and reads a payment itself.
 */
const KEPT: SourceFile[] = [
  file('stores/store-jobs.yaml', 'name: Jobs\nin: system-shop\nkind: queue\n'),
  file('connections/connection-api-writes-orders.yaml', 'from: app-api\nto: store-orders\naccess: write\nname: Writes the order\n'),
  file('connections/connection-api-queues-jobs.yaml', 'from: app-api\nto: store-jobs\naccess: write\nname: Queues a job\n'),
  file('connections/connection-web-takes-jobs.yaml', 'from: app-web\nto: store-jobs\naccess: read\nname: Takes a job\n'),
  file('data/data-job.yaml', 'name: Job\n'),
  file(
    'flows/flow-queues.yaml',
    [
      'name: Queuing a job',
      'starts: An order is paid',
      'ends: A job waits, and is taken',
      'feature: feature-stock',
      'steps:',
      '  - {id: writes, does: connection-api-writes-orders, data: [data-payment, data-order]}',
      '  - {id: queues, does: connection-api-queues-jobs, data: [data-job, data-payment]}',
      '  - {id: takes, does: connection-web-takes-jobs, data: [data-job], removes: [data-job]}',
      '',
    ].join('\n'),
  ),
  file(
    'flows/flow-answers.yaml',
    ['name: Answering', 'starts: A fan asks', 'ends: The fan is answered', 'feature: feature-stock', 'steps:', '  - {id: queues, does: flow-queues}', '  - {id: looks, does: connection-web-reads-orders, data: [data-payment]}', ''].join('\n'),
  ),
];
/** Each act as `data or store: does by part, flow step`. */
const said = (acts: readonly KeptAct[], first: 'data' | 'store') => acts.map((act) => `${act[first]}: ${act.does} by ${act.by}, ${act.flowName} ${act.number}`);

test("the acts at a store stand by the data's name, then the flow's, then the step's number, each with the part that acts; a step that says no way makes none", () => {
  // "Saving an order" writes the order on a line that says no way: only its read stands.
  expect(said(travel(...KEPT).keptHere('store-orders'), 'data')).toEqual([
    'data-order: put by app-api, Queuing a job 1',
    'data-order: read by app-web, Saving an order 2',
    'data-payment: read by app-web, Answering 2',
    'data-payment: put by app-api, Queuing a job 1',
  ]);
  expect(travel(...KEPT).keptHere('app-api')).toEqual([]);
});

test('an act that a flow it runs does stands under the flow it runs alone, once', () => {
  const kept = travel(...KEPT);
  expect(kept.keptIn('data-job').map((act) => `${act.flow}#${act.step}`)).toEqual(['flow-queues#queues', 'flow-queues#takes', 'flow-queues#takes']);
  expect([...kept.keptHere('store-orders'), ...kept.keptHere('store-jobs')].filter((act) => act.flow === 'flow-answers').map((act) => act.step)).toEqual(['looks']);
});

test("a read and a take of one step are two acts, the read first; a data record's acts stand by the store's name", () => {
  const kept = travel(...KEPT);
  expect(said(kept.keptHere('store-jobs'), 'data')).toEqual(['data-job: put by app-api, Queuing a job 2', 'data-job: read by app-web, Queuing a job 3', 'data-job: take by app-web, Queuing a job 3', 'data-payment: put by app-api, Queuing a job 2']);
  expect(said(kept.keptIn('data-payment'), 'store')).toEqual(['store-jobs: put by app-api, Queuing a job 2', 'store-orders: read by app-web, Answering 2', 'store-orders: put by app-api, Queuing a job 1']);
  expect(kept.keptIn('data-refund')).toEqual([]);
});
