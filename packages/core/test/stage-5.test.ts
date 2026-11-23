import { describe, expect, it } from 'vitest';
import { viewsFor, viewsOf } from '../src/views.ts';
import { STAGE_5, asOfStage5, settingOfStage5 } from './stage-5.ts';

/**
 * The two pictures of stage 5 do not change: one system at System depth is its context view, and
 * one system at Container depth its container view, as the code of stage 8 made them of every
 * model the tests of views build (`stage-5.ts`). Only what was renamed differs. The layout's
 * tests hold their places.
 */

describe('the two pictures of stage 5', () => {
  it('are listed as stage 8 listed them, under the keys of their settings', () => {
    for (const { model, views } of STAGE_5) {
      expect(viewsOf(model).map((view) => view.id)).toEqual(views.map((view) => `${view.kind === 'context' ? 'system' : 'container'}~${view.scope}`));
    }
  });

  it('have every box, mark, arrow, label, route, omission and line of the legend that stage 8 gave them', () => {
    let compared = 0;
    for (const { model, views } of STAGE_5) {
      const made = viewsFor(model);
      for (const old of views) {
        const view = made.viewOf(settingOfStage5(old));
        expect(view).toBeDefined();
        if (view === undefined) continue;
        expect(asOfStage5(view)).toEqual(old);
        compared += 1;
      }
    }
    expect(compared).toBe(266);
  });

  it('give the boundary of a container view only what stage 9 adds: the chosen system, and its connections to itself, which its context view marks too', () => {
    let boundaries = 0;
    let marked = 0;
    for (const { model, views } of STAGE_5) {
      const made = viewsFor(model);
      for (const old of views) {
        const view = made.viewOf(settingOfStage5(old));
        expect(view?.boundaries).toHaveLength(old.boundary === undefined ? 0 : 1);
        for (const boundary of view?.boundaries ?? []) {
          const loops = model.connections.filter((connection) => connection.from === boundary.id && connection.to === boundary.id).map((connection) => connection.id);
          expect(boundary).toMatchObject({ family: 'systems', scope: true, loops, within: [], passing: [], kept: [] });
          expect(boundary).not.toHaveProperty('boundary');
          boundaries += 1;
          if (loops.length > 0) marked += 1;
        }
      }
    }
    expect([boundaries, marked]).toEqual([105, 2]);
  });
});
