import type { Problem } from './answer.ts';
import { stepsOf } from './model.ts';
import type { Entry } from './model.ts';
import type { Position } from './problem.ts';
import { START, quote, warning } from './problem.ts';

/** The folders whose records may say where their code lies, and for a connection where the code shows it. A step of a flow may say where the code does it. */
export const WITH_SOURCE: readonly string[] = ['apps', 'stores', 'components', 'connections', 'infrastructure'];

/**
 * `source-gone`: a path of `source` that is not there, on a record or on a step of a flow.
 * `exists` says whether a path, counted from the folder that holds the model's folder, is a file
 * or a folder on the disk. The check of a model's texts alone has no disk, and then asks nothing.
 * `folder` says whether a path that is there is a folder: a connection's `source` is a file, and
 * so is a step's.
 */
export function sourceGone(entries: readonly Entry[], exists: (path: string) => boolean, folder?: (path: string) => boolean): Problem[] {
  const problems: Problem[] = [];
  for (const entry of entries) {
    if (!entry.ok) continue;
    const told = (at: Position | undefined, field: string, rule: string, message: string, fix: string) => problems.push({ ...warning(entry.file, at ?? START, rule, message, fix), record: entry.id, field });
    if (WITH_SOURCE.includes(entry.kind) && Array.isArray(entry.fields.source)) {
      entry.fields.source.forEach((path, index) => {
        if (typeof path !== 'string') return;
        const at = entry.at.get(`source[${index}]`);
        // `source-folder`: a connection is shown by a file. A folder is there, and shows none.
        if (exists(path) && entry.kind === 'connections' && folder?.(path) === true)
          told(at, 'source', 'source-folder', `\`source\` of a connection names the folder ${quote(path)}: a folder shows no connection.`, 'Name the file in it where the code or config of `from` names `to`, or take the path out of `source`.');
        if (exists(path)) return;
        told(at, 'source', 'source-gone', `\`source\` names ${quote(path)}, which is not there.`, 'Write the path where the code is now, counted from the folder that holds the model\'s folder, or take it out of `source`.');
      });
    }
    // Each step of a flow, by its address: a step is shown by a file, as a connection is.
    for (const step of stepsOf(entry)) {
      const paths = step.fields.source;
      if (!Array.isArray(paths)) continue;
      const address = quote(`${entry.id}#${step.id}`);
      paths.forEach((path, index) => {
        if (typeof path !== 'string') return;
        const at = entry.at.get(`steps[${step.index}].source[${index}]`);
        if (!exists(path))
          told(at, 'steps', 'source-gone', `\`source\` of step ${address} names ${quote(path)}, which is not there.`, "Write the path where the code is now, counted from the folder that holds the model's folder, or take it out of the step's `source`.");
        else if (folder?.(path) === true) told(at, 'steps', 'source-folder', `\`source\` of step ${address} names the folder ${quote(path)}: a folder shows no step.`, 'Name the file in it where the code does this step, or take the path out of `source`.');
      });
    }
  }
  return problems;
}
