/** How much a problem matters. An error fails the check; a warning does not. */
export type Severity = 'error' | 'warning';

/** A place in a file. Both numbers start at 1. */
export interface Position {
  line: number;
  column: number;
}

/** The start of a file: where a problem about the whole file is put. */
export const START: Position = { line: 1, column: 1 };

/** One thing that is wrong, with the place it is wrong at. */
export interface Problem {
  /** The file, as a path from the top of the source directory, with forward slashes. */
  file: string;
  line: number;
  column: number;
  severity: Severity;
  /** A short, stable name for this kind of problem. */
  code: string;
  /** What is wrong, in plain words. */
  message: string;
}

export function error(file: string, at: Position, code: string, message: string): Problem {
  return { file, line: at.line, column: at.column, severity: 'error', code, message };
}

export function warning(file: string, at: Position, code: string, message: string): Problem {
  return { file, line: at.line, column: at.column, severity: 'warning', code, message };
}

/** Orders problems by file, then by place, so a report reads top to bottom. */
export function compareProblems(a: Problem, b: Problem): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.column !== b.column) return a.column - b.column;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** Puts a name in backticks, the way every message quotes a key, an id or a file. */
export function quote(text: string): string {
  return '`' + text + '`';
}

/** Starts a text with a capital letter, so that it can start a sentence. A quoted name stays as it is. */
export function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Joins quoted names into "`a`", "`a` and `b`" or "`a`, `b` and `c`". */
export function list(names: readonly string[]): string {
  const quoted = names.map(quote);
  if (quoted.length <= 1) return quoted.join('');
  return quoted.slice(0, -1).join(', ') + ' and ' + quoted[quoted.length - 1];
}
