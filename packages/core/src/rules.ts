import { nounOf, oneOf, referenceField } from './format.ts';
import type { Format } from './format.ts';
import type { RecordFile, Reference } from './load.ts';
import type { ModelRecord } from './model.ts';
import { START, error, list, quote, warning } from './problem.ts';
import type { Position, Problem } from './problem.ts';
import type { Connection } from './records.ts';

/**
 * The rules and checks that look at more than one record. A rule says the model can be read
 * right, and breaking it is an error. A check says what the conventions call wrong or doubtful.
 */

/** Every file that stands for a record, by id. One for each id, unless an id is used twice. */
export type RecordsById = ReadonlyMap<string, readonly RecordFile[]>;

export function byId(records: readonly RecordFile[]): Map<string, RecordFile[]> {
  const found = new Map<string, RecordFile[]>();
  for (const record of records) {
    const same = found.get(record.id);
    if (same) same.push(record);
    else found.set(record.id, [record]);
  }
  return found;
}

/**
 * Every reference that names no record, and every one that names a record of a kind its field
 * does not allow. A record whose file is broken still counts: its family is known from its
 * folder, so one broken file does not make every reference to it an error.
 */
export function referenceProblems(format: Format, records: RecordsById, references: readonly Reference[]): Problem[] {
  const problems: Problem[] = [];
  for (const reference of references) {
    const field = referenceField(format, folderOf(reference.file), reference.field);
    if (!field) continue;
    const named = records.get(reference.names) ?? [];
    const said = `${quote(reference.field)} names ${quote(reference.names)}`;
    if (named.length === 0) {
      problems.push(error(reference.file, placeOf(reference), 'reference-unknown', `${said}, but no record has that id. ${field.rule}`));
    } else if (!named.some((record) => field.families.includes(record.family))) {
      // An id used twice is reported as such; here the first of its records stands for it.
      const kind = oneOf(format, (named[0] as RecordFile).family);
      problems.push(error(reference.file, placeOf(reference), 'reference-wrong-kind', `${said}, which is ${kind}. ${field.rule}`));
    }
  }
  return problems;
}

/**
 * What each record is in, by id, wherever its `in` names one record of a kind it may be in.
 * Followed upwards, it goes from a component to its app and on to its system. Since each kind
 * may be in only a kind above it, nothing can come to be in itself.
 */
export function parentsOf(format: Format, records: RecordsById, references: readonly Reference[]): Map<string, string> {
  const parents = new Map<string, string>();
  for (const reference of references) {
    if (reference.field !== 'in') continue;
    const field = referenceField(format, folderOf(reference.file), 'in');
    const family = familyOf(records, reference.names);
    if (!field || family === undefined || !field.families.includes(family)) continue;
    if (records.get(reference.record)?.length !== 1) continue;
    parents.set(reference.record, reference.names);
  }
  return parents;
}

/**
 * The checks of the conventions for connections: a store acts on nothing but another store;
 * one connection says one thing; and one written a level up in the same words as one beneath
 * it says nothing more.
 */
export function connectionProblems(
  format: Format,
  records: RecordsById,
  parents: ReadonlyMap<string, string>,
  references: readonly Reference[],
  connections: readonly ModelRecord<Connection>[],
): Problem[] {
  return [
    ...storesActing(format, records, references, connections),
    ...connectionsTwice(connections),
    ...connectionsRepeatedAbove(parents, connections),
  ];
}

/**
 * A connection goes from the one that acts. A store acts on nothing but another store, so one
 * that goes from a store to anything else is drawn the wrong way round.
 */
function storesActing(format: Format, records: RecordsById, references: readonly Reference[], connections: readonly ModelRecord<Connection>[]): Problem[] {
  const ends = referenceField(format, 'connections', 'to')?.families ?? [];
  const problems: Problem[] = [];
  for (const connection of connections) {
    if (familyOf(records, connection.from) !== 'stores') continue;
    const to = familyOf(records, connection.to);
    // An end of the wrong kind, or one that names nothing, is a rule's to report.
    if (to === undefined || to === 'stores' || !ends.includes(to)) continue;
    const from = references.find((reference) => reference.file === connection.file && reference.field === 'from');
    problems.push(
      error(
        connection.file,
        from ? placeOf(from) : START,
        'store-acts',
        `This connection goes from the store ${quote(connection.from)} to the ${nounOf(format, to)} ${quote(connection.to)}, but a store acts on nothing ` +
          'but another store. Turn it round, so that it goes from the one that reads or writes the store, and say which in its name.',
      ),
    );
  }
  return problems;
}

/** Two connections with the same ends and the same name say one thing twice. */
function connectionsTwice(connections: readonly ModelRecord<Connection>[]): Problem[] {
  const groups = new Map<string, ModelRecord<Connection>[]>();
  for (const connection of connections) {
    if (connection.name === undefined) continue;
    const key = JSON.stringify([connection.from, connection.to, connection.name]);
    const same = groups.get(key);
    if (same) same.push(connection);
    else groups.set(key, [connection]);
  }
  const problems: Problem[] = [];
  for (const same of groups.values()) {
    if (same.length < 2) continue;
    for (const connection of same) {
      const others = same.filter((other) => other !== connection).map((other) => other.file);
      problems.push(
        warning(connection.file, START, 'connection-twice', `This connection has the same \`from\`, \`to\` and \`name\` as ${list(others)}. Keep one.`),
      );
    }
  }
  return problems;
}

/**
 * A connection a level up is a summary of the ones beneath it, worth writing only when it says
 * more. One with the same name as a connection beneath it, whose ends are each the same as that
 * one's or what that one's end is in, says nothing more.
 */
function connectionsRepeatedAbove(parents: ReadonlyMap<string, string>, connections: readonly ModelRecord<Connection>[]): Problem[] {
  const byName = new Map<string, ModelRecord<Connection>[]>();
  for (const connection of connections) {
    if (connection.name === undefined) continue;
    const same = byName.get(connection.name);
    if (same) same.push(connection);
    else byName.set(connection.name, [connection]);
  }

  const problems: Problem[] = [];
  for (const same of byName.values()) {
    for (const upper of same) {
      const beneath = same.filter(
        (lower) =>
          lower !== upper &&
          (lower.from !== upper.from || lower.to !== upper.to) &&
          upwards(parents, lower.from).includes(upper.from) &&
          upwards(parents, lower.to).includes(upper.to),
      );
      if (beneath.length === 0) continue;
      const files = beneath.map((lower) => lower.file);
      problems.push(
        warning(
          upper.file,
          START,
          'connection-repeated-above',
          `This connection says in the same words, a level up, what ${list(files)} ${files.length === 1 ? 'says' : 'say'}. ` +
            'A connection a level up is a summary: give it a name that says more than the ones beneath it, or remove it.',
        ),
      );
    }
  }
  return problems;
}

/** A record and what it is in, and what that is in, to the top. */
function upwards(parents: ReadonlyMap<string, string>, id: string): string[] {
  const chain = [id];
  for (let above = parents.get(id); above !== undefined && !chain.includes(above); above = parents.get(above)) chain.push(above);
  return chain;
}

/** The family of the record an id names, when exactly one record has it. */
function familyOf(records: RecordsById, id: string): string | undefined {
  const named = records.get(id);
  return named?.length === 1 ? (named[0] as RecordFile).family : undefined;
}

/** The folder a record's file is in. */
function folderOf(file: string): string {
  return file.slice(0, file.indexOf('/'));
}

function placeOf(reference: Reference): Position {
  return { line: reference.line, column: reference.column };
}
