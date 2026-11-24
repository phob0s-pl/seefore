import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { depthOf, focusesOf, focusFor, litBy, viewOf } from '../src/model/view.ts';
import type { Depth, View } from '../src/model/view.ts';

/** A shop and a partner: one system with parts, one with none, and an app with parts of its own. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'people/customer.yaml', text: 'name: Customer\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\nowner: sales\n' },
  { path: 'systems/partner.yaml', text: 'name: Partner\nexternal: true\n' },
  { path: 'apps/web.yaml', text: 'name: Web\nin: shop\nkind: browser\n' },
  { path: 'apps/api.yaml', text: 'name: API\nin: shop\ntechnology: [go]\n' },
  { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\nkind: database\n' },
  { path: 'stores/sessions.yaml', text: 'name: Sessions\nin: api\nkind: cache\n' },
  { path: 'components/checkout.yaml', text: 'name: Checkout\nin: api\n' },
  { path: 'infrastructure/gateway.yaml', text: 'name: Gateway\nin: shop\n' },
  { path: 'infrastructure/dns.yaml', text: 'name: DNS\n' },
  { path: 'owners/sales.yaml', text: 'name: Sales\n' },
  { path: 'technologies/go.yaml', text: 'name: Go\n' },
];

const file = (path: string, text: string): SourceFile => ({ path, text });
const connection = (id: string, from: string, to: string, more = ''): SourceFile => file(`connections/${id}.yaml`, `from: ${from}\nto: ${to}\n${more}`);
const records = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return read.records;
};
const view = (depth: Depth, ...files: SourceFile[]) => viewOf(records(...files), depth);
/** Each box as `id`, `id in frame`, and `[id]` for a frame. */
const boxesIn = ({ boxes }: View) => boxes.map((box) => `${box.frame ? `[${box.id}]` : box.id}${box.in ? ` in ${box.in}` : ''}`);
const boxesOf = (depth: Depth, ...files: SourceFile[]) => boxesIn(view(depth, ...files));
/** Each arrow as `from > to: connections`, and `< back` for those the other way. */
const arrowsIn = ({ arrows }: View) => arrows.map((arrow) => `${arrow.from} > ${arrow.to}: ${arrow.connections.join(' ')}${arrow.back ? ` < ${arrow.back.join(' ')}` : ''}`);
const arrowsOf = (depth: Depth, ...files: SourceFile[]) => arrowsIn(view(depth, ...files));
/** Each box at the top as `id: zone`, and `caller` for an external system with the people. */
const zonesOf = (depth: Depth, ...files: SourceFile[]) =>
  view(depth, ...files)
    .boxes.filter((box) => box.in === undefined)
    .map((box) => `${box.id}: ${box.zone}${box.caller ? ' caller' : ''}`);

test('Systems draws each person, each system and the infrastructure in no system, with no frame, owner or technology', () => {
  expect(boxesOf('systems')).toEqual(['customer', 'partner', 'shop', 'dns']);
  expect(view('systems').boxes).toEqual([
    { id: 'customer', kind: 'people', name: 'Customer', frame: false, zone: 'people' },
    { id: 'partner', kind: 'systems', name: 'Partner', frame: false, external: true, zone: 'external' },
    { id: 'shop', kind: 'systems', name: 'Shop', frame: false, zone: 'ours' },
    { id: 'dns', kind: 'infrastructure', name: 'DNS', frame: false, zone: 'ours' },
  ]);
});

test('Containers opens a system with parts, leaves a system with none a box, and keeps a store an app keeps inside its app', () => {
  expect(boxesOf('containers')).toEqual(['customer', 'partner', '[shop]', 'api in shop', 'web in shop', 'orders in shop', 'dns', 'gateway in shop']);
  expect(view('containers').boxes.find((box) => box.id === 'web')).toEqual({ id: 'web', kind: 'apps', name: 'Web', in: 'shop', frame: false, type: 'browser' });
});

test('Components opens an app with components or a store it keeps, and leaves an app with nothing inside a box', () => {
  expect(boxesOf('components')).toEqual([
    'customer',
    'partner',
    '[shop]',
    '[api] in shop',
    'web in shop',
    'orders in shop',
    'sessions in api',
    'checkout in api',
    'dns',
    'gateway in shop',
  ]);
});

test('an end is drawn at the deepest drawn thing, and an end may be a frame', () => {
  const files = [connection('pay', 'checkout', 'partner'), connection('look', 'customer', 'shop')];
  expect(arrowsOf('systems', ...files)).toEqual(['customer > shop: look', 'shop > partner: pay']);
  expect(arrowsOf('containers', ...files)).toEqual(['customer > shop: look', 'api > partner: pay']);
  expect(arrowsOf('components', ...files)).toEqual(['customer > shop: look', 'checkout > partner: pay']);
});

test('several connections between the same two drawn boxes are one arrow that names them all', () => {
  const files = [connection('b-buys', 'customer', 'web'), connection('a-asks', 'customer', 'api')];
  expect(arrowsOf('systems', ...files)).toEqual(['customer > shop: a-asks b-buys']);
  expect(arrowsOf('containers', ...files)).toEqual(['customer > api: a-asks', 'customer > web: b-buys']);
});

test('a pair of boxes with arrows both ways is one arrow with both directions, and a pair one way only is not', () => {
  const files = [connection('b-buys', 'customer', 'web'), connection('a-asks', 'customer', 'api'), connection('c-calls', 'shop', 'customer')];
  expect(arrowsOf('systems', ...files)).toEqual(['customer > shop: a-asks b-buys < c-calls']);
  expect(view('systems', ...files).arrows.map((arrow) => arrow.id)).toEqual(['customer->shop']);
  expect(arrowsOf('containers', ...files)).toEqual(['customer > api: a-asks', 'customer > web: b-buys', 'shop > customer: c-calls']);
  expect(view('containers', ...files).arrows.every((arrow) => arrow.back === undefined)).toBe(true);
});

test('a person is with the people, a system of ours and infrastructure in no system are ours, and an outside system is external', () => {
  const files = [connection('pays', 'checkout', 'partner'), connection('looks', 'customer', 'web')];
  expect(zonesOf('systems', ...files)).toEqual(['customer: people', 'partner: external', 'shop: ours', 'dns: ours']);
  // Only the boxes at the top have a zone, and it is the same at every depth.
  expect(zonesOf('components', ...files)).toEqual(zonesOf('systems', ...files));
  expect(view('containers', ...files).boxes.filter((box) => box.zone !== undefined).map((box) => box.id)).toEqual(['customer', 'partner', 'shop', 'dns']);
});

test('an outside system that calls ours, or anything in it, and is called by none of ours is a caller with the people', () => {
  const bank = file('systems/bank.yaml', 'name: Bank\nexternal: true\n');
  const files = [bank, connection('settles', 'bank', 'checkout'), connection('pays', 'checkout', 'partner'), connection('answers', 'partner', 'shop')];
  expect(zonesOf('systems', ...files)).toEqual(['customer: people', 'bank: people caller', 'partner: external', 'shop: ours', 'dns: ours']);
  expect(zonesOf('containers', ...files)).toEqual(zonesOf('systems', ...files));
  // An outside system that calls nothing of ours is no caller.
  expect(zonesOf('systems', bank, connection('settles', 'bank', 'partner'))).toContain('bank: external');
});

test('no arrow is drawn inside one box, nor between a frame and what it holds, and what a connection passes through is not drawn', () => {
  const files = [connection('reads', 'api', 'orders', 'via: [gateway]\n'), connection('keeps', 'checkout', 'sessions'), connection('runs', 'api', 'checkout'), connection('serves', 'shop', 'web')];
  expect(arrowsOf('systems', ...files)).toEqual([]);
  expect(arrowsOf('containers', ...files)).toEqual(['api > orders: reads']);
  expect(arrowsOf('components', ...files)).toEqual(['api > orders: reads', 'checkout > sessions: keeps']);
});

test('a connection with an end that names nothing drawable is skipped', () => {
  const read = readModel([...SHOP, connection('lost', 'customer', 'nowhere'), connection('owned', 'customer', 'sales')]);
  expect(viewOf(read.records, 'components').arrows).toEqual([]);
});

test('a box lights itself, its arrows and the boxes at their other ends, and nothing else', () => {
  const files = [connection('looks', 'customer', 'web'), connection('pays', 'checkout', 'partner')];
  expect(litBy(view('systems', ...files), 'customer')).toEqual({ boxes: ['customer', 'shop'], arrows: ['customer->shop'] });
  expect(litBy(view('systems', ...files), 'dns')).toEqual({ boxes: ['dns'], arrows: [] });
});

test('an arrow lights itself and its two ends', () => {
  const files = [connection('looks', 'customer', 'web'), connection('pays', 'checkout', 'partner')];
  expect(litBy(view('systems', ...files), 'shop->partner')).toEqual({ boxes: ['partner', 'shop'], arrows: ['shop->partner'] });
});

test('the frames a bright box is in are bright, at any depth, and the other boxes in them are not, nor what an end that is a frame holds', () => {
  const files = [connection('looks', 'customer', 'web'), connection('pays', 'checkout', 'partner'), connection('asks', 'dns', 'shop')];
  expect(litBy(view('containers', ...files), 'customer')).toEqual({ boxes: ['customer', 'shop', 'web'], arrows: ['customer->web'] });
  expect(litBy(view('components', ...files), 'partner')).toEqual({ boxes: ['partner', 'shop', 'api', 'checkout'], arrows: ['checkout->partner'] });
  expect(litBy(view('containers', ...files), 'dns')).toEqual({ boxes: ['shop', 'dns'], arrows: ['dns->shop'] });
});

test('a frame lights nothing', () => {
  const files = [connection('looks', 'customer', 'web')];
  expect(litBy(view('containers', ...files), 'shop')).toBeUndefined();
  expect(litBy(view('components', ...files), 'api')).toBeUndefined();
});

test('an id that is neither a box nor an arrow of the view lights nothing', () => {
  const files = [connection('looks', 'customer', 'web')];
  expect(litBy(view('systems', ...files), 'nowhere')).toBeUndefined();
  // Drawn at a deeper depth only, and an arrow of another depth.
  expect(litBy(view('systems', ...files), 'web')).toBeUndefined();
  expect(litBy(view('systems', ...files), 'customer->web')).toBeUndefined();
});

test('the depth in the address is Systems when none is given or it is not known', () => {
  expect([depthOf(null), depthOf('containers'), depthOf('components'), depthOf('Components'), depthOf('')]).toEqual(['systems', 'containers', 'components', 'systems', 'systems']);
});

/** A bank: a second system with an app, named in small letters. */
const BANK = [file('systems/bank.yaml', 'name: bank\n'), file('apps/ledger.yaml', 'name: Ledger\nin: bank\n')];

test('a focus can be a system at Containers and an app at Components that the whole view opens, by name without regard to capitals', () => {
  const all = records(...BANK, file('components/cart.yaml', 'name: Cart\nin: web\n'));
  expect(focusesOf(all, 'systems')).toEqual([]);
  // The partner has no parts, and the ledger nothing inside.
  expect(focusesOf(all, 'containers')).toEqual([
    { id: 'bank', name: 'bank' },
    { id: 'shop', name: 'Shop' },
  ]);
  expect(focusesOf(all, 'components')).toEqual([
    { id: 'api', name: 'API' },
    { id: 'web', name: 'Web' },
  ]);
});

test('a focused system is a frame with what is inside it, and another system it has a line with is one closed box', () => {
  const focused = viewOf(records(...BANK, connection('looks', 'customer', 'web'), connection('books', 'checkout', 'ledger')), 'containers', 'shop');
  expect(boxesIn(focused)).toEqual(['customer', 'bank', '[shop]', 'api in shop', 'web in shop', 'orders in shop', 'gateway in shop']);
  expect(focused.boxes.find((box) => box.id === 'bank')).toEqual({ id: 'bank', kind: 'systems', name: 'bank', frame: false, zone: 'ours' });
  // A line from inside to an app of another system ends at that system.
  expect(arrowsIn(focused)).toEqual(['customer > web: looks', 'api > bank: books']);
});

test('around a focus, a line between two neighbours is not drawn, nor a box with no line to the focus', () => {
  const focused = viewOf(records(...BANK, connection('asks', 'customer', 'bank'), connection('pays', 'ledger', 'partner'), connection('reads', 'api', 'orders')), 'containers', 'shop');
  expect(arrowsIn(focused)).toEqual(['api > orders: reads']);
  expect(boxesIn(focused)).toEqual(['[shop]', 'api in shop', 'web in shop', 'orders in shop', 'gateway in shop']);
});

test('a focused app stands with its sister apps and stores as closed boxes, and its system is no frame', () => {
  const files = [
    file('components/cart.yaml', 'name: Cart\nin: web\n'),
    connection('fills', 'cart', 'checkout'),
    connection('keeps', 'api', 'orders'),
    connection('pays', 'checkout', 'partner'),
    connection('looks', 'customer', 'web'),
  ];
  const focused = viewOf(records(...files), 'components', 'api');
  // The web holds the cart in the whole view; here it is one box, with no frame of the shop round them.
  expect(boxesIn(focused)).toEqual(['partner', '[api]', 'web', 'orders', 'sessions in api', 'checkout in api']);
  expect(focused.boxes.find((box) => box.id === 'api')).toMatchObject({ frame: true, zone: 'ours' });
  expect(arrowsIn(focused)).toEqual(['api > orders: keeps', 'web > checkout: fills', 'checkout > partner: pays']);
});

test('a focus that is not a choice of its depth gives everything', () => {
  const all = records(connection('looks', 'customer', 'web'), connection('pays', 'checkout', 'partner'));
  for (const [depth, focus] of [['containers', 'nowhere'], ['containers', 'api'], ['containers', 'partner'], ['components', 'shop'], ['components', 'web'], ['systems', 'shop']] as const) {
    expect(viewOf(all, depth, focus)).toEqual(viewOf(all, depth));
  }
});

test('the focus in the address: a choice itself, at Containers the system a thing is in, and else none', () => {
  const all = records();
  expect([focusFor(all, 'containers', 'shop'), focusFor(all, 'containers', 'api'), focusFor(all, 'containers', 'checkout'), focusFor(all, 'components', 'api')]).toEqual(['shop', 'shop', 'shop', 'api']);
  expect([focusFor(all, 'components', 'shop'), focusFor(all, 'components', 'checkout'), focusFor(all, 'containers', 'partner'), focusFor(all, 'containers', 'dns')]).toEqual([undefined, undefined, undefined, undefined]);
  expect([focusFor(all, 'systems', 'shop'), focusFor(all, 'containers', null), focusFor(all, 'containers', 'nowhere')]).toEqual([undefined, undefined, undefined]);
});
