import { keyOf } from '@seefore/core';
import type { Picture, PictureAnswer, Setting, View, ViewerState } from '@seefore/core';
import { START, sameRoute } from './address.ts';
import type { Route } from './address.ts';
import { accepts, resolveRoute } from './follow.ts';

/**
 * Keeps the page in step with the server: it reads the state, asks for the view and the picture
 * of the setting shown at the revision of that state, and drops every answer that comes after a
 * newer question. A state and its picture are shown together, so that a picture of one reading
 * is never drawn over the state of another. While a picture is laid out the one before it stays.
 */

/** What the server answers. */
export interface Server {
  /** The state of the latest reading. */
  state(): Promise<ViewerState>;
  /**
   * The view of a setting, named by its key, and its picture, at a revision: `stale` when the
   * revision is no longer the latest, `missing` when that reading has no such setting.
   */
  picture(revision: string, setting: string): Promise<PictureAnswer | 'stale' | 'missing'>;
}

/** The view of a setting with its picture, as the page draws it. */
export interface Shot {
  view: View;
  picture: Picture;
}

/** What the page shows. */
export interface Shown {
  /** The latest state the page holds; null until the first comes. */
  state: ViewerState | null;
  /** What the main part shows, resolved against the state. */
  route: Route;
  /**
   * The view and the picture drawn: those of the route's setting at the state's revision, or,
   * while those are laid out, the ones before. Null until the first comes, and for a page that
   * is not a view.
   */
  shot: Shot | null;
  /** True while the picture of the route's setting is laid out, and the one before stays. */
  laying: boolean;
  /** True when the box in scope is gone from the files, and everything at the same depth is shown in its place. */
  gone: boolean;
  /** The setting the controls show, and that "View" leads back to: the route's, or the last one shown. */
  setting: Setting;
  /** What went wrong in asking the server, in plain words; null when nothing did. */
  trouble: string | null;
}

/** Said when the server does not answer. */
export const UNREACHABLE = 'The page cannot reach seefore. It tries again, and takes the model in once seefore is back.';

/** Said when the server has no picture for a setting that its state has. */
export const NO_PICTURE = 'seefore has no picture of this view. Open the view again, or open another one.';

/** How many times a reading is taken again when it moves on while its picture is asked for. */
const RETRIES = 3;

/** What `shown` is at the start, for a route the address names. */
export function nothingShown(route: Route): Shown {
  return { state: null, route, shot: null, laying: false, gone: false, setting: route.page === 'view' ? route.setting : START, trouble: null };
}

/** Keeps the page in step with the server. */
export class Live {
  private shown: Shown;
  /** What the reader last asked to see. */
  private wanted: Route;
  /** True once the reader has been shown the box that `wanted` has as its scope: when it goes, it is gone, and not unknown. */
  private known = false;
  /** The latest state read, shown or not yet. */
  private latest: ViewerState | null = null;
  /** Grows with every reading of the state; a reading older than the latest is dropped. */
  private reading = 0;
  /** Grows with every question for a picture; an answer to an older one is dropped. */
  private asking = 0;

  /** `show` is called with what to show each time it changes. `route` is what the address names. */
  constructor(
    private readonly server: Server,
    private readonly show: (shown: Shown) => void,
    route: Route,
  ) {
    this.wanted = route;
    this.shown = nothingShown(route);
  }

  /** What the page shows now. */
  current(): Shown {
    return this.shown;
  }

  /**
   * Reads the state again: at the start, and when the server names a revision the page does not
   * hold. Until the new picture comes the page keeps the state and picture it has, and says that
   * a picture is laid out.
   */
  async refresh(attempt = 0): Promise<void> {
    const reading = ++this.reading;
    let state: ViewerState;
    try {
      state = await this.server.state();
    } catch {
      if (reading === this.reading) this.install({ ...this.shown, trouble: UNREACHABLE });
      return;
    }
    if (reading !== this.reading) return;
    this.latest = state;
    await this.settle(state, false, attempt);
  }

  /** Opens what a route names, when the reader picks it or the address changes. A box gone before is no more spoken of. */
  async go(route: Route): Promise<void> {
    this.wanted = route;
    this.known = false;
    // Until the first state comes there is nothing to open; its reading opens what is wanted.
    if (this.latest === null) return;
    const { route: resolved, gone } = resolveRoute(this.latest, route);
    const shown = this.shown;
    if (shown.state === this.latest && sameRoute(resolved, shown.route) && shown.gone === gone && (resolved.page !== 'view' || shown.shot !== null)) return;
    await this.settle(this.latest, true, 0);
  }

  /**
   * Shows a state with what the reader wants, once its picture comes. `waiting` shows the route
   * at once, with the picture before it while the new one is laid out.
   */
  private async settle(state: ViewerState, waiting: boolean, attempt: number): Promise<void> {
    const asking = ++this.asking;
    const { route, gone } = resolveRoute(state, this.wanted, this.known);
    const before = this.shown;
    if (route.page !== 'view') {
      // With no model at all, the view wanted stays wanted, so that it opens again when the model comes back.
      if (route.page !== 'start') this.wanted = route;
      this.install({ state, route, shot: null, laying: false, gone: false, setting: before.setting, trouble: null });
      return;
    }
    const { setting } = route;
    // The picture drawn stays while the next is laid out, when it is of the same reading.
    const kept = before.state === state && before.route.page === 'view' ? before.shot : null;
    if (waiting) this.install({ state, route, shot: kept, laying: true, gone, setting, trouble: before.trouble });
    else if (before.shot !== null && before.route.page === 'view') this.install({ ...before, laying: true });
    const answer = await this.ask(state, setting);
    if (asking !== this.asking) return;
    if (answer === 'stale') {
      if (attempt < RETRIES) await this.refresh(attempt + 1);
      return;
    }
    if (answer === 'unreachable') {
      this.install({ ...this.shown, laying: false, trouble: UNREACHABLE });
      return;
    }
    if (answer === 'missing') {
      this.install({ state, route, shot: kept, laying: false, gone, setting, trouble: NO_PICTURE });
      return;
    }
    // While the box in scope is gone it stays wanted, so that the page opens it again when it is back.
    if (!gone) {
      this.wanted = route;
      this.known = setting.scope !== null;
    }
    this.install({ state, route, shot: answer, laying: false, gone, setting, trouble: null });
  }

  /** Asks for the view and the picture of a setting at the state's revision. An answer for another revision or setting counts as stale. */
  private async ask(state: ViewerState, setting: Setting): Promise<Shot | 'stale' | 'missing' | 'unreachable'> {
    let answer: PictureAnswer | 'stale' | 'missing';
    try {
      answer = await this.server.picture(state.revision, keyOf(setting));
    } catch {
      return 'unreachable';
    }
    if (answer === 'stale' || answer === 'missing') return answer;
    return accepts(answer, state, setting) ? { view: answer.view, picture: answer.picture } : 'stale';
  }

  /** Says that the server cannot be reached, keeping what is shown. */
  lost(): void {
    this.install({ ...this.shown, trouble: UNREACHABLE });
  }

  /** Shows something new. */
  private install(shown: Shown): void {
    this.shown = shown;
    this.show(shown);
  }
}

/** The server the page was served by, over HTTP. */
export function httpServer(): Server {
  return {
    async state() {
      const response = await fetch('/api/state', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`The state answered ${response.status}.`);
      return (await response.json()) as ViewerState;
    },
    async picture(revision, setting) {
      const response = await fetch(`/api/pictures/${encodeURIComponent(revision)}/${encodeURIComponent(setting)}`, { headers: { accept: 'application/json' } });
      if (response.status === 409) return 'stale';
      if (response.status === 404) return 'missing';
      if (!response.ok) throw new Error(`The picture answered ${response.status}.`);
      return (await response.json()) as PictureAnswer;
    },
  };
}
