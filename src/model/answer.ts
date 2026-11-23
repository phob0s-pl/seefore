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
  /** What is wrong. */
  message: string;
  /** How to mend it. */
  fix: string;
  /** The second place, where two records clash. */
  second?: Place;
};

/** The answer of `/api/model`. Nothing finds problems yet: B2 does. */
export type ModelAnswer = {
  /** The name of the folder that was read. */
  folder: string;
  /** The YAML files under it, relative to it, with `/`, in order. */
  files: string[];
  problems: Problem[];
};
