import { describe, expect, it } from 'vitest';
import { holds, litBy, litByKept } from '../src/light.ts';
import type { View, ViewBox } from '@seefore/core';
import { ARCHIVE_STATE, archiveView } from './archive.ts';
import { CONTAINERS, CONTEXT, HARD_CONTAINERS } from './fixture.ts';

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
    expect(holds(HARD_CONTAINERS, { kind: 'passed', id: 'balancer' })).toBe(true);
    expect(holds(HARD_CONTAINERS, { kind: 'passed', id: 'gateway' })).toBe(false);
  });
});

describe('what passes through', () => {
  it('lights, with a box, the arrows that pass through it and their ends', () => {
    expect(lit({ kind: 'box', id: 'gateway' }, HARD_CONTAINERS)).toEqual({ boxes: ['cards', 'gateway', 'web'], arrows: ['web~cards'] });
    expect(lit({ kind: 'box', id: 'proxy' }, HARD_CONTAINERS)).toEqual({ boxes: ['clerk', 'proxy', 'web'], arrows: ['clerk~web', 'proxy~web'] });
  });

  it('lights, with an arrow, the boxes it passes through', () => {
    expect(lit({ kind: 'arrow', id: 'web~cards' }, HARD_CONTAINERS)).toEqual({ boxes: ['cards', 'gateway', 'web'], arrows: ['web~cards'] });
    expect(lit({ kind: 'arrow', id: 'clerk~web' }, HARD_CONTAINERS)).toEqual({ boxes: ['clerk', 'proxy', 'web'], arrows: ['clerk~web'] });
  });

  it('lights, for what has no box, the arrows that pass through it and their ends', () => {
    expect(lit({ kind: 'passed', id: 'balancer' }, HARD_CONTAINERS)).toEqual({ boxes: ['cards', 'web'], arrows: ['web~cards'] });
    expect(lit({ kind: 'passed', id: 'nothing' }, HARD_CONTAINERS)).toEqual({ boxes: [], arrows: [] });
  });
});

/** A box of a made-up view, with nothing in its marks unless given. */
function made(id: string, more: Partial<ViewBox> = {}): ViewBox {
  return { id, family: 'apps', look: 'app', name: id, line: '[App]', scope: false, inside: true, loops: [], within: [], passing: [], kept: [], ...more };
}

/**
 * A view in which a runner reloads a proxy, a request passes through it on an arrow, and the
 * copies of a jobs app, which has no arrow, tell each other through it and through a load
 * balancer that has no box.
 */
const HELD: View = {
  id: 'vellum.containers',
  kind: 'containers',
  scope: 'vellum',
  title: 'Container view: Vellumoak',
  boxes: [
    made('browser'),
    made('jobs', { loops: ['jobs-tell-jobs'] }),
    made('proxy', { family: 'infrastructure', look: 'infrastructure', inside: false, passing: ['browser-asks-web', 'jobs-tell-jobs'] }),
    made('runner'),
    made('web'),
  ],
  boundary: { id: 'vellum', name: 'Vellumoak', line: '[System]', title: 'Vellumoak [System]' },
  arrows: [
    { id: 'browser~web', from: 'browser', to: 'web', connections: ['browser-asks-web'], names: ['Asks'], technology: [], route: { count: 1, hops: [{ name: 'proxy', bracketed: false }], bracketed: false, line: 'via proxy' } },
    { id: 'runner~proxy', from: 'runner', to: 'proxy', connections: ['runner-reloads-proxy'], names: ['Reloads'], technology: [] },
  ],
  left: { outside: [], broken: [] },
  legend: [],
  passed: [{ id: 'balancer', name: 'Load balancer', conditions: [], own: false, connections: ['jobs-tell-jobs'], arrows: [] }],
};

describe('what passes through a connection held in a box', () => {
  it('lights, with a box, the box that holds a connection passing through it, since that connection has no arrow', () => {
    expect(lit({ kind: 'box', id: 'proxy' }, HELD)).toEqual({ boxes: ['browser', 'jobs', 'proxy', 'runner', 'web'], arrows: ['browser~web', 'runner~proxy'] });
  });

  it('lights, for what has no box, the box that holds a connection passing through it', () => {
    expect(lit({ kind: 'passed', id: 'balancer' }, HELD)).toEqual({ boxes: ['jobs'], arrows: [] });
  });
});

describe('what choosing a store that an app keeps lights', () => {
  const view = archiveView('archive.containers');
  /** The connections of the archive that start or end at a record. */
  const of = (id: string) => new Set(ARCHIVE_STATE.model.connections.filter((one) => one.from === id || one.to === id).map((one) => one.id));
  const sorted = ({ boxes, arrows }: { boxes: Set<string>; arrows: Set<string> }) => ({ boxes: [...boxes].sort(), arrows: [...arrows].sort() });

  it('lights the app that keeps it and only the arrows that hold one of its connections, with their ends', () => {
    // The indexer and staff read the drafts, drawn at Desk; Desk's own reading of them is inside its box.
    expect(sorted(litByKept(view, 'desk', of('drafts')))).toEqual({ boxes: ['desk', 'indexer', 'staff'], arrows: ['indexer~desk', 'staff~desk'] });
    // Desk's other arrows are not the store's: choosing Desk itself lights them.
    expect(sorted(litBy(view, { kind: 'box', id: 'desk' })).arrows).toEqual(expect.arrayContaining(['desk~browser', 'desk~records']));
    // A store whose every connection is inside its app lights the app alone.
    expect(sorted(litByKept(view, 'desk', of('cache')))).toEqual({ boxes: ['desk'], arrows: [] });
  });

  it('lights nothing where the view does not draw the app', () => {
    expect(sorted(litByKept(archiveView('archive.context'), 'desk', of('drafts')))).toEqual({ boxes: [], arrows: [] });
  });
});
