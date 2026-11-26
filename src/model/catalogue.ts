import type { ModelRecord } from './answer.ts';
import { ofArchitecture } from './kinds.ts';

/** One row of the Software tab: a record, and how deep it stands in the tree. */
export type TreeRow = { record: ModelRecord; depth: number };

/** A part's owner, or the repository a system's or an app's code is in: its id, and the id of the record it is written on. */
export type Owned = { id: string; from: string };

/** A condition a thing is there under: its words, and the id of the record they are written on. */
export type Condition = { text: string; from: string };

/** What the pages of the records ask of the model. */
export type Catalogue = {
  /** The record of an id. */
  record: (id: string) => ModelRecord | undefined;
  /** The address of a record's page. */
  address: (record: ModelRecord) => string | undefined;
  /** The name of a record, or its id when it has none. */
  nameOf: (id: string) => string;
  /** The Software tab: the systems with what is in them, then the infrastructure in no system. */
  software: TreeRow[];
  people: ModelRecord[];
  connections: ModelRecord[];
  technologies: ModelRecord[];
  owners: ModelRecord[];
  repositories: ModelRecord[];
  features: ModelRecord[];
  data: ModelRecord[];
  /** What a thing is in, upwards. */
  chain: (id: string) => ModelRecord[];
  /** What is directly inside a thing. */
  inside: (id: string) => ModelRecord[];
  /** The connections that start at a thing. */
  from: (id: string) => ModelRecord[];
  /** The connections that end at a thing. */
  to: (id: string) => ModelRecord[];
  /** A part's owner, written on it or on the nearest thing it is in that has one. */
  owner: (id: string) => Owned | undefined;
  /** A thing's conditions: its own, then those of each thing it is in, upwards. */
  conditions: (id: string) => Condition[];
  /** The parts and the connections that name a technology. */
  usedBy: (id: string) => { parts: ModelRecord[]; connections: ModelRecord[] };
  /** The parts an owner is written on, and those that take it from what they are in. */
  answersFor: (id: string) => { written: ModelRecord[]; taken: ModelRecord[] };
  /** The repository a system's or an app's code is in: its own, or for an app its system's. None where neither names one. */
  repository: (id: string) => Owned | undefined;
  /** The systems and the apps whose code a repository holds, by their own key or their system's: the systems first, each by name. */
  codeIn: (id: string) => ModelRecord[];
};

/** The folders of the things: what is drawn, and what a connection joins. */
const THINGS: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];
/** The order of what is inside a thing: apps, then components, then stores, then infrastructure. */
const INSIDE: readonly string[] = ['apps', 'components', 'stores', 'infrastructure'];

/** The first part of the address of each kind's pages. */
const PAGES: Record<string, string> = {
  people: 'actors',
  systems: 'models',
  apps: 'models',
  stores: 'models',
  components: 'models',
  infrastructure: 'models',
  connections: 'connections',
  technologies: 'technologies',
  owners: 'owners',
  repositories: 'repositories',
  features: 'features',
  flows: 'flows',
  data: 'data',
  rules: 'rules',
  context: 'context',
};

const collator = new Intl.Collator('en', { sensitivity: 'accent', numeric: true });
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : []);
const idOrder = (a: ModelRecord, b: ModelRecord): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** By name, without regard to capitals; a record with no name after those with one; then by id. */
export const byName = (a: ModelRecord, b: ModelRecord): number => {
  const first = text(a.fields.name);
  const second = text(b.fields.name);
  if (first !== undefined && second !== undefined) return collator.compare(first, second) || idOrder(a, b);
  return Number(first === undefined) - Number(second === undefined) || idOrder(a, b);
};

/**
 * What a change touches, for a catalogue made for that change: the change's id, and the paths,
 * `folder/id`, of the records it adds, updates and removes.
 */
export type Touch = { change: string; paths: ReadonlySet<string> };

/** The address of a record under a change: the change's, `records`, and the record's path. */
export const addressUnder = (change: string, path: string): string => `/changes/${change}/records/${path}`;

/** The address of a record's page in the system; none for a kind that has no page. */
export const addressInSystem = (record: ModelRecord): string | undefined => (PAGES[record.kind] !== undefined ? `/${PAGES[record.kind]}/${record.id}` : undefined);

/**
 * What the pages of the records ask, worked out once from the records of `/api/model`. With
 * what a change touches, the address of a touched record is the one under that change, and any
 * other the system's: the one place that decides where a record's link leads.
 */
export function catalogueOf(records: readonly ModelRecord[], touch?: Touch): Catalogue {
  // An id names the first record that has it; a second one is a problem of `seefore check`.
  // A rule of the team's own and a line of context are no records of the architecture: they have pages of their own.
  const byId = new Map<string, ModelRecord>();
  for (const record of records) if (ofArchitecture(record.kind) && !byId.has(record.id)) byId.set(record.id, record);
  const kept = [...byId.values()];
  const of = (kind: string) => kept.filter((record) => record.kind === kind).sort(byName);
  const things = kept.filter((record) => THINGS.includes(record.kind));
  const parts = things.filter((record) => record.kind !== 'people');
  const thing = (id: unknown) => {
    const record = typeof id === 'string' ? byId.get(id) : undefined;
    return record !== undefined && THINGS.includes(record.kind) ? record : undefined;
  };

  const children = new Map<string, ModelRecord[]>();
  for (const record of [...parts].sort((a, b) => INSIDE.indexOf(a.kind) - INSIDE.indexOf(b.kind) || byName(a, b))) {
    const up = thing(record.fields.in);
    if (up === undefined || up.id === record.id) continue;
    const inUp = children.get(up.id);
    if (inUp === undefined) children.set(up.id, [record]);
    else inUp.push(record);
  }
  const inside = (id: string) => children.get(id) ?? [];

  const chain = (id: string): ModelRecord[] => {
    const found: ModelRecord[] = [];
    let up = thing(byId.get(id)?.fields.in);
    while (up !== undefined && up.id !== id && !found.includes(up)) {
      found.push(up);
      up = thing(up.fields.in);
    }
    return found;
  };

  // The tree: each system and what is in it, then the infrastructure in no system, then any
  // part whose `in` names nothing it can be in, so that every part has a row.
  const software: TreeRow[] = [];
  const placed = new Set<string>();
  const place = (record: ModelRecord, depth: number) => {
    if (placed.has(record.id)) return;
    placed.add(record.id);
    software.push({ record, depth });
    for (const child of inside(record.id)) place(child, depth + 1);
  };
  for (const system of of('systems')) place(system, 0);
  for (const piece of of('infrastructure')) if (!placed.has(piece.id)) place(piece, 0);
  for (const part of [...parts].sort(byName)) if (!placed.has(part.id)) place(part, 0);

  const connections = of('connections');
  const ends = (field: 'from' | 'to') => (id: string) => connections.filter((connection) => connection.fields[field] === id);

  const owner = (id: string): Owned | undefined => {
    const start = byId.get(id);
    if (start === undefined || start.kind === 'people' || !THINGS.includes(start.kind)) return undefined;
    for (const record of [start, ...chain(id)]) {
      const written = text(record.fields.owner);
      if (written !== undefined) return { id: written, from: record.id };
    }
    return undefined;
  };

  // As an owner is: the id as it is written, whether or not it names a record, and the page says which it names.
  // An app's code is in its system's repository only when the app has no key of its own; a store, a component and a piece of infrastructure have none.
  const repository = (id: string): Owned | undefined => {
    const start = byId.get(id);
    if (start?.kind !== 'systems' && start?.kind !== 'apps') return undefined;
    const system = start.kind === 'apps' ? thing(start.fields.in) : undefined;
    const holder = start.fields.repository !== undefined ? start : system?.kind === 'systems' ? system : undefined;
    const written = text(holder?.fields.repository);
    return holder !== undefined && written !== undefined ? { id: written, from: holder.id } : undefined;
  };

  const conditions = (id: string): Condition[] => {
    const start = byId.get(id);
    if (start === undefined) return [];
    return [start, ...chain(id)].flatMap((record) => {
      const only = text(record.fields.only);
      return only !== undefined ? [{ text: only, from: record.id }] : [];
    });
  };

  return {
    record: (id) => byId.get(id),
    address: (record) => {
      const path = `${record.kind}/${record.id}`;
      if (touch?.paths.has(path)) return addressUnder(touch.change, path);
      return addressInSystem(record);
    },
    nameOf: (id) => text(byId.get(id)?.fields.name) ?? id,
    software,
    people: of('people'),
    connections,
    technologies: of('technologies'),
    owners: of('owners'),
    repositories: of('repositories'),
    features: of('features'),
    data: of('data'),
    chain,
    inside,
    from: ends('from'),
    to: ends('to'),
    owner,
    conditions,
    usedBy: (id) => ({
      parts: parts.filter((part) => list(part.fields.technology).includes(id)).sort(byName),
      connections: connections.filter((connection) => list(connection.fields.technology).includes(id)),
    }),
    answersFor: (id) => {
      const sorted = [...parts].sort(byName);
      return {
        written: sorted.filter((part) => part.fields.owner === id),
        taken: sorted.filter((part) => part.fields.owner === undefined && owner(part.id)?.id === id),
      };
    },
    repository,
    codeIn: (id) => [...of('systems'), ...of('apps')].filter((part) => repository(part.id)?.id === id),
  };
}
