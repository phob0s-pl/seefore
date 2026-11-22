import type { Drawn, PlacedArrow, PlacedBoundary, PlacedBox, Point, View, ViewArrow, ViewBox, ViewBoundary } from '@seefore/core';
import type { ElkEdgeSection, ElkExtendedEdge, ElkNode, ElkShape } from 'elkjs/lib/elk.bundled.js';
import { BOUNDARY_OPTIONS, LABEL_OPTIONS, PERSON_OPTIONS, ROOT_OPTIONS, UNZIP_OPTIONS } from './settings.ts';
import { BOUNDARY_PADDING, BOX_HEIGHT, BOX_WIDTH, TITLE_LINE_HEIGHT, UNZIP_FROM } from './sizes.ts';
import { boxText, titleText, titleWidth } from './text.ts';
import type { LabelText } from './text.ts';

/**
 * A view as ELK's graph, and ELK's answer as a picture. The view goes in sorted by id, so that
 * the order it came in cannot change the picture.
 */

/** The id of the whole picture in ELK's graph. A record's id cannot hold `~`, so no box has it. */
const ROOT = '~picture';

/** A view with its boxes and arrows in order of id. */
export function sorted(view: View): View {
  return { ...view, boxes: [...view.boxes].sort(byId), arrows: [...view.arrows].sort(byId) };
}

/**
 * The graph ELK lays out: the boxes outside, the boundary with the boxes inside it, and one
 * edge for each arrow with its label at its measured size. The view must be sorted.
 */
export function graphOf(view: View, labels: ReadonlyMap<string, LabelText>): ElkNode {
  const boundary = view.boundary;
  const outside = view.boxes.filter((box) => boundary === undefined || !box.inside).map(nodeOf);
  const children =
    boundary === undefined
      ? outside
      : [...outside, { id: boundary.id, layoutOptions: { ...BOUNDARY_OPTIONS }, children: view.boxes.filter((box) => box.inside).map(nodeOf) }].sort(byId);
  const unzip = view.kind === 'context' && view.boxes.length >= UNZIP_FROM;
  return {
    id: ROOT,
    layoutOptions: { ...ROOT_OPTIONS, ...(unzip ? UNZIP_OPTIONS : {}) },
    children,
    edges: view.arrows.map((arrow) => edgeOf(arrow, labels.get(arrow.id))),
  };
}

/** The node of a box: every box one size, and a person in the first column. */
function nodeOf(box: ViewBox): ElkNode {
  return { id: box.id, width: BOX_WIDTH, height: BOX_HEIGHT, layoutOptions: box.family === 'people' ? { ...PERSON_OPTIONS } : {} };
}

/**
 * The edge of an arrow, from the box or boundary that acts, with its label's room. ELK places
 * a label only when it has a text; it never measures it, so the room is what counts.
 */
function edgeOf(arrow: ViewArrow, label: LabelText | undefined): ElkExtendedEdge {
  const text = label === undefined ? '' : [...label.lines, label.route, label.technology].filter((line) => line !== undefined && line !== '').join('\n');
  const labels = label === undefined ? [] : [{ text, width: label.width, height: label.height, layoutOptions: { ...LABEL_OPTIONS } }];
  return { id: arrow.id, sources: [arrow.from], targets: [arrow.to], labels };
}

/** The picture of a sorted view from ELK's answer, every place from the top left of the whole picture. */
export function drawnOf(view: View, laid: ElkNode, labels: ReadonlyMap<string, LabelText>): Drawn {
  const shapes = new Map<string, ElkShape>();
  const edges = new Map<string, ElkExtendedEdge>();
  collect(laid, shapes, edges);
  const boxes = view.boxes.map((box) => placedBox(box, shapeOf(shapes, box.id)));
  const boundary = view.boundary === undefined ? undefined : placedBoundary(view.boundary, shapeOf(shapes, view.boundary.id));
  const arrows = view.arrows.map((arrow) => placedArrow(arrow, edges.get(arrow.id), labels.get(arrow.id)));
  return { view: view.id, width: laid.width ?? 0, height: laid.height ?? 0, boxes, ...(boundary === undefined ? {} : { boundary }), arrows };
}

/** Every node and edge of ELK's answer, by id, at every depth. */
function collect(node: ElkNode, shapes: Map<string, ElkShape>, edges: Map<string, ElkExtendedEdge>): void {
  for (const edge of node.edges ?? []) edges.set(edge.id, edge);
  for (const child of node.children ?? []) {
    shapes.set(child.id, child);
    collect(child, shapes, edges);
  }
}

/** The place ELK gave a node. */
function shapeOf(shapes: ReadonlyMap<string, ElkShape>, id: string): ElkShape {
  const shape = shapes.get(id);
  if (shape === undefined) throw new Error(`ELK gave no place to ${id}.`);
  return shape;
}

/** A box at its place, with its text in lines. */
function placedBox(box: ViewBox, shape: ElkShape): PlacedBox {
  return { id: box.id, ...rectOf(shape), ...boxText(box) };
}

/** The boundary at its place, with its title in the top padding, cut to the room inside. */
function placedBoundary(boundary: ViewBoundary, shape: ElkShape): PlacedBoundary {
  const rect = rectOf(shape);
  const title = titleText(boundary.title, rect.width - BOUNDARY_PADDING.left - BOUNDARY_PADDING.right);
  const titleAt = {
    x: rect.x + BOUNDARY_PADDING.left,
    y: rect.y + (BOUNDARY_PADDING.top - TITLE_LINE_HEIGHT) / 2,
    width: titleWidth(title),
    height: TITLE_LINE_HEIGHT,
  };
  return { id: boundary.id, ...rect, title, titleAt };
}

/** An arrow with its route and its label at the place ELK gave them. */
function placedArrow(arrow: ViewArrow, edge: ElkExtendedEdge | undefined, text: LabelText | undefined): PlacedArrow {
  if (edge === undefined) throw new Error(`ELK gave no route to ${arrow.id}.`);
  const placed: PlacedArrow = { id: arrow.id, from: arrow.from, to: arrow.to, sections: routeOf(edge.sections ?? []).map(straightened) };
  const shape = edge.labels?.[0];
  if (text === undefined || shape === undefined) return placed;
  const { lines, route, technology } = text;
  return { ...placed, label: { ...rectOf(shape), lines, ...(route === undefined ? {} : { route }), ...(technology === undefined ? {} : { technology }) } };
}

/** The place of a shape. */
function rectOf(shape: ElkShape): { x: number; y: number; width: number; height: number } {
  return { x: shape.x ?? 0, y: shape.y ?? 0, width: shape.width ?? 0, height: shape.height ?? 0 };
}

/**
 * The stretches of a route in the order they are run: from the one that starts at the arrow's
 * start, each followed by the one ELK says comes next. Any that ELK did not link come last.
 */
function routeOf(sections: readonly ElkEdgeSection[]): Point[][] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered: ElkEdgeSection[] = [];
  let section = sections.find((each) => (each.incomingSections ?? []).length === 0) ?? sections[0];
  while (section !== undefined && !ordered.includes(section)) {
    ordered.push(section);
    section = byId.get(section.outgoingSections?.[0] ?? '');
  }
  const unlinked = sections.filter((each) => !ordered.includes(each));
  return [...ordered, ...unlinked].map(pointsOf);
}

/** The points of a stretch: its start, its bends and its end. */
function pointsOf(section: ElkEdgeSection): Point[] {
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => ({ x, y }));
}

/** A step smaller than this, in pixels, is one ELK left where it meant none. */
const STEP = 1;

/**
 * A stretch with right angles. Where a line crosses the boundary, ELK sometimes leaves a step
 * of under a pixel in what is meant as one straight run. The points of such steps are dropped,
 * runs that go on the same way are made one, and each run is set straight.
 */
export function straightened(points: readonly Point[]): Point[] {
  return squared(joined(withoutSteps(points)));
}

/** The points of a stretch less those under a step from the point before them. The start and the end are always kept. */
function withoutSteps(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const [at, point] of points.entries()) {
    const before = kept.at(-1);
    if (before !== undefined && near(before, point)) {
      if (at < points.length - 1) continue;
      // The end is kept, and the bend just before it goes, unless that is the start.
      if (kept.length > 1) kept.pop();
    }
    kept.push({ ...point });
  }
  return kept;
}

/** The points of a stretch less those in the middle of a run that goes on the same way. */
function joined(points: readonly Point[]): Point[] {
  const line: Point[] = [];
  for (const [at, point] of points.entries()) {
    const before = line.at(-1);
    const after = points[at + 1];
    if (before !== undefined && after !== undefined) {
      const way = direction(before, point);
      if (way !== undefined && way === direction(point, after)) continue;
    }
    line.push(point);
  }
  return line;
}

/**
 * Each run of a stretch set straight by moving one of its ends: the end of the run, which is a
 * bend, or on the last run its start, so that the stretch keeps its start and its end.
 */
function squared(line: Point[]): Point[] {
  for (const [at, from] of line.entries()) {
    const to = line[at + 1];
    if (to === undefined) break;
    const last = at > 0 && at + 2 === line.length;
    const way = direction(from, to);
    if (way === 'across') {
      if (last) from.y = to.y;
      else to.y = from.y;
    } else if (way === 'down') {
      if (last) from.x = to.x;
      else to.x = from.x;
    }
  }
  return line;
}

/** True when two points are less than a step apart both ways. */
function near(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < STEP && Math.abs(a.y - b.y) < STEP;
}

/** Which way a run goes, allowing a step: across, down, or neither when it goes slant. */
function direction(from: Point, to: Point): 'across' | 'down' | undefined {
  if (Math.abs(to.y - from.y) < STEP) return 'across';
  if (Math.abs(to.x - from.x) < STEP) return 'down';
  return undefined;
}

/** Order by id, character by character, the same on every machine. */
function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
