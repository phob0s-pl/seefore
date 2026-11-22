import { conditionsOf, firstSentence, keeperOf, outlineOf, ownership, systemOf } from '@seefore/core';
import type {
  App,
  Component,
  Condition,
  Connection,
  Infrastructure,
  Model,
  ModelRecord,
  OutlineApp,
  OutlineGroup,
  Owner,
  Ownership,
  Person,
  Store,
  System,
  Technology,
} from '@seefore/core';
import { EXIT_OK, openSource } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { count, problemsInBrief } from './words.ts';
import type { Here } from './words.ts';

/** The widest a line of the listing may be, in columns. A narrower terminal makes it narrower. */
export const LINE_WIDTH = 96;

/** How much deeper than its own line a wrapped line goes on, and a whole description sits under `--full`. */
const DEEPER = '    ';

/** What `seefore list` takes: those of every command, and whether to show descriptions whole. */
export interface ListOptions extends CheckOptions {
  /** Show each description whole, beneath its record, and not only its first sentence. */
  full: boolean;
}

/** What `seefore list --json` prints: what the marker says, the counts, the model, one list for each family, and who answers for each part. */
export interface ListResult extends Model {
  /** The source directory, as a full path with every link followed. */
  directory: string;
  /** The name in the marker file, or null when the marker could not be read. */
  name: string | null;
  /** The format in the marker file, or null when the marker could not be read. */
  format: number | null;
  /** How many records were read, counted as `seefore check` counts them. */
  records: number;
  errors: number;
  warnings: number;
  /**
   * Who answers for each system, app, store, component and piece of infrastructure that has an
   * owner, by its id: the owner, and the record whose `owner` names it. A part with no owner,
   * here or above, is not in it.
   */
  ownership: Record<string, Ownership>;
  /**
   * The conditions each record has from others, by its id: the words of each, and the record
   * whose `only` they are, nearest first. A part has those of what it is in, and a connection
   * those of its ends and of what they are in. A record's own is its `only`, and is not here; a
   * record that has none from others is not in it.
   */
  conditions: Record<string, Condition[]>;
}

/**
 * Lists the model of the source directory: the records whose own file has no error. It shows
 * no problems, only how many there are, and always exits with 0 once it has started.
 */
export function list(options: ListOptions, io: Io): number {
  const opened = openSource(options, io, { verb: 'list', command: 'list' });
  if (typeof opened === 'number') return opened;
  const { directory, loaded, errors, warnings } = opened;

  const result: ListResult = {
    directory,
    name: loaded.marker?.name ?? null,
    format: loaded.marker?.format ?? null,
    records: loaded.records.length,
    errors,
    warnings,
    ...loaded.model,
    ownership: Object.fromEntries(ownership(loaded.model)),
    conditions: inheritedConditions(loaded.model),
  };
  const layout: Layout = { width: Math.min(LINE_WIDTH, io.columns ?? LINE_WIDTH), full: options.full };
  const here: Here = { cwd: io.cwd, directory, workdir: options.workdir };
  io.out(options.json ? JSON.stringify(result, null, 2) : listing(result, layout, here));
  return EXIT_OK;
}

/** The conditions each record of the model has from others, by its id, for those that have any. */
function inheritedConditions(model: Model): Record<string, Condition[]> {
  const found: Record<string, Condition[]> = {};
  for (const record of elementsAndConnections(model)) {
    const others = conditionsOf(model, record.id).filter((condition) => condition.from !== record.id);
    if (others.length > 0) found[record.id] = others;
  }
  return found;
}

/** Every record of the model that may have a condition: the elements, then the connections, each family in order of id. */
function elementsAndConnections(model: Model): ModelRecord<{ only?: string | undefined }>[] {
  return [...model.people, ...model.systems, ...model.apps, ...model.stores, ...model.components, ...model.infrastructure, ...model.connections];
}

/** How the listing is laid out. */
interface Layout {
  /** The most columns a line may take. */
  width: number;
  /** Whether each description is shown whole, beneath its record. */
  full: boolean;
}

/** What the listing looks up as it writes: each record by its id, the names, and the sort of each element. */
interface Index {
  /** The name of each record of the model but a connection, by id. */
  names: Map<string, string>;
  /**
   * The sort of each element, as a person reads it, by id: `person`, `system`, `app`, `store`,
   * `component`, `piece of infrastructure`.
   */
  sorts: Map<string, string>;
  /** How many connections name each record in `via`, by id, for those that some connection names there. */
  through: Map<string, number>;
  /** The words of each record's own `only`, by id, for those that have one. */
  only: Map<string, string>;
  /** The stores each app keeps, by the app's id, in order of id. */
  kept: Map<string, string[]>;
  /** The pieces of infrastructure in each system, by the system's id, in order of id. */
  placed: Map<string, string[]>;
  people: Map<string, ModelRecord<Person>>;
  systems: Map<string, ModelRecord<System>>;
  apps: Map<string, ModelRecord<App>>;
  stores: Map<string, ModelRecord<Store>>;
  components: Map<string, ModelRecord<Component>>;
  infrastructure: Map<string, ModelRecord<Infrastructure>>;
  connections: Map<string, ModelRecord<Connection>>;
  owners: Map<string, ModelRecord<Owner>>;
  technologies: Map<string, ModelRecord<Technology>>;
}

/** A heading with how many it lists, and the lines beneath it. */
interface Section {
  title: string;
  count: number;
  /** A line under the heading that says how to read what follows. */
  note?: string;
  lines: string[];
}

/**
 * The model as a person reads it: each family under a heading that says how many, what is in a
 * thing beneath it, and each connection under what it starts from, in the order and the groups
 * of its outline; then each wording of a condition, so that two wordings of one can be seen.
 * Lines wrap at the width. `here` is where the command was run, so that the command the last
 * line names works there.
 */
function listing(result: ListResult, layout: Layout, here: Here): string {
  const index = indexOf(result);
  const outline = outlineOf(result);
  // A store that an app keeps stands under the app, and a piece of infrastructure under its
  // system, wherever the outline puts them: each record is listed once.
  const outlined = new Map(outline.withParts.map((system) => [system.id, system]));
  const withParts = result.systems.map((system) => system.id).filter((id) => outlined.has(id) || index.placed.has(id));
  const others = outline.others.filter((id) => !index.placed.has(id));
  const kept = new Set([...index.kept.values()].flat());
  const placed = new Set([...index.placed.values()].flat());
  const loose: Loose[] = [
    ...outline.loose.filter((part) => !kept.has(part.id)),
    ...result.infrastructure.flatMap((piece): Loose[] =>
      piece.in === undefined || placed.has(piece.id) || outline.loose.some((part) => part.id === piece.id)
        ? []
        : [{ id: piece.id, family: 'infrastructure', in: piece.in, components: [] }],
    ),
  ];
  const looseCount = loose.reduce((sum, part) => sum + 1 + part.components.length + (index.kept.get(part.id)?.length ?? 0), 0);
  const unplaced = outline.infrastructure.filter((id) => lookUp(index.infrastructure, id).in === undefined);
  const conditions = conditionsOfListing(result);
  // The note is needed only where a part shows no owner and has one all the same.
  const taken = [...ownership(result)].some(([id, found]) => found.from !== id);
  const named = (records: ReadonlyMap<string, ModelRecord<{ name: string; only?: string | undefined; description?: string | undefined }>>, ids: readonly string[]): string[] =>
    ids.map((id) => lookUp(records, id)).flatMap((record) => entry('  ', record.id, nameOf(record), [], record.description, layout));
  const systems = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => systemLines(id, outlined.get(id)?.apps ?? [], (outlined.get(id)?.stores ?? []).filter((store) => !kept.has(store)), index, layout));

  const sections: Section[] = [
    { title: 'People', count: outline.people.length, lines: named(index.people, outline.people) },
    {
      title: 'Systems with parts',
      count: withParts.length,
      ...(taken ? { note: 'An owner holds for what is beneath it until a part names its own.' } : {}),
      lines: systems(withParts),
    },
    { title: withParts.length > 0 ? 'Other systems' : 'Systems', count: others.length, lines: systems(others) },
    {
      title: 'Infrastructure',
      count: unplaced.length,
      lines: unplaced.flatMap((id) => infrastructureLines(lookUp(index.infrastructure, id), '  ', '', index, layout)),
    },
    { title: 'Connections', count: result.connections.length, lines: connectionLines(outline.connections, index, layout) },
    { title: 'Owners', count: outline.owners.length, lines: named(index.owners, outline.owners) },
    { title: 'Technologies', count: outline.technologies.length, lines: named(index.technologies, outline.technologies) },
    {
      title: 'Conditions',
      count: conditions.length,
      lines: conditions.flatMap(([only, n]) => wrap(words(`only ${only} (${count(n, 'record')})`), '  ', `  ${DEEPER}`, layout.width)),
    },
    { title: 'Parts in a record with an error', count: looseCount, lines: loose.flatMap((part) => looseLines(part, index, layout)) },
  ];

  const lines: string[] = [];
  lines.push(result.name ?? '(no name: the marker file could not be read)');
  lines.push(`${result.format === null ? 'format unknown' : `format ${result.format}`}, ${result.directory}`);
  lines.push('');
  for (const section of sections) {
    if (section.count === 0) continue;
    lines.push(...wrap(words(`${section.title} (${section.count})`), '', DEEPER, layout.width));
    if (section.note !== undefined) lines.push(...wrap(words(section.note), '', DEEPER, layout.width));
    lines.push(...section.lines, '');
  }

  // Every record of the model is listed. One left out has an error in its own file.
  const families = [
    result.people,
    result.systems,
    result.apps,
    result.stores,
    result.components,
    result.infrastructure,
    result.connections,
    result.owners,
    result.technologies,
  ];
  const listed = families.reduce((sum, family) => sum + family.length, 0);
  const read = `${count(result.records, 'record')} read${listed < result.records ? `, ${listed} listed` : ''}.`;
  const found = result.errors + result.warnings === 0 ? 'No problems.' : problemsInBrief(result.errors, result.warnings, here);
  lines.push(...wrap(commandWords(`${read} ${found}`), '', DEEPER, layout.width));
  return lines.join('\n');
}

/** Looks the model up once: each record by its id, the names, and the sorts. */
function indexOf(model: Model): Index {
  const index: Index = {
    names: new Map(),
    sorts: new Map(),
    through: new Map(),
    only: new Map(),
    kept: new Map(),
    placed: new Map(),
    people: byId(model.people),
    systems: byId(model.systems),
    apps: byId(model.apps),
    stores: byId(model.stores),
    components: byId(model.components),
    infrastructure: byId(model.infrastructure),
    connections: byId(model.connections),
    owners: byId(model.owners),
    technologies: byId(model.technologies),
  };
  for (const family of [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.owners, model.technologies]) {
    for (const record of family) index.names.set(record.id, record.name);
  }
  const sorts: [string, readonly { id: string }[]][] = [
    ['person', model.people],
    ['system', model.systems],
    ['app', model.apps],
    ['store', model.stores],
    ['component', model.components],
    ['piece of infrastructure', model.infrastructure],
  ];
  for (const [sort, family] of sorts) for (const record of family) index.sorts.set(record.id, sort);
  // `via` names none twice, so each id in it is one connection that passes through.
  for (const connection of model.connections) for (const id of connection.via ?? []) index.through.set(id, (index.through.get(id) ?? 0) + 1);
  for (const record of elementsAndConnections(model)) if (record.only !== undefined) index.only.set(record.id, record.only);
  for (const store of model.stores) add(index.kept, keeperOf(model, store.id), store.id);
  for (const piece of model.infrastructure) add(index.placed, systemOf(model, piece.id), piece.id);
  return index;
}

/** Adds an id to the list under a key, when there is a key. */
function add(lists: Map<string, string[]>, key: string | undefined, id: string): void {
  if (key === undefined) return;
  const list = lists.get(key);
  if (list) list.push(id);
  else lists.set(key, [id]);
}

/** Records by their ids. */
function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

/** The record with this id. The outline is made from the same model, so it is there. */
function lookUp<T>(records: ReadonlyMap<string, T>, id: string): T {
  const record = records.get(id);
  if (record === undefined) throw new Error(`The model has no record with the id ${id}.`);
  return record;
}

/**
 * A system, with its apps, its stores and its pieces of infrastructure beneath it, and beneath
 * each app its components and the stores it keeps. It says first when it is somebody else's,
 * and last how many connections pass through it.
 */
function systemLines(id: string, apps: readonly OutlineApp[], stores: readonly string[], index: Index, layout: Layout): string[] {
  const record = lookUp(index.systems, id);
  const facts = [record.external ? 'external' : undefined, owner(record.owner, index), passing(record.id, index)];
  return [
    ...entry('  ', record.id, nameOf(record), facts, record.description, layout),
    ...apps.flatMap((app) => appLines(app.id, app.components, '    ', index, layout)),
    ...stores.flatMap((store) => storeLines(lookUp(index.stores, store), '    ', index, layout)),
    ...(index.placed.get(id) ?? []).flatMap((piece) => infrastructureLines(lookUp(index.infrastructure, piece), '    ', 'infrastructure ', index, layout)),
  ];
}

/**
 * A piece of infrastructure, with its facts as an app has them, and how many connections pass
 * through it, none too. `head` goes before its id: under a system it says what the line is, as
 * `app` does. `where` is said first in its brackets, when given.
 */
function infrastructureLines(piece: ModelRecord<Infrastructure>, indent: string, head: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, technologies(piece.technology, index), owner(piece.owner, index), passing(piece.id, index) ?? 'no connection passes through it'];
  return entry(indent, `${head}${piece.id}`, nameOf(piece), facts, piece.description, layout);
}

/** A part whose `in` names a record with an error: as the outline gives it, or a piece of infrastructure. */
interface Loose {
  id: string;
  /** The folder of its family. */
  family: string;
  /** The id its `in` names. */
  in: string;
  /** For an app: its components. */
  components: readonly string[];
}

/** A part whose `in` names a record with an error, saying so first in its brackets. An app has its components and the stores it keeps beneath it. */
function looseLines(part: Loose, index: Index, layout: Layout): string[] {
  const where = `in: ${part.in}`;
  if (part.family === 'apps') return appLines(part.id, part.components, '  ', index, layout, where);
  if (part.family === 'stores') return storeLines(lookUp(index.stores, part.id), '  ', index, layout, where);
  if (part.family === 'infrastructure') return infrastructureLines(lookUp(index.infrastructure, part.id), '  ', 'infrastructure ', index, layout, where);
  return componentLines(lookUp(index.components, part.id), '  ', index, layout, where);
}

/** An app, with its components beneath it, then the stores it keeps. `where` is said first in its brackets, when given. */
function appLines(id: string, components: readonly string[], indent: string, index: Index, layout: Layout, where?: string): string[] {
  const app = lookUp(index.apps, id);
  const facts = [where, app.kind, technologies(app.technology, index), owner(app.owner, index), passing(app.id, index)];
  return [
    ...entry(indent, `app ${app.id}`, nameOf(app), facts, app.description, layout),
    ...components.flatMap((component) => componentLines(lookUp(index.components, component), `${indent}  `, index, layout)),
    ...(index.kept.get(id) ?? []).flatMap((store) => storeLines(lookUp(index.stores, store), `${indent}  `, index, layout)),
  ];
}

/** A store. `where` is said first in its brackets, when given. */
function storeLines(store: ModelRecord<Store>, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, store.kind, technologies(store.technology, index), owner(store.owner, index)];
  return entry(indent, `store ${store.id}`, nameOf(store), facts, store.description, layout);
}

/** A component. `where` is said first in its brackets, when given. */
function componentLines(component: ModelRecord<Component>, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, technologies(component.technology, index), owner(component.owner, index), passing(component.id, index)];
  return entry(indent, `component ${component.id}`, nameOf(component), facts, component.description, layout);
}

/** A record's name, with its condition after it when it has one: "Desk (only in the desk edition)". */
function nameOf(record: { name: string; only?: string | undefined }): string {
  return record.only === undefined ? record.name : `${record.name} (only ${record.only})`;
}

/**
 * Each wording of `only` in the model, with how many records hold it, those most held first
 * and then in order of their words, so that two wordings of one condition can be told apart.
 */
function conditionsOfListing(model: Model): [string, number][] {
  const held = new Map<string, number>();
  for (const record of elementsAndConnections(model)) if (record.only !== undefined) held.set(record.only, (held.get(record.only) ?? 0) + 1);
  const words = (only: string): string => only.toLowerCase();
  return [...held].sort(([a, m], [b, n]) => n - m || (words(a) < words(b) ? -1 : words(a) > words(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The connections, each group under the person, system, app, store or piece of infrastructure
 * it starts from, as the outline gives them. A group that starts at a record with an error is
 * shown by its id.
 */
function connectionLines(groups: readonly OutlineGroup[], index: Index, layout: Layout): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    const from = group.known
      ? `from ${lookUp(index.names, group.start)} (${lookUp(index.sorts, group.start)} ${group.start})`
      : `from ${group.start} (a record with an error)`;
    lines.push(...wrap(words(from), '  ', `  ${DEEPER}`, layout.width));
    for (const id of group.connections) lines.push(...connectionEntry(lookUp(index.connections, id), group.start, index, layout));
  }
  return lines;
}

/**
 * A connection under what it starts from: the arrow to its far end, what it passes through on
 * the way, in order, its name and protocol. The line names its start only when that is a
 * component of the app it stands under. A thing on the route that is there only sometimes
 * stands in brackets. What it does to a store, or that the far side opened its channel, comes
 * before its name, and its condition after it.
 */
function connectionEntry(connection: ModelRecord<Connection>, start: string, index: Index, layout: Layout): string[] {
  const from = connection.from === start ? '' : `${index.names.get(connection.from) ?? connection.from} `;
  const onRoute = (id: string): string => (index.only.has(id) ? `(${farEnd(id, index)})` : farEnd(id, index));
  const route = connection.via === undefined ? '' : `, via ${connection.via.map(onRoute).join(', ')}`;
  const arrow = `${from}-> ${farEnd(connection.to, index)}${route}`;
  // A mark is one word to the wrap, so that it is never broken over two lines.
  const marks = [connection.access === undefined ? undefined : `[${connection.access}]`, connection.opens === 'to' ? '[opened by the far side]' : undefined]
    .filter((mark) => mark !== undefined)
    .map((mark): Word => ({ text: mark, before: ' ' }));
  const named = [...marks, ...words(connection.name ?? '')];
  const said = named.length === 0 ? words(arrow) : [...words(`${arrow}:`), ...named];
  const conditioned = connection.only === undefined ? said : [...said, ...words(`(only ${connection.only})`)];
  return entry('    ', connection.id, conditioned, [technologies(connection.technology, index)], connection.description, layout);
}

/** How many connections pass through a record, or nothing when none does. */
function passing(id: string, index: Index): string | undefined {
  const n = index.through.get(id) ?? 0;
  if (n === 0) return undefined;
  return n === 1 ? '1 connection passes through it' : `${n} connections pass through it`;
}

/**
 * A record that a connection names, by its name, and a component with its app's, as in
 * "Order API / Checkout". A record whose file has an error is shown by its id, since its name
 * is not known.
 */
function farEnd(id: string, index: Index): string {
  const name = index.names.get(id) ?? id;
  const component = index.components.get(id);
  return component === undefined ? name : `${index.names.get(component.in) ?? component.in} / ${name}`;
}

/**
 * One record: who it is, what is known of it in brackets, and what it is for, wrapped at the
 * width. Its description is its first sentence on the same line, or under `--full` the whole
 * of it beneath, as it is written: each line of it starts a line of its own, and keeps the
 * spaces written in it, except where it wraps.
 */
function entry(indent: string, head: string, said: string | readonly Word[], facts: readonly (string | undefined)[], description: string | undefined, layout: Layout): string[] {
  const known = facts.filter((fact) => fact !== undefined);
  const about = known.length > 0 ? ` (${known.join('; ')})` : '';
  const line = [...words(`${head}:`), ...(typeof said === 'string' ? words(said) : said), ...words(about)];
  const deeper = indent + DEEPER;
  if (layout.full) {
    // The record's own wrapped line goes on deeper than the description beneath it, so the two are told apart.
    const beneath = (description === undefined ? [] : linesOf(description)).flatMap((text) => wrap(written(text), deeper + leading(text), deeper, layout.width));
    return [...wrap(line, indent, deeper + DEEPER, layout.width), ...beneath];
  }
  if (description === undefined) return wrap(line, indent, deeper, layout.width);
  // The dash stays with the word before it, so that a wrapped line never starts with one, as a list would.
  const dashed = line.map((word, at) => (at === line.length - 1 ? { ...word, text: `${word.text} -` } : word));
  return wrap([...dashed, ...words(firstSentence(description))], indent, deeper, layout.width);
}

/** The names of technologies, or their ids where a technology has an error in its file. */
function technologies(ids: readonly string[] | undefined, index: Index): string | undefined {
  return ids === undefined ? undefined : ids.map((id) => index.names.get(id) ?? id).join(', ');
}

/** The owner a record names, by its name, or by its id when the owner has an error in its file. */
function owner(id: string | undefined, index: Index): string | undefined {
  return id === undefined ? undefined : `owner: ${index.names.get(id) ?? id}`;
}

/** The lines of a text as it is written, without the spaces at their ends and without the empty ones. */
function linesOf(text: string): string[] {
  return text
    .split(/[\n\r\u0085\u2028\u2029]/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '');
}

/** The spaces a line starts with. */
function leading(line: string): string {
  return /^\s*/u.exec(line)?.[0] ?? '';
}

/** A text on one line: its line breaks and runs of spaces made one space, and none at either end. */
function flat(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** A word to lay out, and the spaces before it, which it keeps when it does not start a line. */
interface Word {
  text: string;
  before: string;
}

/** The words of a text: what its spaces and line breaks part, with one space before each. */
function words(text: string): Word[] {
  return text
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => ({ text: word, before: ' ' }));
}

/** The words of a text of the listing's own, keeping what is in backticks whole, so that a command to run is on one line. */
function commandWords(text: string): Word[] {
  return [...text.matchAll(/[^\s`]*`[^`]*`\S*|\S+/gu)].map((match) => ({ text: match[0], before: ' ' }));
}

/** The words of a line, each with the spaces written before it, so that a run of them is kept. */
function written(line: string): Word[] {
  return [...line.matchAll(/(\s*)(\S+)/gu)].map((match) => ({ text: match[2] ?? '', before: match[1] ?? '' }));
}

/**
 * Words on lines no wider than the width, each with the spaces before it, except at the start
 * of a line. The first line starts with `first`, each after it with `rest`. A word is never
 * broken, nor an id or a link: one too long for the room has a line of its own.
 */
function wrap(parts: readonly Word[], first: string, rest: string, width: number): string[] {
  const lines: string[] = [];
  let line = first;
  let room = width - widthOf(first);
  let empty = true;
  for (const { text, before } of parts) {
    const needed = widthOf(text) + (empty ? 0 : widthOf(before));
    if (!empty && needed > room) {
      lines.push(line);
      line = rest + text;
      room = width - widthOf(rest) - widthOf(text);
      continue;
    }
    line += empty ? text : before + text;
    room -= needed;
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** What a terminal shows as one character, as an emoji joined of several is one. */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * A picture that a terminal shows two columns wide: an emoji, alone, joined to others or with a
 * skin tone, a flag, and a character asked to look like an emoji, as in a heart or a keycap.
 */
const PICTURE = /\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Extended_Pictographic}\uFE0F|\uFE0F\u20E3/u;

/** Characters that take no column on a terminal: marks that combine with the one before, and joiners and variant selectors. */
const NO_COLUMN = /[\p{Mn}\p{Me}\u200B-\u200F\u2060\uFE00-\uFE0F]/u;

/** Characters that take two columns on a terminal: the wide scripts of East Asia. */
const TWO_COLUMNS =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;

/** How many columns a text takes on a terminal, counted for each character as the terminal shows it. */
export function widthOf(text: string): number {
  let columns = 0;
  for (const { segment } of GRAPHEMES.segment(text)) columns += columnsOf(segment);
  return columns;
}

/** How many columns one character as a terminal shows it takes: what it starts with says, unless it is a picture. */
function columnsOf(grapheme: string): number {
  if (PICTURE.test(grapheme)) return 2;
  const first = String.fromCodePoint(grapheme.codePointAt(0) ?? 0);
  return NO_COLUMN.test(first) ? 0 : TWO_COLUMNS.test(first) ? 2 : 1;
}
