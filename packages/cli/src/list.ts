import { ownership } from '@seefore/core';
import type { App, Component, Connection, Model, ModelRecord, Ownership, Store, System } from '@seefore/core';
import { EXIT_OK, openSource } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { count, problemsInBrief } from './words.ts';

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
   * Who answers for each system, app, store and component that has an owner, by its id: the
   * owner, and the record whose `owner` names it. A part with no owner, here or above, is not in it.
   */
  ownership: Record<string, Ownership>;
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
  };
  const layout: Layout = { width: Math.min(LINE_WIDTH, io.columns ?? LINE_WIDTH), full: options.full };
  io.out(options.json ? JSON.stringify(result, null, 2) : listing(result, layout));
  return EXIT_OK;
}

/** How the listing is laid out. */
interface Layout {
  /** The most columns a line may take. */
  width: number;
  /** Whether each description is shown whole, beneath its record. */
  full: boolean;
}

/** What the listing looks up as it writes: names, the sort of each element, and where each part sits. */
interface Index {
  /** The name of each record of the model but a connection, by id. */
  names: Map<string, string>;
  /** The sort of each element, as a person reads it, by id: `person`, `system`, `app`, `store`, `component`. */
  sorts: Map<string, string>;
  /** Each component, by id, so that the app it is in can be found. */
  components: Map<string, ModelRecord<Component>>;
  /** The apps in each system, by the system's id. */
  appsIn: Map<string, ModelRecord<App>[]>;
  /** The stores in each system, by the system's id. */
  storesIn: Map<string, ModelRecord<Store>[]>;
  /** The components in each app, by the app's id. */
  componentsIn: Map<string, ModelRecord<Component>[]>;
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
 * thing beneath it, and each connection under what it starts from. Lines wrap at the width.
 */
function listing(result: ListResult, layout: Layout): string {
  const index = indexOf(result);
  const places = placesOf(result, index);
  const { withParts, others, looseApps, looseStores, looseComponents } = places;
  const looseCount = looseApps.length + looseApps.flatMap((app) => index.componentsIn.get(app.id) ?? []).length + looseStores.length + looseComponents.length;
  // The note is needed only where a part shows no owner and has one all the same.
  const taken = [...ownership(result)].some(([id, found]) => found.from !== id);

  const sections: Section[] = [
    { title: 'People', count: result.people.length, lines: result.people.flatMap((person) => entry('  ', person.id, person.name, [], person.description, layout)) },
    {
      title: 'Systems with parts',
      count: withParts.length,
      ...(taken ? { note: 'An owner holds for what is beneath it until a part names its own.' } : {}),
      lines: withParts.flatMap((system) => systemLines(system, index, layout)),
    },
    { title: withParts.length > 0 ? 'Other systems' : 'Systems', count: others.length, lines: others.flatMap((system) => systemLines(system, index, layout)) },
    { title: 'Connections', count: result.connections.length, lines: connectionLines(result.connections, startOrder(result, places, index), index, layout) },
    { title: 'Owners', count: result.owners.length, lines: result.owners.flatMap((owner) => entry('  ', owner.id, owner.name, [], owner.description, layout)) },
    {
      title: 'Technologies',
      count: result.technologies.length,
      lines: result.technologies.flatMap((technology) => entry('  ', technology.id, technology.name, [], technology.description, layout)),
    },
    {
      title: 'Parts in a record with an error',
      count: looseCount,
      lines: [
        ...looseApps.flatMap((app) => appLines(app, '  ', index, layout, `in: ${app.in}`)),
        ...looseStores.flatMap((store) => storeLines(store, '  ', index, layout, `in: ${store.in}`)),
        ...looseComponents.flatMap((component) => componentLines(component, '  ', index, layout, `in: ${component.in}`)),
      ],
    },
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
  const families = [result.people, result.systems, result.apps, result.stores, result.components, result.connections, result.owners, result.technologies];
  const listed = families.reduce((sum, family) => sum + family.length, 0);
  const read = `${count(result.records, 'record')} read${listed < result.records ? `, ${listed} listed` : ''}.`;
  const found = result.errors + result.warnings === 0 ? 'No problems.' : problemsInBrief(result.errors, result.warnings);
  lines.push(...wrap(words(`${read} ${found}`), '', DEEPER, layout.width));
  return lines.join('\n');
}

/** Where the listing shows each system, and the parts it cannot put in their place. Each list is in order of id. */
interface Places {
  /** The systems with an app or a store in them. */
  withParts: ModelRecord<System>[];
  /** The systems with nothing in them. */
  others: ModelRecord<System>[];
  /** The apps and stores whose `in` names a system with an error, and the components whose `in` names an app with one. */
  looseApps: ModelRecord<App>[];
  looseStores: ModelRecord<Store>[];
  looseComponents: ModelRecord<Component>[];
}

/** Sorts the systems into those with parts and the others, and finds the parts whose `in` cannot be followed. */
function placesOf(model: Model, index: Index): Places {
  const hasParts = (system: ModelRecord<System>): boolean => index.appsIn.has(system.id) || index.storesIn.has(system.id);
  const systems = new Set(model.systems.map((system) => system.id));
  const apps = new Set(model.apps.map((app) => app.id));
  return {
    withParts: model.systems.filter(hasParts),
    others: model.systems.filter((system) => !hasParts(system)),
    looseApps: model.apps.filter((app) => !systems.has(app.in)),
    looseStores: model.stores.filter((store) => !systems.has(store.in)),
    looseComponents: model.components.filter((component) => !apps.has(component.in)),
  };
}

/** What a connection may start from, by id, in the order the listing shows it. A component's stand under its app. */
function startOrder(model: Model, places: Places, index: Index): string[] {
  return [
    ...model.people.map((person) => person.id),
    ...places.withParts.flatMap((system) => [
      system.id,
      ...(index.appsIn.get(system.id) ?? []).map((app) => app.id),
      ...(index.storesIn.get(system.id) ?? []).map((store) => store.id),
    ]),
    ...places.others.map((system) => system.id),
    ...places.looseApps.map((app) => app.id),
    ...places.looseStores.map((store) => store.id),
  ];
}

/** Looks the model up once: names, sorts, and what is in what. Each list stays in order of id. */
function indexOf(model: Model): Index {
  const index: Index = { names: new Map(), sorts: new Map(), components: new Map(), appsIn: new Map(), storesIn: new Map(), componentsIn: new Map() };
  for (const family of [model.people, model.systems, model.apps, model.stores, model.components, model.owners, model.technologies]) {
    for (const record of family) index.names.set(record.id, record.name);
  }
  for (const person of model.people) index.sorts.set(person.id, 'person');
  for (const system of model.systems) index.sorts.set(system.id, 'system');
  for (const app of model.apps) {
    index.sorts.set(app.id, 'app');
    add(index.appsIn, app.in, app);
  }
  for (const store of model.stores) {
    index.sorts.set(store.id, 'store');
    add(index.storesIn, store.in, store);
  }
  for (const component of model.components) {
    index.sorts.set(component.id, 'component');
    index.components.set(component.id, component);
    add(index.componentsIn, component.in, component);
  }
  return index;
}

/** Adds a value at the end of the list kept under a key. */
function add<T>(lists: Map<string, T[]>, key: string, value: T): void {
  const list = lists.get(key);
  if (list) list.push(value);
  else lists.set(key, [value]);
}

/** A system, with its apps and stores beneath it and the components of each app beneath that. */
function systemLines(system: ModelRecord<System>, index: Index, layout: Layout): string[] {
  return [
    ...entry('  ', system.id, system.name, [owner(system.owner, index)], system.description, layout),
    ...(index.appsIn.get(system.id) ?? []).flatMap((app) => appLines(app, '    ', index, layout)),
    ...(index.storesIn.get(system.id) ?? []).flatMap((store) => storeLines(store, '    ', index, layout)),
  ];
}

/** An app, with its components beneath it. `where` is said first in its brackets, when given. */
function appLines(app: ModelRecord<App>, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, app.kind, technologies(app.technology, index), owner(app.owner, index)];
  return [
    ...entry(indent, `app ${app.id}`, app.name, facts, app.description, layout),
    ...(index.componentsIn.get(app.id) ?? []).flatMap((component) => componentLines(component, `${indent}  `, index, layout)),
  ];
}

/** A store. `where` is said first in its brackets, when given. */
function storeLines(store: ModelRecord<Store>, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, store.kind, technologies(store.technology, index), owner(store.owner, index)];
  return entry(indent, `store ${store.id}`, store.name, facts, store.description, layout);
}

/** A component. `where` is said first in its brackets, when given. */
function componentLines(component: ModelRecord<Component>, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const facts = [where, technologies(component.technology, index), owner(component.owner, index)];
  return entry(indent, `component ${component.id}`, component.name, facts, component.description, layout);
}

/**
 * The connections, each under the person, system, app or store it starts from, in the order the
 * listing shows those, and in order of id beneath it. A component's are under its app. One that
 * starts at a record with an error comes after the rest, under that record's id.
 */
function connectionLines(connections: readonly ModelRecord<Connection>[], order: readonly string[], index: Index, layout: Layout): string[] {
  const groups = new Map<string, ModelRecord<Connection>[]>();
  for (const connection of connections) add(groups, index.components.get(connection.from)?.in ?? connection.from, connection);
  const shown = new Set(order);
  const starts = [...order.filter((id) => groups.has(id)), ...[...groups.keys()].filter((id) => !shown.has(id)).sort()];

  const lines: string[] = [];
  for (const start of starts) {
    const sort = index.sorts.get(start);
    const name = index.names.get(start);
    const from = sort === undefined || name === undefined ? `from ${start} (a record with an error)` : `from ${name} (${sort} ${start})`;
    lines.push(...wrap(words(from), '  ', `  ${DEEPER}`, layout.width));
    for (const connection of groups.get(start) ?? []) lines.push(...connectionEntry(connection, start, index, layout));
  }
  return lines;
}

/**
 * A connection under what it starts from: the arrow to its far end, its name and protocol. The
 * line names its start only when that is a component of the app it stands under.
 */
function connectionEntry(connection: ModelRecord<Connection>, start: string, index: Index, layout: Layout): string[] {
  const from = connection.from === start ? '' : `${index.names.get(connection.from) ?? connection.from} `;
  const arrow = `${from}-> ${farEnd(connection.to, index)}`;
  const said = connection.name === undefined ? arrow : `${arrow}: ${connection.name}`;
  return entry('    ', connection.id, said, [technologies(connection.technology, index)], connection.description, layout);
}

/**
 * The far end of a connection by its name, and a component with its app's, as in
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
 * of it beneath, each paragraph starting a line of its own.
 */
function entry(indent: string, head: string, said: string, facts: readonly (string | undefined)[], description: string | undefined, layout: Layout): string[] {
  const known = facts.filter((fact) => fact !== undefined);
  const about = known.length > 0 ? ` (${known.join('; ')})` : '';
  const line = words(`${head}: ${said}${about}`);
  const deeper = indent + DEEPER;
  if (layout.full) {
    // The record's own wrapped line goes on deeper than the description beneath it, so the two are told apart.
    const beneath = (description === undefined ? [] : paragraphs(description)).flatMap((paragraph) => wrap(words(paragraph), deeper, deeper, layout.width));
    return [...wrap(line, indent, deeper + DEEPER, layout.width), ...beneath];
  }
  if (description === undefined) return wrap(line, indent, deeper, layout.width);
  // The dash stays with the word before it, so that a wrapped line never starts with one, as a list would.
  const dashed = line.map((word, at) => (at === line.length - 1 ? `${word} -` : word));
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

/** The sentence rules of the platform, for English. */
const SENTENCES = new Intl.Segmenter('en', { granularity: 'sentence' });

/**
 * The end of a short form after which a sentence goes on: letters each followed by a dot, as in
 * "e.g.", "i.e." and "U.S.", and a few short words. The platform's rules end a sentence there
 * when a capital follows.
 */
const SHORT_FORM = /(?:^|[\s(])(?:(?:\p{L}\.){2,}|cf\.|vs\.|approx\.|incl\.)$/iu;

/**
 * The first sentence of a text, whole, on one line. A sentence ends only before a space, so
 * that a link such as `example.com/a?b=1` stays whole, and never after a short form such as
 * "e.g.". A text with no end of a sentence is given whole.
 */
export function firstSentence(text: string): string {
  let first = '';
  for (const { segment } of SENTENCES.segment(flat(text))) {
    first += segment;
    if (first.endsWith(' ') && !SHORT_FORM.test(first.trimEnd())) break;
  }
  return first.trimEnd();
}

/** The paragraphs of a text, each on one line: what its line breaks part, without the empty ones. */
function paragraphs(text: string): string[] {
  return text
    .split(/[\n\r\u0085\u2028\u2029]/)
    .map(flat)
    .filter((paragraph) => paragraph !== '');
}

/** A text on one line: its line breaks and runs of spaces made one space, and none at either end. */
function flat(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** The words of a text: what its spaces and line breaks part. */
function words(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

/**
 * Words on lines no wider than the width, a space between two on a line. The first line starts
 * with `first`, each after it with `rest`. A word is never broken, nor an id or a link: one too
 * long for the room has a line of its own.
 */
function wrap(parts: readonly string[], first: string, rest: string, width: number): string[] {
  const lines: string[] = [];
  let line = first;
  let room = width - widthOf(first);
  let empty = true;
  for (const word of parts) {
    const needed = widthOf(word) + (empty ? 0 : 1);
    if (!empty && needed > room) {
      lines.push(line);
      line = rest + word;
      room = width - widthOf(rest) - widthOf(word);
      continue;
    }
    line += empty ? word : ` ${word}`;
    room -= needed;
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** Characters that take no column on a terminal: marks that combine with the one before, and joiners and variant selectors. */
const NO_COLUMN = /[\p{Mn}\p{Me}\u200B-\u200F\u2060\uFE00-\uFE0F]/u;

/** Characters that take two columns on a terminal: the wide scripts of East Asia, and pictures such as emoji. */
const TWO_COLUMNS =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

/** How many columns a text takes on a terminal. */
export function widthOf(text: string): number {
  let columns = 0;
  for (const character of text) columns += NO_COLUMN.test(character) ? 0 : TWO_COLUMNS.test(character) ? 2 : 1;
  return columns;
}
