import type { z } from 'zod';
import type { ModelRead, ModelRecord, Problem } from './answer.ts';
import { idProblem } from './id.ts';
import { KINDS } from './kinds.ts';
import { MARKER_FILE, readMarker } from './marker.ts';
import { START, compareProblems, error, list, quote, warning } from './problem.ts';
import { SHAPES } from './records.ts';
import { checkShape } from './shape.ts';
import { readYaml } from './yaml.ts';

/** One YAML file of a model: its path from the model's folder, with `/`, and its text. */
export type SourceFile = { path: string; text: string };

/** What each folder's records are called in a message, with their article. */
const NOUNS: Record<string, string> = {
  people: 'a person',
  systems: 'a system',
  apps: 'an app',
  stores: 'a store',
  components: 'a component',
  connections: 'a connection',
  infrastructure: 'a piece of infrastructure',
  owners: 'an owner',
  technologies: 'a technology',
};

/**
 * Reads a model from the texts of its YAML files. Each file is checked by itself, so a broken
 * file leaves the others read. With a marker that does not say format 1, no record is read.
 */
export function readModel(files: readonly SourceFile[]): ModelRead {
  const problems: Problem[] = [];
  const records: ModelRecord[] = [];
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const marker = sorted.find((file) => file.path === MARKER_FILE);
  if (!marker) {
    problems.push(error(MARKER_FILE, START, 'marker-missing', `There is no ${quote(MARKER_FILE)} here, so this is not a seefore model.`));
    return { records, problems };
  }
  const read = readMarker(marker.text);
  problems.push(...read.problems);
  const result = (): ModelRead => ({ ...(read.name !== undefined ? { name: read.name } : {}), records, problems: problems.sort(compareProblems) });
  if (!read.readable) return result();

  const folders = KINDS.map((kind) => kind.folder);
  for (const file of sorted) {
    if (file.path === MARKER_FILE) continue;
    const parts = file.path.split('/');
    const folder = parts[0] as string;
    const folderKnown = parts.length === 2 && (folders as string[]).includes(folder);
    if (!folderKnown) {
      problems.push(
        warning(
          file.path,
          START,
          'not-read',
          `seefore does not read this file: records sit directly in one of the folders ${list(folders)}, and the only file at the top is ${quote(MARKER_FILE)}.`,
          `If this is a record, move it to ${quote('<folder>/<id>.yaml')} where the folder is one of ${list(folders)}. If it is not a record of this model, leave it, or move it out of the model's folder.`,
        ),
      );
      continue;
    }

    const name = parts[1] as string;
    if (!name.endsWith('.yaml')) {
      problems.push(error(file.path, START, 'record-extension', `A record's file ends in ${quote('.yaml')}, in lowercase, not ${quote(name.slice(name.lastIndexOf('.')))}.`));
      continue;
    }
    const id = name.slice(0, -'.yaml'.length);
    const wrongId = idProblem(id);
    if (wrongId) {
      problems.push(error(file.path, START, 'id-invalid', `${wrongId} A record's id is its file's name.`));
      continue;
    }

    const yaml = readYaml(file.path, file.text, 'A record');
    problems.push(...yaml.problems);
    if (!yaml.doc || !yaml.map) continue;
    const shape = checkShape(file.path, yaml, SHAPES[folder as keyof typeof SHAPES] as z.ZodType, NOUNS[folder] as string);
    problems.push(...shape.problems.map((problem) => ({ ...problem, record: id })));
    if (shape.value !== undefined) records.push({ kind: folder, id, file: file.path, fields: shape.value as Record<string, unknown> });
  }
  return result();
}
