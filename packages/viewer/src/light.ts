import type { View } from '@seefore/core';

/**
 * What the reader points at, focuses or chooses in a picture, by id: a box (or the boundary), an
 * arrow, or something the arrows pass through that has no box, from the list under the legend.
 */
export type Target = { kind: 'box'; id: string } | { kind: 'arrow'; id: string } | { kind: 'passed'; id: string };

/** What a target lights. Everything else in the picture fades. */
export interface Lit {
  /** Boxes, and the boundary, by id. */
  boxes: Set<string>;
  arrows: Set<string>;
}

/**
 * What lights when the reader points at a target. A box lights itself, every arrow that starts
 * or ends at it or passes through it, and the boxes at the ends of each, and every box that
 * holds, inside it or between its copies, a connection that passes through it. An arrow lights
 * itself, its two ends and the boxes it passes through. Something with no box lights the arrows
 * that pass through it and their ends, and the boxes that hold a connection that passes through
 * it. A target the view does not hold lights nothing.
 */
export function litBy(view: View, target: Target): Lit {
  const lit: Lit = { boxes: new Set(), arrows: new Set() };
  const light = (arrows: ReadonlySet<string>) => {
    for (const arrow of view.arrows) {
      if (!arrows.has(arrow.id)) continue;
      lit.arrows.add(arrow.id);
      lit.boxes.add(arrow.from);
      lit.boxes.add(arrow.to);
    }
  };
  // A connection held in a box has no arrow: the box that holds it lights in its place.
  const lightHolders = (connections: ReadonlySet<string>) => {
    for (const box of view.boxes) if ([...box.within, ...box.loops].some((id) => connections.has(id))) lit.boxes.add(box.id);
  };
  if (target.kind === 'arrow') {
    light(new Set([target.id]));
    const connections = new Set(view.arrows.find((arrow) => arrow.id === target.id)?.connections ?? []);
    for (const box of view.boxes) if (box.passing.some((id) => connections.has(id))) lit.boxes.add(box.id);
    return lit;
  }
  if (target.kind === 'passed') {
    const passed = view.passed.find((each) => each.id === target.id);
    light(new Set(passed?.arrows ?? []));
    lightHolders(new Set(passed?.connections ?? []));
    return lit;
  }
  if (!holdsBox(view, target.id)) return lit;
  lit.boxes.add(target.id);
  const passing = new Set(view.boxes.find((box) => box.id === target.id)?.passing ?? []);
  const arrows = view.arrows.filter((arrow) => arrow.from === target.id || arrow.to === target.id || arrow.connections.some((id) => passing.has(id)));
  light(new Set(arrows.map((arrow) => arrow.id)));
  lightHolders(passing);
  return lit;
}

/** True when a view draws a box, or its boundary, with this id. */
export function holdsBox(view: View, id: string): boolean {
  return view.boundary?.id === id || view.boxes.some((box) => box.id === id);
}

/** True when a view holds what a target names. */
export function holds(view: View, target: Target): boolean {
  if (target.kind === 'box') return holdsBox(view, target.id);
  if (target.kind === 'passed') return view.passed.some((each) => each.id === target.id);
  return view.arrows.some((arrow) => arrow.id === target.id);
}
