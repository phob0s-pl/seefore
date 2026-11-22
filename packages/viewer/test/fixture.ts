import type { Drawn, Failed, Model, Outline, Picture, PictureAnswer, Problem, View, ViewBox, ViewerState } from '@seefore/core';

/**
 * A made-up reading of a small shop, as the server would hand it to the page: the state, and
 * the picture of each view. The places are made by hand, left to right, so that nothing lies
 * over anything. The container view has a boundary with two boxes inside, a person and a system
 * outside, an arrow that stands for three connections, an arrow that ends at the boundary, and a
 * box with a mark for connections between its copies. One view's layout failed.
 */

export const MODEL: Model = {
  people: [{ id: 'customer', file: 'people/customer.yaml', name: 'Customer', description: 'Buys from the shop.' }],
  systems: [
    {
      id: 'card-provider',
      file: 'systems/card-provider.yaml',
      name: 'Card provider',
      description: "Takes card payments. Another company's service.",
      owner: 'card-provider-company',
    },
    { id: 'shop', file: 'systems/shop.yaml', name: 'Shop', description: 'Sells goods and ships them.', owner: 'shop-team' },
  ],
  apps: [
    {
      id: 'order-api',
      file: 'apps/order-api.yaml',
      name: 'Order API',
      in: 'shop',
      description: 'Takes orders and says how far each has got.\nRuns as three copies that share their locks.',
      kind: 'service',
      technology: ['go'],
    },
  ],
  stores: [
    {
      id: 'orders-database',
      file: 'stores/orders-database.yaml',
      name: 'Orders database',
      in: 'shop',
      description: 'Keeps orders < 90 days old & how far each has got.',
      kind: 'database',
      technology: ['postgresql'],
    },
  ],
  components: [
    { id: 'checkout', file: 'components/checkout.yaml', name: 'Checkout', in: 'order-api', description: 'Takes a basket and a payment and makes an order of them.' },
    { id: 'order-status', file: 'components/order-status.yaml', name: 'Order status', in: 'order-api' },
  ],
  infrastructure: [],
  connections: [
    { id: 'checkout-asks-status', file: 'connections/checkout-asks-status.yaml', from: 'checkout', to: 'order-status', name: 'Asks how far an order has got' },
    { id: 'checkout-takes-payment', file: 'connections/checkout-takes-payment.yaml', from: 'checkout', to: 'card-provider', name: 'Takes the payment', technology: ['https'] },
    { id: 'checkout-writes-orders', file: 'connections/checkout-writes-orders.yaml', from: 'checkout', to: 'orders-database', name: 'Writes each order', technology: ['sql'] },
    { id: 'customer-pays-card-provider', file: 'connections/customer-pays-card-provider.yaml', from: 'customer', to: 'card-provider', name: 'Pays by card' },
    { id: 'customer-uses-shop', file: 'connections/customer-uses-shop.yaml', from: 'customer', to: 'shop', name: 'Buys goods' },
    { id: 'order-api-feeds-reports', file: 'connections/order-api-feeds-reports.yaml', from: 'order-api', to: 'reports', name: 'Sends each order' },
    {
      id: 'order-api-refunds',
      file: 'connections/order-api-refunds.yaml',
      from: 'order-api',
      to: 'card-provider',
      name: 'Refunds a payment',
      description: 'When an order is called off before it ships.',
      technology: ['https'],
    },
    { id: 'order-api-shares-locks', file: 'connections/order-api-shares-locks.yaml', from: 'order-api', to: 'order-api', description: 'One copy tells the others which orders it holds.' },
    { id: 'order-status-asks-payment', file: 'connections/order-status-asks-payment.yaml', from: 'order-status', to: 'card-provider', name: 'Asks for its state', technology: ['https'] },
  ],
  owners: [
    { id: 'card-provider-company', file: 'owners/card-provider-company.yaml', name: 'The card provider' },
    { id: 'shop-team', file: 'owners/shop-team.yaml', name: 'Shop team' },
  ],
  technologies: [
    { id: 'go', file: 'technologies/go.yaml', name: 'Go' },
    { id: 'https', file: 'technologies/https.yaml', name: 'HTTPS' },
    { id: 'postgresql', file: 'technologies/postgresql.yaml', name: 'PostgreSQL' },
    { id: 'sql', file: 'technologies/sql.yaml', name: 'SQL' },
  ],
};

export const OUTLINE: Outline = {
  people: ['customer'],
  withParts: [{ id: 'shop', apps: [{ id: 'order-api', components: ['checkout', 'order-status'] }], stores: ['orders-database'] }],
  others: [{ id: 'card-provider', apps: [], stores: [] }],
  infrastructure: [],
  connections: [
    { start: 'customer', known: true, connections: ['customer-pays-card-provider', 'customer-uses-shop'] },
    {
      start: 'order-api',
      known: true,
      connections: [
        'checkout-asks-status',
        'checkout-takes-payment',
        'checkout-writes-orders',
        'order-api-feeds-reports',
        'order-api-refunds',
        'order-api-shares-locks',
        'order-status-asks-payment',
      ],
    },
  ],
  owners: ['card-provider-company', 'shop-team'],
  technologies: ['go', 'https', 'postgresql', 'sql'],
  conditions: [],
  loose: [],
};

export const PROBLEMS: Problem[] = [
  {
    file: 'apps/reports.yaml',
    line: 4,
    column: 7,
    severity: 'error',
    code: 'value-not-allowed',
    message: '`kind` is `server`. Use one of `service`, `browser`, `mobile`, `desktop`, `command`, `function` or `job`.',
  },
  {
    file: 'connections/customer-uses-shop.yaml',
    line: 3,
    column: 7,
    severity: 'warning',
    code: 'connection-repeated-above',
    message: 'This says higher up, in the same words, what `checkout-takes-payment` says beneath it.',
  },
];

/** The three connections the arrow from the Order API to the card provider stands for: the one between the two first. */
const PAYMENTS = {
  connections: ['order-api-refunds', 'checkout-takes-payment', 'order-status-asks-payment'],
  names: ['Refunds a payment', 'Takes the payment', 'Asks for its state'],
  technology: ['HTTPS'],
};

export const CONTEXT: View = {
  id: 'shop.context',
  kind: 'context',
  scope: 'shop',
  title: 'Context view: Shop',
  boxes: [
    { id: 'card-provider', family: 'systems', look: 'system', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
    { id: 'customer', family: 'people', look: 'person', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
    {
      id: 'shop',
      family: 'systems',
      look: 'system-scope',
      name: 'Shop',
      line: '[System]',
      sentence: 'Sells goods and ships them.',
      scope: true,
      inside: false,
      loops: [],
      within: ['checkout-asks-status', 'checkout-writes-orders', 'order-api-shares-locks'],
      passing: [],
      kept: [],
    },
  ],
  arrows: [
    { id: 'customer~shop', from: 'customer', to: 'shop', connections: ['customer-uses-shop'], names: ['Buys goods'], technology: [] },
    {
      id: 'shop~card-provider',
      from: 'shop',
      to: 'card-provider',
      connections: ['checkout-takes-payment', 'order-api-refunds', 'order-status-asks-payment'],
      names: ['Takes the payment', 'Refunds a payment', 'Asks for its state'],
      technology: ['HTTPS'],
    },
  ],
  left: { outside: ['customer-pays-card-provider'], broken: ['order-api-feeds-reports'] },
  legend: [
    { key: 'person', text: 'Person: someone who uses the software' },
    { key: 'system-scope', text: 'System: the one this view is about' },
    { key: 'system', text: 'System: another one' },
    { key: 'arrow', text: 'A connection, from the one that acts' },
    { key: 'arrow-many', text: 'Several connections between two boxes' },
  ],
  passed: [],
};

export const CONTAINERS: View = {
  id: 'shop.containers',
  kind: 'containers',
  scope: 'shop',
  title: 'Container view: Shop',
  boxes: [
    { id: 'card-provider', family: 'systems', look: 'system', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
    { id: 'customer', family: 'people', look: 'person', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
    {
      id: 'order-api',
      family: 'apps',
      look: 'app',
      name: 'Order API',
      line: '[App: service · Go]',
      sentence: 'Takes orders and says how far each has got.',
      scope: false,
      inside: true,
      loops: ['order-api-shares-locks'],
      within: ['checkout-asks-status'],
      passing: [],
      kept: [],
    },
    {
      id: 'orders-database',
      family: 'stores',
      look: 'store',
      name: 'Orders database',
      line: '[Store: database · PostgreSQL]',
      sentence: 'Keeps orders < 90 days old & how far each has got.',
      scope: false,
      inside: true,
      loops: [],
      within: [],
      passing: [],
      kept: [],
    },
  ],
  boundary: { id: 'shop', name: 'Shop', line: '[System]', title: 'Shop [System]' },
  arrows: [
    { id: 'customer~shop', from: 'customer', to: 'shop', connections: ['customer-uses-shop'], names: ['Buys goods'], technology: [] },
    { id: 'order-api~card-provider', from: 'order-api', to: 'card-provider', ...PAYMENTS },
    { id: 'order-api~orders-database', from: 'order-api', to: 'orders-database', connections: ['checkout-writes-orders'], names: ['Writes each order'], technology: ['SQL'] },
  ],
  left: { outside: ['customer-pays-card-provider'], broken: ['order-api-feeds-reports'] },
  legend: [
    { key: 'person', text: 'Person: someone who uses the software' },
    { key: 'system', text: 'System: another one' },
    { key: 'app', text: 'App: something that runs code' },
    { key: 'store', text: 'Store: something that holds data' },
    { key: 'boundary', text: 'The system this view is about, around what is in it' },
    { key: 'arrow', text: 'A connection, from the one that acts' },
    { key: 'arrow-many', text: 'Several connections between two boxes' },
    { key: 'loop', text: 'Connections between copies of one box' },
  ],
  passed: [],
};

export const CARD_CONTEXT: View = {
  id: 'card-provider.context',
  kind: 'context',
  scope: 'card-provider',
  title: 'Context view: Card provider',
  boxes: [
    { id: 'card-provider', family: 'systems', look: 'system-scope', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: true, inside: false, loops: [], within: [], passing: [], kept: [] },
    { id: 'customer', family: 'people', look: 'person', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
    { id: 'shop', family: 'systems', look: 'system', name: 'Shop', line: '[System]', sentence: 'Sells goods and ships them.', scope: false, inside: false, loops: [], within: [], passing: [], kept: [] },
  ],
  arrows: [
    { id: 'customer~card-provider', from: 'customer', to: 'card-provider', connections: ['customer-pays-card-provider'], names: ['Pays by card'], technology: [] },
    { id: 'shop~card-provider', from: 'shop', to: 'card-provider', ...PAYMENTS },
  ],
  left: { outside: [], broken: [] },
  legend: [
    { key: 'person', text: 'Person: someone who uses the software' },
    { key: 'system-scope', text: 'System: the one this view is about' },
    { key: 'system', text: 'System: another one' },
    { key: 'arrow', text: 'A connection, from the one that acts' },
    { key: 'arrow-many', text: 'Several connections between two boxes' },
  ],
  passed: [],
};

/** A box of 240 by 150 at a place, with its text as far in from its sides as the layout puts it for its look. */
function at(x: number, y: number, inset = { left: 12, right: 12 }) {
  return { x, y, width: 240, height: 150, inset };
}

export const CONTEXT_PICTURE: Drawn = {
  view: 'shop.context',
  width: 1160,
  height: 330,
  boxes: [
    { id: 'card-provider', ...at(880, 90), name: ['Card provider'], line: '[System]', sentence: ['Takes card payments.'] },
    { id: 'customer', ...at(40, 90), name: ['Customer'], line: '[Person]', sentence: ['Buys from the shop.'] },
    { id: 'shop', ...at(460, 90), name: ['Shop'], line: '[System]', sentence: ['Sells goods and ships them.'] },
  ],
  arrows: [
    {
      id: 'customer~shop',
      from: 'customer',
      to: 'shop',
      sections: [[{ x: 280, y: 165 }, { x: 460, y: 165 }]],
      label: { x: 322, y: 155, width: 96, height: 20, lines: ['Buys goods'] },
    },
    {
      id: 'shop~card-provider',
      from: 'shop',
      to: 'card-provider',
      sections: [[{ x: 700, y: 165 }, { x: 880, y: 165 }]],
      label: { x: 730, y: 133, width: 120, height: 64, lines: ['Takes the payment', 'Refunds a payment', 'Asks for its state'], technology: '[HTTPS]' },
    },
  ],
};

export const CONTAINER_PICTURE: Drawn = {
  view: 'shop.containers',
  width: 1520,
  height: 670,
  boundary: { id: 'shop', x: 440, y: 40, width: 700, height: 400, title: 'Shop [System]', titleAt: { x: 464, y: 52, width: 128, height: 20 } },
  boxes: [
    { id: 'card-provider', ...at(1240, 480), name: ['Card provider'], line: '[System]', sentence: ['Takes card payments.'] },
    { id: 'customer', ...at(40, 200), name: ['Customer'], line: '[Person]', sentence: ['Buys from the shop.'] },
    { id: 'order-api', ...at(464, 104), name: ['Order API'], line: '[App: service · Go]', sentence: ['Takes orders and says how far', 'each has got.'] },
    { id: 'orders-database', ...at(874, 104), name: ['Orders database'], line: '[Store: database · PostgreSQL]', sentence: ['Keeps orders < 90 days old & how', 'far each has got.'] },
  ],
  arrows: [
    {
      id: 'customer~shop',
      from: 'customer',
      to: 'shop',
      sections: [[{ x: 280, y: 275 }, { x: 440, y: 275 }]],
      label: { x: 312, y: 265, width: 96, height: 20, lines: ['Buys goods'] },
    },
    {
      id: 'order-api~card-provider',
      from: 'order-api',
      to: 'card-provider',
      sections: [
        [
          { x: 704, y: 224 },
          { x: 760, y: 224 },
          { x: 760, y: 555 },
          { x: 1240, y: 555 },
        ],
      ],
      label: { x: 940, y: 523, width: 120, height: 64, lines: ['Refunds a payment', 'Takes the payment', 'Asks for its state'], technology: '[HTTPS]' },
    },
    {
      id: 'order-api~orders-database',
      from: 'order-api',
      to: 'orders-database',
      sections: [[{ x: 704, y: 179 }, { x: 874, y: 179 }]],
      label: { x: 735, y: 163, width: 108, height: 32, lines: ['Writes each order'], technology: '[SQL]' },
    },
  ],
};

export const FAILED_PICTURE: Failed = {
  view: 'card-provider.context',
  failed: { reason: 'time', message: 'The layout of this view took longer than 5 seconds, so it was stopped.' },
};

export const STATE: ViewerState = {
  revision: 'r1',
  directory: '/work/shop/architecture',
  available: true,
  name: 'Shop',
  format: 1,
  records: 23,
  errors: 1,
  warnings: 1,
  problems: PROBLEMS,
  model: MODEL,
  ownership: {
    'card-provider': { owner: 'card-provider-company', from: 'card-provider' },
    checkout: { owner: 'shop-team', from: 'shop' },
    'order-api': { owner: 'shop-team', from: 'shop' },
    'order-status': { owner: 'shop-team', from: 'shop' },
    'orders-database': { owner: 'shop-team', from: 'shop' },
    shop: { owner: 'shop-team', from: 'shop' },
  },
  conditions: {},
  outline: OUTLINE,
  views: [CONTEXT, CONTAINERS, CARD_CONTEXT],
  inNoView: [],
};

/** The picture of each view of the state. */
export const PICTURES: Readonly<Record<string, Picture>> = {
  'shop.context': CONTEXT_PICTURE,
  'shop.containers': CONTAINER_PICTURE,
  'card-provider.context': FAILED_PICTURE,
};

/** The server's answer for a view at the state's revision. */
export function answerFor(view: string, revision = STATE.revision): PictureAnswer {
  const picture = PICTURES[view];
  if (picture === undefined) throw new Error(`No picture of ${view} in the fixture.`);
  return { revision, picture };
}

/**
 * The hard cases, in a reading of their own: a help desk whose web app a clerk reaches through
 * an HTTPS proxy, which also checks the app on its own account and so has a box; a topic; and
 * a card provider that is external, paid through the desk's gateway and a load balancer that
 * nothing starts or ends at, so that the gateway carries a mark and the load balancer is
 * listed under the legend. Of the two connections to the card provider one has a route.
 */
export const HARD_MODEL: Model = {
  people: [{ id: 'clerk', file: 'people/clerk.yaml', name: 'Clerk', description: 'Answers the tickets.' }],
  systems: [
    { id: 'cards', file: 'systems/cards.yaml', name: 'Card provider', description: 'Takes card payments.', external: true },
    { id: 'desk', file: 'systems/desk.yaml', name: 'Desk', description: 'Keeps the tickets of the help desk.' },
  ],
  apps: [
    { id: 'gateway', file: 'apps/gateway.yaml', name: 'Gateway', in: 'desk', description: 'Signs the calls that leave the desk.', kind: 'service' },
    { id: 'web', file: 'apps/web.yaml', name: 'Web', in: 'desk', description: 'The pages of the desk.', kind: 'service' },
  ],
  stores: [{ id: 'events', file: 'stores/events.yaml', name: 'Ticket events', in: 'desk', description: 'What changed on a ticket.', kind: 'topic', technology: ['kafka'] }],
  components: [],
  infrastructure: [
    { id: 'balancer', file: 'infrastructure/balancer.yaml', name: 'Load balancer' },
    { id: 'proxy', file: 'infrastructure/proxy.yaml', name: 'HTTPS proxy', description: "Ends HTTPS on the desk's host and passes requests on.", technology: ['nginx'] },
  ],
  connections: [
    { id: 'clerk-uses-web', file: 'connections/clerk-uses-web.yaml', from: 'clerk', to: 'web', via: ['proxy'], name: 'Asks for pages', technology: ['https'] },
    { id: 'proxy-checks-web', file: 'connections/proxy-checks-web.yaml', from: 'proxy', to: 'web', name: 'Checks that it answers' },
    { id: 'web-asks-cards', file: 'connections/web-asks-cards.yaml', from: 'web', to: 'cards', name: 'Asks for a refund' },
    { id: 'web-calls-cards', file: 'connections/web-calls-cards.yaml', from: 'web', to: 'cards', via: ['gateway', 'balancer'], name: 'Takes a payment' },
    { id: 'web-publishes-events', file: 'connections/web-publishes-events.yaml', from: 'web', to: 'events', name: 'Says what changed' },
  ],
  owners: [],
  technologies: [
    { id: 'https', file: 'technologies/https.yaml', name: 'HTTPS' },
    { id: 'kafka', file: 'technologies/kafka.yaml', name: 'Kafka' },
    { id: 'nginx', file: 'technologies/nginx.yaml', name: 'nginx' },
  ],
};

export const HARD_OUTLINE: Outline = {
  people: ['clerk'],
  withParts: [{ id: 'desk', apps: [{ id: 'gateway', components: [] }, { id: 'web', components: [] }], stores: ['events'] }],
  others: [{ id: 'cards', apps: [], stores: [] }],
  infrastructure: ['balancer', 'proxy'],
  connections: [
    { start: 'clerk', known: true, connections: ['clerk-uses-web'] },
    { start: 'web', known: true, connections: ['web-asks-cards', 'web-calls-cards', 'web-publishes-events'] },
    { start: 'proxy', known: true, connections: ['proxy-checks-web'] },
  ],
  owners: [],
  technologies: ['https', 'kafka', 'nginx'],
  conditions: [],
  loose: [],
};

/** A box of the hard cases' container view, with nothing in its marks unless given. */
function hardBox(box: Omit<ViewBox, 'scope' | 'loops' | 'within' | 'passing' | 'kept'> & Partial<ViewBox>): ViewBox {
  return { scope: false, loops: [], within: [], passing: [], kept: [], ...box };
}

export const HARD_CONTAINERS: View = {
  id: 'desk.containers',
  kind: 'containers',
  scope: 'desk',
  title: 'Container view: Desk',
  boxes: [
    hardBox({ id: 'cards', family: 'systems', look: 'system-external', name: 'Card provider', line: '[System: external]', sentence: 'Takes card payments.', inside: false }),
    hardBox({ id: 'clerk', family: 'people', look: 'person', name: 'Clerk', line: '[Person]', sentence: 'Answers the tickets.', inside: false }),
    hardBox({ id: 'events', family: 'stores', look: 'queue-or-topic', name: 'Ticket events', line: '[Store: topic · Kafka]', sentence: 'What changed on a ticket.', inside: true }),
    hardBox({ id: 'gateway', family: 'apps', look: 'app', name: 'Gateway', line: '[App: service]', sentence: 'Signs the calls that leave the desk.', inside: true, passing: ['web-calls-cards'], kept: [] }),
    hardBox({
      id: 'proxy',
      family: 'infrastructure',
      look: 'infrastructure',
      name: 'HTTPS proxy',
      line: '[Infrastructure · nginx]',
      sentence: "Ends HTTPS on the desk's host and passes requests on.",
      inside: false,
      passing: ['clerk-uses-web'],
      kept: [],
    }),
    hardBox({ id: 'web', family: 'apps', look: 'app', name: 'Web', line: '[App: service]', sentence: 'The pages of the desk.', inside: true }),
  ],
  boundary: { id: 'desk', name: 'Desk', line: '[System]', title: 'Desk [System]' },
  arrows: [
    {
      id: 'clerk~web',
      from: 'clerk',
      to: 'web',
      connections: ['clerk-uses-web'],
      names: ['Asks for pages'],
      technology: ['HTTPS'],
      route: { count: 1, hops: [{ name: 'HTTPS proxy', bracketed: false }], bracketed: false, line: 'via HTTPS proxy' },
    },
    { id: 'proxy~web', from: 'proxy', to: 'web', connections: ['proxy-checks-web'], names: ['Checks that it answers'], technology: [] },
    {
      id: 'web~cards',
      from: 'web',
      to: 'cards',
      connections: ['web-asks-cards', 'web-calls-cards'],
      names: ['Asks for a refund', 'Takes a payment'],
      technology: [],
      route: { count: 1, hops: [], bracketed: false, line: 'via on 1 of 2' },
    },
    { id: 'web~events', from: 'web', to: 'events', connections: ['web-publishes-events'], names: ['Says what changed'], technology: [] },
  ],
  left: { outside: [], broken: [] },
  legend: [
    { key: 'person', text: 'Person: a role that uses the software, runs it or takes part' },
    { key: 'system-external', text: "External system: somebody else's, used as it is given" },
    { key: 'app', text: 'App: something that runs code' },
    { key: 'queue-or-topic', text: 'Queue or topic: a store that holds messages on their way' },
    { key: 'infrastructure', text: 'Infrastructure: passes exchanges on, such as a proxy' },
    { key: 'boundary', text: 'Boundary: this system, with its apps and stores inside' },
    { key: 'arrow', text: 'Arrow: from the one that acts to the one it acts on' },
    { key: 'arrow-many', text: 'Arrow for several connections: each line of its label names one' },
    { key: 'route', text: 'Route: what the connections pass through, in order; “via on 2 of 5” when they differ' },
    { key: 'passing', text: "Passing through: how many of this view's connections pass through it" },
  ],
  passed: [{ id: 'balancer', name: 'Load balancer', conditions: [], own: false, connections: ['web-calls-cards'], arrows: ['web~cards'] }],
};

export const HARD_PICTURE: Drawn = {
  view: 'desk.containers',
  width: 1500,
  height: 600,
  boundary: { id: 'desk', x: 360, y: 40, width: 760, height: 520, title: 'Desk [System]', titleAt: { x: 384, y: 52, width: 116, height: 20 } },
  boxes: [
    { id: 'cards', ...at(1220, 200), name: ['Card provider'], line: '[System: external]', sentence: ['Takes card payments.'] },
    { id: 'clerk', ...at(40, 330), name: ['Clerk'], line: '[Person]', sentence: ['Answers the tickets.'] },
    { id: 'events', ...at(820, 360, { left: 12, right: 20 }), name: ['Ticket events'], line: '[Store: topic · Kafka]', sentence: ['What changed on a ticket.'] },
    { id: 'gateway', ...at(820, 104), name: ['Gateway'], line: '[App: service]', sentence: ['Signs the calls that leave the desk.'] },
    { id: 'proxy', ...at(40, 60, { left: 16, right: 16 }), name: ['HTTPS proxy'], line: '[Infrastructure · nginx]', sentence: ["Ends HTTPS on the desk's host and", 'passes requests on.'] },
    { id: 'web', ...at(400, 200), name: ['Web'], line: '[App: service]', sentence: ['The pages of the desk.'] },
  ],
  arrows: [
    {
      id: 'clerk~web',
      from: 'clerk',
      to: 'web',
      sections: [[{ x: 280, y: 405 }, { x: 330, y: 405 }, { x: 330, y: 300 }, { x: 400, y: 300 }]],
      label: { x: 270, y: 420, width: 90, height: 43, lines: ['Asks for pages'], route: 'via HTTPS proxy', technology: '[HTTPS]' },
    },
    {
      id: 'proxy~web',
      from: 'proxy',
      to: 'web',
      sections: [[{ x: 280, y: 135 }, { x: 330, y: 135 }, { x: 330, y: 250 }, { x: 400, y: 250 }]],
      label: { x: 284, y: 150, width: 92, height: 30, lines: ['Checks that it', 'answers'] },
    },
    {
      id: 'web~cards',
      from: 'web',
      to: 'cards',
      sections: [[{ x: 640, y: 275 }, { x: 1220, y: 275 }]],
      label: { x: 660, y: 290, width: 108, height: 44, lines: ['Asks for a refund', 'Takes a payment'], route: 'via on 1 of 2' },
    },
    {
      id: 'web~events',
      from: 'web',
      to: 'events',
      sections: [[{ x: 520, y: 350 }, { x: 520, y: 435 }, { x: 820, y: 435 }]],
      label: { x: 600, y: 445, width: 110, height: 15, lines: ['Says what changed'] },
    },
  ],
};

export const HARD_STATE: ViewerState = {
  revision: 'h1',
  directory: '/work/desk/architecture',
  available: true,
  name: 'Desk',
  format: 1,
  records: 16,
  errors: 0,
  warnings: 0,
  problems: [],
  model: HARD_MODEL,
  ownership: {},
  conditions: {},
  outline: HARD_OUTLINE,
  views: [HARD_CONTAINERS],
  inNoView: [],
};

/**
 * The hard cases with an error in the file of the load balancer: it is not in the model, though
 * the payment still passes through it, and the view names it by its id.
 */
export const BROKEN_HOP_STATE: ViewerState = {
  ...HARD_STATE,
  revision: 'h2',
  errors: 1,
  problems: [{ file: 'infrastructure/balancer.yaml', line: 2, column: 1, severity: 'error', code: 'key-unknown', message: 'A piece of infrastructure has no `colour`.' }],
  model: { ...HARD_MODEL, infrastructure: HARD_MODEL.infrastructure.filter((piece) => piece.id !== 'balancer') },
  outline: { ...HARD_OUTLINE, infrastructure: ['proxy'] },
  views: [{ ...HARD_CONTAINERS, passed: [{ id: 'balancer', name: 'balancer', conditions: [], own: false, connections: ['web-calls-cards'], arrows: ['web~cards'] }] }],
};
