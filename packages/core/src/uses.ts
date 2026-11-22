import { CURRENT_FORMAT } from './format.ts';
import type { Format } from './format.ts';
import type { Loaded, RecordFile, Reference, SourceRecord } from './load.ts';
import { byId, parentsOf } from './rules.ts';

/** A record as `usesOf` gives it back. */
export interface UsedRecord extends RecordFile {
  /** Its name, when its file could be read and has one. */
  name?: string;
  /** What it is in, when its file could be read and says. */
  in?: string;
}

/** What removing a record would break. */
export interface Uses {
  /** The record asked about. */
  record: UsedRecord;
  /**
   * Everything inside it, to the bottom: for a system its apps and stores and the components
   * of each app, for an app its components. A thing comes before what is inside it.
   */
  inside: UsedRecord[];
  /**
   * Every place where a record names it or something inside it, in order of file and place.
   * That a thing inside it is in it is not one of them: that goes with it.
   */
  references: Reference[];
}

/**
 * What removing the record with this id would break, or nothing when no record has the id.
 * A record whose file cannot be read can still be asked about; what it names is not known.
 * When an id names more than one record, which is an error of its own, the first in order of
 * file is the one shown.
 */
export function usesOf(loaded: Loaded, id: string, format: Format = CURRENT_FORMAT): Uses | undefined {
  const files = [...loaded.records, ...loaded.unread].sort((a, b) => (a.file < b.file ? -1 : 1));
  const asked = files.find((record) => record.id === id);
  if (!asked) return undefined;

  const records = byId(files);
  const parents = parentsOf(format, records, loaded.references);
  const children = new Map<string, string[]>();
  for (const [child, parent] of parents) {
    const known = children.get(parent);
    if (known) known.push(child);
    else children.set(parent, [child]);
  }

  // Outside in, as a listing shows it: apps before stores, then each in order of id.
  const order = format.families.map((family) => family.folder);
  const rank = (child: string): number => order.indexOf((records.get(child)?.[0] as RecordFile).family);
  const inside: UsedRecord[] = [];
  const seen = new Set([id]);
  const walk = (parent: string): void => {
    const below = (children.get(parent) ?? []).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
    for (const child of below) {
      if (seen.has(child)) continue;
      seen.add(child);
      inside.push(described(loaded.records, records.get(child)?.[0] as RecordFile));
      walk(child);
    }
  };
  walk(id);

  const references = loaded.references.filter(
    (reference) => seen.has(reference.names) && !(reference.field === 'in' && seen.has(reference.record) && parents.get(reference.record) === reference.names),
  );
  return { record: described(loaded.records, asked), inside, references };
}

/** A record with its name and what it is in, when its file says. */
function described(records: readonly SourceRecord[], file: RecordFile): UsedRecord {
  const read = records.find((record) => record.file === file.file)?.value;
  const name = read?.['name'];
  const inside = read?.['in'];
  return {
    id: file.id,
    family: file.family,
    file: file.file,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof inside === 'string' ? { in: inside } : {}),
  };
}
