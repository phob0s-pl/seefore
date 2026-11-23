import type { Model } from '../src/model.ts';
import type { Setting, View, ViewBox } from '../src/picture.ts';
import stage5 from './stage-5.json' with { type: 'json' };

/**
 * What the code of stage 8 made of the models the tests of views build, before stage 9 changed
 * it: every view of each, and its picture. `stage-5.json` holds them, one model to a line, as
 * that code wrote them out; nothing writes it again. The two pictures of stage 5, one system at
 * System depth and one system at Container depth, are held to it, here and in the layout's
 * tests.
 */

/** A box of a view as stage 8 had it: `inside` where a box now names its boundary. */
export type OldBox = Omit<ViewBox, 'boundary'> & { inside: boolean };

/** A view as stage 8 had it: a kind where a view now has a depth, and one boundary where it now has a list. */
export interface OldView extends Omit<View, 'id' | 'depth' | 'scope' | 'boxes' | 'boundaries'> {
  id: string;
  kind: 'context' | 'containers';
  scope: string;
  boxes: OldBox[];
  boundary?: { id: string; name: string; line: string; only?: string; title: string };
}

/** One model, the views stage 8 made of it in the order of its list, and the picture of each. */
export interface Stage5 {
  model: Model;
  views: OldView[];
  /** The picture of each view, in the same order, as stage 8 laid it out: one boundary where a picture now has a list. */
  pictures: unknown[];
}

export const STAGE_5 = stage5 as unknown as Stage5[];

/** The setting of a view of stage 5: its system at System depth for a context view, at Container depth for a container view. */
export function settingOfStage5(view: OldView): Setting {
  return { depth: view.kind === 'context' ? 'system' : 'container', scope: view.scope };
}

/**
 * A view of one system at System or Container depth as stage 8 had it. Only what was renamed is
 * told apart: the id, the depth for the kind, the one boundary for the list, a box's boundary
 * for `inside`. Of the boundary, what stage 8 had: what stage 9 adds to it is not here.
 */
export function asOfStage5(view: View): OldView {
  const [boundary] = view.boundaries;
  const kind = view.depth === 'system' ? 'context' : 'containers';
  return {
    id: `${view.scope ?? ''}.${kind}`,
    kind,
    scope: view.scope ?? '',
    title: view.title,
    boxes: view.boxes.map(({ boundary: parent, ...box }) => ({ ...box, inside: parent !== undefined })),
    ...(boundary === undefined ? {} : { boundary: { id: boundary.id, name: boundary.name, line: boundary.line, ...(boundary.only === undefined ? {} : { only: boundary.only }), title: boundary.title } }),
    arrows: view.arrows,
    left: view.left,
    legend: view.legend,
    passed: view.passed,
  };
}
