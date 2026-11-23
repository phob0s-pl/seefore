import type { Drawn, PlacedLabel, View, ViewArrow } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { sorted, turnsOf } from '../src/graph.ts';
import { layOut } from '../src/index.ts';
import { change, placesOf } from './change.ts';
import type { Change } from './change.ts';
import { troubles } from './geometry.ts';
import { arrow, box, containerView, contextView, grown, inside, movedOut, neighbourhood, route, shopContainers, tiered, withApp, withArrow, withNeighbour, without } from './views.ts';

/**
 * What holds a picture still when the model changes, as `docs/layout.md` says under "What
 * holds": the same view gives the same picture, a new name or description moves nothing, and
 * one edit keeps the order of the boxes. On views made by code, of the shape real models have.
 */

/** The picture of a view, which the test needs drawn. */
async function drawn(view: View): Promise<Drawn> {
  const picture = await layOut(view);
  if ('failed' in picture) throw new Error(`The view was not drawn: ${picture.failed.message}`);
  return picture;
}

/** The view with its boxes and arrows handed over in another order: the inside first, each group turned round. */
function reordered(view: View): View {
  return { ...view, boxes: [...view.boxes].reverse().sort((a, b) => Number(b.inside) - Number(a.inside)), arrows: [...view.arrows].reverse() };
}

/** The view with one arrow changed. */
function withArrowAs(view: View, id: string, change: (each: ViewArrow) => ViewArrow): View {
  if (!view.arrows.some((each) => each.id === id)) throw new Error(`No arrow ${id} in the view.`);
  return { ...view, arrows: view.arrows.map((each) => (each.id === id ? change(each) : each)) };
}

/** The view with a box's name changed. */
function withBoxName(view: View, id: string, name: string): View {
  if (!view.boxes.some((each) => each.id === id)) throw new Error(`No box ${id} in the view.`);
  return { ...view, boxes: view.boxes.map((each) => (each.id === id ? { ...each, name } : each)) };
}

/** The view with a piece of infrastructure outside, of the name given, that passes requests on to the hub. */
function withGateway(view: View, name: string): View {
  return { ...view, boxes: [...view.boxes, box('gateway', 'infrastructure', { name, line: '[Infrastructure · nginx]' })], arrows: [...view.arrows, arrow('gateway', 'core', ['Passes requests on'])] };
}

/** The middle of a label, which is the middle of the room ELK gave it. */
function middleOf(label: PlacedLabel | undefined): [number, number] {
  return label === undefined ? [Number.NaN, Number.NaN] : [label.x + label.width / 2, label.y + label.height / 2];
}

/** A name of one connection that takes three lines of a label. */
const LONG = 'Sends every order that is ready to ship, with its lines and its address, once an hour';

/** The first arrow of a view that matches, by id. */
function firstArrow(view: View, test: (each: ViewArrow) => boolean): ViewArrow {
  const found = [...view.arrows].sort((a, b) => (a.id < b.id ? -1 : 1)).find(test);
  if (found === undefined) throw new Error('No such arrow in the view.');
  return found;
}

describe('the order of a walk', () => {
  it('starts at the people that nothing acts on, then takes the boxes joined to each box in turn, in order of id', () => {
    const turns = turnsOf(sorted(shopContainers()));
    const order = [...turns.entries()].filter(([id]) => id !== 'shop').sort((a, b) => a[1] - b[1]).map(([id]) => id);
    // The auditor starts it. The system it reads from leads on to the card provider, the Order API and what that is joined to.
    expect(order).toEqual(['auditor', 'card-provider', 'order-api', 'orders-database', 'storefront', 'shipping', 'customer', 'warehouse-clerk']);
    // The boundary has the turn of the first box inside it.
    expect(turns.get('shop')).toBe(turns.get('order-api'));
  });

  it('takes the people before the other boxes that nothing acts on, each in order of id', () => {
    const view = contextView('mid', [box('mid', 'systems', { scope: true }), box('zed', 'people'), box('able', 'systems'), box('ken', 'people')], [arrow('able', 'mid'), arrow('zed', 'mid'), arrow('ken', 'mid')]);
    const turns = turnsOf(sorted(view));
    expect([...turns.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(['ken', 'mid', 'able', 'zed']);
  });

  it('starts at a box of a circle that no start reaches, the first of the circle by id', () => {
    // Every box is acted on. `alpha` hangs on the circle and comes first by id, but is in no circle.
    const view = containerView(
      'ring',
      ['alpha', 'beta', 'delta', 'gamma'].map((id) => inside(id, 'apps')),
      [arrow('beta', 'gamma'), arrow('gamma', 'delta'), arrow('delta', 'beta'), arrow('beta', 'alpha')],
    );
    const turns = turnsOf(sorted(view));
    expect([...turns.entries()].filter(([id]) => id !== 'ring').sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(['beta', 'alpha', 'delta', 'gamma']);
  });

  it('gives a turn to every box of two circles that nothing joins, and draws them', async () => {
    const view = containerView(
      'rings',
      ['a1', 'a2', 'a3', 'b1', 'b2'].map((id) => inside(id, 'apps')),
      [arrow('a1', 'a2'), arrow('a2', 'a3'), arrow('a3', 'a1'), arrow('b2', 'b1'), arrow('b1', 'b2')],
    );
    // The boundary, which nothing acts on, starts the walk; each circle then starts at its first box by id.
    const turns = turnsOf(sorted(view));
    expect(['a1', 'a2', 'a3', 'b1', 'b2'].map((id) => turns.get(id))).toEqual([1, 2, 3, 4, 5]);
    expect(troubles(await drawn(view))).toEqual([]);
  });

  it('takes every box of a view with no arrow as a start: the people, then the others, in order of id', async () => {
    const view = containerView('quiet', [inside('worker', 'apps'), inside('archive', 'stores'), box('visitor', 'people'), box('admin', 'people'), box('bank', 'systems')], []);
    const turns = turnsOf(sorted(view));
    expect([...turns.entries()].filter(([id]) => id !== 'quiet').sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(['admin', 'visitor', 'archive', 'bank', 'worker']);
    const picture = await drawn(view);
    expect(troubles(picture)).toEqual([]);
    expect(picture.boxes).toHaveLength(5);
  });

  it('does not depend on the order in which the boxes and arrows are handed over', async () => {
    for (const view of [shopContainers(), grown(45), neighbourhood(16)]) {
      expect(turnsOf(reordered(view))).toEqual(turnsOf(view));
      expect(await layOut(reordered(view))).toEqual(await layOut(view));
    }
  });

  it.each([
    ['a container view', () => shopContainers()],
    ['a container view of real shape', () => grown(45)],
    ['another of real shape', () => grown(30, 2)],
    ['a context view of 16 boxes', () => neighbourhood(16)],
  ])('is the order of every column, top to bottom, in %s', async (_, make) => {
    const view = make();
    const turns = turnsOf(sorted(view));
    const picture = await drawn(view);
    const inside = new Set(view.boxes.filter((each) => each.inside).map((each) => each.id));
    // The boxes inside and those outside stand in columns of their own.
    for (const group of [true, false]) {
      const boxes = picture.boxes.filter((each) => inside.has(each.id) === group);
      for (const x of new Set(boxes.map((each) => each.x))) {
        const column = boxes.filter((each) => each.x === x).sort((a, b) => a.y - b.y);
        const order = column.map((each) => turns.get(each.id) ?? -1);
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }
    }
    expect(troubles(picture)).toEqual([]);
  });
});

describe('a new name', () => {
  const view = grown(40, 3);
  const routed = firstArrow(view, (each) => each.route !== undefined);
  const single = firstArrow(view, (each) => each.names.length === 1 && each.route === undefined && each.only === undefined && each.technology.length > 0);
  const several = firstArrow(view, (each) => each.names.length > 1 && each.route === undefined);

  it.each<[string, (view: View) => View, (view: View) => View]>([
    ['an app inside', (v) => v, (v) => withBoxName(v, 'app-07', 'The app that does the seventh part of the work of the system')],
    ['a store', (v) => v, (v) => withBoxName(v, 'store-03', 'Store three, which keeps what the third part of the work needs')],
    ['a person', (v) => v, (v) => withBoxName(v, 'person-02', 'A person with a name long enough for two lines')],
    ['a system outside', (v) => v, (v) => withBoxName(v, 'system-04', 'S4')],
    ['a piece of infrastructure', (v) => withGateway(v, 'Gateway'), (v) => withGateway(v, 'The gateway in front of every service of the system')],
    ['the system in scope', (v) => v, (v) => ({ ...v, boundary: { id: 'estate', name: 'The estate of every service the company runs', line: '[System]', title: 'The estate of every service the company runs [System]' } })],
    ['a thing on a route', (v) => v, (v) => withArrowAs(v, routed.id, (each) => ({ ...each, route: route(['The gateway in front of every service of the system']) }))],
    ['a single connection, from one word to three lines', (v) => withArrowAs(v, single.id, (each) => ({ ...each, names: ['Uses'] })), (v) => withArrowAs(v, single.id, (each) => ({ ...each, names: [LONG] }))],
    ['a connection in an arrow of several', (v) => v, (v) => withArrowAs(v, several.id, (each) => ({ ...each, names: [...each.names.slice(0, -1), LONG] }))],
    [
      'a technology',
      (v) => v,
      (v) => ({
        ...v,
        boxes: v.boxes.map((each) => ({ ...each, line: each.line.replace('Go', 'Go, the language of the services') })),
        arrows: v.arrows.map((each) => ({ ...each, technology: each.technology.map((name) => (name === 'HTTPS' ? 'HTTPS with mutual TLS' : name)) })),
      }),
    ],
  ])('of %s moves nothing but its words, which stand in the middle of the same room', async (_, was, now) => {
    const before = await drawn(was(view));
    const after = await drawn(now(view));
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    expect(placesOf(after)).toBe(placesOf(before));
    for (const [at, each] of after.arrows.entries()) {
      const [x, y] = middleOf(each.label);
      const [oldX, oldY] = middleOf(before.arrows[at]?.label);
      expect(x).toBeCloseTo(oldX, 6);
      expect(y).toBeCloseTo(oldY, 6);
    }
  });

  it('gives the label of a picture the size of its words, not of its room', async () => {
    const one = await drawn(withArrowAs(view, single.id, (each) => ({ ...each, names: ['Uses'] })));
    const three = await drawn(withArrowAs(view, single.id, (each) => ({ ...each, names: [LONG] })));
    const short = one.arrows.find((each) => each.id === single.id)?.label;
    const long = three.arrows.find((each) => each.id === single.id)?.label;
    expect(short?.lines).toEqual(['Uses']);
    expect(long?.lines).toHaveLength(3);
    expect(short?.height).toBeLessThan(long?.height ?? 0);
    expect(short?.width).toBeLessThan(long?.width ?? 0);
  });
});

describe('one edit to a container view of real shape', () => {
  /** Three systems in tiers, of 38, 53 and 63 boxes, each with one hub that most services call. */
  const views = [tiered(30, 1), tiered(45, 1), tiered(55, 2)];

  /** Four apps spread over the view by id, and never the hub: when the hub goes, the picture is rebuilt. */
  const targetsOf = (view: View) => {
    const apps = view.boxes.filter((each) => each.inside && each.family === 'apps' && each.id !== 'core').map((each) => each.id).sort();
    return [0, 1, 2, 3].map((at) => apps[Math.round((at * (apps.length - 1)) / 3)] ?? '');
  };
  const storeOf = (view: View, at: number) => view.boxes.filter((each) => each.family === 'stores').map((each) => each.id).sort()[at] ?? '';

  it.each<[string, (view: View, target: string) => View]>([
    ['a connection added', (view, target) => withArrow(view, target, storeOf(view, 0))],
    ['an app added', (view, target) => withApp(view, 'new-app', target, storeOf(view, 1))],
    ['an app taken out', (view, target) => without(view, target)],
    ['an app moved to a system outside', (view, target) => movedOut(view, target, 'system-02')],
    ['a new system outside', (view, target) => withNeighbour(view, 'new-system', target)],
  ])('keeps 95 % of the order in a column and 75 % of all the order, after %s', async (_, edit) => {
    const changes: Change[] = [];
    for (const view of views) {
      const before = await drawn(view);
      for (const target of targetsOf(view)) changes.push(change(before, await drawn(edit(view, target))));
    }
    const mean = (key: 'columnOrder' | 'orderKept') => changes.reduce((sum, each) => sum + each[key], 0) / changes.length;
    expect(mean('columnOrder')).toBeGreaterThanOrEqual(0.95);
    expect(Math.min(...changes.map((each) => each.columnOrder))).toBeGreaterThanOrEqual(0.75);
    expect(mean('orderKept')).toBeGreaterThanOrEqual(0.75);
  }, 60_000);
});

describe('one neighbour more or less in a context view', () => {
  const sizes = [14, 15, 16, 17, 18];

  it.each(sizes)('of %i boxes keeps 90 % of the order, when the neighbour is the last of its column in the walk', async (count) => {
    const view = neighbourhood(count);
    const before = await drawn(view);
    const last = view.boxes.filter((each) => each.family === 'systems' && !each.scope).map((each) => each.id).sort().at(-1) ?? '';
    const more: View = { ...view, boxes: [...view.boxes, box('zz-new', 'systems')], arrows: [...view.arrows, arrow('hub', 'zz-new', ['Asks the new system'])] };
    for (const after of [await drawn(without(view, last)), await drawn(more)]) {
      const moved = change(before, after);
      expect(moved.orderKept).toBeGreaterThanOrEqual(0.9);
      expect(moved.columnOrder).toBe(1);
    }
  });

  it.each(sizes)('of %i boxes keeps the order down every column, and 80 % of all the order, whichever neighbour goes', async (count) => {
    // The long column is split by giving its boxes to one side and the other in turn, so a box
    // taken from its middle sends every box after it to the other side: the order across is
    // lost for those, and the order down each side is kept. A neighbour at the front of the
    // column keeps least: about 60 %.
    const view = neighbourhood(count);
    const before = await drawn(view);
    const kept: number[] = [];
    for (const gone of view.boxes.filter((each) => !each.scope)) {
      const moved = change(before, await drawn(without(view, gone.id)));
      expect(moved.columnOrder).toBe(1);
      kept.push(moved.orderKept);
    }
    expect(kept.reduce((sum, each) => sum + each, 0) / kept.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe('a new description', () => {
  it('moves nothing', async () => {
    const view = grown(40, 3);
    // A third of the boxes get a longer description, and a third lose theirs.
    const described: View = {
      ...view,
      boxes: view.boxes.map((each, at) => {
        const { sentence: _, ...rest } = each;
        return at % 3 === 0 ? { ...each, sentence: 'A first sentence long enough to fill every line of the box it is in, and to be cut at the end of its fourth line.' } : at % 3 === 1 ? rest : each;
      }),
    };
    const before = await drawn(view);
    const after = await drawn(described);
    expect(JSON.stringify(after.boxes)).not.toBe(JSON.stringify(before.boxes));
    expect(placesOf(after)).toBe(placesOf(before));
  });
});
