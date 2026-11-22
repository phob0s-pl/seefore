import type { Model } from './model.ts';

/**
 * What a record has from the records around it: the conditions it is under, the app that keeps
 * a store, and the system a thing is in. The rules, the listing and the views each ask this of
 * the model, so it is worked out once, here. Each reads the model alone: a record with an error
 * in its file is not in it, so nothing is known of what that record is in or of its condition.
 */

/** A condition a record is under: the words of an `only`, and the record whose `only` they are. */
export interface Condition {
  /** The words that read after "only". */
  only: string;
  /** The id of the record whose `only` it is: the record asked about, or one it has the condition from. */
  from: string;
}

/**
 * The conditions a record is under, each with the record it comes from: its own `only` first,
 * then those it has from others. A part, anything with `in`, has those of every thing it is in,
 * nearest first. A connection has those of its two ends and of every thing an end is in, its
 * `from` and what that is in before its `to`. Nothing comes from `via`: a connection does not
 * take the condition of what it passes through. A record that two ends share is named once,
 * where it comes first. Nothing for an id the model has no record of.
 */
export function conditionsOf(model: Model, id: string): Condition[] {
  const lookup = lookUp(model);
  const entry = lookup.get(id);
  if (entry === undefined) return [];
  const ends = entry.family === 'connections' ? [entry.record.from, entry.record.to] : [];
  const sources = [id, ...aboveOf(lookup, id), ...ends.flatMap((end) => (end === undefined ? [] : [end, ...aboveOf(lookup, end)]))];
  const named = new Set<string>();
  const found: Condition[] = [];
  for (const source of sources) {
    if (named.has(source)) continue;
    named.add(source);
    const only = lookup.get(source)?.record.only;
    if (only !== undefined) found.push({ only, from: source });
  }
  return found;
}

/**
 * The id of the app that keeps a store: the app its `in` names. Nothing for a store in a system,
 * for a record that is no store, and for a store whose `in` names a record with an error in its
 * file, since the model cannot tell whether that is an app.
 */
export function keeperOf(model: Model, id: string): string | undefined {
  const lookup = lookUp(model);
  const entry = lookup.get(id);
  if (entry?.family !== 'stores' || entry.record.in === undefined) return undefined;
  return lookup.get(entry.record.in)?.family === 'apps' ? entry.record.in : undefined;
}

/**
 * The id of the system a thing is in, through an app or a component where need be: a store that
 * an app keeps is in that app's system. A system is its own. Nothing for a thing in no system,
 * such as a person, a connection, or a piece of infrastructure that names none, and nothing when
 * the way up passes a record with an error in its file, since what that is in is not known.
 */
export function systemOf(model: Model, id: string): string | undefined {
  const lookup = lookUp(model);
  if (!lookup.has(id)) return undefined;
  return [id, ...aboveOf(lookup, id)].find((at) => lookup.get(at)?.family === 'systems');
}

/** The families whose records may have a condition, be in something, or be an end. */
type Family = 'people' | 'systems' | 'apps' | 'stores' | 'components' | 'infrastructure' | 'connections';

/** A record as these helpers read it: what it is in, its condition, and for a connection its ends. */
interface Entry {
  family: Family;
  record: { in?: string | undefined; only?: string | undefined; from?: string; to?: string };
}

/** The records of a model by id, with the number of records it was made from. */
interface Lookup {
  size: number;
  entries: Map<string, Entry>;
}

const FAMILIES: readonly Family[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure', 'connections'];

/**
 * Each model looked up so far. The rules, the listing and the views ask of every record in turn,
 * so a model is looked up once, the first time it is asked of. Each entry holds the record itself,
 * so what is read of it is always what it says now; a model that gains or loses a record is
 * looked up again.
 */
const LOOKUPS = new WeakMap<Model, Lookup>();

/** The model's records by id. An id names one record in a model, since one used twice is an error. */
function lookUp(model: Model): Map<string, Entry> {
  const size = FAMILIES.reduce((sum, family) => sum + model[family].length, 0);
  const known = LOOKUPS.get(model);
  if (known?.size === size) return known.entries;
  const entries = new Map<string, Entry>();
  for (const family of FAMILIES) for (const record of model[family]) entries.set(record.id, { family, record });
  LOOKUPS.set(model, { size, entries });
  return entries;
}

/**
 * What a record is in, and what that is in, nearest first, as far as the model has each. It
 * stops at a record the model does not have, which has an error in its file and is named but not
 * known. Nothing can be in itself in a sound model; the guard keeps a model built by hand from
 * going round for ever.
 */
function aboveOf(lookup: ReadonlyMap<string, Entry>, id: string): string[] {
  const chain: string[] = [];
  for (let at = lookup.get(id)?.record.in; at !== undefined && at !== id && !chain.includes(at) && lookup.has(at); at = lookup.get(at)?.record.in) {
    chain.push(at);
  }
  return chain;
}
