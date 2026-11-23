import type { Drawn, PlacedArrow, PlacedBoundary, PlacedBox, Rect, View } from '@seefore/core';

/**
 * A picture of any view placed by hand, for a test: what stands in no boundary stands in a row
 * across the top, and each boundary holds what stands in it in a row under its title, a
 * boundary inside a boundary too. Each arrow is a straight line from the middle of the right of
 * one to the middle of the left of the other, with its label half way. The text of each box is
 * its name and kind line whole, its `only` line, and no sentence.
 */

/** The size of a box, and the room around what a boundary holds. */
const BOX = { width: 240, height: 150 };
const GAP = 60;
const SIDE = 24;
const TOP = 64;

/** What stands in a boundary, or in none: the ids of its boxes and boundaries, in the order of the view. */
function childrenOf(view: View, parent: string | undefined): { id: string; open: boolean }[] {
  return [
    ...view.boundaries.filter((boundary) => boundary.boundary === parent).map((boundary) => ({ id: boundary.id, open: true })),
    ...view.boxes.filter((box) => box.boundary === parent).map((box) => ({ id: box.id, open: false })),
  ];
}

/** The width and height of a box, or of a boundary with what it holds. */
function sizeOf(view: View, item: { id: string; open: boolean }): { width: number; height: number } {
  if (!item.open) return BOX;
  const sizes = childrenOf(view, item.id).map((child) => sizeOf(view, child));
  const width = sizes.reduce((sum, size) => sum + size.width, 0) + GAP * Math.max(sizes.length - 1, 0) + 2 * SIDE;
  const height = TOP + Math.max(0, ...sizes.map((size) => size.height)) + SIDE;
  return { width: Math.max(width, 2 * SIDE + 120), height };
}

export function placedPicture(view: View): Drawn {
  const places = new Map<string, Rect>();
  const place = (item: { id: string; open: boolean }, x: number, y: number) => {
    const size = sizeOf(view, item);
    places.set(item.id, { x, y, ...size });
    if (!item.open) return;
    let left = x + SIDE;
    for (const child of childrenOf(view, item.id)) {
      place(child, left, y + TOP);
      left += sizeOf(view, child).width + GAP;
    }
  };
  let left = 40;
  for (const root of childrenOf(view, undefined)) {
    place(root, left, 40);
    left += sizeOf(view, root).width + GAP;
  }
  const at = (id: string): Rect => places.get(id) ?? { x: 0, y: 0, ...BOX };
  const boxes: PlacedBox[] = view.boxes.map((box) => ({
    id: box.id,
    ...at(box.id),
    name: [box.name],
    line: box.line,
    ...(box.only === undefined ? {} : { only: `only ${box.only}` }),
    sentence: [],
    inset: { left: 12, right: 12 },
  }));
  const boundaries: PlacedBoundary[] = view.boundaries.map((boundary) => {
    const rect = at(boundary.id);
    return { id: boundary.id, ...rect, title: boundary.title, titleAt: { x: rect.x + SIDE, y: rect.y + 12, width: Math.min(240, rect.width - 2 * SIDE), height: 20 } };
  });
  const arrows: PlacedArrow[] = view.arrows.map((arrow) => {
    const [from, to] = [at(arrow.from), at(arrow.to)];
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x, y: to.y + to.height / 2 };
    const label = { x: (start.x + end.x) / 2 - 60, y: (start.y + end.y) / 2 - 20, width: 120, height: 40, lines: arrow.names };
    return { id: arrow.id, from: arrow.from, to: arrow.to, sections: [[start, end]], label };
  });
  const right = Math.max(...[...places.values()].map((rect) => rect.x + rect.width), 0);
  const bottom = Math.max(...[...places.values()].map((rect) => rect.y + rect.height), 0);
  return { view: view.id, width: right + 40, height: bottom + 40, boxes, boundaries, arrows };
}
