import type { Drawn } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { HANDLE_IN, HANDLE_OUT, HEAD_LENGTH, RING_GAP, RING_RADIUS, arrowSaid, boxSaid, headOf, labelLines, pathOf, relativeTo, ringOf, toFlow } from '../src/flow.ts';
import { LINE_HEIGHT } from '../src/theme.ts';
import { CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE, HARD_CONTAINERS, HARD_PICTURE } from './fixture.ts';

/** A picture as React Flow's nodes and edges: parents first, children from their parent, the routes as they are. */

describe('places relative to the parent', () => {
  it('takes the parent’s place from the child’s', () => {
    expect(relativeTo({ x: 464, y: 104 }, { x: 440, y: 40 })).toEqual({ x: 24, y: 64 });
    expect(relativeTo({ x: 10.5, y: 3 }, { x: 0, y: 0 })).toEqual({ x: 10.5, y: 3 });
  });

  it('puts the boundary first, and each box inside it from its top left', () => {
    const { nodes } = toFlow(CONTAINERS, CONTAINER_PICTURE);
    expect(nodes[0]).toMatchObject({ id: 'shop', type: 'boundary', position: { x: 440, y: 40 }, width: 700, height: 400 });
    expect(nodes.find((node) => node.id === 'order-api')).toMatchObject({ parentId: 'shop', position: { x: 24, y: 64 }, width: 240, height: 150 });
    expect(nodes.find((node) => node.id === 'orders-database')).toMatchObject({ parentId: 'shop', position: { x: 434, y: 64 } });
  });

  it('leaves a box outside the boundary at its place, with no parent', () => {
    const { nodes } = toFlow(CONTAINERS, CONTAINER_PICTURE);
    const customer = nodes.find((node) => node.id === 'customer');
    expect(customer).toMatchObject({ position: { x: 40, y: 200 } });
    expect(customer?.parentId).toBeUndefined();
  });

  it('has no boundary in a context view, and every box at its place', () => {
    const { nodes } = toFlow(CONTEXT, CONTEXT_PICTURE);
    expect(nodes.map((node) => node.type)).toEqual(['box', 'box', 'box']);
    expect(nodes.every((node) => node.parentId === undefined)).toBe(true);
    expect(nodes.find((node) => node.id === 'shop')?.position).toEqual({ x: 460, y: 90 });
  });

  it('gives every node a handle in and out, and every edge ends at them', () => {
    const { nodes, edges } = toFlow(CONTAINERS, CONTAINER_PICTURE);
    for (const node of nodes) expect(node.handles?.map((handle) => handle.id)).toEqual([HANDLE_IN, HANDLE_OUT]);
    for (const edge of edges) expect(edge).toMatchObject({ sourceHandle: HANDLE_OUT, targetHandle: HANDLE_IN, type: 'arrow' });
  });

  it('makes nothing draggable, connectable or selectable by React Flow', () => {
    const { nodes, edges } = toFlow(CONTAINERS, CONTAINER_PICTURE);
    for (const node of nodes) expect(node).toMatchObject({ draggable: false, connectable: false, selectable: false });
    for (const edge of edges) expect(edge.selectable).toBe(false);
  });

  it('draws an arrow that ends at the boundary from and to the nodes it names', () => {
    const { edges } = toFlow(CONTAINERS, CONTAINER_PICTURE);
    expect(edges.find((edge) => edge.id === 'customer~shop')).toMatchObject({ source: 'customer', target: 'shop' });
  });

  it('leaves out a box or an arrow that the view does not hold', () => {
    const drawn: Drawn = {
      ...CONTEXT_PICTURE,
      boxes: [...CONTEXT_PICTURE.boxes, { id: 'stranger', x: 0, y: 0, width: 240, height: 150, name: ['Stranger'], line: '[Person]', sentence: [], inset: { left: 12, right: 12 } }],
      arrows: [...CONTEXT_PICTURE.arrows, { id: 'stranger~shop', from: 'stranger', to: 'shop', sections: [] }],
    };
    const { nodes, edges } = toFlow(CONTEXT, drawn);
    expect(nodes.map((node) => node.id)).not.toContain('stranger');
    expect(edges.map((edge) => edge.id)).not.toContain('stranger~shop');
  });
});

describe('the path of a route', () => {
  it('is a line through the points of each stretch, in order', () => {
    expect(pathOf([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }]])).toBe('M0,0 L10,0 L10,20');
  });

  it('starts each stretch afresh', () => {
    expect(
      pathOf([
        [{ x: 0, y: 0 }, { x: 5, y: 0 }],
        [{ x: 5, y: 0 }, { x: 5, y: 9 }],
      ]),
    ).toBe('M0,0 L5,0 M5,0 L5,9');
  });

  it('keeps two places of a fraction and leaves out an empty stretch', () => {
    expect(pathOf([[], [{ x: 1.23456, y: 2.005 }, { x: 3, y: 4 }]])).toBe('M1.23,2.01 L3,4');
    expect(pathOf([])).toBe('');
  });
});

describe('the head of an arrow', () => {
  /** The points of a head, as numbers. */
  function points(head: string | undefined): number[][] {
    return (head ?? '').split(' ').map((point) => point.split(',').map(Number));
  }

  it('has its tip at the last point and points along the last stretch', () => {
    const [tip, left, right] = points(headOf([[{ x: 0, y: 0 }, { x: 100, y: 0 }]]));
    expect(tip).toEqual([100, 0]);
    expect(left?.[0]).toBe(100 - HEAD_LENGTH);
    expect(right?.[0]).toBe(100 - HEAD_LENGTH);
  });

  it('points down a stretch that goes down, past a last point given twice', () => {
    const [tip, left] = points(headOf([[{ x: 5, y: 0 }, { x: 5, y: 50 }, { x: 5, y: 50 }]]));
    expect(tip).toEqual([5, 50]);
    expect(left?.[1]).toBe(50 - HEAD_LENGTH);
  });

  it('is missing for a route with no length', () => {
    expect(headOf([])).toBeUndefined();
    expect(headOf([[{ x: 1, y: 1 }]])).toBeUndefined();
  });
});

describe('the lines of a label', () => {
  it('stacks the names and the technology in the middle of the label’s place', () => {
    const lines = labelLines({ x: 0, y: 100, width: 120, height: 64, lines: ['One', 'Two'], technology: '[HTTPS]' });
    const height = 2 * LINE_HEIGHT.label + LINE_HEIGHT.technology;
    const top = 100 + (64 - height) / 2;
    expect(lines).toEqual([
      { text: 'One', y: top + LINE_HEIGHT.label / 2, kind: 'name' },
      { text: 'Two', y: top + LINE_HEIGHT.label * 1.5, kind: 'name' },
      { text: '[HTTPS]', y: top + 2 * LINE_HEIGHT.label + LINE_HEIGHT.technology / 2, kind: 'technology' },
    ]);
  });

  it('puts the route under the names and above the technology', () => {
    const lines = labelLines({ x: 0, y: 100, width: 120, height: 60, lines: ['One', 'Two'], route: 'via Ingress', technology: '[HTTPS]' });
    const height = 2 * LINE_HEIGHT.label + LINE_HEIGHT.route + LINE_HEIGHT.technology;
    const top = 100 + (60 - height) / 2;
    expect(lines.map((line) => line.kind)).toEqual(['name', 'name', 'route', 'technology']);
    expect(lines[2]).toEqual({ text: 'via Ingress', y: top + 2 * LINE_HEIGHT.label + LINE_HEIGHT.route / 2, kind: 'route' });
    expect(lines[3]?.y).toBe(top + 2 * LINE_HEIGHT.label + LINE_HEIGHT.route + LINE_HEIGHT.technology / 2);
  });

  it('draws the lines it is given and breaks none', () => {
    const long = 'A name far too long for a label of this width';
    expect(labelLines({ x: 0, y: 0, width: 40, height: 15, lines: [long] }).map((line) => line.text)).toEqual([long]);
  });

  it('puts the `only` line and the line of who opened the channel under the route, in that order, and above the technology', () => {
    const lines = labelLines({
      x: 0,
      y: 100,
      width: 160,
      height: 80,
      lines: ['One'],
      route: 'via (Office proxy)',
      only: ['only on 1 of 2'],
      opened: 'far side opened on 1 of 2',
      technology: '[HTTPS]',
    });
    const height = LINE_HEIGHT.label + LINE_HEIGHT.route + 2 * LINE_HEIGHT.condition + LINE_HEIGHT.technology;
    const top = 100 + (80 - height) / 2;
    expect(lines.map((line) => line.kind)).toEqual(['name', 'route', 'only', 'opened', 'technology']);
    expect(lines[2]).toEqual({ text: 'only on 1 of 2', y: top + LINE_HEIGHT.label + LINE_HEIGHT.route + LINE_HEIGHT.condition / 2, kind: 'only' });
    expect(lines[3]?.y).toBe(top + LINE_HEIGHT.label + LINE_HEIGHT.route + LINE_HEIGHT.condition * 1.5);
  });

  it('draws the words of a condition in the two lines the picture broke them into', () => {
    const lines = labelLines({ x: 0, y: 0, width: 140, height: 43, lines: ['Checks a login'], only: ['only when LDAP', 'authentication is configured'] });
    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ['name', 'Checks a login'],
      ['only', 'only when LDAP'],
      ['only', 'authentication is configured'],
    ]);
    expect((lines[2]?.y ?? 0) - (lines[1]?.y ?? 0)).toBe(LINE_HEIGHT.condition);
  });
});

describe('the ring of a channel the far side opened', () => {
  it('stands on the line just before the head: the head, a little room and its radius back from the tip', () => {
    expect(ringOf([[{ x: 0, y: 50 }, { x: 100, y: 50 }]])).toEqual({ x: 100 - HEAD_LENGTH - RING_GAP - RING_RADIUS, y: 50 });
  });

  it('keeps to the line round a bend when the last stretch is shorter than that', () => {
    expect(ringOf([[{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 10, y: 40 }]])).toEqual({ x: 0, y: 40 - (HEAD_LENGTH + RING_GAP + RING_RADIUS - 10) });
  });

  it('is missing on a route too short to hold it', () => {
    expect(ringOf([[{ x: 0, y: 0 }, { x: 10, y: 0 }]])).toBeUndefined();
  });
});

describe('what a screen reader is told of the marks of stage 6b', () => {
  it('says a box’s own `only` and how many stores it keeps', () => {
    const box = { id: 'desk', family: 'apps' as const, look: 'app' as const, name: 'Desk', line: '[App]', only: 'in the hosted edition', scope: false, inside: true, loops: [], within: [], passing: [], kept: ['drafts'] };
    expect(boxSaid(box)).toBe('Desk, [App]. Only in the hosted edition. It keeps 1 store, drawn at it.');
  });

  it('says on an arrow when its connections are there, and that the far side opened their channel', () => {
    const arrow = { id: 'a~b', from: 'a', to: 'b', connections: ['one'], names: ['Tells'], technology: [], only: { count: 1, all: true, words: 'at night', line: 'only at night' }, opened: { count: 1, all: true } };
    expect(arrowSaid(arrow, new Map([['a', 'A'], ['b', 'B']]))).toBe('A to B: Tells, only at night, down a channel the far side opened');
    const some = { ...arrow, connections: ['one', 'two'], names: ['Tells', 'Asks'], opened: { count: 1, all: false, line: 'far side opened on 1 of 2' } };
    expect(arrowSaid(some, new Map())).toBe('a to b: Tells; Asks, only at night, far side opened on 1 of 2');
  });
});

describe('where an arrow meets its box', () => {
  /** The hard cases with the check from the proxy leaving 25 px above its point, and the event put in 55 px above the middle of the topic. */
  const moved: Drawn = {
    ...HARD_PICTURE,
    arrows: HARD_PICTURE.arrows.map((arrow) => {
      if (arrow.id === 'proxy~web') return { ...arrow, sections: [[{ x: 280, y: 110 }, { x: 330, y: 110 }, { x: 330, y: 250 }, { x: 400, y: 250 }]] };
      if (arrow.id === 'web~events') return { ...arrow, sections: [[{ x: 520, y: 350 }, { x: 520, y: 380 }, { x: 820, y: 380 }]] };
      return arrow;
    }),
  };
  const sections = (id: string) => toFlow(HARD_CONTAINERS, moved).edges.find((edge) => edge.id === id)?.data?.placed.sections ?? [];

  it('starts on the sloping side of a piece of infrastructure, not on the box around it', () => {
    // The point is at the box's edge, 279 px; 25 px above it the side is 14 × 25 / 74 px further in, less half the line.
    const [start] = sections('proxy~web')[0] ?? [];
    expect(start?.y).toBe(110);
    expect(start?.x).toBeCloseTo(279 - (14 * 25) / 74 + 1, 1);
  });

  it('ends on the round end of a queue or a topic', () => {
    // The end's ellipse has its middle 8 px in and is 7 px wide and 74 px high.
    const end = sections('web~events')[0]?.at(-1);
    expect(end?.y).toBe(380);
    expect(end?.x).toBeCloseTo(820 + 8 - 7 * Math.sqrt(1 - (55 / 74) ** 2) - 1, 1);
  });

  it('keeps an end on a box that fills its rectangle, and an end at the boundary, where they are', () => {
    expect(sections('web~cards')).toEqual(HARD_PICTURE.arrows.find((arrow) => arrow.id === 'web~cards')?.sections);
    expect(toFlow(CONTAINERS, CONTAINER_PICTURE).edges.map((edge) => edge.data?.placed.sections)).toEqual(CONTAINER_PICTURE.arrows.map((arrow) => arrow.sections));
  });
});
