import { dirname, isAbsolute, relative, sep } from 'node:path';
import { MARKER_FILE, compareProblems, load } from '@seefore/core';
import type { Problem } from '@seefore/core';
import { findSourceDirectoriesBelow, findSourceDirectory, isDirectory, onDisk, physical, readSourceFiles, withSlashes } from './directory.ts';
import type { Io } from './io.ts';

export interface CheckOptions {
  workdir?: string;
  json: boolean;
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
}

/** What `seefore check --json` prints when it could not start. */
export interface Failure {
  error: {
    /** `usage`, `not-a-directory`, `folder-unreadable`, `no-source-directory` or `unexpected`. */
    code: string;
    message: string;
    /** With `no-source-directory`: the starting folder as it really is on disk. */
    start?: string;
    /** Source directories found below the starting folder, as full paths. */
    below?: string[];
  };
}

/** Exit codes: nothing wrong, errors found, could not start. */
export const EXIT_OK = 0;
export const EXIT_ERRORS = 1;
export const EXIT_NOT_STARTED = 2;

/** Reads the source directory and reports what is wrong with it. Returns the exit code. */
export function check(options: CheckOptions, io: Io): number {
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
    const none = `There is no seefore.yaml in \`${start}\` or in any folder above it, so there is no source directory to check.`;
    const shown = below.map((path) => forShell(withSlashes(relative(io.cwd, path)) || '.'));
    const advice =
      below.length === 0
        ? 'To start one, use the `init` skill of the seefore plugin.'
        : below.length === 1
          ? `There is one below it. To check it, run: seefore check --workdir=${shown[0]}`
          : `There are ${below.length} below it. To check one, run seefore check with one of: ${shown.map((path) => `--workdir=${path}`).join(', ')}`;
    return notStarted(options.json, io, 'no-source-directory', `${none} ${advice}`, { start, below });
  }
  const { directory } = found;

  const read = readSourceFiles(directory);
  const loaded = load(read.files);
  const linked = read.problems.some((problem) => problem.code === 'marker-link');
  const problems = [
    ...read.problems,
    // A marker that is a link is already reported as such; "there is no marker" would mislead.
    ...loaded.problems.filter((problem) => !(linked && problem.code === 'marker-missing')),
  ];

  const above = dirname(directory) === directory ? undefined : findSourceDirectory(dirname(directory));
  const outer = above && 'directory' in above ? above.directory : undefined;
  if (outer) {
    problems.push({
      file: MARKER_FILE,
      line: 1,
      column: 1,
      severity: 'error',
      code: 'marker-nested',
      message: `This source directory sits inside another one, at \`${outer}\`. A source directory cannot sit inside another.`,
    });
  }

  problems.sort(compareProblems);
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.length - errors;

  const result: CheckResult = {
    directory,
    name: loaded.marker?.name ?? null,
    format: loaded.marker?.format ?? null,
    records: loaded.records.length,
    errors,
    warnings,
    problems,
  };

  if (options.json) io.out(JSON.stringify(result, null, 2));
  else io.out(report(result, io.cwd));

  return errors > 0 ? EXIT_ERRORS : EXIT_OK;
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

/** The result as a person reads it: a heading, each problem on a line, and a count. */
function report(result: CheckResult, cwd: string): string {
  const lines: string[] = [];
  lines.push(result.name ?? '(no name: the marker file could not be read)');
  lines.push(`${result.format === null ? 'format unknown' : `format ${result.format}`}, ${result.directory}`);
  lines.push('');

  for (const problem of result.problems) {
    const path = withSlashes(relative(cwd, onDisk(result.directory, problem.file))) || '.';
    lines.push(`${path}:${problem.line}:${problem.column}: ${problem.severity}: ${problem.message}`);
  }
  if (result.problems.length > 0) lines.push('');

  const read = `${count(result.records, 'record')} read.`;
  const found =
    result.problems.length === 0
      ? 'No problems.'
      : `${count(result.errors, 'error')}, ${count(result.warnings, 'warning')}.`;
  lines.push(`${read} ${found}`);
  return lines.join('\n');
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Writes a path so that a shell takes it as one word. */
function forShell(path: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(path)) return path;
  return '"' + path.replace(/(["\\$`])/g, '\\$1') + '"';
}
