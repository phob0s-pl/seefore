import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { Model } from '../src/model.ts';
import type { View, ViewArrow } from '../src/picture.ts';
import { connectionsInNoView, viewsOf } from '../src/views.ts';
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
    expect(view(SHOP, 'shop.containers').boundary).toEqual({ id: 'shop', name: 'Shop', line: '[System]', title: 'Shop [System]' });
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
      look: 'app',
      name: 'Storefront',
      line: '[App: browser · React, TypeScript]',
      sentence: 'Where a customer fills a basket and pays.',
      scope: false,
      inside: true,
      loops: [],
      within: [],
      passing: [],
      kept: [],
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

/**
 * A help desk behind a proxy, with a gateway app, a queue and a topic, a card provider that is
 * somebody else's, and on the way to it a load balancer and an edge network that nothing
 * starts or ends at. The proxy checks the API on its own account, so it has a box.
 */
const DESK: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/desk.yaml': 'name: Desk\n',
  'systems/cards.yaml': 'name: Card provider\ndescription: Takes card payments.\nexternal: true\n',
  'systems/edge.yaml': 'name: Edge network\nexternal: true\n',
  'apps/web.yaml': 'name: Web\nin: desk\n',
  'apps/api.yaml': 'name: API\nin: desk\n',
  'apps/gateway.yaml': 'name: Gateway\nin: desk\n',
  'components/router.yaml': 'name: Router\nin: gateway\n',
  'stores/jobs.yaml': 'name: Jobs\nin: desk\nkind: queue\ntechnology: [redis]\n',
  'stores/events.yaml': 'name: Events\nin: desk\nkind: topic\ntechnology: [kafka]\n',
  'stores/tickets.yaml': 'name: Tickets\nin: desk\nkind: database\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\ndescription: Ends HTTPS.\ntechnology: [nginx]\n',
  'infrastructure/balancer.yaml': 'name: Load balancer\n',
  'technologies/nginx.yaml': 'name: nginx\n',
  'technologies/redis.yaml': 'name: Redis\n',
  'technologies/kafka.yaml': 'name: Kafka\n',
  'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\nvia: [proxy]\nname: Asks for pages\n',
  'connections/proxy-checks-api.yaml': 'from: proxy\nto: api\nname: Checks that it answers\n',
  'connections/web-asks-api.yaml': 'from: web\nto: api\nvia: [router]\nname: Asks for tickets\n',
  'connections/web-calls-api.yaml': 'from: web\nto: api\nvia: [gateway]\nname: Sends edits\n',
  'connections/web-pings-api.yaml': 'from: web\nto: api\nname: Checks it is up\n',
  'connections/api-pays-cards.yaml': 'from: api\nto: cards\nvia: [balancer, edge]\nname: Takes a payment\n',
  'connections/api-queues-jobs.yaml': 'from: api\nto: jobs\nname: Queues a job\n',
  'connections/api-publishes-events.yaml': 'from: api\nto: events\nname: Says what changed\n',
  'connections/api-keeps-tickets.yaml': 'from: api\nto: tickets\nname: Keeps tickets\n',
};

/** The boxes of a view that connections pass through, each with those connections. */
function passingOn(of: View): Record<string, string[]> {
  return Object.fromEntries(of.boxes.filter((box) => box.passing.length > 0).map((box) => [box.id, box.passing]));
}

describe('how a box looks', () => {
  it('names its look by what it stands for, with the names of the legend', () => {
    const looks = (id: string) => Object.fromEntries(view(DESK, id).boxes.map((box) => [box.id, box.look]));
    expect(looks('desk.containers')).toEqual({
      api: 'app',
      cards: 'system-external',
      clerk: 'person',
      events: 'queue-or-topic',
      gateway: 'app',
      jobs: 'queue-or-topic',
      proxy: 'infrastructure',
      tickets: 'store',
      web: 'app',
    });
    expect(looks('desk.context')).toEqual({ cards: 'system-external', clerk: 'person', desk: 'system-scope', proxy: 'infrastructure' });
    // An external system looks external also in the view about it, with the thicker line of the system in scope.
    expect(view(DESK, 'cards.context').boxes.map((box) => [box.id, box.look, box.scope])).toEqual([
      ['cards', 'system-external', true],
      ['desk', 'system', false],
    ]);
  });

  it('says in its kind line a queue or a topic, an external system and a piece of infrastructure', () => {
    const lines = Object.fromEntries(view(DESK, 'desk.containers').boxes.map((box) => [box.id, box.line]));
    expect(lines).toMatchObject({
      cards: '[System: external]',
      events: '[Store: topic · Kafka]',
      jobs: '[Store: queue · Redis]',
      proxy: '[Infrastructure · nginx]',
      tickets: '[Store: database]',
    });
    const bare = view({ ...DESK, 'infrastructure/proxy.yaml': 'name: HTTPS proxy\n' }, 'desk.containers');
    expect(bare.boxes.find((box) => box.id === 'proxy')?.line).toBe('[Infrastructure]');
    expect(view(DESK, 'desk.context').boxes.find((box) => box.id === 'desk')?.line).toBe('[System]');
  });

  it('says on the boundary of an external system that it is external', () => {
    const files = { ...DESK, 'apps/terminal.yaml': 'name: Terminal\nin: cards\n' };
    expect(view(files, 'cards.containers').boundary?.title).toBe('Card provider [System: external]');
    expect(view(files, 'desk.containers').boundary?.title).toBe('Desk [System]');
  });
});

describe('a piece of infrastructure', () => {
  it('has a box where a connection of the view starts or ends at it, outside the boundary, in both views', () => {
    const containers = view(DESK, 'desk.containers');
    expect(containers.boxes.find((box) => box.id === 'proxy')).toMatchObject({ family: 'infrastructure', name: 'HTTPS proxy', sentence: 'Ends HTTPS.', inside: false, scope: false });
    expect(arrows(containers)['proxy~api']).toEqual(['proxy-checks-api']);
    expect(arrows(view(DESK, 'desk.context'))['proxy~desk']).toEqual(['proxy-checks-api']);
  });

  it('has no box where it is only passed through', () => {
    for (const id of ['desk.context', 'desk.containers', 'cards.context']) expect(boxIds(view(DESK, id))).not.toContain('balancer');
    // Nor where what starts or ends at it is not the view's.
    expect(boxIds(view(DESK, 'cards.context'))).not.toContain('proxy');
  });

  it('leaves out a connection between it and another box outside, as for a person', () => {
    const files = { ...DESK, 'connections/proxy-tells-clerk.yaml': 'from: proxy\nto: clerk\n' };
    expect(view(files, 'desk.containers').left.outside).toEqual(['proxy-tells-clerk']);
  });
});

describe('the route of an arrow', () => {
  it('names what its connections pass through, in order, when every one names the same', () => {
    const containers = view(DESK, 'desk.containers');
    expect(arrow(containers, 'clerk~web').route).toEqual({ count: 1, hops: [{ name: 'HTTPS proxy', bracketed: false }], bracketed: false, line: 'via HTTPS proxy' });
    expect(arrow(containers, 'api~cards').route).toEqual({
      count: 1,
      hops: [
        { name: 'Load balancer', bracketed: false },
        { name: 'Edge network', bracketed: false },
      ],
      bracketed: false,
      line: 'via Load balancer, Edge network',
    });
  });

  it('says on how many of its connections they pass through something when only some have a route, or the routes differ', () => {
    expect(arrow(view(DESK, 'desk.containers'), 'web~api').route).toEqual({ count: 2, hops: [], bracketed: false, line: 'via on 2 of 3' });
    // The same things in another order are another route.
    const files = {
      ...DESK,
      'connections/web-asks-api.yaml': 'from: web\nto: api\nvia: [gateway, router]\n',
      'connections/web-calls-api.yaml': 'from: web\nto: api\nvia: [router, gateway]\n',
      'connections/web-pings-api.yaml': 'from: web\nto: api\nvia: [gateway, router]\n',
    };
    expect(arrow(view(files, 'desk.containers'), 'web~api').route).toEqual({ count: 3, hops: [], bracketed: false, line: 'via on 3 of 3' });
  });

  it('is missing when no connection of the arrow passes through anything', () => {
    expect(arrow(view(DESK, 'desk.containers'), 'proxy~api')).not.toHaveProperty('route');
  });

  it('names what has an error in its file by its id', () => {
    const files = { ...DESK, 'infrastructure/balancer.yaml': 'name: [Load balancer\n' };
    expect(arrow(view(files, 'desk.containers'), 'api~cards').route?.line).toBe('via balancer, Edge network');
  });
});

describe('a box that connections pass through', () => {
  it('holds the connections of the view that name it, or anything drawn as it, in `via`', () => {
    // The router is drawn at its app, the gateway.
    expect(passingOn(view(DESK, 'desk.containers'))).toEqual({ gateway: ['web-asks-api', 'web-calls-api'], proxy: ['clerk-uses-web'] });
    // In the context view the connections through the gateway are inside the desk, and not drawn.
    expect(passingOn(view(DESK, 'desk.context'))).toEqual({ proxy: ['clerk-uses-web'] });
  });

  it('draws an app passed through at its system in a context view, but not on an end of the connection’s own arrow', () => {
    const files = {
      ...DESK,
      'apps/terminal.yaml': 'name: Terminal\nin: cards\n',
      'apps/ledger.yaml': 'name: Ledger\nin: cards\n',
      // To the ledger, not to the card provider itself: `via` may not name what is in an end.
      'connections/api-pays-cards.yaml': 'from: api\nto: ledger\nvia: [terminal]\n',
      'connections/clerk-pays-desk.yaml': 'from: clerk\nto: desk\nvia: [terminal]\n',
    };
    const context = view(files, 'desk.context');
    // The payment ends in the card provider, which the terminal is in too: what it passes through there does not show at this level.
    expect(passingOn(context)).toEqual({ cards: ['clerk-pays-desk'], proxy: ['clerk-uses-web'] });
    expect(context.passed).toEqual([]);
  });

  it('counts a connection once, though it names two things drawn as the box', () => {
    const files = { ...DESK, 'connections/web-asks-api.yaml': 'from: web\nto: api\nvia: [gateway, router]\n' };
    expect(passingOn(view(files, 'desk.containers')).gateway).toEqual(['web-asks-api', 'web-calls-api']);
  });

  it('does not hold a connection that the view does not draw as an arrow', () => {
    const files = { ...DESK, 'connections/clerk-asks-cards.yaml': 'from: clerk\nto: cards\nvia: [proxy]\n' };
    const containers = view(files, 'desk.containers');
    expect(containers.left.outside).toEqual(['clerk-asks-cards']);
    expect(passingOn(containers).proxy).toEqual(['clerk-uses-web']);
  });
});

describe('what is passed through and has no box', () => {
  it('is listed by id and name, with the connections that pass through it and their arrows, in order of id', () => {
    const passed = [
      { id: 'balancer', name: 'Load balancer', conditions: [], own: false, connections: ['api-pays-cards'], arrows: ['api~cards'] },
      { id: 'edge', name: 'Edge network', conditions: [], own: false, connections: ['api-pays-cards'], arrows: ['api~cards'] },
    ];
    expect(view(DESK, 'desk.containers').passed).toEqual(passed);
    expect(view(DESK, 'desk.context').passed).toEqual(passed.map((one) => ({ ...one, arrows: ['desk~cards'] })));
    expect(view(DESK, 'cards.context').passed).toEqual(passed.map((one) => ({ ...one, arrows: ['desk~cards'] })));
    expect(view(SHOP, 'shop.containers').passed).toEqual([]);
  });

  it('lists an app, a component or a system with no box by its own id, and what has an error in its file by its id', () => {
    const files = {
      ...DESK,
      'systems/bank.yaml': 'name: Bank\n',
      'apps/vault.yaml': 'name: Vault\nin: bank\n',
      'components/lock.yaml': 'name: Lock\nin: vault\n',
      'infrastructure/balancer.yaml': 'name: [Load balancer\n',
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\nvia: [lock, vault, edge]\n',
    };
    const containers = view(files, 'desk.containers');
    expect(containers.passed.map((one) => [one.id, one.name, one.connections])).toEqual([
      ['balancer', 'balancer', ['api-pays-cards']],
      ['edge', 'Edge network', ['api-pays-cards', 'clerk-uses-web']],
      ['lock', 'Lock', ['clerk-uses-web']],
      ['vault', 'Vault', ['clerk-uses-web']],
    ]);
    expect(containers.passed.find((one) => one.id === 'edge')?.arrows).toEqual(['api~cards', 'clerk~web']);
  });
});

describe('the legend of the hard cases', () => {
  it('lists each new look and mark where the view draws it, in a fixed order', () => {
    expect(view(DESK, 'desk.containers').legend.map((entry) => entry.key)).toEqual([
      'person',
      'system-external',
      'app',
      'store',
      'queue-or-topic',
      'infrastructure',
      'boundary',
      'arrow',
      'arrow-many',
      'route',
      'passing',
    ]);
    expect(view(DESK, 'desk.context').legend.map((entry) => entry.key)).toEqual(['person', 'system-scope', 'system-external', 'infrastructure', 'arrow', 'route', 'passing']);
    expect(view(DESK, 'cards.context').legend.map((entry) => entry.key)).toEqual(['system-scope-external', 'system', 'system-external', 'arrow', 'route']);
    // Without a route, a mark or a new look, none of their lines.
    expect(view(SHOP, 'shop.containers').legend.map((entry) => entry.key)).toEqual(['app', 'store', 'boundary']);
  });

  it('says in a few plain words what each new look and mark means', () => {
    expect(Object.fromEntries(view(DESK, 'desk.containers').legend.map((entry) => [entry.key, entry.text]))).toMatchObject({
      'system-external': "External system: somebody else's, used as it is given",
      'queue-or-topic': 'Queue or topic: a store that holds messages on their way',
      infrastructure: 'Infrastructure: passes exchanges on, such as a proxy',
      route: 'Route: what the connections pass through, in order; “via on 2 of 5” when they differ',
      passing: "Passing through: how many of this view's connections pass through it",
    });
  });
});

/**
 * Vellumoak as it was lifted by hand: a runner reloads the HTTPS proxy, so the proxy has a box,
 * and the requests of the staff's browser, an app of the same system, pass through it to the
 * web app. One copy of the web app tells another through the proxy, and through a load balancer
 * that nothing starts or ends at.
 */
const VELLUM: Readonly<Record<string, string>> = {
  'systems/vellum.yaml': 'name: Vellumoak\n',
  'apps/browser.yaml': 'name: Staff browser\nin: vellum\n',
  'apps/web.yaml': 'name: Web\nin: vellum\n',
  'apps/runner.yaml': 'name: Runner\nin: vellum\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'infrastructure/balancer.yaml': 'name: Load balancer\n',
  'connections/runner-reloads-proxy.yaml': 'from: runner\nto: proxy\nname: Reloads it\n',
  'connections/browser-asks-pages.yaml': 'from: browser\nto: web\nvia: [proxy]\nname: Asks for pages\n',
  'connections/browser-sends-audio.yaml': 'from: browser\nto: web\nvia: [proxy]\nname: Sends audio\n',
  'connections/browser-polls-jobs.yaml': 'from: browser\nto: web\nvia: [proxy, balancer]\nname: Polls the jobs\n',
  'connections/web-tells-web.yaml': 'from: web\nto: web\nvia: [proxy, balancer]\nname: Tells another copy\n',
};

describe('what passes through a box, though both ends are one box', () => {
  const requests = ['browser-asks-pages', 'browser-polls-jobs', 'browser-sends-audio'];

  it('counts on a box every connection the view holds that passes through it: on an arrow, inside a box and between its copies', () => {
    const context = view(VELLUM, 'vellum.context');
    // All three requests are inside the Vellumoak box, and the copies of the web app are too.
    expect(context.boxes.find((box) => box.id === 'vellum')?.within).toEqual(requests);
    expect(context.boxes.find((box) => box.id === 'vellum')?.loops).toEqual(['web-tells-web']);
    expect(context.arrows.map((one) => one.id)).toEqual(['vellum~proxy']);
    expect(passingOn(context)).toEqual({ proxy: [...requests, 'web-tells-web'] });
    const containers = view(VELLUM, 'vellum.containers');
    expect(arrow(containers, 'browser~web').connections).toEqual(requests);
    expect(containers.boxes.find((box) => box.id === 'web')?.loops).toEqual(['web-tells-web']);
    expect(passingOn(containers)).toEqual({ proxy: [...requests, 'web-tells-web'] });
  });

  it('lists what has no box with the connections held in a box, which have no arrow', () => {
    expect(view(VELLUM, 'vellum.context').passed).toEqual([{ id: 'balancer', name: 'Load balancer', conditions: [], own: false, connections: ['browser-polls-jobs', 'web-tells-web'], arrows: [] }]);
    expect(view(VELLUM, 'vellum.containers').passed).toEqual([
      { id: 'balancer', name: 'Load balancer', conditions: [], own: false, connections: ['browser-polls-jobs', 'web-tells-web'], arrows: ['browser~web'] },
    ]);
  });

  it('does not count what passes through the box that holds it, nor a connection the view leaves out', () => {
    const files = {
      ...VELLUM,
      'apps/gate.yaml': 'name: Gate\nin: vellum\n',
      'connections/browser-asks-web.yaml': 'from: browser\nto: web\nvia: [gate]\n',
      'people/clerk.yaml': 'name: Clerk\n',
      'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
      'connections/clerk-reloads-proxy.yaml': 'from: clerk\nto: proxy\nvia: [balancer]\n',
    };
    const context = view(files, 'vellum.context');
    expect(context.left.outside).toEqual(['clerk-reloads-proxy']);
    // The gate is drawn as the Vellumoak box, which holds the request: it passes through nothing this level shows.
    expect(passingOn(context)).toEqual({ proxy: [...requests, 'web-tells-web'] });
    expect(context.passed.map((one) => [one.id, one.connections])).toEqual([['balancer', ['browser-polls-jobs', 'web-tells-web']]]);
  });
});

describe('the route of an arrow at its level', () => {
  /** Home Assistant: a component of Core reaches the Whisper app through another component of Core. */
  const HOME: Readonly<Record<string, string>> = {
    'systems/home.yaml': 'name: Home Assistant\n',
    'systems/voice.yaml': 'name: Voice\n',
    'apps/core.yaml': 'name: Core\nin: home\n',
    'apps/whisper.yaml': 'name: Whisper\nin: voice\n',
    'components/assist.yaml': 'name: Assist\nin: core\n',
    'components/wyoming.yaml': 'name: wyoming integration\nin: core\n',
    'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
    'connections/assist-asks-whisper.yaml': 'from: assist\nto: whisper\nvia: [wyoming]\nname: Asks for the words\n',
    'connections/assist-sends-audio.yaml': 'from: assist\nto: whisper\nvia: [wyoming, proxy]\nname: Sends the audio\n',
  };

  it('leaves out a hop drawn as an end of the arrow, and has no route when that leaves none', () => {
    const only = { ...HOME, 'connections/assist-sends-audio.yaml': 'from: assist\nto: core\n' };
    for (const id of ['home.containers', 'home.context', 'voice.context']) {
      const shown = view(only, id);
      expect(shown.arrows).toHaveLength(1);
      expect(shown.arrows[0]).not.toHaveProperty('route');
      expect(shown.legend.map((entry) => entry.key)).not.toContain('route');
    }
  });

  it('keeps the hops that are not drawn as an end, in order', () => {
    // Only the audio passes through anything at this level.
    expect(arrow(view(HOME, 'home.containers'), 'core~voice').route).toEqual({ count: 1, hops: [], bracketed: false, line: 'via on 1 of 2' });
    const both = { ...HOME, 'connections/assist-asks-whisper.yaml': 'from: assist\nto: whisper\nvia: [proxy, wyoming]\n' };
    expect(arrow(view(both, 'home.context'), 'home~voice').route).toEqual({ count: 2, hops: [{ name: 'HTTPS proxy', bracketed: false }], bracketed: false, line: 'via HTTPS proxy' });
  });

  it('keeps the whole route on each connection, for the panel', () => {
    const model = modelOf(HOME);
    expect(model.connections.find((one) => one.id === 'assist-sends-audio')?.via).toEqual(['wyoming', 'proxy']);
  });
});

describe('the connections that no view holds', () => {
  /** A system, and beside it a person who reloads a proxy, the proxy checking a peer and itself: none of it touches the system. */
  const OPS: Readonly<Record<string, string>> = {
    'systems/desk.yaml': 'name: Desk\n',
    'apps/api.yaml': 'name: API\nin: desk\n',
    'people/operator.yaml': 'name: Operator\n',
    'infrastructure/proxy.yaml': 'name: Proxy\n',
    'infrastructure/peer.yaml': 'name: Peer proxy\n',
    'connections/operator-reloads-proxy.yaml': 'from: operator\nto: proxy\n',
    'connections/proxy-checks-peer.yaml': 'from: proxy\nto: peer\n',
    'connections/proxy-syncs-proxy.yaml': 'from: proxy\nto: proxy\n',
  };

  it('are those no view draws on an arrow, holds in a box, marks or counts as left out', () => {
    const model = modelOf(OPS);
    const views = viewsOf(model);
    for (const one of views) expect([one.arrows, one.left]).toEqual([[], { outside: [], broken: [] }]);
    expect(connectionsInNoView(model, views)).toEqual(['operator-reloads-proxy', 'proxy-checks-peer', 'proxy-syncs-proxy']);
  });

  it('are those no view draws, though a view counts them as left out', () => {
    const files = {
      ...OPS,
      // Now the proxy and the operator stand beside the desk: what is between them is left out there, and in no picture; the proxy's copies are its mark.
      'connections/proxy-checks-api.yaml': 'from: proxy\nto: api\n',
      'connections/operator-uses-api.yaml': 'from: operator\nto: api\n',
      'connections/api-wakes-api.yaml': 'from: api\nto: api\n',
      'systems/bank.yaml': 'name: Bank\ncolour: blue\n',
      'connections/api-calls-bank.yaml': 'from: api\nto: bank\n',
      'connections/peer-calls-bank.yaml': 'from: peer\nto: bank\n',
    };
    const model = modelOf(files);
    const views = viewsOf(model);
    expect(views.find((one) => one.id === 'desk.containers')?.left).toEqual({ outside: ['operator-reloads-proxy'], broken: ['api-calls-bank'] });
    // Counted as left out, or to a record with an error, is not drawn.
    expect(connectionsInNoView(model, views)).toEqual(['api-calls-bank', 'operator-reloads-proxy', 'peer-calls-bank', 'proxy-checks-peer']);
  });

  it('are every connection of a model with no system, which has no view', () => {
    const model = modelOf({ 'people/a.yaml': 'name: A\n', 'people/b.yaml': 'name: B\n', 'connections/a-asks-b.yaml': 'from: a\nto: b\n' });
    expect(connectionsInNoView(model, viewsOf(model))).toEqual(['a-asks-b']);
  });
});

describe('an external system that a view is about', () => {
  const files = { ...DESK, 'apps/terminal.yaml': 'name: Terminal\nin: cards\n', 'connections/terminal-calls-api.yaml': 'from: terminal\nto: api\n' };

  it('gives its boundary its kind line apart, so that the layout keeps it whole', () => {
    expect(view(files, 'cards.containers').boundary).toEqual({ id: 'cards', name: 'Card provider', line: '[System: external]', title: 'Card provider [System: external]' });
  });

  it('explains in the legend both its outline and the thicker line of the system in scope, where the view draws them', () => {
    const context = view(files, 'cards.context');
    expect(context.legend.filter((entry) => entry.key.startsWith('system'))).toEqual([
      { key: 'system-scope-external', text: 'This system, which is external: what the view is about' },
      { key: 'system', text: "Other system: software seen as one thing, ours or somebody else's" },
      { key: 'system-external', text: "External system: somebody else's, used as it is given" },
    ]);
    // The view of a system of ours draws no such line.
    expect(view(files, 'desk.context').legend.map((entry) => entry.key)).not.toContain('system-scope-external');
  });

  it('says in the legend that the boundary is an external system', () => {
    const inside = { ...files, 'connections/api-pays-cards.yaml': 'from: api\nto: terminal\nname: Takes a payment\n' };
    expect(view(inside, 'cards.containers').legend.find((entry) => entry.key === 'boundary')?.text).toBe(
      "Boundary: this system, which is external: somebody else's, used as it is given, with its apps and stores inside",
    );
    // The payment ends at the card provider itself, at the edge of its boundary.
    expect(view(files, 'cards.containers').legend.find((entry) => entry.key === 'boundary')?.text).toBe(
      "Boundary: this system, which is external: somebody else's, used as it is given, with its apps and stores inside; an arrow at its edge is to or from the system itself",
    );
  });
});

/**
 * The examples of stage 6b. Desk keeps its drafts in a file beside it, and its editor keeps a
 * cache; the indexer, another app of the archive, reads the drafts all the same, and staff open
 * one by hand. A gate is part of the archive and staff reload it; an office proxy is part of the
 * archive too, there only in the head office, and nothing starts or ends at it. An HTTPS proxy
 * is in no system. Desk tells the staff browser when a job is done, down a channel the browser
 * opened. A teller of the bank checks the gate.
 */
const ARCHIVE: Readonly<Record<string, string>> = {
  'people/staff.yaml': 'name: Staff\n',
  'systems/archive.yaml': 'name: Archive\n',
  'systems/bank.yaml': 'name: Bank\n',
  'apps/desk.yaml': 'name: Desk\nin: archive\n',
  'apps/browser.yaml': 'name: Staff browser\nin: archive\nkind: browser\n',
  'apps/indexer.yaml': 'name: Indexer\nin: archive\n',
  'apps/teller.yaml': 'name: Teller\nin: bank\n',
  'components/editor.yaml': 'name: Editor\nin: desk\n',
  'stores/drafts.yaml': 'name: Drafts\nin: desk\ndescription: Edits that are not yet saved, in a file beside Desk.\nkind: files\n',
  'stores/cache.yaml': 'name: Cache\nin: desk\nkind: cache\n',
  'stores/records.yaml': 'name: Records\nin: archive\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: archive\nonly: in the head office\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: archive\n',
  'connections/desk-keeps-drafts.yaml': 'from: desk\nto: drafts\naccess: read-write\nname: Keeps edits that are not yet saved\n',
  'connections/editor-reads-cache.yaml': 'from: editor\nto: cache\naccess: read\nname: Reads what it cached\n',
  'connections/indexer-reads-drafts.yaml': 'from: indexer\nto: drafts\naccess: read\nname: Reads the drafts\n',
  'connections/staff-opens-drafts.yaml': 'from: staff\nto: drafts\nname: Opens a draft by hand\n',
  'connections/desk-tells-browser.yaml': 'from: desk\nto: browser\nvia: [proxy, office-proxy]\nopens: to\nname: Says when a job is done\n',
  'connections/desk-keeps-records.yaml': 'from: desk\nto: records\naccess: write\nname: Saves an edit\n',
  'connections/staff-reloads-gate.yaml': 'from: staff\nto: gate\nname: Reloads it\n',
  'connections/teller-checks-gate.yaml': 'from: teller\nto: gate\nname: Checks that it answers\n',
};

describe('a store that an app keeps', () => {
  it('has no box, and the app that keeps it carries their number, in its container view only', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(boxIds(containers)).not.toContain('drafts');
    expect(boxIds(containers)).not.toContain('cache');
    expect(boxIds(containers)).toContain('records');
    expect(containers.boxes.find((box) => box.id === 'desk')?.kept).toEqual(['cache', 'drafts']);
    expect(containers.boxes.filter((box) => box.kept.length > 0).map((box) => box.id)).toEqual(['desk']);
    expect(view(ARCHIVE, 'archive.context').boxes.every((box) => box.kept.length === 0)).toBe(true);
  });

  it('holds inside the app a connection from the app, or a component in it, to a store it keeps: no arrow, and the box lists it', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(containers.boxes.find((box) => box.id === 'desk')?.within).toEqual(['desk-keeps-drafts', 'editor-reads-cache']);
    expect(Object.values(arrows(containers)).flat()).not.toContain('desk-keeps-drafts');
    expect(view(ARCHIVE, 'archive.context').boxes.find((box) => box.id === 'archive')?.within).toContain('editor-reads-cache');
  });

  it('draws at the app a connection that ends at the store, as at a component', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(arrows(containers)['indexer~desk']).toEqual(['indexer-reads-drafts']);
    expect(arrows(containers)['staff~desk']).toEqual(['staff-opens-drafts']);
    expect(arrows(view(ARCHIVE, 'archive.context'))['staff~archive']).toEqual(['staff-opens-drafts', 'staff-reloads-gate']);
  });

  it('leaves nothing out of the views, and counts nothing as broken', () => {
    const model = modelOf(ARCHIVE);
    const views = viewsOf(model);
    for (const one of views) expect(one.left.broken).toEqual([]);
    expect(connectionsInNoView(model, views)).toEqual([]);
  });

  it('counts a connection to it as broken where the app that keeps it has an error in its file', () => {
    const files = { ...ARCHIVE, 'apps/desk.yaml': 'name: [Desk\n', 'connections/teller-reads-drafts.yaml': 'from: teller\nto: drafts\n' };
    expect(view(files, 'bank.containers').left.broken).toEqual(['teller-reads-drafts']);
    expect(view(files, 'archive.containers').left.broken).toContain('indexer-reads-drafts');
  });

  it('has the mark in the legend where the view draws it', () => {
    expect(view(ARCHIVE, 'archive.containers').legend.find((entry) => entry.key === 'kept')?.text).toBe(
      'Kept stores: how many stores this app keeps, drawn at it; its panel lists them',
    );
    expect(view(ARCHIVE, 'archive.context').legend.map((entry) => entry.key)).not.toContain('kept');
  });
});

describe('a piece of infrastructure in a system', () => {
  it('has a box inside the boundary of its system where a connection starts or ends at it, in its own shape', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(containers.boxes.find((box) => box.id === 'gate')).toMatchObject({ family: 'infrastructure', look: 'infrastructure', inside: true });
    expect(arrows(containers)['staff~gate']).toEqual(['staff-reloads-gate']);
    expect(arrows(containers)['bank~gate']).toEqual(['teller-checks-gate']);
    // One that nothing starts or ends at has no box.
    expect(boxIds(containers)).not.toContain('office-proxy');
  });

  it('is drawn at its system in a context view, and in the view of another system, as an app is', () => {
    expect(boxIds(view(ARCHIVE, 'archive.context'))).not.toContain('gate');
    expect(arrows(view(ARCHIVE, 'bank.containers'))['teller~archive']).toEqual(['teller-checks-gate']);
    expect(arrows(view(ARCHIVE, 'bank.context'))['bank~archive']).toEqual(['teller-checks-gate']);
  });

  it('brings a connection with a person into the views of its system, while one between two things in no system is in no picture', () => {
    const files = { ...ARCHIVE, 'connections/staff-reloads-proxy.yaml': 'from: staff\nto: proxy\n' };
    const model = modelOf(files);
    expect(connectionsInNoView(model, viewsOf(model))).toEqual(['staff-reloads-proxy']);
  });

  it('is listed as the system’s own under the legend when it is only passed through', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(containers.passed).toEqual([
      { id: 'office-proxy', name: 'Office proxy', conditions: ['in the head office'], own: true, connections: ['desk-tells-browser'], arrows: ['desk~browser'] },
      { id: 'proxy', name: 'HTTPS proxy', conditions: [], own: false, connections: ['desk-tells-browser'], arrows: ['desk~browser'] },
    ]);
    // In the view of another system it is not that system's own.
    const files = { ...ARCHIVE, 'connections/teller-asks-desk.yaml': 'from: teller\nto: desk\nvia: [office-proxy]\n' };
    expect(view(files, 'bank.containers').passed).toEqual([]);
    expect(view(files, 'bank.containers').boxes.find((box) => box.id === 'archive')?.passing).toEqual([]);
  });

  it('says in the legend that the boundary holds pieces of infrastructure, where one stands inside it', () => {
    expect(view(ARCHIVE, 'archive.containers').legend.find((entry) => entry.key === 'boundary')?.text).toBe(
      'Boundary: this system, with its apps, stores and pieces of infrastructure inside',
    );
    expect(view(ARCHIVE, 'bank.containers').legend.find((entry) => entry.key === 'boundary')?.text).toBe('Boundary: this system, with its apps and stores inside');
  });

  it('counts its connections as broken when its system has an error in its file', () => {
    const files = { ...ARCHIVE, 'systems/archive.yaml': 'name: [Archive\n' };
    expect(view(files, 'bank.containers').left.broken).toEqual(['teller-checks-gate']);
  });

  it('stays drawn as before when it is in no system', () => {
    const files = { ...ARCHIVE, 'connections/proxy-checks-desk.yaml': 'from: proxy\nto: desk\n' };
    expect(view(files, 'archive.containers').boxes.find((box) => box.id === 'proxy')).toMatchObject({ inside: false });
    expect(boxIds(view(files, 'archive.context'))).toContain('proxy');
  });
});

describe('a condition in the picture', () => {
  const files = {
    ...ARCHIVE,
    'apps/indexer.yaml': 'name: Indexer\nin: archive\nonly: in the hosted edition\n',
    'systems/bank.yaml': 'name: Bank\nonly: when payments are on\n',
    'connections/teller-checks-gate.yaml': 'from: teller\nto: gate\nname: Checks that it answers\nonly: at night\n',
  };

  it('puts on a box its own `only`, and nothing that it has from what it is in', () => {
    const containers = view(files, 'archive.containers');
    expect(containers.boxes.find((box) => box.id === 'indexer')?.only).toBe('in the hosted edition');
    expect(containers.boxes.find((box) => box.id === 'bank')?.only).toBe('when payments are on');
    // The teller is in the bank, which has a condition: the teller's box has none of its own.
    expect(view(files, 'bank.containers').boxes.find((box) => box.id === 'teller')).not.toHaveProperty('only');
    expect(view(files, 'archive.containers').legend.map((entry) => entry.key)).toContain('only');
  });

  it('says on an arrow the words, when its every connection has its own and they are the same', () => {
    expect(arrow(view(files, 'archive.containers'), 'bank~gate').only).toEqual({ count: 1, all: true, words: 'at night', line: 'only at night' });
  });

  it('says on how many when only some have their own, or the words differ', () => {
    const some = { ...files, 'connections/teller-pings-gate.yaml': 'from: teller\nto: gate\n' };
    expect(arrow(view(some, 'archive.containers'), 'bank~gate').only).toEqual({ count: 1, all: false, line: 'only on 1 of 2' });
    const differ = { ...files, 'connections/teller-pings-gate.yaml': 'from: teller\nto: gate\nonly: by day\n' };
    expect(arrow(view(differ, 'archive.containers'), 'bank~gate').only).toEqual({ count: 2, all: true, line: 'only on 2 of 2' });
  });

  it('says nothing on the arrow of a connection whose two ends have conditions of their own and it none', () => {
    const ends = { ...files, 'connections/indexer-asks-teller.yaml': 'from: indexer\nto: teller\nname: Asks for the balance\n' };
    const shown = arrow(view(ends, 'archive.containers'), 'indexer~bank');
    expect(shown.connections).toEqual(['indexer-asks-teller']);
    expect(shown).not.toHaveProperty('only');
  });

  it('puts in brackets on a route each thing that has an `only` of its own, and says so in the legend', () => {
    const two = {
      ...files,
      'infrastructure/proxy.yaml': 'name: HTTPS proxy\nonly: on the second floor\n',
      'connections/indexer-asks-records.yaml': 'from: indexer\nto: records\nvia: [office-proxy, proxy]\n',
    };
    const containers = view(two, 'archive.containers');
    expect(arrow(containers, 'indexer~records').route).toEqual({
      count: 1,
      hops: [
        { name: 'Office proxy', bracketed: true },
        { name: 'HTTPS proxy', bracketed: true },
      ],
      bracketed: true,
      line: 'via (Office proxy), (HTTPS proxy)',
    });
    expect(arrow(containers, 'desk~browser').route?.line).toBe('via (HTTPS proxy), (Office proxy)');
    expect(containers.passed.map((each) => [each.id, each.conditions])).toEqual([
      ['office-proxy', ['in the head office']],
      ['proxy', ['on the second floor']],
    ]);
    expect(containers.legend.find((entry) => entry.key === 'route-only')?.text).toBe(
      '(Name) on a route: there only sometimes, as its own “only” says or that of what it is in, and on the way whenever it is there',
    );
    expect(view(SHOP, 'shop.containers').legend.map((entry) => entry.key)).not.toContain('route-only');
  });
});

describe('a channel that the far side opened', () => {
  it('draws a ring when every connection of the arrow says so, and a line of the label when only some do', () => {
    const containers = view(ARCHIVE, 'archive.containers');
    expect(arrow(containers, 'desk~browser').opened).toEqual({ count: 1, all: true });
    expect(containers.legend.map((entry) => entry.key)).toContain('opened');
    const some = { ...ARCHIVE, 'connections/desk-pings-browser.yaml': 'from: desk\nto: browser\nname: Pings it\n' };
    const mixed = view(some, 'archive.containers');
    expect(arrow(mixed, 'desk~browser').opened).toEqual({ count: 1, all: false, line: 'far side opened on 1 of 2' });
    expect(mixed.legend.map((entry) => entry.key)).toEqual(expect.arrayContaining(['opened-some']));
    expect(mixed.legend.map((entry) => entry.key)).not.toContain('opened');
  });

  it('is missing from an arrow none of whose connections says so', () => {
    expect(arrow(view(ARCHIVE, 'archive.containers'), 'staff~gate')).not.toHaveProperty('opened');
  });
});

describe('what a connection does to a store', () => {
  it('adds nothing to the arrow: its name has the verb', () => {
    const shown = arrow(view(ARCHIVE, 'archive.containers'), 'desk~records');
    expect(shown).toEqual({ id: 'desk~records', from: 'desk', to: 'records', connections: ['desk-keeps-records'], names: ['Saves an edit'], technology: [] });
  });
});

/**
 * The review of stage 6b, its fourth test: a hop whose own `only` says again what its system
 * says. Taking the words out, as `only-said-again` offers, must change nothing in the picture.
 */
describe('a thing on a route whose condition comes from what it is in', () => {
  const LONG = 'Enterprise gateway for long-lived browser streaming connections behind the regional office perimeter';
  const ROUTED: Readonly<Record<string, string>> = {
    'people/reader.yaml': 'name: Reader\n',
    'systems/local-system.yaml': 'name: Local-system\n',
    'systems/proxy-system.yaml': 'name: Proxy-system\nonly: in production\n',
    'apps/one.yaml': 'name: One\nin: local-system\n',
    'infrastructure/first.yaml': `name: ${LONG}\nonly: in the office\n`,
    'infrastructure/front.yaml': 'name: Front\nin: proxy-system\nonly: in production\n',
    'connections/short.yaml': 'from: one\nto: reader\nvia: [first, front]\nopens: to\nonly: outside the office\n',
  };
  const without = { ...ROUTED, 'infrastructure/front.yaml': 'name: Front\nin: proxy-system\n' };

  it('stands in brackets on the route and in the list under the legend, said again or not', () => {
    for (const files of [ROUTED, without]) {
      const containers = view(files, 'local-system.containers');
      expect(arrow(containers, 'one~reader').route).toEqual({
        count: 1,
        hops: [
          { name: LONG, bracketed: true },
          { name: 'Front', bracketed: true },
        ],
        bracketed: true,
        line: `via (${LONG}), (Front)`,
      });
      // The words said again are one condition.
      expect(containers.passed.map((each) => [each.id, each.conditions])).toEqual([
        ['first', ['in the office']],
        ['front', ['in production']],
      ]);
      expect(containers.legend.map((entry) => entry.key)).toContain('route-only');
    }
  });

  it('gives the connection nothing from what it passes through: its arrow says its own words only', () => {
    for (const files of [ROUTED, without]) {
      const shown = arrow(view(files, 'local-system.containers'), 'one~reader');
      expect(shown.only).toEqual({ count: 1, all: true, words: 'outside the office', line: 'only outside the office' });
    }
  });
});

/**
 * The review of stage 6b, its fifth test: the one piece a person and a system act on, moved into
 * that system. Before, it stands outside every boundary; after, the system has a container view
 * for it, what the system does to it is inside the system's box at the context level, and the
 * route through it to the system is an error at the id in `via`.
 */
describe('a piece of infrastructure moved into the system that acts on it', () => {
  const BEFORE: Readonly<Record<string, string>> = {
    'people/admin.yaml': 'name: Admin\n',
    'systems/portal.yaml': 'name: Portal\n',
    'infrastructure/relay.yaml': 'name: Relay\n',
    'connections/watch.yaml': 'from: admin\nto: relay\nname: Reads health\n',
    'connections/health.yaml': 'from: portal\nto: relay\nname: Reloads configuration\n',
    'connections/control.yaml': 'from: admin\nto: portal\nvia: [relay]\nname: Controls the portal\n',
  };
  const AFTER = { ...BEFORE, 'infrastructure/relay.yaml': 'name: Relay\nin: portal\n' };

  it('stands outside the system before, where what a person does to it is in no picture', () => {
    const model = modelOf(BEFORE);
    const views = viewsOf(model);
    expect(views.map((one) => one.id)).toEqual(['portal.context']);
    expect(arrows(views[0] as View)).toEqual({ 'admin~portal': ['control'], 'portal~relay': ['health'] });
    expect(arrow(views[0] as View, 'admin~portal').route?.line).toBe('via Relay');
    expect(connectionsInNoView(model, views)).toEqual(['watch']);
  });

  it('gives the system a container view after, with the piece inside its boundary, and the system’s own act inside its box at the context level', () => {
    const loaded = load(Object.entries({ 'seefore.yaml': MARKER, ...AFTER }).map(([path, text]) => ({ path, text })));
    const views = viewsOf(loaded.model);
    expect(views.map((one) => one.id)).toEqual(['portal.context', 'portal.containers']);
    const containers = views[1] as View;
    expect(containers.boxes.find((box) => box.id === 'relay')).toMatchObject({ inside: true, look: 'infrastructure' });
    expect(arrows(containers)).toEqual({ 'admin~relay': ['watch'], 'portal~relay': ['health'] });
    const context = views[0] as View;
    expect(context.boxes.find((box) => box.id === 'portal')?.within).toEqual(['health']);
    expect(arrows(context)).toEqual({ 'admin~portal': ['watch'] });
    // The route to the system through its own piece names what the end is in: an error at that id, and the connection is not in the model.
    expect(loaded.problems.filter((problem) => problem.code === 'via-end').map((problem) => [problem.file, problem.line, problem.column])).toEqual([['connections/control.yaml', 3, 7]]);
    expect(loaded.model.connections.map((connection) => connection.id)).toEqual(['health', 'watch']);
    expect(connectionsInNoView(loaded.model, views)).toEqual([]);
  });

  it('gives a system none whose only piece is passed through', () => {
    const passed = {
      ...AFTER,
      'systems/desk.yaml': 'name: Desk\n',
      'connections/watch.yaml': 'from: admin\nto: desk\nname: Reads health\n',
      'connections/health.yaml': 'from: admin\nto: desk\nvia: [relay]\nname: Reloads\n',
      'connections/control.yaml': 'from: admin\nto: desk\nname: Controls the desk\n',
    };
    expect(viewsOf(modelOf(passed)).map((one) => one.id)).toEqual(['desk.context', 'portal.context']);
  });
});

/** The forms of the label that the spec quotes, as the views make them. */
describe('the lines of a label, in the words of the spec', () => {
  const FIVE: Readonly<Record<string, string>> = {
    ...ARCHIVE,
    'connections/desk-tells-browser.yaml': 'from: desk\nto: browser\nopens: to\nonly: in the hosted edition\nname: One\n',
    'connections/desk-tells-browser-2.yaml': 'from: desk\nto: browser\nopens: to\nonly: by day\nname: Two\n',
    'connections/desk-tells-browser-3.yaml': 'from: desk\nto: browser\nname: Three\n',
    'connections/desk-tells-browser-4.yaml': 'from: desk\nto: browser\nname: Four\n',
    'connections/desk-tells-browser-5.yaml': 'from: desk\nto: browser\nname: Five\n',
    'connections/indexer-asks-records.yaml': 'from: indexer\nto: records\nvia: [office-proxy, proxy]\nname: Asks\n',
  };
  const containers = view(FIVE, 'archive.containers');

  it('says `only on 2 of 5` and `far side opened on 2 of 5` when two of five say so', () => {
    const five = arrow(containers, 'desk~browser');
    expect(five.only?.line).toBe('only on 2 of 5');
    expect(five.opened?.line).toBe('far side opened on 2 of 5');
  });

  it('says `via (Office proxy), HTTPS proxy`', () => {
    expect(arrow(containers, 'indexer~records').route?.line).toBe('via (Office proxy), HTTPS proxy');
  });

  it('says in the legend what each count claims, and what it does not', () => {
    const legend = new Map(containers.legend.map((entry) => [entry.key, entry.text]));
    expect(legend.get('only')).toBe(
      '“only …”: there only then, as the thing says, or on an arrow a part inside the box at an end; “only on 2 of 5”: two of the five have one, and nothing is said of the rest',
    );
    expect(legend.get('opened-some')).toBe('“far side opened on 2 of 5”: two of the five connections say the far side opened their channel, and the others do not say');
  });
});

/**
 * A condition that no box of the view says: the trials found a write from a component with
 * `only` drawn from its app's box with no word of it.
 */
describe('a condition on an arrow that no box says', () => {
  const HIDDEN: Readonly<Record<string, string>> = {
    ...ARCHIVE,
    'components/editor.yaml': 'name: Editor\nin: desk\nonly: when editing is licensed\n',
    'connections/editor-saves-records.yaml': 'from: editor\nto: records\naccess: write\nname: Saves edits\n',
    'stores/drafts.yaml': 'name: Drafts\nin: desk\nonly: when sign-in is local\n',
    'connections/teller-reads-drafts.yaml': 'from: teller\nto: drafts\naccess: read\nname: Reads who is signed in\n',
  };

  it('gives on the arrow from an app the condition of its component, which has no box', () => {
    const containers = view(HIDDEN, 'archive.containers');
    expect(arrow(containers, 'desk~records').connections).toEqual(['desk-keeps-records', 'editor-saves-records']);
    expect(arrow(containers, 'desk~records').only).toEqual({ count: 1, all: false, line: 'only on 1 of 2' });
    const alone = { ...HIDDEN, 'connections/desk-keeps-records.yaml': 'from: desk\nto: browser\nname: Pings\n' };
    expect(arrow(view(alone, 'archive.containers'), 'desk~records').only).toEqual({ count: 1, all: true, words: 'when editing is licensed', line: 'only when editing is licensed' });
    expect(view(alone, 'archive.containers').legend.map((entry) => entry.key)).toContain('only');
    // One connection under two conditions, its own and its component's, says both in words.
    const both = { ...alone, 'connections/editor-saves-records.yaml': 'from: editor\nto: records\naccess: write\nname: Saves edits\nonly: on a working day\n' };
    expect(arrow(view(both, 'archive.containers'), 'desk~records').only).toEqual({
      count: 1,
      all: true,
      words: 'on a working day; when editing is licensed',
      line: 'only on a working day; when editing is licensed',
    });
  });

  it('gives on an arrow to an app the condition of a store it keeps, which has no box', () => {
    expect(arrow(view(HIDDEN, 'archive.containers'), 'bank~desk').only).toEqual({ count: 1, all: true, words: 'when sign-in is local', line: 'only when sign-in is local' });
    // In the view of the bank, the teller's check of the gate has none: the reading of the drafts does.
    expect(arrow(view(HIDDEN, 'bank.containers'), 'teller~archive').only?.line).toBe('only on 1 of 2');
  });

  it('gives on a context view the condition of an app, folded into its system', () => {
    const app = { ...ARCHIVE, 'apps/teller.yaml': 'name: Teller\nin: bank\nonly: when payments are on\n' };
    expect(arrow(view(app, 'archive.context'), 'bank~archive').only).toEqual({ count: 1, all: true, words: 'when payments are on', line: 'only when payments are on' });
    // On the container view of its system the app has a box, which says it: the arrow does not.
    expect(arrow(view(app, 'bank.containers'), 'teller~archive')).not.toHaveProperty('only');
    expect(view(app, 'bank.containers').boxes.find((box) => box.id === 'teller')?.only).toBe('when payments are on');
  });

  it('leaves out what a box or the boundary says, and counts two words the same once', () => {
    const said = { ...ARCHIVE, 'systems/archive.yaml': 'name: Archive\nonly: in production\n', 'apps/desk.yaml': 'name: Desk\nin: archive\nonly: in production\n' };
    // The boundary says it of the archive, and the box of Desk: the arrow says nothing.
    expect(arrow(view(said, 'archive.containers'), 'desk~records')).not.toHaveProperty('only');
    const twice = { ...HIDDEN, 'connections/editor-saves-records.yaml': 'from: editor\nto: records\nonly: when editing is licensed\nname: Saves edits\n' };
    expect(arrow(view(twice, 'archive.containers'), 'desk~records').only).toEqual({ count: 1, all: false, line: 'only on 1 of 2' });
  });
});

describe('the boundary of a system that has a condition', () => {
  it('says the system’s own `only` after its kind line, and the legend explains it', () => {
    const files = { ...ARCHIVE, 'systems/archive.yaml': 'name: Archive\nonly: in production\n' };
    const containers = view(files, 'archive.containers');
    expect(containers.boundary).toEqual({ id: 'archive', name: 'Archive', line: '[System]', only: 'in production', title: 'Archive [System] only in production' });
    expect(containers.legend.map((entry) => entry.key)).toContain('only');
    expect(view(ARCHIVE, 'archive.containers').boundary).toEqual({ id: 'archive', name: 'Archive', line: '[System]', title: 'Archive [System]' });
  });
});

describe('a connection in no picture', () => {
  it('is one between two neighbours of a system that every view shows outside it', () => {
    const files = {
      'people/admin.yaml': 'name: Admin\n',
      'systems/portal.yaml': 'name: Portal\n',
      'infrastructure/relay.yaml': 'name: Relay\n',
      'connections/control.yaml': 'from: admin\nto: portal\nname: Controls portal\n',
      'connections/health.yaml': 'from: portal\nto: relay\nname: Reloads configuration\n',
      'connections/watch.yaml': 'from: admin\nto: relay\nname: Reads health\n',
    };
    const model = modelOf(files);
    const views = viewsOf(model);
    expect(views.map((one) => [one.id, one.left.outside])).toEqual([['portal.context', ['watch']]]);
    expect(connectionsInNoView(model, views)).toEqual(['watch']);
  });
});
