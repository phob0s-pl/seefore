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
