import type { ViewArrow, ViewBoundary, ViewBox, ViewRoute } from '@seefore/core';
import { linesOf, oneLine } from './lines.ts';
import { ELLIPSIS, widthOf } from './measure.ts';
import {
  BOX_WIDTH,
  KIND_FONT,
  LABEL_FONT,
  LABEL_LINE_HEIGHT,
  LABEL_LINES,
  LABEL_WIDTH,
  NAME_FONT,
  NAME_LINES,
  ROUTE_FONT,
  ROUTE_LINE_HEIGHT,
  SENTENCE_FONT,
  SENTENCE_LINES,
  TECHNOLOGY_FONT,
  TECHNOLOGY_LINE_HEIGHT,
  TEXT_INSET,
  TITLE_FONT,
} from './sizes.ts';
import type { Inset } from './sizes.ts';

/** The text of a box in the lines to draw, and the room it was broken for. */
export interface BoxText {
  /** The name, in one or two lines. */
  name: string[];
  /** The kind line, in one line. */
  line: string;
  /** The first sentence, in at most four lines; none when there is no sentence. */
  sentence: string[];
  /** How far the text stands in from the left and the right edge of the box, for the shape of its look. */
  inset: Inset;
}

/** The text of an arrow's label in the lines to draw, and the room it takes. */
export interface LabelText {
  /** The names, one to a line, or one name in up to three lines, and `+ n more` when not every name has a line. */
  lines: string[];
  /** The route line, `via Ingress, Workhorse` or `via on 2 of 5`, when any connection of the arrow passes through something. */
  route?: string;
  /** The technology line, `[HTTPS, JSON]`, when every connection of the arrow names the same. */
  technology?: string;
  /** The room the label takes, in whole pixels: as wide as its widest line, as high as its lines. */
  width: number;
  height: number;
}

/**
 * The text of a box, broken into lines that fit inside the room its shape leaves, each cut with
 * an ellipsis when it must be.
 */
export function boxText(box: ViewBox): BoxText {
  const inset = TEXT_INSET[box.look];
  const width = BOX_WIDTH - inset.left - inset.right;
  return {
    name: linesOf(box.name, NAME_FONT, width, NAME_LINES),
    line: oneLine(box.line, KIND_FONT, width),
    sentence: box.sentence === undefined ? [] : linesOf(box.sentence, SENTENCE_FONT, width, SENTENCE_LINES),
    inset: { ...inset },
  };
}

/**
 * The label of an arrow. A single connection's name takes up to three lines. Two or three
 * names have a line each. More have two lines, and `+ n more` for the rest. Under them, the
 * route on a line of its own, and under that the technology. No line is wider than the label
 * may be. An arrow with no text has no label.
 */
export function labelText(arrow: ViewArrow): LabelText | undefined {
  const lines = nameLines(arrow.names);
  const route = arrow.route === undefined ? undefined : routeLine(arrow.route, LABEL_WIDTH);
  const technology = arrow.technology.length === 0 ? undefined : oneLine(`[${arrow.technology.join(', ')}]`, TECHNOLOGY_FONT, LABEL_WIDTH);
  if (lines.length === 0 && route === undefined && technology === undefined) return undefined;
  const widths = [
    ...lines.map((line) => widthOf(line, LABEL_FONT)),
    route === undefined ? 0 : widthOf(route, ROUTE_FONT),
    technology === undefined ? 0 : widthOf(technology, TECHNOLOGY_FONT),
  ];
  return {
    lines,
    ...(route === undefined ? {} : { route }),
    ...(technology === undefined ? {} : { technology }),
    width: Math.ceil(Math.max(...widths)),
    height: lines.length * LABEL_LINE_HEIGHT + (route === undefined ? 0 : ROUTE_LINE_HEIGHT) + (technology === undefined ? 0 : TECHNOLOGY_LINE_HEIGHT),
  };
}

/**
 * The route line of a label, no wider than `width`. When the names of what the connections pass
 * through do not all fit, it gives as many whole names as fit and then how many are left, as
 * in `via Content delivery network, + 1 more`; when not even the first fits whole, it cuts that
 * one and still says how many are left: `via Content delivery… + 1 more`. So a reader can always
 * tell how many things are on the way. `via on 2 of 5` is cut, if it must be, as any line is.
 */
export function routeLine(route: ViewRoute, width: number): string {
  const fits = (text: string) => widthOf(text, ROUTE_FONT) <= width;
  if (route.names.length === 0 || fits(route.line)) return oneLine(route.line, ROUTE_FONT, width);
  const total = route.names.length;
  for (let shown = total - 1; shown >= 1; shown--) {
    const line = `via ${route.names.slice(0, shown).join(', ')}, + ${total - shown} more`;
    if (fits(line)) return line;
  }
  const more = total > 1 ? ` + ${total - 1} more` : '';
  return `${oneLine(`via ${route.names[0] ?? ''}`, ROUTE_FONT, width - widthOf(more, ROUTE_FONT))}${more}`;
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

/**
 * The title of a boundary in one line no wider than the room it has: its name and its kind
 * line. When the whole does not fit, the name is cut with an ellipsis to leave room for the
 * kind line, which says whose the system is. Only a room too narrow for the kind line itself
 * cuts that.
 */
export function titleText(boundary: ViewBoundary, width: number): string {
  if (widthOf(boundary.title, TITLE_FONT) <= width) return boundary.title;
  const line = ` ${boundary.line}`;
  const room = width - widthOf(line, TITLE_FONT);
  const name = room > widthOf(ELLIPSIS, TITLE_FONT) ? oneLine(boundary.name, TITLE_FONT, room) : '';
  return name === '' ? oneLine(boundary.title, TITLE_FONT, width) : `${name}${line}`;
}

/** How wide a boundary's title is drawn. */
export function titleWidth(title: string): number {
  return widthOf(title, TITLE_FONT);
}
