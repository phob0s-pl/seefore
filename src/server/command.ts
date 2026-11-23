import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelAnswer } from '../model/answer.ts';
import { fileURLToPath } from 'node:url';
import { readFolder } from './files.ts';
import { HOST, startServer } from './server.ts';

/** What the command was asked to do. */
export type Options = { server: boolean; check: boolean; json: boolean; workdir: string; port: number };

/** Where the command writes its lines. */
export type Io = { out: (line: string) => void; err: (line: string) => void };

/** The port when none is given. A fixed one lets `npm run dev` find the command. */
export const PORT = 4400;

/** The built page, found from this file, so that the command works from any folder. */
const PAGE = fileURLToPath(new URL('../../dist/ui/', import.meta.url));

const USAGE = 'run it as "seefore --server [--workdir=<dir>] [--port=<n>]" or "seefore check [--workdir=<dir>] [--json]"';

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
  const options = readOptions(args, cwd);
  const fail = (message: string): number => {
    io.err(`seefore: ${message}`);
    return 1;
  };
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
  if (count > 0) io.out(`seefore: ${count} ${count === 1 ? 'problem' : 'problems'}; the page lists them`);
  io.out(`seefore: http://${HOST}:${options.port}`);
  return 0;
}

/** Prints the problems and the counts of a model, and gives 1 when there is an error. */
function check(model: ModelAnswer, json: boolean, io: Io): number {
  const errors = model.problems.filter((problem) => problem.severity === 'error').length;
  const warnings = model.problems.length - errors;
  if (json) {
    const { folder, name, records, problems, counts } = model;
    io.out(JSON.stringify({ folder, name, records: records.length, errors, warnings, problems, counts }));
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
    if (count.checked === null) io.out('Not counted: owners and technologies that nothing names, since a file could not be read.');
    else if (count.found.length > 0) {
      const names = count.found.map((item) => `\`${item.record}\``).join(', ');
      io.out(`${count.found.length === 1 ? '1 owner or technology' : `${count.found.length} owners or technologies`} that nothing names: ${names}.`);
    }
  }
  return errors > 0 ? 1 : 0;
}
