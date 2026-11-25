import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ModelAnswer } from '../model/answer.ts';
import { fileURLToPath } from 'node:url';
import { readFolder, readTexts, writeRenamed } from './files.ts';
import { HOST, startServer } from './server.ts';
import { countLine, rulingsLine } from '../model/counts.ts';
import { readRenames, renameRecords } from '../model/rename.ts';
import type { Rename, RenameAccount } from '../model/rename.ts';

/** What the command was asked to do. */
export type Options = { server: boolean; check: boolean; json: boolean; workdir: string; port: number };

/** Where the command writes its lines. */
export type Io = { out: (line: string) => void; err: (line: string) => void };

/** The port when none is given. A fixed one lets `npm run dev` find the command. */
export const PORT = 4400;

/** The built page, found from this file, so that the command works from any folder. */
const PAGE = fileURLToPath(new URL('../../dist/ui/', import.meta.url));

const USAGE =
  'run it as "seefore --server [--workdir=<dir>] [--port=<n>]", "seefore check [--workdir=<dir>] [--json]" or "seefore rename <old> <new> [--workdir=<dir>] [--dry-run]"';

const RENAME_USAGE = 'run it as "seefore rename <old> <new> [--workdir=<dir>] [--dry-run]" or "seefore rename --list=<file> [--workdir=<dir>] [--dry-run]"';

/** What `seefore rename` was asked to do: the old id and the new, or a list of such lines in a file. */
export type RenameOptions = { workdir: string; dryRun: boolean; ids: string[]; list?: string };

/** Reads the options of `seefore rename`, the verb among them, or says what is wrong with them. */
export function readRenameOptions(args: readonly string[], cwd: string): RenameOptions | { error: string } {
  const options: RenameOptions = { workdir: cwd, dryRun: false, ids: [] };
  let verb = false;
  for (const arg of args) {
    if (arg === 'rename' && !verb) verb = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--workdir=')) {
      options.workdir = arg.slice('--workdir='.length);
      if (options.workdir === '') return { error: 'give a folder, as in --workdir=<dir>' };
    } else if (arg.startsWith('--list=')) {
      options.list = arg.slice('--list='.length);
      if (options.list === '') return { error: 'give a file, as in --list=<file>' };
    } else if (arg.startsWith('--')) return { error: `"${arg}" does not go with "rename"` };
    else options.ids.push(arg);
  }
  if (options.list !== undefined && options.ids.length > 0) return { error: 'give "<old> <new>" or "--list=<file>", not both' };
  if (options.list === undefined && options.ids.length !== 2) return { error: RENAME_USAGE };
  return options;
}

/** Reads the options, or says what is wrong with them. `cwd` is the folder without `--workdir`. */
export function readOptions(args: readonly string[], cwd: string): Options | { error: string } {
  const options: Options = { server: false, check: false, json: false, workdir: cwd, port: PORT };
  for (const arg of args) {
    if (arg === '--server') {
      options.server = true;
    } else if (arg === 'check') {
      options.check = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--workdir=')) {
      options.workdir = arg.slice('--workdir='.length);
      if (options.workdir === '') return { error: 'give a folder, as in --workdir=<dir>' };
    } else if (arg.startsWith('--port=')) {
      const text = arg.slice('--port='.length);
      const port = Number(text);
      if (!/^[0-9]+$/.test(text) || port < 1 || port > 65535) {
        return { error: `the port must be a number from 1 to 65535, not "${text}"` };
      }
      options.port = port;
    } else {
      return { error: `unknown option "${arg}"` };
    }
  }
  return options;
}

/**
 * Runs the command. It gives 1 when something is wrong, said in one line. Else it gives 0
 * once the server listens, and the server keeps running until the person stops it.
 */
export async function run(args: readonly string[], cwd: string, io: Io): Promise<number> {
  const fail = (message: string): number => {
    io.err(`seefore: ${message}`);
    return 1;
  };
  if (args.find((arg) => !arg.startsWith('--')) === 'rename') return rename(args, cwd, io, fail);
  const options = readOptions(args, cwd);
  if ('error' in options) return fail(options.error);
  if (options.server === options.check) return fail(USAGE);
  if (options.json && !options.check) return fail('--json goes with "check"');

  let model: ModelAnswer;
  try {
    model = await readFolder(options.workdir);
  } catch {
    return fail(`cannot read the folder "${options.workdir}"`);
  }
  if (!existsSync(join(options.workdir, 'seefore.yaml'))) return fail(`"${options.workdir}" is not a model: it has no seefore.yaml`);
  if (options.check) return check(model, options.json, io);
  if (!existsSync(join(PAGE, 'index.html'))) return fail('the page is not built; run "npm run build"');

  try {
    await startServer(options.workdir, PAGE, options.port);
  } catch (cause) {
    const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    if (code === 'EADDRINUSE') return fail(`port ${options.port} is taken`);
    return fail(`cannot listen on port ${options.port}`);
  }
  io.out(`seefore: ${model.records.length} ${model.records.length === 1 ? 'record' : 'records'} read from ${options.workdir}`);
  const count = model.problems.length;
  if (count > 0) io.out(`seefore: ${count} ${count === 1 ? 'problem' : 'problems'}; run "seefore check" to list them`);
  io.out(`seefore: http://${HOST}:${options.port}`);
  return 0;
}

/**
 * Renames records in the model's files, moves the files of those renamed and prints what it did.
 * With `--dry-run` it prints the same and writes nothing. A refusal prints its lines, and gives 1.
 */
async function rename(args: readonly string[], cwd: string, io: Io, fail: (message: string) => number): Promise<number> {
  const options = readRenameOptions(args, cwd);
  if ('error' in options) return fail(options.error);
  let renames: Rename[];
  if (options.list === undefined) renames = [{ old: options.ids[0] as string, new: options.ids[1] as string }];
  else {
    let text: string;
    try {
      text = await readFile(resolve(cwd, options.list), 'utf8');
    } catch {
      return fail(`cannot read the list "${options.list}"`);
    }
    const read = readRenames(text);
    if ('refusals' in read) return refuse(read.refusals, io);
    renames = read;
  }
  let files: Awaited<ReturnType<typeof readTexts>>;
  try {
    files = await readTexts(options.workdir);
  } catch {
    return fail(`cannot read the folder "${options.workdir}"`);
  }
  if (!existsSync(join(options.workdir, 'seefore.yaml'))) return fail(`"${options.workdir}" is not a model: it has no seefore.yaml`);
  const done = renameRecords(files, renames);
  if ('refusals' in done) return refuse(done.refusals, io);
  for (const line of renameLines(done.account)) io.out(line);
  if (options.dryRun) {
    io.out('A dry run: nothing is written.');
    return 0;
  }
  try {
    await writeRenamed(options.workdir, done.files, done.account.files);
  } catch {
    return fail(`cannot write the files in "${options.workdir}"`);
  }
  return 0;
}

/** Prints why a rename is refused, and gives 1. */
function refuse(refusals: readonly string[], io: Io): number {
  for (const refusal of refusals) io.err(`seefore: ${refusal}`);
  io.err('seefore: nothing is renamed');
  return 1;
}

/** What a rename did, in short lines: each record, each file with how many places were rewritten in it, what was left, and the prose. */
export function renameLines(account: RenameAccount): string[] {
  const lines: string[] = [];
  const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`;
  for (const each of account.renamed) lines.push(`${each.old} -> ${each.new}${each.follows !== undefined ? `, with its end ${each.follows}` : ''}`);
  for (const file of account.files) lines.push(`${file.from === file.to ? file.to : `${file.from} -> ${file.to}`}${file.places > 0 ? `: ${places(file.places)}` : ''}`);
  for (const each of account.left) lines.push(`${each.id} is left as it is: ${each.would} names its end, but ${each.why}`);
  for (const each of account.unsure) lines.push(`${each.file}:${each.line}: ${each.id} is left as it is: two records have that id`);
  for (const each of account.prose) lines.push(`${each.file}:${each.line}: in prose, left as it is: ${each.text}`);
  const rewritten = account.files.reduce((sum, file) => sum + file.places, 0);
  const records = account.renamed.length;
  lines.push(`${records} ${records === 1 ? 'record' : 'records'} renamed, ${places(rewritten)} rewritten in ${account.files.length} ${account.files.length === 1 ? 'file' : 'files'}.`);
  return lines;
}

/** Prints the problems and the counts of a model, and gives 1 when there is an error. */
function check(model: ModelAnswer, json: boolean, io: Io): number {
  const errors = model.problems.filter((problem) => problem.severity === 'error').length;
  const warnings = model.problems.length - errors;
  if (json) {
    const { folder, name, records, problems, counts, rulings } = model;
    io.out(JSON.stringify({ folder, name, records: records.length, errors, warnings, problems, counts, rulings }));
    return errors > 0 ? 1 : 0;
  }
  for (const problem of model.problems) {
    io.out(`${problem.file}:${problem.line}:${problem.column}: ${problem.severity}: ${problem.message}`);
    io.out(`  Mend: ${problem.fix}`);
  }
  if (model.problems.length > 0) io.out('');
  const many = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const summary = model.problems.length === 0 ? 'No problem of form.' : `${many(errors, 'error')}, ${many(warnings, 'warning')}.`;
  io.out(`${many(model.records.length, 'record')} read. ${summary}`);
  for (const count of model.counts) {
    const line = countLine(count);
    if (line !== undefined) io.out(line);
  }
  const rulings = rulingsLine(model.rulings);
  if (rulings !== undefined) io.out(rulings);
  return errors > 0 ? 1 : 0;
}
