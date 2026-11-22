import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import { ownership } from '../src/model.ts';
import { usesOf } from '../src/uses.ts';
import { EXAMPLE } from './example.ts';

/** The example shop, with files added or replaced, and a text of `null` to take a file away. */
function example(changes: Record<string, string | null> = {}): SourceFile[] {
  return Object.entries({ ...EXAMPLE, ...changes })
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([path, text]) => ({ path, text }));
}

function ids(records: readonly { id: string }[]): string[] {
  return records.map((record) => record.id);
}

describe('the example shop', () => {
  const loaded = load(example());

  it('loads whole, with no problems', () => {
    expect(loaded.marker).toEqual({ format: 1, name: 'Shop' });
    expect(loaded.problems).toEqual([]);
    expect(loaded.records).toHaveLength(27);
    expect(loaded.unread).toEqual([]);
  });

  it('gives every record to the model, by family, in order of id', () => {
    const { model } = loaded;
    expect(ids(model.people)).toEqual(['customer', 'warehouse-clerk']);
    expect(ids(model.systems)).toEqual(['card-provider', 'shop']);
    expect(ids(model.apps)).toEqual(['order-api', 'shipping', 'storefront']);
    expect(ids(model.stores)).toEqual(['orders-database']);
    expect(ids(model.components)).toEqual(['checkout', 'order-status']);
    expect(ids(model.connections)).toEqual([
      'card-provider-confirms',
      'checkout-keeps-orders',
      'checkout-takes-payment',
      'clerk-packs',
      'customer-shops',
      'order-status-reads-orders',
      'shipping-reads-orders',
      'storefront-places-order',
    ]);
    expect(ids(model.owners)).toEqual(['card-provider-company', 'logistics-team', 'shop-team']);
    expect(ids(model.technologies)).toEqual(['go', 'https', 'postgresql', 'react', 'sql', 'typescript']);
  });

  it('gives each record as its file says, with its id and file', () => {
    expect(loaded.model.apps[2]).toEqual({
      id: 'storefront',
      file: 'apps/storefront.yaml',
      name: 'Storefront',
      in: 'shop',
      description: 'Where a customer fills a basket and pays.',
      kind: 'browser',
      technology: ['typescript', 'react'],
    });
    expect(loaded.model.connections[0]).toEqual({
      id: 'card-provider-confirms',
      file: 'connections/card-provider-confirms.yaml',
      from: 'card-provider',
      to: 'order-api',
      name: 'Confirms a payment',
      description: 'Calls back when the payment is done. That this answers the call above is for a flow.',
      technology: ['https'],
    });
  });

  it('gives every reference with its place, in order of file and place', () => {
    expect(loaded.references.filter((reference) => reference.file === 'apps/storefront.yaml')).toEqual([
      { file: 'apps/storefront.yaml', line: 2, column: 5, record: 'storefront', field: 'in', names: 'shop' },
      { file: 'apps/storefront.yaml', line: 5, column: 14, record: 'storefront', field: 'technology', names: 'typescript' },
      { file: 'apps/storefront.yaml', line: 5, column: 26, record: 'storefront', field: 'technology', names: 'react' },
    ]);
    expect(loaded.references).toHaveLength(35);
  });

  it('says who answers for each part, and from where when it is not its own', () => {
    const owners = ownership(loaded.model);
    expect(owners.get('shop')).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(owners.get('order-api')).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(owners.get('orders-database')).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(owners.get('shipping')).toEqual({ owner: 'logistics-team', from: 'shipping' });
    // A component with no owner, in an app with none, has that of the system.
    expect(owners.get('checkout')).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(owners.get('card-provider')).toEqual({ owner: 'card-provider-company', from: 'card-provider' });
    expect(owners.has('customer')).toBe(false);
  });
});

describe('who answers for a part', () => {
  it('is the nearest owner above it, and nobody when there is none', () => {
    const owners = ownership(
      load(
        example({
          'systems/shop.yaml': 'name: Shop\n',
          'components/checkout.yaml': 'name: Checkout\nin: order-api\nowner: logistics-team\n',
          'components/order-status.yaml': 'name: Order status\nin: shipping\n',
        }),
      ).model,
    );
    expect(owners.has('shop')).toBe(false);
    expect(owners.has('order-api')).toBe(false);
    expect(owners.get('checkout')).toEqual({ owner: 'logistics-team', from: 'checkout' });
    expect(owners.get('order-status')).toEqual({ owner: 'logistics-team', from: 'shipping' });
  });
});

describe('what removing a record would break', () => {
  it('for an app: its components, and every place that names it or them', () => {
    const uses = usesOf(load(example()), 'order-api');
    expect(uses?.record).toEqual({ id: 'order-api', family: 'apps', file: 'apps/order-api.yaml', name: 'Order API', in: 'shop' });
    expect(uses?.inside).toEqual([
      { id: 'checkout', family: 'components', file: 'components/checkout.yaml', name: 'Checkout', in: 'order-api' },
      { id: 'order-status', family: 'components', file: 'components/order-status.yaml', name: 'Order status', in: 'order-api' },
    ]);
    expect(uses?.references.map((reference) => `${reference.file}:${reference.line}:${reference.column} ${reference.field} ${reference.names}`)).toEqual([
      'connections/card-provider-confirms.yaml:2:5 to order-api',
      'connections/checkout-keeps-orders.yaml:1:7 from checkout',
      'connections/checkout-takes-payment.yaml:1:7 from checkout',
      'connections/order-status-reads-orders.yaml:1:7 from order-status',
      'connections/storefront-places-order.yaml:2:5 to checkout',
    ]);
  });

  it('for a system: what is inside it to the bottom, apps before stores, a thing before what is in it', () => {
    const uses = usesOf(load(example()), 'shop');
    expect(uses?.inside.map((record) => `${record.id} in ${record.in}`)).toEqual([
      'order-api in shop',
      'checkout in order-api',
      'order-status in order-api',
      'shipping in shop',
      'storefront in shop',
      'orders-database in shop',
    ]);
    expect(uses?.references).toHaveLength(12);
    expect(uses?.references.some((reference) => reference.field === 'in')).toBe(false);
  });

  it('for an owner and a technology: the records that name them', () => {
    const loaded = load(example());
    expect(usesOf(loaded, 'shop-team')?.references.map((reference) => `${reference.file} ${reference.field}`)).toEqual(['systems/shop.yaml owner']);
    expect(usesOf(loaded, 'sql')?.references.map((reference) => reference.record)).toEqual([
      'checkout-keeps-orders',
      'order-status-reads-orders',
      'shipping-reads-orders',
    ]);
    expect(usesOf(loaded, 'sql')?.inside).toEqual([]);
  });

  it('for a connection: nothing, since nothing names a connection', () => {
    expect(usesOf(load(example()), 'clerk-packs')).toEqual({
      record: { id: 'clerk-packs', family: 'connections', file: 'connections/clerk-packs.yaml', name: 'Sees what to pack and marks it sent' },
      inside: [],
      references: [],
    });
  });

  it('counts a thing named in `in` of the wrong kind as naming it, not as inside it', () => {
    const uses = usesOf(load(example({ 'components/stray.yaml': 'name: Stray\nin: shop\n' })), 'shop');
    expect(uses?.inside.map((record) => record.id)).not.toContain('stray');
    expect(uses?.references.filter((reference) => reference.record === 'stray')).toEqual([
      { file: 'components/stray.yaml', line: 2, column: 5, record: 'stray', field: 'in', names: 'shop' },
    ]);
  });

  it('still finds a record whose file is broken, and what names it', () => {
    const uses = usesOf(load(example({ 'apps/order-api.yaml': 'name: [Order API\n' })), 'order-api');
    expect(uses?.record).toEqual({ id: 'order-api', family: 'apps', file: 'apps/order-api.yaml' });
    expect(uses?.inside.map((record) => record.id)).toEqual(['checkout', 'order-status']);
    expect(uses?.references).toHaveLength(5);
  });

  it('includes records whose own file has an error, since they would break too', () => {
    const uses = usesOf(load(example({ 'connections/backwards.yaml': 'from: orders-database\nto: shipping\n' })), 'shipping');
    expect(uses?.references.map((reference) => reference.record)).toEqual(['backwards', 'clerk-packs', 'shipping-reads-orders']);
  });

  it('is nothing for an id no record has', () => {
    expect(usesOf(load(example()), 'nothing')).toBeUndefined();
    expect(usesOf(load(example()), 'Order-API')).toBeUndefined();
  });
});
