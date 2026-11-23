import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawn } from '@seefore/core';
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
  detailAt,
  fitViewport,
  litBounds,
  litScale,
  minZoomFor,
  percent,
  reachAt,
  smallNote,
  viewportAfter,
  whole,
} from '../src/zoom.ts';
import type { Viewport } from '../src/zoom.ts';
import { CONTAINERS, CONTAINER_PICTURE } from './fixture.ts';
import { grid } from './grid.ts';

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
  /** A picture of so many boxes and arrows, wherever they stand. */
  const counted = (boxes: number, arrows: number): Drawn => ({
    ...CONTAINER_PICTURE,
    boxes: Array.from({ length: boxes }, (_, at) => ({ ...(CONTAINER_PICTURE.boxes[0] as Drawn['boxes'][number]), id: `box-${at}` })),
    arrows: Array.from({ length: arrows }, (_, at) => ({ ...(CONTAINER_PICTURE.arrows[0] as Drawn['arrows'][number]), id: `arrow-${at}` })),
  });

  it('says, as the spec words it, what is too small to read at the zoom it is shown at, and how to read it', () => {
    expect(smallNote(counted(118, 193), 0.07)).toBe(
      "Too small to read at 7 %: 118 boxes and 193 arrows. Names can be read from 60 %. Zoom in, or point at a box or an arrow, or move the keyboard's focus to it, to read it here. To see one box with its neighbours, choose it as the scope.",
    );
  });

  it('is there under the zoom from which names can be read, and not from it', () => {
    expect(smallNote(CONTAINER_PICTURE, 0.5999)).toContain('Too small to read at 60 %: 4 boxes and 3 arrows.');
    expect(smallNote(CONTAINER_PICTURE, 0.6)).toBeUndefined();
    expect(smallNote(CONTAINER_PICTURE, 1)).toBeUndefined();
  });

  it('is decided by the zoom alone, and counts no box to decide it', () => {
    // Stage 7 had a note of its own for a view of more than 40 boxes, at any zoom.
    const { drawn } = grid(41);
    expect(smallNote(drawn, 0.75)).toBeUndefined();
    expect(smallNote(drawn, 0.2)).toBe(smallNote({ ...drawn, boxes: drawn.boxes.slice(0, 40) }, 0.2)?.replace('40 boxes', '41 boxes'));
    const large = fitViewport(whole(drawn), { width: 1920, height: 1080 }).zoom;
    expect(large).toBeGreaterThanOrEqual(0.6);
    expect(smallNote(drawn, large)).toBeUndefined();
  });

  it('counts one box and one arrow in the singular', () => {
    const one = { ...CONTAINER_PICTURE, boxes: CONTAINER_PICTURE.boxes.slice(0, 1), arrows: CONTAINER_PICTURE.arrows.slice(0, 1) };
    expect(smallNote(one, 0.1)).toContain('1 box and 1 arrow.');
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
