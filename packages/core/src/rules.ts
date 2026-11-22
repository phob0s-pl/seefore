import { nounOf, oneOf, referenceField } from './format.ts';
import type { Format } from './format.ts';
import type { RecordFile, Reference } from './load.ts';
import type { ModelRecord } from './model.ts';
import { START, error, list, quote, warning } from './problem.ts';
import type { Position, Problem } from './problem.ts';
import type { Connection, Store, Technology } from './records.ts';

/**
 * The rules and checks that look at more than one record. A rule says the model can be read
 * right, and breaking it is an error. A check says what the conventions call wrong or doubtful.
 */

/** The folder of the records that join two others. */
const CONNECTIONS = 'connections';

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
      const family = (named[0] as RecordFile).family;
      const advice = field.wrongFamily?.[family];
      const message = `${said}, which is ${oneOf(format, family)}. ${field.rule}${advice === undefined ? '' : ` ${advice}`}`;
      problems.push(error(reference.file, placeOf(reference), 'reference-wrong-kind', message));
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

/**
 * Two connections with the same ends and the same name may say one thing twice. They may also
 * be two exchanges whose name does not yet say which is which, so neither is simply dropped.
 */
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
        warning(
          connection.file,
          START,
          'connection-twice',
          `This connection has the same \`from\`, \`to\` and \`name\` as ${list(others)}. ` +
            'If these are the same exchange, keep one. If their purposes differ, give each a name that says which.',
        ),
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
          `This connection says in the same words, higher up, what ${list(files)} ${files.length === 1 ? 'says' : 'say'}. ` +
            'A connection higher up is a summary: give it a name that says more than the ones beneath it, or remove it.',
        ),
      );
    }
  }
  return problems;
}

/**
 * The rule and the check of what a connection passes through. Each id in `via` stands between
 * the two ends, so one that names an end, what an end is in, or what is in an end is an error,
 * at that id. An app or a system that `via` names and that is the end of no connection, nor is
 * anything in it, only passes exchanges on: a warning says it is a piece of infrastructure.
 */
export function viaProblems(format: Format, records: RecordsById, parents: ReadonlyMap<string, string>, references: readonly Reference[]): Problem[] {
  return [...viaEnds(format, records, parents, references), ...passesOnOnly(format, records, parents, references)];
}

/** Each id in `via` that names an end of its connection, what an end is in, or what is in an end. */
function viaEnds(format: Format, records: RecordsById, parents: ReadonlyMap<string, string>, references: readonly Reference[]): Problem[] {
  const allowed = referenceField(format, CONNECTIONS, 'via')?.families ?? [];
  const ends = endsOf(references);
  const problems: Problem[] = [];
  for (const reference of references) {
    if (reference.field !== 'via' || folderOf(reference.file) !== CONNECTIONS) continue;
    // An id that names nothing, or a record `via` may not name, is for the rule of references to report.
    const family = familyOf(records, reference.names);
    if (family === undefined || !allowed.includes(family)) continue;
    const message = endInVia(parents, reference.names, ends.get(reference.file) ?? {});
    if (message !== undefined) problems.push(error(reference.file, placeOf(reference), 'via-end', message));
  }
  return problems;
}

/**
 * What is wrong with an id in `via` of a connection with these ends, if anything: that it is an
 * end, what an end is in, or in an end. The `from` is looked at first, so each id is reported once.
 */
function endInVia(parents: ReadonlyMap<string, string>, id: string, ends: Ends): string | undefined {
  const named = `\`via\` names ${quote(id)}`;
  const between = 'What a connection passes through stands between its two ends';
  for (const side of ['from', 'to'] as const) {
    const end = ends[side];
    if (end === undefined) continue;
    const theEnd = `the ${quote(side)} of this connection`;
    if (end === id) return `${named}, which is ${theEnd}. ${between}: take ${quote(id)} out of \`via\`.`;
    if (upwards(parents, end).includes(id)) return `${named}, which ${quote(end)}, ${theEnd}, is in. ${between}: take ${quote(id)} out of \`via\`.`;
    if (upwards(parents, id).includes(end)) {
      const further =
        side === 'to'
          ? `if the exchange goes on past it, make the part of ${quote(end)} that it ends at the \`to\``
          : `if the exchange starts before it, make the part of ${quote(end)} that it starts at the \`from\``;
      return `${named}, which is in ${quote(end)}, ${theEnd}. ${between}. Take ${quote(id)} out of \`via\`, or, ${further}.`;
    }
  }
  return undefined;
}

/**
 * An app or a system that `via` names, and that is the end of no connection, nor is anything in
 * it, does nothing but pass exchanges on: it is a piece of infrastructure written as an app or a
 * system. A component that only passes on may keep its record, so it is not looked at.
 */
function passesOnOnly(format: Format, records: RecordsById, parents: ReadonlyMap<string, string>, references: readonly Reference[]): Problem[] {
  // Every end of a connection, and everything it is in, to the top.
  const reached = new Set<string>();
  for (const ends of endsOf(references).values()) {
    for (const end of [ends.from, ends.to]) {
      if (end === undefined) continue;
      for (const id of upwards(parents, end)) reached.add(id);
    }
  }
  // The connections that name each id in `via`.
  const through = new Map<string, Set<string>>();
  for (const reference of references) {
    if (reference.field !== 'via' || folderOf(reference.file) !== CONNECTIONS) continue;
    const files = through.get(reference.names) ?? new Set<string>();
    through.set(reference.names, files.add(reference.file));
  }
  const holding = new Set(parents.values());

  const problems: Problem[] = [];
  for (const [id, files] of through) {
    const family = familyOf(records, id);
    if ((family !== 'apps' && family !== 'systems') || reached.has(id)) continue;
    const n = files.size;
    const first = holding.has(id) ? ', and first move or remove what is in it, since a piece of infrastructure holds nothing' : '';
    problems.push(
      warning(
        (records.get(id)?.[0] as RecordFile).file,
        START,
        'passes-on-only',
        `${n} ${n === 1 ? 'connection names' : 'connections name'} this ${nounOf(format, family)} in \`via\`, and no connection starts or ends at it ` +
          'or at anything in it. All it does is pass exchanges on, so it is a piece of infrastructure: move its file to `infrastructure/`, ' +
          `keeping only its \`name\`, \`description\`, \`technology\` and \`owner\`${first}. If it has work of its own, write the connection for that work.`,
      ),
    );
  }
  return problems;
}

/**
 * A store that holds messages on their way, or says nothing of what it holds, and has the name of
 * a technology it names, may be a message broker drawn as one store: every writer and every
 * reader ends at it, and nobody can tell what is handed to whom. The check reads the store's
 * name, kind and technologies, and no other words.
 */
export function brokerProblems(records: RecordsById, stores: readonly ModelRecord<Store>[], technologies: readonly ModelRecord<Technology>[]): Problem[] {
  const names = new Map(technologies.filter((technology) => records.get(technology.id)?.length === 1).map((technology) => [technology.id, technology.name]));
  const problems: Problem[] = [];
  for (const store of stores) {
    if (store.kind !== undefined && store.kind !== 'queue' && store.kind !== 'topic') continue;
    const technology = store.technology?.find((id) => {
      const name = names.get(id);
      return name !== undefined && sameName(name) === sameName(store.name);
    });
    if (technology === undefined) continue;
    const kind = store.kind === undefined ? 'it has no `kind`' : `it is of kind ${quote(store.kind)}`;
    problems.push(
      warning(
        store.file,
        START,
        'broker-as-store',
        `This store is named "${store.name}", as is ${quote(technology)}, a technology it names, and ${kind}: it may be a message broker drawn as one store. ` +
          'A broker is a technology. Each queue or topic in it is a store of its own, of kind `queue` or `topic`, with the broker as its `technology`. ' +
          'Write a store for each that the facts tell apart, move each connection to the one it puts into or takes from, ' +
          'and name what is left for what it holds, not for the broker. If this store is not a broker, give it a name that says what it holds.',
      ),
    );
  }
  return problems;
}

/** A name as the check of a broker compares it: in any case, with each run of spaces as one. */
function sameName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The two ends of a connection, as far as they are written as ids. */
interface Ends {
  from?: string;
  to?: string;
}

/** The ends of each connection, by its file, from the ids its `from` and `to` name. */
function endsOf(references: readonly Reference[]): Map<string, Ends> {
  const found = new Map<string, Ends>();
  for (const reference of references) {
    const side = reference.field === 'from' ? 'from' : reference.field === 'to' ? 'to' : undefined;
    if (side === undefined || folderOf(reference.file) !== CONNECTIONS) continue;
    const ends = found.get(reference.file) ?? {};
    ends[side] = reference.names;
    found.set(reference.file, ends);
  }
  return found;
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
