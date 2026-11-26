import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { catalogueOf } from '../src/model/catalogue.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

/** A shop with an outside partner, a person, an owner on the system and a technology. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'people/person-customer.yaml', text: 'name: Customer\nonly: on weekdays\n' },
  { path: 'systems/system-shop.yaml', text: 'name: Shop\nowner: owner-sales\nonly: in Europe\n' },
  { path: 'systems/system-partner.yaml', text: 'name: Partner\nexternal: true\n' },
  { path: 'apps/app-web.yaml', text: 'name: Web\nin: system-shop\nkind: browser\n' },
  { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\ntechnology: [tech-go]\nowner: owner-platform\nonly: when it is busy\n' },
  { path: 'stores/store-orders.yaml', text: 'name: Orders\nin: system-shop\nkind: database\ntechnology: [tech-go]\n' },
  { path: 'stores/store-sessions.yaml', text: 'name: Sessions\nin: app-api\nkind: cache\n' },
  { path: 'components/component-checkout.yaml', text: 'name: Checkout\nin: app-api\nonly: for a paid order\n' },
  { path: 'infrastructure/infra-gateway.yaml', text: 'name: Gateway\nin: system-shop\n' },
  { path: 'infrastructure/infra-dns.yaml', text: 'name: DNS\n' },
  { path: 'owners/owner-sales.yaml', text: 'name: Sales\n' },
  { path: 'owners/owner-platform.yaml', text: 'name: Platform\n' },
  { path: 'technologies/tech-go.yaml', text: 'name: Go\n' },
  { path: 'connections/connection-buys.yaml', text: 'from: person-customer\nto: app-web\nname: Buys\n' },
  { path: 'connections/connection-writes.yaml', text: 'from: app-api\nto: store-orders\naccess: write\ntechnology: [tech-go]\n' },
  { path: 'connections/connection-asks.yaml', text: 'from: app-web\nto: app-api\nname: Asks\nvia: [infra-gateway]\n' },
  { path: 'connections/connection-pays.yaml', text: 'from: component-checkout\nto: system-partner\nname: Pays\n' },
];

const catalogue = (...files: SourceFile[]) => {
  const read = readModel([...SHOP, ...files]);
  expect(read.problems).toEqual([]);
  return catalogueOf(read.records);
};
const ids = (records: readonly { id: string }[]) => records.map((record) => record.id);

test('the Software tab holds the systems by name, what is in them below, then the infrastructure in no system, and no person', () => {
  const rows = catalogue().software.map(({ record, depth }) => `${'  '.repeat(depth)}${record.id}`);
  expect(rows).toEqual(['system-partner', 'system-shop', '  app-api', '    component-checkout', '    store-sessions', '  app-web', '  store-orders', '  infra-gateway', 'infra-dns']);
});

test('names are ordered without regard to capitals, and a connection with no name stands after those with one', () => {
  const lower = { path: 'people/person-admin.yaml', text: 'name: admin\n' };
  const upper = { path: 'people/person-buyer.yaml', text: 'name: Buyer\n' };
  const cat = catalogue(lower, upper);
  expect(ids(cat.people)).toEqual(['person-admin', 'person-buyer', 'person-customer']);
  expect(ids(cat.connections)).toEqual(['connection-asks', 'connection-buys', 'connection-pays', 'connection-writes']);
  expect(ids(cat.owners)).toEqual(['owner-platform', 'owner-sales']);
});

test('a store an app keeps is inside the app, after its components, and what a thing is in goes upwards', () => {
  const cat = catalogue();
  expect(ids(cat.inside('app-api'))).toEqual(['component-checkout', 'store-sessions']);
  expect(ids(cat.inside('system-shop'))).toEqual(['app-api', 'app-web', 'store-orders', 'infra-gateway']);
  expect(ids(cat.chain('store-sessions'))).toEqual(['app-api', 'system-shop']);
  expect(ids(cat.chain('system-shop'))).toEqual([]);
});

test('the connections that start at a thing and those that end at it', () => {
  const cat = catalogue();
  expect(ids(cat.from('app-web'))).toEqual(['connection-asks']);
  expect(ids(cat.to('app-web'))).toEqual(['connection-buys']);
  expect(ids(cat.from('person-customer'))).toEqual(['connection-buys']);
  expect(ids(cat.to('system-partner'))).toEqual(['connection-pays']);
  // Passing through a thing is neither.
  expect(cat.from('infra-gateway')).toEqual([]);
  expect(cat.to('infra-gateway')).toEqual([]);
});

test('a technology is used by the parts and the connections that name it', () => {
  const used = catalogue().usedBy('tech-go');
  expect(ids(used.parts)).toEqual(['app-api', 'store-orders']);
  expect(ids(used.connections)).toEqual(['connection-writes']);
});

test('a part takes its owner from the nearest thing it is in that has one, with its source', () => {
  const cat = catalogue();
  expect(cat.owner('system-shop')).toEqual({ id: 'owner-sales', from: 'system-shop' });
  expect(cat.owner('app-web')).toEqual({ id: 'owner-sales', from: 'system-shop' });
  expect(cat.owner('component-checkout')).toEqual({ id: 'owner-platform', from: 'app-api' });
  expect(cat.owner('system-partner')).toBeUndefined();
  expect(cat.owner('person-customer')).toBeUndefined();
  expect(ids(cat.answersFor('owner-sales').written)).toEqual(['system-shop']);
  expect(ids(cat.answersFor('owner-sales').taken)).toEqual(['infra-gateway', 'store-orders', 'app-web']);
  expect(ids(cat.answersFor('owner-platform').taken)).toEqual(['component-checkout', 'store-sessions']);
});

test("an app's code is in its own repository or else its system's, and a repository holds the code of the systems and apps that name it and of those that take it", () => {
  // The shop with its system and its web app naming a repository each.
  const named: Record<string, string> = {
    'systems/system-shop.yaml': 'name: Shop\nowner: owner-sales\nonly: in Europe\nrepository: repo-shop\n',
    'apps/app-web.yaml': 'name: Web\nin: system-shop\nkind: browser\nrepository: repo-web\n',
  };
  const read = readModel([
    ...SHOP.map((each) => ({ ...each, text: named[each.path] ?? each.text })),
    { path: 'repositories/repo-shop.yaml', text: 'name: shop\nworkspace: true\n' },
    { path: 'repositories/repo-web.yaml', text: 'name: web\nurl: https://example.org/tea/web\n' },
  ]);
  expect(read.problems).toEqual([]);
  const cat = catalogueOf(read.records);
  expect(cat.repository('system-shop')).toEqual({ id: 'repo-shop', from: 'system-shop' });
  expect(cat.repository('app-web')).toEqual({ id: 'repo-web', from: 'app-web' });
  expect(cat.repository('app-api')).toEqual({ id: 'repo-shop', from: 'system-shop' });
  // A store, a component and a piece of infrastructure have none, nor a system that names none, nor a person.
  for (const id of ['store-orders', 'component-checkout', 'infra-gateway', 'system-partner', 'person-customer']) expect(cat.repository(id), id).toBeUndefined();
  expect(ids(cat.codeIn('repo-shop'))).toEqual(['system-shop', 'app-api']);
  expect(ids(cat.codeIn('repo-web'))).toEqual(['app-web']);
  expect(ids(cat.repositories)).toEqual(['repo-shop', 'repo-web']);
  expect(cat.address(cat.record('repo-shop') as ModelRecord)).toBe('/repositories/repo-shop');
});

test('the conditions of a thing are its own, then those of each thing it is in, upwards', () => {
  const cat = catalogue();
  expect(cat.conditions('component-checkout')).toEqual([
    { text: 'for a paid order', from: 'component-checkout' },
    { text: 'when it is busy', from: 'app-api' },
    { text: 'in Europe', from: 'system-shop' },
  ]);
  expect(cat.conditions('person-customer')).toEqual([{ text: 'on weekdays', from: 'person-customer' }]);
  expect(cat.conditions('system-partner')).toEqual([]);
});

test('each record has the address of its page, and a reference to nothing is not followed', () => {
  // `seefore check` finds the reference to nothing; the pages still read the rest.
  const cat = catalogueOf(readModel([...SHOP, { path: 'apps/app-lost.yaml', text: 'name: Lost\nin: system-nowhere\n' }]).records);
  const address = (id: string) => {
    const record = cat.record(id);
    return record && cat.address(record);
  };
  expect(['system-shop', 'app-web', 'person-customer', 'connection-asks', 'tech-go', 'owner-sales', 'infra-dns'].map(address)).toEqual([
    '/models/system-shop',
    '/models/app-web',
    '/actors/person-customer',
    '/connections/connection-asks',
    '/technologies/tech-go',
    '/owners/owner-sales',
    '/models/infra-dns',
  ]);
  expect(cat.record('system-nowhere')).toBeUndefined();
  expect(cat.nameOf('system-nowhere')).toBe('system-nowhere');
  expect(cat.chain('app-lost')).toEqual([]);
  // A part whose `in` names nothing still has a row, after the rest.
  expect(cat.software.at(-1)).toEqual({ record: cat.record('app-lost'), depth: 0 });
});
