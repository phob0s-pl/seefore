import type { Drawn, Point, Rect, View } from '@seefore/core';

/**
 * What is wrong with the geometry of a picture, as plain sentences: one for each box over a
 * box, label over a box, a line or a label, line through a box, box across a boundary, title
 * crossed, stretch that is not at right angles, and arrow that does not start and end at its two
 * ends. An empty list means none. The tests and the trial on real models both use it.
 */
export function troubles(drawn: Drawn): string[] {
  const found: string[] = [];
  const boxes = drawn.boxes;
  const shapes = new Map<string, Rect>(boxes.map((box) => [box.id, box]));
  for (const boundary of drawn.boundaries) shapes.set(boundary.id, boundary);

  for (const [at, box] of boxes.entries()) {
    for (const other of boxes.slice(at + 1)) if (overlap(box, other)) found.push(`box ${box.id} lies over box ${other.id}`);
  }
  for (const boundary of drawn.boundaries) {
    for (const box of boxes) {
      const inside = within(box, boundary);
      if (!inside && overlap(box, boundary)) found.push(`box ${box.id} lies across the boundary of ${boundary.id}`);
    }
    for (const box of boxes) if (overlap(box, boundary.titleAt)) found.push(`box ${box.id} lies over the title of ${boundary.id}`);
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
    for (const boundary of drawn.boundaries) if (overlap(label, boundary.titleAt)) found.push(`the label of ${arrow.id} lies over the title of ${boundary.id}`);
  }

  for (const arrow of drawn.arrows) {
    const stretches = runs(arrow.sections);
    for (const [a, b] of stretches) {
      if (a.x !== b.x && a.y !== b.y) found.push(`the line of ${arrow.id} is not at right angles from (${a.x}, ${a.y}) to (${b.x}, ${b.y})`);
      for (const box of boxes) if (crosses(a, b, box)) found.push(`the line of ${arrow.id} runs through box ${box.id}`);
      for (const boundary of drawn.boundaries) if (crosses(a, b, boundary.titleAt)) found.push(`the line of ${arrow.id} runs through the title of ${boundary.id}`);
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

/**
 * What is wrong with how the boxes and boundaries of a picture stand in one another, as plain
 * sentences: a box or a boundary that stands outside the boundary it is in, one that stands
 * inside a boundary it is not in, and two boundaries of which neither holds the other and that
 * lie across each other. An empty list means none.
 */
export function nesting(view: View, drawn: Drawn): string[] {
  const found: string[] = [];
  const parents = new Map<string, string | undefined>([...view.boxes, ...view.boundaries].map((each) => [each.id, each.boundary]));
  const boundaries = new Map(drawn.boundaries.map((boundary) => [boundary.id, boundary]));
  // What a thing is in, and what that is in, as far as the view says.
  const above = (id: string): string[] => {
    const chain: string[] = [];
    for (let at = parents.get(id); at !== undefined && !chain.includes(at); at = parents.get(at)) chain.push(at);
    return chain;
  };
  for (const shape of [...drawn.boxes, ...drawn.boundaries]) {
    const holders = above(shape.id);
    for (const boundary of drawn.boundaries) {
      if (boundary.id === shape.id) continue;
      const holds = holders.includes(boundary.id);
      if (holds && !within(shape, boundary)) found.push(`${shape.id} stands outside the boundary of ${boundary.id}, which it is in`);
      else if (!holds && within(shape, boundary) && !above(boundary.id).includes(shape.id)) found.push(`${shape.id} stands inside the boundary of ${boundary.id}, which it is not in`);
    }
  }
  for (const [at, boundary] of drawn.boundaries.entries()) {
    for (const other of drawn.boundaries.slice(at + 1)) {
      if (overlap(boundary, other) && !within(boundary, other) && !within(other, boundary)) found.push(`the boundary of ${boundary.id} lies across the boundary of ${other.id}`);
    }
  }
  for (const id of parents.values()) if (id !== undefined && !boundaries.has(id)) found.push(`the picture has no boundary of ${id}`);
  return [...new Set(found)];
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
