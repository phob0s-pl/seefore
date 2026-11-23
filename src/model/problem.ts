import type { Problem } from './answer.ts';

export type { Problem };

/** A place in a file. Both numbers start at 1. */
export interface Position {
  line: number;
  column: number;
}

/** The start of a file: where a problem about the whole file is put. */
export const START: Position = { line: 1, column: 1 };

/**
 * How to mend a problem, for each rule, when its place has nothing more to add. The message
 * says what is wrong and where; these say what to do about it.
 */
const FIXES: Record<string, string> = {
  'yaml-empty': 'Write the record as a mapping of keys and values, as the other files of its folder are, or delete the file.',
  'yaml-syntax': 'Correct the YAML at the line given, as the message says. When a text has a colon, a quote, a bracket or a # in it, put the whole text in double quotes.',
  'yaml-key-twice': 'Delete one of the two lines that write the key, or merge their values into one.',
  'yaml-directive': 'Delete the line that starts with %.',
  'yaml-anchor': 'Delete the anchor (the word that starts with &) and write the value out wherever it is used.',
  'yaml-alias': 'Replace the alias (the word that starts with *) by the value it stands for, written out.',
  'yaml-tag': 'Delete the tag (the word that starts with !), and write the plain value.',
  'yaml-comment': 'Delete the comment. If the # is part of a text value, put the whole value in double quotes. To keep a note, put it in the key `description`.',
  'yaml-many-documents': 'Keep one YAML document: delete every line "---" after the first and what follows it, or move that into a file of its own.',
  'yaml-not-mapping': 'Write the file as keys and values, one `key: value` to a line, not a list or a single value.',
  'yaml-key-not-text': 'Write each key as plain text, such as `name`.',
  'value-too-small': 'Give the key a longer value, as the message says, or delete the key if it is optional.',
  'value-too-big': 'Shorten the value to the limit the message gives.',
  'value-not-allowed': 'Change the value to one of those the message lists, or delete the key if it is optional.',
  'value-invalid': 'Change the value as the message says, or delete the key if it is optional.',
  'id-invalid': 'Rename the file so that its name, without `.yaml`, is a good id: lowercase letters and digits in groups joined by single hyphens, a letter first, at most 80 characters. Change every `in`, `from`, `to`, `via` and `owner` that names the old id.',
  'record-extension': 'Rename the file so that it ends in `.yaml`, in lowercase.',
  'format-not-readable': 'Set `format: 1` in seefore.yaml, if the directory is written in format 1. Otherwise read it with a seefore that knows its format.',
  'marker-missing': 'Add a file seefore.yaml at the top of the folder, holding `format: 1` and a `name` of one line.',
  'not-read': 'Move the file into one of the folders of records if it is a record, or leave it where it is if it is no record of this model.',
};

function make(severity: Problem['severity'], file: string, at: Position, rule: string, message: string, fix?: string): Problem {
  return { file, line: at.line, column: at.column, rule, severity, message, fix: fix ?? FIXES[rule] ?? 'Change the file as the message says.' };
}

export function error(file: string, at: Position, rule: string, message: string, fix?: string): Problem {
  return make('error', file, at, rule, message, fix);
}

export function warning(file: string, at: Position, rule: string, message: string, fix?: string): Problem {
  return make('warning', file, at, rule, message, fix);
}

/** Orders problems by file, line, column and rule, so a report reads top to bottom. */
export function compareProblems(a: Problem, b: Problem): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.column !== b.column) return a.column - b.column;
  return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
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
