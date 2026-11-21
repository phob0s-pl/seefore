import { CURRENT_FORMAT } from './format.ts';
import type { Format } from './format.ts';
import { idProblem } from './id.ts';
import { MARKER_FILE, readMarker } from './marker.ts';
import type { Marker } from './marker.ts';
import { START, compareProblems, error, list, quote, warning } from './problem.ts';
import type { Problem } from './problem.ts';
import { readYaml } from './yaml.ts';

/** One file of a source directory, as text. */
export interface SourceFile {
  /** The path from the top of the source directory, with forward slashes. */
  path: string;
  text: string;
}

/** One record, read from its file. */
export interface SourceRecord {
  /** The record's id, which is its file's name without `.yaml`. */
  id: string;
  /** The folder the record sits in. */
  family: string;
  /** The path of its file from the top of the source directory. */
  file: string;
  /** What the file holds. */
  value: Record<string, unknown>;
}

/** A source directory after reading: what could be read, and everything that is wrong. */
export interface Loaded {
  /** What `seefore.yaml` says. Missing when the marker is absent or broken. */
  marker?: Marker;
  /** The records that could be read, in order of id. */
  records: SourceRecord[];
  /** Everything that is wrong, in order of file and place. */
  problems: Problem[];
}

/**
 * True for a path the engine looks at: a YAML file, however its ending is spelt. Everything
 * else in a source directory is left alone.
 */
export function isSourcePath(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

/** True for a file at the top that is meant to be the marker, however its name is spelt. */
export function isMarkerName(name: string): boolean {
  return /^seefore\.ya?ml$/i.test(name);
}

/** Reads a source directory, given its YAML files as text. */
export function load(files: readonly SourceFile[]): Loaded {
  return loadAs(CURRENT_FORMAT, files);
}

/**
 * Reads a source directory under a given format. `load` is this with the current format;
 * tests use it to try the rules for records before any family of records exists.
 */
export function loadAs(format: Format, files: readonly SourceFile[]): Loaded {
  const problems: Problem[] = [];
  const records: SourceRecord[] = [];
  const families = new Set(format.families.map((family) => family.folder));

  const sources = files
    .map((file) => ({ path: normalise(file.path), text: file.text }))
    .filter((file) => isSourcePath(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  let marker: Marker | undefined;
  const markerFile = sources.find((file) => file.path === MARKER_FILE);
  // A marker under another spelling, such as `seefore.yml` or `SEEFORE.YAML`.
  const misnamed = sources.filter((file) => file.path !== MARKER_FILE && !file.path.includes('/') && isMarkerName(file.path));
  for (const file of misnamed) {
    problems.push(error(file.path, START, 'marker-name', `The marker file is named ${quote(MARKER_FILE)}, in lowercase, not ${quote(file.path)}.`));
  }
  if (!markerFile) {
    if (misnamed.length === 0) {
      problems.push(error(MARKER_FILE, START, 'marker-missing', `There is no ${quote(MARKER_FILE)} here, so this is not a seefore source directory.`));
    }
  } else {
    const read = readMarker(markerFile.text);
    problems.push(...read.problems);
    marker = read.marker;
    if (!read.readable) {
      if (!read.problems.some((problem) => problem.code === 'format-not-readable')) {
        problems.push(warning(MARKER_FILE, START, 'format-unknown', 'The marker file does not say which format this directory is written in, so nothing else in it was read.'));
      }
      return { ...(marker ? { marker } : {}), records, problems: problems.sort(compareProblems) };
    }
  }

  // A second marker further down, under any spelling of its name, starts a second source
  // directory. It is reported once, and what lies under it is left alone.
  const nested: string[] = [];
  for (const file of sources) {
    const slash = file.path.lastIndexOf('/');
    if (slash < 0 || !isMarkerName(file.path.slice(slash + 1))) continue;
    nested.push(file.path.slice(0, slash + 1));
    problems.push(error(file.path, START, 'marker-nested', 'A source directory cannot sit inside another one. Remove this file, or move its folder out.'));
  }

  for (const file of sources) {
    if (file.path === MARKER_FILE || misnamed.includes(file)) continue;
    if (nested.some((folder) => file.path.startsWith(folder))) continue;

    const parts = file.path.split('/');
    const folder = parts[0] as string;

    if (parts.length === 1) {
      problems.push(warning(file.path, START, 'not-read', `seefore does not read this file. Records sit in folders, and the only file at the top is ${quote(MARKER_FILE)}.`));
      continue;
    }
    if (!families.has(folder)) {
      const reads = families.size > 0 ? `The folders it reads are ${list([...families].sort())}.` : 'This format has no folders of records yet.';
      problems.push(warning(file.path, START, 'not-read', `seefore does not read this file: it knows no records in ${quote(folder + '/')}. ${reads}`));
      continue;
    }
    if (parts.length > 2) {
      problems.push(error(file.path, START, 'record-nested', `Records sit directly in ${quote(folder + '/')}, not in a folder inside it.`));
      continue;
    }

    const name = parts[1] as string;
    if (!name.endsWith('.yaml')) {
      const ending = name.slice(name.lastIndexOf('.'));
      problems.push(error(file.path, START, 'record-extension', `A record's file ends in ${quote('.yaml')}, in lowercase, not ${quote(ending)}.`));
      continue;
    }

    const id = name.slice(0, -'.yaml'.length);
    const wrongId = idProblem(id);
    if (wrongId) problems.push(error(file.path, START, 'id-invalid', `${wrongId} A record's id is its file's name.`));

    const yaml = readYaml(file.path, file.text, 'A record');
    problems.push(...yaml.problems);
    if (wrongId || !yaml.doc || !yaml.map) continue;

    records.push({ id, family: folder, file: file.path, value: yaml.doc.toJS() as Record<string, unknown> });
  }

  const byId = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const same = byId.get(record.id);
    if (same) same.push(record);
    else byId.set(record.id, [record]);
  }
  for (const [id, same] of byId) {
    if (same.length < 2) continue;
    const where = list(same.map((record) => record.file));
    for (const record of same) {
      problems.push(error(record.file, START, 'id-twice', `The id ${quote(id)} names ${same.length} records: ${where}. An id names one record in the whole directory.`));
    }
  }

  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.file < b.file ? -1 : 1));
  return { ...(marker ? { marker } : {}), records, problems: problems.sort(compareProblems) };
}

/** Drops a leading `./`. A path already uses forward slashes; whoever reads the disk sees to that. */
function normalise(path: string): string {
  return path.replace(/^(\.\/)+/, '');
}
