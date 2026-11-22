import type { Server } from 'node:http';
import { join } from 'node:path';
import { EXIT_OK, findSource, notStarted } from '../check.ts';
import type { Rerun } from '../check.ts';
import type { Io } from '../io.ts';
import { HOST, addressOf, listen, startViewer } from './http.ts';
import { startLayouts } from './layouts.ts';
import { PAGE_FOLDER, readPage } from './page.ts';

/** What `seefore --server` takes. */
export interface ServeOptions {
  workdir?: string;
  /** The port to listen on. Without it, the first free one from `FIRST_PORT`. */
  port?: number;
  /** Whether to open the address in the browser once it listens. */
  open: boolean;
}

/** The port tried first when none is given, as the spec says. */
export const FIRST_PORT = 4173;
/** How many ports, from the first, are tried before giving up. */
export const PORTS_TRIED = 100;

/** How a hint names this command, for a source directory found below where it was run. */
const SHOW: Rerun = { verb: 'show', command: '--server' };

/**
 * Serves the viewer of the source directory on this machine until the person stops it. It
 * finds the directory once, listens, prints the address and opens it in the browser when the
 * output is a terminal. Gives back the exit code.
 */
export async function serve(options: ServeOptions, io: Io): Promise<number> {
  const directory = findSource({ ...(options.workdir === undefined ? {} : { workdir: options.workdir }), json: false }, io, SHOW);
  if (typeof directory === 'number') return directory;

  const folder = io.home === undefined ? undefined : join(io.home, PAGE_FOLDER);
  const page = folder === undefined ? undefined : readPage(folder);
  if (io.home === undefined || page === undefined) {
    const where = folder === undefined ? '' : ` There is no \`index.html\` in \`${folder}\`.`;
    return notStarted(false, io, 'page-missing', `The page of the viewer is missing, so there is nothing to serve.${where} Install seefore again.`);
  }

  const viewer = startViewer({ directory, layouts: startLayouts(io.home), page });
  let port: number;
  try {
    port = options.port === undefined ? await listenFrom(viewer.server, FIRST_PORT, PORTS_TRIED) : await listen(viewer.server, options.port);
  } catch (cause) {
    await viewer.close();
    return notStarted(false, io, 'port', portProblem(cause, options.port));
  }

  const address = addressOf(port);
  const { name } = viewer.source.state;
  io.out(`seefore is showing ${name ?? 'the source directory'} at ${address}`);
  io.out(`It follows the files in ${directory} as they change. Press Ctrl+C to stop.`);
  if (options.open && io.terminal === true) io.open?.(address);

  await (io.untilStopped?.() ?? new Promise<void>(() => {}));
  await viewer.close();
  return EXIT_OK;
}

/**
 * Listens on the first port from `first` that is free, trying `count` of them, and gives back
 * the port. Fails as the last port failed, or at once for any reason but a port in use.
 */
export async function listenFrom(server: Server, first: number, count: number): Promise<number> {
  for (let port = first; ; port++) {
    try {
      return await listen(server, port);
    } catch (cause) {
      if (codeOf(cause) !== 'EADDRINUSE' || port >= first + count - 1) throw cause;
    }
  }
}

/** Says in plain words why the server could not listen, and what to do. */
function portProblem(cause: unknown, wanted: number | undefined): string {
  const code = codeOf(cause);
  const why = cause instanceof Error ? cause.message : String(cause);
  if (wanted === undefined) {
    const last = FIRST_PORT + PORTS_TRIED - 1;
    if (code === 'EADDRINUSE') return `Ports ${FIRST_PORT} to ${last} on ${HOST} are all in use. Give a free one with --port=<number>.`;
    return `The server could not listen on ${HOST}: ${why}`;
  }
  if (code === 'EADDRINUSE') return `Port ${wanted} on ${HOST} is already in use. Give another with --port=<number>, or leave --port out to take a free one.`;
  if (code === 'EACCES') return `Port ${wanted} may only be used with more rights than seefore has. Give one above 1023 with --port=<number>.`;
  return `The server could not listen on port ${wanted} of ${HOST}: ${why}`;
}

function codeOf(cause: unknown): unknown {
  return typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
}
