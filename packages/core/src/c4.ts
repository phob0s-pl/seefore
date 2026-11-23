/**
 * The C4 checks: what a model lacks by the rules of C4's notation. `docs/c4-checks.md` is
 * their spec. This file names what the checks report; the checks themselves read the model.
 */

/** The codes of the set, in the order they are reported. */
export const C4_CODES = ['description-missing', 'technology-missing', 'connection-unnamed', 'connection-vague', 'element-unconnected'] as const;

/** The code of one check of the set. */
export type C4Code = (typeof C4_CODES)[number];

/**
 * What a finding of the set is. A note counts something that is missing: it is no problem of
 * the check, and never changes how a run ends. A warning is a problem as any other warning is.
 */
export type C4Severity = 'note' | 'warning';

/** One thing a check of the set found, written as a problem is. */
export interface C4Finding {
  /** The file of the record, as a path from the source directory. */
  file: string;
  line: number;
  column: number;
  message: string;
}

/** What one check of the set looked at and found. */
export interface C4Check {
  severity: C4Severity;
  /** How many records the check looked at; null when it was not run. */
  checked: number | null;
  /** What it found, in order of file. Empty when it was not run. */
  findings: C4Finding[];
}

/** What the set found on one reading of a source directory. */
export type C4Report = {
  /** Whether the directory was read in full: no error, no file left unread, no link not followed. */
  complete: boolean;
} & Record<C4Code, C4Check>;
