import type { Drawn, PlacedArrow, PlacedBoundary, PlacedBox, Point, Rect, View, ViewArrow, ViewBox, ViewBoundary } from '@seefore/core';
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

/** How far apart, top to bottom, the made-up places of two turns of the walk are. Any number would do: only their order counts. */
const TURN_STEP = 200;

/** A view with its boxes and arrows in order of id. */
export function sorted(view: View): View {
  return { ...view, boxes: [...view.boxes].sort(byId), arrows: [...view.arrows].sort(byId) };
}

/**
 * The graph ELK lays out: the boxes outside, the boundary with the boxes inside it, and one
 * edge for each arrow with its label's room. Each box and the boundary has a made-up place
 * whose height is its turn in the walk, and ELK keeps the boxes of every column in the order
 * of those places. A context view of `UNZIP_FROM` boxes or more has its long column split. The
 * view must be sorted.
 */
export function graphOf(view: View, labels: ReadonlyMap<string, LabelText>): ElkNode {
  const boundary = view.boundary;
  const turns = turnsOf(view);
  const node = (box: ViewBox) => nodeOf(box, turns.get(box.id) ?? 0);
  const outside = view.boxes.filter((box) => boundary === undefined || !box.inside).map(node);
  const children =
    boundary === undefined
      ? outside
      : [
          ...outside,
          { id: boundary.id, layoutOptions: { ...BOUNDARY_OPTIONS, ...placeOf(turns.get(boundary.id) ?? 0) }, children: view.boxes.filter((box) => box.inside).map(node) },
        ].sort(byId);
  return {
    id: ROOT,
    layoutOptions: { ...ROOT_OPTIONS, ...(view.kind === 'context' && view.boxes.length >= UNZIP_FROM ? UNZIP_OPTIONS : {}) },
    children,
    edges: view.arrows.map((arrow) => edgeOf(arrow, labels.get(arrow.id))),
  };
}

/**
 * The turn of each box of a view in a walk through it, level by level, and the turn of the
 * boundary. The order of every column is the order of the walk. The turns are the same in
 * whatever order the boxes and arrows come.
 *
 * - The walk starts at the boxes that nothing acts on: people first, then the others, each
 *   group in order of id.
 * - From each box in turn it takes the boxes joined to it by an arrow, either way, in order of
 *   id, that it has not yet taken.
 * - A box in a circle that no start reaches is a start of its own, in order of id. Every box
 *   that no start reaches hangs on such a circle, so the walk takes every box.
 * - An arrow may start or end at the boundary, so the walk takes the boundary as it takes a
 *   box. Then the boundary has the turn of the first box inside it, or its own when it holds
 *   none.
 *
 * Nothing is stored: the turns come from the view alone, each time, so that the picture is
 * made from its model and never from the picture before it.
 */
export function turnsOf(view: View): Map<string, number> {
  const ids = [...view.boxes.map((box) => box.id), ...(view.boundary === undefined ? [] : [view.boundary.id])].sort(byText);
  const joined = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  const onward = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  const acted = new Set<string>();
  for (const arrow of view.arrows) {
    const from = joined.get(arrow.from);
    const to = joined.get(arrow.to);
    // An arrow to an id the view does not have is left to ELK, which says so in words.
    if (arrow.from === arrow.to || from === undefined || to === undefined) continue;
    from.add(arrow.to);
    to.add(arrow.from);
    onward.get(arrow.from)?.add(arrow.to);
    acted.add(arrow.to);
  }
  const people = new Set(view.boxes.filter((box) => box.family === 'people').map((box) => box.id));
  const starts = [...ids.filter((id) => !acted.has(id) && people.has(id)), ...ids.filter((id) => !acted.has(id) && !people.has(id))];
  const order: string[] = [];
  const taken = new Set<string>();
  const walkFrom = (start: string) => {
    taken.add(start);
    for (let at = order.push(start) - 1; at < order.length; at++) {
      for (const next of [...(joined.get(order[at] ?? '') ?? [])].sort(byText)) {
        if (taken.has(next)) continue;
        taken.add(next);
        order.push(next);
      }
    }
  };
  for (const start of starts) if (!taken.has(start)) walkFrom(start);
  const circled = inCircles(ids, onward);
  for (const id of ids) if (!taken.has(id) && circled.has(id)) walkFrom(id);
  const turns = new Map(order.map((id, turn) => [id, turn]));
  const boundary = view.boundary;
  if (boundary !== undefined) {
    const held = view.boxes.filter((box) => box.inside).map((box) => turns.get(box.id) ?? 0);
    if (held.length > 0) turns.set(boundary.id, Math.min(...held));
  }
  return turns;
}

/**
 * The boxes whose arrows lead from them back to them: those of each strongly connected group of
 * more than one box, found in one pass over the arrows (Tarjan's way). An arrow from a box to
 * itself is not in `onward`, so no box is in a circle of its own. One pass, and not a search
 * from each box, since a long line of boxes that leads into a circle late in the order of id
 * was searched again from each of its boxes.
 */
function inCircles(ids: readonly string[], onward: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const open: string[] = [];
  const isOpen = new Set<string>();
  const circled = new Set<string>();
  for (const root of ids) {
    if (index.has(root)) continue;
    // The path of the search, each box with the boxes after it still to look at: a stack, so
    // that a long line of boxes does not run out of the call stack.
    const path: { id: string; ahead: string[] }[] = [];
    const enter = (id: string) => {
      index.set(id, index.size);
      low.set(id, index.get(id) ?? 0);
      open.push(id);
      isOpen.add(id);
      path.push({ id, ahead: [...(onward.get(id) ?? [])] });
    };
    enter(root);
    for (let step = path.at(-1); step !== undefined; step = path.at(-1)) {
      const next = step.ahead.pop();
      if (next !== undefined) {
        if (!index.has(next)) enter(next);
        else if (isOpen.has(next)) low.set(step.id, Math.min(low.get(step.id) ?? 0, index.get(next) ?? 0));
        continue;
      }
      path.pop();
      const before = path.at(-1);
      if (before !== undefined) low.set(before.id, Math.min(low.get(before.id) ?? 0, low.get(step.id) ?? 0));
      if (low.get(step.id) !== index.get(step.id)) continue;
      // The box is the first of its group the search reached: the group is every box opened since.
      const group: string[] = [];
      for (let member = open.pop(); member !== undefined; member = member === step.id ? undefined : open.pop()) {
        isOpen.delete(member);
        group.push(member);
      }
      if (group.length > 1) for (const member of group) circled.add(member);
    }
  }
  return circled;
}

/** The made-up place of a turn of the walk, which ELK keeps the order of. */
function placeOf(turn: number): { 'elk.position': string } {
  return { 'elk.position': `(0, ${turn * TURN_STEP})` };
}

/** The node of a box: every box one size, at the place of its turn, and a person in the first column. */
function nodeOf(box: ViewBox, turn: number): ElkNode {
  return { id: box.id, width: BOX_WIDTH, height: BOX_HEIGHT, layoutOptions: { ...(box.family === 'people' ? PERSON_OPTIONS : {}), ...placeOf(turn) } };
}

/**
 * The edge of an arrow, from the box or boundary that acts, with its label's room. ELK places
 * a label only when it has a text; it never measures it, so the room is what counts, and the
 * room does not follow the words.
 */
function edgeOf(arrow: ViewArrow, label: LabelText | undefined): ElkExtendedEdge {
  const text = label === undefined ? '' : [...label.lines, label.route, ...(label.only ?? []), label.opened, label.technology].filter((line) => line !== undefined && line !== '').join('\n');
  const labels = label === undefined ? [] : [{ text, width: label.room.width, height: label.room.height, layoutOptions: { ...LABEL_OPTIONS } }];
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
  const title = titleText(boundary, rect.width - BOUNDARY_PADDING.left - BOUNDARY_PADDING.right);
  const titleAt = {
    x: rect.x + BOUNDARY_PADDING.left,
    y: rect.y + (BOUNDARY_PADDING.top - TITLE_LINE_HEIGHT) / 2,
    width: titleWidth(title),
    height: TITLE_LINE_HEIGHT,
  };
  return { id: boundary.id, ...rect, title, titleAt };
}

/**
 * An arrow with its route at the place ELK gave it, and its label where the words are: at their
 * own size, in the middle of the room ELK gave the label.
 */
function placedArrow(arrow: ViewArrow, edge: ElkExtendedEdge | undefined, text: LabelText | undefined): PlacedArrow {
  if (edge === undefined) throw new Error(`ELK gave no route to ${arrow.id}.`);
  const placed: PlacedArrow = { id: arrow.id, from: arrow.from, to: arrow.to, sections: routeOf(edge.sections ?? []).map(straightened) };
  const shape = edge.labels?.[0];
  if (text === undefined || shape === undefined) return placed;
  const { lines, route, only, opened, technology } = text;
  return {
    ...placed,
    label: {
      ...centred(text, rectOf(shape)),
      lines,
      ...(route === undefined ? {} : { route }),
      ...(only === undefined ? {} : { only }),
      ...(opened === undefined ? {} : { opened }),
      ...(technology === undefined ? {} : { technology }),
    },
  };
}

/** The place of a shape. */
function rectOf(shape: ElkShape): Rect {
  return { x: shape.x ?? 0, y: shape.y ?? 0, width: shape.width ?? 0, height: shape.height ?? 0 };
}

/** A place of the size given, in the middle of a room. */
function centred(size: { width: number; height: number }, room: Rect): Rect {
  return { x: room.x + (room.width - size.width) / 2, y: room.y + (room.height - size.height) / 2, width: size.width, height: size.height };
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
  return byText(a.id, b.id);
}

/** Order of two ids, character by character. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
