import type { Laid, ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';
import type { Touch } from './catalogue.ts';

/**
 * What the pages of the changes ask of the records of `changes/` and of what the check laid,
 * worked out once: the changes by name; one change by its id, with its input and what it
 * touches; the model as it would be with it; the sections of its Records page; one record of it;
 * and before and after of the keys it writes. A change is no record of the architecture: its id
 * may be the id of another record, so a change is looked for in `changes/` alone. Nothing is
 * merged here: a record as it would be is the one the check read.
 */

/** What a change does to a record, by the key it stands under. */
export type Verb = 'add' | 'update' | 'remove';

/** A record a change names: its path, `folder/id`; what the change does to it; and for an update the keys it writes, in the file's order. */
export type Touched = { path: string; folder: string; id: string; verb: Verb; keys: string[] };

/**
 * One change as its pages show it: its id; its name, or its id when it has no name of text; what
 * was asked for, when it is text; what the person answered when asked, line by line; the records
 * it names, in the file's order; and whether the check could lay it over the model.
 */
export type Change = { id: string; name: string; prompt?: string; given: string[]; touched: Touched[]; laid: boolean };

/** The model as it would be with a change: its records, and what the change touches, for a catalogue made of them. */
export type World = { records: ModelRecord[]; touch: Touch };

/** A row of the Records page: what the change does to a record, the record to show, and the name it stands under. */
export type ChangeRow = { touched: Touched; record?: ModelRecord; label: string };

/** A section of the Records page: one of the page's own lists, with the records of it that the change names, by name. */
export type ChangeSection = { title: string; rows: ChangeRow[] };

/** One record of a change: what the change does to it, the record as it is today and as it would be. */
export type ChangeRecord = { touched: Touched; today?: ModelRecord; after?: ModelRecord };

/** A key that an update writes: what it says today and what it will say. A side with nothing has no value. */
export type Difference = { key: string; before?: unknown; after?: unknown };

/** What the pages ask of the changes. */
export type Changes = {
  /** Every change, by name; one with no name after those with one, then by id. */
  all: Change[];
  /** The change with an id; nothing when there is none. */
  change: (id: string) => Change | undefined;
  /** The model as it would be with a change. Nothing when there is no such change, or the check could not lay it. */
  world: (id: string) => World | undefined;
  /** What a change touches, for a catalogue of the model of today under that change. */
  touch: (id: string) => Touch | undefined;
  /** The sections of the Records page of a change, in the order of the page's lists. */
  sections: (id: string) => ChangeSection[];
  /** One record of a change by its path; nothing when the change does not name it. */
  record: (id: string, path: string) => ChangeRecord | undefined;
  /** Before and after of each key an update writes, in the file's order; none for any other record. */
  differences: (id: string, path: string) => Difference[];
};

/** The page's own lists, in its order, and the folders each holds. */
const LISTS: readonly { title: string; folders: readonly string[] }[] = [
  { title: 'Context', folders: ['context'] },
  { title: 'Features', folders: ['features'] },
  { title: 'Flows', folders: ['flows'] },
  { title: 'Software', folders: ['systems', 'apps', 'stores', 'components', 'infrastructure'] },
  { title: 'Actors', folders: ['people'] },
  { title: 'Connections', folders: ['connections'] },
  { title: 'Technologies', folders: ['technologies'] },
  { title: 'Owners', folders: ['owners'] },
  { title: 'Data', folders: ['data'] },
  { title: 'Rules', folders: ['rules'] },
];

const collator = new Intl.Collator('en', { sensitivity: 'accent', numeric: true });

/** A text with something in it, or nothing. */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A path as a change writes it, `folder/id`, in its two parts; nothing for what is no path. */
function parts(path: unknown): { folder: string; id: string } | undefined {
  if (typeof path !== 'string') return undefined;
  const at = path.indexOf('/');
  return at > 0 && at < path.length - 1 ? { folder: path.slice(0, at), id: path.slice(at + 1) } : undefined;
}

/** The records a change names, in the order of its file: what it adds, what it updates, what it removes. */
function touchedOf(fields: Record<string, unknown>): Touched[] {
  const all: Touched[] = [];
  const named = (verb: Verb, path: unknown, keys: string[]): void => {
    const split = parts(path);
    if (split !== undefined) all.push({ path: path as string, ...split, verb, keys });
  };
  if (isMapping(fields.add)) for (const path of Object.keys(fields.add)) named('add', path, []);
  if (isMapping(fields.update)) for (const [path, keys] of Object.entries(fields.update)) named('update', path, isMapping(keys) ? Object.keys(keys) : []);
  if (Array.isArray(fields.remove)) for (const path of fields.remove) named('remove', path, []);
  return all;
}

/** The name a record stands under in a list: its name, a line of context by its sentence, a connection with none as the lists say it, else its id. */
function labelOf(record: ModelRecord | undefined, touched: Touched): string {
  const fields = record?.fields ?? {};
  return text(fields.name) ?? text(fields.must) ?? text(fields.prefer) ?? (touched.folder === 'connections' ? 'No name' : touched.id);
}

/** What the pages ask of the changes, worked out once from the records and from what the check laid, both of `/api/model`. */
export function changesOf(records: readonly ModelRecord[], laid: readonly Laid[] = []): Changes {
  // An id names the first change that has it, as in the catalogue.
  const first = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind === 'changes' && !first.has(record.id)) first.set(record.id, record);
  const read = new Map(laid.map((each) => [each.change, each.records]));
  const all = [...first.values()].sort(byName).map((record): Change => {
    const prompt = text(record.fields.prompt);
    // A line that is no text is a fault the check tells; the page leaves it out.
    const given = Array.isArray(record.fields.given) ? record.fields.given.flatMap((line) => text(line) ?? []) : [];
    return { id: record.id, name: text(record.fields.name) ?? record.id, ...(prompt !== undefined ? { prompt } : {}), given, touched: touchedOf(record.fields), laid: read.has(record.id) };
  });
  const byId = new Map(all.map((change) => [change.id, change]));

  // The records of today by their paths; a change is none of them.
  const today = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind !== 'changes' && !today.has(`${record.kind}/${record.id}`)) today.set(`${record.kind}/${record.id}`, record);
  const after = (id: string): Map<string, ModelRecord> => new Map((read.get(id) ?? []).map((record) => [`${record.kind}/${record.id}`, record]));

  const touch = (id: string): Touch | undefined => {
    const change = byId.get(id);
    return change === undefined ? undefined : { change: id, paths: new Set(change.touched.map((each) => each.path)) };
  };
  const worlds = new Map<string, World | undefined>();
  const world = (id: string): World | undefined => {
    if (worlds.has(id)) return worlds.get(id);
    const touched = touch(id);
    const made = touched === undefined || !read.has(id) ? undefined : { records: [...[...today.entries()].filter(([path]) => !touched.paths.has(path)).map(([, record]) => record), ...(read.get(id) ?? [])], touch: touched };
    worlds.set(id, made);
    return made;
  };
  const record = (id: string, path: string): ChangeRecord | undefined => {
    const touched = byId.get(id)?.touched.find((each) => each.path === path);
    if (touched === undefined) return undefined;
    const was = today.get(path);
    const will = touched.verb === 'remove' ? undefined : after(id).get(path);
    return { touched, ...(was !== undefined ? { today: was } : {}), ...(will !== undefined ? { after: will } : {}) };
  };
  // The record a row shows: as it would be, or, for one that goes, as it is. A change the check
  // could not lay shows what its file holds for a record it adds, and today's for one it updates.
  const shown = (id: string, touched: Touched): ModelRecord | undefined => {
    const found = record(id, touched.path);
    if (touched.verb === 'remove') return found?.today;
    if (found?.after !== undefined) return found.after;
    if (touched.verb === 'update') return found?.today;
    const written = first.get(id)?.fields.add;
    const fields = isMapping(written) ? written[touched.path] : undefined;
    return isMapping(fields) ? { kind: touched.folder, id: touched.id, file: `${touched.path}.yaml`, fields } : undefined;
  };
  return {
    all,
    change: (id) => byId.get(id),
    world,
    touch,
    sections: (id) => {
      const rows = (byId.get(id)?.touched ?? []).map((touched): ChangeRow => {
        const row = shown(id, touched);
        return { touched, ...(row !== undefined ? { record: row } : {}), label: labelOf(row, touched) };
      });
      return LISTS.map((list) => ({
        title: list.title,
        rows: rows.filter((row) => list.folders.includes(row.touched.folder)).sort((a, b) => collator.compare(a.label, b.label) || (a.touched.id < b.touched.id ? -1 : a.touched.id > b.touched.id ? 1 : 0)),
      })).filter((section) => section.rows.length > 0);
    },
    record,
    differences: (id, path) => {
      const found = record(id, path);
      if (found === undefined || found.touched.verb !== 'update' || found.after === undefined) return [];
      const was = found.today?.fields ?? {};
      const will = found.after.fields;
      return found.touched.keys.map((key) => ({ key, ...(key in was ? { before: was[key] } : {}), ...(key in will ? { after: will[key] } : {}) }));
    },
  };
}
