import { CURRENT_FORMAT, idProblem, nounOf, usesOf } from '@seefore/core';
import type { Reference, UsedRecord } from '@seefore/core';
import { EXIT_OK, forShell, notStarted, openSource } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { count, fromHere, problemsInBrief } from './words.ts';

/** What `seefore uses <id> --json` prints when a record has the id. */
export interface UsesResult {
  /** The source directory, as a full path with every link followed. */
  directory: string;
  /** The record asked about. */
  record: UsedRecord;
  /** Everything inside it, to the bottom. A thing comes before what is inside it. */
  inside: UsedRecord[];
  /** Every place where a record names it or something inside it. */
  references: Reference[];
  errors: number;
  warnings: number;
}

/**
 * Shows what removing a record would break: the record, everything inside it, and every place
 * that names either. An id that no record has is answered as a command that could not start.
 */
export function uses(id: string, options: CheckOptions, io: Io): number {
  const opened = openSource(options, io, { verb: 'read', command: `uses ${forShell(id)}` });
  if (typeof opened === 'number') return opened;
  const { directory, loaded, errors, warnings } = opened;

  const found = usesOf(loaded, id);
  if (!found) {
    const why = idProblem(id) ?? `No record has the id \`${id}\`.`;
    const broken = errors > 0 ? ' This directory has errors too: `seefore check` shows them.' : '';
    return notStarted(options.json, io, 'no-such-record', `${why} Run \`seefore list\` to see the records there are.${broken}`);
  }

  const result: UsesResult = { directory, ...found, errors, warnings };
  io.out(options.json ? JSON.stringify(result, null, 2) : report(result, loaded.unread.length, io.cwd));
  return EXIT_OK;
}

/** The answer as a person reads it: the record, what is inside it as a tree, and each place that names them. */
function report(result: UsesResult, unread: number, cwd: string): string {
  const head = (record: UsedRecord): string => {
    const named = record.name === undefined ? '' : `: ${record.name}`;
    return `${nounOf(CURRENT_FORMAT, record.family)} ${record.id}${named} (${fromHere(cwd, result.directory, record.file)})`;
  };

  const lines = [head(result.record)];
  if (result.inside.length > 0) {
    lines.push('', `${count(result.inside.length, 'record')} ${result.inside.length === 1 ? 'is' : 'are'} inside it:`);
    // What a thing is in comes before it, so its depth is known by then.
    const depth = new Map([[result.record.id, 0]]);
    for (const record of result.inside) {
      const level = (depth.get(record.in ?? '') ?? 0) + 1;
      depth.set(record.id, level);
      lines.push('  '.repeat(level) + head(record));
    }
  }

  lines.push('');
  const what = result.inside.length > 0 ? 'it or anything inside it' : 'it';
  if (result.references.length === 0) {
    lines.push(`Nothing names ${what}.`);
  } else {
    lines.push(`${count(result.references.length, 'place')} ${result.references.length === 1 ? 'names' : 'name'} ${what}:`);
    for (const reference of result.references) {
      const place = `${fromHere(cwd, result.directory, reference.file)}:${reference.line}:${reference.column}`;
      lines.push(`  ${place}: \`${reference.field}\` names \`${reference.names}\`.`);
    }
  }

  if (result.errors + result.warnings > 0) {
    // A file that cannot be read may name it too, and nobody can tell.
    const unknown = unread === 0 ? '' : ` ${count(unread, 'record')} could not be read, so what ${unread === 1 ? 'it names' : 'they name'} is not known.`;
    lines.push('', problemsInBrief(result.errors, result.warnings) + unknown);
  }
  return lines.join('\n');
}
