import type { ViewArrow, ViewBox } from '@seefore/core';
import { linesOf, oneLine } from './lines.ts';
import { widthOf } from './measure.ts';
import {
  BOX_TEXT_WIDTH,
  KIND_FONT,
  LABEL_FONT,
  LABEL_LINE_HEIGHT,
  LABEL_LINES,
  LABEL_WIDTH,
  NAME_FONT,
  NAME_LINES,
  SENTENCE_FONT,
  SENTENCE_LINES,
  TECHNOLOGY_FONT,
  TECHNOLOGY_LINE_HEIGHT,
  TITLE_FONT,
} from './sizes.ts';

/** The text of a box in the lines to draw. */
export interface BoxText {
  /** The name, in one or two lines. */
  name: string[];
  /** The kind line, in one line. */
  line: string;
  /** The first sentence, in at most four lines; none when there is no sentence. */
  sentence: string[];
}

/** The text of an arrow's label in the lines to draw, and the room it takes. */
export interface LabelText {
  /** The names, one to a line, or one name in up to three lines, and `+ n more` when not every name has a line. */
  lines: string[];
  /** The technology line, `[HTTPS, JSON]`, when every connection of the arrow names the same. */
  technology?: string;
  /** The room the label takes, in whole pixels: as wide as its widest line, as high as its lines. */
  width: number;
  height: number;
}

/** The text of a box, broken into lines that fit inside it, each cut with an ellipsis when it must be. */
export function boxText(box: ViewBox): BoxText {
  return {
    name: linesOf(box.name, NAME_FONT, BOX_TEXT_WIDTH, NAME_LINES),
    line: oneLine(box.line, KIND_FONT, BOX_TEXT_WIDTH),
    sentence: box.sentence === undefined ? [] : linesOf(box.sentence, SENTENCE_FONT, BOX_TEXT_WIDTH, SENTENCE_LINES),
  };
}

/**
 * The label of an arrow. A single connection's name takes up to three lines. Two or three
 * names have a line each. More have two lines, and `+ n more` for the rest. Under them, the
 * technology on a line of its own. No line is wider than the label may be. An arrow with no
 * text has no label.
 */
export function labelText(arrow: ViewArrow): LabelText | undefined {
  const lines = nameLines(arrow.names);
  const technology = arrow.technology.length === 0 ? undefined : oneLine(`[${arrow.technology.join(', ')}]`, TECHNOLOGY_FONT, LABEL_WIDTH);
  if (lines.length === 0 && technology === undefined) return undefined;
  const widths = [...lines.map((line) => widthOf(line, LABEL_FONT)), technology === undefined ? 0 : widthOf(technology, TECHNOLOGY_FONT)];
  return {
    lines,
    ...(technology === undefined ? {} : { technology }),
    width: Math.ceil(Math.max(...widths)),
    height: lines.length * LABEL_LINE_HEIGHT + (technology === undefined ? 0 : TECHNOLOGY_LINE_HEIGHT),
  };
}

/** The lines of names on a label: see `labelText`. */
function nameLines(names: readonly string[]): string[] {
  const [only] = names;
  if (names.length === 1 && only !== undefined) return linesOf(only, LABEL_FONT, LABEL_WIDTH, LABEL_LINES);
  const each = (name: string) => oneLine(name, LABEL_FONT, LABEL_WIDTH);
  if (names.length <= LABEL_LINES) return names.map(each);
  const shown = names.slice(0, LABEL_LINES - 1);
  return [...shown.map(each), `+ ${names.length - shown.length} more`];
}

/** The title of a boundary in one line no wider than the room it has, cut with an ellipsis when it must be. */
export function titleText(title: string, width: number): string {
  return oneLine(title, TITLE_FONT, width);
}

/** How wide a boundary's title is drawn. */
export function titleWidth(title: string): number {
  return widthOf(title, TITLE_FONT);
}
