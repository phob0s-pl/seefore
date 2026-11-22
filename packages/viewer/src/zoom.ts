import type { Drawn, Rect } from '@seefore/core';
import type { Lit } from './light.ts';

/**
 * What the zoom decides: how much text a picture shows, how it is fitted to the room it has,
 * and when to say that it is too small to read. The numbers are those of
 * `research/diagrams/recommendations.md`, section 4: names stay at 9 pixels or more.
 */

/** Under this zoom a box shows no description: its 12 pixels would be under 9. */
export const NO_SENTENCE_BELOW = 0.75;

/** Under this zoom a box shows no kind line and an arrow no words: 11 and 12 pixels would be under 7. */
export const NO_LINE_BELOW = 0.6;

/** Under this zoom a box shows no name: its 15 pixels would be under 6. */
export const NO_NAME_BELOW = 0.4;

/** From this zoom names can be read; a fitted picture under it says so. */
export const READABLE_FROM = NO_LINE_BELOW;

/** The room left around a fitted picture, as a share of the room on each side. */
export const FIT_PADDING = 0.04;

/** A fitted picture is never drawn larger than full size. */
export const FIT_MAX_ZOOM = 1;

/** The reader can zoom out to this, or to the fit when that is smaller, so that a fit is never cropped. */
export const MIN_ZOOM = 0.05;

/** The reader can zoom in to twice full size. */
export const MAX_ZOOM = 2;

/** How long a move made by a button takes, in milliseconds, for a reader who has not asked for less motion. */
export const MOVE_MS = 200;

/**
 * How much a picture shows at a zoom: `all`; `names-lines` with no descriptions; `names` with
 * no kind lines and no words on arrows; `shapes` with no text at all. What is hidden is still
 * in the name a screen reader gets.
 */
export type Detail = 'all' | 'names-lines' | 'names' | 'shapes';

/** How much a picture shows at a zoom. */
export function detailAt(zoom: number): Detail {
  if (zoom < NO_NAME_BELOW) return 'shapes';
  if (zoom < NO_LINE_BELOW) return 'names';
  if (zoom < NO_SENTENCE_BELOW) return 'names-lines';
  return 'all';
}

/** The width and height of the room a picture is drawn in, in CSS pixels. */
export interface Room {
  width: number;
  height: number;
}

/** Where the canvas looks: the place of the picture's top left on the screen, and the zoom. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * The viewport that shows a rectangle of the picture whole in the middle of the room, with the
 * padding around it, and never larger than full size. There is no smallest zoom, so nothing is
 * cut off.
 */
export function fitViewport(rect: Rect, room: Room): Viewport {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const zoom = Math.min(FIT_MAX_ZOOM, (room.width * (1 - 2 * FIT_PADDING)) / width, (room.height * (1 - 2 * FIT_PADDING)) / height);
  return {
    x: (room.width - width * zoom) / 2 - rect.x * zoom,
    y: (room.height - height * zoom) / 2 - rect.y * zoom,
    zoom: Math.max(zoom, Number.MIN_VALUE),
  };
}

/** The smallest zoom the reader may reach: the fit of the whole picture when that is smaller than the usual floor. */
export function minZoomFor(drawn: Drawn, room: Room): number {
  return Math.min(MIN_ZOOM, fitViewport(whole(drawn), room).zoom);
}

/** The whole picture as a rectangle. */
export function whole(drawn: Drawn): Rect {
  return { x: 0, y: 0, width: drawn.width, height: drawn.height };
}

/** The smallest rectangle that holds every given one. Missing when none is given. */
export function boundsOf(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The rectangle that holds what is lit: its boxes, the boundary when lit, and every point and label of its arrows. */
export function litBounds(drawn: Drawn, lit: Lit): Rect | undefined {
  const rects: Rect[] = drawn.boxes.filter((box) => lit.boxes.has(box.id));
  if (drawn.boundary !== undefined && lit.boxes.has(drawn.boundary.id)) rects.push(drawn.boundary);
  for (const arrow of drawn.arrows) {
    if (!lit.arrows.has(arrow.id)) continue;
    for (const point of arrow.sections.flat()) rects.push({ x: point.x, y: point.y, width: 0, height: 0 });
    if (arrow.label !== undefined) rects.push(arrow.label);
  }
  return boundsOf(rects);
}

/** A share as a reader reads it: `60 %`. */
export function percent(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}

/** How many of a thing, in words: `1 box`, `3 boxes`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The note for a picture too small to read at the zoom it is shown at: how many boxes and
 * arrows it has, and from which zoom names can be read. Missing when names can be read.
 */
export function smallNote(drawn: Drawn, zoom: number): string | undefined {
  if (zoom >= READABLE_FROM) return undefined;
  const boxes = count(drawn.boxes.length, 'box', 'boxes');
  const arrows = count(drawn.arrows.length, 'arrow', 'arrows');
  return `Too small to read at ${percent(zoom)}: ${boxes} and ${arrows}. Names can be read from ${percent(READABLE_FROM)}. Zoom in, or point at a box to follow it.`;
}
