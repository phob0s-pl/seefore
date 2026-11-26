import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { depthOf, diagramAt, focusesOf, focusFor, litBy, viewOf } from '../src/model/view.ts';
import type { Depth, View } from '../src/model/view.ts';

/** A shop and a partner: one system with parts, one with none, and an app with parts of its own. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'people/person-customer.yaml', text: 'name: Customer\n' },
  { path: 'systems/system-shop.yaml', text: 'name: Shop\nowner: owner-sales\n' },
  { path: 'systems/system-partner.yaml', text: 'name: Partner\nexternal: true\n' },
  { path: 'apps/app-web.yaml', text: 'name: Web\nin: system-shop\nkind: browser\n' },
  { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\ntechnology: [tech-go]\n' },
  { path: 'stores/store-orders.yaml', text: 'name: Orders\nin: system-shop\nkind: database\n' },
  { path: 'stores/store-sessions.yaml', text: 'name: Sessions\nin: app-api\nkind: cache\n' },
  { path: 'components/component-checkout.yaml', text: 'name: Checkout\nin: app-api\n' },
  { path: 'infrastructure/infra-gateway.yaml', text: 'name: Gateway\nin: system-shop\n' },
  { path: 'infrastructure/infra-dns.yaml', text: 'name: DNS\n' },
  { path: 'owners/owner-sales.yaml', text: 'name: Sales\n' },
  { path: 'technologies/tech-go.yaml', text: 'name: Go\n' },
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
  expect(boxesOf('systems')).toEqual(['person-customer', 'system-partner', 'system-shop', 'infra-dns']);
  expect(view('systems').boxes).toEqual([
    { id: 'person-customer', kind: 'people', name: 'Customer', frame: false, zone: 'people' },
    { id: 'system-partner', kind: 'systems', name: 'Partner', frame: false, external: true, zone: 'external' },
    { id: 'system-shop', kind: 'systems', name: 'Shop', frame: false, zone: 'ours', opens: 'containers' },
    { id: 'infra-dns', kind: 'infrastructure', name: 'DNS', frame: false, zone: 'ours' },
  ]);
});

test('Containers opens a system with parts, leaves a system with none a box, and keeps a store an app keeps inside its app', () => {
  expect(boxesOf('containers')).toEqual(['person-customer', 'system-partner', '[system-shop]', 'app-api in system-shop', 'app-web in system-shop', 'store-orders in system-shop', 'infra-dns', 'infra-gateway in system-shop']);
  expect(view('containers').boxes.find((box) => box.id === 'app-web')).toEqual({ id: 'app-web', kind: 'apps', name: 'Web', in: 'system-shop', frame: false, type: 'browser' });
});

test('Components opens an app with components or a store it keeps, and leaves an app with nothing inside a box', () => {
  expect(boxesOf('components')).toEqual([
    'person-customer',
    'system-partner',
    '[system-shop]',
    '[app-api] in system-shop',
    'app-web in system-shop',
    'store-orders in system-shop',
    'store-sessions in app-api',
    'component-checkout in app-api',
    'infra-dns',
    'infra-gateway in system-shop',
  ]);
});

test('an end is drawn at the deepest drawn thing, and an end may be a frame', () => {
  const files = [connection('connection-pay', 'component-checkout', 'system-partner'), connection('connection-look', 'person-customer', 'system-shop')];
  expect(arrowsOf('systems', ...files)).toEqual(['person-customer > system-shop: connection-look', 'system-shop > system-partner: connection-pay']);
  expect(arrowsOf('containers', ...files)).toEqual(['person-customer > system-shop: connection-look', 'app-api > system-partner: connection-pay']);
  expect(arrowsOf('components', ...files)).toEqual(['person-customer > system-shop: connection-look', 'component-checkout > system-partner: connection-pay']);
});

test('several connections between the same two drawn boxes are one arrow that names them all', () => {
  const files = [connection('connection-b-buys', 'person-customer', 'app-web'), connection('connection-a-asks', 'person-customer', 'app-api')];
  expect(arrowsOf('systems', ...files)).toEqual(['person-customer > system-shop: connection-a-asks connection-b-buys']);
  expect(arrowsOf('containers', ...files)).toEqual(['person-customer > app-api: connection-a-asks', 'person-customer > app-web: connection-b-buys']);
});

test('a pair of boxes with arrows both ways is one arrow with both directions, and a pair one way only is not', () => {
  const files = [connection('connection-b-buys', 'person-customer', 'app-web'), connection('connection-a-asks', 'person-customer', 'app-api'), connection('connection-c-calls', 'system-shop', 'person-customer')];
  expect(arrowsOf('systems', ...files)).toEqual(['person-customer > system-shop: connection-a-asks connection-b-buys < connection-c-calls']);
  expect(view('systems', ...files).arrows.map((arrow) => arrow.id)).toEqual(['person-customer->system-shop']);
  expect(arrowsOf('containers', ...files)).toEqual(['person-customer > app-api: connection-a-asks', 'person-customer > app-web: connection-b-buys', 'system-shop > person-customer: connection-c-calls']);
  expect(view('containers', ...files).arrows.every((arrow) => arrow.back === undefined)).toBe(true);
});

test('a person is with the people, a system of ours and infrastructure in no system are ours, and an outside system is external', () => {
  const files = [connection('connection-pays', 'component-checkout', 'system-partner'), connection('connection-looks', 'person-customer', 'app-web')];
  expect(zonesOf('systems', ...files)).toEqual(['person-customer: people', 'system-partner: external', 'system-shop: ours', 'infra-dns: ours']);
  // Only the boxes at the top have a zone, and it is the same at every depth.
  expect(zonesOf('components', ...files)).toEqual(zonesOf('systems', ...files));
  expect(view('containers', ...files).boxes.filter((box) => box.zone !== undefined).map((box) => box.id)).toEqual(['person-customer', 'system-partner', 'system-shop', 'infra-dns']);
});

test('an outside system that calls ours, or anything in it, and is called by none of ours is a caller with the people', () => {
  const bank = file('systems/system-bank.yaml', 'name: Bank\nexternal: true\n');
  const files = [bank, connection('connection-settles', 'system-bank', 'component-checkout'), connection('connection-pays', 'component-checkout', 'system-partner'), connection('connection-answers', 'system-partner', 'system-shop')];
  expect(zonesOf('systems', ...files)).toEqual(['person-customer: people', 'system-bank: people caller', 'system-partner: external', 'system-shop: ours', 'infra-dns: ours']);
  expect(zonesOf('containers', ...files)).toEqual(zonesOf('systems', ...files));
  // An outside system that calls nothing of ours is no caller.
  expect(zonesOf('systems', bank, connection('connection-settles', 'system-bank', 'system-partner'))).toContain('system-bank: external');
});

test('no arrow is drawn inside one box, nor between a frame and what it holds, and what a connection passes through is not drawn', () => {
  const files = [connection('connection-reads', 'app-api', 'store-orders', 'via: [infra-gateway]\n'), connection('connection-keeps', 'component-checkout', 'store-sessions'), connection('connection-runs', 'app-api', 'component-checkout'), connection('connection-serves', 'system-shop', 'app-web')];
  expect(arrowsOf('systems', ...files)).toEqual([]);
  expect(arrowsOf('containers', ...files)).toEqual(['app-api > store-orders: connection-reads']);
  expect(arrowsOf('components', ...files)).toEqual(['app-api > store-orders: connection-reads', 'component-checkout > store-sessions: connection-keeps']);
});

test('a connection with an end that names nothing drawable is skipped', () => {
  const read = readModel([...SHOP, connection('connection-lost', 'person-customer', 'system-nowhere'), connection('connection-owned', 'person-customer', 'owner-sales')]);
  expect(viewOf(read.records, 'components').arrows).toEqual([]);
});

test('a box lights itself, its arrows and the boxes at their other ends, and nothing else', () => {
  const files = [connection('connection-looks', 'person-customer', 'app-web'), connection('connection-pays', 'component-checkout', 'system-partner')];
  expect(litBy(view('systems', ...files), 'person-customer')).toEqual({ boxes: ['person-customer', 'system-shop'], arrows: ['person-customer->system-shop'] });
  expect(litBy(view('systems', ...files), 'infra-dns')).toEqual({ boxes: ['infra-dns'], arrows: [] });
});

test('an arrow lights itself and its two ends', () => {
  const files = [connection('connection-looks', 'person-customer', 'app-web'), connection('connection-pays', 'component-checkout', 'system-partner')];
  expect(litBy(view('systems', ...files), 'system-shop->system-partner')).toEqual({ boxes: ['system-partner', 'system-shop'], arrows: ['system-shop->system-partner'] });
});

test('the frames a bright box is in are bright, at any depth, and the other boxes in them are not, nor what an end that is a frame holds', () => {
  const files = [connection('connection-looks', 'person-customer', 'app-web'), connection('connection-pays', 'component-checkout', 'system-partner'), connection('connection-asks', 'infra-dns', 'system-shop')];
  expect(litBy(view('containers', ...files), 'person-customer')).toEqual({ boxes: ['person-customer', 'system-shop', 'app-web'], arrows: ['person-customer->app-web'] });
  expect(litBy(view('components', ...files), 'system-partner')).toEqual({ boxes: ['system-partner', 'system-shop', 'app-api', 'component-checkout'], arrows: ['component-checkout->system-partner'] });
  expect(litBy(view('containers', ...files), 'infra-dns')).toEqual({ boxes: ['system-shop', 'infra-dns'], arrows: ['infra-dns->system-shop'] });
});

test('a frame lights nothing', () => {
  const files = [connection('connection-looks', 'person-customer', 'app-web')];
  expect(litBy(view('containers', ...files), 'system-shop')).toBeUndefined();
  expect(litBy(view('components', ...files), 'app-api')).toBeUndefined();
});

test('an id that is neither a box nor an arrow of the view lights nothing', () => {
  const files = [connection('connection-looks', 'person-customer', 'app-web')];
  expect(litBy(view('systems', ...files), 'system-nowhere')).toBeUndefined();
  // Drawn at a deeper depth only, and an arrow of another depth.
  expect(litBy(view('systems', ...files), 'app-web')).toBeUndefined();
  expect(litBy(view('systems', ...files), 'person-customer->app-web')).toBeUndefined();
});

test('the depth in the address is Systems when none is given or it is not known', () => {
  expect([depthOf(null), depthOf('containers'), depthOf('components'), depthOf('Components'), depthOf('')]).toEqual(['systems', 'containers', 'components', 'systems', 'systems']);
});

/** A bank: a second system with an app, named in small letters. */
const BANK = [file('systems/system-bank.yaml', 'name: bank\n'), file('apps/app-ledger.yaml', 'name: Ledger\nin: system-bank\n')];

test('a focus can be a system with something in it at both deeper depths, and at Components an app with a component too, under its system, by name without regard to capitals', () => {
  const all = records(...BANK, file('components/component-cart.yaml', 'name: Cart\nin: app-web\n'));
  expect(focusesOf(all, 'systems')).toEqual([]);
  // The partner has no parts.
  expect(focusesOf(all, 'containers')).toEqual([
    { id: 'system-bank', name: 'bank' },
    { id: 'system-shop', name: 'Shop' },
  ]);
  // The ledger has nothing inside: the bank stands with no app under it.
  expect(focusesOf(all, 'components')).toEqual([
    { id: 'system-bank', name: 'bank' },
    { id: 'system-shop', name: 'Shop' },
    { id: 'app-api', name: 'API', in: 'system-shop' },
    { id: 'app-web', name: 'Web', in: 'system-shop' },
  ]);
});

test('an app that holds only a store is no choice at Components: its id means its system, whose view opens it', () => {
  const all = records(...BANK, file('stores/store-books.yaml', 'name: Books\nin: app-ledger\n'));
  expect(focusesOf(all, 'components').map((choice) => choice.id)).toEqual(['system-bank', 'system-shop', 'app-api']);
  expect(focusFor(all, 'components', 'app-ledger')).toBe('system-bank');
  expect(viewOf(all, 'components', 'app-ledger')).toEqual(viewOf(all, 'components'));
  expect(boxesIn(viewOf(all, 'components', 'system-bank'))).toEqual(['[system-bank]', '[app-ledger] in system-bank', 'store-books in app-ledger']);
});

test('at Components a focused system is a frame with its apps opened, and another system it has a line with is one closed box', () => {
  const focused = viewOf(records(...BANK, connection('connection-looks', 'person-customer', 'app-web'), connection('connection-books', 'component-checkout', 'app-ledger')), 'components', 'system-shop');
  expect(boxesIn(focused)).toEqual([
    'person-customer',
    'system-bank',
    '[system-shop]',
    '[app-api] in system-shop',
    'app-web in system-shop',
    'store-orders in system-shop',
    'store-sessions in app-api',
    'component-checkout in app-api',
    'infra-gateway in system-shop',
  ]);
  // A line from a component to an app of another system ends at that system.
  expect(arrowsIn(focused)).toEqual(['person-customer > app-web: connection-looks', 'component-checkout > system-bank: connection-books']);
});

test('a box that can be the focus says at which depth it first is, and the focus itself does not at its own depth', () => {
  const all = records(...BANK);
  const opens = (view: View) => view.boxes.flatMap((box) => (box.opens !== undefined ? [`${box.id}: ${box.opens}`] : []));
  // The partner has no parts; the ledger and the web hold nothing, and the API holds a component.
  expect(opens(viewOf(all, 'systems'))).toEqual(['system-bank: containers', 'system-shop: containers']);
  expect(opens(viewOf(all, 'containers'))).toEqual(['system-bank: containers', 'system-shop: containers', 'app-api: components']);
  expect(opens(viewOf(all, 'containers', 'system-shop'))).toEqual(['app-api: components']);
  expect(opens(viewOf(all, 'components', 'system-shop'))).toEqual(['system-shop: containers', 'app-api: components']);
  expect(opens(viewOf(all, 'components', 'app-api'))).toEqual([]);
});

test('the address of the diagram holds the depth and the focus, and Systems has neither', () => {
  expect([diagramAt('systems'), diagramAt('systems', 'system-shop'), diagramAt('containers'), diagramAt('containers', 'system-shop'), diagramAt('components', 'app-api')]).toEqual([
    '/',
    '/',
    '/?depth=containers',
    '/?depth=containers&focus=system-shop',
    '/?depth=components&focus=app-api',
  ]);
});

test('a focused system is a frame with what is inside it, and another system it has a line with is one closed box', () => {
  const focused = viewOf(records(...BANK, connection('connection-looks', 'person-customer', 'app-web'), connection('connection-books', 'component-checkout', 'app-ledger')), 'containers', 'system-shop');
  expect(boxesIn(focused)).toEqual(['person-customer', 'system-bank', '[system-shop]', 'app-api in system-shop', 'app-web in system-shop', 'store-orders in system-shop', 'infra-gateway in system-shop']);
  expect(focused.boxes.find((box) => box.id === 'system-bank')).toEqual({ id: 'system-bank', kind: 'systems', name: 'bank', frame: false, zone: 'ours', opens: 'containers' });
  // A line from inside to an app of another system ends at that system.
  expect(arrowsIn(focused)).toEqual(['person-customer > app-web: connection-looks', 'app-api > system-bank: connection-books']);
});

test('around a focus, a line between two neighbours is not drawn, nor a box with no line to the focus', () => {
  const focused = viewOf(records(...BANK, connection('connection-asks', 'person-customer', 'system-bank'), connection('connection-pays', 'app-ledger', 'system-partner'), connection('connection-reads', 'app-api', 'store-orders')), 'containers', 'system-shop');
  expect(arrowsIn(focused)).toEqual(['app-api > store-orders: connection-reads']);
  expect(boxesIn(focused)).toEqual(['[system-shop]', 'app-api in system-shop', 'app-web in system-shop', 'store-orders in system-shop', 'infra-gateway in system-shop']);
});

test('a focused app stands with its sister apps and stores as closed boxes, and its system is no frame', () => {
  const files = [
    file('components/component-cart.yaml', 'name: Cart\nin: app-web\n'),
    connection('connection-fills', 'component-cart', 'component-checkout'),
    connection('connection-keeps', 'app-api', 'store-orders'),
    connection('connection-pays', 'component-checkout', 'system-partner'),
    connection('connection-looks', 'person-customer', 'app-web'),
  ];
  const focused = viewOf(records(...files), 'components', 'app-api');
  // The web holds the cart in the whole view; here it is one box, with no frame of the shop round them.
  expect(boxesIn(focused)).toEqual(['system-partner', '[app-api]', 'app-web', 'store-orders', 'store-sessions in app-api', 'component-checkout in app-api']);
  expect(focused.boxes.find((box) => box.id === 'app-api')).toMatchObject({ frame: true, zone: 'ours' });
  expect(arrowsIn(focused)).toEqual(['app-api > store-orders: connection-keeps', 'app-web > component-checkout: connection-fills', 'component-checkout > system-partner: connection-pays']);
});

test('a focus that is not a choice of its depth gives everything', () => {
  const all = records(connection('connection-looks', 'person-customer', 'app-web'), connection('connection-pays', 'component-checkout', 'system-partner'));
  for (const [depth, focus] of [['containers', 'system-nowhere'], ['containers', 'app-api'], ['containers', 'system-partner'], ['components', 'system-partner'], ['components', 'app-web'], ['systems', 'system-shop']] as const) {
    expect(viewOf(all, depth, focus)).toEqual(viewOf(all, depth));
  }
});

test('the focus in the address: a choice itself, else the nearest thing it is in that is one, and else none', () => {
  const all = records();
  expect([focusFor(all, 'containers', 'system-shop'), focusFor(all, 'containers', 'app-api'), focusFor(all, 'containers', 'component-checkout'), focusFor(all, 'components', 'app-api')]).toEqual(['system-shop', 'system-shop', 'system-shop', 'app-api']);
  // A system chosen at Containers is kept at Components. There a component and a store mean their app, and an app with no component its system.
  expect([focusFor(all, 'components', 'system-shop'), focusFor(all, 'components', 'component-checkout'), focusFor(all, 'components', 'store-sessions'), focusFor(all, 'components', 'app-web')]).toEqual(['system-shop', 'app-api', 'app-api', 'system-shop']);
  expect([focusFor(all, 'containers', 'system-partner'), focusFor(all, 'components', 'system-partner'), focusFor(all, 'containers', 'infra-dns')]).toEqual([undefined, undefined, undefined]);
  expect([focusFor(all, 'systems', 'system-shop'), focusFor(all, 'containers', null), focusFor(all, 'containers', 'system-nowhere')]).toEqual([undefined, undefined, undefined]);
});

/** A queue, a topic and what uses them, beside the shop's database. */
const JOBS = file('stores/store-jobs.yaml', 'name: Jobs\nin: system-shop\nkind: queue\n');
const NEWS = file('stores/store-news.yaml', 'name: News\nin: system-shop\nkind: topic\n');
const reading = (depth: Depth, ...files: SourceFile[]) =>
  view(depth, JOBS, NEWS, ...files)
    .arrows.filter((arrow) => arrow.reads)
    .map((arrow) => arrow.id);

test('an arrow that only reads a queue or a topic is marked, and one that writes it, or says nothing of it, is not', () => {
  expect(
    reading(
      'containers',
      connection('connection-api-puts-jobs', 'app-api', 'store-jobs', 'access: write\n'),
      connection('connection-web-takes-jobs', 'app-web', 'store-jobs', 'access: read\n'),
      connection('connection-partner-hears-news', 'system-partner', 'store-news', 'access: read\n'),
      connection('connection-api-uses-news', 'app-api', 'store-news', 'access: read-write\n'),
      connection('connection-gateway-meets-news', 'infra-gateway', 'store-news'),
    ),
  ).toEqual(['system-partner->store-news', 'app-web->store-jobs']);
});

test('an arrow is not marked when it reads another kind of store, when one of its connections writes, or when the store is not drawn', () => {
  expect(reading('containers', connection('connection-web-reads-orders', 'app-web', 'store-orders', 'access: read\n'))).toEqual([]);
  expect(reading('containers', connection('connection-web-takes-jobs', 'app-web', 'store-jobs', 'access: read\n'), connection('connection-web-puts-jobs', 'app-web', 'store-jobs', 'access: write\n'))).toEqual([]);
  // At the Systems depth the queue is inside its system: the arrow ends at the system.
  expect(reading('systems', connection('connection-partner-takes-jobs', 'system-partner', 'store-jobs', 'access: read\n'))).toEqual([]);
});

test('an arrow that only reads is marked in a focused view too', () => {
  const focused = viewOf(records(JOBS, connection('connection-partner-takes-jobs', 'system-partner', 'store-jobs', 'access: read\n')), 'containers', 'system-shop');
  expect(focused.arrows.map((arrow) => [arrow.id, arrow.reads])).toEqual([['system-partner->store-jobs', true]]);
});

test('a pair with arrows both ways is never marked', () => {
  const both = view('containers', JOBS, connection('connection-web-takes-jobs', 'app-web', 'store-jobs', 'access: read\n'), connection('connection-jobs-wakes-web', 'store-jobs', 'app-web'));
  expect(both.arrows.map((arrow) => [arrow.id, arrow.back, arrow.reads])).toEqual([['app-web->store-jobs', ['connection-jobs-wakes-web'], undefined]]);
});
