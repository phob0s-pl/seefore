import type { Problem } from './answer.ts';
import type { Entry } from './model.ts';
import { START, quote, warning } from './problem.ts';

/** The folders whose records may say where their code lies, and for a connection where the code shows it. */
export const WITH_SOURCE: readonly string[] = ['apps', 'stores', 'components', 'connections', 'infrastructure'];

/**
 * `source-gone`: a path of `source` that is not there. `exists` says whether a path, counted
 * from the folder that holds the model's folder, is a file or a folder on the disk. The check
 * of a model's texts alone has no disk, and then asks nothing. `folder` says whether a path
 * that is there is a folder: a connection's `source` is a file.
 */
export function sourceGone(entries: readonly Entry[], exists: (path: string) => boolean, folder?: (path: string) => boolean): Problem[] {
  const problems: Problem[] = [];
  for (const entry of entries) {
    if (!entry.ok || !WITH_SOURCE.includes(entry.kind) || !Array.isArray(entry.fields.source)) continue;
    entry.fields.source.forEach((path, index) => {
      if (typeof path !== 'string') return;
      // `source-folder`: a connection is shown by a file. A folder is there, and shows none.
      if (exists(path) && entry.kind === 'connections' && folder?.(path) === true) {
        const found = warning(
          entry.file,
          entry.at.get(`source[${index}]`) ?? START,
          'source-folder',
          `\`source\` of a connection names the folder ${quote(path)}: a folder shows no connection.`,
          'Name the file in it where the code or config of `from` names `to`, or take the path out of `source`.',
        );
        problems.push({ ...found, record: entry.id, field: 'source' });
      }
      if (exists(path)) return;
      const found = warning(
        entry.file,
        entry.at.get(`source[${index}]`) ?? START,
        'source-gone',
        `\`source\` names ${quote(path)}, which is not there.`,
        'Write the path where the code is now, counted from the folder that holds the model\'s folder, or take it out of `source`.',
      );
      problems.push({ ...found, record: entry.id, field: 'source' });
    });
  }
  return problems;
}
