import type { Problem } from './answer.ts';
import type { Entry } from './model.ts';
import { START, quote, warning } from './problem.ts';

/** The folders whose records may say where their code lies. */
export const WITH_SOURCE: readonly string[] = ['apps', 'stores', 'components', 'infrastructure'];

/**
 * `source-gone`: a path of `source` that is not there. `exists` says whether a path, counted
 * from the folder that holds the model's folder, is a file or a folder on the disk. The check
 * of a model's texts alone has no disk, and then asks nothing.
 */
export function sourceGone(entries: readonly Entry[], exists: (path: string) => boolean): Problem[] {
  const problems: Problem[] = [];
  for (const entry of entries) {
    if (!entry.ok || !WITH_SOURCE.includes(entry.kind) || !Array.isArray(entry.fields.source)) continue;
    entry.fields.source.forEach((path, index) => {
      if (typeof path !== 'string' || exists(path)) return;
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
