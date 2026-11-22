import type { Drawn, Failed, Model, Outline, Picture, PictureAnswer, Problem, View, ViewerState } from '@seefore/core';

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
  others: ['card-provider'],
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
    { id: 'card-provider', family: 'systems', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: false, inside: false, loops: [], within: [] },
    { id: 'customer', family: 'people', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [] },
    {
      id: 'shop',
      family: 'systems',
      name: 'Shop',
      line: '[System]',
      sentence: 'Sells goods and ships them.',
      scope: true,
      inside: false,
      loops: [],
      within: ['checkout-asks-status', 'checkout-writes-orders', 'order-api-shares-locks'],
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
};

export const CONTAINERS: View = {
  id: 'shop.containers',
  kind: 'containers',
  scope: 'shop',
  title: 'Container view: Shop',
  boxes: [
    { id: 'card-provider', family: 'systems', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: false, inside: false, loops: [], within: [] },
    { id: 'customer', family: 'people', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [] },
    {
      id: 'order-api',
      family: 'apps',
      name: 'Order API',
      line: '[App: service · Go]',
      sentence: 'Takes orders and says how far each has got.',
      scope: false,
      inside: true,
      loops: ['order-api-shares-locks'],
      within: ['checkout-asks-status'],
    },
    {
      id: 'orders-database',
      family: 'stores',
      name: 'Orders database',
      line: '[Store: database · PostgreSQL]',
      sentence: 'Keeps orders < 90 days old & how far each has got.',
      scope: false,
      inside: true,
      loops: [],
      within: [],
    },
  ],
  boundary: { id: 'shop', name: 'Shop', title: 'Shop [System]' },
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
};

export const CARD_CONTEXT: View = {
  id: 'card-provider.context',
  kind: 'context',
  scope: 'card-provider',
  title: 'Context view: Card provider',
  boxes: [
    { id: 'card-provider', family: 'systems', name: 'Card provider', line: '[System]', sentence: 'Takes card payments.', scope: true, inside: false, loops: [], within: [] },
    { id: 'customer', family: 'people', name: 'Customer', line: '[Person]', sentence: 'Buys from the shop.', scope: false, inside: false, loops: [], within: [] },
    { id: 'shop', family: 'systems', name: 'Shop', line: '[System]', sentence: 'Sells goods and ships them.', scope: false, inside: false, loops: [], within: [] },
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
};

/** A box of 240 by 150 at a place. */
function at(x: number, y: number) {
  return { x, y, width: 240, height: 150 };
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
  outline: OUTLINE,
  views: [CONTEXT, CONTAINERS, CARD_CONTEXT],
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
