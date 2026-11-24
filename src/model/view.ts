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
};

/**
 * One arrow from a drawn box to another, for every connection whose ends fall there. When there
 * are connections the other way too, it is one arrow with a head at each end: `back` names them.
 */
export type Arrow = { id: string; from: string; to: string; connections: string[]; back?: string[] };

/** What a view shows: its boxes, each frame before what it holds, and its arrows. */
export type View = { boxes: Box[]; arrows: Arrow[] };

/** The folders whose records are drawn. Owners and technologies never are. */
const DRAWN: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const order = (kind: string): number => KINDS.findIndex((each) => each.folder === kind);

/**
 * What the whole model shows at a depth. A thing is drawn when it is no deeper than the depth:
 * a person, a system and a piece of infrastructure in no system always; what is in a system from
 * Containers on; what is in an app at Components. Each end of a connection is drawn at the
 * deepest drawn thing it is, or is in.
 */
export function viewOf(records: readonly ModelRecord[], depth: Depth): View {
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

  const deepest = DEPTHS.indexOf(depth);
  const drawn = [...things.keys()].filter((id) => {
    const chain = chains.get(id);
    return chain !== undefined && chain.length <= deepest;
  });
  const isDrawn = new Set(drawn);
  const parents = new Set(drawn.map((id) => chains.get(id)?.[0]));

  const boxes = drawn.map((id): Box => {
    const thing = things.get(id) as ModelRecord;
    const { kind, fields } = thing;
    const parent = chains.get(id)?.[0];
    return {
      id,
      kind,
      name: typeof fields.name === 'string' ? fields.name : id,
      ...(parent !== undefined ? { in: parent } : {}),
      frame: parents.has(id),
      ...(fields.external === true ? { external: true as const } : {}),
      ...(typeof fields.kind === 'string' ? { type: fields.kind } : {}),
      ...(parent === undefined ? zoneOf(thing) : {}),
    };
  });

  // An end is the thing itself when it is drawn, else the nearest drawn thing it is in.
  const lift = (end: unknown): string | undefined => {
    if (typeof end !== 'string') return undefined;
    const chain = chains.get(end);
    return chain === undefined ? undefined : [end, ...chain].find((id) => isDrawn.has(id));
  };
  const arrows = new Map<string, Arrow>();
  for (const record of sorted) {
    if (record.kind !== 'connections') continue;
    const from = lift(record.fields.from);
    const to = lift(record.fields.to);
    if (from === undefined || to === undefined || from === to) continue;
    // A frame and what it holds: the arrow would run from a box to its own inside.
    if (chains.get(from)?.includes(to) || chains.get(to)?.includes(from)) continue;
    const id = `${from}->${to}`;
    const arrow = arrows.get(id);
    if (arrow) arrow.connections.push(record.id);
    else arrows.set(id, { id, from, to, connections: [record.id] });
  }
  const place = new Map(drawn.map((id, index) => [id, index]));
  const at = (id: string): number => place.get(id) ?? 0;
  // A pair of boxes with arrows both ways is one arrow, from the box of the one that comes first.
  const both: Arrow[] = [];
  const taken = new Set<string>();
  for (const arrow of [...arrows.values()].sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to))) {
    if (taken.has(arrow.id)) continue;
    const back = arrows.get(`${arrow.to}->${arrow.from}`);
    if (back !== undefined) taken.add(back.id);
    both.push(back !== undefined ? { ...arrow, back: back.connections } : arrow);
  }
  return { boxes, arrows: both };
}
