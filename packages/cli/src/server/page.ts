import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/** The folder beside the built command that holds the page. */
export const PAGE_FOLDER = 'viewer';

/** The file the page starts from. */
export const INDEX = '/index.html';

/** One file of the page, as it is sent. */
export interface PageFile {
  /** Its media type, as the `Content-Type` header gives it. */
  type: string;
  body: Buffer;
}

/** The files of the page, by the path they are asked for, as in `/index.html` or `/app.js`. */
export type Page = ReadonlyMap<string, PageFile>;

/** The media type of each kind of file a page is built with. Any other is sent as plain bytes. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Reads every file of the page once, with its folders, so that what is served is a fixed list
 * made at start and no path of a request ever reaches the disk. Hidden files are left out.
 * Missing when the folder has no `index.html`: the page was not built, or not installed.
 */
export function readPage(folder: string): Page | undefined {
  const page = new Map<string, PageFile>();
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, path);
      else if (entry.isFile()) page.set(path, { type: TYPES[extname(entry.name).toLowerCase()] ?? 'application/octet-stream', body: readFileSync(full) });
    }
  };
  try {
    walk(folder, '');
  } catch {
    return undefined;
  }
  return page.has(INDEX) ? page : undefined;
}
