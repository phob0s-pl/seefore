import { DEPTHS, keyOf } from '@seefore/core';
import type { Depth, PictureAnswer, Scope, Setting, View, ViewerState } from '@seefore/core';
import { START } from './address.ts';
import type { Route } from './address.ts';
import { holds } from './light.ts';
import type { Target } from './light.ts';

/**
 * What a new reading of the files does to what the page shows: the depth and the scope stay
 * while the new reading has the box in scope, a selection stays while what it names is still
 * there, and a picture is taken only for the setting and the reading the page wants.
 */

/** What the panel shows: a box, a boundary or an arrow of the picture, something it passes through, or a record chosen in the listing or on a route. */
export type Selection = Target | { kind: 'record'; id: string };

/** What can be the scope in a state, by its id. */
export function scopeOf(state: ViewerState, id: string): Scope | undefined {
  return state.scopes.find((scope) => scope.id === id);
}

/** The deeper of two depths. */
export function deeper(one: Depth, other: Depth): Depth {
  return DEPTHS.indexOf(one) >= DEPTHS.indexOf(other) ? one : other;
}

/**
 * The setting that choosing a box as the scope opens, from the present depth: the same depth,
 * or the box's own when it is deeper, so that one step sets both. Nothing for a box that cannot
 * be the scope.
 */
export function settingFor(state: ViewerState, id: string | null, depth: Depth): Setting | undefined {
  if (id === null) return { depth, scope: null };
  const scope = scopeOf(state, id);
  return scope === undefined ? undefined : { depth: deeper(depth, scope.depth), scope: id };
}

/** What a route opens in a state, and whether the box that was in scope is gone from it. */
export interface Resolved {
  route: Route;
  /** True when the box in scope was shown and the state no longer has it: everything at the same depth stands in its place. */
  gone: boolean;
}

/**
 * What a route opens in a state. The model and the problems open as they are; with no model the
 * start stays, and the page says why there is none. The start opens everything at System depth.
 * A setting opens as it is, for everything or a box that can be the scope, and at the
 * shallowest depth the box has when it names a shallower one. For a box the state does not have:
 * when the reader has been shown it, as when the files change under it, it is gone, and
 * everything at the same depth opens in its place; else the address names what the page does
 * not know, and the start opens.
 */
export function resolveRoute(state: ViewerState, route: Route, shown = false): Resolved {
  if (route.page === 'model' || route.page === 'problems') return { route, gone: false };
  if (!state.available) return { route: { page: 'start' }, gone: false };
  const start: Resolved = { route: { page: 'view', setting: START }, gone: false };
  if (route.page === 'start') return start;
  const { depth, scope } = route.setting;
  const setting = settingFor(state, scope, depth);
  if (setting !== undefined) return { route: { page: 'view', setting }, gone: false };
  return shown ? { route: { page: 'view', setting: { depth, scope: null } }, gone: true } : start;
}

/** True when a model has a record with this id. */
function hasRecord(state: ViewerState, id: string): boolean {
  const { model } = state;
  return [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections, model.owners, model.technologies].some((family) =>
    family.some((record) => record.id === id),
  );
}

/**
 * True when a connection of the model passes through a record with this id. Such a record is
 * there though it is not in the model, when its file has a problem: the connection's route
 * still names it, and its panel says so.
 */
function onRoute(state: ViewerState, id: string): boolean {
  return state.model.connections.some((connection) => connection.via?.includes(id) === true);
}

/**
 * A selection as it stands in a new state, or with a new picture: kept while what it names is
 * still there (a box, a boundary or an arrow in the view drawn, a record in the model or on a
 * route), and cleared when it is gone. A box that opens keeps its selection as a boundary, and
 * a boundary that closes as a box.
 */
export function keptSelection(state: ViewerState, view: View | undefined, selection: Selection | null): Selection | null {
  if (selection === null) return null;
  if (selection.kind === 'record') return hasRecord(state, selection.id) || onRoute(state, selection.id) ? selection : null;
  return view !== undefined && holds(view, selection) ? selection : null;
}

/** True when an answer is the view and picture of this setting for the reading the page holds; one that comes late, for a setting or a reading the page has left, is not. */
export function accepts(answer: PictureAnswer, state: ViewerState, setting: Setting): boolean {
  const key = keyOf(setting);
  return answer.revision === state.revision && answer.view.id === key && answer.picture.view === key;
}

/**
 * The revision an event of the server names. Its data is the revision itself, or JSON that
 * holds it: a string, or an object with `revision`.
 */
export function revisionOf(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'object' && parsed !== null && 'revision' in parsed && typeof parsed.revision === 'string') return parsed.revision;
  } catch {
    // Not JSON: the data is the revision.
  }
  return data;
}
