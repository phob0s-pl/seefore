import { ELLIPSIS, graphemesOf, widthOf } from './measure.ts';
import type { Font } from './measure.ts';

/**
 * Breaking a text into the lines a picture draws. The layout breaks every text, and the page
 * draws the lines it is given: it never breaks one itself.
 */

/** A text on one line: its line breaks and runs of spaces made one space, and none at either end. */
export function flat(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}

/**
 * A text in at most `most` lines, each no wider than `width` in the font. It breaks at spaces,
 * and inside a word only when the word alone is wider than a line, and then never inside a
 * character as a reader sees it. When the text needs more lines, the last one ends with an
 * ellipsis after the words that fit. An empty text has no lines.
 */
export function linesOf(text: string, font: Font, width: number, most: number): string[] {
  const lines = broken(flat(text), font, width);
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  kept[most - 1] = cut(kept[most - 1] ?? '', font, width);
  return kept;
}

/** A text on one line no wider than `width` in the font, cut with an ellipsis when it does not fit. */
export function oneLine(text: string, font: Font, width: number): string {
  return linesOf(text, font, width, 1)[0] ?? '';
}

/**
 * A text broken into lines no wider than `width`, with no limit on their number. Words go on
 * a line while they fit. A word wider than a line starts a line of its own and is broken
 * between characters; what is left of it is the start of the next line.
 */
function broken(text: string, font: Font, width: number): string[] {
  if (text === '') return [];
  const space = widthOf(' ', font);
  const lines: string[] = [];
  let line = '';
  let room = width;
  for (const word of text.split(' ')) {
    const needed = widthOf(word, font);
    if (line !== '' && space + needed <= room) {
      line += ` ${word}`;
      room -= space + needed;
      continue;
    }
    if (line !== '') lines.push(line);
    const pieces = needed <= width ? [word] : piecesOf(word, font, width);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1) ?? '';
    room = width - widthOf(line, font);
  }
  lines.push(line);
  return lines;
}

/** A word wider than a line, in pieces that each fit one, broken between characters. A character wider than the line is a piece of its own. */
function piecesOf(word: string, font: Font, width: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  let room = width;
  for (const grapheme of graphemesOf(word)) {
    const needed = widthOf(grapheme, font);
    if (piece !== '' && needed > room) {
      pieces.push(piece);
      piece = '';
      room = width;
    }
    piece += grapheme;
    room -= needed;
  }
  pieces.push(piece);
  return pieces;
}

/**
 * A line with an ellipsis at its end, still no wider than `width`: the words that fit before
 * it, or, when not even the first word fits, as many of its characters as do.
 */
function cut(line: string, font: Font, width: number): string {
  const words = line.split(' ');
  while (words.length > 1 && widthOf(words.join(' ') + ELLIPSIS, font) > width) words.pop();
  const graphemes = graphemesOf(words.join(' '));
  while (graphemes.length > 0 && widthOf(graphemes.join('') + ELLIPSIS, font) > width) graphemes.pop();
  return graphemes.join('') + ELLIPSIS;
}
