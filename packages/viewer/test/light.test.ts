import { describe, expect, it } from 'vitest';
import { holds, litBy } from '../src/light.ts';
import { CONTAINERS, CONTEXT } from './fixture.ts';

/** Which boxes and arrows a hover, the focus or a choice lights. */

/** What is lit, as sorted lists, to compare. */
function lit(target: Parameters<typeof litBy>[1], view = CONTAINERS) {
  const { boxes, arrows } = litBy(view, target);
  return { boxes: [...boxes].sort(), arrows: [...arrows].sort() };
}

describe('what a hover lights', () => {
  it('lights a box, its arrows and the boxes at their other ends', () => {
    expect(lit({ kind: 'box', id: 'order-api' })).toEqual({
      boxes: ['card-provider', 'order-api', 'orders-database'],
      arrows: ['order-api~card-provider', 'order-api~orders-database'],
    });
  });

  it('lights an arrow that ends at the boundary, and the boundary, for a box outside', () => {
    expect(lit({ kind: 'box', id: 'customer' })).toEqual({ boxes: ['customer', 'shop'], arrows: ['customer~shop'] });
  });

  it('lights the boundary with the arrows that end at it, and not the boxes inside it', () => {
    expect(lit({ kind: 'box', id: 'shop' })).toEqual({ boxes: ['customer', 'shop'], arrows: ['customer~shop'] });
  });

  it('lights an arrow and its two ends', () => {
    expect(lit({ kind: 'arrow', id: 'order-api~card-provider' })).toEqual({ boxes: ['card-provider', 'order-api'], arrows: ['order-api~card-provider'] });
  });

  it('lights a box with no arrow alone', () => {
    const view = { ...CONTEXT, arrows: [] };
    expect(lit({ kind: 'box', id: 'customer' }, view)).toEqual({ boxes: ['customer'], arrows: [] });
  });

  it('lights nothing for what the view does not hold', () => {
    expect(lit({ kind: 'box', id: 'nobody' })).toEqual({ boxes: [], arrows: [] });
    expect(lit({ kind: 'arrow', id: 'nobody~shop' })).toEqual({ boxes: [], arrows: [] });
  });

  it('knows what a view holds', () => {
    expect(holds(CONTAINERS, { kind: 'box', id: 'shop' })).toBe(true);
    expect(holds(CONTEXT, { kind: 'box', id: 'order-api' })).toBe(false);
    expect(holds(CONTAINERS, { kind: 'arrow', id: 'customer~shop' })).toBe(true);
  });
});
