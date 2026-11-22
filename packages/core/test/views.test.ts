import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { Model } from '../src/model.ts';
import type { View, ViewArrow } from '../src/picture.ts';
import { viewsOf } from '../src/views.ts';
import { EXAMPLE } from './example.ts';

/** `viewsOf`: which views a model has, and which boxes, arrows, marks and legend each holds. */

const MARKER = 'format: 1\nname: Views\n';

/** The model of a source directory of these files and a marker. */
function modelOf(files: Readonly<Record<string, string>>): Model {
  return load(Object.entries({ 'seefore.yaml': MARKER, ...files }).map(([path, text]) => ({ path, text }))).model;
}

/** The view with this id among the views of a model of these files. */
function view(files: Readonly<Record<string, string>>, id: string): View {
  const found = viewsOf(modelOf(files)).find((one) => one.id === id);
  if (!found) throw new Error(`no view ${id}`);
  return found;
}

function boxIds(of: View): string[] {
  return of.boxes.map((box) => box.id);
}

/** Each arrow as its id and the connections it stands for. */
function arrows(of: View): Record<string, string[]> {
  return Object.fromEntries(of.arrows.map((arrow) => [arrow.id, arrow.connections]));
}

function arrow(of: View, id: string): ViewArrow {
  const found = of.arrows.find((one) => one.id === id);
  if (!found) throw new Error(`no arrow ${id}`);
  return found;
}

/** A system with two apps, a store and two components, a person who uses it and a system it calls. */
const SHOP: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/shop.yaml': 'name: Shop\n',
  'systems/bank.yaml': 'name: Bank\n',
  'apps/api.yaml': 'name: API\nin: shop\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'stores/orders.yaml': 'name: Orders\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\n',
  'components/status.yaml': 'name: Status\nin: api\n',
};

describe('which views a model has', () => {
  it('gives each system with an app or a store its context view and then its container view, first, and each other system its context view', () => {
    const views = viewsOf(
      modelOf({
        'systems/alpha.yaml': 'name: Alpha\n',
        'systems/mail.yaml': 'name: Mail\n',
        'systems/shop.yaml': 'name: Shop\n',
        'systems/stock.yaml': 'name: Stock\n',
        'apps/web.yaml': 'name: Web\nin: shop\n',
        'stores/items.yaml': 'name: Items\nin: stock\n',
      }),
    );
    expect(views.map((one) => one.id)).toEqual(['shop.context', 'shop.containers', 'stock.context', 'stock.containers', 'alpha.context', 'mail.context']);
    expect(views.map((one) => [one.kind, one.scope, one.title])).toEqual([
      ['context', 'shop', 'Context view: Shop'],
      ['containers', 'shop', 'Container view: Shop'],
      ['context', 'stock', 'Context view: Stock'],
      ['containers', 'stock', 'Container view: Stock'],
      ['context', 'alpha', 'Context view: Alpha'],
      ['context', 'mail', 'Context view: Mail'],
    ]);
  });

  it('gives only context views when no system has a part, and none for a model with no system', () => {
    const views = viewsOf(modelOf({ 'systems/shop.yaml': 'name: Shop\n', 'people/clerk.yaml': 'name: Clerk\n' }));
    expect(views.map((one) => one.id)).toEqual(['shop.context']);
    expect(boxIds(views[0] as View)).toEqual(['shop']);
    expect(views[0]?.arrows).toEqual([]);
    expect(viewsOf(modelOf({ 'people/clerk.yaml': 'name: Clerk\n' }))).toEqual([]);
  });

  it('gives a container view its boundary, and a context view none', () => {
    expect(view(SHOP, 'shop.containers').boundary).toEqual({ id: 'shop', name: 'Shop', title: 'Shop [System]' });
    expect(view(SHOP, 'shop.context')).not.toHaveProperty('boundary');
  });
});

describe('the example shop', () => {
  const views = viewsOf(load(Object.entries(EXAMPLE).map(([path, text]) => ({ path, text }))).model);
  const context = views[0] as View;
  const containers = views[1] as View;

  it('has a context and a container view of the shop, and a context view of the card provider', () => {
    expect(views.map((one) => one.id)).toEqual(['shop.context', 'shop.containers', 'card-provider.context']);
  });

  it('draws the shop as one box in its context view, with each person and system it has a connection with', () => {
    expect(boxIds(context)).toEqual(['card-provider', 'customer', 'shop', 'warehouse-clerk']);
    expect(arrows(context)).toEqual({
      'card-provider~shop': ['card-provider-confirms'],
      'customer~shop': ['customer-shops'],
      'shop~card-provider': ['checkout-takes-payment'],
      'warehouse-clerk~shop': ['clerk-packs'],
    });
    expect(context.boxes.find((box) => box.id === 'shop')?.within).toEqual([
      'checkout-keeps-orders',
      'order-status-reads-orders',
      'shipping-reads-orders',
      'storefront-places-order',
    ]);
  });

  it('draws its apps and its store inside the boundary in its container view, and a component at its app', () => {
    expect(boxIds(containers)).toEqual(['card-provider', 'customer', 'order-api', 'orders-database', 'shipping', 'storefront', 'warehouse-clerk']);
    expect(containers.boxes.filter((box) => box.inside).map((box) => box.id)).toEqual(['order-api', 'orders-database', 'shipping', 'storefront']);
    expect(arrows(containers)).toEqual({
      'card-provider~order-api': ['card-provider-confirms'],
      'customer~storefront': ['customer-shops'],
      'order-api~card-provider': ['checkout-takes-payment'],
      'order-api~orders-database': ['checkout-keeps-orders', 'order-status-reads-orders'],
      'shipping~orders-database': ['shipping-reads-orders'],
      'storefront~order-api': ['storefront-places-order'],
      'warehouse-clerk~shipping': ['clerk-packs'],
    });
    expect(arrow(containers, 'order-api~orders-database')).toEqual({
      id: 'order-api~orders-database',
      from: 'order-api',
      to: 'orders-database',
      connections: ['checkout-keeps-orders', 'order-status-reads-orders'],
      names: ['Writes each order', 'Reads how far an order has got'],
      technology: ['SQL'],
    });
  });

  it('says on each box its name, its kind line and the first sentence of its description', () => {
    const box = (id: string) => containers.boxes.find((one) => one.id === id);
    expect(box('storefront')).toEqual({
      id: 'storefront',
      family: 'apps',
      name: 'Storefront',
      line: '[App: browser · React, TypeScript]',
      sentence: 'Where a customer fills a basket and pays.',
      scope: false,
      inside: true,
      loops: [],
      within: [],
    });
    expect(box('shipping')?.line).toBe('[App: service]');
    expect(box('orders-database')?.line).toBe('[Store: database · PostgreSQL]');
    expect(box('customer')?.line).toBe('[Person]');
    expect(box('card-provider')).toMatchObject({ family: 'systems', line: '[System]', sentence: 'Takes card payments.', inside: false, scope: false });
    expect(context.boxes.find((one) => one.id === 'shop')).toMatchObject({ scope: true, inside: false, line: '[System]' });
  });
});

describe('where an end is drawn', () => {
  it('lifts a component and a part of another system to their system in a context view', () => {
    const files = {
      ...SHOP,
      'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
      'connections/checkout-books.yaml': 'from: checkout\nto: ledger\nname: Books the sale\n',
      'connections/clerk-uses-status.yaml': 'from: clerk\nto: status\nname: Asks how far an order has got\n',
    };
    expect(arrows(view(files, 'shop.context'))).toEqual({ 'clerk~shop': ['clerk-uses-status'], 'shop~bank': ['checkout-books'] });
  });

  it('draws a component at its app, and a part of another system at that system, in a container view', () => {
    const files = {
      ...SHOP,
      'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
      'components/posting.yaml': 'name: Posting\nin: ledger\n',
      'connections/checkout-books.yaml': 'from: checkout\nto: posting\nname: Books the sale\n',
      'connections/web-asks-status.yaml': 'from: web\nto: status\nname: Asks how far an order has got\n',
    };
    const shop = view(files, 'shop.containers');
    expect(boxIds(shop)).toEqual(['api', 'bank', 'orders', 'web']);
    expect(arrows(shop)).toEqual({ 'api~bank': ['checkout-books'], 'web~api': ['web-asks-status'] });
    // Seen from the bank, the shop's component is drawn at the shop.
    expect(arrows(view(files, 'bank.containers'))).toEqual({ 'shop~ledger': ['checkout-books'] });
  });

  it('draws the system in scope at its boundary in a container view, with each that has a connection with it', () => {
    const files = {
      ...SHOP,
      'connections/clerk-uses-shop.yaml': 'from: clerk\nto: shop\nname: Uses the shop\n',
      'connections/shop-pays-bank.yaml': 'from: shop\nto: bank\nname: Pays\n',
      'connections/web-reads-orders.yaml': 'from: web\nto: orders\nname: Reads\n',
    };
    const shop = view(files, 'shop.containers');
    expect(boxIds(shop)).toEqual(['api', 'bank', 'clerk', 'orders', 'web']);
    expect(arrows(shop)).toEqual({ 'clerk~shop': ['clerk-uses-shop'], 'shop~bank': ['shop-pays-bank'], 'web~orders': ['web-reads-orders'] });
    expect(arrow(shop, 'clerk~shop')).toMatchObject({ from: 'clerk', to: 'shop' });
  });

  it('draws an arrow from a part to its own system at the boundary', () => {
    const shop = view({ ...SHOP, 'connections/web-calls-shop.yaml': 'from: web\nto: shop\n' }, 'shop.containers');
    expect(arrows(shop)).toEqual({ 'web~shop': ['web-calls-shop'] });
  });

  it('draws a box for each app and store of the system, also one with no connection', () => {
    expect(boxIds(view(SHOP, 'shop.containers'))).toEqual(['api', 'orders', 'web']);
  });
});

describe('an arrow', () => {
  it('stands for every connection from one box to another, in one direction', () => {
    const files = {
      ...SHOP,
      'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\nname: Places an order\n',
      'connections/web-calls-status.yaml': 'from: web\nto: status\nname: Asks how far it has got\n',
      'connections/checkout-calls-web.yaml': 'from: checkout\nto: web\nname: Calls back\n',
    };
    expect(arrows(view(files, 'shop.containers'))).toEqual({
      'api~web': ['checkout-calls-web'],
      'web~api': ['web-calls-checkout', 'web-calls-status'],
    });
  });

  it('lists first the connections between the two drawn records themselves, then the others, each in order of id', () => {
    const files = {
      ...SHOP,
      'connections/a-clerk-uses-web.yaml': 'from: clerk\nto: web\nname: Uses the site\n',
      'connections/b-clerk-uses-checkout.yaml': 'from: clerk\nto: checkout\nname: Checks out\n',
      'connections/y-clerk-uses-shop.yaml': 'from: clerk\nto: shop\nname: Uses the shop\n',
      'connections/z-clerk-calls-shop.yaml': 'from: clerk\nto: shop\n',
    };
    const shop = arrow(view(files, 'shop.context'), 'clerk~shop');
    expect(shop.connections).toEqual(['y-clerk-uses-shop', 'z-clerk-calls-shop', 'a-clerk-uses-web', 'b-clerk-uses-checkout']);
    expect(shop.names).toEqual(['Uses the shop', 'Unnamed connection', 'Uses the site', 'Checks out']);
  });

  it('says a technology only when every connection it stands for names the same ones, by name in order of id', () => {
    const technologies = {
      'technologies/https.yaml': 'name: HTTPS\n',
      'technologies/grpc.yaml': 'name: gRPC\n',
      'technologies/json.yaml': 'name: JSON\n',
    };
    const between = (first: string, second: string) =>
      arrow(
        view(
          {
            ...SHOP,
            ...technologies,
            'connections/web-calls-checkout.yaml': `from: web\nto: checkout\n${first}`,
            'connections/web-calls-status.yaml': `from: web\nto: status\n${second}`,
          },
          'shop.containers',
        ),
        'web~api',
      ).technology;
    expect(between('technology: [https, json]\n', 'technology: [json, https]\n')).toEqual(['HTTPS', 'JSON']);
    expect(between('technology: [https, grpc]\n', 'technology: [https]\n')).toEqual([]);
    expect(between('technology: [https]\n', '')).toEqual([]);
    expect(between('', '')).toEqual([]);
    expect(between('technology: [json, grpc, https]\n', 'technology: [grpc, https, json]\n')).toEqual(['gRPC', 'HTTPS', 'JSON']);
  });

  it('names a technology whose file has an error by its id', () => {
    const files = {
      ...SHOP,
      'technologies/https.yaml': 'name: [HTTPS\n',
      'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\ntechnology: [https]\n',
    };
    expect(arrow(view(files, 'shop.containers'), 'web~api').technology).toEqual(['https']);
  });
});

describe('what is not drawn as an arrow', () => {
  it('leaves out a connection between two boxes that both stand outside, and says which', () => {
    const files = {
      ...SHOP,
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
      'connections/web-calls-bank.yaml': 'from: web\nto: bank\n',
      'connections/clerk-calls-bank.yaml': 'from: clerk\nto: bank\n',
    };
    for (const id of ['shop.context', 'shop.containers']) {
      const shop = view(files, id);
      expect(boxIds(shop)).toContain('bank');
      expect(Object.values(arrows(shop)).flat()).not.toContain('clerk-calls-bank');
      expect(shop.left).toEqual({ outside: ['clerk-calls-bank'], broken: [] });
    }
    // A connection with an end that is not in the view is not the view's at all.
    expect(view({ ...SHOP, 'connections/clerk-calls-bank.yaml': 'from: clerk\nto: bank\n' }, 'shop.context').left.outside).toEqual([]);
  });

  it('marks a record that acts on itself on its box, by the ids of those connections', () => {
    const files = {
      ...SHOP,
      'connections/api-wakes-api.yaml': 'from: api\nto: api\nname: Wakes another copy\n',
      'connections/checkout-asks-checkout.yaml': 'from: checkout\nto: checkout\nname: Asks another copy\n',
      'connections/clerk-asks-clerk.yaml': 'from: clerk\nto: clerk\nname: Asks a colleague\n',
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
      'connections/shop-calls-shop.yaml': 'from: shop\nto: shop\n',
    };
    const containers = view(files, 'shop.containers');
    expect(containers.boxes.find((box) => box.id === 'api')?.loops).toEqual(['api-wakes-api', 'checkout-asks-checkout']);
    expect(containers.boxes.find((box) => box.id === 'clerk')?.loops).toEqual(['clerk-asks-clerk']);
    expect(containers.arrows.map((one) => one.id)).toEqual(['clerk~web']);
    const context = view(files, 'shop.context');
    expect(context.boxes.find((box) => box.id === 'shop')?.loops).toEqual(['api-wakes-api', 'checkout-asks-checkout', 'shop-calls-shop']);
    expect(context.boxes.find((box) => box.id === 'shop')?.within).toEqual([]);
    // The system to itself is at its own boundary in its container view: its context view marks it.
    expect(JSON.stringify(containers)).not.toContain('shop-calls-shop');
  });

  it('lists on a box each connection between two parts drawn as that box', () => {
    const files = {
      ...SHOP,
      'connections/checkout-asks-status.yaml': 'from: checkout\nto: status\n',
      'connections/api-runs-checkout.yaml': 'from: api\nto: checkout\n',
      'connections/web-reads-orders.yaml': 'from: web\nto: orders\n',
      'connections/web-calls-shop.yaml': 'from: web\nto: shop\n',
    };
    const containers = view(files, 'shop.containers');
    expect(containers.boxes.find((box) => box.id === 'api')?.within).toEqual(['api-runs-checkout', 'checkout-asks-status']);
    expect(containers.boxes.find((box) => box.id === 'web')?.within).toEqual([]);
    expect(view(files, 'shop.context').boxes.find((box) => box.id === 'shop')?.within).toEqual([
      'api-runs-checkout',
      'checkout-asks-status',
      'web-calls-shop',
      'web-reads-orders',
    ]);
    expect(view(files, 'shop.context').arrows).toEqual([]);
  });
});

describe('a box that stands outside the system in scope', () => {
  const files = {
    'systems/shop.yaml': 'name: Shop\n',
    'apps/web.yaml': 'name: Web\nin: shop\n',
    'systems/bank.yaml': 'name: Bank\n',
    'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
    'apps/vault.yaml': 'name: Vault\nin: bank\n',
    'connections/web-pays.yaml': 'from: web\nto: ledger\nname: Pays\n',
    'connections/ledger-locks.yaml': 'from: ledger\nto: vault\nname: Locks\n',
    'connections/ledger-syncs.yaml': 'from: ledger\nto: ledger\nname: Syncs\n',
    'connections/bank-mirrors.yaml': 'from: bank\nto: bank\nname: Mirrors\n',
  };

  it('does not carry what goes on inside it, only what names the box itself', () => {
    const bank = view(files, 'shop.containers').boxes.find((box) => box.id === 'bank');
    expect(bank?.within).toEqual([]);
    expect(bank?.loops).toEqual(['bank-mirrors']);
  });

  it('carries all of it in the views where it is the system in scope', () => {
    const bank = view(files, 'bank.context').boxes.find((box) => box.id === 'bank');
    expect(bank?.within).toEqual(['ledger-locks']);
    expect(bank?.loops).toEqual(['bank-mirrors', 'ledger-syncs']);
  });
});

describe('a record with an error', () => {
  it('is not drawn, nor anything in it, and a connection between it and the view is counted on the view', () => {
    const files = {
      ...SHOP,
      'systems/bank.yaml': 'name: [Bank\n',
      'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
      'connections/web-books.yaml': 'from: web\nto: ledger\nname: Books the sale\n',
      'connections/bank-calls-api.yaml': 'from: bank\nto: api\n',
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
    };
    const views = viewsOf(modelOf(files));
    expect(views.map((one) => one.id)).toEqual(['shop.context', 'shop.containers']);
    for (const shop of views) {
      expect(boxIds(shop)).not.toContain('bank');
      expect(boxIds(shop)).not.toContain('ledger');
      expect(shop.left).toEqual({ outside: [], broken: ['bank-calls-api', 'web-books'] });
    }
  });

  it('leaves a component out when the app it is in has an error, and counts its connections where the other end is drawn', () => {
    const files = {
      ...SHOP,
      'apps/api.yaml': 'name: API\nin: shop\ncolour: blue\n',
      'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\n',
      'connections/status-reads-orders.yaml': 'from: status\nto: orders\n',
      'connections/checkout-asks-status.yaml': 'from: checkout\nto: status\n',
    };
    const containers = view(files, 'shop.containers');
    expect(boxIds(containers)).toEqual(['orders', 'web']);
    expect(containers.arrows).toEqual([]);
    expect(containers.left.broken).toEqual(['status-reads-orders', 'web-calls-checkout']);
    expect(view(files, 'shop.context').left.broken).toEqual(['status-reads-orders', 'web-calls-checkout']);
  });

  it('does not count a connection with an error at one end and the other not in the system, drawn or not', () => {
    const files = {
      ...SHOP,
      'systems/bank.yaml': 'name: Bank\ncolour: blue\n',
      'systems/post.yaml': 'name: Post\n',
      'connections/clerk-calls-bank.yaml': 'from: clerk\nto: bank\n',
      'connections/post-calls-bank.yaml': 'from: post\nto: bank\n',
    };
    expect(view(files, 'shop.context').left.broken).toEqual([]);
    // The clerk and the post office are drawn, and what they do with the bank is not this view's.
    const drawn = { ...files, 'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n', 'connections/web-calls-post.yaml': 'from: web\nto: post\n' };
    for (const id of ['shop.context', 'shop.containers']) {
      expect(boxIds(view(drawn, id))).toEqual(expect.arrayContaining(['clerk', 'post']));
      expect(view(drawn, id).left.broken).toEqual([]);
    }
    expect(view(drawn, 'post.context').left.broken).toEqual(['post-calls-bank']);
  });
});

describe('the legend', () => {
  it('lists each kind of box, line and mark the view draws, and no other, in a fixed order', () => {
    const files = {
      ...SHOP,
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
      'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\n',
      'connections/web-calls-status.yaml': 'from: web\nto: status\n',
    };
    expect(view(files, 'shop.containers').legend.map((entry) => entry.key)).toEqual(['person', 'app', 'store', 'boundary', 'arrow', 'arrow-many']);
    expect(view(files, 'shop.context').legend.map((entry) => entry.key)).toEqual(['person', 'system-scope', 'arrow']);
    expect(view(SHOP, 'bank.context').legend.map((entry) => entry.key)).toEqual(['system-scope']);
    const marked = { ...SHOP, 'connections/web-reads-orders.yaml': 'from: web\nto: orders\n', 'connections/bank-to-bank.yaml': 'from: bank\nto: bank\n' };
    expect(view(marked, 'bank.context').legend.map((entry) => entry.key)).toEqual(['system-scope', 'loop']);
    expect(view({ ...marked, 'connections/web-calls-bank.yaml': 'from: web\nto: bank\n' }, 'shop.containers').legend.map((entry) => entry.key)).toEqual([
      'system',
      'app',
      'store',
      'boundary',
      'arrow',
      'loop',
    ]);
  });

  it('says in a few plain words what each means', () => {
    const files = {
      ...SHOP,
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
      'connections/web-calls-bank.yaml': 'from: web\nto: bank\n',
      'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\n',
      'connections/web-calls-status.yaml': 'from: web\nto: status\n',
      'connections/bank-to-bank.yaml': 'from: bank\nto: bank\n',
    };
    expect([...view(files, 'shop.containers').legend, ...view(files, 'shop.context').legend.filter((entry) => entry.key === 'system-scope')]).toEqual([
      { key: 'person', text: 'Person: a role that uses the software, runs it or takes part' },
      { key: 'system', text: "Other system: software seen as one thing, ours or somebody else's" },
      { key: 'app', text: 'App: something that runs code' },
      { key: 'store', text: 'Store: something that holds data' },
      { key: 'boundary', text: 'Boundary: this system, with its apps and stores inside' },
      { key: 'arrow', text: 'Arrow: from the one that acts to the one it acts on' },
      { key: 'arrow-many', text: 'Arrow for several connections: each line of its label names one' },
      { key: 'loop', text: 'Copies: connections from one copy of the same thing to another' },
      { key: 'system-scope', text: 'This system: what the view is about' },
    ]);
  });

  it('says what an arrow at the boundary means when the view draws one', () => {
    const files = { ...SHOP, 'connections/clerk-uses-shop.yaml': 'from: clerk\nto: shop\n' };
    expect(view(files, 'shop.containers').legend.find((entry) => entry.key === 'boundary')?.text).toBe(
      'Boundary: this system, with its apps and stores inside; an arrow at its edge is to or from the system itself',
    );
  });
});

describe('a box', () => {
  it('says the kind and the technologies of an app or a store by name, in order of id, leaving out what is not known', () => {
    const files = {
      'systems/shop.yaml': 'name: Shop\n',
      'apps/full.yaml': 'name: Full\nin: shop\nkind: service\ntechnology: [postgresql, go]\n',
      'apps/kind.yaml': 'name: Kind\nin: shop\nkind: job\n',
      'apps/tech.yaml': 'name: Tech\nin: shop\ntechnology: [go]\n',
      'apps/bare.yaml': 'name: Bare\nin: shop\n',
      'stores/rows.yaml': 'name: Rows\nin: shop\nkind: database\ntechnology: [postgresql]\n',
      'stores/queue.yaml': 'name: Queue\nin: shop\n',
      'stores/blobs.yaml': 'name: Blobs\nin: shop\ntechnology: [s3]\n',
      'technologies/go.yaml': 'name: Go\n',
      'technologies/postgresql.yaml': 'name: PostgreSQL\n',
      'technologies/s3.yaml': 'name: [S3\n',
    };
    expect(Object.fromEntries(view(files, 'shop.containers').boxes.map((box) => [box.id, box.line]))).toEqual({
      bare: '[App]',
      blobs: '[Store · s3]',
      full: '[App: service · Go, PostgreSQL]',
      kind: '[App: job]',
      queue: '[Store]',
      rows: '[Store: database · PostgreSQL]',
      tech: '[App · Go]',
    });
  });

  it('holds the first sentence of its description whole, and none when it has no description', () => {
    const files = {
      'systems/shop.yaml': 'name: Shop\ndescription: >-\n  Sells goods, e.g. books, and ships them.\n  Runs day and night.\n',
      'people/clerk.yaml': 'name: Clerk\n',
      'connections/clerk-uses-shop.yaml': 'from: clerk\nto: shop\n',
    };
    const shop = view(files, 'shop.context');
    expect(shop.boxes.find((box) => box.id === 'shop')?.sentence).toBe('Sells goods, e.g. books, and ships them.');
    expect(shop.boxes.find((box) => box.id === 'clerk')).not.toHaveProperty('sentence');
  });

  it('comes in order of id, and so does an arrow', () => {
    const files = {
      'systems/m.yaml': 'name: M\n',
      'people/z.yaml': 'name: Z\n',
      'people/a.yaml': 'name: A\n',
      'systems/b.yaml': 'name: B\n',
      'connections/a-z-uses-m.yaml': 'from: z\nto: m\n',
      'connections/b-m-calls-b.yaml': 'from: m\nto: b\n',
      'connections/c-a-uses-m.yaml': 'from: a\nto: m\n',
    };
    const m = view(files, 'm.context');
    expect(boxIds(m)).toEqual(['a', 'b', 'm', 'z']);
    expect(m.arrows.map((one) => one.id)).toEqual(['a~m', 'm~b', 'z~m']);
  });
});
