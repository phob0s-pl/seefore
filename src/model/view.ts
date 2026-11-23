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
};

/** One arrow from a drawn box to another, for every connection whose ends fall there. */
export type Arrow = { id: string; from: string; to: string; connections: string[] };

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

  const deepest = DEPTHS.indexOf(depth);
  const drawn = [...things.keys()].filter((id) => {
    const chain = chains.get(id);
    return chain !== undefined && chain.length <= deepest;
  });
  const isDrawn = new Set(drawn);
  const parents = new Set(drawn.map((id) => chains.get(id)?.[0]));

  const boxes = drawn.map((id): Box => {
    const { kind, fields } = things.get(id) as ModelRecord;
    const parent = chains.get(id)?.[0];
    return {
      id,
      kind,
      name: typeof fields.name === 'string' ? fields.name : id,
      ...(parent !== undefined ? { in: parent } : {}),
      frame: parents.has(id),
      ...(fields.external === true ? { external: true as const } : {}),
      ...(typeof fields.kind === 'string' ? { type: fields.kind } : {}),
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
  return { boxes, arrows: [...arrows.values()].sort((a, b) => at(a.from) - at(b.from) || at(a.to) - at(b.to)) };
}
