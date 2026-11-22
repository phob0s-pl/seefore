import type { View } from '@seefore/core';

/** What the reader points at, focuses or chooses in a picture: a box (or the boundary) or an arrow, by id. */
export type Target = { kind: 'box'; id: string } | { kind: 'arrow'; id: string };

/** What a target lights. Everything else in the picture fades. */
export interface Lit {
  /** Boxes, and the boundary, by id. */
  boxes: Set<string>;
  arrows: Set<string>;
}

/**
 * What lights when the reader points at a target. A box lights itself, every arrow that starts
 * or ends at it, and the box at the other end of each. An arrow lights itself and its two ends.
 * A target the view does not hold lights nothing.
 */
export function litBy(view: View, target: Target): Lit {
  const lit: Lit = { boxes: new Set(), arrows: new Set() };
  if (target.kind === 'arrow') {
    const arrow = view.arrows.find((each) => each.id === target.id);
    if (arrow === undefined) return lit;
    lit.arrows.add(arrow.id);
    lit.boxes.add(arrow.from);
    lit.boxes.add(arrow.to);
    return lit;
  }
  if (!holdsBox(view, target.id)) return lit;
  lit.boxes.add(target.id);
  for (const arrow of view.arrows) {
    if (arrow.from !== target.id && arrow.to !== target.id) continue;
    lit.arrows.add(arrow.id);
    lit.boxes.add(arrow.from);
    lit.boxes.add(arrow.to);
  }
  return lit;
}

/** True when a view draws a box, or its boundary, with this id. */
export function holdsBox(view: View, id: string): boolean {
  return view.boundary?.id === id || view.boxes.some((box) => box.id === id);
}

/** True when a view holds what a target names. */
export function holds(view: View, target: Target): boolean {
  return target.kind === 'box' ? holdsBox(view, target.id) : view.arrows.some((arrow) => arrow.id === target.id);
}
