/**
 * The text of a record: the limits on what a source directory holds, and the first sentence of
 * a description, which the listing and a box of a view both show. The limits sit here, apart
 * from the marker and the records, because both use them and neither may depend on the other.
 */

/** The most characters a name may have: the architecture's, in the marker, and a record's. */
export const NAME_MAX = 100;

/** The most characters a record's description may have. */
export const DESCRIPTION_MAX = 2000;

/** The most characters the words of a condition may have: what reads after "only". */
export const ONLY_MAX = 100;

/** The sentence rules of the platform, for English. */
const SENTENCES = new Intl.Segmenter('en', { granularity: 'sentence' });

/**
 * A full stop and a space before what the platform's rules do not take to start a sentence,
 * though it does here: a small letter, as of a program's name written so, a backtick, a
 * quotation mark or a digit.
 */
const MISSED_START = /\. (?=[\p{Ll}\p{Nd}`"'\p{Pi}‚„])/gu;

/** The end of a sentence in a script that writes no space after one, as Chinese and Japanese do, with any closing marks. */
const ENDS_WITHOUT_SPACE = /[。｡．！？][\p{Pe}\p{Pf}]*$/u;

/** A title before a name, after which a sentence goes on: "Dr. Smith". Only with its capital, so that "in 5 ms." still ends one. */
const TITLE = /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|Prof|St)\.$/u;

/** A short word after which a sentence goes on, whatever follows. */
const SHORT_WORD = /(?:^|[\s(])(?:cf|vs|approx|incl)\.$/iu;

/** Letters each followed by a dot, as in "e.g." and "U.S.". */
const LETTERS = /(?:^|[\s(])((?:\p{L}\.){2,})$/u;

/** What ends a sentence only before a capital: "etc." and the dots of a pause, as in "waits... then". */
const BEFORE_A_CAPITAL = /(?:(?:^|[\s(])etc|\.)\.$/iu;

/**
 * The first sentence of a text, whole, on one line. It ends where the platform's rules end one,
 * or at a full stop and a space before a small letter, a backtick, a quotation mark or a digit,
 * but only before a space, so that a link such as `example.com/a?b=1` stays whole. It never
 * ends after a short form such as "e.g." or a title such as "Dr.". In a script that writes no
 * space between sentences, such as Chinese, it ends without one. A text with no end of a
 * sentence is given whole. This is a rule of thumb: some words, such as "U.S.", can end a
 * sentence or not.
 */
export function firstSentence(text: string): string {
  const line = flat(text);
  const ends = new Set([...SENTENCES.segment(line)].map(({ index, segment }) => index + segment.length));
  for (const match of line.matchAll(MISSED_START)) ends.add(match.index + 2);
  for (const end of [...ends].sort((a, b) => a - b)) {
    const first = line.slice(0, end);
    if (endsThere(first, line.charAt(end))) return first.trimEnd();
  }
  return line;
}

/** True when a sentence ends with this text, given the character that follows it. */
function endsThere(text: string, next: string): boolean {
  if (ENDS_WITHOUT_SPACE.test(text)) return true;
  if (!text.endsWith(' ')) return false;
  const said = text.trimEnd();
  return !said.endsWith('.') || !goesOn(said, next);
}

/**
 * True when a sentence goes on after this text, which ends in a full stop, given the character
 * that follows. It goes on after a title and a short word, after letters with dots when one of
 * them is small, as in "e.g.", and after "U.S.", "etc." or the dots of a pause unless a capital
 * follows.
 */
function goesOn(said: string, next: string): boolean {
  if (TITLE.test(said) || SHORT_WORD.test(said)) return true;
  const capital = /\p{Lu}/u.test(next);
  const letters = LETTERS.exec(said)?.[1];
  if (letters !== undefined) return !capital || /\p{Ll}/u.test(letters);
  return !capital && BEFORE_A_CAPITAL.test(said);
}

/** A text on one line: its line breaks and runs of spaces made one space, and none at either end. */
function flat(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
