import { ownership } from '@seefore/core';
import type { Connection, Model, ModelRecord, Ownership } from '@seefore/core';
import { EXIT_OK, openSource } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { count, problemsInBrief } from './words.ts';

/** The most characters of a description that a listing shows, so that a record keeps to one line. */
const DESCRIPTION_SHOWN = 80;

/** What `seefore list --json` prints: what the marker says, the counts, and the model, one list for each family. */
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
}

/**
 * Lists the model of the source directory: the records whose own file has no error. It shows
 * no problems, only how many there are, and always exits with 0 once it has started.
 */
export function list(options: CheckOptions, io: Io): number {
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
  };
  io.out(options.json ? JSON.stringify(result, null, 2) : listing(result));
  return EXIT_OK;
}

/**
 * The model as a person reads it: one record to a line, each family under a heading, and what
 * is in a thing beneath it. Owners and technologies are shown by their names.
 */
function listing(result: ListResult): string {
  const names = new Map<string, string>();
  for (const family of [result.people, result.systems, result.apps, result.stores, result.components, result.owners, result.technologies]) {
    for (const record of family) names.set(record.id, record.name);
  }
  const owners = ownership(result);
  const sections: [string, string[]][] = [
    ['People', result.people.map((person) => line('  ', person.id, person.name, [], person.description))],
    ['Systems', systems(result, names, owners)],
    ['Connections', result.connections.map((connection) => connectionLine(connection, names))],
    ['Owners', result.owners.map((owner) => line('  ', owner.id, owner.name, [], owner.description))],
    ['Technologies', result.technologies.map((technology) => line('  ', technology.id, technology.name, [], technology.description))],
  ];

  const lines: string[] = [];
  lines.push(result.name ?? '(no name: the marker file could not be read)');
  lines.push(`${result.format === null ? 'format unknown' : `format ${result.format}`}, ${result.directory}`);
  lines.push('');

  let listed = 0;
  for (const [title, entries] of sections) {
    if (entries.length === 0) continue;
    lines.push(title, ...entries, '');
    listed += entries.length;
  }

  // A record left out has an error in its own file, or is in one that has.
  const read = `${count(result.records, 'record')} read${listed < result.records ? `, ${listed} listed` : ''}.`;
  const found = result.errors + result.warnings === 0 ? 'No problems.' : problemsInBrief(result.errors, result.warnings);
  lines.push(`${read} ${found}`);
  return lines.join('\n');
}

/** Each system, with its apps and stores beneath it and the components of each app beneath that. */
function systems(model: Model, names: ReadonlyMap<string, string>, owners: ReadonlyMap<string, Ownership>): string[] {
  const lines: string[] = [];
  for (const system of model.systems) {
    lines.push(line('  ', system.id, system.name, [owner(system.id, owners, names)], system.description));
    for (const app of model.apps.filter((app) => app.in === system.id)) {
      lines.push(line('    ', `app ${app.id}`, app.name, [app.kind, technologies(app.technology, names), owner(app.id, owners, names)], app.description));
      for (const component of model.components.filter((component) => component.in === app.id)) {
        const facts = [technologies(component.technology, names), owner(component.id, owners, names)];
        lines.push(line('      ', `component ${component.id}`, component.name, facts, component.description));
      }
    }
    for (const store of model.stores.filter((store) => store.in === system.id)) {
      lines.push(line('    ', `store ${store.id}`, store.name, [store.kind, technologies(store.technology, names), owner(store.id, owners, names)], store.description));
    }
  }
  return lines;
}

/**
 * A connection read from the one that acts to the one it acts on, with its name and protocol.
 * An end whose file has an error is shown by its id, since its name is not known.
 */
function connectionLine(connection: ModelRecord<Connection>, names: ReadonlyMap<string, string>): string {
  const ends = `${names.get(connection.from) ?? connection.from} -> ${names.get(connection.to) ?? connection.to}`;
  const said = connection.name === undefined ? ends : `${ends}: ${connection.name}`;
  return line('  ', connection.id, said, [technologies(connection.technology, names)], connection.description);
}

/** One record on one line: who it is, what is known of it in brackets, and what it is for. */
function line(indent: string, head: string, said: string, facts: readonly (string | undefined)[], description: string | undefined): string {
  const known = facts.filter((fact) => fact !== undefined);
  const about = known.length > 0 ? ` (${known.join('; ')})` : '';
  const what = description === undefined ? '' : ` - ${oneLine(description)}`;
  return `${indent}${head}: ${said}${about}${what}`;
}

/** The names of technologies, or their ids where a technology has an error in its file. */
function technologies(ids: readonly string[] | undefined, names: ReadonlyMap<string, string>): string | undefined {
  return ids === undefined ? undefined : ids.map((id) => names.get(id) ?? id).join(', ');
}

/** Who answers for an element, and, when it is not the element's own owner, whose it is. */
function owner(id: string, owners: ReadonlyMap<string, Ownership>, names: ReadonlyMap<string, string>): string | undefined {
  const found = owners.get(id);
  if (!found) return undefined;
  const who = names.get(found.owner) ?? found.owner;
  return found.from === id ? `owner: ${who}` : `owner: ${who}, from \`${found.from}\``;
}

/** A description on one line: its line breaks and runs of spaces made one space, and cut short at a word when long. */
function oneLine(text: string): string {
  const flat = text.trim().replace(/\s+/g, ' ');
  if (flat.length <= DESCRIPTION_SHOWN) return flat;
  // The last space at or before the room left: a word that ends just where the cut falls stays whole.
  const room = DESCRIPTION_SHOWN - '...'.length;
  const space = flat.lastIndexOf(' ', room);
  const kept = space > 0 ? flat.slice(0, space) : flat.slice(0, room);
  return kept.replace(/[.,;:]+$/, '') + '...';
}
