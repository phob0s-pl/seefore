import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { depthOf, viewOf } from '../src/model/view.ts';
import type { Depth } from '../src/model/view.ts';

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
const view = (depth: Depth, ...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return viewOf(read.records, depth);
};
/** Each box as `id`, `id in frame`, and `[id]` for a frame. */
const boxesOf = (depth: Depth, ...files: SourceFile[]) =>
  view(depth, ...files).boxes.map((box) => `${box.frame ? `[${box.id}]` : box.id}${box.in ? ` in ${box.in}` : ''}`);
/** Each arrow as `from > to: connections`, and `< back` for those the other way. */
const arrowsOf = (depth: Depth, ...files: SourceFile[]) =>
  view(depth, ...files).arrows.map((arrow) => `${arrow.from} > ${arrow.to}: ${arrow.connections.join(' ')}${arrow.back ? ` < ${arrow.back.join(' ')}` : ''}`);
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

test('the depth in the address is Systems when none is given or it is not known', () => {
  expect([depthOf(null), depthOf('containers'), depthOf('components'), depthOf('Components'), depthOf('')]).toEqual(['systems', 'containers', 'components', 'systems', 'systems']);
});
