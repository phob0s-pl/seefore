import { relative } from 'node:path';
import { onDisk, withSlashes } from './directory.ts';

/** A number with its noun, as in "1 record" or "2 records". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** A file of the source directory as a path from where the command was run, so it opens from there. */
export function fromHere(cwd: string, directory: string, file: string): string {
  return withSlashes(relative(cwd, onDisk(directory, file))) || '.';
}

/** For a command that does not show the problems: how many there are, and where to see them. */
export function problemsInBrief(errors: number, warnings: number): string {
  return `${count(errors, 'error')}, ${count(warnings, 'warning')}: run \`seefore check\` to see them.`;
}
