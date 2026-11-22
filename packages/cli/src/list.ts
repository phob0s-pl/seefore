import { firstSentence, outlineOf, ownership } from '@seefore/core';
import type {
  App,
  Component,
  Connection,
  Model,
  ModelRecord,
  OutlineApp,
  OutlineGroup,
  OutlineLoose,
  OutlineSystem,
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
  const here: Here = { cwd: io.cwd, directory, workdir: options.workdir };
  io.out(options.json ? JSON.stringify(result, null, 2) : listing(result, layout, here));
  return EXIT_OK;
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
  /** The sort of each element, as a person reads it, by id: `person`, `system`, `app`, `store`, `component`. */
  sorts: Map<string, string>;
  people: Map<string, ModelRecord<Person>>;
  systems: Map<string, ModelRecord<System>>;
  apps: Map<string, ModelRecord<App>>;
  stores: Map<string, ModelRecord<Store>>;
  components: Map<string, ModelRecord<Component>>;
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
 * of its outline. Lines wrap at the width. `here` is where the command was run, so that the
 * command the last line names works there.
 */
function listing(result: ListResult, layout: Layout, here: Here): string {
  const index = indexOf(result);
  const outline = outlineOf(result);
  const looseCount = outline.loose.reduce((sum, part) => sum + 1 + part.components.length, 0);
  // The note is needed only where a part shows no owner and has one all the same.
  const taken = [...ownership(result)].some(([id, found]) => found.from !== id);
  const named = (records: ReadonlyMap<string, ModelRecord<{ name: string; description?: string | undefined }>>, ids: readonly string[]): string[] =>
    ids.map((id) => lookUp(records, id)).flatMap((record) => entry('  ', record.id, record.name, [], record.description, layout));

  const sections: Section[] = [
    { title: 'People', count: outline.people.length, lines: named(index.people, outline.people) },
    {
      title: 'Systems with parts',
      count: outline.withParts.length,
      ...(taken ? { note: 'An owner holds for what is beneath it until a part names its own.' } : {}),
      lines: outline.withParts.flatMap((system) => systemLines(system, index, layout)),
    },
    {
      title: outline.withParts.length > 0 ? 'Other systems' : 'Systems',
      count: outline.others.length,
      lines: outline.others.flatMap((id) => systemLines({ id, apps: [], stores: [] }, index, layout)),
    },
    { title: 'Connections', count: result.connections.length, lines: connectionLines(outline.connections, index, layout) },
    { title: 'Owners', count: outline.owners.length, lines: named(index.owners, outline.owners) },
    { title: 'Technologies', count: outline.technologies.length, lines: named(index.technologies, outline.technologies) },
    { title: 'Parts in a record with an error', count: looseCount, lines: outline.loose.flatMap((part) => looseLines(part, index, layout)) },
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
  const found = result.errors + result.warnings === 0 ? 'No problems.' : problemsInBrief(result.errors, result.warnings, here);
  lines.push(...wrap(commandWords(`${read} ${found}`), '', DEEPER, layout.width));
  return lines.join('\n');
}

/** Looks the model up once: each record by its id, the names, and the sorts. */
function indexOf(model: Model): Index {
  const index: Index = {
    names: new Map(),
    sorts: new Map(),
    people: byId(model.people),
    systems: byId(model.systems),
    apps: byId(model.apps),
    stores: byId(model.stores),
    components: byId(model.components),
    connections: byId(model.connections),
    owners: byId(model.owners),
    technologies: byId(model.technologies),
  };
  for (const family of [model.people, model.systems, model.apps, model.stores, model.components, model.owners, model.technologies]) {
    for (const record of family) index.names.set(record.id, record.name);
  }
  const sorts: [string, readonly { id: string }[]][] = [
    ['person', model.people],
    ['system', model.systems],
    ['app', model.apps],
    ['store', model.stores],
    ['component', model.components],
  ];
  for (const [sort, family] of sorts) for (const record of family) index.sorts.set(record.id, sort);
  return index;
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

/** A system, with its apps and stores beneath it and the components of each app beneath that. */
function systemLines(system: OutlineSystem, index: Index, layout: Layout): string[] {
  const record = lookUp(index.systems, system.id);
  return [
    ...entry('  ', record.id, record.name, [owner(record.owner, index)], record.description, layout),
    ...system.apps.flatMap((app) => appLines(app, '    ', index, layout)),
    ...system.stores.flatMap((store) => storeLines(lookUp(index.stores, store), '    ', index, layout)),
  ];
}

/** A part whose `in` names a record with an error, saying so first in its brackets. */
function looseLines(part: OutlineLoose, index: Index, layout: Layout): string[] {
  const where = `in: ${part.in}`;
  if (part.family === 'apps') return appLines({ id: part.id, components: part.components }, '  ', index, layout, where);
  if (part.family === 'stores') return storeLines(lookUp(index.stores, part.id), '  ', index, layout, where);
  return componentLines(lookUp(index.components, part.id), '  ', index, layout, where);
}

/** An app, with its components beneath it. `where` is said first in its brackets, when given. */
function appLines(outlined: OutlineApp, indent: string, index: Index, layout: Layout, where?: string): string[] {
  const app = lookUp(index.apps, outlined.id);
  const facts = [where, app.kind, technologies(app.technology, index), owner(app.owner, index)];
  return [
    ...entry(indent, `app ${app.id}`, app.name, facts, app.description, layout),
    ...outlined.components.flatMap((component) => componentLines(lookUp(index.components, component), `${indent}  `, index, layout)),
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
 * The connections, each group under the person, system, app or store it starts from, as the
 * outline gives them. A group that starts at a record with an error is shown by its id.
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
 * of it beneath, as it is written: each line of it starts a line of its own, and keeps the
 * spaces written in it, except where it wraps.
 */
function entry(indent: string, head: string, said: string, facts: readonly (string | undefined)[], description: string | undefined, layout: Layout): string[] {
  const known = facts.filter((fact) => fact !== undefined);
  const about = known.length > 0 ? ` (${known.join('; ')})` : '';
  const line = words(`${head}: ${said}${about}`);
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
