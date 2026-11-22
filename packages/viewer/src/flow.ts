import type { Drawn, PlacedArrow, PlacedBoundary, PlacedBox, PlacedLabel, Point, View, ViewArrow, ViewBoundary, ViewBox } from '@seefore/core';
import type { Edge, Node, NodeHandle } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { LINE_HEIGHT } from './theme.ts';

/**
 * A picture as React Flow's nodes and edges. React Flow is only the canvas: every place, route
 * and line of text comes from the picture, and nothing is worked out again but what React Flow
 * asks for, a child's place from its parent's.
 */

/** What a box node draws. */
export interface BoxData extends Record<string, unknown> {
  box: ViewBox;
  placed: PlacedBox;
}

/** What the boundary node draws. Its title's place is from the boundary's top left. */
export interface BoundaryData extends Record<string, unknown> {
  boundary: ViewBoundary;
  placed: PlacedBoundary;
  titleAt: Point;
}

/** What an arrow edge draws. */
export interface ArrowData extends Record<string, unknown> {
  arrow: ViewArrow;
  placed: PlacedArrow;
  /** Its place among the arrows of the picture, which makes a name for its label's clip that no other arrow has. */
  index: number;
}

export type BoxNode = Node<BoxData, 'box'>;
export type BoundaryNode = Node<BoundaryData, 'boundary'>;
export type PictureNode = BoxNode | BoundaryNode;
export type ArrowEdge = Edge<ArrowData, 'arrow'>;

/** The id of the handle every arrow ends at, and of the one every arrow starts from. */
export const HANDLE_IN = 'in';
export const HANDLE_OUT = 'out';

/** The length of an arrow's head, along its last stretch, in CSS pixels. */
export const HEAD_LENGTH = 10;

/** Half the width of an arrow's head, in CSS pixels. */
export const HEAD_HALF_WIDTH = 5;

/** A place less the place of its parent: where React Flow wants a child. */
export function relativeTo(place: Point, parent: Point): Point {
  return { x: place.x - parent.x, y: place.y - parent.y };
}

/**
 * The handles React Flow needs to draw an edge before the browser has measured a node: one in
 * on the left, one out on the right. The node draws the same ones, hidden, for after.
 */
function handlesOf(width: number, height: number): NodeHandle[] {
  return [
    { id: HANDLE_IN, type: 'target', position: Position.Left, x: 0, y: height / 2, width: 1, height: 1 },
    { id: HANDLE_OUT, type: 'source', position: Position.Right, x: width, y: height / 2, width: 1, height: 1 },
  ];
}

/** A text as a sentence: with a full stop at its end, unless it ends a sentence already. */
function sentence(text: string): string {
  return /[.!?…]$/u.test(text) ? text : `${text}.`;
}

/** A number of connections in words: `1 connection`, `3 connections`. */
function connections(count: number): string {
  return `${count} ${count === 1 ? 'connection' : 'connections'}`;
}

/** What a screen reader says for a box: its whole name, kind line and first sentence, and its marks. */
export function boxSaid(box: ViewBox): string {
  const parts = [`${box.name}, ${box.line}`];
  if (box.sentence !== undefined) parts.push(box.sentence);
  if (box.loops.length > 0) parts.push(`${connections(box.loops.length)} between its copies`);
  if (box.passing.length > 0) parts.push(`${connections(box.passing.length)} of this view ${box.passing.length === 1 ? 'passes' : 'pass'} through it`);
  return parts.map(sentence).join(' ');
}

/** What a screen reader says for an arrow: its two ends, the whole name of every connection it stands for, its route and its technology. */
export function arrowSaid(arrow: ViewArrow, names: ReadonlyMap<string, string>): string {
  const from = names.get(arrow.from) ?? arrow.from;
  const to = names.get(arrow.to) ?? arrow.to;
  const route = arrow.route === undefined ? '' : `, ${arrow.route.line}`;
  const technology = arrow.technology.length > 0 ? ` [${arrow.technology.join(', ')}]` : '';
  return `${from} to ${to}: ${arrow.names.join('; ')}${route}${technology}`;
}

/** The name of each box and of the boundary of a view, by id. */
export function namesIn(view: View): Map<string, string> {
  const names = new Map(view.boxes.map((box) => [box.id, box.name]));
  if (view.boundary) names.set(view.boundary.id, view.boundary.name);
  return names;
}

/**
 * The nodes and edges of a picture. The boundary comes first, since React Flow wants a parent
 * before its children, and each box inside it is placed from its top left. A box or an arrow
 * that the view does not hold is left out.
 */
export function toFlow(view: View, drawn: Drawn): { nodes: PictureNode[]; edges: ArrowEdge[] } {
  const nodes: PictureNode[] = [];
  const boundary = drawn.boundary !== undefined && view.boundary !== undefined && drawn.boundary.id === view.boundary.id ? drawn.boundary : undefined;
  if (boundary !== undefined && view.boundary !== undefined) {
    nodes.push({
      id: boundary.id,
      type: 'boundary',
      position: { x: boundary.x, y: boundary.y },
      width: boundary.width,
      height: boundary.height,
      data: { boundary: view.boundary, placed: boundary, titleAt: relativeTo(boundary.titleAt, boundary) },
      handles: handlesOf(boundary.width, boundary.height),
      ariaLabel: `${boundary.title}, the boundary of the system`,
      draggable: false,
      connectable: false,
      selectable: false,
      // Only its title takes the pointer, so that the room inside it moves the canvas.
      style: { pointerEvents: 'none' },
    });
  }

  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  for (const placed of drawn.boxes) {
    const box = boxes.get(placed.id);
    if (box === undefined) continue;
    const parent = box.inside ? boundary : undefined;
    nodes.push({
      id: placed.id,
      type: 'box',
      position: parent === undefined ? { x: placed.x, y: placed.y } : relativeTo(placed, parent),
      ...(parent === undefined ? {} : { parentId: parent.id }),
      width: placed.width,
      height: placed.height,
      data: { box, placed },
      handles: handlesOf(placed.width, placed.height),
      ariaLabel: boxSaid(box),
      draggable: false,
      connectable: false,
      selectable: false,
    });
  }

  const drawnIds = new Set(nodes.map((node) => node.id));
  const arrows = new Map(view.arrows.map((arrow) => [arrow.id, arrow]));
  const names = namesIn(view);
  const edges: ArrowEdge[] = [];
  for (const placed of drawn.arrows) {
    const arrow = arrows.get(placed.id);
    if (arrow === undefined || !drawnIds.has(arrow.from) || !drawnIds.has(arrow.to)) continue;
    edges.push({
      id: placed.id,
      type: 'arrow',
      source: arrow.from,
      target: arrow.to,
      sourceHandle: HANDLE_OUT,
      targetHandle: HANDLE_IN,
      data: { arrow, placed, index: edges.length },
      ariaLabel: arrowSaid(arrow, names),
      selectable: false,
      // Above the boundary's tint, which is a node of its own.
      zIndex: 1,
    });
  }
  return { nodes, edges };
}

/** A number for a path: as given, to two places. */
function coordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The SVG path of a route: each stretch a line through its points. */
export function pathOf(sections: readonly (readonly Point[])[]): string {
  return sections
    .filter((section) => section.length > 0)
    .map((section) => section.map((point, at) => `${at === 0 ? 'M' : 'L'}${coordinate(point.x)},${coordinate(point.y)}`).join(' '))
    .join(' ');
}

/**
 * The head of an arrow: a triangle whose tip is the last point of the route, pointing along its
 * last stretch. None when the route has no stretch of any length.
 */
export function headOf(sections: readonly (readonly Point[])[]): string | undefined {
  const points = sections.flat();
  const tip = points[points.length - 1];
  if (tip === undefined) return undefined;
  // The last point before the tip that is not the tip itself.
  let before: Point | undefined;
  for (let at = points.length - 2; at >= 0; at--) {
    const point = points[at];
    if (point !== undefined && (point.x !== tip.x || point.y !== tip.y)) {
      before = point;
      break;
    }
  }
  if (before === undefined) return undefined;
  const length = Math.hypot(tip.x - before.x, tip.y - before.y);
  const along = { x: (tip.x - before.x) / length, y: (tip.y - before.y) / length };
  const base = { x: tip.x - along.x * HEAD_LENGTH, y: tip.y - along.y * HEAD_LENGTH };
  const left = { x: base.x - along.y * HEAD_HALF_WIDTH, y: base.y + along.x * HEAD_HALF_WIDTH };
  const right = { x: base.x + along.y * HEAD_HALF_WIDTH, y: base.y - along.x * HEAD_HALF_WIDTH };
  return [tip, left, right].map((point) => `${coordinate(point.x)},${coordinate(point.y)}`).join(' ');
}

/** One line of an arrow's label, with the middle of its line box. */
export interface LabelLine {
  text: string;
  /** The middle of the line, from the top of the picture. */
  y: number;
  /** A line of names, the route line or the technology line. */
  kind: 'name' | 'route' | 'technology';
}

/** The lines of a label as given, stacked in the middle of the label's place: the names, then the route, then the technology. */
export function labelLines(label: PlacedLabel): LabelLine[] {
  const given: { text: string; kind: LabelLine['kind']; height: number }[] = [
    ...label.lines.map((text) => ({ text, kind: 'name' as const, height: LINE_HEIGHT.label })),
    ...(label.route === undefined ? [] : [{ text: label.route, kind: 'route' as const, height: LINE_HEIGHT.route }]),
    ...(label.technology === undefined ? [] : [{ text: label.technology, kind: 'technology' as const, height: LINE_HEIGHT.technology }]),
  ];
  let top = label.y + (label.height - given.reduce((sum, line) => sum + line.height, 0)) / 2;
  return given.map(({ text, kind, height }) => {
    const line = { text, y: top + height / 2, kind };
    top += height;
    return line;
  });
}
