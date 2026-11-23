import type { Drawn, Picture, View } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { graphOf, sorted, straightened } from '../src/graph.ts';
import { layOut } from '../src/index.ts';
import { ELLIPSIS, widthOf } from '../src/measure.ts';
import {
  BOUNDARY_PADDING,
  BOX_HEIGHT,
  BOX_PADDING,
  BOX_TEXT_WIDTH,
  BOX_WIDTH,
  CONDITION_LINE_HEIGHT,
  LABEL_LINE_HEIGHT,
  LABEL_WIDTH,
  NAME_FONT,
  ROUTE_LINE_HEIGHT,
  TECHNOLOGY_LINE_HEIGHT,
  TITLE_FONT,
} from '../src/sizes.ts';
import { labelText } from '../src/text.ts';
import { onEdge, troubles, within } from './geometry.ts';
import { arrow, box, containerView, contextView, crowded, fan, inside, route, shopContainers, shopContext } from './views.ts';

/** The picture of a view, which the test needs drawn. */
async function drawn(view: View): Promise<Drawn> {
  const picture: Picture = await layOut(view);
  if ('failed' in picture) throw new Error(`The view was not drawn: ${picture.failed.message}`);
  return picture;
}

/** The place of a box in a picture. */
function placeOf(picture: Drawn, id: string) {
  const placed = picture.boxes.find((each) => each.id === id);
  if (placed === undefined) throw new Error(`No box ${id} in the picture.`);
  return placed;
}

/** The view with its boxes and arrows in the opposite order, and the boxes inside first. */
function reordered(view: View): View {
  return { ...view, boxes: [...view.boxes].reverse().sort((a, b) => Number(b.inside) - Number(a.inside)), arrows: [...view.arrows].reverse() };
}

describe('the layout of a view', () => {
  it('draws a view of one box', async () => {
    const picture = await drawn(contextView('alone', [box('alone', 'systems', { scope: true })], []));
    expect(picture).toEqual({
      view: 'alone.context',
      width: BOX_WIDTH + 24,
      height: BOX_HEIGHT + 24,
      boxes: [{ id: 'alone', x: 12, y: 12, width: BOX_WIDTH, height: BOX_HEIGHT, name: ['Alone'], line: '[System]', sentence: [], inset: { left: BOX_PADDING, right: BOX_PADDING } }],
      arrows: [],
    });
  });

  it('gives every box one size, its text in lines, and every arrow a route and a label', async () => {
    const picture = await drawn(shopContext());
    expect(picture.view).toBe('shop.context');
    expect(picture.boxes.map((each) => each.id)).toEqual(['card-provider', 'customer', 'shop', 'warehouse-clerk']);
    for (const placed of picture.boxes) expect([placed.width, placed.height]).toEqual([BOX_WIDTH, BOX_HEIGHT]);
    expect(placeOf(picture, 'card-provider')).toMatchObject({ name: ['Card provider'], line: '[System]', sentence: ['Takes card payments.'] });
    const pays = picture.arrows.find((each) => each.id === 'shop~card-provider');
    expect(pays).toMatchObject({ from: 'shop', to: 'card-provider', label: { lines: ['Takes the payment'], technology: '[HTTPS]' } });
    expect(pays?.sections.flat().length).toBeGreaterThanOrEqual(2);
    expect(picture.boundary).toBeUndefined();
    expect(picture.width).toBeGreaterThan(0);
  });

  it('puts the people in the first column', async () => {
    const picture = await drawn(shopContext());
    const left = Math.min(...picture.boxes.map((each) => each.x));
    expect(placeOf(picture, 'customer').x).toBe(left);
    expect(placeOf(picture, 'warehouse-clerk').x).toBe(left);
  });

  it('gives the same picture for the same view', async () => {
    for (const view of [shopContext(), shopContainers(), crowded(20, 10)]) expect(await layOut(view)).toEqual(await layOut(view));
  });

  it('gives the same picture whatever the order of the boxes and arrows', async () => {
    for (const view of [shopContext(), shopContainers(), fan(), crowded(20, 10)]) expect(await layOut(reordered(view))).toEqual(await layOut(view));
  });

  it.each([
    ['a context view', shopContext],
    ['a container view with arrows to and from its boundary', shopContainers],
    ['a fan of labelled arrows', fan],
    ['a crowded system', () => crowded(20, 10)],
  ])('lays no box over a box, and no label over a box, a line or a label, in %s', async (_, view) => {
    expect(troubles(await drawn(view()))).toEqual([]);
  });

  it('draws the boundary around the boxes inside it, and the others outside it', async () => {
    const picture = await drawn(shopContainers());
    const boundary = picture.boundary;
    if (boundary === undefined) throw new Error('No boundary.');
    for (const id of ['storefront', 'order-api', 'shipping', 'orders-database']) expect(within(placeOf(picture, id), boundary)).toBe(true);
    for (const id of ['customer', 'warehouse-clerk', 'card-provider', 'auditor']) expect(within(placeOf(picture, id), boundary)).toBe(false);
    expect(within(boundary, { x: 0, y: 0, width: picture.width, height: picture.height })).toBe(true);
  });

  it('runs an arrow to the boundary and one from it', async () => {
    const picture = await drawn(shopContainers());
    const boundary = picture.boundary;
    if (boundary === undefined) throw new Error('No boundary.');
    const into = picture.arrows.find((each) => each.id === 'auditor~shop');
    const out = picture.arrows.find((each) => each.id === 'shop~card-provider');
    expect(into?.label?.lines).toEqual(['Reads the books']);
    expect(onEdge(into?.sections.at(-1)?.at(-1) ?? { x: -1, y: -1 }, boundary)).toBe(true);
    expect(onEdge(out?.sections[0]?.[0] ?? { x: -1, y: -1 }, boundary)).toBe(true);
    expect(onEdge(out?.sections.at(-1)?.at(-1) ?? { x: -1, y: -1 }, placeOf(picture, 'card-provider'))).toBe(true);
  });

  it('runs an arrow from the boundary to a box inside it', async () => {
    const view = containerView('shop', [inside('order-api', 'apps'), box('card-provider', 'systems')], [arrow('shop', 'order-api', ['Starts the nightly run']), arrow('card-provider', 'order-api')]);
    const picture = await drawn(view);
    expect(troubles(picture)).toEqual([]);
  });

  it('puts the title of the boundary in its top padding, at its left', async () => {
    const picture = await drawn(shopContainers());
    const boundary = picture.boundary;
    expect(boundary?.title).toBe('shop [System]');
    expect(boundary?.titleAt).toEqual({
      x: (boundary?.x ?? 0) + BOUNDARY_PADDING.left,
      y: (boundary?.y ?? 0) + 12,
      width: widthOf('shop [System]', TITLE_FONT),
      height: 20,
    });
  });

  it('cuts the name in the title of a boundary narrower than it, and keeps its kind line whole', async () => {
    const name = 'The system that keeps every record of every customer';
    for (const line of ['[System]', '[System: external]']) {
      const picture = await drawn(containerView('long', [inside('one', 'apps')], [], name, line));
      const boundary = picture.boundary;
      const cut = boundary?.title.slice(0, -` ${line}`.length) ?? '';
      expect(boundary?.title.endsWith(`${ELLIPSIS} ${line}`)).toBe(true);
      expect(name.startsWith(cut.slice(0, -1))).toBe(true);
      expect(boundary?.titleAt.width).toBeLessThanOrEqual((boundary?.width ?? 0) - BOUNDARY_PADDING.left - BOUNDARY_PADDING.right);
    }
  });

  it('draws a boundary with nothing inside it at the size of one box, with its title', async () => {
    const picture = await drawn(containerView('empty', [box('someone', 'people')], [arrow('someone', 'empty')]));
    expect(picture.boundary).toMatchObject({ width: BOX_WIDTH + 48, height: BOX_HEIGHT + 68, title: 'empty [System]' });
    expect(troubles(picture)).toEqual([]);
  });

  it('breaks a name of 30 letters with no space into two lines', async () => {
    const picture = await drawn(contextView('a', [box('a', 'systems', { name: 'Abcdefghijklmnopqrstuvwxyzabcd', scope: true })], []));
    expect(placeOf(picture, 'a').name).toEqual(['Abcdefghijklmnopqrstuvwxyz', 'abcd']);
  });

  it('draws a name with an emoji and a name in Chinese', async () => {
    const view = contextView('a', [box('a', 'systems', { name: 'Shop 🛒', scope: true }), box('b', 'people', { name: '仓库管理员和订单处理人员' })], [arrow('b', 'a', ['管理订单'])]);
    const picture = await drawn(view);
    expect(placeOf(picture, 'a').name).toEqual(['Shop 🛒']);
    expect(placeOf(picture, 'b').name).toEqual(['仓库管理员和订单处理', '人员']);
    expect(picture.arrows[0]?.label?.lines).toEqual(['管理订单']);
    expect(picture.arrows[0]?.label?.width).toBe(64);
    for (const placed of picture.boxes) for (const line of placed.name) expect(widthOf(line, NAME_FONT)).toBeLessThanOrEqual(BOX_TEXT_WIDTH);
  });

  it('gives the route line its place in the label, between the names and the technology', async () => {
    const view = shopContainers();
    const routed: View = {
      ...view,
      arrows: view.arrows.map((each) => (each.id === 'storefront~order-api' ? { ...each, route: route(['Ingress', 'Workhorse']) } : each)),
    };
    const picture = await drawn(routed);
    const label = picture.arrows.find((each) => each.id === 'storefront~order-api')?.label;
    expect(label).toMatchObject({ lines: ['Places an order'], route: 'via Ingress, Workhorse', technology: '[HTTPS]' });
    expect(label?.height).toBe(LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
    expect(troubles(picture)).toEqual([]);
    // The other labels have none.
    expect(picture.arrows.filter((each) => each.label?.route !== undefined).map((each) => each.id)).toEqual(['storefront~order-api']);
  });

  it('gives a piece of infrastructure a box of the size of every box, outside the boundary', async () => {
    const view = containerView('shop', [inside('order-api', 'apps'), box('proxy', 'infrastructure', { line: '[Infrastructure · nginx]' })], [arrow('proxy', 'order-api', ['Checks that it answers'])]);
    const picture = await drawn(view);
    expect(placeOf(picture, 'proxy')).toMatchObject({ width: BOX_WIDTH, height: BOX_HEIGHT, line: '[Infrastructure · nginx]' });
    expect(within(placeOf(picture, 'proxy'), picture.boundary ?? { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
    expect(troubles(picture)).toEqual([]);
  });

  it('gives a piece of infrastructure that is part of the system its box inside the boundary', async () => {
    const view = containerView('shop', [inside('order-api', 'apps'), box('gate', 'infrastructure', { inside: true })], [arrow('gate', 'order-api', ['Checks that it answers'])]);
    const picture = await drawn(view);
    expect(within(placeOf(picture, 'gate'), picture.boundary ?? { x: 0, y: 0, width: 0, height: 0 })).toBe(true);
    expect(troubles(picture)).toEqual([]);
  });

  it('gives the `only` line and the line of who opened the channel their place in the label, between the route and the technology', async () => {
    const view = shopContainers();
    const marked: View = {
      ...view,
      arrows: view.arrows.map((each) =>
        each.id === 'order-api~card-provider'
          ? { ...each, route: route(['(Office proxy)']), only: { count: 1, all: false, line: 'only on 1 of 2' }, opened: { count: 1, all: false, line: 'far side opened on 1 of 2' } }
          : each,
      ),
      boxes: view.boxes.map((each) => (each.id === 'shipping' ? { ...each, only: 'in the hosted edition' } : each)),
    };
    const picture = await drawn(marked);
    const label = picture.arrows.find((each) => each.id === 'order-api~card-provider')?.label;
    expect(label).toMatchObject({
      lines: ['Takes the payment', 'Refunds a payment'],
      route: 'via (Office proxy)',
      only: ['only on 1 of 2'],
      opened: 'far side opened on 1 of 2',
      technology: '[HTTPS]',
    });
    expect(label?.height).toBe(2 * LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + 2 * CONDITION_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
    expect(placeOf(picture, 'shipping')).toMatchObject({ height: BOX_HEIGHT, only: 'only in the hosted edition' });
    expect(placeOf(picture, 'storefront')).not.toHaveProperty('only');
    expect(troubles(picture)).toEqual([]);
  });

  it('says so in words a reader can use when the layout throws', async () => {
    const picture = await layOut(contextView('a', [box('a', 'systems', { scope: true })], [arrow('a', 'nowhere')]));
    expect(picture).toEqual({
      view: 'a.context',
      failed: { reason: 'crash', message: 'This view could not be laid out, so it is not drawn. The other views still draw. The layout engine said: “Referenced shape does not exist: nowhere”.' },
    });
  });
});

describe('the graph ELK is given', () => {
  it('splits the long row of a context view of 16 boxes or more, and of no other', () => {
    const many = (count: number) => contextView('a', [box('a', 'systems', { scope: true }), ...Array.from({ length: count - 1 }, (_, at) => box(`s${at}`, 'systems'))], []);
    const unzipped = (view: View) => graphOf(sorted(view), new Map()).layoutOptions?.['elk.layered.layerUnzipping.strategy'];
    expect(unzipped(many(16))).toBe('ALTERNATING');
    expect(unzipped(many(15))).toBeUndefined();
    expect(unzipped(crowded(20, 10))).toBeUndefined();
  });

  it('keeps the order of the walk in every column, on the root and on the boundary', () => {
    const graph = graphOf(sorted(shopContainers()), new Map());
    const boundary = graph.children?.find((child) => child.id === 'shop');
    expect(graph.layoutOptions?.['elk.layered.crossingMinimization.semiInteractive']).toBe('true');
    expect(boundary?.layoutOptions?.['elk.layered.crossingMinimization.semiInteractive']).toBe('true');
    // Each box at the place of its turn, and the boundary at the turn of the first box inside it: see `turnsOf`.
    const places = Object.fromEntries([...(graph.children ?? []), ...(boundary?.children ?? [])].map((child) => [child.id, child.layoutOptions?.['elk.position']]));
    expect(places).toEqual({
      auditor: '(0, 0)',
      shop: '(0, 600)',
      'card-provider': '(0, 400)',
      'order-api': '(0, 600)',
      'orders-database': '(0, 800)',
      storefront: '(0, 1000)',
      shipping: '(0, 1200)',
      customer: '(0, 1400)',
      'warehouse-clerk': '(0, 1600)',
    });
  });

  it('gives ELK every label 140 px wide, room for three lines of a single name, and for the lines the arrow has', () => {
    const view = shopContainers();
    const routed: View = { ...view, arrows: view.arrows.map((each) => (each.id === 'storefront~order-api' ? { ...each, route: route(['Ingress']) } : each)) };
    const input = sorted(routed);
    const labels = new Map(input.arrows.flatMap((each) => {
      const text = labelText(each);
      return text === undefined ? [] : [[each.id, text] as const];
    }));
    const rooms = Object.fromEntries((graphOf(input, labels).edges ?? []).map((edge) => [edge.id, edge.labels?.map((label) => [label.width, label.height])]));
    expect(rooms).toMatchObject({
      // One name of one line, and its technology.
      'storefront~order-api': [[LABEL_WIDTH, 3 * LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT]],
      'customer~storefront': [[LABEL_WIDTH, 3 * LABEL_LINE_HEIGHT]],
      // Two names, a line each.
      'order-api~card-provider': [[LABEL_WIDTH, 2 * LABEL_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT]],
    });
  });

  it('sets no model order, which would break ties against the walk, and the spacing and node placement on the boundary too', () => {
    const graph = graphOf(sorted(shopContainers()), new Map());
    expect(graph.layoutOptions).not.toHaveProperty('elk.layered.considerModelOrder.strategy');
    const boundary = graph.children?.find((child) => child.id === 'shop');
    expect(boundary?.layoutOptions).not.toHaveProperty('elk.layered.considerModelOrder.strategy');
    for (const key of ['elk.spacing.nodeNode', 'elk.layered.spacing.nodeNodeBetweenLayers', 'elk.spacing.edgeLabel', 'elk.layered.nodePlacement.strategy', 'elk.layered.thoroughness']) {
      expect(boundary?.layoutOptions?.[key]).toBe(graph.layoutOptions?.[key]);
    }
    expect(boundary?.children?.map((child) => child.id)).toEqual(['order-api', 'orders-database', 'shipping', 'storefront']);
  });

  it('puts a person in the first column, and no other box', () => {
    const graph = graphOf(sorted(shopContext()), new Map());
    const first = (graph.children ?? []).filter((child) => child.layoutOptions?.['elk.layered.layering.layerConstraint'] === 'FIRST').map((child) => child.id);
    expect(first).toEqual(['customer', 'warehouse-clerk']);
  });

  it('never sets a layering that hangs or crashes ELK', () => {
    const graph = graphOf(sorted(shopContainers()), new Map());
    const all = [graph.layoutOptions, ...(graph.children ?? []).map((child) => child.layoutOptions)];
    for (const options of all) expect(options?.['elk.layered.layering.strategy']).toBeUndefined();
  });
});

describe('a stretch of a route', () => {
  it('loses a step of under a pixel that ELK leaves where a line crosses the boundary', () => {
    const route = [
      { x: 252, y: 132 },
      { x: 292, y: 132 },
      { x: 292, y: 305 },
      { x: 531, y: 304.5 },
      { x: 1603, y: 304.5 },
    ];
    expect(straightened(route)).toEqual([
      { x: 252, y: 132 },
      { x: 292, y: 132 },
      { x: 292, y: 304.5 },
      { x: 1603, y: 304.5 },
    ]);
  });

  it('keeps its start, and its end where a bend can move instead', () => {
    expect(straightened([{ x: 529, y: 3950 }, { x: 549, y: 3949.5 }, { x: 549, y: 4100 }])).toEqual([{ x: 529, y: 3950 }, { x: 549, y: 3950 }, { x: 549, y: 4100 }]);
    expect(straightened([{ x: 282, y: 3078 }, { x: 529, y: 3078.12 }])).toEqual([{ x: 282, y: 3078 }, { x: 529, y: 3078 }]);
  });

  it('is left as it is when it has right angles', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ];
    expect(straightened(route)).toEqual(route);
  });
});
