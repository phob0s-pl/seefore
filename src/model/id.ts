import { quote } from './problem.ts';

/** The most characters an id may have. */
export const ID_MAX = 80;

/** The form of an id. */
export const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Words YAML reads as something other than text, so they cannot name a record. */
const RESERVED = new Set(['true', 'false', 'null']);

/** Names Windows keeps for devices. No file can have one, whatever its ending. */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * The name of the marker file without its ending. A record with this id would be a file named
 * like the marker, and so would make its folder look like a source directory of its own.
 */
const MARKER_ID = 'seefore';

/**
 * Says what is wrong with a candidate id, in plain words, or returns nothing when it is a
 * good id: lowercase letters and digits in groups joined by single hyphens, starting with a
 * letter, at most 80 characters, and neither a word YAML reads as something else, nor a name
 * Windows keeps for a device, nor `seefore`.
 *
 * `subject` is how the candidate is named where a sentence starts with it: the candidate in
 * backticks, unless the caller says more, as in "The second id in `technology`, `GoLang`,".
 */
export function idProblem(id: string, subject = quote(id)): string | undefined {
  if (id === '') return 'An id cannot be empty.';
  // Counted as the limits on text count: one for each code point.
  const length = [...id].length;
  if (length > ID_MAX) return `This id has ${length} characters. An id has at most ${ID_MAX}.`;
  if (RESERVED.has(id)) return `${subject} cannot be an id, because YAML reads it as something other than text.`;
  if (WINDOWS_DEVICE.test(id)) return `${subject} cannot be an id, because Windows cannot hold a file of that name.`;
  if (id === MARKER_ID) return `${subject} cannot be an id, because a file named \`${MARKER_ID}.yaml\` marks a source directory.`;
  if (ID.test(id)) return undefined;
  if (id !== id.toLowerCase()) return `${subject} is not an id: an id is written in lowercase, like ${quote(suggest(id))}.`;
  return (
    `${subject} is not an id. An id is lowercase letters and digits in groups joined by ` +
    `single hyphens, and starts with a letter, like ${quote('order-events')}.`
  );
}

export function isId(id: string): boolean {
  return idProblem(id) === undefined;
}

/**
 * A lowercase form to show as an example. It is a hint, never applied, and only ever a good id:
 * where the lowercase form is not one, such as `con`, the example is a made-up id.
 */
function suggest(id: string): string {
  const hyphened = id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // The form is in lowercase, so asking about it never comes back here.
  return isId(hyphened) ? hyphened : 'order-events';
}
