import type { Picture, View } from '@seefore/core';
import { layOut } from '@seefore/layout';

/**
 * What lays the views out. The server asks it for one picture at a time, and keeps the
 * answers itself. Tests give it one of their own.
 */
export interface Layouts {
  /** Lays a view out. A layout that throws, or runs past its limit, gives a `Failed` picture. */
  run(view: View): Promise<Picture>;
  /** Stops a layout that is running, and lets go of what runs them. */
  close(): void;
}

/** The file of the layout's worker, beside the built command. */
export const WORKER_FILE = 'layout-worker.cjs';

/**
 * The layouts the command runs, given the folder it is in.
 *
 * Until the runner of `@seefore/layout/node` is brought in, each layout runs here, in this
 * thread, with no limit on its time. The runner takes the path of the worker,
 * `join(home, WORKER_FILE)`, runs one layout at a time and stops one that runs too long.
 */
export function startLayouts(_home: string): Layouts {
  return inThisThread();
}

/** Layouts that run in this thread, one after another as the server asks. */
export function inThisThread(): Layouts {
  return {
    run: (view) => layOut(view),
    close: () => {},
  };
}
