import type { ModelRecord } from './answer.ts';
import { KINDS } from './kinds.ts';

/** How far a view opens the model: the systems alone, their parts, or the parts of apps too. */
export type Depth = 'systems' | 'containers' | 'components';

/** The three depths, from the top. */
export const DEPTHS: readonly Depth[] = ['systems', 'containers', 'components'];

/** The depth an address names. None, or one that is not known, is Systems. */
export function depthOf(text: string | null | undefined): Depth {
  return DEPTHS.find((depth) => depth === text) ?? 'systems';
}

/**
 * Where a box at the top of a view stands at the Systems depth: with the people (a person, or an
 * external system that only calls ours), with our systems, or with the other external systems.
 */
export type Zone = 'people' | 'ours' | 'external';

/** One thing drawn: a box, or a frame that holds other boxes. */
export type Box = {
  id: string;
  /** The folder of its record. */
  kind: string;
  name: string;
  /** The id of the frame it is drawn inside. */
  in?: string;
  /** Opened: it holds other boxes. */
  frame: boolean;
  /** A system that the people the model is kept for cannot change. */
  external?: true;
  /** The record's own `kind`: how an app runs, or what a store holds. */
  type?: string;
  /** Its zone, for a box at the top of the view: the same at every depth. */
  zone?: Zone;
  /** An external system in the people's zone, since it only calls ours. */
  caller?: true;
  /** The depth at which it can be the focus, in the views of the whole model and of a focus; not on the focus itself at its own depth. */
  opens?: Depth;
  /** On a store's box in the view of a flow: how many items of the flow it holds, a row each. None where it holds none. */
  rows?: number;
};

/**
 * One arrow from a drawn box to another, for every connection whose ends fall there. When there
 * are connections the other way too, it is one arrow with a head at each end: `back` names them.
 * `reads` marks an arrow that only takes from a queue or a topic: one head, at such a store drawn
 * as a box, and every connection of it reads. What is taken flows the other way than it points.
 */
export type Arrow = { id: string; from: string; to: string; connections: string[]; back?: string[]; reads?: true };

/** What a view shows: its boxes, each frame before what it holds, and its arrows. */
export type View = { boxes: Box[]; arrows: Arrow[] };

/** The stores that hold messages on their way: what is read from one flows on to its reader. */
const PASSING: readonly unknown[] = ['queue', 'topic'];

/** The folders whose records are drawn. Owners, technologies and repositories never are. */
const DRAWN: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const order = (kind: string): number => KINDS.findIndex((each) => each.folder === kind);

/** The records in order of kind and id, the things a view can draw by id, and what each is in, upwards. */
export type Things = { sorted: ModelRecord[]; things: Map<string, ModelRecord>; chains: Map<string, string[] | undefined> };

/** The things a view can draw, by id, in order of kind and id, and what each is in, upwards. */
export function thingsOf(records: readonly ModelRecord[]): Things {
  const sorted = [...records].sort((a, b) => order(a.kind) - order(b.kind) || compare(a.id, b.id));
  const things = new Map<string, ModelRecord>();
  for (const record of sorted) if (DRAWN.includes(record.kind) && !things.has(record.id)) things.set(record.id, record);

  // What each thing is in, upwards. None when a step names nothing, or comes round again.
  const chains = new Map<string, string[] | undefined>();
  for (const id of things.keys()) {
    const chain: string[] = [];
    let whole = true;
    let up = things.get(id)?.fields.in;
    while (up !== undefined) {
      if (typeof up !== 'string' || !things.has(up) || up === id || chain.includes(up)) {
        whole = false;
        break;
      }
      chain.push(up);
      up = things.get(up)?.fields.in;
    }
    chains.set(id, whole ? chain : undefined);
  }
  return { sorted, things, chains };
}

/**
 * One choice of focus: a system or an app, by its id and its name. At Components an app is listed
 * under its system: `in` names it.
 */
export type Focus = { id: string; name: string; in?: string };

/**
 * What can be the focus at a depth, by id. At Containers and at Components, a system with
 * something in it; at Components also an app with a component in it. An app that holds only a
 * store is none: it is opened in the view of its system. None at Systems.
 */
function focusable({ things, chains }: Things, depth: Depth): Set<string> {
  const found = new Set<string>();
  if (depth === 'systems') return found;
  for (const [id, chain] of chains) {
    const holder = chain?.[0];
    const kind = holder === undefined ? undefined : things.get(holder)?.kind;
    if (kind === 'systems' || (depth === 'components' && kind === 'apps' && things.get(id)?.kind === 'components')) found.add(holder as string);
  }
  return found;
}

/** The depth at which a thing is first a focus of its own: a system at Containers, an app at Components. */
const OPENED: Partial<Record<string, Depth>> = { systems: 'containers', apps: 'components' };

/** The address of the diagram at a depth, with a focus or none. */
export function diagramAt(depth: Depth, focus?: string): string {
  if (depth === 'systems') return '/';
  return `/?depth=${depth}${focus === undefined ? '' : `&focus=${encodeURIComponent(focus)}`}`;
}

/**
 * What the whole model shows at a depth. A thing is drawn when it is no deeper than the depth:
 * a person, a system and a piece of infrastructure in no system always; what is in a system from
 * Containers on; what is in an app at Components. Each end of a connection is drawn at the
 * deepest drawn thing it is, or is in.
 *
 * With a focus, only the focus is opened, with what it holds as the whole view draws it: at
 * Components a system has its apps opened too. Around it stand, closed, the things beside it and
 * beside each thing it is in, which are not drawn; of them only those with an arrow to the focus,
 * and only those arrows. A focus that cannot be one at this depth is ignored.
 *
 * A box that can be a focus of its own says at which depth it first is, in `opens`: a system
 * with something in it at Containers, an app with a component at Components. The focus itself
 * does not, at that depth: the view is its own.
 */
export function viewOf(records: readonly ModelRecord[], depth: Depth, focus?: string): View {
  const base = thingsOf(records);
  const { sorted, things, chains } = base;

  const deepest = DEPTHS.indexOf(depth);
  const whole = [...things.keys()].filter((id) => {
    const chain = chains.get(id);
    return chain !== undefined && chain.length <= deepest;
  });

  // The focus, when it can be one at this depth. Within it is the focus and what it holds; with
  // no focus, everything is.
  const into = focus !== undefined && focusable(base, depth).has(focus) ? focus : undefined;
  const within = (id: string): boolean => into === undefined || id === into || (chains.get(id)?.includes(into) ?? false);
  // Around a focus stand, closed, the things beside it and beside each thing it is in. The things
  // it is in are not drawn.
  const above = into === undefined ? [] : [into, ...(chains.get(into) ?? [])];
  const beside = new Set(above.map((id) => chains.get(id)?.[0]));
  const drawn = whole.filter((id) => within(id) || (!above.includes(id) && beside.has(chains.get(id)?.[0])));
  const view = drawingOf(base, drawn, sorted.filter((record) => record.kind === 'connections'), within);
  // The depth each box opens at, when it can be a focus there and this view is not that one.
  const opened = new Map(DEPTHS.map((each) => [each, focusable(base, each)]));
  const opens = (box: Box): Depth | undefined => {
    const at = OPENED[box.kind];
    return at !== undefined && opened.get(at)?.has(box.id) && !(box.id === into && at === depth) ? at : undefined;
  };
  return { ...view, boxes: view.boxes.map((box) => (opens(box) !== undefined ? { ...box, opens: opens(box) as Depth } : box)) };
}

/**
 * The boxes of the things drawn, each frame before what it holds, and the arrows of the
 * connections given. `drawn` is in the order of `thingsOf`. A drawn thing with a drawn thing in
 * it is a frame. Each end of a connection is drawn at the nearest drawn thing it is, or is in;
 * those that join a box to itself or to its own inside are left out. One arrow joins a pair of
 * boxes for each direction, and a pair with arrows both ways is one arrow with `back`.
 *
 * `within` is the focus of `viewOf`: an arrow is drawn only when one of its ends is within, and
 * a box that is not within only when an arrow touches it.
 */
export function drawingOf({ sorted, things, chains }: Things, drawn: readonly string[], connections: readonly ModelRecord[], within: (id: string) => boolean = () => true): View {
  // The zone of each thing at the top, worked out on the connections themselves, so that it is
  // the same at every depth. "Ours" is a system that is not external, or anything in one.
  const top = (end: unknown): ModelRecord | undefined => {
    const chain = typeof end === 'string' ? chains.get(end) : undefined;
    return chain === undefined ? undefined : things.get(chain.at(-1) ?? (end as string));
  };
  const ours = (thing: ModelRecord | undefined): boolean => thing?.kind === 'systems' && thing.fields.external !== true;
  const calls = new Set<string>();
  const called = new Set<string>();
  for (const record of sorted) {
    if (record.kind !== 'connections') continue;
    const from = top(record.fields.from);
    const to = top(record.fields.to);
    if (from === undefined || to === undefined) continue;
    if (ours(to)) calls.add(from.id);
    if (ours(from)) called.add(to.id);
  }
  const zoneOf = ({ id, kind, fields }: ModelRecord): { zone: Zone; caller?: true } => {
    if (kind === 'people') return { zone: 'people' };
    if (kind !== 'systems' || fields.external !== true) return { zone: 'ours' };
    return calls.has(id) && !called.has(id) ? { zone: 'people', caller: true } : { zone: 'external' };
  };

  const isDrawn = new Set(drawn);
  // A frame holds what is drawn: around a focus, a closed box has nothing drawn in it.
  const holders = new Set(drawn.map((id) => chains.get(id)?.[0]));

  const boxes = drawn.map((id): Box => {
    const thing = things.get(id) as ModelRecord;
    const { kind, fields } = thing;
    // A box around a focus may be in a thing that is not drawn: it stands at the top.
    const up = chains.get(id)?.[0];
    const parent = up !== undefined && isDrawn.has(up) ? up : undefined;
    return {
      id,
      kind,
      name: typeof fields.name === 'string' ? fields.name : id,
      ...(parent !== undefined ? { in: parent } : {}),
      frame: holders.has(id),
      ...(fields.external === true ? { external: true as const } : {}),
      ...(typeof fields.kind === 'string' ? { type: fields.kind } : {}),
      ...(parent === undefined ? zoneOf(thing) : {}),
    };
  });

  // An end is the thing itself when it is drawn, else the nearest drawn thing it is in.
  const lift = (end: unknown): string | undefined => (typeof end !== 'string' ? undefined : [end, ...(chains.get(end) ?? [])].find((id) => isDrawn.has(id)));
  const arrows = new Map<string, Arrow>();
  for (const record of connections) {
    const from = lift(record.fields.from);
    const to = lift(record.fields.to);
    if (from === undefined || to === undefined || from === to) continue;
    // A frame and what it holds: the arrow would run from a box to its own inside.
    if (chains.get(from)?.includes(to) || chains.get(to)?.includes(from)) continue;
    // Around a focus, an arrow is drawn only when it touches the focus or what it holds.
    if (!within(from) && !within(to)) continue;
    const id = `${from}->${to}`;
    const arrow = arrows.get(id);
    if (arrow) arrow.connections.push(record.id);
    else arrows.set(id, { id, from, to, connections: [record.id] });
  }
  // An arrow only reads when it ends at a queue or a topic that is itself drawn, as a box, and
  // each of its connections reads. A pair with arrows both ways never does.
  const access = new Map(sorted.filter((record) => record.kind === 'connections').map((record) => [record.id, record.fields.access]));
  const frames = new Set(boxes.filter((box) => box.frame).map((box) => box.id));
  const reads = (arrow: Arrow): boolean => {
    const store = things.get(arrow.to);
    return store?.kind === 'stores' && !frames.has(arrow.to) && PASSING.includes(store.fields.kind) && arrow.connections.every((id) => access.get(id) === 'read');
  };
  const place = new Map(drawn.map((id, index) => [id, index]));
  const at = (id: string): number => place.get(id) ?? 0;
  // A pair of boxes with arrows both ways is one arrow, from the box of the one that comes first.
  const both: Arrow[] = [];
  const taken = new Set<string>();
  for (const arrow of [...arrows.values()].sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to))) {
    if (taken.has(arrow.id)) continue;
    const back = arrows.get(`${arrow.to}->${arrow.from}`);
    if (back !== undefined) taken.add(back.id);
    both.push(back !== undefined ? { ...arrow, back: back.connections } : reads(arrow) ? { ...arrow, reads: true } : arrow);
  }
  // A box around a focus is drawn only when an arrow touches it.
  const touched = new Set(both.flatMap((arrow) => [arrow.from, arrow.to]));
  return { boxes: boxes.filter((box) => within(box.id) || touched.has(box.id)), arrows: both };
}

/**
 * What can be chosen as a focus at a depth, by name without regard to capitals and then by id.
 * At Containers each system with something in it. At Components the same systems, and after each
 * its apps that hold a component, each with `in`. None at Systems.
 */
export function focusesOf(records: readonly ModelRecord[], depth: Depth): Focus[] {
  const base = thingsOf(records);
  const { things, chains } = base;
  const named = [...focusable(base, depth)]
    .map((id) => {
      const fields = things.get(id)?.fields;
      return { id, name: typeof fields?.name === 'string' ? fields.name : id };
    })
    .sort((a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.id, b.id));
  const systems = named.filter((choice) => things.get(choice.id)?.kind === 'systems');
  return systems.flatMap((system) => [system, ...named.filter((choice) => things.get(choice.id)?.kind === 'apps' && chains.get(choice.id)?.[0] === system.id).map((app) => ({ ...app, in: system.id }))]);
}

/**
 * The focus an id in the address means at a depth, or none for everything: the id when it can be
 * chosen there, and else the nearest thing it is in that can be. So a system chosen at Containers
 * is kept at Components, an app chosen at Components means its system at Containers, and an app
 * with no component means its system at both.
 */
export function focusFor(records: readonly ModelRecord[], depth: Depth, wanted: string | null | undefined): string | undefined {
  if (wanted === null || wanted === undefined) return undefined;
  const base = thingsOf(records);
  const choices = focusable(base, depth);
  return [wanted, ...(base.chains.get(wanted) ?? [])].find((id) => choices.has(id));
}

/**
 * What stays bright while a box or an arrow of a view is in focus, and the rest fades. For a box:
 * the box, its arrows and the boxes at their other ends; for an arrow: the arrow and its two ends;
 * and for both, every frame those boxes are in. A frame, or an id the view does not have, fades
 * nothing. An end that is a frame is bright itself, and what it holds is not because of that.
 */
export function litBy(view: View, id: string): { boxes: string[]; arrows: string[] } | undefined {
  const boxes = new Map(view.boxes.map((box) => [box.id, box]));
  const box = boxes.get(id);
  const arrow = view.arrows.find((each) => each.id === id);
  if (box?.frame === true || (box === undefined && arrow === undefined)) return undefined;
  const arrows = box !== undefined ? view.arrows.filter((each) => each.from === id || each.to === id) : arrow !== undefined ? [arrow] : [];
  const bright = new Set(box !== undefined ? [id] : []);
  for (const each of arrows) {
    for (const end of [each.from, each.to]) {
      // The end, and the frames it is in, up to the top.
      for (let at: string | undefined = end; at !== undefined && !bright.has(at); at = boxes.get(at)?.in) bright.add(at);
    }
  }
  for (let at = box?.in; at !== undefined && !bright.has(at); at = boxes.get(at)?.in) bright.add(at);
  return { boxes: view.boxes.filter((each) => bright.has(each.id)).map((each) => each.id), arrows: arrows.map((each) => each.id) };
}
