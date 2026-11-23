import type { BoxFamily, BoxLook, View, ViewArrow, ViewBox, ViewRoute } from '@seefore/core';

/**
 * Views made by hand for the tests, as `viewsOf` gives them: a shop seen from outside and from
 * inside, a fan of stores, a crowded system, views of any size, and views of the shape real
 * models have, with the edits a model goes through.
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

/**
 * A route, as `viewsOf` gives it: the names when every connection of the arrow has the same, or
 * how many of `of` have one. A name written in brackets, `(Office proxy)`, is a thing with a
 * condition.
 */
export function route(names: string[], count = 1, of = count): ViewRoute {
  const hops = names.map((name) => (name.startsWith('(') && name.endsWith(')') ? { name: name.slice(1, -1), bracketed: true } : { name, bracketed: false }));
  return { count, hops, bracketed: hops.some((hop) => hop.bracketed), line: names.length > 0 ? `via ${names.join(', ')}` : `via on ${count} of ${of}` };
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

/** Names of connections, of many lengths, for the views of real shape. */
const NAMES = [
  'Uses',
  'Reads the settings',
  'Sends the events it has seen, once a minute',
  'Asks for the account of the person signed in',
  'Writes each job and how far it has got',
  'Publishes a change',
  'Fetches the latest release and its notes from the mirror',
  'Checks a login',
];

/**
 * A container view of the size and density the trial models have, its arrows thrown between
 * its boxes at random: `parts` apps and stores inside the boundary, with one hub, `core`, that
 * about half the apps call; three people and five systems outside; and about 1.65 arrows a
 * box. An arrow has one to three connections, and some have a technology, a route or an
 * `only`. The same numbers always give the same view. With no tiers, one edit moves more of
 * it than of a real system: see `tiered`.
 */
export function grown(parts: number, seed = 1): View {
  const random = numbers(seed * 7919 + parts * 31);
  const pick = (list: readonly string[]) => list[Math.floor(random() * list.length)] ?? '';
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, at) => `${prefix}-${String(at + 1).padStart(2, '0')}`);
  const stores = ids('store', Math.round(parts * 0.3));
  const apps = ['core', ...ids('app', parts - stores.length - 1)];
  const people = ids('person', 3);
  const systems = ids('system', 5);
  const boxes = [
    ...apps.map((id) => inside(id, 'apps', { line: '[App: service · Go]', sentence: 'Does one part of the work of the system.' })),
    ...stores.map((id) => inside(id, 'stores', { line: '[Store: database · PostgreSQL]', sentence: 'Keeps what one part of the system needs.' })),
    ...people.map((id) => box(id, 'people', { sentence: 'Uses the system.' })),
    ...systems.map((id) => box(id, 'systems', { sentence: 'Stands outside and talks to the system.' })),
  ];
  const arrows = new Map<string, ViewArrow>();
  const add = (from: string, to: string) => {
    if (from === to || from === '' || to === '' || arrows.has(`${from}~${to}`)) return;
    const names = Array.from({ length: random() < 0.7 ? 1 : random() < 0.6 ? 2 : 3 }, () => NAMES[Math.floor(random() * NAMES.length)] ?? 'Uses');
    const technology = random() < 0.5 ? ['HTTPS'] : [];
    const made = arrow(from, to, names, technology);
    const extra = random();
    arrows.set(made.id, extra < 0.08 ? { ...made, route: route(['Gateway']) } : extra < 0.12 ? { ...made, only: { count: names.length, all: true, words: 'in the hosted edition', line: 'only in the hosted edition' } } : made);
  };
  for (const person of people) {
    add(person, pick(apps));
    add(person, pick(apps));
  }
  for (const app of apps.slice(1)) if (random() < 0.5) add(app, 'core');
  for (const store of stores) add(pick(apps), store);
  for (const system of systems) {
    add(pick(apps), system);
    if (random() < 0.5) add(system, pick(apps));
  }
  const target = Math.round(boxes.length * 1.65);
  while (arrows.size < target) add(pick(apps.slice(1)), random() < 0.4 ? pick(stores) : pick(apps));
  return containerView('estate', boxes, [...arrows.values()]);
}

/**
 * A container view in tiers, as a real system is built: three people use the front apps, which
 * call the services, which keep stores and call one another, the workers and the systems
 * outside; one service, `core`, is called by most of the others. `parts` apps and stores
 * inside, about 1.65 arrows a box. The same numbers always give the same view.
 */
export function tiered(parts: number, seed = 1): View {
  const random = numbers(seed * 104729 + parts * 13);
  const pick = (list: readonly string[]) => list[Math.floor(random() * list.length)] ?? '';
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, at) => `${prefix}-${String(at + 1).padStart(2, '0')}`);
  const stores = ids('store', Math.round(parts * 0.3));
  const fronts = ids('front', Math.max(2, Math.round(parts * 0.12)));
  const workers = ids('worker', Math.max(1, Math.round(parts * 0.1)));
  const services = ['core', ...ids('service', parts - stores.length - fronts.length - workers.length - 1)];
  const people = ids('person', 3);
  const systems = ids('system', 5);
  const app = (id: string) => inside(id, 'apps', { line: '[App: service · Go]', sentence: 'Does one part of the work of the system.' });
  const boxes = [
    ...[...fronts, ...services, ...workers].map(app),
    ...stores.map((id) => inside(id, 'stores', { line: '[Store: database · PostgreSQL]', sentence: 'Keeps what one part of the system needs.' })),
    ...people.map((id) => box(id, 'people', { sentence: 'Uses the system.' })),
    ...systems.map((id) => box(id, 'systems', { sentence: 'Stands outside and talks to the system.' })),
  ];
  const arrows = new Map<string, ViewArrow>();
  const add = (from: string, to: string) => {
    if (from === to || from === '' || to === '' || arrows.has(`${from}~${to}`)) return;
    const names = Array.from({ length: random() < 0.7 ? 1 : random() < 0.6 ? 2 : 3 }, () => NAMES[Math.floor(random() * NAMES.length)] ?? 'Uses');
    arrows.set(`${from}~${to}`, arrow(from, to, names, random() < 0.5 ? ['HTTPS'] : []));
  };
  const others = services.slice(1);
  for (const person of people) for (const front of fronts) if (random() < 0.6) add(person, front);
  for (const front of fronts) {
    add(front, 'core');
    add(front, pick(others));
  }
  // Each store is kept by a service or a worker, which writes it.
  for (const [at, store] of stores.entries()) add(at % 4 === 3 ? pick(workers) : (services[at % services.length] ?? 'core'), store);
  for (const service of others) if (random() < 0.6) add(service, 'core');
  for (const worker of workers) {
    add(pick(services), worker);
    add(worker, pick(stores));
  }
  for (const system of systems) {
    add(pick(services), system);
    if (random() < 0.4) add(system, pick(fronts));
  }
  const target = Math.round(boxes.length * 1.65);
  while (arrows.size < target) add(pick(services), random() < 0.5 ? pick(stores) : pick(others));
  return containerView('estate', boxes, [...arrows.values()]);
}

/**
 * A context view of a system and `count - 1` of its neighbours, the same neighbours for every
 * count: those of a smaller view are the first of a larger one. About one in four is a person,
 * who uses the system; the system uses most of the others, and some use it back.
 */
export function neighbourhood(count: number): View {
  const random = numbers(4049);
  const neighbours = Array.from({ length: 30 }, (_, at) => {
    const person = at % 4 === 1;
    const id = `${person ? 'person' : 'system'}-${String(at + 1).padStart(2, '0')}`;
    return { id, person, back: random() < 0.3, out: random() < 0.8 };
  }).slice(0, count - 1);
  const boxes = [box('hub', 'systems', { scope: true, sentence: 'The system the view is about.' }), ...neighbours.map((each) => box(each.id, each.person ? 'people' : 'systems', { sentence: 'Stands outside.' }))];
  const arrows = neighbours.flatMap((each) =>
    each.person ? [arrow(each.id, 'hub', ['Uses the system'])] : [...(each.out || !each.back ? [arrow('hub', each.id, ['Asks for what it keeps'], ['HTTPS'])] : []), ...(each.back ? [arrow(each.id, 'hub', ['Tells of a change'])] : [])],
  );
  return contextView('hub', boxes, arrows);
}

/** The view with one arrow more, of one connection. */
export function withArrow(view: View, from: string, to: string): View {
  return { ...view, arrows: [...view.arrows, arrow(from, to, ['Asks for something new'])] };
}

/** The view with a new app inside, which a box calls and which calls another box or writes a store. */
export function withApp(view: View, id: string, from: string, to: string): View {
  return { ...view, boxes: [...view.boxes, inside(id, 'apps', { sentence: 'A new app.' })], arrows: [...view.arrows, arrow(from, id, ['Asks the new app']), arrow(id, to, ['Tells of a result'])] };
}

/** The view less a box and every arrow at it. */
export function without(view: View, id: string): View {
  return { ...view, boxes: view.boxes.filter((each) => each.id !== id), arrows: view.arrows.filter((each) => each.from !== id && each.to !== id) };
}

/**
 * The view with an app moved to a system outside, as `viewsOf` draws it: the app's box goes,
 * and its arrows go to the system's box, one with an arrow that box already has. An arrow
 * between the two is then inside the other system, and goes.
 */
export function movedOut(view: View, app: string, system: string): View {
  const arrows = new Map<string, ViewArrow>();
  for (const each of view.arrows) {
    const from = each.from === app ? system : each.from;
    const to = each.to === app ? system : each.to;
    if (from === to) continue;
    const id = `${from}~${to}`;
    const had = arrows.get(id);
    if (had === undefined) arrows.set(id, { ...each, id, from, to });
    else {
      // Two arrows made one say every connection, and only the technology both name.
      arrows.set(id, { id, from, to, connections: [...had.connections, ...each.connections], names: [...had.names, ...each.names], technology: had.technology.filter((name) => each.technology.includes(name)) });
    }
  }
  return { ...view, boxes: view.boxes.filter((each) => each.id !== app), arrows: [...arrows.values()] };
}

/** The view with a new system outside, which a box inside calls. */
export function withNeighbour(view: View, id: string, from: string): View {
  return { ...view, boxes: [...view.boxes, box(id, 'systems', { sentence: 'A new system outside.' })], arrows: [...view.arrows, arrow(from, id, ['Asks the new system'])] };
}

/** Numbers between 0 and 1 that look random and are always the same for the same seed. */
function numbers(seed: number): () => number {
  let state = seed % 2147483647 || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}
