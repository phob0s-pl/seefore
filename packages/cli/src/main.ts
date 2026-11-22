import { parseArgs } from 'node:util';
import { EXIT_OK, check, notStarted } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { list } from './list.ts';
import { uses } from './uses.ts';

/** Set when the command is built. Missing when it runs straight from source. */
declare const SEEFORE_VERSION: string | undefined;

export const VERSION: string = typeof SEEFORE_VERSION === 'string' ? SEEFORE_VERSION : 'dev';

const COMMANDS = ['check', 'list', 'uses'];

export const HELP = `seefore: design software architecture on the C4 model, kept as files in Git.

Usage:
  seefore check [--workdir=<directory>] [--json]
  seefore list [--workdir=<directory>] [--full] [--json]
  seefore uses <id> [--workdir=<directory>] [--json]
  seefore --help
  seefore --version

Commands:
  check    Read the source directory and report what is wrong with it.
  list     List the model: people, systems with what is in them, connections under
           what they start from, owners and technologies. Each description shows its
           first sentence. A record with an error in its file is left out.
  uses     Show what removing a record would break: the record, everything inside it,
           and every place that names either.

Options:
  --workdir=<directory>   Where to start looking. Without it, the current directory.
  --full                  For list: show each description whole, beneath its record.
  --json                  Print the result as data.

seefore looks for seefore.yaml in the starting directory, then in each folder above it.
The first folder that has one is the source directory.

Exit code:
  0   check found no errors, or list or uses did its work.
  1   check found errors.
  2   seefore could not start, or uses was given an id that no record has.`;

/** Runs the command with the given arguments and returns its exit code. */
export function main(argv: readonly string[], io: Io): number {
  // Known before the options are parsed, so that a mistake in them is still answered as data.
  const json = argv.includes('--json');
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        workdir: { type: 'string' },
        full: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', default: false },
      },
    });
  } catch (cause) {
    return usage(json, io, optionProblem(cause));
  }

  const { values, positionals } = parsed;
  if (values.help) {
    io.out(json ? JSON.stringify({ help: HELP }, null, 2) : HELP);
    return EXIT_OK;
  }
  if (values.version) {
    io.out(json ? JSON.stringify({ version: VERSION }, null, 2) : `seefore ${VERSION}`);
    return EXIT_OK;
  }

  const [command, ...rest] = positionals;
  if (command === undefined) {
    if (json) return usage(json, io, `No command was given. The commands are: ${COMMANDS.join(', ')}.`);
    io.out(HELP);
    return EXIT_OK;
  }

  const options: CheckOptions = { ...(values.workdir === undefined ? {} : { workdir: values.workdir }), json: values.json };
  if (values.full && command !== 'list' && COMMANDS.includes(command)) return usage(json, io, '`--full` is an option of `seefore list` only.');
  switch (command) {
    case 'check':
    case 'list':
      if (rest.length > 0) {
        return usage(json, io, `\`seefore ${command}\` takes no names after it, but got \`${rest.join(' ')}\`. Use --workdir=<directory> to say where to look.`);
      }
      return command === 'check' ? check(options, io) : list({ ...options, full: values.full }, io);
    case 'uses': {
      const [id, ...more] = rest;
      if (id === undefined) return usage(json, io, '`seefore uses` needs the id of a record, as in `seefore uses order-api`.');
      if (more.length > 0) return usage(json, io, `\`seefore uses\` takes one id, but got \`${rest.join(' ')}\`.`);
      return uses(id, options, io);
    }
    default:
      return usage(json, io, `\`${command}\` is not a seefore command. The commands are: ${COMMANDS.join(', ')}.`);
  }
}

/** Says in plain words what was wrong with the options, from the error Node's parser threw. */
function optionProblem(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
  const option = /'(-{1,2}[^'\s=]+)/.exec(message)?.[1];
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' && option) return `\`${option}\` is not an option of seefore.`;
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && option) {
    return option === '--workdir'
      ? '`--workdir` needs a directory, as in --workdir=<directory>.'
      : `\`${option}\` takes no value.`;
  }
  return message;
}

function usage(json: boolean, io: Io, message: string): number {
  const code = notStarted(json, io, 'usage', message);
  if (!json) io.err('Run `seefore --help` to see how it is used.');
  return code;
}
