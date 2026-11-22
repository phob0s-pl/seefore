import { CURRENT_FORMAT, idProblem, nounOf, removalOf, wordsFor } from '@seefore/core';
import type { Left, Mention, Removal, UsedRecord } from '@seefore/core';
import { EXIT_OK, forShell, notStarted, openSource } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { count, fromHere, problemsInBrief } from './words.ts';

/**
 * What `seefore uses <id> --json` prints when a record has the id: the record, what is inside
 * it and every place that names either, as before, and the review of a removal.
 */
export interface UsesResult extends Removal {
  /** The source directory, as a full path with every link followed. */
  directory: string;
  errors: number;
  warnings: number;
}

/**
 * Shows what removing a record would mean: what goes with it, what must go or change, what
 * would be left behind, and which records may speak of it. An id that no record has is
 * answered as a command that could not start.
 */
export function uses(id: string, options: CheckOptions, io: Io): number {
  const opened = openSource(options, io, { verb: 'read', command: `uses ${forShell(id)}` });
  if (typeof opened === 'number') return opened;
  const { directory, loaded, problems, errors, warnings } = opened;

  const found = removalOf(loaded, id, { problems });
  if (!found) {
    const why = idProblem(id) ?? `No record has the id \`${id}\`.`;
    const broken = errors > 0 ? ' This directory has errors too: `seefore check` shows them.' : '';
    return notStarted(options.json, io, 'no-such-record', `${why} Run \`seefore list\` to see the records there are.${broken}`);
  }

  const result: UsesResult = { directory, ...found, errors, warnings };
  io.out(options.json ? JSON.stringify(result, null, 2) : report(result, loaded.unread.length, io.cwd));
  return EXIT_OK;
}

/** A record as a line: what it is, its id and name, and its file. */
type Head = (record: UsedRecord) => string;

/** A file of the source directory as a path to print. */
type Path = (file: string) => string;

/**
 * The answer as a person reads it: the record, then what goes with it, what must go or change,
 * what would be left behind and which records may speak of it, each under a sentence of its own.
 */
function report(result: UsesResult, unread: number, cwd: string): string {
  const path: Path = (file) => fromHere(cwd, result.directory, file);
  const head: Head = (record) => {
    const named = record.name === undefined ? '' : `: ${record.name}`;
    return `${nounOf(CURRENT_FORMAT, record.family)} ${record.id}${named} (${path(record.file)})`;
  };
  const blocks = [
    [head(result.record)],
    goesWith(result, head),
    mustChange(result, path),
    inherited(result.inherited),
    ...leftBehind(result, head),
    maySpeak(result, path),
    problems(result, unread),
  ];
  return blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join('\n'))
    .join('\n\n');
}

/** What is inside it, as a tree, and each connection with both ends in it. */
function goesWith(result: UsesResult, head: Head): string[] {
  const connections = result.goes.filter((record) => record.family === 'connections');
  const parts = [
    ...(result.inside.length > 0 ? [`${count(result.inside.length, 'record')} inside it`] : []),
    ...(connections.length > 0 ? [`${count(connections.length, 'connection')} with both ends in it`] : []),
  ];
  if (parts.length === 0) return holdsOthers(result.record.family) ? ['Goes with it: nothing is inside it.'] : [];

  const lines = [`Goes with it: ${parts.join(', and ')}:`];
  // What a thing is in comes before it, so its depth is known by then.
  const depth = new Map([[result.record.id, 0]]);
  for (const record of result.inside) {
    const level = (depth.get(record.in ?? '') ?? 0) + 1;
    depth.set(record.id, level);
    lines.push('  '.repeat(level) + head(record));
  }
  lines.push(...connections.map((record) => '  ' + head(record)));
  return lines;
}

/** Each record that names it and stays, with each place: what must go or change. */
function mustChange(result: UsesResult, path: Path): string[] {
  const { changes, record } = result;
  const n = changes.length;
  const each = n === 1 ? 'It' : 'Each';
  let heading: string;
  if (record.family === 'owners' || record.family === 'technologies') {
    const field = record.family === 'owners' ? 'owner' : 'technology';
    heading = n === 0 ? `No record names it in \`${field}\`.` : `${count(n, 'record')} ${n === 1 ? 'names' : 'name'} it in \`${field}\`. ${each} must name another in its place, or leave it out:`;
  } else if (changes.every((change) => change.record.family === 'connections')) {
    if (n === 0) heading = record.family === 'connections' ? 'Nothing names it.' : 'No connection has one end in it.';
    else heading = `${count(n, 'connection')} ${n === 1 ? 'has' : 'have'} one end in it. ${each} must go or get another end:`;
  } else {
    // Only a directory with errors names an element anywhere but in a connection.
    heading = `${count(n, 'record')} ${n === 1 ? 'names' : 'name'} it. ${each} must go or change:`;
  }

  const lines = [heading];
  for (const change of changes) {
    for (const place of change.places) {
      const names = place.names === record.id ? '' : ` names \`${place.names}\``;
      lines.push(`  ${path(place.file)}:${place.line}:${place.column}: \`${place.field}\`${names}`);
    }
  }
  return lines;
}

/** For an owner: how many parts take it from what they are in, and so have no `owner` to change. */
function inherited(parts: number): string[] {
  if (parts === 0) return [];
  return parts === 1
    ? ['1 more part takes it from what it is in. Its file holds no `owner` to change.']
    : [`${parts} more parts take it from what they are in. Their files hold no \`owner\` to change.`];
}

/**
 * What would be left behind, each part under a sentence that says what it assumes. Nothing is
 * said when the directory was not read in full.
 */
function leftBehind(result: UsesResult, head: Head): string[][] {
  if (!result.complete) return [];
  const asConnection = result.record.family === 'connections';
  // The connections with one end in it: those it is an end of, not those that name it as a technology.
  const crossing = result.changes.filter((change) => change.places.some((place) => place.field === 'from' || place.field === 'to')).length;
  const unconnected = result.left.filter((left) => left.reason === 'no-connection');
  const unusedFirst = result.left.filter((left) => left.reason === 'no-user' && left.assumes === 'connections-go');
  const unusedThen = result.left.filter((left) => left.assumes === 'left-go');
  const lines = (left: readonly Left[]): string[] => left.map((one) => '  ' + head(one.record));
  const are = (n: number): string => (n === 1 ? 'is' : 'are');

  const blocks: string[][] = [];
  const ifGone = asConnection || crossing === 1 ? 'If it goes' : 'If they go';
  if (unconnected.length > 0) {
    blocks.push([`${ifGone}, ${count(unconnected.length, 'record')} ${are(unconnected.length)} left with no connection:`, ...lines(unconnected)]);
  } else if (asConnection || crossing > 0) {
    blocks.push([`${ifGone}, nothing is left with no connection.`]);
  }
  if (unusedFirst.length > 0) {
    const by = crossing === 0 ? 'it' : crossing === 1 ? 'it and that connection' : 'it and those connections';
    blocks.push([`${count(unusedFirst.length, 'record')} ${are(unusedFirst.length)} named by nothing but ${by}:`, ...lines(unusedFirst)]);
  }
  if (unusedThen.length > 0) {
    const those = unconnected.length === 1 ? 'the record left with no connection goes' : `the ${unconnected.length} records left with no connection go`;
    const more = `${unusedThen.length} more ${unusedThen.length === 1 ? 'record' : 'records'}`;
    blocks.push([`If ${those} too, ${more} ${are(unusedThen.length)} named by nothing:`, ...lines(unusedThen)]);
  }
  return blocks;
}

/** Each name and description of a record that stays and may speak of it, with the words found. */
function maySpeak(result: UsesResult, path: Path): string[] {
  const searched = wordsFor(result.record).map((words) => `"${words}"`);
  const inside = result.inside.length > 0;
  const records = new Set(result.mentions.map((mention) => mention.file)).size;

  if (records === 0) {
    if (searched.length === 0 && !inside) return ['Its name and its id are too short to look for in text.'];
    const what = [...(searched.length > 0 ? [joined(searched, 'or')] : []), ...(inside ? ['the name or the id of anything inside it'] : [])];
    return [`No other record's name or description holds ${what.join(', or ')}.`];
  }

  const of = searched.length === 0 ? 'something inside it' : `it (${searched.join(', ')})${inside ? ' or of something inside it' : ''}`;
  const lines = [`${count(records, 'record')} may speak of ${of}. Read each:`];
  for (const text of byText(result.mentions)) {
    const words = joined(text.words.map((words) => `"${words}"`), 'and');
    lines.push(`  ${path(text.file)}:${text.line}:${text.column}: \`${text.field}\` says ${words}`);
  }
  return lines;
}

/** The mentions of each text as one, with every word found in it. */
function byText(mentions: readonly Mention[]): Mention[] {
  const texts: Mention[] = [];
  // The mentions of one text come together, since they are in order of file and place.
  for (const mention of mentions) {
    const last = texts.at(-1);
    if (last && last.file === mention.file && last.field === mention.field) {
      // The same words in another case are already there.
      last.words.push(...mention.words.filter((word) => !last.words.some((known) => known.toLowerCase() === word.toLowerCase())));
    } else {
      texts.push({ ...mention, words: [...mention.words] });
    }
  }
  return texts;
}

/** How many problems there are, and what they leave unknown. */
function problems(result: UsesResult, unread: number): string[] {
  const said: string[] = [];
  if (result.errors + result.warnings > 0) said.push(problemsInBrief(result.errors, result.warnings));
  // A file that cannot be read may name it too, and nobody can tell.
  if (unread > 0) said.push(`${count(unread, 'record')} could not be read, so what ${unread === 1 ? 'it names' : 'they name'} is not known.`);
  if (!result.complete) {
    const why = result.errors > 0 ? 'the directory has errors' : 'not every file was read';
    said.push(`Since ${why}, other uses may exist, and nothing is named as left behind.`);
  }
  return said.length > 0 ? [said.join(' ')] : [];
}

/** True when a record of this family can have others inside it, as a system and an app can. */
function holdsOthers(folder: string): boolean {
  return CURRENT_FORMAT.families.some((family) => family.record?.references.some((field) => field.field === 'in' && field.families.includes(folder)));
}

/** Joins words into "a", "a and b" or "a, b and c", with "or" in place of "and" when asked. */
function joined(words: readonly string[], and: string): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${and} ${words.at(-1)}`;
}
