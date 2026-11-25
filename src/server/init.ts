import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { MarkerSchema, NAME_MAX } from '../model/records.ts';
import { parseText } from '../model/yaml.ts';
import type { Io } from './command.ts';

/** The folder of the model when `seefore init` is given none. */
export const ARCHITECTURE = 'architecture';

/** The file in the current folder that tells Claude Code where the model is. */
const CLAUDE = 'CLAUDE.md';

const NO_NAME = 'give the model a name, as in seefore init --name=Shop, or --name="Corner shop" for one with a space';

/** What `seefore init` was asked to do: the model's folder, as given, and its name. */
export type InitOptions = { dir: string; name?: string };

/** Reads the options of `seefore init`, the verb among them, or says what is wrong with them. */
export function readInitOptions(args: readonly string[]): InitOptions | { error: string } {
  const options: InitOptions = { dir: ARCHITECTURE };
  let verb = false;
  let dir = false;
  for (const arg of args) {
    if (arg === 'init' && !verb) verb = true;
    else if (arg.startsWith('--name=')) {
      const name = arg.slice('--name='.length);
      if (name !== '') options.name = name;
    } else if (arg.startsWith('--')) return { error: `"${arg}" does not go with "init"` };
    else if (dir) return { error: 'give one folder, as in seefore init architecture --name=Shop' };
    else {
      options.dir = arg;
      dir = true;
    }
  }
  return options;
}

/** The five lines that `seefore init` adds to CLAUDE.md, naming the model's folder as it is written there. */
export function claudeLines(folder: string): string[] {
  return [
    '## Architecture',
    `This system's architecture is a seefore model in \`${folder}\`: one YAML file a record.`,
    'Before you add, remove or join parts, run `seefore list` and read its context.',
    'When code moves, offer `/seefore:model`. For a design, offer `/seefore:change`.',
    'After the model changes, `seefore check` must show no error.',
  ];
}

/** The text of the marker. A name that YAML would read as something else, or not at all, is written in double quotes. */
export function markerText(name: string): string {
  const plain = `format: 1\nname: ${name}\n`;
  const doc = parseText(plain);
  if (doc.errors.length === 0 && doc.warnings.length === 0 && doc.get('name') === name) return plain;
  return `format: 1\nname: ${JSON.stringify(name)}\n`;
}

/**
 * Starts a model: writes `<dir>/seefore.yaml` and adds five lines to CLAUDE.md in the current
 * folder, then prints what it wrote, a line each. It refuses, writing nothing, where a model is already.
 */
export async function init(args: readonly string[], cwd: string, io: Io, fail: (message: string) => number): Promise<number> {
  const options = readInitOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.name === undefined) return fail(NO_NAME);
  const name = options.name;
  const held = MarkerSchema.safeParse({ format: 1, name });
  if (!held.success) {
    const issue = held.error.issues[0];
    const why = issue === undefined || issue.code === 'too_big' ? `The name is longer than ${NAME_MAX} characters.` : issue.message;
    return fail(`${why} Nothing is written.`);
  }

  const folder = resolve(cwd, options.dir);
  // The folder as the person reads it: from the current folder, with `/` between its parts.
  const shown = relative(cwd, folder).split(sep).join('/');
  const marker = shown === '' ? 'seefore.yaml' : `${shown}/seefore.yaml`;
  if (existsSync(join(cwd, 'seefore.yaml'))) return fail('this folder is a model already: it has seefore.yaml. Nothing is written.');
  if (existsSync(join(folder, 'seefore.yaml'))) return fail(`"${options.dir}" is a model already: it has seefore.yaml. Nothing is written.`);

  const claude = join(cwd, CLAUDE);
  let before: string | undefined;
  if (existsSync(claude)) {
    try {
      before = await readFile(claude, 'utf8');
    } catch {
      return fail(`cannot read ${CLAUDE}. Nothing is written.`);
    }
  }

  try {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'seefore.yaml'), markerText(name), { flag: 'wx' });
  } catch {
    return fail(`cannot write ${marker}. Nothing is written.`);
  }
  io.out(`Wrote ${marker}, the marker of the model "${name}".`);

  const lines = claudeLines(shown === '' ? './' : `${shown}/`);
  if (before !== undefined && hasLines(before, lines)) io.out(`${CLAUDE} has the lines under "${lines[0]}" already: nothing is added to it.`);
  else {
    const text = lines.map((line) => `${line}\n`).join('');
    // After the person's own text, one blank line and then the lines.
    const gap = before === undefined || before.trim() === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    try {
      await writeFile(claude, `${before ?? ''}${gap}${text}`);
    } catch {
      return fail(`cannot write ${CLAUDE}`);
    }
    if (before === undefined) io.out(`Wrote ${CLAUDE}, with five lines under "${lines[0]}".`);
    else io.out(`Added five lines under "${lines[0]}" at the end of ${CLAUDE}.`);
  }
  io.out('Next, in Claude Code: /seefore:model');
  return 0;
}

/** True when a text has the heading of the lines with their first line under it. */
function hasLines(text: string, lines: readonly string[]): boolean {
  const written = text.split(/\r?\n/).map((line) => line.trimEnd());
  return written.some((line, at) => line === lines[0] && written[at + 1] === lines[1]);
}
