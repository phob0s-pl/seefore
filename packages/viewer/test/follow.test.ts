import type { ViewerState } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/address.ts';
import { accepts, deeper, keptSelection, resolveRoute, revisionOf, settingFor } from '../src/follow.ts';
import { BROKEN_HOP_CONTAINERS, BROKEN_HOP_STATE, COMPONENTS, CONTAINERS, HARD_CONTAINERS, HARD_STATE, MODEL, STATE, answerFor } from './fixture.ts';

/** What a new reading does to the setting shown and to what is chosen, and which answers the page takes. */

/** The state of a later reading, with the order API and its components gone. */
const LATER: ViewerState = {
  ...STATE,
  revision: 'r2',
  model: { ...MODEL, apps: [], components: [] },
  scopes: STATE.scopes.filter((scope) => !['order-api', 'checkout', 'order-status'].includes(scope.id)),
};

/** The container view of that reading, with the order API and its arrows gone. */
const LATER_CONTAINERS = {
  ...CONTAINERS,
  boxes: CONTAINERS.boxes.filter((box) => box.id !== 'order-api'),
  arrows: CONTAINERS.arrows.filter((arrow) => arrow.from !== 'order-api'),
};

/** The route of a setting. */
function at(depth: 'system' | 'container' | 'component', scope: string | null = null): Route {
  return { page: 'view', setting: { depth, scope } };
}

describe('the setting a state opens', () => {
  it('keeps a setting the state has, and the model and the problems', () => {
    expect(resolveRoute(LATER, at('container', 'shop'))).toEqual({ route: at('container', 'shop'), gone: false });
    expect(resolveRoute(LATER, at('component'))).toEqual({ route: at('component'), gone: false });
    expect(resolveRoute(LATER, { page: 'model' })).toEqual({ route: { page: 'model' }, gone: false });
    expect(resolveRoute(LATER, { page: 'problems' })).toEqual({ route: { page: 'problems' }, gone: false });
  });

  it('opens everything at System depth at the start', () => {
    expect(resolveRoute(LATER, { page: 'start' })).toEqual({ route: at('system'), gone: false });
  });

  it('opens a box at the shallowest depth it has, when the address names a shallower one', () => {
    expect(resolveRoute(STATE, at('system', 'order-api')).route).toEqual(at('container', 'order-api'));
    expect(resolveRoute(STATE, at('system', 'checkout')).route).toEqual(at('component', 'checkout'));
    expect(resolveRoute(STATE, at('container', 'checkout')).route).toEqual(at('component', 'checkout'));
    expect(resolveRoute(STATE, at('system', 'orders-database')).route).toEqual(at('container', 'orders-database'));
    // A deeper depth that draws the same picture can still be chosen.
    expect(resolveRoute(STATE, at('component', 'customer')).route).toEqual(at('component', 'customer'));
    expect(resolveRoute(STATE, at('component', 'orders-database')).route).toEqual(at('component', 'orders-database'));
  });

  it('opens the start for a box the state does not have, when the address names it', () => {
    expect(resolveRoute(STATE, at('container', 'nowhere'))).toEqual({ route: at('system'), gone: false });
    // A store that an app keeps, or a connection, is no scope.
    expect(resolveRoute(STATE, at('system', 'customer-uses-shop'))).toEqual({ route: at('system'), gone: false });
  });

  it('opens everything at the same depth when the box shown is gone from a new reading, and says so', () => {
    expect(resolveRoute(LATER, at('component', 'order-api'), true)).toEqual({ route: at('component'), gone: true });
    expect(resolveRoute(LATER, at('container', 'checkout'), true)).toEqual({ route: at('container'), gone: true });
  });

  it('stays at the start when there is no model', () => {
    expect(resolveRoute({ ...STATE, available: false, scopes: [] }, at('container', 'shop'))).toEqual({ route: { page: 'start' }, gone: false });
    expect(resolveRoute({ ...STATE, available: false, scopes: [] }, { page: 'start' })).toEqual({ route: { page: 'start' }, gone: false });
  });
});

describe('the setting a box chosen as the scope opens', () => {
  it('keeps the depth, or takes the box’s own when that is deeper, in one step', () => {
    expect(settingFor(STATE, 'order-api', 'system')).toEqual({ depth: 'container', scope: 'order-api' });
    expect(settingFor(STATE, 'checkout', 'container')).toEqual({ depth: 'component', scope: 'checkout' });
    expect(settingFor(STATE, 'customer', 'component')).toEqual({ depth: 'component', scope: 'customer' });
    expect(settingFor(STATE, null, 'container')).toEqual({ depth: 'container', scope: null });
    expect(settingFor(STATE, 'nowhere', 'system')).toBeUndefined();
    expect(deeper('system', 'component')).toBe('component');
    expect(deeper('component', 'container')).toBe('component');
  });
});

describe('what a new state does to a selection', () => {
  it('keeps a box, the boundary and an arrow that are still in the view drawn', () => {
    expect(keptSelection(LATER, LATER_CONTAINERS, { kind: 'box', id: 'customer' })).toEqual({ kind: 'box', id: 'customer' });
    expect(keptSelection(LATER, LATER_CONTAINERS, { kind: 'box', id: 'shop' })).toEqual({ kind: 'box', id: 'shop' });
    expect(keptSelection(LATER, LATER_CONTAINERS, { kind: 'arrow', id: 'customer~shop' })).toEqual({ kind: 'arrow', id: 'customer~shop' });
  });

  it('keeps a box that opens as a boundary at another depth', () => {
    expect(keptSelection(STATE, CONTAINERS, { kind: 'box', id: 'order-api' })).toEqual({ kind: 'box', id: 'order-api' });
    expect(keptSelection(STATE, COMPONENTS, { kind: 'box', id: 'order-api' })).toEqual({ kind: 'box', id: 'order-api' });
  });

  it('clears a box and an arrow that are gone', () => {
    expect(keptSelection(LATER, LATER_CONTAINERS, { kind: 'box', id: 'order-api' })).toBeNull();
    expect(keptSelection(LATER, LATER_CONTAINERS, { kind: 'arrow', id: 'order-api~card-provider' })).toBeNull();
  });

  it('clears a box when no view is drawn', () => {
    expect(keptSelection(LATER, undefined, { kind: 'box', id: 'customer' })).toBeNull();
  });

  it('keeps a record chosen in the listing while the model has it, and clears it when it is gone', () => {
    expect(keptSelection(LATER, undefined, { kind: 'record', id: 'orders-database' })).toEqual({ kind: 'record', id: 'orders-database' });
    expect(keptSelection(LATER, undefined, { kind: 'record', id: 'order-api' })).toBeNull();
  });

  it('keeps no selection as none', () => {
    expect(keptSelection(LATER, LATER_CONTAINERS, null)).toBeNull();
  });

  it('keeps what is passed through while the view lists it, and a piece of infrastructure chosen in the listing', () => {
    expect(keptSelection(HARD_STATE, HARD_CONTAINERS, { kind: 'passed', id: 'balancer' })).toEqual({ kind: 'passed', id: 'balancer' });
    expect(keptSelection(HARD_STATE, { ...HARD_CONTAINERS, passed: [] }, { kind: 'passed', id: 'balancer' })).toBeNull();
    expect(keptSelection(HARD_STATE, undefined, { kind: 'record', id: 'balancer' })).toEqual({ kind: 'record', id: 'balancer' });
  });

  it('keeps a step of a route whose record has an error in its file, while a connection passes through it', () => {
    expect(keptSelection(BROKEN_HOP_STATE, BROKEN_HOP_CONTAINERS, { kind: 'record', id: 'balancer' })).toEqual({ kind: 'record', id: 'balancer' });
    const connections = BROKEN_HOP_STATE.model.connections.filter((one) => one.id !== 'web-calls-cards');
    expect(keptSelection({ ...BROKEN_HOP_STATE, model: { ...BROKEN_HOP_STATE.model, connections } }, BROKEN_HOP_CONTAINERS, { kind: 'record', id: 'balancer' })).toBeNull();
  });
});

describe('which answers the page takes', () => {
  const shop = { depth: 'container', scope: 'shop' } as const;

  it('takes the view and picture of the setting wanted at the revision it holds', () => {
    expect(accepts(answerFor('container~shop'), STATE, shop)).toBe(true);
  });

  it('drops an answer for another revision, or for a setting the reader has left', () => {
    expect(accepts(answerFor('container~shop', 'r0'), STATE, shop)).toBe(false);
    expect(accepts(answerFor('system~shop'), STATE, shop)).toBe(false);
    expect(accepts(answerFor('component~shop'), STATE, shop)).toBe(false);
    // A view of one setting with the picture of another.
    expect(accepts({ ...answerFor('container~shop'), picture: answerFor('system~shop').picture }, STATE, shop)).toBe(false);
  });
});

describe('the revision an event names', () => {
  it('is its data, or the revision in the JSON of its data', () => {
    expect(revisionOf('r7')).toBe('r7');
    expect(revisionOf('"r7"')).toBe('r7');
    expect(revisionOf('{"revision":"r7"}')).toBe('r7');
    expect(revisionOf('12')).toBe('12');
  });
});
