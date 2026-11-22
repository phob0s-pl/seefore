import type { ViewArrow, ViewBoundary, ViewBox, ViewRoute } from '@seefore/core';
import { linesOf, oneLine } from './lines.ts';
import { ELLIPSIS, widthOf } from './measure.ts';
import {
  BOX_WIDTH,
  CONDITION_FONT,
  CONDITION_LINE_HEIGHT,
  KIND_FONT,
  LABEL_FONT,
  LABEL_LINE_HEIGHT,
  LABEL_LINES,
  LABEL_WIDTH,
  NAME_FONT,
  NAME_LINES,
  ONLY_FONT,
  ONLY_LINES,
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
  /** The line of its own `only`, `only in the hosted edition`, in one line; missing when it has none. */
  only?: string;
  /** The first sentence, in at most four lines, or three under an `only` line; none when there is no sentence. */
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
  /**
   * The `only` line, `only in the hosted edition` or `only on 2 of 5`, when any connection of
   * the arrow has an `only` of its own: in one line, or two when its words need them.
   */
  only?: string[];
  /** The line `far side opened on 2 of 5`, when only some connections of the arrow say so. */
  opened?: string;
  /** The technology line, `[HTTPS, JSON]`, when every connection of the arrow names the same. */
  technology?: string;
  /** The room the label takes, in whole pixels: as wide as its widest line, as high as its lines. */
  width: number;
  height: number;
}

/**
 * The text of a box, broken into lines that fit inside the room its shape leaves, each cut with
 * an ellipsis when it must be. A box with an `only` of its own says it under the kind line, and
 * its first sentence has a line less for it.
 */
export function boxText(box: ViewBox): BoxText {
  const inset = TEXT_INSET[box.look];
  const width = BOX_WIDTH - inset.left - inset.right;
  const sentenceLines = box.only === undefined ? SENTENCE_LINES : SENTENCE_LINES - 1;
  return {
    name: linesOf(box.name, NAME_FONT, width, NAME_LINES),
    line: oneLine(box.line, KIND_FONT, width),
    ...(box.only === undefined ? {} : { only: oneLine(`only ${box.only}`, ONLY_FONT, width) }),
    sentence: box.sentence === undefined ? [] : linesOf(box.sentence, SENTENCE_FONT, width, sentenceLines),
    inset: { ...inset },
  };
}

/**
 * The label of an arrow. A single connection's name takes up to three lines. Two or three
 * names have a line each. More have two lines, and `+ n more` for the rest. Under them, the
 * route on a line of its own; under that when the connections are there, in up to two lines,
 * and that the far side opened the channel of some, on a line of its own; and last the
 * technology. No line is wider than the label may be, but a line that says on how many, `only
 * on 2 of 5` or `far side opened on 2 of 5`, which is short and whose numbers must not be cut.
 * An arrow with no text has no label.
 */
export function labelText(arrow: ViewArrow): LabelText | undefined {
  const lines = nameLines(arrow.names);
  const route = arrow.route === undefined ? undefined : routeLine(arrow.route, LABEL_WIDTH);
  // The words of a condition are cut only after a second line, as a name is: cut after one, most said too little.
  const only = arrow.only === undefined ? undefined : arrow.only.words === undefined ? [arrow.only.line] : linesOf(arrow.only.line, CONDITION_FONT, LABEL_WIDTH, ONLY_LINES);
  const opened = arrow.opened?.line;
  const technology = arrow.technology.length === 0 ? undefined : oneLine(`[${arrow.technology.join(', ')}]`, TECHNOLOGY_FONT, LABEL_WIDTH);
  if (lines.length === 0 && route === undefined && only === undefined && opened === undefined && technology === undefined) return undefined;
  const widths = [
    ...lines.map((line) => widthOf(line, LABEL_FONT)),
    route === undefined ? 0 : widthOf(route, ROUTE_FONT),
    ...(only ?? []).map((line) => widthOf(line, CONDITION_FONT)),
    opened === undefined ? 0 : widthOf(opened, CONDITION_FONT),
    technology === undefined ? 0 : widthOf(technology, TECHNOLOGY_FONT),
  ];
  const conditions = (only?.length ?? 0) + (opened === undefined ? 0 : 1);
  return {
    lines,
    ...(route === undefined ? {} : { route }),
    ...(only === undefined ? {} : { only }),
    ...(opened === undefined ? {} : { opened }),
    ...(technology === undefined ? {} : { technology }),
    width: Math.ceil(Math.max(...widths)),
    height:
      lines.length * LABEL_LINE_HEIGHT +
      (route === undefined ? 0 : ROUTE_LINE_HEIGHT) +
      conditions * CONDITION_LINE_HEIGHT +
      (technology === undefined ? 0 : TECHNOLOGY_LINE_HEIGHT),
  };
}

/**
 * The route line of a label, no wider than `width`. When the names of what the connections pass
 * through do not all fit, it gives as many whole names as fit and then how many are left, as
 * in `via Content delivery network, + 1 more`; when not even the first fits whole, it cuts that
 * one and still says how many are left: `via Content delivery… + 1 more`. A name in brackets is
 * cut inside them, and keeps both, since they say that the thing is not always there:
 * `via (Enterprise…), + 1 more`. So a reader can always tell how many things are on the way,
 * and which of them have a condition. `via on 2 of 5` is cut, if it must be, as any line is.
 */
export function routeLine(route: ViewRoute, width: number): string {
  const fits = (text: string) => widthOf(text, ROUTE_FONT) <= width;
  if (route.hops.length === 0 || fits(route.line)) return oneLine(route.line, ROUTE_FONT, width);
  const said = route.hops.map((hop) => (hop.bracketed ? `(${hop.name})` : hop.name));
  const total = said.length;
  for (let shown = total - 1; shown >= 1; shown--) {
    const line = `via ${said.slice(0, shown).join(', ')}, + ${total - shown} more`;
    if (fits(line)) return line;
  }
  const [first] = route.hops;
  if (first?.bracketed === true) {
    const more = total > 1 ? `, + ${total - 1} more` : '';
    const room = width - widthOf(`via ()${more}`, ROUTE_FONT);
    return `via (${oneLine(first.name, ROUTE_FONT, room)})${more}`;
  }
  // A name with no brackets is cut as it always was, so that a picture of a model with no condition is as it was.
  const more = total > 1 ? ` + ${total - 1} more` : '';
  return `${oneLine(`via ${first?.name ?? ''}`, ROUTE_FONT, width - widthOf(more, ROUTE_FONT))}${more}`;
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
 * The title of a boundary in one line no wider than the room it has: its name, its kind line,
 * and the system's own `only` when it has one. When the whole does not fit, the kind line, which
 * says whose the system is, stays whole, and the name and the `only` share what is left: each
 * keeps what it needs when the other leaves it room, and else half, cut with an ellipsis. Only a
 * room too narrow for the kind line itself cuts that.
 */
export function titleText(boundary: ViewBoundary, width: number): string {
  if (widthOf(boundary.title, TITLE_FONT) <= width) return boundary.title;
  const line = ` ${boundary.line}`;
  const room = width - widthOf(line, TITLE_FONT);
  if (room <= widthOf(ELLIPSIS, TITLE_FONT)) return oneLine(boundary.title, TITLE_FONT, width);
  if (boundary.only === undefined) return `${oneLine(boundary.name, TITLE_FONT, room)}${line}`;
  const only = `only ${boundary.only}`;
  const space = widthOf(' ', TITLE_FONT);
  const nameRoom = Math.min(widthOf(boundary.name, TITLE_FONT), Math.max(room - space - widthOf(only, TITLE_FONT), room / 2));
  const name = oneLine(boundary.name, TITLE_FONT, nameRoom);
  const onlyRoom = room - widthOf(name, TITLE_FONT) - space;
  return `${name}${line} ${oneLine(only, TITLE_FONT, onlyRoom)}`;
}

/** How wide a boundary's title is drawn. */
export function titleWidth(title: string): number {
  return widthOf(title, TITLE_FONT);
}
