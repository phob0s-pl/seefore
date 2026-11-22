import { CURRENT_FORMAT, referenceField } from './format.ts';
import type { Format } from './format.ts';
import type { Loaded, RecordFile, RecordText, Reference, SourceRecord } from './load.ts';
import { ownership } from './model.ts';
import type { Problem } from './problem.ts';
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

/** A record that names the thing asked about, so that it must go or change if the thing goes. */
export interface Change {
  record: UsedRecord;
  /** Each place in it that names the thing or something inside it. */
  places: Reference[];
}

/** A record that a removal would leave behind, and what that assumes. */
export interface Left {
  record: UsedRecord;
  /**
   * `no-connection`: it is an end of a connection now, itself or through something inside it,
   * and would then be an end of none, nor would a connection pass through it or through anything
   * inside it. `no-user`: it is an owner or a technology, or a piece of infrastructure that is
   * the end of no connection, and no record would then name it.
   */
  reason: 'no-connection' | 'no-user';
  /**
   * What goes for this to be so. `connections-go`: the thing, and each connection with an end
   * in it. `left-go`: those, each record they leave with no connection, with all inside it, and
   * each piece of infrastructure they leave named by nothing.
   */
  assumes: 'connections-go' | 'left-go';
}

/** A record's name or description that holds a name or an id of the thing asked about. */
export interface Mention {
  /** The file of the record whose text it is. */
  file: string;
  /** Where the key of the text is written. */
  line: number;
  column: number;
  /** The id of the record whose text it is. */
  record: string;
  /** `name` or `description`. */
  field: string;
  /** The id of the thing, or of the record inside it, whose name or id the text holds. */
  names: string;
  /** The words found, as the text writes them, each once, in the order they come. */
  words: string[];
  /**
   * True when the record whose text it is goes with the thing. A removal takes such text with
   * it; a rename leaves it, still speaking of the old name.
   */
  goes: boolean;
}

/**
 * What removing a record would mean. "The thing" is the record and all that is inside it.
 * What is left behind and what may speak of it are suggestions for a person to weigh.
 */
export interface Removal extends Uses {
  /** What goes with it: everything inside it, then each connection with both ends in the thing. */
  goes: UsedRecord[];
  /**
   * Each record that stays and names the thing, with each place, in order of file: a connection
   * with one end in it, one that names it or something inside it in `via`, or what names an
   * owner or a technology.
   */
  changes: Change[];
  /**
   * What the removal would leave behind, those that assume the least first. Empty when the
   * directory was not read in full, since what is not found may then be there.
   */
  left: Left[];
  /** For an owner: how many parts take it from what they are in, and so hold no `owner` to change. */
  inherited: number;
  /**
   * Each name and description of another record that holds a name or an id of the thing, in
   * order of file and place. A record that stays is read for the names and ids of the record
   * asked about and of all inside it. A record that goes with it is read only for the name and
   * the id of the record asked about, since a rename leaves it.
   */
  mentions: Mention[];
  /** False when the directory has an error or a file that was not read: other uses may exist. */
  complete: boolean;
}

/** What `removalOf` needs besides the directory and the id. */
export interface RemovalOptions {
  /**
   * More problems of the directory, such as a folder that could not be read. They can only
   * make the answer less sure: the problems the core library found itself still count.
   */
  problems?: readonly Problem[];
  format?: Format;
}

/** The folder of the records that join two others. */
const CONNECTIONS = 'connections';

/** The families whose records a connection may join. */
const ELEMENTS = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

/** The family of the things whose work is to pass exchanges on, which connections name in `via`. */
const INFRASTRUCTURE = 'infrastructure';

/** The families whose records are named for what they are, and never joined: owners and technologies. */
const NAMED_ONLY = ['owners', 'technologies'];

/** Problems that leave a file unread without an error: YAML that seefore does not read, and a link it does not follow. */
const UNREAD = ['not-read', 'link-not-followed'];

/** Letters, marks, digits and `_`: what a whole word does not start or end beside. */
const WORD = '[\\p{L}\\p{M}\\p{N}_]';

/**
 * Every record with this id, whether its file could be read or not, in order of file. There is
 * one, unless the id names no record or, which is an error of its own, more than one.
 */
export function recordsWithId(loaded: Loaded, id: string): RecordFile[] {
  return [...loaded.records, ...loaded.unread].filter((record) => record.id === id).sort((a, b) => (a.file < b.file ? -1 : 1));
}

/**
 * What removing the record with this id would break, or nothing unless exactly one record has
 * the id: `recordsWithId` tells none from several. A record whose file cannot be read can still
 * be asked about; what it names is not known.
 */
export function usesOf(loaded: Loaded, id: string, format: Format = CURRENT_FORMAT): Uses | undefined {
  const named = recordsWithId(loaded, id);
  // Which of two records with one id another record means cannot be told, so neither is answered for.
  if (named.length !== 1) return undefined;
  const asked = named[0] as RecordFile;

  const files = [...loaded.records, ...loaded.unread];
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

/**
 * What removing the record with this id would mean, or nothing unless exactly one record has
 * the id: what goes with it, what must go or change, what would be left behind, and which
 * records may speak of it in their text. What is left behind is said only when the directory
 * was read in full.
 */
export function removalOf(loaded: Loaded, id: string, options: RemovalOptions = {}): Removal | undefined {
  const format = options.format ?? CURRENT_FORMAT;
  const uses = usesOf(loaded, id, format);
  if (!uses) return undefined;
  // What the core library found counts whatever the caller passes, so a caller can only make the answer less sure.
  const complete = readInFull(loaded.problems) && readInFull(options.problems ?? []);

  const files = [...loaded.records, ...loaded.unread];
  const byFile = new Map(files.map((record) => [record.file, record]));
  const parents = parentsOf(format, byId(files), loaded.references);
  const ends = connectionEnds(loaded.references);
  const thing = new Set([id, ...uses.inside.map((record) => record.id)]);
  // An end is in the thing only where it names a record of the thing that a connection may end at.
  const families = new Map([uses.record, ...uses.inside].map((record) => [record.id, record.family]));
  const endIn = (field: 'from' | 'to', end: string | undefined): boolean =>
    end !== undefined && (referenceField(format, CONNECTIONS, field)?.families.includes(families.get(end) ?? '') ?? false);
  const bothIn = (end: Ends): boolean => endIn('from', end.from) && endIn('to', end.to);
  const oneIn = (end: Ends): boolean => endIn('from', end.from) || endIn('to', end.to);

  // A connection with both ends in the thing goes with it, once, even from a record to itself.
  const within = [...ends].filter(([, end]) => bothIn(end)).map(([file]) => byFile.get(file) as RecordFile);
  const goes = [...uses.inside, ...within.map((file) => described(loaded.records, file))];
  const gone = new Set([uses.record.file, ...goes.map((record) => record.file)]);
  // Each connection with an end in the thing is taken to go, and so is the connection asked about.
  const cut = new Set([...ends].filter(([file, end]) => file === uses.record.file || oneIn(end)).map(([file]) => file));

  return {
    ...uses,
    goes,
    changes: changesOf(loaded.records, byFile, uses.references, gone),
    left: complete ? leftBehind(loaded, format, parents, ends, { thing, gone, cut }) : [],
    inherited: uses.record.family === 'owners' ? inheritedFrom(loaded, id) : 0,
    mentions: mentionsOf(loaded.texts, uses.record, uses.inside, gone),
    complete,
  };
}

/**
 * True when every file of the directory was read and none has an error. Only then is a use
 * that was not found not there: a file not read may hold a record that names the thing.
 */
export function readInFull(problems: readonly Problem[]): boolean {
  return problems.every((problem) => problem.severity !== 'error' && !UNREAD.includes(problem.code));
}

/**
 * What a record's text is searched for: its name, and its id with spaces for its hyphens. A
 * name that is its id in other words is searched for once. Words are found in any case, but a
 * short name is found only as it is written, capitals and all, and a short id not at all,
 * since either would be found everywhere: see `isShort`.
 */
export function wordsFor(record: { id: string; name?: string }): string[] {
  return termsOf(record).map((term) => term.shown);
}

/**
 * True for words of one or two characters. A name that short is looked for only as it is
 * written, so that the technology "Go" is found in "a driver for Go" and not in "must go". An
 * id that short is not looked for.
 */
export function isShort(words: string): boolean {
  return [...words].length < 3;
}

/** The two ends of a connection, as far as they are written as ids. */
interface Ends {
  from?: string;
  to?: string;
}

/** What a removal takes away. */
interface Taken {
  /** The ids of the record asked about and of all inside it. */
  thing: ReadonlySet<string>;
  /** The files of the thing and of each connection with both ends in it. */
  gone: ReadonlySet<string>;
  /** The files of the connections taken to go: each with an end in the thing, or the one asked about. */
  cut: ReadonlySet<string>;
}

/** A word or words to look for in text: as a person reads them, and as a pattern. */
interface Term {
  shown: string;
  pattern: RegExp;
}

/** The ends of each connection, by its file. */
function connectionEnds(references: readonly Reference[]): Map<string, Ends> {
  const ends = new Map<string, Ends>();
  for (const reference of references) {
    if (!reference.file.startsWith(CONNECTIONS + '/')) continue;
    const end = ends.get(reference.file) ?? {};
    if (reference.field === 'from') end.from = reference.names;
    else if (reference.field === 'to') end.to = reference.names;
    else continue;
    ends.set(reference.file, end);
  }
  return ends;
}

/** Each record outside what goes that names the thing, with each place it does, in order of file. */
function changesOf(records: readonly SourceRecord[], byFile: ReadonlyMap<string, RecordFile>, references: readonly Reference[], gone: ReadonlySet<string>): Change[] {
  const changes: Change[] = [];
  // The references are in order of file, so those of one record come together.
  for (const reference of references) {
    if (gone.has(reference.file)) continue;
    const last = changes.at(-1);
    if (last?.record.file === reference.file) last.places.push(reference);
    else changes.push({ record: described(records, byFile.get(reference.file) as RecordFile), places: [reference] });
  }
  return changes;
}

/**
 * What a removal leaves behind. First each element that is an end of a connection now, itself
 * or through anything inside it, and would be an end of none once the connections taken go,
 * unless a connection that stays passes through it or through anything inside it. Then each
 * owner and technology that only what goes names, and each piece of infrastructure that is the
 * end of no connection and that only connections which go name in `via`. Last, apart, each
 * owner and technology that would lose its last user only if those left behind before it went
 * too: the elements left with no connection, with all inside them, and the pieces of
 * infrastructure that nothing would name. Each part is in the order of a listing.
 */
function leftBehind(loaded: Loaded, format: Format, parents: ReadonlyMap<string, string>, ends: ReadonlyMap<string, Ends>, taken: Taken): Left[] {
  const files = [...loaded.records, ...loaded.unread];
  const order = format.families.map((family) => family.folder);
  const listed = (a: RecordFile, b: RecordFile): number => order.indexOf(a.family) - order.indexOf(b.family) || (a.id < b.id ? -1 : 1);

  const first = new Set([...taken.gone, ...taken.cut]);
  const users = usersOf(loaded.references);
  const unused = (gone: ReadonlySet<string>) => (record: RecordFile): boolean => {
    const by = users.get(record.id) ?? [];
    return by.length > 0 && by.every((file) => gone.has(file));
  };

  const before = withAbove([...ends.values()].flatMap((end) => [end.from, end.to]), parents);
  // What a connection that stays passes through still has its use, and so does what that is in,
  // as for an end. A place in `via` that names the thing does not count: it must change.
  const staying = [...ends].filter(([file]) => !taken.cut.has(file));
  const routes = loaded.references.filter(
    (reference) =>
      reference.field === 'via' && reference.file.startsWith(CONNECTIONS + '/') && !taken.cut.has(reference.file) && !taken.thing.has(reference.names),
  );
  const after = withAbove([...staying.flatMap(([, end]) => [end.from, end.to]), ...routes.map((reference) => reference.names)], parents);
  const unconnected = files
    .filter((record) => ELEMENTS.includes(record.family) && !taken.thing.has(record.id) && before.has(record.id) && !after.has(record.id))
    .sort(listed);

  // A piece of infrastructure that is the end of no connection is named only in `via`, as an owner is only in `owner`.
  const namedOnly = (record: RecordFile): boolean => NAMED_ONLY.includes(record.family) || (record.family === INFRASTRUCTURE && !before.has(record.id));
  const named = files.filter((record) => namedOnly(record) && !taken.thing.has(record.id)).sort(listed);
  const unusedFirst = named.filter(unused(first));
  // A piece of infrastructure that nothing would name names an owner and technologies, as a store does.
  const pieces = unusedFirst.filter((record) => record.family === INFRASTRUCTURE);
  const then = new Set([...first, ...withInside(unconnected, files, parents), ...pieces.map((record) => record.file)]);
  const unusedThen = unconnected.length + pieces.length === 0 ? [] : named.filter((record) => !unusedFirst.includes(record) && unused(then)(record));

  const left = (records: readonly RecordFile[], reason: Left['reason'], assumes: Left['assumes']): Left[] =>
    records.map((record) => ({ record: described(loaded.records, record), reason, assumes }));
  return [...left(unconnected, 'no-connection', 'connections-go'), ...left(unusedFirst, 'no-user', 'connections-go'), ...left(unusedThen, 'no-user', 'left-go')];
}

/** These records, and everything each is in, to the top. */
function withAbove(ids: Iterable<string | undefined>, parents: ReadonlyMap<string, string>): Set<string> {
  const found = new Set<string>();
  for (const start of ids) {
    // Once a record is found, so is everything it is in.
    for (let id = start; id !== undefined && !found.has(id); id = parents.get(id)) found.add(id);
  }
  return found;
}

/** The files of these records and of everything inside them. */
function withInside(records: readonly RecordFile[], files: readonly RecordFile[], parents: ReadonlyMap<string, string>): string[] {
  const ids = new Set(records.map((record) => record.id));
  const within = (id: string): boolean => {
    for (let at: string | undefined = id; at !== undefined; at = parents.get(at)) if (ids.has(at)) return true;
    return false;
  };
  return files.filter((file) => within(file.id)).map((file) => file.file);
}

/** The files of the records that name each id, by the id. */
function usersOf(references: readonly Reference[]): Map<string, string[]> {
  const users = new Map<string, string[]>();
  for (const reference of references) {
    const known = users.get(reference.names);
    if (!known) users.set(reference.names, [reference.file]);
    else if (!known.includes(reference.file)) known.push(reference.file);
  }
  return users;
}

/** How many parts have this owner from what they are in, not from an `owner` of their own. */
function inheritedFrom(loaded: Loaded, owner: string): number {
  return [...ownership(loaded.model)].filter(([part, found]) => found.owner === owner && found.from !== part).length;
}

/**
 * Each name and description of another record that holds, as whole words, the name or the id
 * of the thing or of anything inside it. The text of a record that goes with the thing is read
 * only for the record asked about: a removal takes it, but a rename leaves it. One for each text
 * and each of those it may speak of, in order of file and place.
 */
function mentionsOf(texts: readonly RecordText[], asked: UsedRecord, inside: readonly UsedRecord[], gone: ReadonlySet<string>): Mention[] {
  const searched = [asked, ...inside].map((target) => ({ id: target.id, terms: termsOf(target) })).filter((target) => target.terms.length > 0);
  const mentions: Mention[] = [];
  for (const text of texts) {
    if (text.file === asked.file) continue;
    const goes = gone.has(text.file);
    for (const target of searched) {
      if (goes && target.id !== asked.id) continue;
      const found = outermost(target.terms.flatMap((term) => [...text.text.matchAll(term.pattern)]));
      if (found.length === 0) continue;
      mentions.push({ file: text.file, line: text.line, column: text.column, record: text.record, field: text.field, names: target.id, words: once(found), goes });
    }
  }
  return mentions;
}

/**
 * The words found, in the order they come, leaving out those within words found already, as a
 * name such as "Pool" is within "relay pool server".
 */
function outermost(matches: readonly RegExpExecArray[]): string[] {
  const words: string[] = [];
  let end = 0;
  for (const match of [...matches].sort((a, b) => a.index - b.index || b[0].length - a[0].length)) {
    if (match.index < end) continue;
    words.push(match[0]);
    end = match.index + match[0].length;
  }
  return words;
}

/**
 * Words found, each once, as first written: words that differ only in case or in the spaces
 * between them are the same. Words that run over two lines are shown on one.
 */
function once(found: readonly string[]): string[] {
  const words = new Map<string, string>();
  for (const word of found) {
    const shown = word.replace(/\s+/g, ' ');
    if (!words.has(shown.toLowerCase())) words.set(shown.toLowerCase(), shown);
  }
  return [...words.values()];
}

/** The terms `wordsFor` describes, each with its pattern. */
function termsOf(record: { id: string; name?: string }): Term[] {
  const id = record.id.split('-');
  const name = record.name?.trim().split(/\s+/).filter((word) => word !== '') ?? [];
  const terms: Term[] = [];
  const named = name.join(' ');
  const body = name.map(escaped).join('\\s+');
  if (name.length > 0 && isShort(named)) terms.push(term(named, body, 'as written'));
  else if (name.length > 0 && same(named) !== same(id.join(' '))) terms.push(term(named, body, 'any case'));
  // The id with a hyphen or a space, or a line break, between its words.
  if (!isShort(id.join(' '))) terms.push(term(id.join(' '), id.map(escaped).join('[-\\s]+'), 'any case'));
  return terms;
}

function term(shown: string, body: string, found: 'any case' | 'as written'): Term {
  return { shown, pattern: new RegExp(`(?<!${WORD})(?:${body})(?!${WORD})`, found === 'any case' ? 'giu' : 'gu') };
}

/** Words as a search in any case sees them, with a hyphen read as a space. */
function same(words: string): string {
  return words.toLowerCase().replace(/[-\s]+/g, ' ');
}

/** A word with each character that a pattern gives a meaning to taken literally. */
function escaped(word: string): string {
  return word.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
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
