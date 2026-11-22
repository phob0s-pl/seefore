import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import { ownership } from '../src/model.ts';

/** A small shop: one system with an app and its component, a store, a person, a proxy and the rest. */
const SHOP: Record<string, string> = {
  'seefore.yaml': 'format: 1\nname: Shop\n',
  'people/customer.yaml': 'name: Customer\n',
  'systems/shop.yaml': 'name: Shop\nowner: shop-team\n',
  'systems/card-provider.yaml': 'name: Card provider\n',
  'apps/order-api.yaml': 'name: Order API\nin: shop\n',
  'apps/storefront.yaml': 'name: Storefront\nin: shop\n',
  'stores/orders-database.yaml': 'name: Orders database\nin: shop\n',
  'stores/orders-copy.yaml': 'name: Copy of the orders\nin: shop\n',
  'components/checkout.yaml': 'name: Checkout\nin: order-api\n',
  'components/basket.yaml': 'name: Basket\nin: storefront\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'owners/shop-team.yaml': 'name: Shop team\n',
  'technologies/go.yaml': 'name: Go\n',
};

/** The way out of a store in a store, which convention 10 gives. */
const STORE_IN_STORE =
  'A store is never in a store. Databases on one server are each a store in the system, and each description names the server. ' +
  'A queue kept as rows is a store of its own in the system, with the database named in its description.';

/** The shop, with files added or replaced, and a text of `null` to take a file away. */
function shop(changes: Record<string, string | null> = {}): SourceFile[] {
  const files = { ...SHOP, ...changes };
  return Object.entries(files)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([path, text]) => ({ path, text }));
}

/** Every problem, as `file:line:column severity code`. */
function found(files: SourceFile[]): string[] {
  return load(files).problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.severity} ${problem.code}`);
}

function messages(files: SourceFile[]): string[] {
  return load(files).problems.map((problem) => problem.message);
}

describe('the shop as it stands', () => {
  it('breaks no rule and no check', () => {
    expect(load(shop()).problems).toEqual([]);
  });
});

describe('a reference that names no record', () => {
  it.each([
    ['`in` of an app', 'apps/thing.yaml', 'name: Thing\nin: shopp\n', '2:5', '`in` names `shopp`, but no record has that id. An app is in a system.'],
    [
      '`in` of a store',
      'stores/thing.yaml',
      'name: Thing\nin: shopp\n',
      '2:5',
      '`in` names `shopp`, but no record has that id. A store is in a system, or in the app that keeps it.',
    ],
    [
      '`in` of a piece of infrastructure',
      'infrastructure/thing.yaml',
      'name: Thing\nin: shopp\n',
      '2:5',
      '`in` names `shopp`, but no record has that id. A piece of infrastructure is in a system, or in none.',
    ],
    ['`in` of a component', 'components/thing.yaml', 'name: Thing\nin: order-app\n', '2:5', '`in` names `order-app`, but no record has that id. A component is in an app.'],
    [
      '`from` of a connection',
      'connections/thing.yaml',
      'from: costumer\nto: shop\n',
      '1:7',
      '`from` names `costumer`, but no record has that id. A connection goes from a person, a system, an app, a store, a component or a piece of infrastructure.',
    ],
    [
      '`to` of a connection',
      'connections/thing.yaml',
      'from: customer\nto: shopp\n',
      '2:5',
      '`to` names `shopp`, but no record has that id. A connection goes to a person, a system, an app, a store, a component or a piece of infrastructure.',
    ],
    [
      '`via` of a connection',
      'connections/thing.yaml',
      'from: customer\nto: card-provider\nvia: [proxy, ingres]\n',
      '3:14',
      '`via` names `ingres`, but no record has that id. ' +
        'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through.',
    ],
    [
      '`owner` of a piece of infrastructure',
      'infrastructure/thing.yaml',
      'name: Thing\nowner: shop-teem\n',
      '2:8',
      '`owner` names `shop-teem`, but no record has that id. `owner` names an owner, a record in `owners/`.',
    ],
    ['`owner` of a system', 'systems/thing.yaml', 'name: Thing\nowner: shop-teem\n', '2:8', '`owner` names `shop-teem`, but no record has that id. `owner` names an owner, a record in `owners/`.'],
    ['`owner` of an app', 'apps/thing.yaml', 'name: Thing\nin: shop\nowner: shop-teem\n', '3:8', '`owner` names `shop-teem`, but no record has that id. `owner` names an owner, a record in `owners/`.'],
  ])('is an error at the value: %s', (_what, path, text, place, message) => {
    const files = shop({ [path]: text });
    expect(found(files)).toEqual([`${path}:${place} error reference-unknown`]);
    expect(messages(files)).toEqual([message]);
  });

  it('is reported at each id of `technology` that names nothing', () => {
    const files = shop({ 'apps/thing.yaml': 'name: Thing\nin: shop\ntechnology: [go, golang, rust]\n' });
    expect(found(files)).toEqual(['apps/thing.yaml:3:18 error reference-unknown', 'apps/thing.yaml:3:26 error reference-unknown']);
    expect(messages(files)[0]).toBe(
      '`technology` names `golang`, but no record has that id. Each id in `technology` names a technology, a record in `technologies/`.',
    );
  });

  it('is reported at the item of a list written one item to a line', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: customer\nto: shop\ntechnology:\n  - go\n  - https\n' }))).toEqual([
      'connections/thing.yaml:5:5 error reference-unknown',
    ]);
  });

  it('is not an error when the record it names has a broken file: the record still stands', () => {
    expect(found(shop({ 'systems/shop.yaml': 'name: [unclosed\n' }))).toEqual(['systems/shop.yaml:1:7 error yaml-syntax']);
    expect(found(shop({ 'systems/shop.yaml': '' }))).toEqual(['systems/shop.yaml:1:1 error yaml-empty']);
  });

  it('is not an error when the record it names has a file that could not be read at all', () => {
    const files = shop().map((file) => (file.path === 'systems/shop.yaml' ? { path: file.path } : file));
    expect(found(files)).toEqual([]);
    expect(load(files).unread).toEqual([{ id: 'shop', family: 'systems', file: 'systems/shop.yaml' }]);
  });

  it('is not an error when the record it names has the wrong shape', () => {
    expect(found(shop({ 'systems/shop.yaml': 'name: Shop\ncolour: blue\n' }))).toEqual(['systems/shop.yaml:2:1 error key-unknown']);
  });

  it('is not an error when the record it names has a file whose ending is spelt otherwise', () => {
    expect(found(shop({ 'systems/shop.yaml': null, 'systems/shop.yml': 'name: Shop\n' }))).toEqual(['systems/shop.yml:1:1 error record-extension']);
  });

  it('is an error when the only file of that name sits where no record is read', () => {
    expect(found(shop({ 'systems/shop.yaml': null, 'system/shop.yaml': 'name: Shop\n' }))).toEqual([
      'apps/order-api.yaml:2:5 error reference-unknown',
      'apps/storefront.yaml:2:5 error reference-unknown',
      'stores/orders-copy.yaml:2:5 error reference-unknown',
      'stores/orders-database.yaml:2:5 error reference-unknown',
      'system/shop.yaml:1:1 warning not-read',
    ]);
  });

  it('is still checked in a record whose shape is wrong', () => {
    expect(found(shop({ 'apps/thing.yaml': 'name: Thing\nin: nowhere\ncolour: blue\n' }))).toEqual([
      'apps/thing.yaml:2:5 error reference-unknown',
      'apps/thing.yaml:3:1 error key-unknown',
    ]);
  });

  it('is not looked for in a value that is not an id: the shape says what is wrong with it', () => {
    expect(found(shop({ 'apps/thing.yaml': 'name: Thing\nin: Nowhere\n' }))).toEqual(['apps/thing.yaml:2:5 error value-invalid']);
    expect(found(shop({ 'apps/thing.yaml': 'name: Thing\nin: shop\ntechnology: nothing\n' }))).toEqual(['apps/thing.yaml:3:13 error value-wrong-kind']);
  });

  it('is not looked for in a key the family does not have', () => {
    expect(found(shop({ 'people/clerk.yaml': 'name: Clerk\nowner: nobody\n' }))).toEqual(['people/clerk.yaml:2:1 error key-unknown']);
  });
});

describe('a reference that names a record of the wrong kind', () => {
  it('says what it found and what is allowed, at the value', () => {
    const files = shop({ 'apps/thing.yaml': 'name: Thing\nin: orders-database\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'apps/thing.yaml',
        line: 2,
        column: 5,
        severity: 'error',
        code: 'reference-wrong-kind',
        message: '`in` names `orders-database`, which is a store. An app is in a system.',
      },
    ]);
  });

  it.each([
    ['an app in an app', 'apps/thing.yaml', 'name: Thing\nin: order-api\n', '2:5', '`in` names `order-api`, which is an app. An app is in a system.'],
    ['a store in a person', 'stores/thing.yaml', 'name: Thing\nin: customer\n', '2:5', '`in` names `customer`, which is a person. A store is in a system, or in the app that keeps it.'],
    [
      'a store in a component',
      'stores/thing.yaml',
      'name: Thing\nin: checkout\n',
      '2:5',
      '`in` names `checkout`, which is a component. A store is in a system, or in the app that keeps it.',
    ],
    [
      'a store in another store',
      'stores/thing.yaml',
      'name: Thing\nin: orders-database\n',
      '2:5',
      '`in` names `orders-database`, which is a store. A store is in a system, or in the app that keeps it. ' + STORE_IN_STORE,
    ],
    [
      'a store in a piece of infrastructure',
      'stores/thing.yaml',
      'name: Thing\nin: proxy\n',
      '2:5',
      '`in` names `proxy`, which is a piece of infrastructure. A store is in a system, or in the app that keeps it.',
    ],
    [
      'a piece of infrastructure in an app',
      'infrastructure/thing.yaml',
      'name: Thing\nin: order-api\n',
      '2:5',
      '`in` names `order-api`, which is an app. A piece of infrastructure is in a system, or in none.',
    ],
    [
      'a piece of infrastructure in another',
      'infrastructure/thing.yaml',
      'name: Thing\nin: proxy\n',
      '2:5',
      '`in` names `proxy`, which is a piece of infrastructure. A piece of infrastructure is in a system, or in none.',
    ],
    ['an app in a piece of infrastructure', 'apps/thing.yaml', 'name: Thing\nin: proxy\n', '2:5', '`in` names `proxy`, which is a piece of infrastructure. An app is in a system.'],
    [
      'a component in a piece of infrastructure',
      'components/thing.yaml',
      'name: Thing\nin: proxy\n',
      '2:5',
      '`in` names `proxy`, which is a piece of infrastructure. A component is in an app.',
    ],
    ['a component in a system', 'components/thing.yaml', 'name: Thing\nin: shop\n', '2:5', '`in` names `shop`, which is a system. A component is in an app.'],
    ['a component in another component', 'components/thing.yaml', 'name: Thing\nin: checkout\n', '2:5', '`in` names `checkout`, which is a component. A component is in an app.'],
    ['a component in a store', 'components/thing.yaml', 'name: Thing\nin: orders-database\n', '2:5', '`in` names `orders-database`, which is a store. A component is in an app.'],
    [
      'a connection from an owner',
      'connections/thing.yaml',
      'from: shop-team\nto: shop\n',
      '1:7',
      '`from` names `shop-team`, which is an owner. A connection goes from a person, a system, an app, a store, a component or a piece of infrastructure.',
    ],
    [
      'a connection to a technology',
      'connections/thing.yaml',
      'from: customer\nto: go\n',
      '2:5',
      '`to` names `go`, which is a technology. A connection goes to a person, a system, an app, a store, a component or a piece of infrastructure.',
    ],
    [
      'a connection to a connection',
      'connections/thing.yaml',
      'from: customer\nto: other\n',
      '2:5',
      '`to` names `other`, which is a connection. A connection goes to a person, a system, an app, a store, a component or a piece of infrastructure.',
    ],
    [
      'a route through a person',
      'connections/thing.yaml',
      'from: storefront\nto: card-provider\nvia: [customer]\n',
      '3:7',
      '`via` names `customer`, which is a person. ' +
        'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through.',
    ],
    [
      'a route through a technology',
      'connections/thing.yaml',
      'from: storefront\nto: card-provider\nvia: [proxy, go]\n',
      '3:14',
      '`via` names `go`, which is a technology. ' +
        'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through.',
    ],
    [
      'a route through a connection',
      'connections/thing.yaml',
      'from: storefront\nto: card-provider\nvia: [other]\n',
      '3:7',
      '`via` names `other`, which is a connection. ' +
        'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through.',
    ],
    [
      'a route through a store, which says what a queue or a topic is to do',
      'connections/thing.yaml',
      'from: storefront\nto: order-api\nvia: [orders-database]\n',
      '3:7',
      '`via` names `orders-database`, which is a store. ' +
        'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through. ' +
        'A store is never passed through, and a queue or a topic is a store: write a connection to it from the one that puts in, ' +
        'and another from the one that takes out, in place of this one.',
    ],
    ['a piece of infrastructure in a system', 'infrastructure/thing.yaml', 'name: Thing\nowner: shop\n', '2:8', '`owner` names `shop`, which is a system. `owner` names an owner, a record in `owners/`.'],
    [
      'a piece of infrastructure built with an owner',
      'infrastructure/thing.yaml',
      'name: Thing\ntechnology: [shop-team]\n',
      '2:14',
      '`technology` names `shop-team`, which is an owner. Each id in `technology` names a technology, a record in `technologies/`.',
    ],
    ['an owner that is a technology', 'systems/thing.yaml', 'name: Thing\nowner: go\n', '2:8', '`owner` names `go`, which is a technology. `owner` names an owner, a record in `owners/`.'],
    ['an owner that is a person', 'components/thing.yaml', 'name: Thing\nin: order-api\nowner: customer\n', '3:8', '`owner` names `customer`, which is a person. `owner` names an owner, a record in `owners/`.'],
    ['a technology that is an owner', 'stores/thing.yaml', 'name: Thing\nin: shop\ntechnology: [go, shop-team]\n', '3:18', '`technology` names `shop-team`, which is an owner. Each id in `technology` names a technology, a record in `technologies/`.'],
    ['a technology that is a system', 'connections/thing.yaml', 'from: customer\nto: shop\ntechnology: [shop]\n', '3:14', '`technology` names `shop`, which is a system. Each id in `technology` names a technology, a record in `technologies/`.'],
  ])('is an error: %s', (_what, path, text, place, message) => {
    const files = shop({ [path]: text, 'connections/other.yaml': 'from: customer\nto: storefront\n' });
    expect(found(files)).toEqual([`${path}:${place} error reference-wrong-kind`]);
    expect(messages(files)).toEqual([message]);
  });

  it('is an error when the record it names has a broken file of the wrong family, since its family is known', () => {
    expect(found(shop({ 'stores/broken.yaml': 'name: [\n', 'apps/thing.yaml': 'name: Thing\nin: broken\n' }))).toEqual([
      'apps/thing.yaml:2:5 error reference-wrong-kind',
      'stores/broken.yaml:1:7 error yaml-syntax',
    ]);
  });

  it('keeps anything from being in itself', () => {
    expect(messages(shop({ 'apps/order-api.yaml': 'name: Order API\nin: order-api\n' }))).toEqual([
      '`in` names `order-api`, which is an app. An app is in a system.',
    ]);
    expect(messages(shop({ 'components/checkout.yaml': 'name: Checkout\nin: checkout\n' }))).toEqual([
      '`in` names `checkout`, which is a component. A component is in an app.',
    ]);
    expect(messages(shop({ 'stores/orders-database.yaml': 'name: Orders database\nin: orders-database\n' }))).toEqual([
      '`in` names `orders-database`, which is a store. A store is in a system, or in the app that keeps it. ' + STORE_IN_STORE,
    ]);
    expect(messages(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: proxy\n' }))).toEqual([
      '`in` names `proxy`, which is a piece of infrastructure. A piece of infrastructure is in a system, or in none.',
    ]);
  });
});

describe('an id used in two folders', () => {
  it('is reported on both, also when one file is broken', () => {
    expect(found(shop({ 'apps/shop.yaml': 'name: [unclosed\n' }))).toEqual([
      'apps/shop.yaml:1:1 error id-twice',
      'apps/shop.yaml:1:7 error yaml-syntax',
      'systems/shop.yaml:1:1 error id-twice',
    ]);
  });

  it('does not make a reference to it an error when one of its records is of the right kind', () => {
    expect(found(shop({ 'owners/shop.yaml': 'name: Shop\n' }))).toEqual(['owners/shop.yaml:1:1 error id-twice', 'systems/shop.yaml:1:1 error id-twice']);
  });
});

describe('a store acts on nothing but another store', () => {
  it('reports a connection from a store to anything else, at its `from`', () => {
    const files = shop({ 'connections/database-tells.yaml': 'from: orders-database\nto: order-api\nname: Says what is new\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/database-tells.yaml',
        line: 1,
        column: 7,
        severity: 'error',
        code: 'store-acts',
        message:
          'This connection goes from the store `orders-database` to the app `order-api`, but a store acts on nothing but another store. ' +
          'Turn it round, so that it goes from the one that reads or writes the store, and say which in its name.',
      },
    ]);
  });

  it.each([
    ['a person', 'customer', 'the person `customer`'],
    ['a system', 'card-provider', 'the system `card-provider`'],
    ['a component', 'checkout', 'the component `checkout`'],
  ])('says what the store acts on: %s', (_what, to, said) => {
    const files = shop({ 'connections/thing.yaml': `from: orders-database\nto: ${to}\n` });
    expect(found(files)).toEqual(['connections/thing.yaml:1:7 error store-acts']);
    expect(messages(files)[0]).toContain(`from the store \`orders-database\` to ${said}, but`);
  });

  it('lets a store act on another store, and anything act on a store', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: orders-database\nto: orders-copy\nname: Copies each order\n' }))).toEqual([]);
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: orders-database\nname: Writes each order\n' }))).toEqual([]);
  });

  it('leaves an end that names nothing, or the wrong kind, to the rule that reports it', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: orders-database\nto: nowhere\n' }))).toEqual(['connections/thing.yaml:2:5 error reference-unknown']);
    expect(found(shop({ 'connections/thing.yaml': 'from: orders-database\nto: go\n' }))).toEqual(['connections/thing.yaml:2:5 error reference-wrong-kind']);
  });

  it('holds for a piece of infrastructure too: a store does not act on one', () => {
    const files = shop({ 'connections/thing.yaml': 'from: orders-database\nto: proxy\n' });
    expect(found(files)).toEqual(['connections/thing.yaml:1:7 error store-acts']);
    expect(messages(files)[0]).toContain('from the store `orders-database` to the piece of infrastructure `proxy`, but');
    expect(found(shop({ 'connections/thing.yaml': 'from: proxy\nto: orders-database\nname: Keeps its sessions\n' }))).toEqual([]);
  });
});

describe('a piece of infrastructure', () => {
  it('may be the end of a connection, for what it does on its own account', () => {
    const files = shop({
      'connections/deploy-reloads-proxy.yaml': 'from: customer\nto: proxy\nname: Reloads it\n',
      'connections/proxy-checks-api.yaml': 'from: proxy\nto: order-api\nname: Checks that it is up\n',
      'connections/proxy-checks-basket.yaml': 'from: proxy\nto: basket\nname: Checks that it is up\n',
    });
    expect(load(files).problems).toEqual([]);
    expect(load(files).model.connections.map((connection) => `${connection.from} ${connection.to}`)).toEqual(['customer proxy', 'proxy order-api', 'proxy basket']);
  });

  it('may be named in `via` beside an app, a component and a system, in the order of travel', () => {
    const files = shop({
      'connections/thing.yaml': 'from: customer\nto: checkout\nvia: [card-provider, proxy, basket]\n',
      'connections/checkout-pays.yaml': 'from: checkout\nto: card-provider\n',
    });
    expect(load(files).problems).toEqual([]);
    expect(load(files).model.connections.find((connection) => connection.id === 'thing')?.via).toEqual(['card-provider', 'proxy', 'basket']);
  });

  it('has the owner it names, and none when it names none and is in no system', () => {
    const owners = load(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nowner: shop-team\n', 'infrastructure/gateway.yaml': 'name: Gateway\n' })).model;
    expect(ownership(owners).get('proxy')).toEqual({ owner: 'shop-team', from: 'proxy' });
    expect(ownership(owners).has('gateway')).toBe(false);
  });

  it("may be in a system, and then has the system's owner when it names none, as an app has", () => {
    const files = shop({
      'infrastructure/ingress.yaml': 'name: Ingress\nin: shop\n',
      'infrastructure/relay.yaml': 'name: Relay\nin: card-provider\n',
      'infrastructure/edge.yaml': 'name: Edge\nin: shop\nowner: edge-team\n',
      'owners/edge-team.yaml': 'name: Edge team\n',
    });
    expect(load(files).problems).toEqual([]);
    const owners = ownership(load(files).model);
    expect(owners.get('ingress')).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(owners.has('relay')).toBe(false);
    expect(owners.get('edge')).toEqual({ owner: 'edge-team', from: 'edge' });
  });

  it('in a system is what an end is in, for `via`: it stands beside a part of the system, not between the system and what calls it', () => {
    const files = shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: shop\n', 'connections/thing.yaml': 'from: customer\nto: shop\nvia: [proxy]\n' });
    expect(found(files)).toEqual(['connections/thing.yaml:3:7 error via-end']);
    expect(messages(files)[0]).toMatch(/^`via` names `proxy`, which is in `shop`, the `to` of this connection\./);
    expect(found(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: shop\n', 'connections/thing.yaml': 'from: customer\nto: storefront\nvia: [proxy]\n' }))).toEqual([]);
  });

  it('holds nothing: no record is in one', () => {
    expect(found(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: shop\n', 'stores/thing.yaml': 'name: Thing\nin: proxy\n' }))).toEqual([
      'stores/thing.yaml:2:5 error reference-wrong-kind',
    ]);
  });
});

describe('a store that an app keeps', () => {
  /** The shop, where the order API keeps an index of its own. */
  const KEPT = { 'stores/index.yaml': 'name: Index\nin: order-api\n' };

  it('is in the app, which breaks no rule', () => {
    expect(load(shop(KEPT)).problems).toEqual([]);
    expect(load(shop(KEPT)).model.stores.find((store) => store.id === 'index')?.in).toBe('order-api');
  });

  it('has the owner of the app, and through it of the system, when it names none', () => {
    expect(ownership(load(shop(KEPT)).model).get('index')).toEqual({ owner: 'shop-team', from: 'shop' });
    const owned = shop({ ...KEPT, 'apps/order-api.yaml': 'name: Order API\nin: shop\nowner: api-team\n', 'owners/api-team.yaml': 'name: API team\n' });
    expect(ownership(load(owned).model).get('index')).toEqual({ owner: 'api-team', from: 'order-api' });
    const own = shop({ 'stores/index.yaml': 'name: Index\nin: order-api\nowner: shop-team\n' });
    expect(ownership(load(own).model).get('index')).toEqual({ owner: 'shop-team', from: 'index' });
  });

  it('is in its app for `via`, so a route through the app that keeps the `to` names what the end is in', () => {
    // A connection from outside the app to what it keeps is doubtful of its own; only the errors are looked at here.
    const errors = (files: SourceFile[]): string[] => found(files).filter((problem) => problem.includes(' error '));
    const files = shop({ ...KEPT, 'connections/thing.yaml': 'from: storefront\nto: index\nvia: [order-api]\n' });
    expect(errors(files)).toEqual(['connections/thing.yaml:3:7 error via-end']);
    expect(load(files).problems.find((problem) => problem.code === 'via-end')?.message).toMatch(/^`via` names `order-api`, which `index`, the `to` of this connection, is in\./);
    // And the system the app is in, two levels up.
    expect(errors(shop({ ...KEPT, 'connections/thing.yaml': 'from: customer\nto: index\nvia: [shop]\n' }))).toEqual(['connections/thing.yaml:3:7 error via-end']);
  });

  it('is beneath its app for a connection higher up that says the same', () => {
    const files = shop({
      ...KEPT,
      'connections/checkout-indexes.yaml': 'from: checkout\nto: index\nname: Indexes each order\n',
      'connections/api-indexes.yaml': 'from: checkout\nto: order-api\nname: Indexes each order\n',
    });
    expect(found(files)).toEqual(['connections/api-indexes.yaml:1:1 warning connection-repeated-above']);
  });

  it('is work of its app, so an app that keeps a store some connection ends at does more than pass on', () => {
    expect(
      found(
        shop({
          'apps/gateway.yaml': 'name: Gateway\nin: shop\n',
          'stores/routes.yaml': 'name: Routes\nin: gateway\n',
          'connections/customer-buys.yaml': 'from: customer\nto: checkout\nvia: [gateway]\n',
          'connections/routes-copy.yaml': 'from: routes\nto: routes\nname: Copies itself to each copy of the gateway\n',
        }),
      ),
    ).toEqual([]);
  });
});

describe('what a connection passes through', () => {
  /** What a connection passes through stands between its two ends: said in each message of `via-end`. */
  const between = 'What a connection passes through stands between its two ends.';

  /** How each message of `via-end` says to take an id out, and what to do when that empties the list. */
  const takeOut = (id: string): string => `Take \`${id}\` out of \`via\`. If nothing is left in the list, take the \`via\` key out too.`;

  /** The shop, where the storefront has work of its own, with this connection. */
  const route = (text: string): SourceFile[] =>
    shop({ 'connections/customer-shops.yaml': 'from: customer\nto: storefront\nname: Shops\n', 'connections/thing.yaml': text });

  it.each([
    ['its `from`', 'from: storefront\nto: card-provider\nvia: [proxy, storefront]\n', '3:14', `\`via\` names \`storefront\`, which is the \`from\` of this connection. ${between} ${takeOut('storefront')}`],
    ['its `to`', 'from: customer\nto: card-provider\nvia: [card-provider]\n', '3:7', `\`via\` names \`card-provider\`, which is the \`to\` of this connection. ${between} ${takeOut('card-provider')}`],
    [
      'the app its `to` is in',
      'from: storefront\nto: checkout\nvia: [order-api]\n',
      '3:7',
      `\`via\` names \`order-api\`, which \`checkout\`, the \`to\` of this connection, is in. ${between} ${takeOut('order-api')}`,
    ],
    [
      'the system its `from` is in, two levels up',
      'from: basket\nto: card-provider\nvia: [shop]\n',
      '3:7',
      `\`via\` names \`shop\`, which \`basket\`, the \`from\` of this connection, is in. ${between} ${takeOut('shop')}`,
    ],
    [
      'what is in its `to`',
      'from: customer\nto: shop\nvia: [proxy, storefront]\n',
      '3:14',
      `\`via\` names \`storefront\`, which is in \`shop\`, the \`to\` of this connection. ${between} ${takeOut('storefront')} ` +
        'Or, if the exchange goes on past it, make the part of `shop` that it ends at the `to`.',
    ],
    [
      'what is in its `from`, two levels down',
      'from: shop\nto: card-provider\nvia: [checkout]\n',
      '3:7',
      `\`via\` names \`checkout\`, which is in \`shop\`, the \`from\` of this connection. ${between} ${takeOut('checkout')} ` +
        'Or, if the exchange starts before it, make the part of `shop` that it starts at the `from`.',
    ],
  ])('is an error at the id when `via` names %s', (_what, text, place, message) => {
    const files = route(text);
    expect(found(files)).toEqual([`connections/thing.yaml:${place} error via-end`]);
    expect(messages(files)).toEqual([message]);
  });

  it('reports each id that is wrong, and an id that is an end and in the other end once', () => {
    expect(found(route('from: checkout\nto: storefront\nvia: [order-api, proxy, basket]\n'))).toEqual([
      'connections/thing.yaml:3:7 error via-end',
      'connections/thing.yaml:3:25 error via-end',
    ]);
    // `order-api` is what the `from` is in, and the connection goes from a part of it to itself.
    expect(messages(route('from: checkout\nto: order-api\nvia: [order-api]\n'))).toEqual([
      `\`via\` names \`order-api\`, which \`checkout\`, the \`from\` of this connection, is in. ${between} ${takeOut('order-api')}`,
    ]);
  });

  it('is mended as its message says, also when the id was the only one in the list', () => {
    // Taking the one id out leaves an empty list, an error of its own; taking the key out too leaves none.
    expect(found(route('from: customer\nto: card-provider\nvia: []\n'))).toEqual(['connections/thing.yaml:3:6 error value-too-small']);
    expect(found(route('from: customer\nto: card-provider\n'))).toEqual([]);
    expect(found(route('from: customer\nto: card-provider\nvia: [proxy]\n'))).toEqual([]);
  });

  it('lets a connection pass through what is beside its ends, in the same system or not', () => {
    expect(found(route('from: basket\nto: checkout\nvia: [proxy]\n'))).toEqual([]);
    expect(found(route('from: customer\nto: checkout\nvia: [storefront, basket]\n'))).toEqual([]);
  });

  it('leaves an id that names nothing, or a record `via` may not name, to the rule that reports it', () => {
    expect(found(route('from: customer\nto: orders-database\nvia: [orders-database]\n'))).toEqual(['connections/thing.yaml:3:7 error reference-wrong-kind']);
    expect(found(route('from: customer\nto: nowhere\nvia: [nowhere]\n'))).toEqual([
      'connections/thing.yaml:2:5 error reference-unknown',
      'connections/thing.yaml:3:7 error reference-unknown',
    ]);
  });

  it('leaves the connection out of the model', () => {
    expect(load(route('from: customer\nto: card-provider\nvia: [card-provider]\n')).model.connections.map((connection) => connection.id)).toEqual(['customer-shops']);
  });
});

describe('a message broker drawn as one store', () => {
  /** A shop with a store named as its technology is, and a connection to it. */
  const broker = (store: string): SourceFile[] =>
    shop({
      'stores/events.yaml': store,
      'technologies/kafka.yaml': 'name: Kafka\n',
      'connections/api-writes-events.yaml': 'from: order-api\nto: events\nname: Puts each order\n',
    });

  /** What each message of `broker-as-store` advises, after what it compared. */
  const advice =
    'A broker is a technology. Each queue or topic in it is a store of its own, of kind `queue` or `topic`, with the broker as its `technology`: ' +
    'write one for each that the facts tell apart. A connection that puts a message in or takes one out then goes to the queue or topic it uses. ' +
    'One that manages the broker itself, such as one that creates topics, stays with what is left, named for what it holds.';

  it('is a warning on the store, which says the two names it compared and what to do', () => {
    expect(load(broker('name: Kafka\nin: shop\ntechnology: [go, kafka]\n')).problems).toEqual([
      {
        file: 'stores/events.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'broker-as-store',
        message:
          'This store\'s `name`, "Kafka", is the `name` of `kafka`, a technology it names, and it has no `kind`: it may be a message broker drawn as one store. ' +
          `${advice} If this store is no broker, name it for what it holds and give it its \`kind\`.`,
      },
    ]);
  });

  it.each(['queue', 'topic'])('is one for a store of kind %s too, and says so, asking for no kind it has', (kind) => {
    const problems = load(broker(`name: Kafka\nin: shop\nkind: ${kind}\ntechnology: [kafka]\n`)).problems;
    expect(problems.map((problem) => problem.code)).toEqual(['broker-as-store']);
    expect(problems[0]?.message).toContain(`a technology it names, and it is of kind \`${kind}\`: it may be`);
    expect(problems[0]?.message).toMatch(/If this store is no broker, name it for what it holds\.$/);
  });

  it('reads the name in any case and with any spaces between its words, shows both names, and keeps the store in the model', () => {
    const files = shop({ 'stores/events.yaml': 'name: apache  KAFKA\nin: shop\ntechnology: [kafka, go]\n', 'technologies/kafka.yaml': 'name: Apache Kafka\n' });
    const loaded = load(files);
    expect(found(files)).toEqual(['stores/events.yaml:1:1 warning broker-as-store']);
    expect(loaded.problems[0]?.message).toMatch(/^This store's `name`, "apache {2}KAFKA", is the `name` of `kafka`, "Apache Kafka", a technology it names, and it has no `kind`/);
    expect(loaded.model.stores.map((store) => store.id)).toContain('events');
  });

  it.each([
    ['a store of another kind, such as a database named for its product', 'name: Kafka\nin: shop\nkind: database\ntechnology: [kafka]\n'],
    ['a topic named for what it holds', 'name: Order events\nin: shop\nkind: topic\ntechnology: [kafka]\n'],
    ['a store named for a technology it does not name', 'name: Kafka\nin: shop\n'],
    ['a store whose name holds more than the technology', 'name: Kafka cluster\nin: shop\ntechnology: [kafka]\n'],
  ])('is not one for %s', (_what, store) => {
    expect(load(broker(store)).problems).toEqual([]);
  });
});

describe('an app or a system that only passes exchanges on', () => {
  /** The shop with a gateway app that two connections pass through. */
  const GATEWAY = {
    'apps/gateway.yaml': 'name: Gateway\nin: shop\n',
    'connections/customer-buys.yaml': 'from: customer\nto: checkout\nvia: [gateway]\nname: Buys\n',
    'connections/basket-pays.yaml': 'from: basket\nto: card-provider\nvia: [proxy, gateway]\nname: Pays\n',
  };

  /** The words of each message of `passes-on-only`: what it saw, then the question, then what moving it means. */
  const saw = (n: string, noun: string): string =>
    `${n} this ${noun} in \`via\`, and no connection starts or ends at it or at anything in it. ` +
    `Does passing exchanges on account for everything this ${noun} does? If so, it is a piece of infrastructure, a record in \`infrastructure/\`, ` +
    'which holds nothing.';
  const ends = 'If it has work of its own, a connection for that work ends the warning.';

  /** The shop with a system that one connection passes through, as written here, and an app in it. */
  const edge = (system: string): SourceFile[] =>
    shop({
      'systems/edge.yaml': system,
      'apps/edge-worker.yaml': 'name: Edge worker\nin: edge\n',
      'connections/customer-buys.yaml': 'from: customer\nto: storefront\nvia: [edge]\n',
    });

  it('is a warning on the app, which says what it saw, asks, and says that it may keep its `in`, since a piece may be in a system', () => {
    expect(load(shop(GATEWAY)).problems).toEqual([
      {
        file: 'apps/gateway.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'passes-on-only',
        message: `${saw('2 connections name', 'app')} It may keep \`in: shop\` there. ${ends}`,
      },
    ]);
    // An owner of its own goes with it too, since a piece of infrastructure may have one.
    expect(messages(shop({ ...GATEWAY, 'apps/gateway.yaml': 'name: Gateway\nin: shop\nowner: shop-team\n' }))).toEqual([
      `${saw('2 connections name', 'app')} It may keep \`in: shop\` there. ${ends}`,
    ]);
  });

  it('is mended as its message says: moved with its `in`, the piece is in the system and has its owner', () => {
    const moved = shop({ ...GATEWAY, 'apps/gateway.yaml': null, 'infrastructure/gateway.yaml': 'name: Gateway\nin: shop\n' });
    expect(load(moved).problems).toEqual([]);
    expect(ownership(load(moved).model).get('gateway')).toEqual({ owner: 'shop-team', from: 'shop' });
  });

  it('says of an app with a `kind` that it comes out, and is mended as it says', () => {
    const kinded = { ...GATEWAY, 'apps/gateway.yaml': 'name: Gateway\nin: shop\nkind: service\n' };
    expect(messages(shop(kinded))).toEqual([
      `${saw('2 connections name', 'app')} It may keep \`in: shop\` there. Its \`kind\` comes out, since a piece of infrastructure has none. ${ends}`,
    ]);
    const moved = (text: string): SourceFile[] => shop({ ...kinded, 'apps/gateway.yaml': null, 'infrastructure/gateway.yaml': text });
    expect(found(moved('name: Gateway\nin: shop\n'))).toEqual([]);
    expect(found(moved('name: Gateway\nin: shop\nkind: service\n'))).toEqual(['infrastructure/gateway.yaml:3:1 error key-unknown']);
  });

  it('says of an app that keeps a store and has nothing else that the store has to go elsewhere first', () => {
    const files = shop({ ...GATEWAY, 'stores/routes.yaml': 'name: Routes\nin: gateway\n' });
    expect(messages(files)).toEqual([
      `${saw('2 connections name', 'app')} To move it there, what is in it has to go elsewhere first. It may keep \`in: shop\` there. ${ends}`,
    ]);
  });

  it('is one for a system, and says that what is in it has to go elsewhere first, and then no longer takes its owner', () => {
    const problems = load(edge('name: Edge\n')).problems;
    expect(problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['systems/edge.yaml passes-on-only']);
    expect(problems[0]?.message).toBe(`${saw('1 connection names', 'system')} To move it there, what is in it has to go elsewhere first. ${ends}`);
    expect(messages(edge('name: Edge\nowner: shop-team\n'))).toEqual([
      `${saw('1 connection names', 'system')} To move it there, what is in it has to go elsewhere first, and its parts then no longer take its owner. ${ends}`,
    ]);
  });

  it('says of an external system that its mark does not go with it', () => {
    expect(messages(shop({ 'systems/card-provider.yaml': 'name: Card provider\nexternal: true\n', 'connections/customer-buys.yaml': 'from: customer\nto: storefront\nvia: [card-provider]\n' }))).toEqual([
      `${saw('1 connection names', 'system')} Its \`external\` mark does not go with it. ${ends}`,
    ]);
  });

  it('counts only the connections of the model: one with an error neither ends the warning nor raises one', () => {
    // A connection to nothing would end at the gateway, and one through the edge goes to nothing.
    const files = shop({
      ...GATEWAY,
      'connections/gateway-calls.yaml': 'from: gateway\nto: nowhere\n',
      'connections/customer-goes.yaml': 'from: customer\nto: nowhere\nvia: [edge, gateway]\n',
      'systems/edge.yaml': 'name: Edge\n',
    });
    expect(found(files)).toEqual([
      'apps/gateway.yaml:1:1 warning passes-on-only',
      'connections/customer-goes.yaml:2:5 error reference-unknown',
      'connections/gateway-calls.yaml:2:5 error reference-unknown',
    ]);
    expect(load(files).problems[0]?.message).toMatch(/^2 connections name this app in `via`/);
  });

  it('is not one for an app with work of its own, at either end, or through anything in it', () => {
    expect(found(shop({ ...GATEWAY, 'connections/gateway-logs.yaml': 'from: gateway\nto: orders-database\nname: Logs each request\n' }))).toEqual([]);
    expect(found(shop({ ...GATEWAY, 'connections/clerk-asks.yaml': 'from: customer\nto: gateway\nname: Asks how it is\n' }))).toEqual([]);
    expect(found(shop({ ...GATEWAY, 'components/router.yaml': 'name: Router\nin: gateway\n', 'connections/router-reads.yaml': 'from: router\nto: orders-database\n' }))).toEqual(
      [],
    );
  });

  it('is not one for a component or a piece of infrastructure, which may only pass on', () => {
    expect(found(shop({ 'components/router.yaml': 'name: Router\nin: order-api\n', 'connections/customer-buys.yaml': 'from: customer\nto: checkout\nvia: [router]\n' }))).toEqual(
      [],
    );
    expect(found(shop({ 'connections/customer-buys.yaml': 'from: customer\nto: checkout\nvia: [proxy]\n' }))).toEqual([]);
  });
});

describe('two connections that say the same', () => {
  /** What to do, said after the files: a way or a purpose of its own is not thrown away. */
  const either =
    'If these are the same exchange, keep one. If they are two ways of one exchange, give each its route in `via`, or say in `only` when each is taken. ' +
    'If their purposes differ, give each a name that says which.';

  it('are reported on each, naming the other, as a warning', () => {
    const files = shop({
      'connections/writes.yaml': 'from: checkout\nto: orders-database\nname: Writes each order\n',
      'connections/writes-again.yaml': 'from: checkout\nto: orders-database\nname: Writes each order\ntechnology: [go]\n',
    });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/writes-again.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'connection-twice',
        message: `This connection has the same \`from\`, \`to\` and \`name\` as \`connections/writes.yaml\`. ${either}`,
      },
      {
        file: 'connections/writes.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'connection-twice',
        message: `This connection has the same \`from\`, \`to\` and \`name\` as \`connections/writes-again.yaml\`. ${either}`,
      },
    ]);
  });

  it('names every other one when there are more than two', () => {
    const same = 'from: checkout\nto: orders-database\nname: Writes each order\n';
    const files = shop({ 'connections/a.yaml': same, 'connections/b.yaml': same, 'connections/c.yaml': same });
    expect(messages(files)[1]).toBe(`This connection has the same \`from\`, \`to\` and \`name\` as \`connections/a.yaml\` and \`connections/c.yaml\`. ${either}`);
  });

  it('are not the same when a name differs, even in case, or when either has none', () => {
    const write = (name: string) => `from: checkout\nto: orders-database${name}\n`;
    expect(found(shop({ 'connections/a.yaml': write('\nname: Writes each order'), 'connections/b.yaml': write('\nname: Writes each Order') }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': write('\nname: Writes each order'), 'connections/b.yaml': write('') }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': write(''), 'connections/b.yaml': write('') }))).toEqual([]);
  });

  it('are not the same when they go the other way', () => {
    expect(found(shop({ 'connections/a.yaml': 'from: order-api\nto: storefront\nname: Talks\n', 'connections/b.yaml': 'from: storefront\nto: order-api\nname: Talks\n' }))).toEqual(
      [],
    );
  });
});

describe('a connection that says a level up what another says', () => {
  const lower = { 'connections/checkout-pays.yaml': 'from: checkout\nto: card-provider\nname: Takes the payment\n' };

  it('is reported on the upper one, naming the lower file, as a warning', () => {
    const files = shop({ ...lower, 'connections/api-pays.yaml': 'from: order-api\nto: card-provider\nname: Takes the payment\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/api-pays.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'connection-repeated-above',
        message:
          'This connection says in the same words, higher up, what `connections/checkout-pays.yaml` says. ' +
          'A connection higher up is a summary: give it a name that says more than the ones beneath it, or remove it.',
      },
    ]);
  });

  it('follows `in` upwards, from a component to its app and on to its system', () => {
    const files = shop({ ...lower, 'connections/shop-pays.yaml': 'from: shop\nto: card-provider\nname: Takes the payment\n' });
    expect(found(files)).toEqual(['connections/shop-pays.yaml:1:1 warning connection-repeated-above']);
    // Two levels up is not "a level up".
    expect(messages(files)[0]).toMatch(/^This connection says in the same words, higher up, what /);
  });

  it('looks at both ends, and at the far end as well as the near one', () => {
    const files = shop({
      'connections/basket-checks-out.yaml': 'from: basket\nto: checkout\nname: Checks out\n',
      'connections/front-checks-out.yaml': 'from: storefront\nto: order-api\nname: Checks out\n',
      'connections/front-to-checkout.yaml': 'from: storefront\nto: checkout\nname: Checks out\n',
      'connections/basket-to-shop.yaml': 'from: basket\nto: shop\nname: Checks out\n',
    });
    expect(found(files)).toEqual([
      'connections/basket-to-shop.yaml:1:1 warning connection-repeated-above',
      'connections/front-checks-out.yaml:1:1 warning connection-repeated-above',
      'connections/front-to-checkout.yaml:1:1 warning connection-repeated-above',
    ]);
    // `front-checks-out` sums up both the one beneath it at one end and the one beneath it at both.
    expect(messages(files)[1]).toContain('what `connections/basket-checks-out.yaml` and `connections/front-to-checkout.yaml` say.');
  });

  it('is a summary worth having when its name says more, and says nothing when it goes the other way', () => {
    expect(found(shop({ ...lower, 'connections/api-pays.yaml': 'from: order-api\nto: card-provider\nname: Takes the payment for an order\n' }))).toEqual([]);
    expect(found(shop({ ...lower, 'connections/back.yaml': 'from: card-provider\nto: order-api\nname: Takes the payment\n' }))).toEqual([]);
  });

  it('is not one where one end is beside the lower one, not above it', () => {
    expect(found(shop({ ...lower, 'connections/front-pays.yaml': 'from: storefront\nto: card-provider\nname: Takes the payment\n' }))).toEqual([]);
  });

  it('needs a name on both', () => {
    expect(found(shop({ 'connections/checkout-pays.yaml': 'from: checkout\nto: card-provider\n', 'connections/api-pays.yaml': 'from: order-api\nto: card-provider\n' }))).toEqual(
      [],
    );
  });
});

describe('the model', () => {
  it('leaves out a record with an error in its own file, and keeps one with a warning', () => {
    const loaded = load(
      shop({
        'apps/thing.yaml': 'name: Thing\nin: orders-database\n',
        'connections/backwards.yaml': 'from: orders-database\nto: order-api\n',
        'connections/writes.yaml': 'from: checkout\nto: orders-database\nname: Writes\n',
        'connections/writes-again.yaml': 'from: checkout\nto: orders-database\nname: Writes\n',
      }),
    );
    expect(loaded.model.apps.map((app) => app.id)).toEqual(['order-api', 'storefront']);
    expect(loaded.model.connections.map((connection) => connection.id)).toEqual(['writes', 'writes-again']);
    expect(loaded.records.map((record) => record.id)).toContain('thing');
  });

  it('keeps a record that names one whose file is broken', () => {
    const loaded = load(shop({ 'systems/shop.yaml': 'name: [\n' }));
    expect(loaded.model.systems.map((system) => system.id)).toEqual(['card-provider']);
    expect(loaded.model.apps.map((app) => app.id)).toEqual(['order-api', 'storefront']);
    expect(loaded.unread).toEqual([{ id: 'shop', family: 'systems', file: 'systems/shop.yaml' }]);
  });
});

describe('what a connection does to a store, and who opened its channel', () => {
  it('reports `access` on a connection that does not end at a store, once, at its value', () => {
    const files = shop({ 'connections/thing.yaml': 'from: storefront\nto: order-api\naccess: read\nname: Reads the orders\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/thing.yaml',
        line: 3,
        column: 9,
        severity: 'error',
        code: 'access-not-store',
        message:
          '`access` says what a connection does to the data of the store it ends at, and this connection ends at the app `order-api`. ' +
          'If it reads or writes a store, make that store its `to`. If not, take `access` out, and let the name say what it asks for or sends.',
      },
    ]);
    expect(load(files).model.connections.map((connection) => connection.id)).not.toContain('thing');
  });

  it.each([
    ['a person', 'customer', 'the person `customer`'],
    ['a system', 'card-provider', 'the system `card-provider`'],
    ['a component', 'checkout', 'the component `checkout`'],
    ['a piece of infrastructure', 'proxy', 'the piece of infrastructure `proxy`'],
  ])('says what it ends at when that is %s', (_what, to, said) => {
    const files = shop({ 'connections/thing.yaml': `from: storefront\nto: ${to}\naccess: write\n` });
    expect(found(files)).toEqual(['connections/thing.yaml:3:9 error access-not-store']);
    expect(messages(files)[0]).toContain(`and this connection ends at ${said}. `);
  });

  it('lets `access` stand on a connection to a store, also one that an app keeps or whose file has an error', () => {
    for (const access of ['read', 'write', 'read-write']) {
      expect(found(shop({ 'connections/thing.yaml': `from: checkout\nto: orders-database\naccess: ${access}\n` }))).toEqual([]);
    }
    const kept = shop({ 'stores/index.yaml': 'name: Index\nin: order-api\n', 'connections/thing.yaml': 'from: checkout\nto: index\naccess: read-write\n' });
    expect(found(kept)).toEqual([]);
    expect(found(shop({ 'stores/orders-database.yaml': 'name: [Orders\n', 'connections/thing.yaml': 'from: checkout\nto: orders-database\naccess: read\n' }))).toEqual([
      'stores/orders-database.yaml:1:7 error yaml-syntax',
    ]);
  });

  it('reports `opens` on a connection that ends at a store, once, at its value', () => {
    const files = shop({ 'connections/thing.yaml': 'from: checkout\nto: orders-database\nopens: to\nname: Writes each order\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/thing.yaml',
        line: 3,
        column: 8,
        severity: 'error',
        code: 'opens-at-store',
        message:
          '`opens: to` says that the far side opened the channel this exchange travels down, and this connection ends at the store `orders-database`. ' +
          'A store opens nothing. Take `opens` out.',
      },
    ]);
  });

  it('lets `opens` stand on a connection to anything but a store, a piece of infrastructure too', () => {
    for (const to of ['customer', 'card-provider', 'storefront', 'basket', 'proxy']) {
      expect(found(shop({ 'connections/thing.yaml': `from: order-api\nto: ${to}\nopens: to\nname: Says what is new\n` }))).toEqual([]);
    }
  });

  it('reports each of the two where it is wrong, and only that one, when a connection has both', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: order-api\nopens: to\naccess: read\n' }))).toEqual([
      'connections/thing.yaml:4:9 error access-not-store',
    ]);
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: orders-database\nopens: to\naccess: read\n' }))).toEqual([
      'connections/thing.yaml:3:8 error opens-at-store',
    ]);
  });

  it('says nothing more of a `to` that names no record or the wrong kind, nor of a value that is not allowed', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: nowhere\naccess: read\n' }))).toEqual(['connections/thing.yaml:2:5 error reference-unknown']);
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: go\naccess: read\n' }))).toEqual(['connections/thing.yaml:2:5 error reference-wrong-kind']);
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: order-api\naccess: reads\n' }))).toEqual(['connections/thing.yaml:3:9 error value-not-allowed']);
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: orders-database\nopens: from\n' }))).toEqual(['connections/thing.yaml:3:8 error value-not-allowed']);
  });

  it('is reported beside another slip in the same file, so that one does not hide the other', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: checkout\nto: order-api\naccess: read\ncolour: blue\n' }))).toEqual([
      'connections/thing.yaml:3:9 error access-not-store',
      'connections/thing.yaml:4:1 error key-unknown',
    ]);
  });
});

describe('a connection to a store that an app keeps', () => {
  /** The shop, where the order API keeps an index and a log of its own. */
  const KEPT = { 'stores/index.yaml': 'name: Index\nin: order-api\n', 'stores/log.yaml': 'name: Log\nin: order-api\n' };

  it('is a warning when it comes from outside the app, at the end that names the store, saying the two ways out', () => {
    const files = shop({ ...KEPT, 'connections/thing.yaml': 'from: storefront\nto: index\nname: Looks up an order\n' });
    expect(load(files).problems).toEqual([
      {
        file: 'connections/thing.yaml',
        line: 2,
        column: 5,
        severity: 'warning',
        code: 'kept-store-reached',
        message:
          'This connection goes from the app `storefront` to the store `index`, which the app `order-api` keeps. ' +
          'Nothing reaches a store that an app keeps but through that app, so one of two things may be so. ' +
          "The store is not `order-api`'s alone: then it is in the system, `in: shop`. " +
          'Or the exchange is with `order-api`, which reads or writes the store in turn: then the connection ends at `order-api`.',
      },
    ]);
    expect(load(files).model.connections.map((connection) => connection.id)).toContain('thing');
  });

  it('is mended either way its message says', () => {
    const reached = { ...KEPT, 'connections/thing.yaml': 'from: storefront\nto: index\nname: Looks up an order\n' };
    expect(found(shop({ ...reached, 'stores/index.yaml': 'name: Index\nin: shop\n' }))).toEqual([]);
    expect(found(shop({ ...reached, 'connections/thing.yaml': 'from: storefront\nto: order-api\nname: Looks up an order\n' }))).toEqual([]);
  });

  it('is not one from inside the app: the app, a component in it, or another store it keeps', () => {
    for (const from of ['order-api', 'checkout', 'log']) {
      expect(found(shop({ ...KEPT, 'connections/thing.yaml': `from: ${from}\nto: index\nname: Keeps it\n` }))).toEqual([]);
    }
    expect(found(shop({ ...KEPT, 'connections/thing.yaml': 'from: index\nto: index\nname: Copies itself to each copy\n' }))).toEqual([]);
  });

  it.each([
    ['a person', 'customer', 'the person `customer`'],
    ['the system the app is in', 'shop', 'the system `shop`'],
    ['a component of another app', 'basket', 'the component `basket`'],
    ['a piece of infrastructure in the same system', 'ingress', 'the piece of infrastructure `ingress`'],
  ])('is one from %s', (_what, from, said) => {
    const files = shop({ ...KEPT, 'infrastructure/ingress.yaml': 'name: Ingress\nin: shop\n', 'connections/thing.yaml': `from: ${from}\nto: index\n` });
    expect(found(files)).toEqual(['connections/thing.yaml:2:5 warning kept-store-reached']);
    expect(messages(files)[0]?.startsWith(`This connection goes from ${said} to the store \`index\`, which`)).toBe(true);
  });

  it('is one when the kept store acts on a store outside the app, at its `from`, and asks whether the app makes the exchange', () => {
    const files = shop({ ...KEPT, 'connections/thing.yaml': 'from: index\nto: orders-copy\nname: Copies each order\n' });
    expect(found(files)).toEqual(['connections/thing.yaml:1:7 warning kept-store-reached']);
    expect(messages(files)[0]).toBe(
      'This connection goes from the store `index`, which the app `order-api` keeps, to the store `orders-copy`. ' +
        'Nothing reaches a store that an app keeps but through that app, so one of two things may be so. ' +
        "The store `index` is not `order-api`'s alone: then it is in the system, `in: shop`. " +
        'Or `order-api` makes this exchange, and reads `index` for it: then the connection starts at `order-api`.',
    );
  });

  it('is one for each connection, at its `to`, when both ends are stores that two apps keep', () => {
    const files = shop({ ...KEPT, 'stores/drafts.yaml': 'name: Drafts\nin: storefront\n', 'connections/thing.yaml': 'from: drafts\nto: index\n' });
    expect(found(files)).toEqual(['connections/thing.yaml:2:5 warning kept-store-reached']);
  });
});

describe('the ways out that the warning on a kept store offers', () => {
  /** The shop, where the order API keeps an index of its own. */
  const KEPT = { 'stores/index.yaml': 'name: Index\nin: order-api\n' };

  /** Every problem of the shop with these files, which a way out must leave with none. */
  const after = (files: Record<string, string | null>): string[] => found(shop({ ...KEPT, ...files }));

  it('says that `access` comes off when the connection is to end at the app, and each way out leaves the model sound', () => {
    const reached = { 'connections/thing.yaml': 'from: storefront\nto: index\naccess: read\nname: Looks up an order\n' };
    expect(messages(shop({ ...KEPT, ...reached }))).toEqual([
      'This connection goes from the app `storefront` to the store `index`, which the app `order-api` keeps. ' +
        'Nothing reaches a store that an app keeps but through that app, so one of two things may be so. ' +
        "The store is not `order-api`'s alone: then it is in the system, `in: shop`. " +
        'Or the exchange is with `order-api`, which reads or writes the store in turn: then the connection ends at `order-api`, ' +
        'and `access` comes off, since it no longer ends at a store.',
    ]);
    expect(after({ ...reached, 'stores/index.yaml': 'name: Index\nin: shop\n' })).toEqual([]);
    expect(after({ 'connections/thing.yaml': 'from: storefront\nto: order-api\nname: Looks up an order\n' })).toEqual([]);
    // The edit the message warned of: a new end alone, with `access` left in.
    expect(after({ 'connections/thing.yaml': 'from: storefront\nto: order-api\naccess: read\nname: Looks up an order\n' })).toEqual([
      'connections/thing.yaml:3:9 error access-not-store',
    ]);
  });

  it('turns round a connection from a store in a system, never making a store act on the app, and each way out leaves the model sound', () => {
    const reached = { 'connections/thing.yaml': 'from: orders-database\nto: index\naccess: write\nname: Copies each order\n' };
    expect(messages(shop({ ...KEPT, ...reached }))).toEqual([
      'This connection goes from the store `orders-database` to the store `index`, which the app `order-api` keeps. ' +
        'Nothing reaches a store that an app keeps but through that app, so one of two things may be so. ' +
        "The store `index` is not `order-api`'s alone: then it is in the system, `in: shop`. " +
        'Or `order-api` takes what it keeps from `orders-database`: then the connection goes from `order-api` to `orders-database`, ' +
        'and its name and its `access` say what `order-api` does there.',
    ]);
    expect(after({ ...reached, 'stores/index.yaml': 'name: Index\nin: shop\n' })).toEqual([]);
    expect(after({ 'connections/thing.yaml': 'from: order-api\nto: orders-database\naccess: read\nname: Reads each order to keep it\n' })).toEqual([]);
    // With no `access`, the name alone is to say it.
    expect(messages(shop({ ...KEPT, 'connections/thing.yaml': 'from: orders-database\nto: index\n' }))[0]).toMatch(
      /then the connection goes from `order-api` to `orders-database`, and its name says what `order-api` does there\.$/,
    );
    // The edit the message no longer offers: the app in the place of the kept store.
    expect(after({ 'connections/thing.yaml': 'from: orders-database\nto: order-api\nname: Copies each order\n' })).toEqual(['connections/thing.yaml:1:7 error store-acts']);
  });

  it('says that a connection whose route passes through a part of the keeping app ends at that part, and the edit leaves the model sound', () => {
    const routed = { 'connections/thing.yaml': 'from: storefront\nto: index\nvia: [proxy, checkout]\naccess: write\nname: Adds an order\n' };
    expect(messages(shop({ ...KEPT, ...routed }))).toEqual([
      'This connection goes from the app `storefront` to the store `index`, which the app `order-api` keeps, and passes through `checkout`, which is in `order-api`. ' +
        'Then the exchange is with `checkout`, which reads or writes the store in turn: the connection ends at `checkout`, with `via: [proxy]`, ' +
        'and `access` comes off, since it no longer ends at a store.',
    ]);
    expect(after({ 'connections/thing.yaml': 'from: storefront\nto: checkout\nvia: [proxy]\nname: Adds an order\n' })).toEqual([]);
    // With nothing else on the way, `via` goes.
    const alone = shop({ ...KEPT, 'connections/thing.yaml': 'from: storefront\nto: index\nvia: [checkout]\n' });
    expect(messages(alone)[0]).toMatch(/the connection ends at `checkout`, with no `via`\.$/);
    expect(after({ 'connections/thing.yaml': 'from: storefront\nto: checkout\n' })).toEqual([]);
  });

  it('turns a connection from a store in a system through a part of the keeping app round, its route with it', () => {
    const routed = { 'connections/thing.yaml': 'from: orders-database\nto: index\nvia: [proxy, checkout]\n' };
    expect(messages(shop({ ...KEPT, ...routed }))[0]).toMatch(
      /Then `checkout` takes what it keeps from `orders-database`: the connection goes from `checkout` to `orders-database`, with `via: \[proxy\]`, and its name says what `checkout` does there\.$/,
    );
    expect(after({ 'connections/thing.yaml': 'from: checkout\nto: orders-database\nvia: [proxy]\nname: Reads the orders to index them\n' })).toEqual([]);
  });

  it('leaves the model sound either way when the kept store acts on a store outside', () => {
    const reached = { 'connections/thing.yaml': 'from: index\nto: orders-copy\naccess: write\nname: Copies each order\n' };
    expect(found(shop({ ...KEPT, ...reached }))).toEqual(['connections/thing.yaml:1:7 warning kept-store-reached']);
    expect(after({ ...reached, 'stores/index.yaml': 'name: Index\nin: shop\n' })).toEqual([]);
    expect(after({ 'connections/thing.yaml': 'from: order-api\nto: orders-copy\naccess: write\nname: Copies each order\n' })).toEqual([]);
  });

  it('names both keepers when each end is a store an app of its own keeps, asks which records exchange the data, and each way out leaves the model sound', () => {
    const two = { 'stores/drafts.yaml': 'name: Drafts\nin: storefront\n', 'connections/thing.yaml': 'from: drafts\nto: index\naccess: write\nname: Copies each draft\n' };
    expect(messages(shop({ ...KEPT, ...two }))).toEqual([
      'This connection goes from the store `drafts`, which the app `storefront` keeps, to the store `index`, which the app `order-api` keeps. ' +
        'Nothing reaches a store that an app keeps but through that app, so which records exchange the data? ' +
        'If the apps do, `storefront` sending what is in its store and `order-api` keeping it in its own: then the connection goes from `storefront` to `order-api`, ' +
        'and `access` comes off, since it no longer ends at a store. ' +
        "If the stores do, with neither app between: then neither is its app's alone, and both are in the system, `in: shop`.",
    ]);
    expect(after({ ...two, 'connections/thing.yaml': 'from: storefront\nto: order-api\nname: Copies each draft\n' })).toEqual([]);
    expect(after({ ...two, 'stores/drafts.yaml': 'name: Drafts\nin: shop\n', 'stores/index.yaml': 'name: Index\nin: shop\n' })).toEqual([]);
    // The two edits the warning no longer offers: a new end in place of a store, and one store moved alone.
    expect(after({ ...two, 'connections/thing.yaml': 'from: drafts\nto: order-api\naccess: write\n' })).toEqual([
      'connections/thing.yaml:1:7 error store-acts',
      'connections/thing.yaml:3:9 error access-not-store',
    ]);
    expect(after({ ...two, 'stores/index.yaml': 'name: Index\nin: shop\n' })).toEqual(['connections/thing.yaml:1:7 warning kept-store-reached']);
  });

  it('names the system of each app when the two keepers are in two systems', () => {
    const files = shop({
      ...KEPT,
      'apps/card-api.yaml': 'name: Card API\nin: card-provider\n',
      'stores/cards.yaml': 'name: Cards\nin: card-api\n',
      'connections/thing.yaml': 'from: cards\nto: index\n',
    });
    expect(messages(files)[0]).toMatch(
      /then the connection goes from `card-api` to `order-api`\. If the stores do, with neither app between: then neither is its app's alone, and each is in the system of its app, `in: card-provider` for `cards` and `in: shop` for `index`\.$/,
    );
    expect(after({ 'apps/card-api.yaml': 'name: Card API\nin: card-provider\n', 'stores/cards.yaml': 'name: Cards\nin: card-provider\n', 'stores/index.yaml': 'name: Index\nin: shop\n', 'connections/thing.yaml': 'from: cards\nto: index\n' })).toEqual([]);
  });

  it('is not one for a store in a system, nor for a connection or a keeper with an error in its file', () => {
    expect(found(shop({ 'connections/thing.yaml': 'from: storefront\nto: orders-database\n' }))).toEqual([]);
    expect(found(shop({ ...KEPT, 'connections/thing.yaml': 'from: storefront\nto: index\ncolour: blue\n' }))).toEqual(['connections/thing.yaml:3:1 error key-unknown']);
    expect(found(shop({ ...KEPT, 'apps/order-api.yaml': 'name: Order API\nin: shop\ncolour: blue\n', 'connections/thing.yaml': 'from: storefront\nto: index\n' }))).toEqual([
      'apps/order-api.yaml:3:1 error key-unknown',
    ]);
  });

  it('reads a part with an error in its file as inside the app, when its `in` says so, and as nowhere when nothing of it can be read', () => {
    expect(found(shop({ ...KEPT, 'components/checkout.yaml': 'name: Checkout\nin: order-api\ncolour: blue\n', 'connections/thing.yaml': 'from: checkout\nto: index\n' }))).toEqual([
      'components/checkout.yaml:3:1 error key-unknown',
    ]);
    expect(found(shop({ ...KEPT, 'components/checkout.yaml': 'name: [Checkout\nin: order-api\n', 'connections/thing.yaml': 'from: checkout\nto: index\n' }))).toEqual([
      'components/checkout.yaml:1:7 error yaml-syntax',
    ]);
  });
});

describe('a condition said again', () => {
  /** What each message of `only-said-again` asks, after what it saw. */
  const asks = (noun: string): string => `Does something more hold for this ${noun} alone? Then say that. If not, \`only\` can come out.`;
  const part = 'A part has the conditions of what it is in, and of what that is in, so these words add nothing here.';
  const connection = 'A connection has the conditions of its ends and of what they are in, so these words add nothing here.';

  it('is a warning at the `only` of a part that says what the thing it is in says', () => {
    const files = shop({
      'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: in the hosted edition\n',
      'components/checkout.yaml': 'name: Checkout\nin: order-api\nonly: in the hosted edition\n',
    });
    expect(load(files).problems).toEqual([
      {
        file: 'components/checkout.yaml',
        line: 3,
        column: 7,
        severity: 'warning',
        code: 'only-said-again',
        message: `\`only\` says "in the hosted edition", and so does \`order-api\`, the app it is in. ${part} ${asks('component')}`,
      },
    ]);
    expect(load(files).model.components.find((record) => record.id === 'checkout')?.only).toBe('in the hosted edition');
  });

  it.each([
    ['a store in a system', 'stores/orders-database.yaml', 'name: Orders database\nin: shop\n', '`shop`, the system it is in', 'store'],
    ['a store that an app keeps', 'stores/index.yaml', 'name: Index\nin: storefront\n', '`storefront`, the app that keeps it', 'store'],
    ['a piece of infrastructure in a system', 'infrastructure/ingress.yaml', 'name: Ingress\nin: shop\n', '`shop`, the system it is in', 'piece of infrastructure'],
    ['a component, two levels down', 'components/basket.yaml', 'name: Basket\nin: storefront\n', '`shop`, the system it is in', 'component'],
  ])('names how the two are related, for %s', (_what, file, text, related, noun) => {
    const files = shop({
      'systems/shop.yaml': 'name: Shop\nowner: shop-team\nonly: in the hosted edition\n',
      'apps/storefront.yaml': `name: Storefront\nin: shop\n${file === 'stores/index.yaml' ? 'only: in the head office\n' : ''}`,
      [file]: `${text}only: ${file === 'stores/index.yaml' ? 'in the head office' : 'in the hosted edition'}\n`,
    });
    const problems = load(files).problems.filter((problem) => problem.file === file);
    expect(problems.map((problem) => problem.code)).toEqual(['only-said-again']);
    const only = file === 'stores/index.yaml' ? 'in the head office' : 'in the hosted edition';
    expect(problems[0]?.message).toBe(`\`only\` says "${only}", and so does ${related}. ${part} ${asks(noun)}`);
  });

  it('names the nearest that says it, once, though several do', () => {
    const files = shop({
      'systems/shop.yaml': 'name: Shop\nowner: shop-team\nonly: on Linux\n',
      'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: on Linux\n',
      'components/checkout.yaml': 'name: Checkout\nin: order-api\nonly: on Linux\n',
    });
    expect(found(files)).toEqual(['apps/order-api.yaml:3:7 warning only-said-again', 'components/checkout.yaml:3:7 warning only-said-again']);
    expect(messages(files)[1]).toMatch(/^`only` says "on Linux", and so does `order-api`, the app it is in\./);
  });

  it('is one on a connection that says what an end, or what an end is in, says', () => {
    const conditioned = {
      'systems/shop.yaml': 'name: Shop\nowner: shop-team\nonly: in the hosted edition\n',
      'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: when payments are on\n',
      'systems/card-provider.yaml': 'name: Card provider\nonly: for card payments\n',
    };
    const said = (only: string): SourceFile[] => shop({ ...conditioned, 'connections/thing.yaml': `from: checkout\nto: card-provider\nonly: ${only}\n` });
    expect(found(said('for card payments'))).toEqual(['connections/thing.yaml:3:7 warning only-said-again']);
    expect(messages(said('for card payments'))).toEqual([
      `\`only\` says "for card payments", and so does \`card-provider\`, the \`to\` of this connection. ${connection} ${asks('connection')}`,
    ]);
    expect(messages(said('when payments are on'))[0]).toMatch(/and so does `order-api`, the app the `from` of this connection is in\./);
    expect(messages(said('in the hosted edition'))[0]).toMatch(/and so does `shop`, the system the `from` of this connection is in\./);
    // Its own words, or another wording, say something more.
    expect(found(said('when the card provider is up'))).toEqual([]);
    expect(found(said('For card payments'))).toEqual([]);
  });

  it('is not one for what a connection passes through, even on a route with two things that have `only`', () => {
    const files = shop({
      'infrastructure/proxy.yaml': 'name: HTTPS proxy\nonly: in the head office\n',
      'infrastructure/edge.yaml': 'name: Edge\nonly: in the hosted edition\n',
      'connections/thing.yaml': 'from: customer\nto: storefront\nvia: [edge, proxy]\nonly: in the head office\n',
    });
    expect(load(files).problems).toEqual([]);
  });

  it('is one when the two ends have different conditions and the connection says that of one of them', () => {
    const files = shop({
      'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: when payments are on\n',
      'apps/storefront.yaml': 'name: Storefront\nin: shop\nonly: in the hosted edition\n',
      'connections/thing.yaml': 'from: basket\nto: order-api\nonly: in the hosted edition\n',
    });
    expect(messages(files)).toEqual([
      `\`only\` says "in the hosted edition", and so does \`storefront\`, the app the \`from\` of this connection is in. ${connection} ${asks('connection')}`,
    ]);
  });

  it('is one at a connection to a piece of infrastructure in a system that says the same', () => {
    const files = shop({
      'systems/shop.yaml': 'name: Shop\nowner: shop-team\nonly: on Kubernetes\n',
      'infrastructure/ingress.yaml': 'name: Ingress\nin: shop\n',
      'connections/thing.yaml': 'from: customer\nto: ingress\nname: Reloads it\nonly: on Kubernetes\n',
    });
    expect(messages(files)).toEqual([
      `\`only\` says "on Kubernetes", and so does \`shop\`, the system the \`to\` of this connection is in. ${connection} ${asks('connection')}`,
    ]);
  });

  it('is not one for a record with an error in its file, nor from one', () => {
    const files = shop({
      'apps/order-api.yaml': 'name: Order API\nin: shop\nonly: on Linux\ncolour: blue\n',
      'components/checkout.yaml': 'name: Checkout\nin: order-api\nonly: on Linux\n',
    });
    expect(found(files)).toEqual(['apps/order-api.yaml:4:1 error key-unknown']);
  });
});

describe('two ways of one exchange', () => {
  const pays = 'from: checkout\nto: card-provider\nname: Takes the payment\n';

  it('are two connections, not one said twice, when their routes or their conditions differ', () => {
    expect(found(shop({ 'connections/a.yaml': pays, 'connections/b.yaml': `${pays}via: [proxy]\n` }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': pays, 'connections/b.yaml': `${pays}only: when the proxy is down\n` }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': `${pays}via: [proxy, basket]\n`, 'connections/b.yaml': `${pays}via: [basket, proxy]\n` }))).toEqual([]);
  });

  it('are one said twice when the route and the condition are the same too, and the warning names the keys they share', () => {
    const both = `${pays}via: [proxy]\nonly: in the head office\n`;
    const files = shop({ 'connections/a.yaml': both, 'connections/b.yaml': both });
    expect(found(files)).toEqual(['connections/a.yaml:1:1 warning connection-twice', 'connections/b.yaml:1:1 warning connection-twice']);
    expect(messages(files)[0]).toBe(
      'This connection has the same `from`, `to`, `via`, `name` and `only` as `connections/b.yaml`. If these are the same exchange, keep one. ' +
        'If they are two ways of one exchange, give each its route in `via`, or say in `only` when each is taken. ' +
        'If their purposes differ, give each a name that says which.',
    );
  });

  it('name who opened the channel, or what is done to a store, where one says it and the other does not, before one is kept', () => {
    const tells = 'from: order-api\nto: customer\nname: Says the order is ready\n';
    const opened = shop({ 'connections/a.yaml': `${tells}`, 'connections/b.yaml': tells.replace('name:', 'opens: to\nname:') });
    expect(messages(opened)).toEqual([
      'This connection has the same `from`, `to` and `name` as `connections/b.yaml`. They differ in `opens`: this one has none, and `connections/b.yaml` has `opens: to`. ' +
        'If these are the same exchange, keep one, and carry `opens: to` over to it if it holds there. ' +
        'If they are two ways of one exchange, give each its route in `via`, or say in `only` when each is taken. If their purposes differ, give each a name that says which.',
      'This connection has the same `from`, `to` and `name` as `connections/a.yaml`. They differ in `opens`: this one has `opens: to`, and `connections/a.yaml` has none. ' +
        'If these are the same exchange, keep one, and carry `opens: to` over to it if it holds there. ' +
        'If they are two ways of one exchange, give each its route in `via`, or say in `only` when each is taken. If their purposes differ, give each a name that says which.',
    ]);
    const writes = 'from: checkout\nto: orders-database\nname: Keeps the order\n';
    const three = shop({ 'connections/a.yaml': `${writes}access: read\n`, 'connections/b.yaml': `${writes}access: write\n`, 'connections/c.yaml': `${writes}access: read\n` });
    expect(messages(three)[0]).toContain(
      'They differ in `access`: this one and `connections/c.yaml` have `access: read`, and `connections/b.yaml` has `access: write`. ' +
        'If these are the same exchange, keep one, and give it the `access` that holds there. ',
    );
    // The same fact on both says nothing more.
    expect(messages(shop({ 'connections/a.yaml': `${writes}access: read\n`, 'connections/b.yaml': `${writes}access: read\n` }))[0]).not.toContain('They differ');
  });

  it('name a fact a level up that the connection beneath it lacks, and say where it may go before the upper one is removed', () => {
    const upper = 'from: order-api\nto: customer\nopens: to\nname: Says the order is ready\n';
    const lower = 'from: checkout\nto: customer\nname: Says the order is ready\n';
    const files = shop({ 'connections/upper.yaml': upper, 'connections/lower.yaml': lower });
    expect(messages(files)).toEqual([
      'This connection says in the same words, higher up, what `connections/lower.yaml` says. It has `opens: to`, and `connections/lower.yaml` has none. ' +
        'A connection higher up is a summary: give it a name that says more than the ones beneath it, or remove it, ' +
        'carrying `opens: to` over to `connections/lower.yaml` if it holds there.',
    ]);
    // Done as it says, nothing is lost and nothing is left to warn of.
    expect(found(shop({ 'connections/lower.yaml': lower.replace('name:', 'opens: to\nname:') }))).toEqual([]);
    // A fact the one beneath has, and the upper one lacks, is not lost when the upper one goes.
    const plain = shop({ 'connections/upper.yaml': upper.replace('opens: to\n', ''), 'connections/lower.yaml': lower.replace('name:', 'opens: to\nname:') });
    expect(messages(plain)[0]).not.toContain('opens');
  });

  it('are not a summary a level up when the route or the condition differs, and are one when both are the same', () => {
    const lower = 'from: checkout\nto: card-provider\nname: Takes the payment\nonly: for card payments\n';
    const upper = 'from: order-api\nto: card-provider\nname: Takes the payment\n';
    expect(found(shop({ 'connections/a.yaml': lower, 'connections/b.yaml': upper }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': lower, 'connections/b.yaml': `${upper}only: for card payments\nvia: [proxy]\n` }))).toEqual([]);
    expect(found(shop({ 'connections/a.yaml': lower, 'connections/b.yaml': `${upper}only: for card payments\n` }))).toEqual([
      'connections/b.yaml:1:1 warning connection-repeated-above',
    ]);
  });
});

describe('a store in an app and a piece of infrastructure in a system, at the ends of a connection', () => {
  it('make `via` an error where it names what a kept store at the `from` is in', () => {
    const files = shop({ 'stores/index.yaml': 'name: Index\nin: order-api\n', 'connections/thing.yaml': 'from: index\nto: index\nvia: [order-api]\n' });
    expect(found(files)).toEqual(['connections/thing.yaml:3:7 error via-end']);
    expect(messages(files)[0]).toMatch(/^`via` names `order-api`, which `index`, the `from` of this connection, is in\./);
  });

  it('make `via` an error where it names the system a piece at the `from` is in, or a piece in the system at the `from`', () => {
    const placed = { 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: shop\n' };
    const from = shop({ ...placed, 'connections/thing.yaml': 'from: proxy\nto: card-provider\nvia: [shop]\n' });
    expect(found(from)).toEqual(['connections/thing.yaml:3:7 error via-end']);
    expect(messages(from)[0]).toMatch(/^`via` names `shop`, which `proxy`, the `from` of this connection, is in\./);
    const inFrom = shop({ ...placed, 'connections/thing.yaml': 'from: shop\nto: card-provider\nvia: [proxy]\n' });
    expect(messages(inFrom)).toEqual([
      '`via` names `proxy`, which is in `shop`, the `from` of this connection. What a connection passes through stands between its two ends. ' +
        'Take `proxy` out of `via`. If nothing is left in the list, take the `via` key out too. ' +
        'Or, if the exchange starts before it, make the part of `shop` that it starts at the `from`.',
    ]);
  });

  it('let a piece in one system stand on the way between parts of another, as a piece in no system does', () => {
    expect(found(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: card-provider\n', 'connections/thing.yaml': 'from: basket\nto: checkout\nvia: [proxy]\n' }))).toEqual([]);
  });

  it('put a piece beneath its system for a connection higher up that says the same', () => {
    const files = shop({
      'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: shop\n',
      'connections/proxy-checks.yaml': 'from: proxy\nto: card-provider\nname: Checks that it is up\n',
      'connections/shop-checks.yaml': 'from: shop\nto: card-provider\nname: Checks that it is up\n',
    });
    expect(found(files)).toEqual(['connections/shop-checks.yaml:1:1 warning connection-repeated-above']);
  });

  it('make a system with a piece in it that a connection ends at do more than pass on', () => {
    const files = shop({
      'systems/edge.yaml': 'name: Edge\n',
      'infrastructure/cdn.yaml': 'name: CDN\nin: edge\n',
      'connections/customer-buys.yaml': 'from: customer\nto: storefront\nvia: [edge]\n',
      'connections/storefront-purges.yaml': 'from: storefront\nto: cdn\nname: Purges the cache\n',
    });
    expect(found(files)).toEqual([]);
  });
});
