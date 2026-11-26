import type { Position } from './problem.ts';

/**
 * What the rules know of one file with a good id: its id, its kind (its folder), its file, and
 * whether it read without problems. A file that did not still stands for its id and its kind.
 */
export type Entry = {
  id: string;
  kind: string;
  file: string;
  ok: boolean;
  /** What the file holds. Empty when the file did not read. */
  fields: Record<string, unknown>;
  /** Where each field, and each item of a list (as `via[1]`), is written. */
  at: Map<string, Position>;
};

/** The model as a rule asks about it. */
export type Model = {
  entries: readonly Entry[];
  /** Every entry that has the id: one, or more when two files claim it. */
  claims(id: string): readonly Entry[];
  /** The record of an id. None when no file has it, or when two do. */
  record(id: string): Entry | undefined;
  /** The kind of an id, from its folder, with the same limits as `record`. */
  kindOf(id: string): string | undefined;
  /** What the id is in, upwards: the app, then its system. */
  chain(id: string): string[];
  /** The ids of what is directly in it. */
  inside(id: string): string[];
  /** The connections with the id as `from` or `to`. */
  touching(id: string): Entry[];
};

/** The text of a field that holds an id, or nothing. */
export function textOf(entry: Entry, field: string): string | undefined {
  const value = entry.fields[field];
  return typeof value === 'string' ? value : undefined;
}

/** The ids of a field that holds a list of them. */
export function listOf(entry: Entry, field: string): string[] {
  const value = entry.fields[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** A step of a flow that read: its place in the list, its keys, and the whole of it. */
export type Step = {
  index: number;
  id: string;
  does?: string;
  reply?: string;
  name?: string;
  after: string[];
  data: string[];
  /** What it does to the store its connection ends at, as written: `read` or `write`. */
  access?: string;
  removes: string[];
  fields: Record<string, unknown>;
};

/** The steps of a flow, in order. None when the entry is no flow, or its file did not read. */
export function stepsOf(entry: Entry): Step[] {
  const steps = entry.ok && entry.kind === 'flows' ? entry.fields['steps'] : undefined;
  if (!Array.isArray(steps)) return [];
  return steps.map((value: unknown, index) => {
    const fields = value as Record<string, unknown>;
    const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string) : undefined);
    const many = (key: string) => (Array.isArray(fields[key]) ? (fields[key] as unknown[]).filter((item): item is string => typeof item === 'string') : []);
    const does = text('does');
    const reply = text('reply');
    const name = text('name');
    const access = text('access');
    return {
      index,
      id: text('id') ?? '',
      ...(does !== undefined ? { does } : {}),
      ...(reply !== undefined ? { reply } : {}),
      ...(name !== undefined ? { name } : {}),
      after: many('after'),
      data: many('data'),
      ...(access !== undefined ? { access } : {}),
      removes: many('removes'),
      fields,
    };
  });
}

/** A record as `wayOf` asks about it: its kind, which is its folder, and what it holds. An entry of the check and a record of `/api/model` are both one. */
type Held = { kind: string; fields: Record<string, unknown> };

/** A step at a store: the connection its `does` names, the store that connection ends at, and the step's way there. No `way` where it is not said. */
export type AtStore = { connection: string; store: string; way?: 'read' | 'write' };

/**
 * Where a step is at a store, and which way it goes there; nothing for a step at no store. A
 * step is at a store when `does` names a connection whose `to` is a store. Its way is the
 * connection's `access` where that is `read` or `write`; the step's own `access` where the
 * connection says `read-write`; and not said where neither says it. The checks, the pages and
 * the items of a flow all ask this one function. `record` finds a record by its id.
 */
export function wayOf(step: Step, record: (id: string) => Held | undefined): AtStore | undefined {
  const connection = step.does === undefined ? undefined : record(step.does);
  if (step.does === undefined || connection?.kind !== 'connections') return undefined;
  const to = connection.fields['to'];
  if (typeof to !== 'string' || record(to)?.kind !== 'stores') return undefined;
  const access = connection.fields['access'];
  const own = step.access === 'read' || step.access === 'write' ? step.access : undefined;
  const way = access === 'read' || access === 'write' ? access : access === 'read-write' ? own : undefined;
  return { connection: step.does, store: to, ...(way !== undefined ? { way } : {}) };
}

/** What an act does to its item: puts it into the store, reads it there, or takes it out. */
export type ActDoes = 'put' | 'read' | 'take';

/**
 * What a step at a store does there to each id it names, by its way, as `wayOf` says it (C5b): of
 * `data` a put where it writes and a read where it reads, none where its way is not said; of
 * `removes` a take, whatever the way. Those of `data` come first, in its order, then those of
 * `removes`. The items of a flow, the acts at a store and on a data record that their pages show,
 * and today's words under a change all ask this one function.
 */
export function actsOf(step: Step, way: AtStore['way']): [string, ActDoes][] {
  const kept = way === undefined ? [] : step.data.map((id): [string, ActDoes] => [id, way === 'write' ? 'put' : 'read']);
  return [...kept, ...step.removes.map((id): [string, ActDoes] => [id, 'take'])];
}

/** Builds the model once from the entries. */
export function buildModel(entries: readonly Entry[]): Model {
  const claimed = new Map<string, Entry[]>();
  for (const entry of entries) {
    const same = claimed.get(entry.id);
    if (same) same.push(entry);
    else claimed.set(entry.id, [entry]);
  }
  const claims = (id: string): readonly Entry[] => claimed.get(id) ?? [];
  const record = (id: string): Entry | undefined => (claims(id).length === 1 ? claims(id)[0] : undefined);
  const parentOf = (id: string): string | undefined => {
    const entry = record(id);
    return entry?.ok ? textOf(entry, 'in') : undefined;
  };
  return {
    entries,
    claims,
    record,
    kindOf: (id) => record(id)?.kind,
    chain(id) {
      const found: string[] = [];
      for (let up = parentOf(id); up !== undefined && !found.includes(up) && up !== id; up = parentOf(up)) found.push(up);
      return found;
    },
    inside: (id) => entries.filter((entry) => entry.ok && textOf(entry, 'in') === id).map((entry) => entry.id),
    touching: (id) => entries.filter((entry) => entry.ok && entry.kind === 'connections' && (textOf(entry, 'from') === id || textOf(entry, 'to') === id)),
  };
}
