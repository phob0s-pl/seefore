import { describe, expect, it } from 'vitest';
import { conditionsOf, keeperOf, systemOf } from '../src/conditions.ts';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import type { Model } from '../src/model.ts';

/**
 * A shop in which most things are there only sometimes: the shop in its hosted edition, the
 * order API where payments are on, its checkout for signed-in customers, a cache the API keeps,
 * and an ingress that is part of the shop. The card provider, a customer, the proxy and the
 * search index say nothing of when they are there.
 */
const SHOP: Record<string, string> = {
  'seefore.yaml': 'format: 1\nname: Shop\n',
  'people/customer.yaml': 'name: Customer\n',
  'people/auditor.yaml': 'name: Auditor\nonly: where the law asks for one\n',
  'systems/shop.yaml': 'name: Shop\nonly: in the hosted edition\n',
  'systems/card-provider.yaml': 'name: Card provider\n',
  'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: when payments are on\n',
  'apps/storefront.yaml': 'name: Storefront\nin: shop\n',
  'apps/terminal.yaml': 'name: Terminal\nin: card-provider\nonly: in shops with a till\n',
  'stores/cache.yaml': 'name: Cache\nin: order-api\nonly: with a cache configured\n',
  'stores/search-index.yaml': 'name: Search index\nin: order-api\n',
  'stores/orders-database.yaml': 'name: Orders database\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: order-api\nonly: for customers who sign in\n',
  'components/basket.yaml': 'name: Basket\nin: storefront\n',
  'infrastructure/ingress.yaml': 'name: Ingress\nin: shop\nonly: on Kubernetes\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\nonly: behind a firewall\n',
  'infrastructure/relay.yaml': 'name: Relay\n',
  'connections/checkout-pays.yaml': 'from: checkout\nto: terminal\nname: Takes the payment\nonly: for card payments\n',
  'connections/basket-checks-out.yaml': 'from: basket\nto: checkout\nvia: [ingress, proxy]\nname: Checks out\n',
  'connections/checkout-caches.yaml': 'from: checkout\nto: cache\nname: Keeps each order\n',
  'connections/customer-shops.yaml': 'from: customer\nto: storefront\nname: Shops\n',
  'connections/api-copies.yaml': 'from: order-api\nto: order-api\nname: Shares the load\n',
  'connections/relay-calls.yaml': 'from: relay\nto: proxy\nname: Checks that it is up\n',
};

/** The shop, with files added or replaced, and a text of `null` to take a file away. */
function shop(changes: Record<string, string | null> = {}): SourceFile[] {
  return Object.entries({ ...SHOP, ...changes })
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([path, text]) => ({ path, text }));
}

function modelOf(changes: Record<string, string | null> = {}): Model {
  const loaded = load(shop(changes));
  // Only a broken file of a test's own making may leave a problem.
  expect(loaded.problems.filter((problem) => !Object.keys(changes).includes(problem.file))).toEqual([]);
  return loaded.model;
}

/** Each condition as `from: only`. */
function said(model: Model, id: string): string[] {
  return conditionsOf(model, id).map((condition) => `${condition.from}: ${condition.only}`);
}

describe('the conditions a record is under', () => {
  const model = modelOf();

  it('are its own, with the record they come from, for a thing that is in nothing', () => {
    expect(conditionsOf(model, 'shop')).toEqual([{ only: 'in the hosted edition', from: 'shop' }]);
    expect(said(model, 'auditor')).toEqual(['auditor: where the law asks for one']);
    expect(said(model, 'proxy')).toEqual(['proxy: behind a firewall']);
  });

  it('are none for a thing that has none and is in nothing', () => {
    expect(conditionsOf(model, 'customer')).toEqual([]);
    expect(conditionsOf(model, 'card-provider')).toEqual([]);
    expect(conditionsOf(model, 'relay')).toEqual([]);
  });

  it('of a part are its own first, then those of every thing it is in, nearest first', () => {
    expect(said(model, 'checkout')).toEqual([
      'checkout: for customers who sign in',
      'order-api: when payments are on',
      'shop: in the hosted edition',
    ]);
    expect(said(model, 'storefront')).toEqual(['shop: in the hosted edition']);
    expect(said(model, 'basket')).toEqual(['shop: in the hosted edition']);
  });

  it('of a store that an app keeps come through the app to its system', () => {
    expect(said(model, 'cache')).toEqual(['cache: with a cache configured', 'order-api: when payments are on', 'shop: in the hosted edition']);
    expect(said(model, 'search-index')).toEqual(['order-api: when payments are on', 'shop: in the hosted edition']);
    expect(said(model, 'orders-database')).toEqual(['shop: in the hosted edition']);
  });

  it("of a piece of infrastructure in a system are its own and the system's", () => {
    expect(said(model, 'ingress')).toEqual(['ingress: on Kubernetes', 'shop: in the hosted edition']);
  });

  it('of a connection are its own, then those of its `from` and what that is in, then those of its `to` and what that is in', () => {
    expect(said(model, 'checkout-pays')).toEqual([
      'checkout-pays: for card payments',
      'checkout: for customers who sign in',
      'order-api: when payments are on',
      'shop: in the hosted edition',
      'terminal: in shops with a till',
    ]);
  });

  it('of a connection name a record that both ends are in once, where it first comes', () => {
    expect(said(model, 'checkout-caches')).toEqual([
      'checkout: for customers who sign in',
      'order-api: when payments are on',
      'shop: in the hosted edition',
      'cache: with a cache configured',
    ]);
    expect(said(model, 'api-copies')).toEqual(['order-api: when payments are on', 'shop: in the hosted edition']);
  });

  it('of a connection take nothing from what it passes through', () => {
    expect(said(model, 'basket-checks-out')).toEqual([
      'shop: in the hosted edition',
      'checkout: for customers who sign in',
      'order-api: when payments are on',
    ]);
  });

  it('of a connection between things in no system are those of its ends', () => {
    expect(said(model, 'relay-calls')).toEqual(['proxy: behind a firewall']);
    expect(said(model, 'customer-shops')).toEqual(['shop: in the hosted edition']);
  });

  it('are none for an owner, a technology, and an id the model has no record of', () => {
    const owned = modelOf({ 'owners/shop-team.yaml': 'name: Shop team\n', 'technologies/go.yaml': 'name: Go\n' });
    expect(conditionsOf(owned, 'shop-team')).toEqual([]);
    expect(conditionsOf(owned, 'go')).toEqual([]);
    expect(conditionsOf(owned, 'nothing')).toEqual([]);
  });

  it('stop at a record with an error in its file, whose condition and place are not known', () => {
    const broken = modelOf({ 'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: [when payments are on]\n' });
    expect(broken.apps.map((app) => app.id)).toEqual(['storefront', 'terminal']);
    expect(said(broken, 'checkout')).toEqual(['checkout: for customers who sign in']);
    expect(said(broken, 'checkout-pays')).toEqual(['checkout-pays: for card payments', 'checkout: for customers who sign in', 'terminal: in shops with a till']);
  });

  it('are those the records say now, also of a model that gains a record after it was first asked of', () => {
    const grown = modelOf();
    expect(said(grown, 'storefront')).toEqual(['shop: in the hosted edition']);
    grown.components.push({ id: 'search', file: 'components/search.yaml', name: 'Search', in: 'storefront', only: 'with search on' });
    expect(said(grown, 'search')).toEqual(['search: with search on', 'shop: in the hosted edition']);
  });

  it('are those of a record put in the place of another, in a model that keeps as many records as it had', () => {
    const changed = modelOf();
    expect(said(changed, 'cache')).toEqual(['cache: with a cache configured', 'order-api: when payments are on', 'shop: in the hosted edition']);
    expect(keeperOf(changed, 'cache')).toBe('order-api');
    expect(systemOf(changed, 'cache')).toBe('shop');
    // Asked, then one record replaced by another with the same id, then asked again.
    const at = changed.stores.findIndex((store) => store.id === 'cache');
    changed.stores[at] = { id: 'cache', file: 'stores/cache.yaml', name: 'Cache', in: 'card-provider', only: 'with a cache configured' };
    expect(said(changed, 'cache')).toEqual(['cache: with a cache configured']);
    expect(keeperOf(changed, 'cache')).toBeUndefined();
    expect(systemOf(changed, 'cache')).toBe('card-provider');
    // And one record in the place of another with another id.
    changed.stores[at] = { id: 'cache-two', file: 'stores/cache-two.yaml', name: 'Cache', in: 'storefront' };
    expect(said(changed, 'cache')).toEqual([]);
    expect(said(changed, 'cache-two')).toEqual(['shop: in the hosted edition']);
    expect(keeperOf(changed, 'cache-two')).toBe('storefront');
  });
});

describe('the app that keeps a store', () => {
  const model = modelOf();

  it('is the app its `in` names', () => {
    expect(keeperOf(model, 'cache')).toBe('order-api');
    expect(keeperOf(model, 'search-index')).toBe('order-api');
  });

  it('is none for a store in a system, and for a record that is no store', () => {
    expect(keeperOf(model, 'orders-database')).toBeUndefined();
    expect(keeperOf(model, 'order-api')).toBeUndefined();
    expect(keeperOf(model, 'checkout')).toBeUndefined();
    expect(keeperOf(model, 'ingress')).toBeUndefined();
    expect(keeperOf(model, 'nothing')).toBeUndefined();
  });

  it('is not known for a store whose `in` names a record with an error in its file', () => {
    const broken = modelOf({ 'apps/order-api.yaml': 'name: [Order API\n' });
    expect(broken.stores.map((store) => store.id)).toContain('cache');
    expect(keeperOf(broken, 'cache')).toBeUndefined();
  });
});

describe('the system a thing is in', () => {
  const model = modelOf();

  it('is the system for an app and a store in it, and through its app for a component', () => {
    expect(systemOf(model, 'order-api')).toBe('shop');
    expect(systemOf(model, 'orders-database')).toBe('shop');
    expect(systemOf(model, 'checkout')).toBe('shop');
    expect(systemOf(model, 'terminal')).toBe('card-provider');
  });

  it('is the system of the app for a store that the app keeps', () => {
    expect(systemOf(model, 'cache')).toBe('shop');
  });

  it('is the system a piece of infrastructure names, and none for one that names none', () => {
    expect(systemOf(model, 'ingress')).toBe('shop');
    expect(systemOf(model, 'proxy')).toBeUndefined();
  });

  it('is its own for a system', () => {
    expect(systemOf(model, 'shop')).toBe('shop');
    expect(systemOf(model, 'card-provider')).toBe('card-provider');
  });

  it('is none for a person, a connection, and an id the model has no record of', () => {
    expect(systemOf(model, 'customer')).toBeUndefined();
    expect(systemOf(model, 'checkout-pays')).toBeUndefined();
    expect(systemOf(model, 'nothing')).toBeUndefined();
  });

  it('is not known when the way up passes a record with an error in its file', () => {
    const broken = modelOf({ 'apps/order-api.yaml': 'name: [Order API\n' });
    expect(systemOf(broken, 'checkout')).toBeUndefined();
    expect(systemOf(broken, 'cache')).toBeUndefined();
    expect(systemOf(broken, 'storefront')).toBe('shop');
  });
});

describe('an id that is also the name of what every object has', () => {
  it('is an id like any other: `constructor` and `tostring` find only what the model holds', () => {
    const model = modelOf({
      'people/constructor.yaml': 'name: Constructor\n',
      'systems/tostring.yaml': 'name: To string\n',
      'apps/valueof.yaml': 'name: Value of\nin: tostring\nonly: when asked\n',
      'connections/constructor-asks.yaml': 'from: constructor\nto: valueof\nname: Asks\n',
    });
    expect(conditionsOf(model, 'constructor')).toEqual([]);
    expect(keeperOf(model, 'constructor')).toBeUndefined();
    expect(systemOf(model, 'constructor')).toBeUndefined();
    expect(systemOf(model, 'tostring')).toBe('tostring');
    expect(said(model, 'constructor-asks')).toEqual(['valueof: when asked']);
  });
});
