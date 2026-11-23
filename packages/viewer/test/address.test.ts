import { describe, expect, it } from 'vitest';
import { START, addressOf, routeOf, sameRoute } from '../src/address.ts';
import type { Route } from '../src/address.ts';

/** The address of what the page shows, and back. */

describe('the address of a setting', () => {
  it('holds the depth alone for everything, and the depth and the box for one box', () => {
    expect(addressOf({ page: 'view', setting: { depth: 'system', scope: null } })).toBe('#/view/system');
    expect(addressOf({ page: 'view', setting: { depth: 'container', scope: null } })).toBe('#/view/container');
    expect(addressOf({ page: 'view', setting: { depth: 'component', scope: 'relay' } })).toBe('#/view/component~relay');
    expect(addressOf({ page: 'view', setting: { depth: 'system', scope: 'shop' } })).toBe('#/view/system~shop');
  });

  it('names the model and the problems after #, and nothing for the start', () => {
    expect(addressOf({ page: 'model' })).toBe('#/model');
    expect(addressOf({ page: 'problems' })).toBe('#/problems');
    expect(addressOf({ page: 'start' })).toBe('');
  });

  it('gives back what it names, for each form', () => {
    const routes: Route[] = [
      { page: 'view', setting: { depth: 'system', scope: null } },
      { page: 'view', setting: { depth: 'container', scope: null } },
      { page: 'view', setting: { depth: 'component', scope: null } },
      { page: 'view', setting: { depth: 'system', scope: 'card-provider' } },
      { page: 'view', setting: { depth: 'container', scope: 'shop' } },
      { page: 'view', setting: { depth: 'component', scope: 'relay' } },
      { page: 'model' },
      { page: 'problems' },
      { page: 'start' },
    ];
    for (const route of routes) expect(routeOf(addressOf(route))).toEqual(route);
  });

  it('reads an address with or without its #, and with its ~ escaped', () => {
    expect(routeOf('/view/container~shop')).toEqual({ page: 'view', setting: { depth: 'container', scope: 'shop' } });
    expect(routeOf('#/view/container~shop')).toEqual({ page: 'view', setting: { depth: 'container', scope: 'shop' } });
    expect(routeOf('#/view/container%7Eshop')).toEqual({ page: 'view', setting: { depth: 'container', scope: 'shop' } });
  });

  it('opens the start for an address it does not know, or one it cannot read', () => {
    for (const hash of ['', '#/somewhere', '#/view/', '#/view/%E0%A4%A', '#/view/deep', '#/view/deep~shop', '#/view/system~', '#/view/system~Shop', '#/view/system~shop~relay', '#/view/everything']) {
      expect(routeOf(hash), hash).toEqual({ page: 'start' });
    }
  });

  it('knows no address of stage 5: they open the start', () => {
    for (const hash of ['#/view/shop.containers', '#/view/shop.context', '#/view/card-provider.context']) expect(routeOf(hash), hash).toEqual({ page: 'start' });
  });

  it('tells two routes apart', () => {
    const shop = { page: 'view', setting: { depth: 'container', scope: 'shop' } } as const;
    expect(sameRoute(shop, { page: 'view', setting: { depth: 'container', scope: 'shop' } })).toBe(true);
    expect(sameRoute(shop, { page: 'view', setting: { depth: 'component', scope: 'shop' } })).toBe(false);
    expect(sameRoute(shop, { page: 'view', setting: { depth: 'container', scope: null } })).toBe(false);
    expect(sameRoute({ page: 'model' }, { page: 'problems' })).toBe(false);
    expect(sameRoute({ page: 'view', setting: START }, { page: 'view', setting: { depth: 'system', scope: null } })).toBe(true);
  });
});
