import type { LegendKey, View, ViewArrow, ViewBox } from '@seefore/core';

/**
 * What the reader points at, focuses or chooses in a picture, by id: a box (or the boundary), an
 * arrow, or something the arrows pass through that has no box, from the list under the legend.
 */
export type Target = { kind: 'box'; id: string } | { kind: 'arrow'; id: string } | { kind: 'passed'; id: string };

/**
 * What the reader can point at or move the focus to: a target, or a line of the legend by its
 * key. A line of the legend lights what it explains while it is pointed at, and is never chosen.
 */
export type Pointed = Target | { kind: 'legend'; id: LegendKey };

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
 * it. A line of the legend lights what it explains: see `litByLegend`. A target the view does
 * not hold lights nothing.
 */
export function litBy(view: View, target: Pointed): Lit {
  if (target.kind === 'legend') return holds(view, target) ? litByLegend(view, target.id) : { boxes: new Set(), arrows: new Set() };
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

/**
 * What lights when the reader chooses a store that an app keeps, which has no box and is drawn
 * at its app: that app's box, and of the arrows only those that hold one of the store's own
 * connections, with their ends and the boxes those connections pass through, as an arrow lights
 * them. The app's other arrows stay faded: they are not the store's. Nothing lights when the view
 * does not draw the app.
 */
export function litByKept(view: View, keeper: string, connections: ReadonlySet<string>): Lit {
  const lit: Lit = { boxes: new Set(), arrows: new Set() };
  if (!holdsBox(view, keeper)) return lit;
  lit.boxes.add(keeper);
  for (const arrow of view.arrows) {
    if (!arrow.connections.some((id) => connections.has(id))) continue;
    lit.arrows.add(arrow.id);
    lit.boxes.add(arrow.from);
    lit.boxes.add(arrow.to);
  }
  for (const box of view.boxes) if (box.passing.some((id) => connections.has(id))) lit.boxes.add(box.id);
  return lit;
}

/**
 * What a line of the legend lights: every box and arrow of the view that it explains, so that a
 * reader zoomed out sees where each is. An arrow lights alone, without the boxes at its ends, so
 * that what has the mark is not mixed with what it joins.
 *
 * - A look lights every box of that look, and the line of an external system in scope lights
 *   that box, which the line of external systems lights too. Infrastructure lights the pieces
 *   that have a box: those only passed through are in the list under the legend.
 * - The boundary lights the boundary; an arrow, every arrow; an arrow for several connections,
 *   each that stands for more than one.
 * - A route lights every arrow with a route line. A name in brackets on a route lights every
 *   arrow whose route has one, and every arrow that passes through something in the list under
 *   the legend that has a condition, though its line may only say on how many.
 * - The ring lights every arrow that has it; the line that says on how many the far side opened
 *   lights every arrow that has that line.
 * - `only` lights every box, the boundary and every arrow that has an `only` line.
 * - Copies, passing through and kept stores light every box that carries that mark.
 */
export function litByLegend(view: View, key: LegendKey): Lit {
  const lit: Lit = { boxes: new Set(), arrows: new Set() };
  const boxes = (keep: (box: ViewBox) => boolean) => {
    for (const box of view.boxes) if (keep(box)) lit.boxes.add(box.id);
  };
  const arrows = (keep: (arrow: ViewArrow) => boolean) => {
    for (const arrow of view.arrows) if (keep(arrow)) lit.arrows.add(arrow.id);
  };
  switch (key) {
    case 'person':
    case 'system-scope':
    case 'system':
    case 'system-external':
    case 'app':
    case 'store':
    case 'queue-or-topic':
    case 'infrastructure':
      boxes((box) => box.look === key);
      break;
    case 'system-scope-external':
      boxes((box) => box.scope && box.look === 'system-external');
      break;
    case 'boundary':
      if (view.boundary !== undefined) lit.boxes.add(view.boundary.id);
      break;
    case 'arrow':
      arrows(() => true);
      break;
    case 'arrow-many':
      arrows((arrow) => arrow.connections.length > 1);
      break;
    case 'route':
      arrows((arrow) => arrow.route !== undefined);
      break;
    case 'route-only': {
      const through = new Set(view.passed.filter((each) => each.conditions.length > 0).flatMap((each) => each.arrows));
      arrows((arrow) => arrow.route?.bracketed === true || through.has(arrow.id));
      break;
    }
    case 'opened':
      arrows((arrow) => arrow.opened?.all === true);
      break;
    case 'opened-some':
      arrows((arrow) => arrow.opened?.all === false);
      break;
    case 'only':
      boxes((box) => box.only !== undefined);
      if (view.boundary?.only !== undefined) lit.boxes.add(view.boundary.id);
      arrows((arrow) => arrow.only !== undefined);
      break;
    case 'loop':
      boxes((box) => box.loops.length > 0);
      break;
    case 'passing':
      boxes((box) => box.passing.length > 0);
      break;
    case 'kept':
      boxes((box) => box.kept.length > 0);
      break;
    default: {
      // Every key the core can put in a legend is above: a new one fails the type check here, so that none lights nothing unseen.
      const unknown: never = key;
      throw new Error(`No light for the legend's key ${String(unknown)}.`);
    }
  }
  return lit;
}

/** True when a view draws a box, or its boundary, with this id. */
export function holdsBox(view: View, id: string): boolean {
  return view.boundary?.id === id || view.boxes.some((box) => box.id === id);
}

/** True when a view holds what a target names: for a line of the legend, when its legend has it. */
export function holds(view: View, target: Pointed): boolean {
  if (target.kind === 'legend') return view.legend.some((entry) => entry.key === target.id);
  if (target.kind === 'box') return holdsBox(view, target.id);
  if (target.kind === 'passed') return view.passed.some((each) => each.id === target.id);
  return view.arrows.some((arrow) => arrow.id === target.id);
}
