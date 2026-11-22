import type { Drawn } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { HANDLE_IN, HANDLE_OUT, HEAD_LENGTH, headOf, labelLines, pathOf, relativeTo, toFlow } from '../src/flow.ts';
import { LINE_HEIGHT } from '../src/theme.ts';
import { CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE } from './fixture.ts';

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
      boxes: [...CONTEXT_PICTURE.boxes, { id: 'stranger', x: 0, y: 0, width: 240, height: 150, name: ['Stranger'], line: '[Person]', sentence: [] }],
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
});
