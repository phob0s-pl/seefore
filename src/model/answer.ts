// What `/api/model` answers. The server makes it and the page reads it; this file is where
// they meet, as specs/A3.md has it.

/** A place in the files: a file, a line in it, and the record and field where known. */
export type Place = {
  /** The file, relative to the folder, with `/`. */
  file: string;
  line: number;
  record?: string;
  field?: string;
};

/** Something wrong in the files, said so that a person and an agent can both act on it. */
export type Problem = Place & {
  /** The id of the rule that found it. */
  rule: string;
  /** Only the warning for a file in a folder that is not known is a warning. */
  severity: 'error' | 'warning';
  /** What is wrong. */
  message: string;
  /** How to mend it, so that an agent can act on it without reading anything else. */
  fix: string;
  /** The second place, where two records clash. */
  second?: Place;
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
};

/** The answer of `/api/model`. */
export type ModelAnswer = ModelRead & {
  /** The name of the folder that was read. */
  folder: string;
};
