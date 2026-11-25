import type { ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';

/**
 * What the pages of the changes ask of the records of `changes/`, worked out once: the changes by
 * name, and one change by its id. A change is no record of the architecture: its id may be the
 * id of another record, so only the records of `changes/` are read here.
 */

/** One change as its pages show it: its id, and its name, or its id when it has no name of text. */
export type Change = { id: string; name: string };

/** What the pages ask of the changes. */
export type Changes = {
  /** Every change, by name; one with no name after those with one, then by id. */
  all: Change[];
  /** The change with an id; nothing when there is none. */
  change: (id: string) => Change | undefined;
};

/** A text with something in it, or nothing. */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** What the pages ask of the changes, worked out once from the records of `/api/model`. */
export function changesOf(records: readonly ModelRecord[]): Changes {
  // An id names the first change that has it, as in the catalogue.
  const first = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind === 'changes' && !first.has(record.id)) first.set(record.id, record);
  const all = [...first.values()].sort(byName).map((record) => ({ id: record.id, name: text(record.fields.name) ?? record.id }));
  const byId = new Map(all.map((change) => [change.id, change]));
  return { all, change: (id) => byId.get(id) };
}
