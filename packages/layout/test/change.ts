import type { Drawn, Point, View } from '@seefore/core';
import { sorted, turnsFrom } from '../src/graph.ts';
import { BOX_HEIGHT, BOX_WIDTH } from '../src/sizes.ts';

/**
 * What one picture moved against another, and how many times its lines cross: the measures of
 * stage 7, as its lab took them. The tests and `scripts/steady.mjs` both use them, so that a
 * number in a test and a number in the trial mean the same.
 */

/**
 * What one picture moved against another, over the boxes in both. Each share is from 0 to 1,
 * and is missing when there is nothing to share out: a share of no pairs would read as all of
 * them kept, and a measure must not pass on what it never saw.
 */
export interface Change {
  /** How many boxes stand in both. */
  common: number;
  /** How many pairs of those boxes there are. */
  pairs: number;
  /** The share of those whose centre moved by more than half a box, after the shift that all boxes share is taken away. Missing under two boxes, where nothing can move against the rest. */
  moved: number | undefined;
  /** The share of pairs that stand the same way round both across and down. */
  orderKept: number | undefined;
  /** The share of pairs that stand the same way round across. */
  orderX: number | undefined;
  /** The share of pairs that stand the same way round down. */
  orderY: number | undefined;
  /** The share of boxes that keep their column, after the shift that all columns share. */
  columnKept: number | undefined;
  /** How far a box moved on average, after the shift, in diagonals of a box. */
  meanMove: number | undefined;
  /** How many pairs stand in one column before and after. */
  columnPairs: number;
  /** How many of those stand the other way round after. */
  columnTurned: number;
  /** Of the pairs that stand in one column before and after, the share that keep their order top to bottom. */
  columnOrder: number | undefined;
}

/**
 * What a picture moved against the one before it, over the boxes in both. Two boxes thrown
 * down at random keep their order both ways one time in four. Two boxes at the same height, or
 * in the same column, stand neither way round; a pair keeps its order across when it does so
 * before and after, and loses it when one picture ties them and the other does not.
 */
export function change(before: Drawn, after: Drawn): Change {
  const was = new Map(before.boxes.map((box) => [box.id, box]));
  const common = after.boxes.filter((box) => was.has(box.id));
  const pairs = common.map((box) => {
    const old = was.get(box.id) ?? box;
    return { id: box.id, ax: box.x + box.width / 2, ay: box.y + box.height / 2, bx: old.x + old.width / 2, by: old.y + old.height / 2 };
  });
  const dx = median(pairs.map((pair) => pair.ax - pair.bx));
  const dy = median(pairs.map((pair) => pair.ay - pair.by));
  let moved = 0;
  let total = 0;
  for (const pair of pairs) {
    const mx = pair.ax - pair.bx - dx;
    const my = pair.ay - pair.by - dy;
    if (Math.abs(mx) > BOX_WIDTH / 2 || Math.abs(my) > BOX_HEIGHT / 2) moved += 1;
    total += Math.hypot(mx, my);
  }
  let kept = 0;
  let keptX = 0;
  let keptY = 0;
  let count = 0;
  let sameColumn = 0;
  let sameColumnKept = 0;
  for (const [at, a] of pairs.entries()) {
    for (const b of pairs.slice(at + 1)) {
      const sameX = Math.sign(Math.round(a.ax - b.ax)) === Math.sign(Math.round(a.bx - b.bx));
      const sameY = Math.sign(Math.round(a.ay - b.ay)) === Math.sign(Math.round(a.by - b.by));
      count += 1;
      if (sameX) keptX += 1;
      if (sameY) keptY += 1;
      if (sameX && sameY) kept += 1;
      if (Math.abs(a.ax - b.ax) < 1 && Math.abs(a.bx - b.bx) < 1) {
        sameColumn += 1;
        if (Math.sign(a.ay - b.ay) === Math.sign(a.by - b.by)) sameColumnKept += 1;
      }
    }
  }
  const beforeColumns = columnsOf(before);
  const afterColumns = columnsOf(after);
  // Every column may step along by one when a column is added at the left: the shift they share is taken away.
  const step = (id: string) => (afterColumns.get(id) ?? 0) - (beforeColumns.get(id) ?? 0);
  const shift = Math.round(median(common.map((box) => step(box.id))));
  const columnKept = common.filter((box) => step(box.id) === shift).length;
  const n = pairs.length;
  const share = (part: number, whole: number) => (whole === 0 ? undefined : part / whole);
  return {
    common: n,
    pairs: count,
    moved: n < 2 ? undefined : moved / n,
    orderKept: share(kept, count),
    orderX: share(keptX, count),
    orderY: share(keptY, count),
    columnKept: n < 2 ? undefined : columnKept / n,
    meanMove: n < 2 ? undefined : total / n / Math.hypot(BOX_WIDTH, BOX_HEIGHT),
    columnPairs: sameColumn,
    columnTurned: sameColumn - sameColumnKept,
    columnOrder: share(sameColumnKept, sameColumn),
  };
}

/** The column of each box: the rank of its left edge among the left edges of the picture. */
function columnsOf(drawn: Drawn): Map<string, number> {
  const lefts = [...new Set(drawn.boxes.map((box) => Math.round(box.x)))].sort((a, b) => a - b);
  return new Map(drawn.boxes.map((box) => [box.id, lefts.indexOf(Math.round(box.x))]));
}

/** The middle value, or the mean of the two middle values; 0 of none. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? (ordered[middle] ?? 0) : ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

/** How many times the lines of two different arrows cross: a run across against a run down, meeting inside both. */
export function crossings(drawn: Drawn): number {
  const across: { y: number; x1: number; x2: number; arrow: number }[] = [];
  const down: { x: number; y1: number; y2: number; arrow: number }[] = [];
  for (const [at, arrow] of drawn.arrows.entries()) {
    for (const [a, b] of runsOf(arrow.sections)) {
      if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) >= 0.5) across.push({ y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x), arrow: at });
      else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) >= 0.5) down.push({ x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y), arrow: at });
    }
  }
  const near = 0.5;
  let count = 0;
  for (const h of across) for (const v of down) if (h.arrow !== v.arrow && v.x > h.x1 + near && v.x < h.x2 - near && h.y > v.y1 + near && h.y < v.y2 - near) count += 1;
  return count;
}

/** Every straight run of an arrow. */
function runsOf(sections: readonly Point[][]): [Point, Point][] {
  return sections.flatMap((points) => points.slice(1).map((point, at): [Point, Point] => [points[at] as Point, point]));
}

/**
 * Where a picture stands without its words: every box, every boundary, the points of every
 * line, the middle of every label and the size of the picture, as one text. A new name or a new
 * description must leave it as it was. A label's own size is not in it: a label is where its
 * words are, and the words change, but they stand in the middle of a room that does not.
 */
export function placesOf(drawn: Drawn): string {
  return JSON.stringify({
    size: [drawn.width, drawn.height],
    boxes: drawn.boxes.map((box) => [box.id, box.x, box.y, box.width, box.height]),
    boundaries: drawn.boundaries.map((boundary) => [boundary.id, boundary.x, boundary.y, boundary.width, boundary.height]),
    lines: drawn.arrows.map((arrow) => [arrow.id, arrow.sections]),
    labels: drawn.arrows.map((arrow) => [arrow.id, arrow.label === undefined ? null : middle(arrow.label)]),
  });
}

/**
 * The middle of a label, to a thousandth of a pixel. The words of a label stand in the middle
 * of their room, so their middle is a half of a pixel count away from the room's: rounding
 * keeps a sum of halves from reading as a move.
 */
function middle(label: { x: number; y: number; width: number; height: number }): [number, number] {
  return [Math.round((label.x + label.width / 2) * 1000) / 1000, Math.round((label.y + label.height / 2) * 1000) / 1000];
}

/** Two boxes with the same parent that stand in one column of a picture, and which way round the walk and the picture have them. */
export interface ColumnPair {
  /** The pair in the order of the walk: the one with the earlier turn first. */
  byWalk: [string, string];
  /** The pair in the order of the picture: the one above first. */
  byPicture: [string, string];
}

/**
 * Every pair of boxes of a picture that have the same parent, one boundary or the whole
 * picture, and stand in one column: their left edges less than a pixel apart. The turns the
 * layout gave them say which should stand above, those of the walk taken from the views above
 * when there are any; the picture says which does. A pair disagrees when the two orders differ,
 * and `docs/layout.md` and `docs/depth-and-scope.md` say none does.
 */
export function columnPairs(view: View, drawn: Drawn, above: readonly View[] = []): ColumnPair[] {
  const turns = turnsFrom(sorted(view), above);
  const parents = new Map(view.boxes.map((box) => [box.id, box.boundary]));
  const pairs: ColumnPair[] = [];
  for (const [at, a] of drawn.boxes.entries()) {
    for (const b of drawn.boxes.slice(at + 1)) {
      if (parents.get(a.id) !== parents.get(b.id) || Math.abs(a.x - b.x) >= 1) continue;
      const first = (turns.get(a.id) ?? 0) <= (turns.get(b.id) ?? 0);
      pairs.push({ byWalk: first ? [a.id, b.id] : [b.id, a.id], byPicture: a.y <= b.y ? [a.id, b.id] : [b.id, a.id] });
    }
  }
  return pairs;
}

/** The pairs of `columnPairs` that stand the other way round from the turns. */
export function againstWalk(view: View, drawn: Drawn, above: readonly View[] = []): ColumnPair[] {
  return columnPairs(view, drawn, above).filter((pair) => pair.byWalk[0] !== pair.byPicture[0]);
}
