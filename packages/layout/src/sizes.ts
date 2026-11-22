import type { BoxLook } from '@seefore/core';
import type { Font } from './measure.ts';

/**
 * The sizes a picture is laid out with. Those the research measured (`recommendations.md`,
 * section 4) say so; the others are this package's own, and the page draws with the same.
 */

/** The width of every box, whatever its kind. Measured: wide enough for a first sentence in four lines. */
export const BOX_WIDTH = 240;

/** The height of every box, whatever its kind. Measured, with the width. */
export const BOX_HEIGHT = 150;

/** The room between the left or right edge of a box and its text. About 39 characters of the sentence fit on a line. */
export const BOX_PADDING = 12;

/** The widest a line of text in a box may be, in a box whose shape fills its rectangle. */
export const BOX_TEXT_WIDTH = BOX_WIDTH - 2 * BOX_PADDING;

/** How far a box's text stands in from its left and its right edge. */
export interface Inset {
  left: number;
  right: number;
}

/**
 * How far the text stands in from the edges of a box of each look. Most shapes fill their
 * rectangle, and their text has the box's padding. A queue or a topic keeps its text clear of
 * the near end drawn on its right, and a piece of infrastructure of the points at its sides.
 * The layout breaks the text for the room between, and the page draws it there.
 */
export const TEXT_INSET: Readonly<Record<BoxLook, Inset>> = {
  person: { left: BOX_PADDING, right: BOX_PADDING },
  'system-scope': { left: BOX_PADDING, right: BOX_PADDING },
  system: { left: BOX_PADDING, right: BOX_PADDING },
  'system-external': { left: BOX_PADDING, right: BOX_PADDING },
  app: { left: BOX_PADDING, right: BOX_PADDING },
  store: { left: BOX_PADDING, right: BOX_PADDING },
  'queue-or-topic': { left: BOX_PADDING, right: BOX_PADDING + 8 },
  infrastructure: { left: BOX_PADDING + 4, right: BOX_PADDING + 4 },
};

/** The name of a box: 15 px bold. Measured. */
export const NAME_FONT: Font = { size: 15, bold: true };

/** The most lines the name of a box takes. Measured: two hold every name but a few. */
export const NAME_LINES = 2;

/** The kind line of a box, `[App: service · Go]`: 11 px, in one line. Measured; never smaller than 11 px. */
export const KIND_FONT: Font = { size: 11, bold: false };

/** The first sentence of a box's description: 12 px. Measured. */
export const SENTENCE_FONT: Font = { size: 12, bold: false };

/** The most lines the first sentence takes. Measured: four show the whole sentence in most boxes. */
export const SENTENCE_LINES = 4;

/** The names on an arrow's label: 12 px. Measured. */
export const LABEL_FONT: Font = { size: 12, bold: false };

/** The widest a label may be. Measured: 140 px and three lines cut 2 % of the labels. */
export const LABEL_WIDTH = 140;

/** The most lines of names a label has, `+ n more` among them. Measured, with the width. */
export const LABEL_LINES = 3;

/** The height of a line of names on a label. */
export const LABEL_LINE_HEIGHT = 15;

/** The route line of a label, `via Ingress, Workhorse`: 11 px, in one line under the names and above the technology, set as the technology is. */
export const ROUTE_FONT: Font = { size: 11, bold: false };

/** The height of the route line of a label. */
export const ROUTE_LINE_HEIGHT = 14;

/** The technology line of a label, `[HTTPS, JSON]`: 11 px, in one line under the names. Measured. */
export const TECHNOLOGY_FONT: Font = { size: 11, bold: false };

/** The height of the technology line of a label. */
export const TECHNOLOGY_LINE_HEIGHT = 14;

/** The title of a boundary, `Shop [System]`: 16 px bold, in one line. Measured. */
export const TITLE_FONT: Font = { size: 16, bold: true };

/** The height of the line of a boundary's title. */
export const TITLE_LINE_HEIGHT = 20;

/** The room inside a boundary around what it holds. Measured: the title sits in the top 44 px. */
export const BOUNDARY_PADDING = { top: 44, left: 24, bottom: 24, right: 24 } as const;

/** A context view of this many boxes or more has its long row of systems split in two. Measured: it fits 28 to 88 % larger. */
export const UNZIP_FROM = 16;
