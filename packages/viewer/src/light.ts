import type { LegendKey, View, ViewArrow, ViewBoundary, ViewBox } from '@seefore/core';

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
  /** Things in the list under the legend, which are passed through and have no box, by id. */
  passed: Set<string>;
}

/** Nothing lit. */
function none(): Lit {
  return { boxes: new Set(), arrows: new Set(), passed: new Set() };
}

/**
 * The boxes and boundaries of a view that hold, inside them or between their copies, one of these
 * connections. Such a connection has no arrow, so what holds it lights in its place.
 */
function holdersOf(view: View, connections: ReadonlySet<string>): string[] {
  return [...view.boxes, ...view.boundaries].filter((box) => [...box.within, ...box.loops].some((id) => connections.has(id))).map((box) => box.id);
}

/**
 * What lights when the reader points at a target. A box lights itself, every arrow that starts
 * or ends at it or passes through it, and the boxes at the ends of each, and every box that
 * holds, inside it or between its copies, a connection that passes through it. A boundary
 * lights as a box does: what it holds is not its own light. An arrow lights
 * itself, its two ends and the boxes it passes through, and in the list under the legend what
 * it passes through that has no box. Something with no box lights itself in that list, the
 * arrows that pass through it and their ends, and the boxes that hold a connection that passes
 * through it. A line of the legend lights what it explains: see `litByLegend`. A target the view
 * does not hold lights nothing.
 */
export function litBy(view: View, target: Pointed): Lit {
  if (target.kind === 'legend') return holds(view, target) ? litByLegend(view, target.id) : none();
  const lit = none();
  const light = (arrows: ReadonlySet<string>) => {
    for (const arrow of view.arrows) {
      if (!arrows.has(arrow.id)) continue;
      lit.arrows.add(arrow.id);
      lit.boxes.add(arrow.from);
      lit.boxes.add(arrow.to);
    }
  };
  const lightHolders = (connections: ReadonlySet<string>) => {
    for (const id of holdersOf(view, connections)) lit.boxes.add(id);
  };
  if (target.kind === 'arrow') {
    if (!holds(view, target)) return lit;
    light(new Set([target.id]));
    const connections = new Set(view.arrows.find((arrow) => arrow.id === target.id)?.connections ?? []);
    for (const box of [...view.boxes, ...view.boundaries]) if (box.passing.some((id) => connections.has(id))) lit.boxes.add(box.id);
    for (const each of view.passed) if (each.arrows.includes(target.id)) lit.passed.add(each.id);
    return lit;
  }
  if (target.kind === 'passed') {
    const passed = view.passed.find((each) => each.id === target.id);
    if (passed === undefined) return lit;
    lit.passed.add(passed.id);
    light(new Set(passed.arrows));
    lightHolders(new Set(passed.connections));
    return lit;
  }
  if (!holdsBox(view, target.id)) return lit;
  lit.boxes.add(target.id);
  const passing = new Set([...view.boxes, ...view.boundaries].find((box) => box.id === target.id)?.passing ?? []);
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
  const lit = none();
  if (!holdsBox(view, keeper)) return lit;
  lit.boxes.add(keeper);
  for (const arrow of view.arrows) {
    if (!arrow.connections.some((id) => connections.has(id))) continue;
    lit.arrows.add(arrow.id);
    lit.boxes.add(arrow.from);
    lit.boxes.add(arrow.to);
  }
  for (const box of [...view.boxes, ...view.boundaries]) if (box.passing.some((id) => connections.has(id))) lit.boxes.add(box.id);
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
 * - The chosen box lights it, as a box or a boundary. The boundary lights each boundary of a
 *   system, and that of an app each boundary of an app; an arrow, every arrow; an arrow for
 *   several connections, each that stands for more than one.
 * - A route lights every arrow with a route line. A name in brackets on a route lights every
 *   arrow whose route has one; and for each thing in the list under the legend that has a
 *   condition, that thing in the list, every arrow that passes through it, though its line may
 *   only say on how many, and every box that holds a connection that passes through it, which
 *   has no arrow. So the line lights something wherever the core puts it in the legend.
 * - The ring lights every arrow that has it; the line that says on how many the far side opened
 *   lights every arrow that has that line.
 * - `only` lights every box, boundary and arrow that has an `only` line.
 * - Copies, passing through and kept stores light every box and boundary that carries that mark.
 *
 * No other line can be about a thing held inside a box or only in the list: the core puts each
 * of them in the legend only for a box, the boundary or an arrow that the view has.
 */
export function litByLegend(view: View, key: LegendKey): Lit {
  const lit = none();
  const boxes = (keep: (box: ViewBox) => boolean) => {
    for (const box of view.boxes) if (keep(box)) lit.boxes.add(box.id);
  };
  // A boundary is lit as a box is: it carries the same marks, and the chosen box may be one.
  const boundaries = (keep: (boundary: ViewBoundary) => boolean) => {
    for (const boundary of view.boundaries) if (keep(boundary)) lit.boxes.add(boundary.id);
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
    case 'component':
    case 'infrastructure':
      boxes((box) => box.look === key);
      break;
    case 'system-scope-external':
      boxes((box) => box.scope && box.look === 'system-external');
      break;
    case 'scope':
      boxes((box) => box.scope);
      boundaries((boundary) => boundary.scope);
      break;
    case 'boundary':
      boundaries((boundary) => boundary.family === 'systems');
      break;
    case 'boundary-app':
      boundaries((boundary) => boundary.family === 'apps');
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
      const bracketed = view.passed.filter((each) => each.conditions.length > 0);
      const through = new Set(bracketed.flatMap((each) => each.arrows));
      arrows((arrow) => arrow.route?.bracketed === true || through.has(arrow.id));
      for (const id of holdersOf(view, new Set(bracketed.flatMap((each) => each.connections)))) lit.boxes.add(id);
      for (const each of bracketed) lit.passed.add(each.id);
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
      boundaries((boundary) => boundary.only !== undefined);
      arrows((arrow) => arrow.only !== undefined);
      break;
    case 'loop':
      boxes((box) => box.loops.length > 0);
      boundaries((boundary) => boundary.loops.length > 0);
      break;
    case 'passing':
      boxes((box) => box.passing.length > 0);
      boundaries((boundary) => boundary.passing.length > 0);
      break;
    case 'kept':
      boxes((box) => box.kept.length > 0);
      boundaries((boundary) => boundary.kept.length > 0);
      break;
    default: {
      // Every key the core can put in a legend is above: a new one fails the type check here, so that none lights nothing unseen.
      const unknown: never = key;
      throw new Error(`No light for the legend's key ${String(unknown)}.`);
    }
  }
  return lit;
}

/** What speaks on the reading line and lights, and whether its words unfold whole. */
export interface Speaking {
  target: Pointed;
  /** True for what the keyboard's focus came to, or a finger tapped: the reader has no pointer to rest on it and read its title. */
  whole: boolean;
}

/** Something the reader did to a target: pointed at it, moved the focus to it, or tapped it. `at` grows with each act. */
export interface Act extends Speaking {
  at: number;
}

/**
 * What speaks on the reading line and lights: of what the reader points at, has the focus on and
 * last tapped, the one acted on last, so that a pointer that rests on a box does not silence the
 * focus that came after it, nor the other way round; else what is chosen. A target the view no
 * longer holds, as after a reload took its box, is dropped before the choice is made.
 */
export function speakingOf(view: View, acts: readonly (Act | null)[], chosen: Target | null): Speaking | null {
  const held = acts.filter((act): act is Act => act !== null && holds(view, act.target));
  const last = held.reduce<Act | undefined>((latest, act) => (latest === undefined || act.at > latest.at ? act : latest), undefined);
  if (last !== undefined) return { target: last.target, whole: last.whole };
  return chosen !== null && holds(view, chosen) ? { target: chosen, whole: false } : null;
}

/** True when a view draws a box, or a boundary, with this id. */
export function holdsBox(view: View, id: string): boolean {
  return view.boundaries.some((boundary) => boundary.id === id) || view.boxes.some((box) => box.id === id);
}

/** True when a view holds what a target names: for a line of the legend, when its legend has it. */
export function holds(view: View, target: Pointed): boolean {
  if (target.kind === 'legend') return view.legend.some((entry) => entry.key === target.id);
  if (target.kind === 'box') return holdsBox(view, target.id);
  if (target.kind === 'passed') return view.passed.some((each) => each.id === target.id);
  return view.arrows.some((arrow) => arrow.id === target.id);
}
