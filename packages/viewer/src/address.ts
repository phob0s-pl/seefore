import { keyOf, settingOf } from '@seefore/core';
import type { Setting } from '@seefore/core';

/**
 * The address of what the page shows. It is kept after `#`, so that the server is asked for
 * the page alone, whatever is shown. A view is named by its setting, the depth and the scope,
 * as the server names it: `#/view/system` for everything at System depth,
 * `#/view/component~relay` for one box with its neighbours. Then `#/model` and `#/problems`.
 */

/**
 * What the page shows in its main part. `start` is what the page opens with when the address
 * names nothing it knows: everything at System depth, or what stands in its place when there is
 * no model to draw.
 */
export type Route = { page: 'view'; setting: Setting } | { page: 'model' } | { page: 'problems' } | { page: 'start' };

/** The setting the page opens with: everything at System depth. */
export const START: Setting = { depth: 'system', scope: null };

/** The part of the address after `#` for what the page shows. */
export function addressOf(route: Route): string {
  switch (route.page) {
    case 'view':
      // An id is letters, digits and hyphens, and the key joins depth and id with `~`: none is escaped.
      return `#/view/${encodeURIComponent(keyOf(route.setting))}`;
    case 'model':
      return '#/model';
    case 'problems':
      return '#/problems';
    case 'start':
      return '';
  }
}

/**
 * What an address names: the part after `#`, with or without the `#`. One the page does not
 * know names the start: an address of no known form, a setting of no known form, and an address
 * of stage 5, such as `#/view/shop.containers`.
 */
export function routeOf(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/model') return { page: 'model' };
  if (path === '/problems') return { page: 'problems' };
  const key = /^\/view\/(.+)$/.exec(path)?.[1];
  if (key === undefined) return { page: 'start' };
  let decoded: string;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    return { page: 'start' };
  }
  const setting = settingOf(decoded);
  return setting === undefined ? { page: 'start' } : { page: 'view', setting };
}

/** True when two routes name the same thing. */
export function sameRoute(one: Route, other: Route): boolean {
  return addressOf(one) === addressOf(other);
}
