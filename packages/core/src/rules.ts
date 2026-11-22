import { nounOf, oneOf, referenceField } from './format.ts';
import type { Format } from './format.ts';
import type { RecordFile, Reference } from './load.ts';
import { ownership } from './model.ts';
import type { Model, ModelRecord } from './model.ts';
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
 * Followed upwards, it goes from a component to its app and on to its system, from a store to
 * the app that keeps it or to its system, and from a piece of infrastructure to its system. So
 * every check that follows it takes a kept store to its app's system. Since each kind may be in
 * only a kind above it, nothing can come to be in itself.
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
 * The rule of what a connection passes through. Each id in `via` stands between the two ends,
 * so one that names an end, what an end is in, or what is in an end is an error, at that id.
 */
export function viaProblems(format: Format, records: RecordsById, parents: ReadonlyMap<string, string>, references: readonly Reference[]): Problem[] {
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
 * Taking the id out may leave the list empty, which is an error of its own, so each way out says
 * what to do then.
 */
function endInVia(parents: ReadonlyMap<string, string>, id: string, ends: Ends): string | undefined {
  const named = `\`via\` names ${quote(id)}`;
  const between = 'What a connection passes through stands between its two ends.';
  const takeOut = `Take ${quote(id)} out of \`via\`. If nothing is left in the list, take the \`via\` key out too.`;
  for (const side of ['from', 'to'] as const) {
    const end = ends[side];
    if (end === undefined) continue;
    const theEnd = `the ${quote(side)} of this connection`;
    if (end === id) return `${named}, which is ${theEnd}. ${between} ${takeOut}`;
    if (upwards(parents, end).includes(id)) return `${named}, which ${quote(end)}, ${theEnd}, is in. ${between} ${takeOut}`;
    if (upwards(parents, id).includes(end)) {
      const further =
        side === 'to'
          ? `if the exchange goes on past it, make the part of ${quote(end)} that it ends at the \`to\``
          : `if the exchange starts before it, make the part of ${quote(end)} that it starts at the \`from\``;
      return `${named}, which is in ${quote(end)}, ${theEnd}. ${between} ${takeOut} Or, ${further}.`;
    }
  }
  return undefined;
}

/**
 * The check of what only passes on. An app or a system that connections of the model name in
 * `via`, and that is the end of none of them, nor is anything in it, may do nothing but pass
 * exchanges on: a piece of infrastructure written as an app or a system. The warning says what
 * it saw and asks, since only the person can say what the thing does. It counts only the
 * connections of the model: one with an error in its file is not read right, so it neither
 * stands for work of its own nor names a thing that only passes on. A component that only
 * passes on may keep its record, so it is not looked at.
 */
export function passesOnOnlyProblems(format: Format, records: RecordsById, parents: ReadonlyMap<string, string>, model: Model): Problem[] {
  // Every end of a connection, and everything it is in, to the top. Any one connection ends the
  // warning, a check that it is up or a reload as much as work of its own, as the spec has it: a
  // connection may start or end at a piece of infrastructure too, and only words could tell one
  // that the piece makes on its own account from one for work that an app does.
  const reached = new Set<string>();
  for (const connection of model.connections) {
    for (const end of [connection.from, connection.to]) for (const id of upwards(parents, end)) reached.add(id);
  }
  // How many connections name each id in `via`. A connection of the model names an id there once.
  const through = new Map<string, number>();
  for (const connection of model.connections) for (const id of connection.via ?? []) through.set(id, (through.get(id) ?? 0) + 1);

  const problems: Problem[] = [];
  for (const [id, n] of through) {
    const family = familyOf(records, id);
    if ((family !== 'apps' && family !== 'systems') || reached.has(id)) continue;
    const noun = nounOf(format, family);
    problems.push(
      warning(
        (records.get(id)?.[0] as RecordFile).file,
        START,
        'passes-on-only',
        `${n} ${n === 1 ? 'connection names' : 'connections name'} this ${noun} in \`via\`, and no connection starts or ends at it or at anything in it. ` +
          `Does passing exchanges on account for everything this ${noun} does? If so, it is a piece of infrastructure, a record in \`infrastructure/\`, ` +
          `which is in nothing and holds nothing.${movingOut(id, parents, model)} If it has work of its own, a connection for that work ends the warning.`,
      ),
    );
  }
  return problems;
}

/**
 * What moving a record to `infrastructure/` would mean, by what it holds, as sentences that each
 * start with a space, or nothing. What is in it has to go elsewhere first, its kept stores too,
 * and its parts then no longer take its owner. An app with no `owner` of its own no longer takes
 * that of the system it is in. An `external` mark does not go with it, since a piece of
 * infrastructure has none.
 */
function movingOut(id: string, parents: ReadonlyMap<string, string>, model: Model): string {
  const owners = ownership(model);
  const said: string[] = [];
  if ([...parents.values()].includes(id)) {
    const taking = [...owners].some(([part, found]) => part !== id && found.from === id);
    said.push(`To move it there, what is in it has to go elsewhere first${taking ? ', and its parts then no longer take its owner' : ''}.`);
  }
  const from = owners.get(id)?.from;
  if (from !== undefined && from !== id) said.push(`There it no longer takes the owner of ${quote(from)}.`);
  if (model.systems.some((system) => system.id === id && system.external === true)) said.push('Its `external` mark does not go with it.');
  return said.map((sentence) => ` ${sentence}`).join('');
}

/**
 * A store that holds messages on their way, or says nothing of what it holds, and has the name of
 * a technology it names, may be a message broker drawn as one store: every writer and every
 * reader ends at it, and nobody can tell what is handed to whom. The check compares two names
 * of the model, the store's and its technology's, and reads no other words: it holds no list of
 * brokers. The message says what it compared, and tells the connections that use a queue or a
 * topic from those that manage the broker itself.
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
    const named = names.get(technology) as string;
    // The technology's name is shown only where it is written otherwise, as in another case.
    const its = named === store.name ? quote(technology) : `${quote(technology)}, "${named}"`;
    const kind = store.kind === undefined ? 'it has no `kind`' : `it is of kind ${quote(store.kind)}`;
    const notBroker = store.kind === undefined ? 'name it for what it holds and give it its `kind`' : 'name it for what it holds';
    problems.push(
      warning(
        store.file,
        START,
        'broker-as-store',
        `This store's \`name\`, "${store.name}", is the \`name\` of ${its}, a technology it names, and ${kind}: it may be a message broker drawn as one store. ` +
          'A broker is a technology. Each queue or topic in it is a store of its own, of kind `queue` or `topic`, with the broker as its `technology`: ' +
          'write one for each that the facts tell apart. A connection that puts a message in or takes one out then goes to the queue or topic it uses. ' +
          'One that manages the broker itself, such as one that creates topics, stays with what is left, named for what it holds. ' +
          `If this store is no broker, ${notBroker}.`,
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
