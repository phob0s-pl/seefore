import type { Picture, View } from '@seefore/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ELK as Engine } from 'elkjs/lib/elk.bundled.js';
import { drawnOf, graphOf, sorted } from './graph.ts';
import { labelText } from './text.ts';
import type { LabelText } from './text.ts';
import { failed, threw } from './words.ts';

/**
 * The layout of a view: a view in, a picture out, with ELK. No disk, no network and nothing of
 * Node, so that it runs in a worker thread of the server and could run in a page. The runner
 * that keeps it apart from the server, under a time limit, is in `@seefore/layout/node`.
 */

export { flat, linesOf, oneLine } from './lines.ts';
export { ELLIPSIS, graphemesOf, widthOf } from './measure.ts';
export type { Font } from './measure.ts';
export * from './sizes.ts';
export { boxText, labelText } from './text.ts';
export type { BoxText, LabelText } from './text.ts';

/** ELK, made when it is first needed. It runs in the thread that calls it. */
let engine: Engine | undefined;

/**
 * Lays out a view: a place for every box and for the boundary, a route for every arrow, a
 * place for every label, and every text broken into the lines to draw. The same view gives the
 * same picture, whatever the order of its boxes and arrows. When ELK throws, the picture says
 * so in words a reader can use. A layout that never ends cannot be stopped from here: the
 * runner stops it.
 */
export async function layOut(view: View): Promise<Picture> {
  try {
    const input = sorted(view);
    const labels = new Map<string, LabelText>();
    for (const arrow of input.arrows) {
      const label = labelText(arrow);
      if (label !== undefined) labels.set(arrow.id, label);
    }
    engine ??= new ELK();
    const laid = await engine.layout(graphOf(input, labels));
    return drawnOf(input, laid, labels);
  } catch (error) {
    return failed(view.id, 'crash', threw(error));
  }
}
