import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { Model } from '../src/model.ts';
import { outlineOf } from '../src/outline.ts';
import type { Depth, Setting, View } from '../src/picture.ts';
import { DEPTHS, connectionsInNoView, keyOf, leftOutWords, settingOf, viewOf, viewsFor } from '../src/views.ts';

/**
 * What each setting of depth and scope draws, as `docs/depth-and-scope.md` says in "Depth",
 * "Scope" and "Where an end is drawn, and which arrows": on models made by code. The two
 * pictures of stage 5 are in `views.test.ts` and `stage-5.test.ts`.
 */

const MARKER = 'format: 1\nname: Scope\n';

/** The model of a source directory of these files and a marker. */
function modelOf(files: Readonly<Record<string, string>>): Model {
  return load(Object.entries({ 'seefore.yaml': MARKER, ...files }).map(([path, text]) => ({ path, text }))).model;
}

/** The view of the setting with this key, of a model of these files. */
function view(files: Readonly<Record<string, string>>, key: string): View {
  const setting = settingOf(key);
  const found = setting === undefined ? undefined : viewOf(modelOf(files), setting);
  if (found === undefined) throw new Error(`no view ${key}`);
  return found;
}

/** What a view draws and where: each box with the boundary it stands in, each boundary with the one it stands in, and each arrow with its connections. */
function drawn(of: View): { boxes: Record<string, string | null>; boundaries: Record<string, string | null>; arrows: Record<string, string[]> } {
  return {
    boxes: Object.fromEntries(of.boxes.map((box) => [box.id, box.boundary ?? null])),
    boundaries: Object.fromEntries(of.boundaries.map((boundary) => [boundary.id, boundary.boundary ?? null])),
    arrows: Object.fromEntries(of.arrows.map((arrow) => [arrow.id, arrow.connections])),
  };
}

/** A view less what tells one setting from another: its id, depth and title. What it draws is left. */
function picture(of: View): Omit<View, 'id' | 'depth' | 'title'> {
  const { id: _id, depth: _depth, title: _title, ...rest } = of;
  return rest;
}

/** Each connection a view holds, as an arrow or as a mark or a line of the panel of a box or a boundary, once for each time it is held. */
function held(of: View): string[] {
  return [
    ...of.arrows.flatMap((arrow) => arrow.connections),
    ...[...of.boxes, ...of.boundaries].flatMap((each) => [...each.loops, ...each.within]),
  ].sort();
}

describe('the key of a setting', () => {
  it('is the depth alone for everything, and the depth and the chosen box joined by ~', () => {
    expect(keyOf({ depth: 'system', scope: null })).toBe('system');
    expect(keyOf({ depth: 'container', scope: 'shop' })).toBe('container~shop');
    expect(keyOf({ depth: 'component', scope: 'relay' })).toBe('component~relay');
  });

  it('reads back as the setting it was made of', () => {
    for (const depth of DEPTHS) for (const scope of [null, 'shop', 'order-api']) expect(settingOf(keyOf({ depth, scope }))).toEqual({ depth, scope });
  });

  it('reads as nothing when it is of no known form', () => {
    for (const key of ['', 'context', 'shop.context', 'shop.containers', 'system~', 'container~shop~api', '~shop', 'component~Shop', 'components~shop', 'system~seefore']) {
      expect(settingOf(key)).toBeUndefined();
    }
  });
});

/** People who use each other and a shop. */
const PEOPLE: Readonly<Record<string, string>> = {
  'people/ann.yaml': 'name: Ann\n',
  'people/bob.yaml': 'name: Bob\n',
  'systems/shop.yaml': 'name: Shop\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'connections/ann-asks-bob.yaml': 'from: ann\nto: bob\nname: Asks for help\n',
  'connections/bob-uses-web.yaml': 'from: bob\nto: web\nname: Buys\n',
};

describe('two people where one acts on the other', () => {
  it('are joined by an arrow with everything as the scope, at every depth', () => {
    for (const depth of DEPTHS) expect(drawn(view(PEOPLE, depth)).arrows['ann~bob']).toEqual(['ann-asks-bob']);
    expect(drawn(view(PEOPLE, 'system'))).toEqual({ boxes: { ann: null, bob: null, shop: null }, boundaries: {}, arrows: { 'ann~bob': ['ann-asks-bob'], 'bob~shop': ['bob-uses-web'] } });
  });

  it('are joined by an arrow when one is the scope, and the other is its neighbour', () => {
    expect(drawn(view(PEOPLE, 'system~ann'))).toEqual({ boxes: { ann: null, bob: null }, boundaries: {}, arrows: { 'ann~bob': ['ann-asks-bob'] } });
    expect(drawn(view(PEOPLE, 'system~bob'))).toEqual({ boxes: { ann: null, bob: null, shop: null }, boundaries: {}, arrows: { 'ann~bob': ['ann-asks-bob'], 'bob~shop': ['bob-uses-web'] } });
  });

  it('are not joined in the view of the shop, which draws only the one that uses it', () => {
    const shop = view(PEOPLE, 'system~shop');
    expect(drawn(shop).boxes).toEqual({ bob: null, shop: null });
    expect(shop.left).toEqual({ outside: [], broken: [] });
  });
});

/** Two systems, each with an app, and a connection between the apps. */
const TWO: Readonly<Record<string, string>> = {
  'systems/shop.yaml': 'name: Shop\n',
  'systems/bank.yaml': 'name: Bank\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
  'connections/web-books.yaml': 'from: web\nto: ledger\nname: Books a sale\n',
};

describe('two open systems with a connection between their apps', () => {
  it('draw each system as one box at System depth, and the arrow between them', () => {
    expect(drawn(view(TWO, 'system'))).toEqual({ boxes: { bank: null, shop: null }, boundaries: {}, arrows: { 'shop~bank': ['web-books'] } });
  });

  it('open both at Container depth, each with its app inside, and the arrow runs from app to app', () => {
    expect(drawn(view(TWO, 'container'))).toEqual({ boxes: { ledger: 'bank', web: 'shop' }, boundaries: { bank: null, shop: null }, arrows: { 'web~ledger': ['web-books'] } });
    expect(drawn(view(TWO, 'component'))).toEqual(drawn(view(TWO, 'container')));
  });

  it('open only the chosen system, and draw the other closed, as its container view does', () => {
    expect(drawn(view(TWO, 'container~shop'))).toEqual({ boxes: { bank: null, web: 'shop' }, boundaries: { shop: null }, arrows: { 'web~bank': ['web-books'] } });
  });

  it('draw a chosen app with no frame around it, and the other system as its neighbour', () => {
    expect(drawn(view(TWO, 'container~web'))).toEqual({ boxes: { bank: null, web: null }, boundaries: {}, arrows: { 'web~bank': ['web-books'] } });
  });
});

/** A shop of two apps with components, which act on each other within and across the apps. */
const PARTS: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/shop.yaml': 'name: Shop\n',
  'apps/api.yaml': 'name: API\nin: shop\ntechnology: [go]\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\ntechnology: [rust]\n',
  'components/status.yaml': 'name: Status\nin: api\n',
  'components/page.yaml': 'name: Page\nin: web\n',
  'technologies/go.yaml': 'name: Go\n',
  'technologies/rust.yaml': 'name: Rust\n',
  'connections/checkout-asks-status.yaml': 'from: checkout\nto: status\nname: Asks how far it has got\n',
  'connections/page-calls-checkout.yaml': 'from: page\nto: checkout\nname: Places an order\n',
  'connections/clerk-uses-page.yaml': 'from: clerk\nto: page\nname: Fills a basket\n',
};

describe('two apps with components', () => {
  it('open at Component depth inside their open system, each with its components inside it', () => {
    expect(drawn(view(PARTS, 'component'))).toEqual({
      boxes: { checkout: 'api', clerk: null, page: 'web', status: 'api' },
      boundaries: { api: 'shop', shop: null, web: 'shop' },
      arrows: { 'checkout~status': ['checkout-asks-status'], 'clerk~page': ['clerk-uses-page'], 'page~checkout': ['page-calls-checkout'] },
    });
    expect(drawn(view(PARTS, 'component~shop'))).toEqual(drawn(view(PARTS, 'component')));
  });

  it('stay closed at Container depth, where what goes on inside an app is in its panel', () => {
    const container = view(PARTS, 'container');
    expect(drawn(container)).toEqual({ boxes: { api: 'shop', clerk: null, web: 'shop' }, boundaries: { shop: null }, arrows: { 'clerk~web': ['clerk-uses-page'], 'web~api': ['page-calls-checkout'] } });
    expect(container.boxes.find((box) => box.id === 'api')?.within).toEqual(['checkout-asks-status']);
  });

  it('draw a component as a box of its own look, whose line names the technology of its own record and no other', () => {
    const checkout = view(PARTS, 'component').boxes.find((box) => box.id === 'checkout');
    expect(checkout).toMatchObject({ family: 'components', look: 'component', name: 'Checkout', line: '[Component · Rust]' });
    expect(view(PARTS, 'component').boxes.find((box) => box.id === 'status')?.line).toBe('[Component]');
    expect(view(PARTS, 'component').boundaries.find((boundary) => boundary.id === 'api')).toMatchObject({ family: 'apps', line: '[App · Go]', title: 'API [App · Go]' });
  });

  it('open the chosen app alone, with its components, and draw the other app and the person as its neighbours', () => {
    expect(drawn(view(PARTS, 'component~api'))).toEqual({
      boxes: { checkout: 'api', status: 'api', web: null },
      boundaries: { api: null },
      arrows: { 'checkout~status': ['checkout-asks-status'], 'web~checkout': ['page-calls-checkout'] },
    });
  });

  it('draw a chosen component with a component of its app, and an app of its system, as neighbours', () => {
    expect(drawn(view(PARTS, 'component~checkout'))).toEqual({
      boxes: { checkout: null, status: null, web: null },
      boundaries: {},
      arrows: { 'checkout~status': ['checkout-asks-status'], 'web~checkout': ['page-calls-checkout'] },
    });
    expect(drawn(view(PARTS, 'component~page')).arrows).toEqual({ 'clerk~page': ['clerk-uses-page'], 'page~api': ['page-calls-checkout'] });
  });
});

/** An app that keeps a cache, which its component, the app itself and another app reach. */
const KEPT: Readonly<Record<string, string>> = {
  'systems/shop.yaml': 'name: Shop\n',
  'apps/api.yaml': 'name: API\nin: shop\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'components/worker.yaml': 'name: Worker\nin: api\n',
  'stores/cache.yaml': 'name: Cache\nin: api\n',
  'connections/api-keeps-cache.yaml': 'from: api\nto: cache\nname: Keeps what it worked out\n',
  'connections/worker-reads-cache.yaml': 'from: worker\nto: cache\nname: Reads what it worked out\n',
  'connections/web-reads-cache.yaml': 'from: web\nto: cache\nname: Reads it all the same\n',
};

describe('a store that an open app keeps', () => {
  it('has no box at any depth, and the app carries it, box or boundary', () => {
    for (const key of ['system', 'container', 'component', 'container~api', 'component~api', 'component~shop']) {
      const each = view(KEPT, key);
      expect(each.boxes.map((box) => box.id)).not.toContain('cache');
      expect(each.boundaries.map((boundary) => boundary.id)).not.toContain('cache');
    }
    expect(view(KEPT, 'container').boxes.find((box) => box.id === 'api')?.kept).toEqual(['cache']);
    expect(view(KEPT, 'component').boundaries.find((boundary) => boundary.id === 'api')?.kept).toEqual(['cache']);
  });

  it('is drawn at the boundary of its app when the app is open: an arrow from inside or outside ends there, and one from the app is in its panel', () => {
    const open = view(KEPT, 'component');
    expect(drawn(open).arrows).toEqual({ 'web~api': ['web-reads-cache'], 'worker~api': ['worker-reads-cache'] });
    expect(open.boundaries.find((boundary) => boundary.id === 'api')).toMatchObject({ within: ['api-keeps-cache'], loops: [] });
    const closed = view(KEPT, 'container');
    expect(drawn(closed).arrows).toEqual({ 'web~api': ['web-reads-cache'] });
    expect(closed.boxes.find((box) => box.id === 'api')?.within).toEqual(['api-keeps-cache', 'worker-reads-cache']);
  });

  it('cannot be the scope', () => {
    const model = modelOf(KEPT);
    expect(viewsFor(model).scopes.map((scope) => scope.id)).not.toContain('cache');
    for (const depth of DEPTHS) expect(viewOf(model, { depth, scope: 'cache' })).toBeUndefined();
  });
});

/** A clerk who uses the shop itself, the API itself, and a component that calls the shop. */
const ITSELF: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/shop.yaml': 'name: Shop\n',
  'apps/api.yaml': 'name: API\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\n',
  'connections/clerk-uses-shop.yaml': 'from: clerk\nto: shop\nname: Uses the shop\n',
  'connections/clerk-uses-api.yaml': 'from: clerk\nto: api\nname: Uses the API\n',
  'connections/checkout-tells-shop.yaml': 'from: checkout\nto: shop\nname: Tells the shop\n',
  'connections/api-wakes-api.yaml': 'from: api\nto: api\nname: Wakes another copy\n',
  'connections/shop-mirrors-shop.yaml': 'from: shop\nto: shop\nname: Mirrors itself\n',
};

describe('a connection written to an open system and to an open app itself', () => {
  it('is drawn at the boundary of what is open', () => {
    expect(drawn(view(ITSELF, 'container')).arrows).toEqual({ 'api~shop': ['checkout-tells-shop'], 'clerk~api': ['clerk-uses-api'], 'clerk~shop': ['clerk-uses-shop'] });
    expect(drawn(view(ITSELF, 'component')).arrows).toEqual({ 'checkout~shop': ['checkout-tells-shop'], 'clerk~api': ['clerk-uses-api'], 'clerk~shop': ['clerk-uses-shop'] });
  });

  it('from a record to itself is the mark on its box, or on its boundary when it is open', () => {
    const container = view(ITSELF, 'container');
    expect(container.boxes.find((box) => box.id === 'api')?.loops).toEqual(['api-wakes-api']);
    expect(container.boundaries.find((boundary) => boundary.id === 'shop')?.loops).toEqual(['shop-mirrors-shop']);
    const component = view(ITSELF, 'component');
    expect(component.boundaries.find((boundary) => boundary.id === 'api')?.loops).toEqual(['api-wakes-api']);
    expect(view(ITSELF, 'system').boxes.find((box) => box.id === 'shop')?.loops).toEqual(['api-wakes-api', 'shop-mirrors-shop']);
  });

  it('draws what the chosen box is in as that thing, closed: a component that calls its own system draws the system as a neighbour', () => {
    expect(drawn(view(ITSELF, 'component~checkout'))).toEqual({ boxes: { checkout: null, shop: null }, boundaries: {}, arrows: { 'checkout~shop': ['checkout-tells-shop'] } });
    // The chosen app is open with no frame of its system around it; the shop is a closed neighbour.
    const api = view(ITSELF, 'component~api');
    expect(drawn(api)).toEqual({ boxes: { checkout: 'api', clerk: null, shop: null }, boundaries: { api: null }, arrows: { 'checkout~shop': ['checkout-tells-shop'], 'clerk~api': ['clerk-uses-api'] } });
    // The clerk's use of the shop joins two of the app's neighbours.
    expect(api.left.outside).toEqual(['clerk-uses-shop']);
  });
});

/** A web app whose calls to the bank pass through a balancer in no system and a gate of the shop's, at neither of which anything starts or ends. */
const PASSED: Readonly<Record<string, string>> = {
  'systems/shop.yaml': 'name: Shop\n',
  'systems/bank.yaml': 'name: Bank\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'infrastructure/balancer.yaml': 'name: Load balancer\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: shop\n',
  'connections/web-pays.yaml': 'from: web\nto: bank\nvia: [gate, balancer]\nname: Pays\n',
};

describe('a thing that connections only pass through', () => {
  it('has no box at any depth or scope, and is listed under the legend where what it is in is open or not drawn', () => {
    const model = modelOf(PASSED);
    const views = viewsFor(model);
    for (const setting of views.settings()) {
      const each = views.viewOf(setting);
      expect(each?.boxes.map((box) => box.id)).not.toContain('balancer');
      expect(each?.boxes.map((box) => box.id)).not.toContain('gate');
      expect(each?.passed.map((one) => one.id)).toContain('balancer');
    }
    // Where the shop is closed, the gate is passed inside it, as an app is.
    expect(view(PASSED, 'system').passed.map((one) => one.id)).toEqual(['balancer']);
    expect(view(PASSED, 'system~bank').boxes.find((box) => box.id === 'shop')?.passing).toEqual([]);
    for (const key of ['container', 'component', 'container~shop', 'container~web']) expect(view(PASSED, key).passed.map((one) => one.id)).toEqual(['balancer', 'gate']);
  });

  it('is the system’s own when the system is the chosen box, and no system’s with everything as the scope', () => {
    const own = (key: string) => Object.fromEntries(view(PASSED, key).passed.map((one) => [one.id, one.own]));
    expect(own('container~shop')).toEqual({ balancer: false, gate: true });
    expect(own('container')).toEqual({ balancer: false, gate: false });
    expect(own('container~web')).toEqual({ balancer: false, gate: false });
  });

  it('cannot be the scope', () => {
    const model = modelOf(PASSED);
    expect(viewsFor(model).scopes.map((scope) => scope.id)).toEqual(['shop', 'web', 'bank']);
    for (const depth of DEPTHS) for (const scope of ['gate', 'balancer']) expect(viewOf(model, { depth, scope })).toBeUndefined();
  });
});

describe('a box with nothing inside', () => {
  const files = {
    'systems/mail.yaml': 'name: Mail\n',
    'systems/shop.yaml': 'name: Shop\n',
    'apps/api.yaml': 'name: API\nin: shop\n',
    'connections/api-sends-mail.yaml': 'from: api\nto: mail\nname: Sends a receipt\n',
  };

  it('stays closed at every depth, and a system with one part opens all the same', () => {
    expect(drawn(view(files, 'component'))).toEqual({ boxes: { api: 'shop', mail: null }, boundaries: { shop: null }, arrows: { 'api~mail': ['api-sends-mail'] } });
  });

  it('draws the same picture at every depth it has, chosen as the scope', () => {
    expect(picture(view(files, 'container~mail'))).toEqual(picture(view(files, 'system~mail')));
    expect(picture(view(files, 'component~mail'))).toEqual(picture(view(files, 'system~mail')));
    expect(picture(view(files, 'component~api'))).toEqual(picture(view(files, 'container~api')));
    expect(view(files, 'component~api').boxes.find((box) => box.id === 'api')).toMatchObject({ scope: true, look: 'app' });
  });
});

describe('a record whose file has an error, and one whose `in` is broken', () => {
  const files = {
    'systems/shop.yaml': 'name: Shop\n',
    'apps/web.yaml': 'name: Web\nin: shop\n',
    'systems/bank.yaml': 'name: [Bank\n',
    // In a record with an error: in the model, and not drawn, nor anything in it.
    'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
    // In nothing there is: not in the model.
    'apps/lost.yaml': 'name: Lost\nin: nowhere\n',
    'people/clerk.yaml': 'name: Clerk\n',
    'connections/web-books.yaml': 'from: web\nto: ledger\n',
    'connections/web-asks-lost.yaml': 'from: web\nto: lost\n',
    'connections/clerk-asks-ledger.yaml': 'from: clerk\nto: ledger\n',
    'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
  };

  it('is drawn nowhere, and a connection to it is counted where its other end is in the scope', () => {
    const model = modelOf(files);
    const views = viewsFor(model);
    for (const setting of views.settings()) {
      const each = views.viewOf(setting);
      for (const id of ['bank', 'ledger', 'lost']) expect([...(each?.boxes ?? []), ...(each?.boundaries ?? [])].map((box) => box.id)).not.toContain(id);
    }
    expect(view(files, 'container').left).toEqual({ outside: [], broken: ['clerk-asks-ledger', 'web-asks-lost', 'web-books'] });
    expect(view(files, 'container~web').left).toEqual({ outside: [], broken: ['web-asks-lost', 'web-books'] });
    expect(view(files, 'system~clerk').left).toEqual({ outside: [], broken: ['clerk-asks-ledger'] });
    expect(views.scopes.map((scope) => scope.id)).toEqual(['clerk', 'shop', 'web']);
  });

  it('puts its connections in no picture, and no other', () => {
    expect(connectionsInNoView(modelOf(files))).toEqual(['clerk-asks-ledger', 'web-asks-lost', 'web-books']);
  });
});

/** A clerk and a bank, each a neighbour of the shop, who act on each other. */
const NEIGHBOURS: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/shop.yaml': 'name: Shop\n',
  'systems/bank.yaml': 'name: Bank\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\n',
  'connections/web-pays-bank.yaml': 'from: web\nto: bank\n',
  'connections/clerk-calls-bank.yaml': 'from: clerk\nto: bank\n',
  'connections/bank-tells-clerk.yaml': 'from: bank\nto: clerk\n',
};

describe('two neighbours that act on each other', () => {
  it('are not followed further, and what is between them is counted under the title', () => {
    for (const key of ['system~shop', 'container~shop', 'container~web']) {
      expect(view(NEIGHBOURS, key).left.outside).toEqual(['bank-tells-clerk', 'clerk-calls-bank']);
      expect(drawn(view(NEIGHBOURS, key)).arrows).not.toHaveProperty('clerk~bank');
    }
  });

  it('say so in the words of the chosen box: outside the system, or between two of its neighbours', () => {
    expect(leftOutWords(view(NEIGHBOURS, 'container~shop'))).toBe('2 connections between two boxes outside the system are not drawn:');
    expect(leftOutWords(view(NEIGHBOURS, 'container~web'))).toBe('2 connections between two of its neighbours are not drawn:');
    expect(leftOutWords(view({ ...NEIGHBOURS, 'connections/bank-tells-clerk.yaml': 'from: clerk\nto: clerk\n' }, 'container~web'))).toBe('1 connection between two of its neighbours is not drawn:');
    expect(leftOutWords(view(NEIGHBOURS, 'container'))).toBeUndefined();
  });

  it('are joined with everything as the scope', () => {
    const everything = view(NEIGHBOURS, 'system');
    expect(drawn(everything).arrows).toMatchObject({ 'bank~clerk': ['bank-tells-clerk'], 'clerk~bank': ['clerk-calls-bank'] });
    expect(everything.left).toEqual({ outside: [], broken: [] });
  });

  it('are counted also when one is in the other: an end that is not drawn is taken at the deepest thing on its path that the picture draws', () => {
    // The API is chosen. Its shop is a neighbour, since a connection is written from the shop to
    // it; the web app and the clerk are neighbours too. The orders and the admin app are not drawn.
    const files = {
      'people/clerk.yaml': 'name: Clerk\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'apps/web.yaml': 'name: Web\nin: shop\n',
      'apps/admin.yaml': 'name: Admin\nin: shop\n',
      'stores/orders.yaml': 'name: Orders\nin: shop\n',
      'connections/shop-wakes-api.yaml': 'from: shop\nto: api\n',
      'connections/api-calls-web.yaml': 'from: api\nto: web\n',
      'connections/clerk-uses-api.yaml': 'from: clerk\nto: api\n',
      // From a neighbour to a part of the shop: between the web app and the shop, and the clerk and the shop.
      'connections/web-writes-orders.yaml': 'from: web\nto: orders\n',
      'connections/clerk-reads-orders.yaml': 'from: clerk\nto: orders\n',
      // Between two parts of the shop that are not drawn: both are taken at the shop, and what goes on inside a neighbour is not counted.
      'connections/admin-reads-orders.yaml': 'from: admin\nto: orders\n',
    };
    for (const key of ['container~api', 'component~api']) {
      const api = view(files, key);
      expect(drawn(api), key).toEqual({
        boxes: { api: null, clerk: null, shop: null, web: null },
        boundaries: {},
        arrows: { 'api~web': ['api-calls-web'], 'clerk~api': ['clerk-uses-api'], 'shop~api': ['shop-wakes-api'] },
      });
      expect(api.left.outside, key).toEqual(['clerk-reads-orders', 'web-writes-orders']);
      expect(leftOutWords(api), key).toBe('2 connections between two of its neighbours are not drawn:');
    }
    // Without the connection from the shop, the shop is no neighbour, and nothing on the orders' path is drawn.
    const { 'connections/shop-wakes-api.yaml': _, ...alone } = files;
    expect(view(alone, 'container~api').left.outside).toEqual([]);
  });
});

/**
 * One of every kind of box that can be the scope, and of each that cannot: a person, a system
 * with parts, a system with none, an app with a component, an app with none, a store in the
 * system, a store the app keeps, a piece of infrastructure in the system and one in no system,
 * each with a box, and one that is only passed through.
 */
const KINDS: Readonly<Record<string, string>> = {
  'people/clerk.yaml': 'name: Clerk\n',
  'systems/shop.yaml': 'name: Shop\n',
  'systems/mail.yaml': 'name: Mail\n',
  'apps/api.yaml': 'name: API\nin: shop\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\n',
  'stores/orders.yaml': 'name: Orders\nin: shop\n',
  'stores/cache.yaml': 'name: Cache\nin: api\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: shop\n',
  'infrastructure/proxy.yaml': 'name: Proxy\n',
  'infrastructure/edge.yaml': 'name: Edge\n',
  'connections/clerk-uses-web.yaml': 'from: clerk\nto: web\nvia: [proxy]\n',
  'connections/proxy-checks-gate.yaml': 'from: proxy\nto: gate\n',
  'connections/gate-checks-api.yaml': 'from: gate\nto: api\n',
  'connections/web-calls-checkout.yaml': 'from: web\nto: checkout\n',
  'connections/checkout-writes-orders.yaml': 'from: checkout\nto: orders\n',
  'connections/checkout-keeps-cache.yaml': 'from: checkout\nto: cache\n',
  'connections/api-sends-mail.yaml': 'from: api\nto: mail\nvia: [edge]\n',
};

describe('what can be the scope, and the depths it has', () => {
  const model = modelOf(KINDS);
  const views = viewsFor(model);

  it('is every box but a store an app keeps and a thing only passed through, with the shallowest depth of its level, in the order of the listing', () => {
    expect(views.scopes).toEqual([
      { id: 'clerk', family: 'people', depth: 'system' },
      { id: 'shop', family: 'systems', depth: 'system' },
      { id: 'api', family: 'apps', depth: 'container' },
      { id: 'checkout', family: 'components', depth: 'component' },
      { id: 'web', family: 'apps', depth: 'container' },
      { id: 'orders', family: 'stores', depth: 'container' },
      { id: 'gate', family: 'infrastructure', depth: 'container' },
      { id: 'mail', family: 'systems', depth: 'system' },
      { id: 'proxy', family: 'infrastructure', depth: 'system' },
    ]);
    // The listing has them in the same order, with what cannot be the scope among them.
    const outline = outlineOf(model);
    const listed = [
      ...outline.people,
      ...[...outline.withParts, ...outline.others].flatMap((system) => [
        system.id,
        ...system.apps.flatMap((app) => [app.id, ...app.components, ...(app.stores ?? [])]),
        ...system.stores,
        ...(system.infrastructure ?? []),
      ]),
      ...outline.infrastructure,
    ];
    const ids = new Set(views.scopes.map((scope) => scope.id));
    expect(listed.filter((id) => ids.has(id))).toEqual(views.scopes.map((scope) => scope.id));
    expect(listed.filter((id) => !ids.has(id))).toEqual(['cache', 'edge']);
  });

  /** The depths at which each kind has a view, as the spec's table says, and those at which its picture is the one of the depth before. */
  const table: [string, Depth[], Depth[]][] = [
    ['clerk', ['system', 'container', 'component'], ['container', 'component']],
    ['shop', ['system', 'container', 'component'], []],
    ['proxy', ['system', 'container', 'component'], ['container', 'component']],
    ['api', ['container', 'component'], []],
    ['orders', ['container', 'component'], ['component']],
    ['gate', ['container', 'component'], ['component']],
    ['checkout', ['component'], []],
    ['mail', ['system', 'container', 'component'], ['container', 'component']],
    ['web', ['container', 'component'], ['component']],
  ];

  it.each(table)('has %s at the depths of its level and deeper, and at no other', (scope, has) => {
    for (const depth of DEPTHS) {
      const one = views.viewOf({ depth, scope });
      if (has.includes(depth)) expect(one).toMatchObject({ depth, scope, id: keyOf({ depth, scope }) });
      else expect(one).toBeUndefined();
    }
  });

  it.each(table)('draws %s the same at a deeper depth that opens nothing, and else a picture of its own', (scope, has, same) => {
    for (const [at, depth] of has.entries()) {
      if (at === 0) continue;
      const before = picture(views.viewOf({ depth: has[at - 1] ?? 'system', scope }) as View);
      const now = picture(views.viewOf({ depth, scope }) as View);
      if (same.includes(depth)) expect(now).toEqual(before);
      else expect(now).not.toEqual(before);
    }
  });

  it('has no view of a scope the model has no record of, nor of one that cannot be followed', () => {
    for (const depth of DEPTHS) for (const scope of ['nothing', 'cache', 'edge']) expect(views.viewOf({ depth, scope })).toBeUndefined();
  });

  it('lists every setting: everything at each depth, then each scope from its shallowest depth', () => {
    const keys = views.settings().map(keyOf);
    expect(keys.slice(0, 6)).toEqual(['system', 'container', 'component', 'system~clerk', 'container~clerk', 'component~clerk']);
    expect(keys).toHaveLength(3 + table.reduce((sum, [, depths]) => sum + depths.length, 0));
    for (const setting of views.settings()) expect(views.viewOf(setting)).toBeDefined();
  });
});

describe('the settings a picture takes its turns from', () => {
  const views = viewsFor(modelOf(KINDS));
  const above = (key: string) => views.above(settingOf(key) as Setting).map(keyOf);

  it('are the same scope one depth up, and so on up, nearest first', () => {
    expect(above('component')).toEqual(['container', 'system']);
    expect(above('container')).toEqual(['system']);
    expect(above('component~clerk')).toEqual(['container~clerk', 'system~clerk']);
    expect(above('component~api')).toEqual(['container~api']);
    expect(above('component~orders')).toEqual(['container~orders']);
  });

  it('are none for the shallowest depth a scope has, and none past one system at Container depth, whose picture must not change', () => {
    for (const key of ['system', 'system~shop', 'container~api', 'component~checkout', 'container~shop']) expect(above(key)).toEqual([]);
    expect(above('component~shop')).toEqual(['container~shop']);
    expect(above('component~mail')).toEqual(['container~mail']);
  });

  it('are none for a setting the model does not have', () => {
    expect(above('system~api')).toEqual([]);
    expect(above('component~nothing')).toEqual([]);
  });
});

describe('everything as the scope', () => {
  const models: [string, Readonly<Record<string, string>>][] = [
    ['people', PEOPLE],
    ['two systems', TWO],
    ['apps with components', PARTS],
    ['a kept store', KEPT],
    ['connections to open boxes', ITSELF],
    ['a thing passed through', PASSED],
    ['neighbours', NEIGHBOURS],
    ['every kind of box', KINDS],
  ];

  it.each(models)('holds every connection whose ends can be followed once, at every depth, with %s', (_, files) => {
    const model = modelOf(files);
    const followed = model.connections.map((connection) => connection.id).filter((id) => !connectionsInNoView(model).includes(id)).sort();
    for (const depth of DEPTHS) {
      const everything = viewOf(model, { depth, scope: null }) as View;
      expect(held(everything)).toEqual(followed);
      expect(everything.left).toEqual({ outside: [], broken: [] });
    }
  });

  it('draws every person, every system and every piece of infrastructure in no system that has a box', () => {
    expect(drawn(view(KINDS, 'system')).boxes).toEqual({ clerk: null, mail: null, proxy: null, shop: null });
  });

  it('draws a model with nothing to draw as a view with no box', () => {
    expect(view({}, 'system')).toMatchObject({ boxes: [], boundaries: [], arrows: [], title: 'System view: Everything' });
  });
});

describe('the title', () => {
  it('names the depth and the scope, and keeps the context view of one system', () => {
    expect(view(KINDS, 'system').title).toBe('System view: Everything');
    expect(view(KINDS, 'component').title).toBe('Component view: Everything');
    expect(view(KINDS, 'container').title).toBe('Container view: Everything');
    expect(view(KINDS, 'component~shop').title).toBe('Component view: Shop');
    expect(view(KINDS, 'container~shop').title).toBe('Container view: Shop');
    expect(view(KINDS, 'system~shop').title).toBe('Context view: Shop');
    expect(view(KINDS, 'system~mail').title).toBe('Context view: Mail');
    expect(view(KINDS, 'container~mail').title).toBe('Container view: Mail');
  });

  it('has the kind of a chosen box that is not a system after its name, in the brackets a kind line has', () => {
    expect(view(KINDS, 'container~api').title).toBe('Container view: API [App]');
    expect(view(KINDS, 'component~api').title).toBe('Component view: API [App]');
    expect(view(KINDS, 'system~clerk').title).toBe('System view: Clerk [Person]');
    expect(view(KINDS, 'component~clerk').title).toBe('Component view: Clerk [Person]');
    expect(view(KINDS, 'container~orders').title).toBe('Container view: Orders [Store]');
    expect(view(KINDS, 'component~checkout').title).toBe('Component view: Checkout [Component]');
    expect(view(KINDS, 'system~proxy').title).toBe('System view: Proxy [Infrastructure]');
    expect(view(KINDS, 'container~gate').title).toBe('Container view: Gate [Infrastructure]');
    // A queue is a store, whatever its look; the kind of the store is not said.
    expect(view({ ...KINDS, 'stores/orders.yaml': 'name: Orders\nin: shop\nkind: queue\n' }, 'container~orders').title).toBe('Container view: Orders [Store]');
  });

  it('tells a system and an app of one name apart', () => {
    const files = { 'systems/post.yaml': 'name: Courier\n', 'apps/courier.yaml': 'name: Courier\nin: post\n' };
    expect(view(files, 'container~post').title).toBe('Container view: Courier');
    expect(view(files, 'container~courier').title).toBe('Container view: Courier [App]');
  });
});

describe('the chosen box', () => {
  it('has the thicker line, as a box and as a boundary, and with everything as the scope no box has it', () => {
    expect(view(KINDS, 'container~api').boxes.filter((box) => box.scope).map((box) => box.id)).toEqual(['api']);
    expect(view(KINDS, 'component~api').boundaries.filter((boundary) => boundary.scope).map((boundary) => boundary.id)).toEqual(['api']);
    expect(view(KINDS, 'component~api').boxes.some((box) => box.scope)).toBe(false);
    for (const depth of DEPTHS) {
      const everything = view(KINDS, depth);
      expect([...everything.boxes, ...everything.boundaries].some((each) => each.scope)).toBe(false);
    }
  });
});

describe('the legend', () => {
  it('says what a component is, and what the boundary of an app is', () => {
    const legend = Object.fromEntries(view(PARTS, 'component').legend.map((entry) => [entry.key, entry.text]));
    expect(legend).toMatchObject({ component: 'Component: a part of an app', 'boundary-app': 'Boundary: an app, with its components inside' });
    expect(view(PARTS, 'container').legend.map((entry) => entry.key)).not.toContain('component');
  });

  it('says what the chosen box is when it is no system, and not of a system', () => {
    for (const key of ['container~api', 'component~api', 'component~checkout', 'system~clerk']) {
      expect(view(KINDS, key).legend.find((entry) => entry.key === 'scope')?.text).toBe('This box: what the view is about');
    }
    for (const key of ['system~shop', 'container~shop', 'system', 'container']) expect(view(KINDS, key).legend.map((entry) => entry.key)).not.toContain('scope');
  });

  it('says of a system, with everything as the scope, what it is with no other one to stand beside', () => {
    expect(view(TWO, 'system').legend.find((entry) => entry.key === 'system')?.text).toBe("System: software seen as one thing, ours or somebody else's");
    expect(view(TWO, 'system~shop').legend.find((entry) => entry.key === 'system')?.text).toBe("Other system: software seen as one thing, ours or somebody else's");
  });

  it('says "Other system" only beside a chosen system, and "System" beside a chosen person, app, store, piece of infrastructure or component', () => {
    // The mail system reaches the store, the gate and the component too, so that a system stands beside each.
    const files = {
      ...KINDS,
      'connections/mail-reads-orders.yaml': 'from: mail\nto: orders\n',
      'connections/mail-asks-gate.yaml': 'from: mail\nto: gate\n',
      'connections/mail-asks-checkout.yaml': 'from: mail\nto: checkout\n',
    };
    const system = (key: string) => view(files, key).legend.find((entry) => entry.key === 'system')?.text;
    for (const key of ['system~shop', 'container~shop', 'component~shop', 'system~mail']) expect(system(key), key).toBe("Other system: software seen as one thing, ours or somebody else's");
    for (const key of ['system', 'container', 'component', 'system~clerk', 'container~api', 'component~api', 'container~orders', 'container~gate', 'system~proxy', 'component~checkout']) {
      expect(system(key), key).toBe("System: software seen as one thing, ours or somebody else's");
    }
  });

  it('says of the boundary of a system that is not the chosen box that it is a system, with what it holds and what an arrow at its edge means', () => {
    expect(view(TWO, 'container').legend.find((entry) => entry.key === 'boundary')?.text).toBe('Boundary: a system, with its apps and stores inside');
    expect(view(ITSELF, 'container').legend.find((entry) => entry.key === 'boundary')?.text).toBe(
      'Boundary: a system, with its apps and stores inside; an arrow at its edge is to or from the system itself',
    );
    expect(view(KINDS, 'container').legend.find((entry) => entry.key === 'boundary')?.text).toBe('Boundary: a system, with its apps, stores and pieces of infrastructure inside');
  });

  it('lists the marks a boundary carries', () => {
    const keys = view(ITSELF, 'component').legend.map((entry) => entry.key);
    expect(keys).toContain('loop');
    expect(view(KEPT, 'component').legend.map((entry) => entry.key)).toContain('kept');
  });
});

describe('what connections pass through', () => {
  const files = {
    'people/clerk.yaml': 'name: Clerk\n',
    'systems/shop.yaml': 'name: Shop\n',
    'apps/gateway.yaml': 'name: Gateway\nin: shop\n',
    'apps/api.yaml': 'name: API\nin: shop\n',
    'components/router.yaml': 'name: Router\nin: gateway\n',
    'connections/clerk-uses-api.yaml': 'from: clerk\nto: api\nvia: [router]\nname: Uses the API\n',
    'connections/clerk-uses-gateway.yaml': 'from: clerk\nto: router\nname: Asks the way\n',
  };

  it('is counted where the view draws it: on a box, on the boundary of an open app, or not at all inside an end', () => {
    expect(view(files, 'container').boxes.find((box) => box.id === 'gateway')?.passing).toEqual(['clerk-uses-api']);
    expect(view(files, 'component').boxes.find((box) => box.id === 'router')?.passing).toEqual(['clerk-uses-api']);
    // Chosen, the gateway is open and the router inside it.
    expect(view(files, 'component~gateway').boxes.find((box) => box.id === 'router')?.passing).toEqual([]);
    // Inside the shop drawn as one box, the route is passed inside it.
    expect(view(files, 'system').boxes.find((box) => box.id === 'shop')?.passing).toEqual([]);
    expect(view(files, 'container~api').arrows.find((arrow) => arrow.id === 'clerk~api')?.route?.line).toBe('via Router');
    expect(view(files, 'container~api').passed.map((one) => one.id)).toEqual(['router']);
  });
});
