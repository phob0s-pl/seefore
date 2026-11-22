import { ARIAL_BOLD, ARIAL_ELLIPSIS, ARIAL_REGULAR, TABLE_FIRST, TABLE_LAST } from './widths.ts';

/**
 * How wide a text is when drawn. Every text is measured for one family of fonts, Arial and those
 * made to its measure, from a table of the width of each character of Latin-1. The page draws
 * with that family, so what is measured here is what it draws.
 */

/** A size and weight of the family the page draws with: Arial, Helvetica, Liberation Sans. */
export interface Font {
  /** In CSS pixels. */
  size: number;
  bold: boolean;
}

/** The ellipsis that ends a line cut short. */
export const ELLIPSIS = '…';

/** The size, in pixels, at which the widths of the tables were measured. */
const TABLE_SIZE = 1000;

/** How much wider than the font is high a wide sign counts, such as an emoji or a Chinese character: a third more. */
const WIDE = 4 / 3;

/** What a reader sees as one character, as an emoji joined of several is one. */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** A picture drawn as wide as a wide sign: an emoji, alone, joined to others or with a skin tone, a flag, and a character asked to look like an emoji. */
const PICTURE = /\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Extended_Pictographic}️|️⃣/u;

/** Characters that take no room: marks that combine with the one before, controls, joiners and variant selectors. */
const NO_ROOM = /[\p{Mn}\p{Me}\p{Cc}​-‏⁠︀-️]/u;

/** The wide scripts of East Asia, whose characters are drawn wider than the font is high. */
const WIDE_SCRIPT =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3FFFD}]/u;

/** The characters of a text as a reader sees them, each whole. */
export function graphemesOf(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
}

/** How wide a text is, in pixels, drawn in the font: the sum of the widths of its characters. */
export function widthOf(text: string, font: Font): number {
  let width = 0;
  for (const { segment } of GRAPHEMES.segment(text)) width += graphemeWidth(segment, font);
  return width;
}

/**
 * How wide one character as a reader sees it is drawn. A character of the table has its width
 * there, and marks that combine with it add nothing. The ellipsis has its measured width. Any
 * other sign counts as wide as the font is high, and a wide one, such as an emoji or a Chinese
 * character, as a third more, so that a text outside the table is cut early, not clipped.
 */
function graphemeWidth(grapheme: string, font: Font): number {
  if (grapheme === ELLIPSIS) return ((font.bold ? ARIAL_ELLIPSIS.bold : ARIAL_ELLIPSIS.regular) * font.size) / TABLE_SIZE;
  if (PICTURE.test(grapheme)) return font.size * WIDE;
  const code = grapheme.codePointAt(0) ?? 0;
  if (code >= TABLE_FIRST && code <= TABLE_LAST) {
    const table = font.bold ? ARIAL_BOLD : ARIAL_REGULAR;
    return ((table[code - TABLE_FIRST] ?? TABLE_SIZE) * font.size) / TABLE_SIZE;
  }
  const first = String.fromCodePoint(code);
  if (NO_ROOM.test(first)) return 0;
  return WIDE_SCRIPT.test(first) ? font.size * WIDE : font.size;
}
