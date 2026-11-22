import { isScalar, isSeq } from 'yaml';
import { CURRENT_FORMAT } from './format.ts';
import type { Family, Format, ReferenceField } from './format.ts';
import { idProblem, isId } from './id.ts';
import { MARKER_FILE, readMarker } from './marker.ts';
import type { Marker, MarkerRead } from './marker.ts';
import { emptyModel } from './model.ts';
import type { Model, ModelRecord } from './model.ts';
import { START, compareProblems, error, list, quote, warning } from './problem.ts';
import type { Problem } from './problem.ts';
import type { Connection, Store, Technology } from './records.ts';
import { brokerProblems, byId, connectionProblems, parentsOf, passesOnOnlyProblems, referenceProblems, viaProblems } from './rules.ts';
import { checkShape } from './shape.ts';
import { readYaml } from './yaml.ts';
import type { YamlFile } from './yaml.ts';

/** One file of a source directory, as text. */
export interface SourceFile {
  /** The path from the top of the source directory, with forward slashes. */
  path: string;
  /**
   * What the file holds. Missing when the file is there but could not be read, as when it is
   * not UTF-8 or the disk would not give it. Whoever read the disk says why; the file still
   * counts for what its path makes it, so a record's file still stands for its record.
   */
  text?: string;
}

/** A file that stands for a record: directly in a family's folder, and named by a good id. */
export interface RecordFile {
  /** The record's id, which is its file's name without its ending. */
  id: string;
  /** The folder the record sits in. */
  family: string;
  /** The path of its file from the top of the source directory. */
  file: string;
}

/** One record, read from its file. */
export interface SourceRecord extends RecordFile {
  /** What the file holds. */
  value: Record<string, unknown>;
}

/** A place where one record names another by its id. */
export interface Reference {
  /** The file of the record that names the other. */
  file: string;
  /** Where the id is written in that file. */
  line: number;
  column: number;
  /** The id of the record that names the other. */
  record: string;
  /** The key it is named in, such as `in`. */
  field: string;
  /** The id it names. */
  names: string;
}

/** A record's name or description, with the place of its key. */
export interface RecordText {
  /** The file of the record. */
  file: string;
  /**
   * Where the key is written. The text itself may be in quotes or run over several lines, so
   * a place inside it on disk is not a place inside the text as read.
   */
  line: number;
  column: number;
  /** The id of the record. */
  record: string;
  /** `name` or `description`. */
  field: string;
  /** The text as read. */
  text: string;
}

/** The keys whose text `RecordText` keeps. */
const TEXT_FIELDS = ['name', 'description'];

/** A source directory after reading: what could be read, and everything that is wrong. */
export interface Loaded {
  /**
   * What the marker says: `seefore.yaml`, or a marker spelt another way where there is no
   * `seefore.yaml`. Missing when the marker is absent or broken.
   */
  marker?: Marker;
  /** The records whose file could be read, whatever their shape, in order of id. */
  records: SourceRecord[];
  /**
   * The files that stand for a record and could not be read, in order of file. Each is still a
   * record that others may name.
   */
  unread: RecordFile[];
  /** Every id that a record names in a field for naming records, in order of file and place. */
  references: Reference[];
  /** Every name and description a record holds as text, in order of file and place. */
  texts: RecordText[];
  /** The records whose own file has no error, typed, by family. */
  model: Model;
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

/**
 * Reads a source directory, given its YAML files as text. Its records are read only when the
 * marker says, once, that they are in a format this seefore reads: else there is no telling
 * which rules they follow.
 */
export function load(files: readonly SourceFile[]): Loaded {
  return loadAs(CURRENT_FORMAT, files);
}

/** A record read from a sound YAML file, with what it takes to check it further. */
interface ReadRecord {
  record: SourceRecord;
  yaml: YamlFile;
  family: Family;
}

/**
 * Reads a source directory under a given format. `load` is this with the current format;
 * tests use it to try the rules for records with families made up for the test.
 */
export function loadAs(format: Format, files: readonly SourceFile[]): Loaded {
  const problems: Problem[] = [];
  const records: SourceRecord[] = [];
  const unread: RecordFile[] = [];
  const readRecords: ReadRecord[] = [];
  const families = new Map(format.families.map((family) => [family.folder, family]));

  const sources = files
    .map((file): SourceFile => ({ ...file, path: normalise(file.path) }))
    .filter((file) => isSourcePath(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // A marker under another spelling, such as `seefore.yml` or `SEEFORE.YAML`, still marks the
  // folder. It is reported, and where there is no `seefore.yaml` it is read in its place.
  const exact = sources.find((file) => file.path === MARKER_FILE);
  const misnamed = sources.filter((file) => file.path !== MARKER_FILE && !file.path.includes('/') && isMarkerName(file.path));
  for (const file of misnamed) {
    problems.push(error(file.path, START, 'marker-name', `The marker file is named ${quote(MARKER_FILE)}, in lowercase, not ${quote(file.path)}.`));
  }
  const markers = exact ? [exact] : misnamed;
  if (markers.length === 0) {
    problems.push(error(MARKER_FILE, START, 'marker-missing', `There is no ${quote(MARKER_FILE)} here, so this is not a seefore source directory.`));
    return nothingRead(undefined, problems);
  }

  // The format comes first. Nothing else is read unless every marker says, once, that the
  // directory is in a format this seefore reads.
  let marker: Marker | undefined;
  let readable = true;
  for (const file of markers) {
    const read = formatOf(file);
    problems.push(...read.problems);
    marker ??= read.marker;
    if (!read.readable) readable = false;
  }
  if (!readable) return nothingRead(marker, problems);

  // A second marker further down, under any spelling of its name, starts a second source
  // directory. It is reported once, and what lies under it is left alone.
  const nested: string[] = [];
  for (const file of sources) {
    const slash = file.path.lastIndexOf('/');
    if (slash < 0 || !isMarkerName(file.path.slice(slash + 1))) continue;
    const folder = file.path.slice(0, slash);
    nested.push(folder + '/');
    const message = families.has(folder)
      ? markerAmongRecords(file.path.slice(slash + 1), folder)
      : 'A source directory cannot sit inside another one. Remove this file, or move its folder out.';
    problems.push(error(file.path, START, 'marker-nested', message));
  }

  for (const file of sources) {
    if (file.path === MARKER_FILE || misnamed.includes(file)) continue;
    if (nested.some((folder) => file.path.startsWith(folder))) continue;

    const parts = file.path.split('/');
    const folder = parts[0] as string;
    const family = families.get(folder);

    if (parts.length === 1) {
      problems.push(warning(file.path, START, 'not-read', `seefore does not read this file. Records sit in folders, and the only file at the top is ${quote(MARKER_FILE)}.`));
      continue;
    }
    if (!family) {
      const reads = families.size > 0 ? `The folders it reads are ${list([...families.keys()].sort())}.` : 'This format has no folders of records yet.';
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
      // It is still meant as a record, so others may name it.
      const stem = name.slice(0, name.lastIndexOf('.'));
      if (isId(stem)) unread.push({ id: stem, family: folder, file: file.path });
      continue;
    }

    const id = name.slice(0, -'.yaml'.length);
    const wrongId = idProblem(id);
    if (wrongId) problems.push(error(file.path, START, 'id-invalid', `${wrongId} A record's id is its file's name.`));

    if (file.text === undefined) {
      // Why the file could not be read is said by whoever read the disk. It still stands for
      // its record, so what names that record is not wrong.
      if (!wrongId) unread.push({ id, family: folder, file: file.path });
      continue;
    }
    const yaml = readYaml(file.path, file.text, 'A record');
    problems.push(...yaml.problems);
    if (wrongId) continue;
    if (!yaml.doc || !yaml.map) {
      unread.push({ id, family: folder, file: file.path });
      continue;
    }

    const record: SourceRecord = { id, family: folder, file: file.path, value: yaml.doc.toJS() as Record<string, unknown> };
    records.push(record);
    readRecords.push({ record, yaml, family });
  }

  const everyRecord = byId([...records, ...unread]);
  for (const [id, same] of everyRecord) {
    if (same.length < 2) continue;
    const where = list(same.map((record) => record.file).sort());
    for (const record of same) {
      problems.push(error(record.file, START, 'id-twice', `The id ${quote(id)} names ${same.length} records: ${where}. An id names one record in the whole directory.`));
    }
  }

  // Each file is held to its family's shape by itself. What it names is gathered from every
  // record that could be read, whatever its shape, so that one slip does not hide another.
  const typed: ModelRecord<unknown>[] = [];
  const references: Reference[] = [];
  const texts: RecordText[] = [];
  for (const { record, yaml, family } of readRecords) {
    const kind = family.record;
    if (!kind) continue;
    const shape = checkShape(record.file, yaml, kind.schema, `this ${kind.noun}`);
    problems.push(...shape.problems);
    if (shape.value !== undefined) typed.push({ id: record.id, file: record.file, ...(shape.value as object) });
    references.push(...referencesIn(record, yaml, kind.references));
    texts.push(...textsIn(record, yaml));
  }
  references.sort(compareReferences);

  problems.push(...referenceProblems(format, everyRecord, references));
  // The checks of the conventions look at the records of the right shape, and at what every record names.
  const parents = parentsOf(format, everyRecord, references);
  problems.push(...connectionProblems(format, everyRecord, parents, references, ofFamily<Connection>(typed, 'connections')));
  problems.push(...viaProblems(format, everyRecord, parents, references));
  problems.push(...brokerProblems(everyRecord, ofFamily<Store>(typed, 'stores'), ofFamily<Technology>(typed, 'technologies')));
  // Every error is known by now, so the model is too. The check of what only passes on reads
  // the connections of the model alone; it adds warnings, which leave the model as it is.
  const model = modelOf(typed, problems);
  problems.push(...passesOnOnlyProblems(format, everyRecord, parents, model));

  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.file < b.file ? -1 : 1));
  unread.sort((a, b) => (a.file < b.file ? -1 : 1));
  return {
    ...(marker ? { marker } : {}),
    records,
    unread,
    references,
    texts,
    model,
    problems: problems.sort(compareProblems),
  };
}

/** A source directory of which nothing but the marker was read. */
function nothingRead(marker: Marker | undefined, problems: Problem[]): Loaded {
  return { ...(marker ? { marker } : {}), records: [], unread: [], references: [], texts: [], model: emptyModel(), problems: problems.sort(compareProblems) };
}

/**
 * Reads a marker for the format the directory is in, and for what is wrong with it. When it
 * leaves the format unknown, a warning on it says that nothing else was read.
 */
function formatOf(file: SourceFile): MarkerRead {
  if (file.text === undefined) {
    // Why it could not be read is said by whoever read the disk.
    return { problems: [warning(file.path, START, 'format-unknown', 'The marker file could not be read, so nothing else in this directory was read.')], readable: false };
  }
  const read = readMarker(file.text, file.path);
  if (read.readable || read.problems.some((problem) => problem.code === 'format-not-readable')) return read;
  const unknown = warning(file.path, START, 'format-unknown', 'The marker file does not say which format this directory is written in, so nothing else in it was read.');
  return { ...read, problems: [...read.problems, unknown] };
}

/**
 * Why a folder of records was taken for a source directory: a file in it is named like the
 * marker. Such a file is more likely a record whose id is `seefore` than a source directory
 * put there, so the message gives both ways out.
 */
function markerAmongRecords(name: string, folder: string): string {
  const where = quote(folder + '/');
  return (
    `A file named ${quote(name)} marks a source directory, so ${where} was taken for a source directory inside this one, ` +
    `and none of its other files were read. If this file is meant as a record, give it another id: ${quote('seefore')} cannot be an id. ` +
    `If ${where} really is a source directory, move it out of this one.`
  );
}

/** Every id a record names in the fields its family names records in, with where it is written. */
function referencesIn(record: SourceRecord, yaml: YamlFile, fields: readonly ReferenceField[]): Reference[] {
  const found: Reference[] = [];
  for (const field of fields) {
    const node = yaml.map?.get(field.field, true);
    const items = field.list ? (isSeq(node) ? node.items : []) : [node];
    for (const item of items) {
      // A value that is not an id is a matter for the shape, and names nothing.
      if (!isScalar(item) || typeof item.value !== 'string' || !isId(item.value)) continue;
      found.push({ file: record.file, ...yaml.at(item), record: record.id, field: field.field, names: item.value });
    }
  }
  return found;
}

/**
 * A record's name and description, each where it is text, with the place of its key. The
 * records are read in order of file, and the keys in order of place, so the texts are too.
 */
function textsIn(record: SourceRecord, yaml: YamlFile): RecordText[] {
  const found: RecordText[] = [];
  for (const pair of yaml.map?.items ?? []) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string' || !TEXT_FIELDS.includes(pair.key.value)) continue;
    // A value that is not text is a matter for the shape, and says nothing here.
    if (!isScalar(pair.value) || typeof pair.value.value !== 'string') continue;
    found.push({ file: record.file, ...yaml.at(pair.key), record: record.id, field: pair.key.value, text: pair.value.value });
  }
  return found;
}

/** The records of one family whose file has the shape of its record, typed. Each was held to the schema its type is inferred from. */
function ofFamily<T>(typed: readonly ModelRecord<unknown>[], folder: string): ModelRecord<T>[] {
  return typed.filter((record) => record.file.startsWith(folder + '/')) as ModelRecord<T>[];
}

/**
 * The records whose own file has no error, by family, in order of id. One that has an error
 * cannot be read right, so it is left out, though others may still name it.
 */
function modelOf(typed: readonly ModelRecord<unknown>[], problems: readonly Problem[]): Model {
  const broken = new Set(problems.filter((problem) => problem.severity === 'error').map((problem) => problem.file));
  const model = emptyModel();
  // Each family's records were held to the schema its type in the model is inferred from.
  const families = model as unknown as Record<string, ModelRecord<unknown>[] | undefined>;
  for (const record of typed) {
    if (broken.has(record.file)) continue;
    families[record.file.slice(0, record.file.indexOf('/'))]?.push(record);
  }
  for (const records of Object.values(families)) records?.sort((a, b) => (a.id < b.id ? -1 : 1));
  return model;
}

function compareReferences(a: Reference, b: Reference): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.column - b.column;
}

/** Drops a leading `./`. A path already uses forward slashes; whoever reads the disk sees to that. */
function normalise(path: string): string {
  return path.replace(/^(\.\/)+/, '');
}
