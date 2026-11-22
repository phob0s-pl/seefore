import type { BoxFamily, BoxLook, View, ViewArrow, ViewBox, ViewRoute } from '@seefore/core';

/**
 * Views made by hand for the tests, as `viewsOf` gives them: a shop seen from outside and from
 * inside, a fan of stores, a crowded system, and views of any size.
 */

/** The word of a kind line for each family. */
const KINDS: Record<BoxFamily, string> = { people: 'Person', systems: 'System', apps: 'App', stores: 'Store', infrastructure: 'Infrastructure' };

/** The look of a box of each family, but for the system in scope and the hard cases. */
const LOOKS: Record<BoxFamily, BoxLook> = { people: 'person', systems: 'system', apps: 'app', stores: 'store', infrastructure: 'infrastructure' };

/** A box of a view. The name is the id as words, `Card provider`, unless given; the kind line and the look say the family. */
export function box(id: string, family: BoxFamily, more: Partial<ViewBox> = {}): ViewBox {
  const words = id.replaceAll('-', ' ');
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  const look = more.scope === true ? 'system-scope' : LOOKS[family];
  return { id, family, look, name, line: `[${KINDS[family]}]`, scope: false, inside: false, loops: [], within: [], passing: [], kept: [], ...more };
}

/** A route, as `viewsOf` gives it: the names when every connection of the arrow has the same, or how many of `of` have one. */
export function route(names: string[], count = 1, of = count): ViewRoute {
  return { count, names, bracketed: names.some((name) => name.startsWith('(')), line: names.length > 0 ? `via ${names.join(', ')}` : `via on ${count} of ${of}` };
}

/** A box inside the boundary. */
export function inside(id: string, family: 'apps' | 'stores', more: Partial<ViewBox> = {}): ViewBox {
  return box(id, family, { inside: true, ...more });
}

/** An arrow, with one connection for each name. */
export function arrow(from: string, to: string, names: string[] = ['Uses'], technology: string[] = []): ViewArrow {
  return { id: `${from}~${to}`, from, to, connections: names.map((_, at) => `${from}-to-${to}-${at + 1}`), names, technology };
}

/** A context view of a system. */
export function contextView(scope: string, boxes: ViewBox[], arrows: ViewArrow[]): View {
  return { id: `${scope}.context`, kind: 'context', scope, title: `Context view: ${scope}`, boxes, arrows, left: { outside: [], broken: [] }, legend: [], passed: [] };
}

/** A container view of a system, with its boundary, which says the system's name and its kind line. */
export function containerView(scope: string, boxes: ViewBox[], arrows: ViewArrow[], name = scope, line = '[System]'): View {
  return {
    id: `${scope}.containers`,
    kind: 'containers',
    scope,
    title: `Container view: ${name}`,
    boxes,
    boundary: { id: scope, name, line, title: `${name} ${line}` },
    arrows,
    left: { outside: [], broken: [] },
    legend: [],
    passed: [],
  };
}

/** The shop as one box, with the people who use it and the card provider it pays through. */
export function shopContext(): View {
  return contextView(
    'shop',
    [
      box('shop', 'systems', { scope: true, sentence: 'Sells goods and ships them.' }),
      box('customer', 'people', { sentence: 'Buys from the shop.' }),
      box('warehouse-clerk', 'people', { sentence: 'Packs the orders that are ready to ship.' }),
      box('card-provider', 'systems', { sentence: 'Takes card payments.' }),
    ],
    [
      arrow('customer', 'shop', ['Fills a basket and pays']),
      arrow('warehouse-clerk', 'shop', ['Sees what to pack and marks it sent']),
      arrow('shop', 'card-provider', ['Takes the payment'], ['HTTPS']),
      arrow('card-provider', 'shop', ['Confirms a payment'], ['HTTPS']),
    ],
  );
}

/** Inside the shop: its apps and store, the people and the card provider, and arrows to and from the boundary. */
export function shopContainers(): View {
  return containerView(
    'shop',
    [
      inside('storefront', 'apps', { line: '[App: browser · TypeScript, React]', sentence: 'Where a customer fills a basket and pays.' }),
      inside('order-api', 'apps', { name: 'Order API', line: '[App: service · Go]', sentence: 'Takes orders and says how far each has got.' }),
      inside('shipping', 'apps', { line: '[App: service]', sentence: 'Tells the warehouse what to pack and records what was sent.' }),
      inside('orders-database', 'stores', { line: '[Store: database · PostgreSQL]', sentence: 'Every order and how far it has got.' }),
      box('customer', 'people', { sentence: 'Buys from the shop.' }),
      box('warehouse-clerk', 'people', { sentence: 'Packs the orders that are ready to ship.' }),
      box('card-provider', 'systems', { sentence: 'Takes card payments.' }),
      box('auditor', 'people', { sentence: 'Checks the books once a year.' }),
    ],
    [
      arrow('customer', 'storefront', ['Fills a basket and pays']),
      arrow('storefront', 'order-api', ['Places an order'], ['HTTPS']),
      arrow('order-api', 'card-provider', ['Takes the payment', 'Refunds a payment'], ['HTTPS']),
      arrow('card-provider', 'order-api', ['Confirms a payment'], ['HTTPS']),
      arrow('order-api', 'orders-database', ['Writes each order', 'Reads how far an order has got'], ['SQL']),
      arrow('shipping', 'orders-database', ['Reads the orders that are ready to ship'], ['SQL']),
      arrow('warehouse-clerk', 'shipping', ['Sees what to pack and marks it sent']),
      arrow('auditor', 'shop', ['Reads the books']),
      arrow('shop', 'card-provider', ['Sends the yearly statement'], ['SFTP']),
    ],
  );
}

/** One app that reads and writes many stores, each arrow with a label of one to five names. */
export function fan(): View {
  const stores = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
  return containerView(
    'hub',
    [inside('dispatcher', 'apps', { sentence: 'Hands every message to the store it belongs in, and reads it back on request.' }), ...stores.map((id) => inside(`${id}-store`, 'stores'))],
    stores.map((id, at) =>
      arrow(
        'dispatcher',
        `${id}-store`,
        Array.from({ length: (at % 5) + 1 }, (_, n) => `Writes the ${id} records of kind ${n + 1}`),
        at % 2 === 0 ? ['SQL'] : [],
      ),
    ),
  );
}

/**
 * A crowded system: `parts` apps and stores inside, `others` people and systems outside, and
 * about two arrows for each box, between parts, from outside in, from inside out, and to and
 * from the boundary. The same numbers always give the same view.
 */
export function crowded(parts: number, others: number): View {
  const random = numbers(parts * 7919 + others);
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, at) => `${prefix}-${String(at + 1).padStart(3, '0')}`);
  const inner = ids('part', parts);
  const outer = ids('other', others);
  const boxes = [
    ...inner.map((id, at) => inside(id, at % 4 === 3 ? 'stores' : 'apps', { name: `Part number ${at + 1} of the crowded system`, line: '[App: service · Go, PostgreSQL, Redis, Kafka]', sentence: 'Does one thing of many, and does it with a description long enough to be cut at the end of its fourth line in the box.' })),
    ...outer.map((id, at) => box(id, at % 3 === 0 ? 'people' : 'systems', { sentence: 'Stands outside and talks to the parts.' })),
  ];
  const arrows = new Map<string, ViewArrow>();
  const add = (from: string, to: string) => {
    if (from === to || arrows.has(`${from}~${to}`) || (outer.includes(from) && outer.includes(to))) return;
    const names = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, at) => `Sends message ${at + 1} of its kind`);
    arrows.set(`${from}~${to}`, arrow(from, to, names, random() < 0.5 ? ['HTTPS', 'JSON'] : []));
  };
  const pick = (list: string[]) => list[Math.floor(random() * list.length)] ?? '';
  for (const id of inner) {
    add(id, pick(inner));
    if (random() < 0.5) add(pick(outer), id);
    if (random() < 0.3) add(id, pick(outer));
  }
  for (const id of outer) add(id, pick(inner));
  add(pick(outer), 'crowd');
  add('crowd', pick(outer.filter((id) => boxes.find((each) => each.id === id)?.family === 'systems')));
  return containerView('crowd', boxes, [...arrows.values()]);
}

/** Numbers between 0 and 1 that look random and are always the same for the same seed. */
function numbers(seed: number): () => number {
  let state = seed % 2147483647 || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}
