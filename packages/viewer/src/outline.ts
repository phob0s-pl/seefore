import type { BoxLook, Point, Rect } from '@seefore/core';
import { APP_RADIUS, INFRASTRUCTURE_POINT, OUTLINE, PERSON_RADIUS, QUEUE_LID, SCOPE_OUTLINE, STORE_LID, hexagon } from './geometry.ts';

/**
 * Where an arrow meets the outline a box draws. The layout ends an arrow on the rectangle of a
 * box; a shape that does not fill its rectangle, such as the points of a piece of
 * infrastructure or the round end of a queue, would leave a gap there. The page moves each end
 * of an arrow along its last stretch until it touches the outline drawn.
 */

/** A box as the page draws it: its look, whether it is the system in scope, and its place. */
export interface Outlined extends Rect {
  look: BoxLook;
  scope: boolean;
}

/** How many straight pieces stand for a quarter of an ellipse in an outline. */
const PIECES = 16;

/** Points along an arc of an ellipse, from one angle to another, in radians, with y down. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Point[] {
  const steps = Math.max(1, Math.ceil((PIECES * Math.abs(to - from)) / (Math.PI / 2)));
  return Array.from({ length: steps + 1 }, (_, at) => {
    const angle = from + ((to - from) * at) / steps;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

/** A rectangle with round corners, as SVG draws one, with its line's middle `at` in from the box's edge. */
function roundRect(width: number, height: number, at: number, radius: number): Point[] {
  const [left, top, right, bottom] = [at, at, width - at, height - at];
  const rx = Math.min(radius, (right - left) / 2);
  const ry = Math.min(radius, (bottom - top) / 2);
  return [
    ...arc(right - rx, top + ry, rx, ry, -Math.PI / 2, 0),
    ...arc(right - rx, bottom - ry, rx, ry, 0, Math.PI / 2),
    ...arc(left + rx, bottom - ry, rx, ry, Math.PI / 2, Math.PI),
    ...arc(left + rx, top + ry, rx, ry, Math.PI, (3 * Math.PI) / 2),
  ];
}

/**
 * The outline a box of a look draws, at a size, from the box's top left: the middle of its
 * line as a closed run of points, and the width of that line. The same as `Shape` draws.
 */
export function outlineOf(look: BoxLook, scope: boolean, width: number, height: number): { points: Point[]; line: number } {
  const line = OUTLINE;
  switch (look) {
    case 'person':
      return { points: roundRect(width, height, line / 2, Math.min(PERSON_RADIUS, height / 3)), line };
    case 'app':
      return { points: roundRect(width, height, line / 2, APP_RADIUS), line };
    case 'store': {
      const [left, right, top, bottom] = [line / 2, width - line / 2, STORE_LID + line / 2, height - STORE_LID - line / 2];
      const radius = (right - left) / 2;
      return { points: [...arc(left + radius, top, radius, STORE_LID, Math.PI, 2 * Math.PI), ...arc(left + radius, bottom, radius, STORE_LID, 0, Math.PI)], line };
    }
    case 'queue-or-topic': {
      const [left, right, top, bottom] = [QUEUE_LID + line / 2, width - QUEUE_LID - line / 2, line / 2, height - line / 2];
      const radius = (bottom - top) / 2;
      return { points: [...arc(right, top + radius, QUEUE_LID, radius, -Math.PI / 2, Math.PI / 2), ...arc(left, top + radius, QUEUE_LID, radius, Math.PI / 2, (3 * Math.PI) / 2)], line };
    }
    case 'infrastructure': {
      const points = hexagon(width, height, INFRASTRUCTURE_POINT, line)
        .split(' ')
        .map((pair) => pair.split(',').map(Number))
        .map(([x = 0, y = 0]) => ({ x, y }));
      return { points, line };
    }
    case 'system':
    case 'system-scope':
    case 'system-external': {
      const thick = scope ? SCOPE_OUTLINE : OUTLINE;
      return { points: roundRect(width, height, thick / 2, 0), line: thick };
    }
  }
}

/** How far along a ray from a point it first meets a closed run of points, or nothing when it does not. */
function firstHit(from: Point, way: Point, points: readonly Point[]): number | undefined {
  let best: number | undefined;
  for (const [at, a] of points.entries()) {
    const b = points[(at + 1) % points.length] ?? a;
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const across = way.x * edge.y - way.y * edge.x;
    if (Math.abs(across) < 1e-9) continue;
    const gap = { x: a.x - from.x, y: a.y - from.y };
    const along = (gap.x * edge.y - gap.y * edge.x) / across;
    const on = (gap.x * way.y - gap.y * way.x) / across;
    if (along >= -1e-6 && on >= -1e-9 && on <= 1 + 1e-9 && (best === undefined || along < best)) best = along;
  }
  return best;
}

/**
 * An end of an arrow moved along its last stretch, from `toward` through `end`, into the box
 * until it touches the outside of the outline the box draws. An end the outline does not stand
 * in from, as on a rectangle, stays where it is, and so does one the stretch does not lead in
 * from, or that the outline is not near.
 */
export function endOn(box: Outlined, end: Point, toward: Point): Point {
  const length = Math.hypot(end.x - toward.x, end.y - toward.y);
  if (length === 0) return end;
  const way = { x: (end.x - toward.x) / length, y: (end.y - toward.y) / length };
  const { points, line } = outlineOf(box.look, box.scope, box.width, box.height);
  const hit = firstHit({ x: end.x - box.x, y: end.y - box.y }, way, points);
  if (hit === undefined || hit > Math.min(box.width, box.height) / 2) return end;
  const shift = Math.max(0, hit - line / 2);
  return { x: end.x + way.x * shift, y: end.y + way.y * shift };
}

/**
 * The stretches of an arrow with its start on the outline of the box it starts at and its end on
 * the outline of the box it ends at. An end at the boundary, which has no such box, stays.
 */
export function onOutlines(sections: readonly (readonly Point[])[], from: Outlined | undefined, to: Outlined | undefined): Point[][] {
  const moved = sections.map((section) => section.map((point) => ({ ...point })));
  const first = moved[0];
  const last = moved[moved.length - 1];
  const [start, next] = [first?.[0], first?.[1]];
  if (from !== undefined && first !== undefined && start !== undefined && next !== undefined) first[0] = endOn(from, start, next);
  const [end, before] = [last?.[last.length - 1], last?.[last.length - 2]];
  if (to !== undefined && last !== undefined && end !== undefined && before !== undefined) last[last.length - 1] = endOn(to, end, before);
  return moved;
}
