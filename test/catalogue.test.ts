import { expect, test } from 'vitest';
import { catalogueOf } from '../src/model/catalogue.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

/** A shop with an outside partner, a person, an owner on the system and a technology. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'people/customer.yaml', text: 'name: Customer\nonly: on weekdays\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\nowner: sales\nonly: in Europe\n' },
  { path: 'systems/partner.yaml', text: 'name: Partner\nexternal: true\n' },
  { path: 'apps/web.yaml', text: 'name: Web\nin: shop\nkind: browser\n' },
  { path: 'apps/api.yaml', text: 'name: API\nin: shop\ntechnology: [go]\nowner: platform\nonly: when it is busy\n' },
  { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\nkind: database\ntechnology: [go]\n' },
  { path: 'stores/sessions.yaml', text: 'name: Sessions\nin: api\nkind: cache\n' },
  { path: 'components/checkout.yaml', text: 'name: Checkout\nin: api\nonly: for a paid order\n' },
  { path: 'infrastructure/gateway.yaml', text: 'name: Gateway\nin: shop\n' },
  { path: 'infrastructure/dns.yaml', text: 'name: DNS\n' },
  { path: 'owners/sales.yaml', text: 'name: Sales\n' },
  { path: 'owners/platform.yaml', text: 'name: Platform\n' },
  { path: 'technologies/go.yaml', text: 'name: Go\n' },
  { path: 'connections/buys.yaml', text: 'from: customer\nto: web\nname: Buys\n' },
  { path: 'connections/writes.yaml', text: 'from: api\nto: orders\naccess: write\ntechnology: [go]\n' },
  { path: 'connections/asks.yaml', text: 'from: web\nto: api\nname: Asks\nvia: [gateway]\n' },
  { path: 'connections/pays.yaml', text: 'from: checkout\nto: partner\nname: Pays\n' },
];

const catalogue = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return catalogueOf(read.records);
};
const ids = (records: readonly { id: string }[]) => records.map((record) => record.id);

test('the Software tab holds the systems by name, what is in them below, then the infrastructure in no system, and no person', () => {
  const rows = catalogue().software.map(({ record, depth }) => `${'  '.repeat(depth)}${record.id}`);
  expect(rows).toEqual(['partner', 'shop', '  api', '    checkout', '    sessions', '  web', '  orders', '  gateway', 'dns']);
});

test('names are ordered without regard to capitals, and a connection with no name stands after those with one', () => {
  const lower = { path: 'people/admin.yaml', text: 'name: admin\n' };
  const upper = { path: 'people/buyer.yaml', text: 'name: Buyer\n' };
  const cat = catalogue(lower, upper);
  expect(ids(cat.people)).toEqual(['admin', 'buyer', 'customer']);
  expect(ids(cat.connections)).toEqual(['asks', 'buys', 'pays', 'writes']);
  expect(ids(cat.owners)).toEqual(['platform', 'sales']);
});

test('a store an app keeps is inside the app, after its components, and what a thing is in goes upwards', () => {
  const cat = catalogue();
  expect(ids(cat.inside('api'))).toEqual(['checkout', 'sessions']);
  expect(ids(cat.inside('shop'))).toEqual(['api', 'web', 'orders', 'gateway']);
  expect(ids(cat.chain('sessions'))).toEqual(['api', 'shop']);
  expect(ids(cat.chain('shop'))).toEqual([]);
});

test('the connections that start at a thing and those that end at it', () => {
  const cat = catalogue();
  expect(ids(cat.from('web'))).toEqual(['asks']);
  expect(ids(cat.to('web'))).toEqual(['buys']);
  expect(ids(cat.from('customer'))).toEqual(['buys']);
  expect(ids(cat.to('partner'))).toEqual(['pays']);
  // Passing through a thing is neither.
  expect(cat.from('gateway')).toEqual([]);
  expect(cat.to('gateway')).toEqual([]);
});

test('a technology is used by the parts and the connections that name it', () => {
  const used = catalogue().usedBy('go');
  expect(ids(used.parts)).toEqual(['api', 'orders']);
  expect(ids(used.connections)).toEqual(['writes']);
});

test('a part takes its owner from the nearest thing it is in that has one, with its source', () => {
  const cat = catalogue();
  expect(cat.owner('shop')).toEqual({ id: 'sales', from: 'shop' });
  expect(cat.owner('web')).toEqual({ id: 'sales', from: 'shop' });
  expect(cat.owner('checkout')).toEqual({ id: 'platform', from: 'api' });
  expect(cat.owner('partner')).toBeUndefined();
  expect(cat.owner('customer')).toBeUndefined();
  expect(ids(cat.answersFor('sales').written)).toEqual(['shop']);
  expect(ids(cat.answersFor('sales').taken)).toEqual(['gateway', 'orders', 'web']);
  expect(ids(cat.answersFor('platform').taken)).toEqual(['checkout', 'sessions']);
});

test('the conditions of a thing are its own, then those of each thing it is in, upwards', () => {
  const cat = catalogue();
  expect(cat.conditions('checkout')).toEqual([
    { text: 'for a paid order', from: 'checkout' },
    { text: 'when it is busy', from: 'api' },
    { text: 'in Europe', from: 'shop' },
  ]);
  expect(cat.conditions('customer')).toEqual([{ text: 'on weekdays', from: 'customer' }]);
  expect(cat.conditions('partner')).toEqual([]);
});

test('each record has the address of its page, and a reference to nothing is not followed', () => {
  // `seefore check` finds the reference to nothing; the pages still read the rest.
  const cat = catalogueOf(readModel([...SHOP, { path: 'apps/lost.yaml', text: 'name: Lost\nin: nowhere\n' }]).records);
  const address = (id: string) => {
    const record = cat.record(id);
    return record && cat.address(record);
  };
  expect(['shop', 'web', 'customer', 'asks', 'go', 'sales', 'dns'].map(address)).toEqual([
    '/models/shop',
    '/models/web',
    '/actors/customer',
    '/connections/asks',
    '/technologies/go',
    '/owners/sales',
    '/models/dns',
  ]);
  expect(cat.record('nowhere')).toBeUndefined();
  expect(cat.nameOf('nowhere')).toBe('nowhere');
  expect(cat.chain('lost')).toEqual([]);
  // A part whose `in` names nothing still has a row, after the rest.
  expect(cat.software.at(-1)).toEqual({ record: cat.record('lost'), depth: 0 });
});
