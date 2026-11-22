/**
 * The address of what the page shows. It is kept after `#`, so that the server is asked for
 * the page alone, whatever is shown: `#/view/shop.containers`, `#/model`, `#/problems`.
 */

/** What the page shows in its main part. `start` is the first view, or what stands in its place. */
export type Route = { page: 'view'; view: string } | { page: 'model' } | { page: 'problems' } | { page: 'start' };

/** The part of the address after `#` for what the page shows. */
export function addressOf(route: Route): string {
  switch (route.page) {
    case 'view':
      return `#/view/${encodeURIComponent(route.view)}`;
    case 'model':
      return '#/model';
    case 'problems':
      return '#/problems';
    case 'start':
      return '';
  }
}

/** What an address names: the part after `#`, with or without the `#`. One the page does not know names the start. */
export function routeOf(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/model') return { page: 'model' };
  if (path === '/problems') return { page: 'problems' };
  const view = /^\/view\/(.+)$/.exec(path)?.[1];
  if (view !== undefined) {
    try {
      return { page: 'view', view: decodeURIComponent(view) };
    } catch {
      return { page: 'start' };
    }
  }
  return { page: 'start' };
}

/** True when two routes name the same thing. */
export function sameRoute(one: Route, other: Route): boolean {
  return addressOf(one) === addressOf(other);
}
