import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelAnswer } from '../model/answer.ts';
import { fileURLToPath } from 'node:url';
import { readFolder } from './files.ts';
import { HOST, startServer } from './server.ts';

/** What the command was asked to do. */
export type Options = { server: boolean; workdir: string; port: number };

/** Where the command writes its lines. */
export type Io = { out: (line: string) => void; err: (line: string) => void };

/** The port when none is given. A fixed one lets `npm run dev` find the command. */
export const PORT = 4400;

/** The built page, found from this file, so that the command works from any folder. */
const PAGE = fileURLToPath(new URL('../../dist/ui/', import.meta.url));

const USAGE = 'run it as "seefore --server [--workdir=<dir>] [--port=<n>]"';

/** Reads the options, or says what is wrong with them. `cwd` is the folder without `--workdir`. */
export function readOptions(args: readonly string[], cwd: string): Options | { error: string } {
  const options: Options = { server: false, workdir: cwd, port: PORT };
  for (const arg of args) {
    if (arg === '--server') {
      options.server = true;
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
  if (!options.server) return fail(USAGE);

  let model: ModelAnswer;
  try {
    model = await readFolder(options.workdir);
  } catch {
    return fail(`cannot read the folder "${options.workdir}"`);
  }
  if (!existsSync(join(options.workdir, 'seefore.yaml'))) return fail(`"${options.workdir}" is not a model: it has no seefore.yaml`);
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
