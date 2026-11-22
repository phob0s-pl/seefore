import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Picture, View } from '@seefore/core';
import { layOut } from '@seefore/layout';
import { startRunner } from '@seefore/layout/node';

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
 * The layouts the command runs, given the folder it is in. Each runs in a worker thread, one at
 * a time, and one that runs past its limit is stopped, so that a layout which never ends
 * cannot hold the server.
 *
 * A folder with no worker file gets layouts that run in this thread: the tests that run the
 * server in their own process give such a folder. The command itself does not start without
 * the worker file.
 */
export function startLayouts(home: string): Layouts {
  const worker = join(home, WORKER_FILE);
  if (!existsSync(worker)) return inThisThread();
  const runner = startRunner({ worker });
  return {
    run: (view) => runner.layOut(view),
    close: () => void runner.close(),
  };
}

/** True when the worker's file is where the command expects it. */
export function hasWorker(home: string): boolean {
  return existsSync(join(home, WORKER_FILE));
}

/** Layouts that run in this thread, one after another as the server asks. */
export function inThisThread(): Layouts {
  return {
    run: (view) => layOut(view),
    close: () => {},
  };
}
