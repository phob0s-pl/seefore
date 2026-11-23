import { parseArgs } from 'node:util';
import { EXIT_OK, check, notStarted } from './check.ts';
import type { CheckOptions } from './check.ts';
import type { Io } from './io.ts';
import { list } from './list.ts';
import { FIRST_PORT, serve } from './server/command.ts';
import { uses } from './uses.ts';

/** Set when the command is built. Missing when it runs straight from source. */
declare const SEEFORE_VERSION: string | undefined;

export const VERSION: string = typeof SEEFORE_VERSION === 'string' ? SEEFORE_VERSION : 'dev';

const COMMANDS = ['check', 'list', 'uses'];

/** What a command that does not take `--full` is told. */
const FULL_ONLY = '`--full` is an option of `seefore check` and `seefore list` only.';

/** What a command other than `seefore check` is told of `--require-names`: only a check can fail on what it found. */
const REQUIRE_NAMES_ONLY = '`--require-names` is an option of `seefore check` only.';

export const HELP = `seefore: design software architecture on the C4 model, kept as files in Git.

Usage:
  seefore check [--workdir=<directory>] [--full] [--require-names] [--json]
  seefore list [--workdir=<directory>] [--full] [--json]
  seefore uses <id> [--workdir=<directory>] [--json]
  seefore --server [--workdir=<directory>] [--port=<number>] [--no-open]
  seefore --help
  seefore --version

Commands:
  check    Read the source directory and report what is wrong with it. Then count,
           by the C4 checks, the things with no description, the parts with no
           technology, the connections with no name or named only "Uses", and
           the things that no connection reaches.
  list     List the model: people, systems with what is in them, infrastructure in
           no system, connections under what they start from, owners, technologies
           and each wording of a condition. Each description shows its first
           sentence. A record with an error in its file is left out.
  uses     Show what removing or renaming a record would touch: what has its
           condition, what goes with it, what must go or change, what would be left
           behind, and which records may speak of it in their text.
  --server Show the model in the browser: a page on this machine that draws the
           model at a depth, System, Container or Component, everything or one box
           with its neighbours, and lists the model and its problems. It follows
           the files as they change, and only reads. Press Ctrl+C to stop it.

Options:
  --workdir=<directory>   Where to start looking. Without it, the current directory.
  --full                  For check: list what each C4 check found. For list: show
                          each description whole, beneath its record, and each
                          condition a record has from another.
  --require-names         For check: end with 1 unless the directory was read in
                          full and has connections, and each has a name that is
                          not only "Uses". For a pipeline that publishes pictures.
  --json                  Print the result as data. For list: the records of each
                          family, and by id who answers for each part and the
                          conditions each record is under, its own first.
  --port=<number>         For --server: the port to listen on. Without it, ${FIRST_PORT},
                          or the next free one.
  --no-open               For --server: do not open the browser.

seefore looks for seefore.yaml in the starting directory, then in each folder above it.
The first folder that has one is the source directory.

Exit code:
  0   check found no errors, list or uses did its work, or --server was stopped.
  1   check found errors, or with --require-names, not every name it asks for.
      What the C4 checks count never changes the exit code otherwise.
  2   seefore could not start, --server could not listen on its port, or uses was
      given an id that no record has, or that more than one has.`;

/**
 * Runs the command with the given arguments and returns its exit code. `--server` gives it
 * once the server has stopped, or could not start; every other command gives it at once.
 */
export function main(argv: readonly string[], io: Io): number | Promise<number> {
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
        'require-names': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', default: false },
        server: { type: 'boolean', default: false },
        port: { type: 'string' },
        'no-open': { type: 'boolean', default: false },
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

  if (values.server) {
    if (positionals.length > 0) {
      return usage(json, io, `\`--server\` runs on its own and takes no command or name, but got \`${positionals.join(' ')}\`. Use --workdir=<directory> to say where to look.`);
    }
    if (values.json) return usage(json, io, '`--json` is not an option of `seefore --server`.');
    if (values.full) return usage(json, io, FULL_ONLY);
    if (values['require-names']) return usage(json, io, REQUIRE_NAMES_ONLY);
    const port = values.port === undefined ? undefined : portOf(values.port);
    if (port === null) return usage(json, io, `\`--port\` needs a whole number from 1 to 65535, as in --port=${FIRST_PORT}, but got \`${values.port}\`.`);
    return serve({ ...(values.workdir === undefined ? {} : { workdir: values.workdir }), ...(port === undefined ? {} : { port }), open: !values['no-open'] }, io);
  }
  const serverOption = values.port !== undefined ? '--port' : values['no-open'] ? '--no-open' : undefined;
  if (serverOption) return usage(json, io, `\`${serverOption}\` is an option of \`seefore --server\` only.`);

  const [command, ...rest] = positionals;
  if (command === undefined) {
    if (json) return usage(json, io, `No command was given. The commands are: ${COMMANDS.join(', ')}.`);
    io.out(HELP);
    return EXIT_OK;
  }

  const options: CheckOptions = { ...(values.workdir === undefined ? {} : { workdir: values.workdir }), json: values.json };
  if (values.full && command !== 'check' && command !== 'list' && COMMANDS.includes(command)) return usage(json, io, FULL_ONLY);
  if (values['require-names'] && command !== 'check' && COMMANDS.includes(command)) return usage(json, io, REQUIRE_NAMES_ONLY);
  switch (command) {
    case 'check':
    case 'list':
      if (rest.length > 0) {
        return usage(json, io, `\`seefore ${command}\` takes no names after it, but got \`${rest.join(' ')}\`. Use --workdir=<directory> to say where to look.`);
      }
      return command === 'check' ? check({ ...options, full: values.full, requireNames: values['require-names'] }, io) : list({ ...options, full: values.full }, io);
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
    if (option === '--workdir') return '`--workdir` needs a directory, as in --workdir=<directory>.';
    if (option === '--port') return `\`--port\` needs a number, as in --port=${FIRST_PORT}.`;
    return `\`${option}\` takes no value.`;
  }
  return message;
}

/** The port a `--port` names: a whole number from 1 to 65535. Null for anything else. */
function portOf(text: string): number | null {
  if (!/^[0-9]{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}

function usage(json: boolean, io: Io, message: string): number {
  const code = notStarted(json, io, 'usage', message);
  if (!json) io.err('Run `seefore --help` to see how it is used.');
  return code;
}
