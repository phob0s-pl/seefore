import { describe, expect, it } from 'vitest';
import { addressOf, routeOf, sameRoute } from '../src/address.ts';
import type { Route } from '../src/address.ts';

/** The address of what the page shows, and back. */

describe('the address of a view', () => {
  it('names a view, the model and the problems after #', () => {
    expect(addressOf({ page: 'view', view: 'shop.containers' })).toBe('#/view/shop.containers');
    expect(addressOf({ page: 'model' })).toBe('#/model');
    expect(addressOf({ page: 'problems' })).toBe('#/problems');
    expect(addressOf({ page: 'start' })).toBe('');
  });

  it('gives back what it names', () => {
    const routes: Route[] = [
      { page: 'view', view: 'shop.containers' },
      { page: 'view', view: 'card-provider.context' },
      { page: 'view', view: 'odd id/with # and % and space' },
      { page: 'model' },
      { page: 'problems' },
      { page: 'start' },
    ];
    for (const route of routes) expect(routeOf(addressOf(route))).toEqual(route);
  });

  it('reads an address with or without its #', () => {
    expect(routeOf('/view/shop.context')).toEqual({ page: 'view', view: 'shop.context' });
    expect(routeOf('#/view/shop.context')).toEqual({ page: 'view', view: 'shop.context' });
  });

  it('opens the start for an address it does not know, or one it cannot read', () => {
    expect(routeOf('')).toEqual({ page: 'start' });
    expect(routeOf('#/somewhere')).toEqual({ page: 'start' });
    expect(routeOf('#/view/')).toEqual({ page: 'start' });
    expect(routeOf('#/view/%E0%A4%A')).toEqual({ page: 'start' });
  });

  it('tells two routes apart', () => {
    expect(sameRoute({ page: 'view', view: 'a' }, { page: 'view', view: 'a' })).toBe(true);
    expect(sameRoute({ page: 'view', view: 'a' }, { page: 'view', view: 'b' })).toBe(false);
    expect(sameRoute({ page: 'model' }, { page: 'problems' })).toBe(false);
  });
});
