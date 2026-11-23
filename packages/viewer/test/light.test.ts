import { describe, expect, it } from 'vitest';
import { holds, litBy, litByKept, litByLegend } from '../src/light.ts';
import type { LegendKey, View, ViewBox } from '@seefore/core';
import { ARCHIVE_STATE, archiveView } from './archive.ts';
import { CONTAINERS, CONTEXT, HARD_CONTAINERS } from './fixture.ts';
import { studioView } from './studio.ts';

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

describe('what a line of the legend lights', () => {
  const containers = studioView('studio.containers');
  /** What a line of the legend of a view of the studio lights, as sorted lists. */
  const legend = (key: LegendKey, view = containers) => lit({ kind: 'legend', id: key }, view);

  it('lights every box of a look, and nothing else', () => {
    expect(legend('person')).toEqual({ boxes: ['editor'], arrows: [] });
    expect(legend('app')).toEqual({ boxes: ['api', 'web', 'worker'], arrows: [] });
    expect(legend('store')).toEqual({ boxes: ['records'], arrows: [] });
    expect(legend('queue-or-topic')).toEqual({ boxes: ['jobs'], arrows: [] });
    expect(legend('system')).toEqual({ boxes: ['crm'], arrows: [] });
    expect(legend('system-external')).toEqual({ boxes: ['payments'], arrows: [] });
    // The pieces that have a box; the office proxy and the edge, only passed through, are in the list under the legend.
    expect(legend('infrastructure')).toEqual({ boxes: ['gate', 'proxy'], arrows: [] });
  });

  it('lights the system in scope, and an external one in scope for both its lines', () => {
    expect(legend('system-scope', studioView('studio.context'))).toEqual({ boxes: ['studio'], arrows: [] });
    const payments = studioView('payments.context');
    expect(legend('system-scope-external', payments)).toEqual({ boxes: ['payments'], arrows: [] });
    expect(legend('system-external', payments)).toEqual({ boxes: ['payments'], arrows: [] });
  });

  it('lights the boundary, and every arrow', () => {
    expect(legend('boundary')).toEqual({ boxes: ['studio'], arrows: [] });
    expect(legend('arrow')).toEqual({ boxes: [], arrows: containers.arrows.map((arrow) => arrow.id).sort() });
  });

  it('lights each arrow for several connections, with a route, with a thing in brackets, with a ring or with the line of who opened, and not the boxes at their ends', () => {
    expect(legend('arrow-many')).toEqual({ boxes: [], arrows: ['web~api', 'worker~crm'] });
    expect(legend('route')).toEqual({ boxes: [], arrows: ['api~payments', 'editor~web'] });
    expect(legend('route-only')).toEqual({ boxes: [], arrows: ['editor~web'] });
    expect(legend('opened')).toEqual({ boxes: [], arrows: ['api~web'] });
    expect(legend('opened-some')).toEqual({ boxes: [], arrows: ['worker~crm'] });
  });

  it('lights for a thing in brackets an arrow that passes through it though its route line says only on how many', () => {
    // The context view: the edit and the reload share an arrow, so its line says `via on 1 of 2`.
    const context = studioView('studio.context');
    expect(context.arrows.find((arrow) => arrow.id === 'editor~studio')?.route?.line).toBe('via on 1 of 2');
    // Were the edge there only sometimes, the legend would explain the brackets the list puts it in.
    const view: View = {
      ...context,
      passed: context.passed.map((each) => ({ ...each, conditions: ['in the head office'] })),
      legend: [...context.legend, { key: 'route-only', text: '(Name) on a route' }],
    };
    expect(legend('route-only', view)).toEqual({ boxes: [], arrows: ['editor~studio'] });
  });

  it('lights every `only`: of a box, of the boundary and of an arrow', () => {
    expect(legend('only')).toEqual({ boxes: ['api', 'studio'], arrows: ['worker~crm'] });
    expect(legend('only', studioView('studio.context'))).toEqual({ boxes: ['studio'], arrows: ['proxy~studio', 'studio~crm', 'studio~payments'] });
  });

  it('lights every box that carries a mark: copies, passing through, kept stores', () => {
    expect(legend('loop')).toEqual({ boxes: ['worker'], arrows: [] });
    expect(legend('passing')).toEqual({ boxes: ['proxy'], arrows: [] });
    expect(legend('kept')).toEqual({ boxes: ['web'], arrows: [] });
  });

  it('lights for every line a view of the studio has, the studio holding every line there is', () => {
    const keys = new Set(['studio.context', 'studio.containers', 'payments.context'].flatMap((id) => studioView(id).legend.map((entry) => entry.key)));
    expect(keys.size).toBe(20);
    for (const id of ['studio.context', 'studio.containers', 'payments.context']) {
      const view = studioView(id);
      for (const { key } of view.legend) {
        const { boxes, arrows } = litByLegend(view, key);
        expect(boxes.size + arrows.size, `${key} in ${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('lights nothing for a line the view’s legend does not have', () => {
    expect(holds(CONTAINERS, { kind: 'legend', id: 'kept' })).toBe(false);
    expect(lit({ kind: 'legend', id: 'kept' })).toEqual({ boxes: [], arrows: [] });
    expect(holds(containers, { kind: 'legend', id: 'kept' })).toBe(true);
  });
});
