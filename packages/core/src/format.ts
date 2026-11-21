/** A family of records: one folder under the top of a source directory. */
export interface Family {
  /** The folder's name, such as `elements`. */
  folder: string;
}

/** What a source directory of one format version may hold. */
export interface Format {
  version: number;
  families: readonly Family[];
}

/**
 * Format 1. Later stages add its families of records. As of the source-directory stage it
 * has none, so a directory holds only its marker file.
 */
export const FORMAT_1: Format = { version: 1, families: [] };

/** The format this seefore writes and reads. */
export const CURRENT_FORMAT: Format = FORMAT_1;

/** Every format version this seefore can read. */
export const READABLE_VERSIONS: readonly number[] = [1];
