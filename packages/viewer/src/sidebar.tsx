import { DEPTHS, DEPTH_WORDS, EVERYTHING } from '@seefore/core';
import type { Depth, Scope, Setting, ViewerState } from '@seefore/core';
import { useId, useMemo } from 'react';
import { addressOf } from './address.ts';
import type { Route } from './address.ts';
import { scopeOf, settingFor } from './follow.ts';
import { indexOf, nameOf } from './records.ts';

/**
 * The sidebar: the model's name; the two controls, Depth and then Scope, which together are the
 * setting the picture shows; then "View", which leads back to the picture, "Model" and
 * "Problems" with their number. The controls are what the browser gives, a group of radio
 * buttons and a list, so that a keyboard and a screen reader work them as they are.
 */

/** One box in the list of what can be the scope: its id, and the words it is listed by. */
export interface ScopeOption {
  id: string;
  label: string;
}

/** A group of the list of what can be the scope, as the listing under "Model" groups them. */
export interface ScopeGroup {
  label: string;
  options: ScopeOption[];
}

/**
 * The groups of what can be the scope, in the order and the groups of the listing: the people;
 * each system that has parts, in a group named for it, with its apps, each followed by its
 * components, then its stores and its pieces of infrastructure; the other systems; the pieces of
 * infrastructure in no system. A box is listed by its own name, and a component with its app's
 * after it in brackets, `Checkout (Order API)`, so that the closed control shows the name. Two
 * boxes of one name, not counting capitals, and one named as "Everything" is, are told apart by
 * their ids: `Shop (shop-old)`, `Worker (api-worker) (Order API)`.
 */
export function scopeGroups(state: ViewerState): ScopeGroup[] {
  const index = indexOf(state.model);
  const withParts = new Set(state.outline.withParts.map((system) => system.id));
  const names = state.scopes.map((scope) => nameOf(index, scope.id));
  // Names are compared as a reader tells them apart: `Shop` and `shop` are one name.
  const same = (name: string) => name.toLocaleLowerCase('en');
  const counted = new Map<string, number>();
  for (const name of names) counted.set(same(name), (counted.get(same(name)) ?? 0) + 1);
  const label = (scope: Scope, at: number) => {
    const name = names[at] ?? scope.id;
    const told = (counted.get(same(name)) ?? 0) > 1 || same(name) === same(EVERYTHING) ? `${name} (${scope.id})` : name;
    // A component stands after its app, and has the app's name after its own.
    const found = index.get(scope.id);
    return found?.family === 'components' ? `${told} (${nameOf(index, found.record.in)})` : told;
  };
  // Each group with its kind: a system with parts has a group of its own, named for it.
  const groups: (ScopeGroup & { kind: 'people' | 'system' | 'others' | 'infrastructure' })[] = [];
  const into = (kind: (typeof groups)[number]['kind'], title: string) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.kind === kind && kind !== 'system') return last;
    const group = { kind, label: title, options: [] };
    groups.push(group);
    return group;
  };
  let current: ScopeGroup | undefined;
  const others = state.outline.withParts.length > 0 ? 'Other systems' : 'Systems';
  state.scopes.forEach((scope, at) => {
    const option = { id: scope.id, label: label(scope, at) };
    if (scope.family === 'people') current = into('people', 'People');
    else if (scope.family === 'systems') current = withParts.has(scope.id) ? into('system', option.label) : into('others', others);
    // A piece of infrastructure in no system has the shallowest depth; one in a system stands with it.
    else if (scope.family === 'infrastructure' && scope.depth === 'system') current = into('infrastructure', 'Infrastructure');
    // A part stands in the group of its system, which comes just before it.
    current?.options.push(option);
  });
  return groups.map(({ label: title, options }) => ({ label: title, options }));
}

/** True when a depth is shallower than another. */
function shallower(depth: Depth, than: Depth): boolean {
  return DEPTHS.indexOf(depth) < DEPTHS.indexOf(than);
}

/** A link in the sidebar, marked when it is what the page shows. */
function Link({ route, here, children }: { route: Route; here: boolean; children: string }) {
  return (
    <a href={addressOf(route)} {...(here ? { 'aria-current': 'page' as const } : {})}>
      {children}
    </a>
  );
}

export interface SidebarProps {
  state: ViewerState | null;
  route: Route;
  /** The setting the controls show: the one drawn or laid out, or on the model and the problems the last one shown. */
  setting: Setting;
  /** Opens a setting the reader chose. */
  onGo(route: Route): void;
}

export function Sidebar({ state, route, setting, onGo }: SidebarProps) {
  const problems = state?.problems.length ?? 0;
  const ids = useId();
  const groups = useMemo(() => (state === null ? [] : scopeGroups(state)), [state]);
  // With no model there is nothing to choose.
  const off = state === null || !state.available;
  const scope = state === null || setting.scope === null ? undefined : scopeOf(state, setting.scope);
  const floor = scope?.depth ?? 'system';
  const open = (next: Setting) => onGo({ page: 'view', setting: next });
  return (
    <nav className="sidebar" aria-label="Views">
      <p className="model-name">{state?.name ?? 'seefore'}</p>
      <fieldset className="depth" disabled={off}>
        <legend>Depth</legend>
        {DEPTHS.map((depth) => (
          <label key={depth}>
            <input type="radio" name={`${ids}-depth`} value={depth} checked={setting.depth === depth} disabled={shallower(depth, floor)} onChange={() => open({ depth, scope: setting.scope })} />
            {DEPTH_WORDS[depth]}
          </label>
        ))}
      </fieldset>
      <div className="scope">
        <label htmlFor={`${ids}-scope`}>Scope</label>
        <select
          id={`${ids}-scope`}
          value={setting.scope ?? ''}
          disabled={off}
          onChange={(event) => {
            const next = state === null ? undefined : settingFor(state, event.target.value === '' ? null : event.target.value, setting.depth);
            if (next !== undefined) open(next);
          }}
        >
          <option value="">{EVERYTHING}</option>
          {groups.map((group, at) => (
            <optgroup key={`${at}-${group.label}`} label={group.label}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <ul className="pages">
        <li>
          <Link route={{ page: 'view', setting }} here={route.page === 'view'}>
            View
          </Link>
        </li>
        <li>
          <Link route={{ page: 'model' }} here={route.page === 'model'}>
            Model
          </Link>
        </li>
        <li>
          <Link route={{ page: 'problems' }} here={route.page === 'problems'}>
            {`Problems (${problems})`}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
