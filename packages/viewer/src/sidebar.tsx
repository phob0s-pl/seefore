import type { View, ViewerState } from '@seefore/core';
import { addressOf } from './address.ts';
import type { Route } from './address.ts';

/**
 * The sidebar: the systems that have parts, each with its views; then the other systems,
 * folded; then the model's listing; then the problems with their number.
 */

/** The views of one system, in the order the state lists them. */
export interface SystemViews {
  id: string;
  name: string;
  views: View[];
}

/** The views by system, in the state's order: the systems with a container view, and the others. */
export function viewsBySystem(state: ViewerState): { withParts: SystemViews[]; others: SystemViews[] } {
  const names = new Map(state.model.systems.map((system) => [system.id, system.name]));
  const systems: SystemViews[] = [];
  for (const view of state.views) {
    let system = systems.find((each) => each.id === view.scope);
    if (system === undefined) {
      system = { id: view.scope, name: names.get(view.scope) ?? view.scope, views: [] };
      systems.push(system);
    }
    system.views.push(view);
  }
  const hasParts = (system: SystemViews) => system.views.some((view) => view.kind === 'containers');
  return { withParts: systems.filter(hasParts), others: systems.filter((system) => !hasParts(system)) };
}

/** What a link to a view says in the sidebar: its kind, since the system is above it. */
function viewWords(view: View): string {
  return view.kind === 'context' ? 'Context view' : 'Container view';
}

/** A link in the sidebar, marked when it is what the page shows. */
function Link({ route, current, children }: { route: Route; current: Route; children: string }) {
  const here = addressOf(route) === addressOf(current);
  return (
    <a href={addressOf(route)} {...(here ? { 'aria-current': 'page' as const } : {})}>
      {children}
    </a>
  );
}

export function Sidebar({ state, route }: { state: ViewerState | null; route: Route }) {
  const { withParts, others } = state === null ? { withParts: [], others: [] } : viewsBySystem(state);
  const problems = state?.problems.length ?? 0;
  const othersOpen = route.page === 'view' && others.some((system) => system.views.some((view) => view.id === route.view));
  return (
    <nav className="sidebar" aria-label="Views">
      <p className="model-name">{state?.name ?? 'seefore'}</p>
      {withParts.length > 0 && (
        <ul className="systems">
          {withParts.map((system) => (
            <li key={system.id}>
              <span className="system-name">{system.name}</span>
              <ul>
                {system.views.map((view) => (
                  <li key={view.id}>
                    <Link route={{ page: 'view', view: view.id }} current={route}>
                      {viewWords(view)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details className="others" open={othersOpen}>
          <summary>{`${withParts.length > 0 ? 'Other systems' : 'Systems'} (${others.length})`}</summary>
          <ul>
            {others.map((system) => (
              <li key={system.id}>
                {system.views.map((view) => (
                  <Link key={view.id} route={{ page: 'view', view: view.id }} current={route}>
                    {system.name}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ul className="pages">
        <li>
          <Link route={{ page: 'model' }} current={route}>
            Model
          </Link>
        </li>
        <li>
          <Link route={{ page: 'problems' }} current={route}>
            {`Problems (${problems})`}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
