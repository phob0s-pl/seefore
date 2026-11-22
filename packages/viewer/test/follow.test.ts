import type { ViewerState } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { accepts, keptSelection, resolveRoute, revisionOf } from '../src/follow.ts';
import { BROKEN_HOP_STATE, CONTAINERS, CONTEXT, HARD_CONTAINERS, HARD_STATE, MODEL, STATE, answerFor } from './fixture.ts';

/** What a new reading does to the view shown and to what is chosen, and which answers the page takes. */

/** The state of a later reading, with the order API and its arrows gone from the container view. */
const LATER: ViewerState = {
  ...STATE,
  revision: 'r2',
  model: { ...MODEL, apps: [] },
  views: [
    CONTEXT,
    {
      ...CONTAINERS,
      boxes: CONTAINERS.boxes.filter((box) => box.id !== 'order-api'),
      arrows: CONTAINERS.arrows.filter((arrow) => arrow.from !== 'order-api'),
    },
  ],
};

const containers = { page: 'view' as const, view: 'shop.containers' };

describe('the view a new state opens', () => {
  it('keeps a view the state still has, and the model and the problems', () => {
    expect(resolveRoute(LATER, containers)).toEqual(containers);
    expect(resolveRoute(LATER, { page: 'model' })).toEqual({ page: 'model' });
    expect(resolveRoute(LATER, { page: 'problems' })).toEqual({ page: 'problems' });
  });

  it('opens the first view when the view is gone, and at the start', () => {
    expect(resolveRoute(LATER, { page: 'view', view: 'card-provider.context' })).toEqual({ page: 'view', view: 'shop.context' });
    expect(resolveRoute(LATER, { page: 'start' })).toEqual({ page: 'view', view: 'shop.context' });
  });

  it('stays at the start when there is no view', () => {
    expect(resolveRoute({ ...STATE, views: [], available: false }, containers)).toEqual({ page: 'start' });
  });
});

describe('what a new state does to a selection', () => {
  it('keeps a box, the boundary and an arrow that are still in the view', () => {
    expect(keptSelection(LATER, containers, { kind: 'box', id: 'customer' })).toEqual({ kind: 'box', id: 'customer' });
    expect(keptSelection(LATER, containers, { kind: 'box', id: 'shop' })).toEqual({ kind: 'box', id: 'shop' });
    expect(keptSelection(LATER, containers, { kind: 'arrow', id: 'customer~shop' })).toEqual({ kind: 'arrow', id: 'customer~shop' });
  });

  it('clears a box and an arrow that are gone', () => {
    expect(keptSelection(LATER, containers, { kind: 'box', id: 'order-api' })).toBeNull();
    expect(keptSelection(LATER, containers, { kind: 'arrow', id: 'order-api~card-provider' })).toBeNull();
  });

  it('clears a box when the view shown is not a view', () => {
    expect(keptSelection(LATER, { page: 'model' }, { kind: 'box', id: 'customer' })).toBeNull();
  });

  it('keeps a record chosen in the listing while the model has it, and clears it when it is gone', () => {
    expect(keptSelection(LATER, { page: 'model' }, { kind: 'record', id: 'orders-database' })).toEqual({ kind: 'record', id: 'orders-database' });
    expect(keptSelection(LATER, { page: 'model' }, { kind: 'record', id: 'order-api' })).toBeNull();
  });

  it('keeps no selection as none', () => {
    expect(keptSelection(LATER, containers, null)).toBeNull();
  });

  it('keeps what is passed through while the view lists it, and a piece of infrastructure chosen in the listing', () => {
    const desk = { page: 'view' as const, view: HARD_CONTAINERS.id };
    expect(keptSelection(HARD_STATE, desk, { kind: 'passed', id: 'balancer' })).toEqual({ kind: 'passed', id: 'balancer' });
    const later = { ...HARD_STATE, views: [{ ...HARD_CONTAINERS, passed: [] }] };
    expect(keptSelection(later, desk, { kind: 'passed', id: 'balancer' })).toBeNull();
    expect(keptSelection(HARD_STATE, { page: 'model' }, { kind: 'record', id: 'balancer' })).toEqual({ kind: 'record', id: 'balancer' });
  });

  it('keeps a step of a route whose record has an error in its file, while a connection passes through it', () => {
    const desk = { page: 'view' as const, view: HARD_CONTAINERS.id };
    expect(keptSelection(BROKEN_HOP_STATE, desk, { kind: 'record', id: 'balancer' })).toEqual({ kind: 'record', id: 'balancer' });
    const connections = BROKEN_HOP_STATE.model.connections.filter((one) => one.id !== 'web-calls-cards');
    expect(keptSelection({ ...BROKEN_HOP_STATE, model: { ...BROKEN_HOP_STATE.model, connections } }, desk, { kind: 'record', id: 'balancer' })).toBeNull();
  });
});

describe('which answers the page takes', () => {
  it('takes the picture of the view shown at the revision it holds', () => {
    expect(accepts(answerFor('shop.containers'), STATE, 'shop.containers')).toBe(true);
  });

  it('drops an answer for another revision, or for another view', () => {
    expect(accepts(answerFor('shop.containers', 'r0'), STATE, 'shop.containers')).toBe(false);
    expect(accepts(answerFor('shop.context'), STATE, 'shop.containers')).toBe(false);
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
