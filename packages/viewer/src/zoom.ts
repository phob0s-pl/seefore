import type { Drawn, Rect } from '@seefore/core';
import type { Lit, Target } from './light.ts';

/**
 * What the zoom decides: how much text a picture shows, how it is fitted to the room it has,
 * where it stands when a new picture of it comes, and the note under the counts, that it is too
 * small to read at the zoom it is shown at. Nothing counts boxes to decide a note. The numbers
 * are those of `research/diagrams/recommendations.md`, section 4: names stay at 9 pixels or more.
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

/**
 * How far from its line the pointer finds an arrow, on the screen, in CSS pixels: never less
 * than `REACH_LEAST`, so that at a map's zoom an arrow can still be hit, and never more than
 * `REACH_MOST`, so that zoomed in it does not take the room of its neighbours. Between them it is
 * half the width of the target an arrow draws, 14 at full size.
 */
export const REACH_LEAST = 6;
export const REACH_MOST = 12;
export const REACH_FULL = 7;

/** How far from its line the pointer finds an arrow at a zoom, in the picture's units. */
export function reachAt(zoom: number): number {
  return Math.min(Math.max(REACH_FULL, REACH_LEAST / zoom), REACH_MOST / zoom);
}

/**
 * How many times its size a lit arrow's head and ring are drawn at a zoom: below the zoom at
 * which names are drawn, so many that they keep their size on the screen, as the lit line keeps
 * its width; else as they are.
 */
export function litScale(zoom: number): number {
  return zoom < NO_NAME_BELOW ? 1 / zoom : 1;
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

/** The rectangle that holds what is lit: its boxes, each boundary that is lit, and every point and label of its arrows. */
export function litBounds(drawn: Drawn, lit: Lit): Rect | undefined {
  const rects: Rect[] = [...drawn.boxes, ...drawn.boundaries].filter((box) => lit.boxes.has(box.id));
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
 * The one note under the counts of a picture: that it is too small to read at `zoom`, the zoom
 * it is shown at, which is under the zoom from which names can be read. It says how many boxes
 * and arrows the picture has, from which zoom names can be read, how to read a box or an arrow
 * here, and how to see one box with its neighbours. It is never said of a zoom the picture
 * would have opened at, and nothing but the zoom decides it. Missing when names can be read.
 */
export function smallNote(drawn: Drawn, zoom: number): string | undefined {
  if (zoom >= READABLE_FROM) return undefined;
  const boxes = count(drawn.boxes.length, 'box', 'boxes');
  const arrows = count(drawn.arrows.length, 'arrow', 'arrows');
  return (
    `Too small to read at ${percent(zoom)}: ${boxes} and ${arrows}. Names can be read from ${percent(READABLE_FROM)}. ` +
    "Zoom in, or point at a box or an arrow, or move the keyboard's focus to it, to read it here. To see one box with its neighbours, choose it as the scope."
  );
}

/** The place of a box, or of a boundary, in a picture. Missing when the picture does not draw it. */
function placeOf(drawn: Drawn, id: string): Rect | undefined {
  return drawn.boxes.find((box) => box.id === id) ?? drawn.boundaries.find((boundary) => boundary.id === id);
}

/** A point on the screen, in the client pixels of the browser's window. */
export interface ClientPoint {
  x: number;
  y: number;
}

/**
 * Where things stood on the screen when a new picture came, as the page measures them: the top
 * left of the canvas just before the new picture and the words above it are put in, the same
 * just after, before the browser paints, and the top left of the chosen box as it was drawn
 * before, when one was. The words above the canvas may have grown or shrunk by a line, and the
 * canvas moved with them.
 */
export interface OnScreen {
  canvasBefore: ClientPoint;
  canvasAfter: ClientPoint;
  box?: ClientPoint;
}

/**
 * Where the canvas looks when a new picture of the same view comes, the one before shown at
 * `viewport`. A chosen box, or a boundary, that both pictures draw keeps its top left where it
 * stood on the screen, at the same zoom, so that a reader who watches the page while the files
 * change keeps the place: that wins over fitting again. Else a picture the reader has not moved
 * is fitted again to the room. Else it stays where it is on the screen, though the canvas moved.
 * Missing when the viewport stays as it is.
 *
 * Without `screen` the canvas is taken to stand where it stood, and the box where the viewport
 * put it.
 */
export function viewportAfter(before: Drawn, after: Drawn, chosen: Target | null, viewport: Viewport, moved: boolean, room: Room | null, screen?: OnScreen): Viewport | undefined {
  const { zoom } = viewport;
  // How far the canvas moved down the screen, which the viewport takes back.
  const shift = screen === undefined ? { x: 0, y: 0 } : { x: screen.canvasBefore.x - screen.canvasAfter.x, y: screen.canvasBefore.y - screen.canvasAfter.y };
  const was = chosen?.kind === 'box' ? placeOf(before, chosen.id) : undefined;
  const is = chosen?.kind === 'box' ? placeOf(after, chosen.id) : undefined;
  if (was !== undefined && is !== undefined) {
    // Where the box stood on the screen, measured when it can be, else from the viewport.
    const stood = screen?.box ?? (screen === undefined ? { x: viewport.x + was.x * zoom, y: viewport.y + was.y * zoom } : { x: screen.canvasBefore.x + viewport.x + was.x * zoom, y: screen.canvasBefore.y + viewport.y + was.y * zoom });
    const canvas = screen?.canvasAfter ?? { x: 0, y: 0 };
    return { x: stood.x - canvas.x - is.x * zoom, y: stood.y - canvas.y - is.y * zoom, zoom };
  }
  if (!moved && room !== null) return fitViewport(whole(after), room);
  if (shift.x === 0 && shift.y === 0) return undefined;
  return { x: viewport.x + shift.x, y: viewport.y + shift.y, zoom };
}
