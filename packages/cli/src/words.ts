import { isAbsolute, relative, sep } from 'node:path';
import { forShell } from './check.ts';
import { onDisk, withSlashes } from './directory.ts';

/** Where a command was run and what it read, so that another command it names can be run from there too. */
export interface Here {
  /** The folder the command was run in. */
  cwd: string;
  /** The source directory, as a full path with every link followed. */
  directory: string;
  /** The `--workdir` it was given, if any. */
  workdir: string | undefined;
}

/** A number with its noun, as in "1 record" or "2 records". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * A file of the source directory as a path from where the command was run, so it opens from
 * there. When that path would first climb out with `..`, or there is none, as between two
 * drives, it is the full path, which is easier to read and opens from anywhere.
 */
export function fromHere(cwd: string, directory: string, file: string): string {
  const full = onDisk(directory, file);
  const path = relative(cwd, full);
  if (climbs(path)) return withSlashes(full);
  return withSlashes(path) || '.';
}

/**
 * Another seefore command, as in `seefore check`, written so that it reads the same source
 * directory from where the person stands. It names the directory with `--workdir`, quoted for
 * the shell, when this command was given one or was run outside the directory, unless the
 * person stands in the directory itself.
 */
export function seefore(command: string, here: Here): string {
  const back = relative(here.directory, here.cwd);
  const outside = climbs(back);
  if (back === '' || (here.workdir === undefined && !outside)) return `seefore ${command}`;
  return `seefore ${command} --workdir=${forShell(fromHere(here.cwd, here.directory, '.'))}`;
}

/** For a command that does not show the problems: how many there are, and the command that shows them. */
export function problemsInBrief(errors: number, warnings: number, here: Here): string {
  return `${count(errors, 'error')}, ${count(warnings, 'warning')}: run \`${seefore('check', here)}\` to see them.`;
}

/** True for a relative path that first climbs out with `..`, or for no relative path at all, as between two drives. */
function climbs(path: string): boolean {
  return path === '..' || path.startsWith('..' + sep) || isAbsolute(path);
}
