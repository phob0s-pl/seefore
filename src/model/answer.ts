// What `/api/model` answers. The server makes it and the page reads it; this file is where
// they meet, as specs/A3.md has it.

/** A place in the files: a file, a line in it, and the record and field where known. */
export type Place = {
  /** The file, relative to the folder, with `/`. */
  file: string;
  line: number;
  /** The column, from 1. */
  column: number;
  record?: string;
  field?: string;
};

/** Something wrong in the files, said so that a person and an agent can both act on it. */
export type Problem = Place & {
  /** The id of the rule that found it. */
  rule: string;
  severity: 'error' | 'warning';
} & Found;

/** What a rule found: its place, what is wrong and how to mend it. */
export type Found = Place & {
  /** What is wrong. */
  message: string;
  /** How to mend it, so that an agent can act on it without reading anything else. */
  fix: string;
  /** The second place, where two records clash. */
  second?: Place;
};

/** What a count looked at and found. It is no problem. */
export type Count = {
  rule: string;
  /** The sentence that says what must be true. */
  says: string;
  /** How many records it looked at, or null when it was not counted since a file could not be read. */
  checked: number | null;
  found: Found[];
};

/** One record: its kind (the folder it is in), its id (its file's name), its file and its fields. */
export type ModelRecord = {
  kind: string;
  id: string;
  file: string;
  /** What the file holds. The field `kind` of an app or a store is here, not above. */
  fields: Record<string, unknown>;
};

/** What is read from the files of a model. */
export type ModelRead = {
  /** The name in the marker, when the marker has a good one. */
  name?: string;
  records: ModelRecord[];
  problems: Problem[];
  counts: Count[];
};

/** The answer of `/api/model`. */
export type ModelAnswer = ModelRead & {
  /** The name of the folder that was read. */
  folder: string;
};
