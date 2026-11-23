import { dirname, isAbsolute, relative, sep } from 'node:path';
import { C4_CODES, MARKER_FILE, c4Line, compareProblems, load } from '@seefore/core';
import type { C4Check, C4Code, C4Report, Loaded, Problem } from '@seefore/core';
import { findSourceDirectoriesBelow, findSourceDirectory, isDirectory, physical, readSourceFiles, withSlashes } from './directory.ts';
import type { Io } from './io.ts';
import { count, fromHere, seefore } from './words.ts';
import type { Here } from './words.ts';

/** Where to start looking, and whether to answer as data. Every command takes these. */
export interface CheckOptions {
  workdir?: string;
  json: boolean;
}

/** A command, so that a hint to run it from elsewhere names it. */
export interface Rerun {
  /** What the command does to a source directory, as in `check`. */
  verb: string;
  /** The command with what it takes, as it would be run again: `check`, `uses order-api`. */
  command: string;
}

const CHECK: Rerun = { verb: 'check', command: 'check' };

/** What `seefore check` takes besides what every command does. */
export interface CheckCommandOptions extends CheckOptions {
  /** List what each C4 check found, beneath its line. */
  full: boolean;
  /** End with 1 unless every connection has a name that says more than "Uses", as a pipeline that publishes pictures may ask. */
  requireNames: boolean;
}

/** A source directory that was found and read. */
export interface Opened {
  /** The source directory, as a full path with every link followed. */
  directory: string;
  /** What the core library made of its files. */
  loaded: Loaded;
  /** What reading the disk found wrong and what the core library found, in order of file and place. */
  problems: Problem[];
  errors: number;
  warnings: number;
}

/** What `seefore check --json` prints when it could read a source directory. */
export interface CheckResult {
  /** The source directory, as a full path with every link followed. */
  directory: string;
  /** The name in the marker file, or null when the marker could not be read. */
  name: string | null;
  /** The format in the marker file, or null when the marker could not be read. */
  format: number | null;
  /** How many records were read. */
  records: number;
  errors: number;
  warnings: number;
  /** Each problem, with its file as a path from the source directory. */
  problems: Problem[];
  /** What the C4 checks looked at and found. Its warnings are among the problems too. */
  c4: C4Report;
  /** With `--require-names`: whether the names are there that a pipeline publishing pictures asks for, and the counts it rests on. */
  requireNames?: RequireNames;
}

/** What `--require-names` asks for, and what it found. */
export interface RequireNames {
  /** True when there is no error, the directory was read in full, there is a connection, and each has a name that is not the bare "Uses". */
  met: boolean;
  /** Whether the directory was read in full. */
  complete: boolean;
  /** How many connections were read. */
  connections: number;
  /** How many of them have no name. */
  unnamed: number;
  /** How many are named only "Uses". */
  vague: number;
}

/** What a command prints with `--json` when it could not start, or could not find the record it was asked about. */
export interface Failure {
  error: {
    /** `usage`, `not-a-directory`, `folder-unreadable`, `no-source-directory`, `no-such-record`, `id-twice` or `unexpected`. */
    code: string;
    message: string;
    /** With `no-source-directory`: the starting folder as it really is on disk. */
    start?: string;
    /** Source directories found below the starting folder, as full paths. */
    below?: string[];
  };
}

/** Exit codes: nothing wrong, errors found, could not start or found nothing to show. */
export const EXIT_OK = 0;
export const EXIT_ERRORS = 1;
export const EXIT_NOT_STARTED = 2;

/**
 * Reads the source directory, reports what is wrong with it, and counts what the C4 checks
 * found. Returns the exit code. What the checks found never changes it, unless names are
 * required and are not all there.
 */
export function check(options: CheckCommandOptions, io: Io): number {
  const opened = openSource(options, io);
  if (typeof opened === 'number') return opened;
  const { directory, loaded, problems, errors, warnings } = opened;

  const names = options.requireNames ? requireNames(loaded.c4, errors) : undefined;
  const result: CheckResult = {
    directory,
    name: loaded.marker?.name ?? null,
    format: loaded.marker?.format ?? null,
    records: loaded.records.length,
    errors,
    warnings,
    problems,
    c4: loaded.c4,
    ...(names === undefined ? {} : { requireNames: names }),
  };

  const here: Here = { cwd: io.cwd, directory, workdir: options.workdir };
  if (options.json) io.out(JSON.stringify(result, null, 2));
  else io.out(report(result, here, options.full));

  return errors > 0 || names?.met === false ? EXIT_ERRORS : EXIT_OK;
}

/** What `--require-names` finds: the counts of the two checks of names, and whether they meet it. */
function requireNames(c4: C4Report, errors: number): RequireNames {
  // A check that was not run read no connection.
  const connections = c4['connection-unnamed'].checked ?? 0;
  const unnamed = c4['connection-unnamed'].findings.length;
  const vague = c4['connection-vague'].findings.length;
  const met = errors === 0 && c4.complete && connections > 0 && unnamed === 0 && vague === 0;
  return { met, complete: c4.complete, connections, unnamed, vague };
}

/**
 * Finds the source directory from where the options say, reads it, and gathers every problem
 * in it. When it cannot start, it says why and gives back the exit code instead.
 */
export function openSource(options: CheckOptions, io: Io, rerun: Rerun = CHECK): Opened | number {
  const directory = findSource(options, io, rerun);
  return typeof directory === 'number' ? directory : readSource(directory);
}

/**
 * Finds the source directory from where the options say, as a full path with every link
 * followed. When it cannot, it says why and gives back the exit code instead.
 */
export function findSource(options: CheckOptions, io: Io, rerun: Rerun = CHECK): string | number {
  // The path is handed to the system as it was given, without tidying it first. Tidying
  // would apply a `..` before following a link, and so look in a different place than the
  // one a file written to that path would land in.
  const given = options.workdir ?? '.';
  const asked = isAbsolute(given) ? given : io.cwd + sep + given;
  if (!isDirectory(asked)) {
    return notStarted(options.json, io, 'not-a-directory', `\`${asked}\` is not a directory.`);
  }
  const start = physical(asked);

  const found = findSourceDirectory(start);
  if (found && 'unreadable' in found) {
    return notStarted(
      options.json,
      io,
      'folder-unreadable',
      `\`${found.unreadable}\` could not be read (${found.reason}), so seefore cannot tell whether it is a source directory.`,
    );
  }
  if (!found) {
    const below = findSourceDirectoriesBelow(start);
    const { verb, command } = rerun;
    const none = `There is no seefore.yaml in \`${start}\` or in any folder above it, so there is no source directory to ${verb}.`;
    const shown = below.map((path) => forShell(withSlashes(relative(io.cwd, path)) || '.'));
    const advice =
      below.length === 0
        ? 'To start one, use the `init` skill of the seefore plugin.'
        : below.length === 1
          ? `There is one below it. To ${verb} it, run: seefore ${command} --workdir=${shown[0]}`
          : `There are ${below.length} below it. To ${verb} one, run seefore ${command} with one of: ${shown.map((path) => `--workdir=${path}`).join(', ')}`;
    return notStarted(options.json, io, 'no-source-directory', `${none} ${advice}`, { start, below });
  }
  return found.directory;
}

/**
 * Reads a source directory that was found, and gathers every problem in it. What reading the
 * disk found is gathered first and handed to the core library, so that the C4 checks know
 * whether the directory was read in full.
 */
export function readSource(directory: string): Opened {
  const read = readSourceFiles(directory);
  const found = [...read.problems];

  const above = dirname(directory) === directory ? undefined : findSourceDirectory(dirname(directory));
  const outer = above && 'directory' in above ? above.directory : undefined;
  if (outer) {
    found.push({
      file: MARKER_FILE,
      line: 1,
      column: 1,
      severity: 'error',
      code: 'marker-nested',
      message: `This source directory sits inside another one, at \`${outer}\`. A source directory cannot sit inside another.`,
    });
  }

  const loaded = load(read.files, { problems: found });
  const problems = [...found, ...loaded.problems];
  problems.sort(compareProblems);
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  return { directory, loaded, problems, errors, warnings: problems.length - errors };
}

/** Says why seefore could not start: as data on the output when asked, or else in words. */
export function notStarted(json: boolean, io: Io, code: string, message: string, more: { start?: string; below?: string[] } = {}): number {
  const failure: Failure = {
    error: {
      code,
      message,
      ...(more.start === undefined ? {} : { start: more.start }),
      ...(more.below && more.below.length > 0 ? { below: more.below } : {}),
    },
  };
  if (json) io.out(JSON.stringify(failure, null, 2));
  else io.err(`seefore: ${message}`);
  return EXIT_NOT_STARTED;
}

/**
 * The result as a person reads it: a heading, each problem on a line, what the C4 checks
 * looked at and found, how `--require-names` ended, and a count. With `full`, each note follows
 * the line of its check; a warning is not written again, since it stands among the problems.
 */
function report(result: CheckResult, here: Here, full: boolean): string {
  const lines: string[] = [];
  lines.push(result.name ?? '(no name: the marker file could not be read)');
  lines.push(`${result.format === null ? 'format unknown' : `format ${result.format}`}, ${result.directory}`);
  lines.push('');

  const at = (file: string, line: number, column: number): string => `${fromHere(here.cwd, result.directory, file)}:${line}:${column}`;
  for (const problem of result.problems) lines.push(`${at(problem.file, problem.line, problem.column)}: ${problem.severity}: ${problem.message}`);
  if (result.problems.length > 0) lines.push('');

  lines.push('C4 checks, which count what the model lacks:');
  for (const code of C4_CODES) {
    const check = result.c4[code];
    lines.push(`- ${c4Line(result.c4, code)}`);
    if (full && check.severity === 'note') for (const finding of check.findings) lines.push(`${at(finding.file, finding.line, finding.column)}: note: ${finding.message}`);
  }
  // The line that sends the reader on is for a run that found a note and did not list it. A
  // warning stands among the problems already, and `--full` would add nothing to it.
  if (!full && notesIn(result.c4)) lines.push(`\`${seefore('check --full', here)}\` lists each.`);
  lines.push('');

  const names = result.requireNames;
  if (names !== undefined) lines.push(namesSaid(names, result.c4, here, full), '');

  const read = `${count(result.records, 'record')} read.`;
  const found =
    result.problems.length === 0
      ? 'No problems.'
      : `${count(result.errors, 'error')}, ${count(result.warnings, 'warning')}.`;
  lines.push(`${read} ${found}`);
  return lines.join('\n');
}

/** Whether a check whose findings are notes found something. */
function notesIn(c4: C4Report): boolean {
  return C4_CODES.some((code) => c4[code].severity === 'note' && c4[code].findings.length > 0);
}

/**
 * How `--require-names` ended, as one paragraph: that the names are all there, or the first of
 * its conditions that does not hold, that the run fails, and where to look. When part of the
 * directory was left out, what was counted among the connections that were read follows.
 */
function namesSaid(names: RequireNames, c4: C4Report, here: Here, full: boolean): string {
  if (names.met) return 'Names are required: every connection has one, and none is only "Uses".';
  const fails = 'This run fails.';
  if (!names.complete) {
    // When the marker cannot say which format the records are in, none of them was read.
    const recordsRead = C4_CODES.some((code) => c4[code].checked !== null);
    const why = recordsRead ? 'part of the directory was left out, as the problems above say' : 'the records were not read, as the problems above say';
    const counted = lacking(names, false);
    return [`Names are required, and ${why}.`, fails, ...(counted === '' ? [] : [`Of the connections read, ${counted}.`])].join(' ');
  }
  if (names.connections === 0) return `Names are required, and there is no connection to check. ${fails}`;
  // With `--full` each is listed above already, as the block leaves out its line that sends the reader on.
  const lists = full ? [] : [`\`${seefore('check --full', here)}\` ${names.unnamed + names.vague === 1 ? 'lists it' : 'lists them'}.`];
  return [`Names are required: ${lacking(names, true)}.`, fails, ...lists].join(' ');
}

/**
 * How many connections have no name and how many are named only "Uses", as "1 connection has no
 * name, and 2 are named only "Uses"", or with no noun at all when the sentence names the
 * connections already. Empty when there are none of either.
 */
function lacking(names: RequireNames, noun: boolean): string {
  const said: string[] = [];
  // After the first count, "connection" goes without saying.
  const which = (n: number) => (noun && said.length === 0 ? count(n, 'connection') : String(n));
  if (names.unnamed > 0) said.push(`${which(names.unnamed)} ${names.unnamed === 1 ? 'has' : 'have'} no name`);
  if (names.vague > 0) said.push(`${which(names.vague)} ${names.vague === 1 ? 'is' : 'are'} named only "Uses"`);
  return said.join(', and ');
}

/** Writes a path, or any word, so that a shell takes it as one word. */
export function forShell(path: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(path)) return path;
  return '"' + path.replace(/(["\\$`])/g, '\\$1') + '"';
}
