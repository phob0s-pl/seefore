import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawn, View } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { litBy } from '../src/light.ts';
import type { Target } from '../src/light.ts';
import {
  FIT_PADDING,
  MIN_ZOOM,
  REACH_FULL,
  REACH_LEAST,
  REACH_MOST,
  boundsOf,
  changeOf,
  detailAt,
  fitViewport,
  holdOf,
  keptAtDepth,
  litBounds,
  litScale,
  minZoomFor,
  percent,
  reachAt,
  smallNote,
  viewportAfter,
  viewportOnChange,
  whole,
} from '../src/zoom.ts';
import type { PictureChange, Room, Viewport } from '../src/zoom.ts';
import { archiveView, stateOf } from './archive.ts';
import { CARD_CONTEXT, COMPONENTS, COMPONENT_PICTURE, CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE, STATE } from './fixture.ts';
import { grid } from './grid.ts';
import { placedPicture } from './placed.ts';

/** What the zoom hides, how a picture is fitted, and when it says it is too small to read. */

describe('what each zoom hides', () => {
  it('shows everything from three quarters of full size', () => {
    expect(detailAt(2)).toBe('all');
    expect(detailAt(1)).toBe('all');
    expect(detailAt(0.75)).toBe('all');
  });

  it('hides the descriptions under three quarters', () => {
    expect(detailAt(0.74)).toBe('names-lines');
    expect(detailAt(0.6)).toBe('names-lines');
  });

  it('hides the kind lines and the words on arrows under 60 %', () => {
    expect(detailAt(0.59)).toBe('names');
    expect(detailAt(0.4)).toBe('names');
  });

  it('hides the names under 40 %', () => {
    expect(detailAt(0.39)).toBe('shapes');
    expect(detailAt(0.05)).toBe('shapes');
  });
});

describe('what the style sheet hides at each detail', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

  /** The classes the style sheet hides at a detail. */
  function hidden(detail: string): string[] {
    const rule = /([^{}]*)\{\s*visibility:\s*hidden;\s*\}/.exec(css.slice(css.indexOf('.diagram[data-detail=')));
    const selectors = (rule?.[1] ?? '').split(',').map((selector) => selector.trim());
    return selectors
      .filter((selector) => selector.startsWith(`.diagram[data-detail='${detail}']`))
      .map((selector) => selector.split(' ')[1] ?? '')
      .sort();
  }

  it('hides the descriptions first, then the kind lines, the `only` lines and the words on arrows, then all text and every mark but that of kept stores', () => {
    expect(hidden('all')).toEqual([]);
    expect(hidden('names-lines')).toEqual(['.box-sentence']);
    expect(hidden('names')).toEqual(['.arrow-label', '.box-line', '.box-only', '.box-sentence']);
    // A large view opens where only shapes are drawn: the mark of an app that keeps stores is all that says where they went.
    expect(hidden('shapes')).toEqual(['.arrow-label', '.boundary-title', '.box-text', '.mark:not(.mark-kept)']);
  });
});

describe('the fit', () => {
  const room = { width: 1600, height: 1000 };

  it('is never larger than full size, and puts a small picture in the middle', () => {
    const viewport = fitViewport({ x: 0, y: 0, width: 400, height: 200 }, room);
    expect(viewport).toEqual({ x: 600, y: 400, zoom: 1 });
  });

  it('fits a large picture whole, with the padding on the side that limits it', () => {
    const viewport = fitViewport({ x: 0, y: 0, width: 4865, height: 7392 }, room);
    expect(viewport.zoom).toBeCloseTo((1000 * (1 - 2 * FIT_PADDING)) / 7392, 10);
    // Its top is at the padding, and the whole of it is inside the room.
    expect(viewport.y).toBeCloseTo(1000 * FIT_PADDING, 6);
    expect(viewport.x).toBeGreaterThanOrEqual(0);
    expect(viewport.x + 4865 * viewport.zoom).toBeLessThanOrEqual(room.width);
  });

  it('has no smallest zoom, so that a fit never cuts the picture off', () => {
    const viewport = fitViewport({ x: 0, y: 0, width: 200000, height: 1000 }, room);
    expect(viewport.zoom).toBeLessThan(MIN_ZOOM);
    expect(viewport.x).toBeCloseTo(1600 * FIT_PADDING, 6);
  });

  it('frames a part of the picture by its own place', () => {
    const viewport = fitViewport({ x: 1000, y: 500, width: 400, height: 200 }, room);
    expect(viewport).toEqual({ x: 600 - 1000, y: 400 - 500, zoom: 1 });
  });

  it('lets the reader zoom out as far as the fit when the fit is under the usual floor', () => {
    expect(minZoomFor(CONTAINER_PICTURE, room)).toBe(MIN_ZOOM);
    const huge = { ...CONTAINER_PICTURE, width: 100000, height: 100000 };
    expect(minZoomFor(huge, room)).toBe(fitViewport(whole(huge), room).zoom);
  });
});

describe('the bounds of what is lit', () => {
  it('holds every given rectangle', () => {
    expect(
      boundsOf([
        { x: 10, y: 20, width: 5, height: 5 },
        { x: 0, y: 30, width: 100, height: 1 },
      ]),
    ).toEqual({ x: 0, y: 20, width: 100, height: 11 });
    expect(boundsOf([])).toBeUndefined();
  });

  it('holds a lit box, the boxes at the other ends of its arrows, and the arrows with their labels', () => {
    const bounds = litBounds(CONTAINER_PICTURE, litBy(CONTAINERS, { kind: 'box', id: 'orders-database' }));
    // The Order API from 464, the database to 1114, both from 104 down to 254.
    expect(bounds).toEqual({ x: 464, y: 104, width: 1114 - 464, height: 150 });
  });

  it('holds an arrow’s whole route', () => {
    const bounds = litBounds(CONTAINER_PICTURE, litBy(CONTAINERS, { kind: 'arrow', id: 'order-api~card-provider' }));
    expect(bounds).toEqual({ x: 464, y: 104, width: 1480 - 464, height: 630 - 104 });
  });
});

describe('the one note under the counts', () => {
  const everything = { scope: null };
  const one = { scope: 'order-api' };

  it('says, as the spec words it, that the picture is too small to read at the zoom it is shown at, and how to read it', () => {
    expect(smallNote(everything, 0.07)).toBe(
      "Too small to read at 7 %. Names can be read from 60 %. Zoom in, or point at a box or an arrow, or move the keyboard's focus to it, to read it here. To see one box with its neighbours, choose it as the scope.",
    );
    expect(smallNote(one, 0.18)).toBe("Too small to read at 18 %. Names can be read from 60 %. Zoom in, or point at a box or an arrow, or move the keyboard's focus to it, to read it here.");
  });

  it('says how to see one box with its neighbours only with everything as the scope', () => {
    expect(smallNote(everything, 0.3)).toContain('choose it as the scope');
    for (const scope of ['shop', 'order-api', 'checkout', 'customer']) expect(smallNote({ scope }, 0.3), scope).not.toContain('scope');
  });

  it('does not say the numbers of boxes and arrows, which stand on the line above it', () => {
    for (const view of [everything, one]) expect(smallNote(view, 0.07)).not.toMatch(/\d+ (box|boxes|arrow|arrows)\b/);
    expect(smallNote(everything, 0.07)).not.toContain(':');
  });

  it('is there under the zoom from which names can be read, and not from it', () => {
    expect(smallNote(CONTAINERS, 0.5999)).toMatch(/^Too small to read at 60 %\. /);
    expect(smallNote(CONTAINERS, 0.6)).toBeUndefined();
    expect(smallNote(CONTAINERS, 1)).toBeUndefined();
  });

  it('is decided by the zoom alone, and counts no box to decide it', () => {
    // Stage 7 had a note of its own for a view of more than 40 boxes, at any zoom.
    const { view, drawn } = grid(41);
    expect(smallNote(view, 0.75)).toBeUndefined();
    expect(smallNote(view, 0.2)).toBe(smallNote(grid(40).view, 0.2));
    const large = fitViewport(whole(drawn), { width: 1920, height: 1080 }).zoom;
    expect(large).toBeGreaterThanOrEqual(0.6);
    expect(smallNote(view, large)).toBeUndefined();
  });

  it('writes a zoom as a share', () => {
    expect(percent(0.134)).toBe('13 %');
  });
});

describe('how far from its line the pointer finds an arrow', () => {
  it('is half the width of its drawn target at full size, and keeps from 6 to 12 pixels on the screen at any zoom', () => {
    expect(reachAt(1)).toBe(REACH_FULL);
    for (const zoom of [0.05, 0.0736, 0.2, 0.4, 0.6, 1, 1.5, 2]) {
      const onScreen = reachAt(zoom) * zoom;
      expect(onScreen).toBeGreaterThanOrEqual(REACH_LEAST - 1e-9);
      expect(onScreen).toBeLessThanOrEqual(REACH_MOST + 1e-9);
    }
    // The review's largest view opens at 7.36 % in a canvas of 1,000 by 700: its drawn target is 1 pixel, the reach 6 on each side.
    expect(14 * 0.0736).toBeCloseTo(1.03, 2);
    expect(reachAt(0.0736) * 0.0736).toBeCloseTo(REACH_LEAST, 9);
    expect(reachAt(2) * 2).toBe(REACH_MOST);
  });
});

describe('the size of a lit arrow’s head and ring', () => {
  it('keeps its size on the screen below the zoom at which names are drawn, and is as drawn above it', () => {
    expect(litScale(1)).toBe(1);
    expect(litScale(0.4)).toBe(1);
    expect(litScale(0.0736) * 0.0736).toBeCloseTo(1, 9);
    expect(litScale(0.2)).toBe(5);
  });
});

describe('where the picture stands when a new one comes', () => {
  const room = { width: 1600, height: 1000 };
  const viewport = { x: 120, y: -40, zoom: 0.5 };
  const chosen = { kind: 'box' as const, id: 'order-api' };
  /** The container picture with the order API moved by so much, and the picture grown by as much. */
  const moved = (dx: number, dy: number): Drawn => ({
    ...CONTAINER_PICTURE,
    width: CONTAINER_PICTURE.width + dx,
    height: CONTAINER_PICTURE.height + dy,
    boxes: CONTAINER_PICTURE.boxes.map((box) => (box.id === 'order-api' ? { ...box, x: box.x + dx, y: box.y + dy } : box)),
  });
  /** Where the top left of a box, or of the boundary, stands on the screen at a viewport. */
  const onScreen = (drawn: Drawn, id: string, at: Viewport) => {
    const place = drawn.boxes.find((box) => box.id === id) ?? drawn.boundaries.find((boundary) => boundary.id === id);
    return { x: (place?.x ?? 0) * at.zoom + at.x, y: (place?.y ?? 0) * at.zoom + at.y };
  };

  it('keeps a chosen box’s top left at the same point of the screen, at the same zoom', () => {
    const after = moved(300, 180);
    const next = viewportAfter(CONTAINER_PICTURE, after, chosen, viewport, false, room);
    expect(next?.zoom).toBe(viewport.zoom);
    expect(onScreen(after, 'order-api', next ?? viewport)).toEqual(onScreen(CONTAINER_PICTURE, 'order-api', viewport));
  });

  it('holds the chosen box over fitting again, whether the reader has moved the picture or not', () => {
    const after = moved(300, 180);
    expect(viewportAfter(CONTAINER_PICTURE, after, chosen, viewport, true, room)).toEqual(viewportAfter(CONTAINER_PICTURE, after, chosen, viewport, false, room));
    expect(viewportAfter(CONTAINER_PICTURE, after, chosen, viewport, false, room)).not.toEqual(fitViewport(whole(after), room));
  });

  it('holds the boundary when it is what is chosen', () => {
    const [boundary] = CONTAINER_PICTURE.boundaries;
    if (boundary === undefined) throw new Error('The container picture has a boundary.');
    const after: Drawn = { ...CONTAINER_PICTURE, boundaries: [{ ...boundary, x: 500, y: 90 }] };
    const next = viewportAfter(CONTAINER_PICTURE, after, { kind: 'box', id: 'shop' }, viewport, false, room);
    expect(onScreen(after, 'shop', next ?? viewport)).toEqual(onScreen(CONTAINER_PICTURE, 'shop', viewport));
  });

  it('does as before for an arrow chosen, nothing chosen, or a chosen box that is gone: fits again when the reader has not moved, else stays', () => {
    const after = moved(300, 180);
    const gone: Drawn = { ...after, boxes: after.boxes.filter((box) => box.id !== 'order-api') };
    const cases: [Drawn, Target | null][] = [
      [after, { kind: 'arrow', id: 'order-api~card-provider' }],
      [after, null],
      [gone, chosen],
    ];
    for (const [picture, target] of cases) {
      expect(viewportAfter(CONTAINER_PICTURE, picture, target, viewport, false, room)).toEqual(fitViewport(whole(picture), room));
      expect(viewportAfter(CONTAINER_PICTURE, picture, target, viewport, true, room)).toBeUndefined();
    }
  });

  it('moves nothing for a chosen box that stands where it stood', () => {
    expect(viewportAfter(CONTAINER_PICTURE, moved(0, 0), chosen, viewport, false, room)).toEqual(viewport);
  });
});

/**
 * The review of stage 7, its fifth test, as far as it goes without a browser: the counts above
 * the canvas gain a line on a reload, and the canvas moves 18 pixels down the screen. What the
 * page measures is given here as it would measure it. That the page measures it, and moves the
 * picture before the browser paints, needs a browser, and is tried by hand in one.
 */
describe('where the picture stands when a new one comes and the words above the canvas gain a line', () => {
  const room = { width: 1600, height: 900 };
  const viewport = { x: 120, y: -40, zoom: 0.5 };
  const chosen = { kind: 'box' as const, id: 'order-api' };
  const canvasBefore = { x: 240, y: 112 };
  const canvasAfter = { x: 240, y: 130 };
  /** The order API's top left on the screen, in client pixels, for a picture shown at a viewport in a canvas at a place. */
  const onScreen = (drawn: Drawn, at: Viewport, canvas: { x: number; y: number }) => {
    const box = drawn.boxes.find((each) => each.id === 'order-api');
    return { x: canvas.x + at.x + (box?.x ?? 0) * at.zoom, y: canvas.y + at.y + (box?.y ?? 0) * at.zoom };
  };
  const moved = (dx: number, dy: number): Drawn => ({ ...CONTAINER_PICTURE, boxes: CONTAINER_PICTURE.boxes.map((box) => (box.id === 'order-api' ? { ...box, x: box.x + dx, y: box.y + dy } : box)) });

  it('keeps a chosen box at its client place, as measured before, though its place in the picture is the same', () => {
    const box = onScreen(CONTAINER_PICTURE, viewport, canvasBefore);
    const next = viewportAfter(CONTAINER_PICTURE, moved(0, 0), chosen, viewport, false, room, { canvasBefore, canvasAfter, box });
    expect(next).toEqual({ x: 120, y: -58, zoom: 0.5 });
    expect(onScreen(moved(0, 0), next ?? viewport, canvasAfter)).toEqual(box);
    // Without what the page measures, the box would stand 18 pixels lower: the fault the review found.
    const blind = viewportAfter(CONTAINER_PICTURE, moved(0, 0), chosen, viewport, false, room);
    expect(onScreen(moved(0, 0), blind ?? viewport, canvasAfter).y - box.y).toBe(18);
  });

  it('keeps it there when it moves in the picture too, and when the words lose the line again', () => {
    const box = onScreen(CONTAINER_PICTURE, viewport, canvasBefore);
    const after = moved(-200, 90);
    const next = viewportAfter(CONTAINER_PICTURE, after, chosen, viewport, true, room, { canvasBefore, canvasAfter, box });
    expect(onScreen(after, next ?? viewport, canvasAfter)).toEqual(box);
    const back = viewportAfter(after, CONTAINER_PICTURE, chosen, next ?? viewport, true, room, { canvasBefore: canvasAfter, canvasAfter: canvasBefore, box });
    expect(onScreen(CONTAINER_PICTURE, back ?? viewport, canvasBefore)).toEqual(box);
  });

  it('works out where the box stood from the viewport and the canvas when its element was not measured', () => {
    const next = viewportAfter(CONTAINER_PICTURE, moved(30, 0), chosen, viewport, false, room, { canvasBefore, canvasAfter });
    expect(onScreen(moved(30, 0), next ?? viewport, canvasAfter)).toEqual(onScreen(CONTAINER_PICTURE, viewport, canvasBefore));
  });

  it('fits again to the room as it is now, a line shorter, for a box gone, an arrow chosen or nothing chosen, when the reader has not moved the picture', () => {
    const gone: Drawn = { ...CONTAINER_PICTURE, boxes: CONTAINER_PICTURE.boxes.filter((box) => box.id !== 'order-api') };
    const now = { width: room.width, height: room.height - 18 };
    for (const [picture, target] of [
      [gone, chosen],
      [CONTAINER_PICTURE, { kind: 'arrow', id: 'order-api~card-provider' }],
      [CONTAINER_PICTURE, null],
    ] as [Drawn, Target | null][]) {
      expect(viewportAfter(CONTAINER_PICTURE, picture, target, viewport, false, now, { canvasBefore, canvasAfter })).toEqual(fitViewport(whole(picture), now));
    }
  });

  it('keeps a picture the reader has moved where it stood on the screen, with nothing or an arrow chosen, or the chosen box gone', () => {
    const gone: Drawn = { ...CONTAINER_PICTURE, boxes: CONTAINER_PICTURE.boxes.filter((box) => box.id !== 'order-api') };
    for (const [picture, target] of [
      [CONTAINER_PICTURE, null],
      [CONTAINER_PICTURE, { kind: 'arrow', id: 'order-api~card-provider' }],
      [gone, chosen],
    ] as [Drawn, Target | null][]) {
      const next = viewportAfter(CONTAINER_PICTURE, picture, target, viewport, true, room, { canvasBefore, canvasAfter });
      expect(next).toEqual({ x: 120, y: -58, zoom: 0.5 });
    }
    // With the canvas where it stood, it does not move at all.
    expect(viewportAfter(CONTAINER_PICTURE, CONTAINER_PICTURE, null, viewport, true, room, { canvasBefore, canvasAfter: canvasBefore })).toBeUndefined();
  });
});

/**
 * A change of depth, by arithmetic. A picture the reader has not moved stood fitted to its room,
 * and is fitted anew when a box opens or closes. On a picture the reader has moved or zoomed,
 * one box keeps its top left at the same point of the screen, at the same zoom, opening and
 * closing: pass number 21. Where a box stands on the screen is worked out here as React Flow
 * puts it, from the viewport and the place of the canvas; the browser measures the same, and
 * `scripts/shoot.mjs --by-depth` measures it there.
 */
describe('a change of depth', () => {
  const room: Room = { width: 1200, height: 800 };
  /** The top left of a box, or of a boundary, on the screen: in a canvas at a place, shown at a viewport. */
  const onScreen = (drawn: Drawn, id: string, at: Viewport, canvas = { x: 0, y: 0 }) => {
    const place = drawn.boxes.find((box) => box.id === id) ?? drawn.boundaries.find((boundary) => boundary.id === id);
    if (place === undefined) throw new Error(`The picture draws no ${id}.`);
    return { x: canvas.x + at.x + place.x * at.zoom, y: canvas.y + at.y + place.y * at.zoom };
  };
  /** A change from one picture to another, the one before shown at a viewport, which the reader has not moved unless said. */
  const change = (before: [View, Drawn], after: [View, Drawn], viewport: Viewport, more: Partial<PictureChange> = {}): PictureChange => ({
    before: { view: before[0], drawn: before[1] },
    after: { view: after[0], drawn: after[1] },
    chosen: null,
    gone: false,
    viewport,
    moved: false,
    room,
    ...more,
  });
  /** A picture the reader has moved or zoomed. */
  const MOVED = { moved: true };
  const containers: [View, Drawn] = [CONTAINERS, CONTAINER_PICTURE];
  const components: [View, Drawn] = [COMPONENTS, COMPONENT_PICTURE];
  const viewports: Viewport[] = [
    { x: 0, y: 0, zoom: 1 },
    { x: -320, y: 75.5, zoom: 0.43 },
    { x: 640.25, y: -12, zoom: 0.071 },
    { x: 12, y: 30, zoom: 1.7 },
  ];

  it('is told from a new reading and from a change of scope', () => {
    expect(changeOf(CONTAINERS, COMPONENTS)).toBe('depth');
    expect(changeOf(CONTAINERS, CONTAINERS)).toBe('reading');
    expect(changeOf(CONTEXT, CARD_CONTEXT)).toBe('scope');
  });

  it('fits anew a picture the reader has not moved when a box opens, and the page then counts it as not moved', () => {
    for (const viewport of viewports) {
      expect(viewportOnChange(change(containers, components, viewport), room)).toEqual({ viewport: fitViewport(whole(COMPONENT_PICTURE), room), fitted: true });
      // Also when the words above the canvas grow by a line: it is fitted to the room as it is now.
      const now = { width: room.width, height: room.height - 18 };
      expect(viewportOnChange(change(containers, components, viewport), now, { canvasBefore: { x: 240, y: 112 }, canvasAfter: { x: 240, y: 130 } })).toEqual({
        viewport: fitViewport(whole(COMPONENT_PICTURE), now),
        fitted: true,
      });
    }
  });

  it('fits anew a picture the reader has not moved when a box closes', () => {
    for (const viewport of viewports) {
      expect(viewportOnChange(change(components, containers, viewport), room)).toEqual({ viewport: fitViewport(whole(CONTAINER_PICTURE), room), fitted: true });
    }
  });

  it('keeps the box that opens with its top left at the same point of the screen, at the same zoom, on a picture the reader has moved', () => {
    for (const viewport of viewports) {
      const { viewport: next, fitted, kept } = viewportOnChange(change(containers, components, viewport, MOVED), room);
      expect(kept).toBe('order-api');
      expect(fitted).toBe(false);
      expect(next?.zoom).toBe(viewport.zoom);
      const [was, is] = [onScreen(CONTAINER_PICTURE, 'order-api', viewport), onScreen(COMPONENT_PICTURE, 'order-api', next ?? viewport)];
      // Within a pixel, as pass number 21 asks: by arithmetic, to the last digits.
      expect(Math.abs(is.x - was.x)).toBeLessThan(1e-6);
      expect(Math.abs(is.y - was.y)).toBeLessThan(1e-6);
    }
  });

  it('keeps the boundary that closes, its top left where the box now stands, on a picture the reader has moved', () => {
    for (const viewport of viewports) {
      const { viewport: next, fitted, kept } = viewportOnChange(change(components, containers, viewport, MOVED), room);
      expect(kept).toBe('order-api');
      expect(fitted).toBe(false);
      expect(next?.zoom).toBe(viewport.zoom);
      const [was, is] = [onScreen(COMPONENT_PICTURE, 'order-api', viewport), onScreen(CONTAINER_PICTURE, 'order-api', next ?? viewport)];
      expect(Math.abs(is.x - was.x)).toBeLessThan(1e-6);
      expect(Math.abs(is.y - was.y)).toBeLessThan(1e-6);
    }
  });

  it('keeps it there with a line above the canvas that grows by a line as the depth changes, and shrinks again', () => {
    const canvasBefore = { x: 240, y: 112 };
    const canvasAfter = { x: 240, y: 130 };
    for (const viewport of viewports) {
      const opening = viewportOnChange(change(containers, components, viewport, MOVED), room, { canvasBefore, canvasAfter });
      const was = onScreen(CONTAINER_PICTURE, 'order-api', viewport, canvasBefore);
      const is = onScreen(COMPONENT_PICTURE, 'order-api', opening.viewport ?? viewport, canvasAfter);
      expect(Math.abs(is.x - was.x)).toBeLessThan(1e-6);
      expect(Math.abs(is.y - was.y)).toBeLessThan(1e-6);
      // Closing again, the line gone.
      const shown = opening.viewport ?? viewport;
      const closing = viewportOnChange(change(components, containers, shown, MOVED), room, { canvasBefore: canvasAfter, canvasAfter: canvasBefore });
      const back = onScreen(CONTAINER_PICTURE, 'order-api', closing.viewport ?? shown, canvasBefore);
      expect(Math.abs(back.x - was.x)).toBeLessThan(1e-6);
      expect(Math.abs(back.y - was.y)).toBeLessThan(1e-6);
      expect(closing.viewport?.zoom).toBe(viewport.zoom);
    }
  });

  it('keeps it where the page measured its element to stand, when it did', () => {
    const viewport = viewports[1] as Viewport;
    const box = { x: 512.5, y: 300.25 };
    const { viewport: next } = viewportOnChange(change(containers, components, viewport, MOVED), room, { canvasBefore: { x: 240, y: 112 }, canvasAfter: { x: 240, y: 112 }, box });
    expect(onScreen(COMPONENT_PICTURE, 'order-api', next ?? viewport, { x: 240, y: 112 })).toEqual(box);
  });

  it('keeps the chosen box when it opens or closes, before any nearer the middle', () => {
    const app = (depth: 'container' | 'component'): [View, Drawn] => {
      const view = archiveView(`${depth}~order-api`, STATE);
      return [view, placedPicture(view)];
    };
    const [closed, open] = [app('container'), app('component')];
    expect(open[0].boundaries.map((boundary) => boundary.id)).toEqual(['order-api']);
    // The middle of the canvas over a neighbour far from the app: the app is kept all the same.
    const card = closed[1].boxes.find((box) => box.id === 'card-provider');
    const viewport: Viewport = { x: room.width / 2 - ((card?.x ?? 0) + 120), y: room.height / 2 - ((card?.y ?? 0) + 75), zoom: 1 };
    expect(holdOf(change(closed, open, viewport, MOVED))).toEqual({ change: 'depth', box: 'order-api' });
    expect(holdOf(change(open, closed, viewport, MOVED))).toEqual({ change: 'depth', box: 'order-api' });
    expect(viewportOnChange(change(closed, open, viewport, MOVED), room).kept).toBe('order-api');
  });

  it('else keeps the one nearest the middle of the canvas, and of two as near, the first by id', () => {
    const state = stateOf({
      'seefore.yaml': 'format: 1\nname: Pair\n',
      'systems/east.yaml': 'name: East\n',
      'systems/west.yaml': 'name: West\n',
      'apps/east-app.yaml': 'name: East app\nin: east\n',
      'apps/west-app.yaml': 'name: West app\nin: west\n',
    });
    const [system, container] = ['system', 'container'].map((key): [View, Drawn] => {
      const view = archiveView(key, state);
      return [view, placedPicture(view)];
    }) as [[View, Drawn], [View, Drawn]];
    const middle = (id: string) => {
      const place = system[1].boxes.find((box) => box.id === id);
      return { x: (place?.x ?? 0) + 120, y: (place?.y ?? 0) + 75 };
    };
    // The canvas's middle over the middle of a box, or half way between the two.
    const over = (point: { x: number; y: number }): Viewport => ({ x: room.width / 2 - point.x, y: room.height / 2 - point.y, zoom: 1 });
    const [east, west] = [middle('east'), middle('west')];
    expect(keptAtDepth(system[0], system[1], container[0], over(west), room)).toBe('west');
    expect(keptAtDepth(system[0], system[1], container[0], over(east), room)).toBe('east');
    expect(keptAtDepth(system[0], system[1], container[0], over({ x: (east.x + west.x) / 2, y: east.y }), room)).toBe('east');
    // Closing, from where each boundary stands.
    const boundary = container[1].boundaries.find((each) => each.id === 'west');
    const westOpen = { x: (boundary?.x ?? 0) + (boundary?.width ?? 0) / 2, y: (boundary?.y ?? 0) + (boundary?.height ?? 0) / 2 };
    expect(keptAtDepth(container[0], container[1], system[0], over(westOpen), room)).toBe('west');
  });

  it('that opens nothing gives the same picture, and the page does not move, whether the reader has moved it or not', () => {
    const person = (depth: 'system' | 'container' | 'component'): [View, Drawn] => {
      const view = archiveView(`${depth}~customer`, STATE);
      return [view, placedPicture(view)];
    };
    const [system, container] = [person('system'), person('container')];
    expect(container[1].boxes).toEqual(system[1].boxes);
    for (const viewport of viewports) {
      for (const moved of [false, true]) {
        expect(viewportOnChange(change(system, container, viewport, { moved }), room)).toEqual({ viewport: undefined, fitted: false });
        // When the words above the canvas change, the picture stays where it stood on the screen.
        const shifted = viewportOnChange(change(system, container, viewport, { moved }), room, { canvasBefore: { x: 240, y: 112 }, canvasAfter: { x: 240, y: 130 } });
        expect(shifted).toEqual({ viewport: { x: viewport.x, y: viewport.y - 18, zoom: viewport.zoom }, fitted: false });
      }
    }
  });

  it('is said of the zoom it is shown at by the note: the zoom kept on a picture the reader has moved, the new fit on one fitted anew', () => {
    const viewport = viewports[2] as Viewport;
    const { viewport: kept } = viewportOnChange(change(containers, components, viewport, MOVED), room);
    expect(smallNote(COMPONENTS, kept?.zoom ?? 1)).toMatch(new RegExp(`^Too small to read at ${percent(viewport.zoom)}\\. `));
    const { viewport: fitted } = viewportOnChange(change(containers, components, viewport), room);
    expect(fitted?.zoom).toBe(fitViewport(whole(COMPONENT_PICTURE), room).zoom);
    expect(smallNote(COMPONENTS, fitted?.zoom ?? 1)).toBeUndefined();
  });
});

describe('a change of scope', () => {
  const room: Room = { width: 1200, height: 800 };
  const viewport: Viewport = { x: -100, y: 40, zoom: 0.4 };
  const change = (more: Partial<PictureChange> = {}): PictureChange => ({
    before: { view: CONTEXT, drawn: CONTEXT_PICTURE },
    after: { view: CARD_CONTEXT, drawn: CONTEXT_PICTURE },
    chosen: null,
    gone: false,
    viewport,
    moved: true,
    room,
    ...more,
  });

  it('fits the new picture to its room, though the reader had moved the one before or chose a box in both', () => {
    expect(viewportOnChange(change(), room)).toEqual({ viewport: fitViewport(whole(CONTEXT_PICTURE), room), fitted: true });
    expect(viewportOnChange(change({ chosen: { kind: 'box', id: 'customer' } }), room).fitted).toBe(true);
  });

  it('holds the chosen box in place, as a new reading does, when the box in scope is gone from the files', () => {
    const gone = change({ gone: true, chosen: { kind: 'box', id: 'customer' } });
    expect(holdOf(gone)).toEqual({ change: 'scope', box: 'customer' });
    expect(viewportOnChange(gone, room)).toEqual({ viewport, fitted: false });
  });
});
