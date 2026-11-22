import type { PictureAnswer, View, ViewerState } from '@seefore/core';
import type { Route } from './address.ts';
import { holds } from './light.ts';
import type { Target } from './light.ts';

/**
 * What a new reading of the files does to what the page shows: the view stays while the new
 * reading has it, a selection stays while the record is still there, and a picture is taken
 * only for the reading the page holds.
 */

/** What the panel shows: a box or an arrow of the picture, something it passes through, or a record chosen in the listing or on a route. */
export type Selection = Target | { kind: 'record'; id: string };

/** The view a route names in a state, when the state has it. */
export function viewOf(state: ViewerState, route: Route): View | undefined {
  return route.page === 'view' ? state.views.find((view) => view.id === route.view) : undefined;
}

/**
 * What a route opens in a state. A view the state does not have, and the start, open the first
 * view; with no view at all, the start stays, and the page says why there is none.
 */
export function resolveRoute(state: ViewerState, route: Route): Route {
  if (route.page === 'model' || route.page === 'problems') return route;
  if (viewOf(state, route) !== undefined) return route;
  const first = state.views[0];
  return first === undefined ? { page: 'start' } : { page: 'view', view: first.id };
}

/** True when a model has a record with this id. */
function hasRecord(state: ViewerState, id: string): boolean {
  const { model } = state;
  return [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections, model.owners, model.technologies].some((family) =>
    family.some((record) => record.id === id),
  );
}

/**
 * A selection as it stands in a new state: kept while what it names is still there (a box or
 * an arrow in the view shown, a record in the model), and cleared when it is gone.
 */
export function keptSelection(state: ViewerState, route: Route, selection: Selection | null): Selection | null {
  if (selection === null) return null;
  if (selection.kind === 'record') return hasRecord(state, selection.id) ? selection : null;
  const view = viewOf(state, route);
  return view !== undefined && holds(view, selection) ? selection : null;
}

/** True when an answer is the picture of this view for the reading the page holds; one that comes late is not. */
export function accepts(answer: PictureAnswer, state: ViewerState, view: string): boolean {
  return answer.revision === state.revision && answer.picture.view === view;
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
