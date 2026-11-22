import type { Picture, PictureAnswer, ViewerState } from '@seefore/core';
import { sameRoute } from './address.ts';
import type { Route } from './address.ts';
import { accepts, resolveRoute } from './follow.ts';

/**
 * Keeps the page in step with the server: it reads the state, asks for the picture of the view
 * shown at the revision of that state, and drops every answer that comes after a newer question.
 * A state and its picture are shown together, so that a picture of one reading is never drawn
 * over the state of another.
 */

/** What the server answers. */
export interface Server {
  /** The state of the latest reading. */
  state(): Promise<ViewerState>;
  /**
   * The picture of a view at a revision: `stale` when the revision is no longer the latest,
   * `missing` when that reading has no such view.
   */
  picture(revision: string, view: string): Promise<PictureAnswer | 'stale' | 'missing'>;
}

/** What the page shows. */
export interface Shown {
  /** The latest state the page holds; null until the first comes. */
  state: ViewerState | null;
  /** What the main part shows, resolved against the state. */
  route: Route;
  /** The picture of the route's view at the state's revision. Null while it is laid out, and for a page that is not a view. */
  picture: Picture | null;
  /** What went wrong in asking the server, in plain words; null when nothing did. */
  trouble: string | null;
}

/** Said when the server does not answer. */
export const UNREACHABLE = 'The page cannot reach seefore. It tries again, and takes the model in once seefore is back.';

/** Said when the server has no picture for a view that its state lists. */
export const NO_PICTURE = 'seefore has no picture of this view. Open the view again, or open another one.';

/** How many times a reading is taken again when it moves on while its picture is asked for. */
const RETRIES = 3;

/** Keeps the page in step with the server. */
export class Live {
  private shown: Shown;
  /** What the reader last asked to see. */
  private wanted: Route;
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
    this.shown = { state: null, route, picture: null, trouble: null };
  }

  /** What the page shows now. */
  current(): Shown {
    return this.shown;
  }

  /**
   * Reads the state again: at the start, and when the server names a revision the page does not
   * hold. Until the new picture comes the page keeps the state and picture it has.
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

  /** Opens what a route names, when the reader picks it or the address changes. */
  async go(route: Route): Promise<void> {
    this.wanted = route;
    // Until the first state comes there is nothing to open; its reading opens what is wanted.
    if (this.latest === null) return;
    const resolved = resolveRoute(this.latest, route);
    const shown = this.shown;
    if (shown.state === this.latest && sameRoute(resolved, shown.route) && (resolved.page !== 'view' || shown.picture !== null)) return;
    await this.settle(this.latest, true, 0);
  }

  /**
   * Shows a state with what the reader wants, once its picture comes. `waiting` shows the route
   * at once, with no picture, while it is laid out.
   */
  private async settle(state: ViewerState, waiting: boolean, attempt: number): Promise<void> {
    const asking = ++this.asking;
    const route = resolveRoute(state, this.wanted);
    if (route.page !== 'view') {
      // With no view at all, the view wanted stays wanted, so that it opens again when the views come back.
      if (route.page !== 'start') this.wanted = route;
      this.install({ state, route, picture: null, trouble: null });
      return;
    }
    if (waiting) this.install({ state, route, picture: null, trouble: this.shown.trouble });
    const answer = await this.ask(state, route.view);
    if (asking !== this.asking) return;
    if (answer === 'stale') {
      if (attempt < RETRIES) await this.refresh(attempt + 1);
      return;
    }
    if (answer === 'unreachable') {
      this.install({ ...this.shown, trouble: UNREACHABLE });
      return;
    }
    this.wanted = route;
    this.install({ state, route, picture: answer, trouble: null });
  }

  /** Asks for the picture of a view at the state's revision. An answer for another revision or view counts as stale. */
  private async ask(state: ViewerState, view: string): Promise<Picture | 'stale' | 'unreachable'> {
    let answer: PictureAnswer | 'stale' | 'missing';
    try {
      answer = await this.server.picture(state.revision, view);
    } catch {
      return 'unreachable';
    }
    if (answer === 'stale') return 'stale';
    if (answer === 'missing') return { view, failed: { reason: 'crash', message: NO_PICTURE } };
    return accepts(answer, state, view) ? answer.picture : 'stale';
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
    async picture(revision, view) {
      const response = await fetch(`/api/pictures/${encodeURIComponent(revision)}/${encodeURIComponent(view)}`, { headers: { accept: 'application/json' } });
      if (response.status === 409) return 'stale';
      if (response.status === 404) return 'missing';
      if (!response.ok) throw new Error(`The picture answered ${response.status}.`);
      return (await response.json()) as PictureAnswer;
    },
  };
}
