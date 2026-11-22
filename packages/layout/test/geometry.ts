import type { Drawn, Point, Rect } from '@seefore/core';

/**
 * What is wrong with the geometry of a picture, as plain sentences: one for each box over a
 * box, label over a box, a line or a label, line through a box, title crossed, stretch that is
 * not at right angles, and arrow that does not start and end at its two ends. An empty list
 * means none. The tests and the trial on real models both use it.
 */
export function troubles(drawn: Drawn): string[] {
  const found: string[] = [];
  const boxes = drawn.boxes;
  const shapes = new Map<string, Rect>(boxes.map((box) => [box.id, box]));
  if (drawn.boundary !== undefined) shapes.set(drawn.boundary.id, drawn.boundary);

  for (const [at, box] of boxes.entries()) {
    for (const other of boxes.slice(at + 1)) if (overlap(box, other)) found.push(`box ${box.id} lies over box ${other.id}`);
  }
  const boundary = drawn.boundary;
  if (boundary !== undefined) {
    for (const box of boxes) {
      const inside = within(box, boundary);
      if (!inside && overlap(box, boundary)) found.push(`box ${box.id} lies across the boundary`);
    }
    for (const box of boxes) if (overlap(box, boundary.titleAt)) found.push(`box ${box.id} lies over the boundary's title`);
  }

  const labelled = drawn.arrows.filter((arrow) => arrow.label !== undefined);
  for (const [at, arrow] of labelled.entries()) {
    const label = arrow.label;
    if (label === undefined) continue;
    for (const box of boxes) if (overlap(label, box)) found.push(`the label of ${arrow.id} lies over box ${box.id}`);
    for (const other of labelled.slice(at + 1)) if (other.label !== undefined && overlap(label, other.label)) found.push(`the label of ${arrow.id} lies over the label of ${other.id}`);
    for (const other of drawn.arrows) {
      if (other.id === arrow.id) continue;
      if (runs(other.sections).some(([a, b]) => crosses(a, b, label))) found.push(`the line of ${other.id} runs through the label of ${arrow.id}`);
    }
    if (boundary !== undefined && overlap(label, boundary.titleAt)) found.push(`the label of ${arrow.id} lies over the boundary's title`);
  }

  for (const arrow of drawn.arrows) {
    const stretches = runs(arrow.sections);
    for (const [a, b] of stretches) {
      if (a.x !== b.x && a.y !== b.y) found.push(`the line of ${arrow.id} is not at right angles from (${a.x}, ${a.y}) to (${b.x}, ${b.y})`);
      for (const box of boxes) if (crosses(a, b, box)) found.push(`the line of ${arrow.id} runs through box ${box.id}`);
      if (boundary !== undefined && crosses(a, b, boundary.titleAt)) found.push(`the line of ${arrow.id} runs through the boundary's title`);
    }
    const start = arrow.sections[0]?.[0];
    const end = arrow.sections.at(-1)?.at(-1);
    const from = shapes.get(arrow.from);
    const to = shapes.get(arrow.to);
    if (start === undefined || end === undefined) found.push(`the arrow ${arrow.id} has no route`);
    else {
      if (from === undefined || !onEdge(start, from)) found.push(`the arrow ${arrow.id} does not start at the edge of ${arrow.from}`);
      if (to === undefined || !onEdge(end, to)) found.push(`the arrow ${arrow.id} does not end at the edge of ${arrow.to}`);
    }
  }
  return found;
}

/** How near two places must be to count as one, in pixels. */
const NEAR = 0.5;

/** Every run of a route: each pair of points one after the other. */
export function runs(sections: readonly Point[][]): [Point, Point][] {
  return sections.flatMap((points) => points.slice(1).map((point, at): [Point, Point] => [points[at] as Point, point]));
}

/** True when two rectangles share more than an edge. */
export function overlap(a: Rect, b: Rect): boolean {
  return a.x + NEAR < b.x + b.width && b.x + NEAR < a.x + a.width && a.y + NEAR < b.y + b.height && b.y + NEAR < a.y + a.height;
}

/** True when the first rectangle lies wholly inside the second. */
export function within(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - NEAR && inner.y >= outer.y - NEAR && inner.x + inner.width <= outer.x + outer.width + NEAR && inner.y + inner.height <= outer.y + outer.height + NEAR;
}

/** True when a straight run passes through the inside of a rectangle, not only along or to its edge. */
export function crosses(a: Point, b: Point, rect: Rect): boolean {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return left < rect.x + rect.width - NEAR && right > rect.x + NEAR && top < rect.y + rect.height - NEAR && bottom > rect.y + NEAR;
}

/** True when a point lies on the edge of a rectangle. */
export function onEdge(point: Point, rect: Rect): boolean {
  const inX = point.x >= rect.x - NEAR && point.x <= rect.x + rect.width + NEAR;
  const inY = point.y >= rect.y - NEAR && point.y <= rect.y + rect.height + NEAR;
  const onX = Math.abs(point.x - rect.x) <= NEAR || Math.abs(point.x - rect.x - rect.width) <= NEAR;
  const onY = Math.abs(point.y - rect.y) <= NEAR || Math.abs(point.y - rect.y - rect.height) <= NEAR;
  return (onX && inY) || (onY && inX);
}
