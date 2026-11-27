import { KINDS, ofModel } from './kinds.ts';
import { MARKER_FILE, readMarker } from './marker.ts';
import { problemsToCompare } from './read.ts';
import type { SourceFile } from './read.ts';
import { quote } from './problem.ts';

/** What a removal comes to: the files that go, or why nothing goes, a line a reason. */
export type Removal = { files: string[] } | { refusals: string[] };

/** A path without `.yaml` or `.yml` at its end. */
const bare = (path: string): string => path.replace(/\.ya?ml$/, '');

/** The last part of a path: a file's name. */
const last = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** The folder of a file that lies directly in a folder of the model. Any other file is no record, whatever its name, and has none. */
function folderOf(path: string): string | undefined {
  const parts = path.split('/');
  return parts.length === 2 && KINDS.some((kind) => kind.folder === parts[0]) ? parts[0] : undefined;
}

/** True of a file that a removal may take: one directly in a folder of the model, but for a change and a review. */
function removable(path: string): boolean {
  const folder = folderOf(path);
  return folder !== undefined && ofModel(folder);
}

/** True of the file of a change, and of a review. */
function ofChange(path: string): boolean {
  const folder = folderOf(path);
  return folder !== undefined && !ofModel(folder);
}

/**
 * Which files go when the records named are removed. A record is named by its id, or by its
 * folder and id, as `stores/store-orders`, which also names a file that does not parse. A name
 * finds only a file directly in a folder of the model: no other YAML file under the model's
 * folder is a record, though it has the name. With no ending the name is that of a `.yaml` file;
 * with its ending it is that very file, as `apps/app-odd.yml`, which the check faults. A change
 * and a review are not removed: a change ends when it is applied or rejected.
 *
 * Nothing goes when a name finds no file or two, when the marker does not read, or when the
 * model would gain an error without the files: a record that another names goes with it, or
 * after it, never alone.
 */
export function removeRecords(files: readonly SourceFile[], asked: readonly string[]): Removal {
  // With a marker that does not read, no record is read: nothing that names the one to go would be seen.
  const marker = files.find((file) => file.path === MARKER_FILE);
  if (marker === undefined || !readMarker(marker.text).readable) return { refusals: [`${quote(MARKER_FILE)} does not read as format 1, so no record is read and none could be held against the rest: mend it first`] };

  const refusals: string[] = [];
  const gone = new Set<string>();
  for (const name of asked) {
    const ending = /\.ya?ml$/.test(name);
    const named = (file: SourceFile): boolean => (ending ? file.path === name || last(file.path) === name : file.path.endsWith('.yaml') && (bare(file.path) === name || bare(last(file.path)) === name));
    const found = files.filter((file) => removable(file.path) && named(file));
    // A change and a review have ids of their own, so only a path names one: said, so that nobody takes it for missing.
    const kept = files.find((file) => ofChange(file.path) && bare(file.path) === bare(name));
    if (found.length === 1) gone.add((found[0] as SourceFile).path);
    else if (found.length > 1) refusals.push(`${found.length} records have the id ${quote(name)}: ${found.map((file) => quote(bare(file.path))).join(', ')}. Name one with its folder, as ${quote(bare((found[0] as SourceFile).path))}.`);
    else if (kept === undefined) refusals.push(`there is no record ${quote(name)}`);
    else if (folderOf(kept.path) === 'changes') refusals.push(`${quote(name)} is a change, and \`remove\` takes records of the model alone. A change ends when it is applied or rejected.`);
    else refusals.push(`${quote(name)} is a review, and \`remove\` takes records of the model alone. A review stays with its change.`);
  }
  if (refusals.length > 0) return { refusals };

  // The model without them may have no error that it did not have with them.
  const errors = (read: readonly SourceFile[]) => problemsToCompare(read).filter((problem) => problem.severity === 'error');
  const before = new Set(errors(files).map((problem) => `${problem.file}\n${problem.rule}\n${problem.message}`));
  const fresh = errors(files.filter((file) => !gone.has(file.path))).filter((problem) => !before.has(`${problem.file}\n${problem.rule}\n${problem.message}`));
  if (fresh.length === 0) return { files: [...gone].sort() };

  // Said of the record that was to go, which is still there: who names it, and where.
  const ids = [...gone].map((path) => bare(last(path)));
  const namedIn = (problem: (typeof fresh)[number]): string[] => ids.filter((id) => problem.message.includes(quote(id)));
  const stays = (problem: (typeof fresh)[number]): string => {
    const named = namedIn(problem);
    const where = `${problem.file}:${problem.line}:${problem.column}`;
    return named.length > 0 ? `${named.map(quote).join(', ')} ${named.length === 1 ? 'stays' : 'stay'}: ${where} names it` : `${where}: ${problem.message}`;
  };
  // What to do next follows what keeps the record. A record that names it may go with it; a change is decided first, and is
  // never removed here. A problem that names none of them, as a rule that breaks without one, says what it is and gets no hint.
  const byRecord = fresh.some((problem) => removable(problem.file) && namedIn(problem).length > 0);
  const byChange = fresh.some((problem) => ofChange(problem.file));
  return {
    refusals: [
      ...fresh.map(stays),
      ...(byRecord ? ['remove what names it in the same call, or change it first'] : []),
      ...(byChange ? ['an open change or its review names it: decide the change first'] : []),
    ],
  };
}
