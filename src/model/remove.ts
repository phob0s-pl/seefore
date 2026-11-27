import { MARKER_FILE } from './marker.ts';
import { problemsToCompare } from './read.ts';
import type { SourceFile } from './read.ts';
import { quote } from './problem.ts';

/** What a removal comes to: the files that go, or why nothing goes, a line a reason. */
export type Removal = { files: string[] } | { refusals: string[] };

/** A path without `.yaml` or `.yml` at its end. */
const bare = (path: string): string => path.replace(/\.ya?ml$/, '');

/**
 * Which files go when the records named are removed. A record is named by its id, or by its
 * folder and id, as `stores/store-orders`, which also names a file that does not parse. Nothing
 * goes when a name finds no file or two, or when the model would gain an error without them:
 * a record that another names goes with it, or after it, never alone.
 */
export function removeRecords(files: readonly SourceFile[], asked: readonly string[]): Removal {
  const refusals: string[] = [];
  const gone = new Set<string>();
  for (const name of asked) {
    const wanted = bare(name);
    const found = files.filter((file) => file.path !== MARKER_FILE && (bare(file.path) === wanted || bare(file.path).slice(bare(file.path).lastIndexOf('/') + 1) === wanted));
    if (found.length === 0) refusals.push(`there is no record ${quote(name)}`);
    else if (found.length > 1) refusals.push(`${found.length} records have the id ${quote(name)}: ${found.map((file) => quote(bare(file.path))).join(', ')}. Name one with its folder, as ${quote(bare((found[0] as SourceFile).path))}.`);
    else gone.add((found[0] as SourceFile).path);
  }
  if (refusals.length > 0) return { refusals };
  // The model without them may have no error that it did not have with them.
  const errors = (read: readonly SourceFile[]) => problemsToCompare(read).filter((problem) => problem.severity === 'error');
  const before = new Set(errors(files).map((problem) => `${problem.file}\n${problem.rule}\n${problem.message}`));
  const fresh = errors(files.filter((file) => !gone.has(file.path))).filter((problem) => !before.has(`${problem.file}\n${problem.rule}\n${problem.message}`));
  if (fresh.length > 0) {
    // Said of the record that was to go, which is still there: who names it, and where.
    const ids = [...gone].map((path) => bare(path).slice(bare(path).lastIndexOf('/') + 1));
    const stays = (problem: (typeof fresh)[number]): string => {
      const named = ids.filter((id) => problem.message.includes(quote(id)));
      const where = `${problem.file}:${problem.line}:${problem.column}`;
      return named.length > 0 ? `${named.map(quote).join(', ')} ${named.length === 1 ? 'stays' : 'stay'}: ${where} names it` : `${where}: ${problem.message}`;
    };
    return { refusals: [...fresh.map(stays), 'remove what names it in the same call, or change it first'] };
  }
  return { files: [...gone].sort() };
}
