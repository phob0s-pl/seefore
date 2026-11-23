import { viewsFor } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { STAGE_5, settingOfStage5 } from '../../core/test/stage-5.ts';
import { layOut } from '../src/index.ts';

/**
 * The two pictures of stage 5 keep their places: one system at System depth and one system at
 * Container depth, laid out from the views above them as the server lays them out, stand where
 * the code of stage 8 put every box, boundary, line and label of the models the tests of views
 * build (`stage-5.ts` in the core's tests). Only what was renamed differs: the view's id, and the
 * one boundary for the list.
 */

describe('the pictures of stage 5', () => {
  it('stand where stage 8 put them, in every place and size', async () => {
    let compared = 0;
    for (const { model, views, pictures } of STAGE_5) {
      const made = viewsFor(model);
      for (const [at, old] of views.entries()) {
        const setting = settingOfStage5(old);
        const view = made.viewOf(setting);
        if (view === undefined) throw new Error(`No view of ${old.id}.`);
        // Neither takes its turns from a picture above it: one is the shallowest, the other keeps its own walk.
        expect(made.above(setting)).toEqual([]);
        const picture = await layOut(view, []);
        if ('failed' in picture) throw new Error(`${old.id} was not drawn: ${picture.failed.message}`);
        const { boundaries, view: id, ...rest } = picture;
        expect(id).toBe(view.id);
        expect(boundaries.length).toBeLessThanOrEqual(1);
        expect({ ...rest, view: old.id, ...(boundaries[0] === undefined ? {} : { boundary: boundaries[0] }) }).toEqual(pictures[at]);
        compared += 1;
      }
    }
    expect(compared).toBe(266);
  }, 60_000);
});
