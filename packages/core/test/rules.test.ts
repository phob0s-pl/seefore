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
    ['`in` of a store', 'stores/thing.yaml', 'name: Thing\nin: shopp\n', '2:5', '`in` names `shopp`, but no record has that id. A store is in a system.'],
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
    ['a store in a person', 'stores/thing.yaml', 'name: Thing\nin: customer\n', '2:5', '`in` names `customer`, which is a person. A store is in a system.'],
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

  it('has the owner it names, and none when it names none, since it is in nothing', () => {
    const owners = load(shop({ 'infrastructure/proxy.yaml': 'name: HTTPS proxy\nowner: shop-team\n', 'infrastructure/gateway.yaml': 'name: Gateway\n' })).model;
    expect(ownership(owners).get('proxy')).toEqual({ owner: 'shop-team', from: 'proxy' });
    expect(ownership(owners).has('gateway')).toBe(false);
  });
});

describe('what a connection passes through', () => {
  /** What a connection passes through stands between its two ends: said in each message of `via-end`. */
  const between = 'What a connection passes through stands between its two ends';

  /** The shop, where the storefront has work of its own, with this connection. */
  const route = (text: string): SourceFile[] =>
    shop({ 'connections/customer-shops.yaml': 'from: customer\nto: storefront\nname: Shops\n', 'connections/thing.yaml': text });

  it.each([
    ['its `from`', 'from: storefront\nto: card-provider\nvia: [proxy, storefront]\n', '3:14', `\`via\` names \`storefront\`, which is the \`from\` of this connection. ${between}: take \`storefront\` out of \`via\`.`],
    ['its `to`', 'from: customer\nto: card-provider\nvia: [card-provider]\n', '3:7', `\`via\` names \`card-provider\`, which is the \`to\` of this connection. ${between}: take \`card-provider\` out of \`via\`.`],
    [
      'the app its `to` is in',
      'from: storefront\nto: checkout\nvia: [order-api]\n',
      '3:7',
      `\`via\` names \`order-api\`, which \`checkout\`, the \`to\` of this connection, is in. ${between}: take \`order-api\` out of \`via\`.`,
    ],
    [
      'the system its `from` is in, two levels up',
      'from: basket\nto: card-provider\nvia: [shop]\n',
      '3:7',
      `\`via\` names \`shop\`, which \`basket\`, the \`from\` of this connection, is in. ${between}: take \`shop\` out of \`via\`.`,
    ],
    [
      'what is in its `to`',
      'from: customer\nto: shop\nvia: [proxy, storefront]\n',
      '3:14',
      `\`via\` names \`storefront\`, which is in \`shop\`, the \`to\` of this connection. ${between}. ` +
        'Take `storefront` out of `via`, or, if the exchange goes on past it, make the part of `shop` that it ends at the `to`.',
    ],
    [
      'what is in its `from`, two levels down',
      'from: shop\nto: card-provider\nvia: [checkout]\n',
      '3:7',
      `\`via\` names \`checkout\`, which is in \`shop\`, the \`from\` of this connection. ${between}. ` +
        'Take `checkout` out of `via`, or, if the exchange starts before it, make the part of `shop` that it starts at the `from`.',
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
      `\`via\` names \`order-api\`, which \`checkout\`, the \`from\` of this connection, is in. ${between}: take \`order-api\` out of \`via\`.`,
    ]);
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

  it('is a warning on the store, which says what it looked at and what to do', () => {
    expect(load(broker('name: Kafka\nin: shop\ntechnology: [go, kafka]\n')).problems).toEqual([
      {
        file: 'stores/events.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'broker-as-store',
        message:
          'This store is named "Kafka", as is `kafka`, a technology it names, and it has no `kind`: it may be a message broker drawn as one store. ' +
          'A broker is a technology. Each queue or topic in it is a store of its own, of kind `queue` or `topic`, with the broker as its `technology`. ' +
          'Write a store for each that the facts tell apart, move each connection to the one it puts into or takes from, ' +
          'and name what is left for what it holds, not for the broker. If this store is not a broker, give it a name that says what it holds.',
      },
    ]);
  });

  it.each(['queue', 'topic'])('is one for a store of kind %s too, and says so', (kind) => {
    const problems = load(broker(`name: Kafka\nin: shop\nkind: ${kind}\ntechnology: [kafka]\n`)).problems;
    expect(problems.map((problem) => problem.code)).toEqual(['broker-as-store']);
    expect(problems[0]?.message).toContain(`a technology it names, and it is of kind \`${kind}\`: it may be`);
  });

  it('reads the name in any case and with any spaces between its words, and keeps the store in the model', () => {
    const files = shop({ 'stores/events.yaml': 'name: apache  KAFKA\nin: shop\ntechnology: [kafka, go]\n', 'technologies/kafka.yaml': 'name: Apache Kafka\n' });
    const loaded = load(files);
    expect(found(files)).toEqual(['stores/events.yaml:1:1 warning broker-as-store']);
    expect(loaded.problems[0]?.message).toMatch(/^This store is named "apache {2}KAFKA", as is `kafka`, a technology it names, and it has no `kind`/);
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

  it('is a warning on the app, which says how many pass through it and what to do', () => {
    expect(load(shop(GATEWAY)).problems).toEqual([
      {
        file: 'apps/gateway.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'passes-on-only',
        message:
          '2 connections name this app in `via`, and no connection starts or ends at it or at anything in it. ' +
          'All it does is pass exchanges on, so it is a piece of infrastructure: move its file to `infrastructure/`, ' +
          'keeping only its `name`, `description`, `technology` and `owner`. If it has work of its own, write the connection for that work.',
      },
    ]);
  });

  it('is one for a system, and says to move what is in it first', () => {
    const problems = load(
      shop({
        'systems/edge.yaml': 'name: Edge\n',
        'apps/edge-worker.yaml': 'name: Edge worker\nin: edge\n',
        'connections/customer-buys.yaml': 'from: customer\nto: storefront\nvia: [edge]\n',
      }),
    ).problems;
    expect(problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['systems/edge.yaml passes-on-only']);
    expect(problems[0]?.message).toBe(
      '1 connection names this system in `via`, and no connection starts or ends at it or at anything in it. ' +
        'All it does is pass exchanges on, so it is a piece of infrastructure: move its file to `infrastructure/`, ' +
        'keeping only its `name`, `description`, `technology` and `owner`, and first move or remove what is in it, ' +
        'since a piece of infrastructure holds nothing. If it has work of its own, write the connection for that work.',
    );
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
  /** What to do, said after the files: a purpose of its own is not thrown away. */
  const either = 'If these are the same exchange, keep one. If their purposes differ, give each a name that says which.';

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
