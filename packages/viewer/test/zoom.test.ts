import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { litBy } from '../src/light.ts';
import { FIT_PADDING, MIN_ZOOM, boundsOf, detailAt, fitViewport, litBounds, minZoomFor, percent, smallNote, whole } from '../src/zoom.ts';
import { CONTAINERS, CONTAINER_PICTURE } from './fixture.ts';

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

  it('hides the descriptions first, then the kind lines, the `only` lines and the words on arrows, then all text', () => {
    expect(hidden('all')).toEqual([]);
    expect(hidden('names-lines')).toEqual(['.box-sentence']);
    expect(hidden('names')).toEqual(['.arrow-label', '.box-line', '.box-only', '.box-sentence']);
    expect(hidden('shapes')).toEqual(['.arrow-label', '.boundary-title', '.box-text', '.mark']);
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

describe('the note for a picture too small to read', () => {
  it('says how many boxes and arrows it has, and from which zoom names can be read', () => {
    expect(smallNote(CONTAINER_PICTURE, 0.2)).toBe(
      'Too small to read at 20 %: 4 boxes and 3 arrows. Names can be read from 60 %. Zoom in, or point at a box to follow it.',
    );
  });

  it('is not there once names can be read', () => {
    expect(smallNote(CONTAINER_PICTURE, 0.6)).toBeUndefined();
    expect(smallNote(CONTAINER_PICTURE, 1)).toBeUndefined();
  });

  it('counts one box and one arrow in the singular', () => {
    const one = { ...CONTAINER_PICTURE, boxes: CONTAINER_PICTURE.boxes.slice(0, 1), arrows: CONTAINER_PICTURE.arrows.slice(0, 1) };
    expect(smallNote(one, 0.1)).toContain('1 box and 1 arrow.');
  });

  it('writes a zoom as a share', () => {
    expect(percent(0.134)).toBe('13 %');
  });
});
