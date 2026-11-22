import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { MARKER_FILE, isMarkerName, isSourcePath } from '@seefore/core';
import type { Problem, SourceFile } from '@seefore/core';

/** How far below the starting folder to look when saying where a source directory is. */
const BELOW_DEPTH = 3;
/** How many folders to look into at most, so a large repository does not slow the answer. */
const BELOW_FOLDERS = 2000;

/** True when the path is a folder that exists. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The folder as it really is on disk. The system itself walks the path, so a link is followed
 * before a `..` after it is applied, the way the system does when a file is written there.
 */
export function physical(folder: string): string {
  try {
    return realpathSync.native(folder);
  } catch {
    return folder;
  }
}

/** What looking for the source directory came to. */
export type Found =
  | { directory: string }
  /** A folder on the way could not be looked into, so there is no telling. */
  | { unreadable: string; reason: string }
  | undefined;

/**
 * Finds the source directory: the starting folder if it has a marker file, or else the
 * nearest folder above it that has one. The start must be a physical path, so that a link
 * cannot make a folder look as if it had other folders above it.
 *
 * A marker counts under any spelling of its name, and whether it is a file or a link. What
 * is wrong with such a marker is said when the directory is read.
 */
export function findSourceDirectory(start: string): Found {
  let folder = start;
  for (;;) {
    const state = markerIn(folder);
    if (state === 'marker') return { directory: folder };
    if (state !== 'none') return { unreadable: folder, reason: state.reason };
    const above = dirname(folder);
    if (above === folder) return undefined;
    folder = above;
  }
}

/**
 * Lists the source directories a few folders below the start, as full paths. seefore never
 * picks one of these by itself; they are named so a person can point `--workdir` at one.
 */
export function findSourceDirectoriesBelow(start: string): string[] {
  const found: string[] = [];
  let looked = 0;

  const walk = (folder: string, depth: number): void => {
    if (depth > BELOW_DEPTH || looked >= BELOW_FOLDERS) return;
    looked++;
    for (const entry of entriesOf(folder) ?? []) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(folder, entry.name);
      if (hasMarker(full)) found.push(full);
      else walk(full, depth + 1);
    }
  };

  walk(start, 1);
  return found;
}

export interface FilesRead {
  files: SourceFile[];
  /** Files and folders that could not be read at all. */
  problems: Problem[];
}

/**
 * Reads every YAML file under a source directory as text. Hidden files and folders are
 * skipped, and so is `node_modules`. Links are not followed. A folder or a file that cannot
 * be read is reported, and the rest is still read.
 *
 * A file that is there but cannot be read is still handed on, by its path and with no text,
 * so that a record's file still stands for its record. So is a marker that is a link: it marks
 * the folder, though what it says is not read.
 */
export function readSourceFiles(directory: string): FilesRead {
  const files: SourceFile[] = [];
  const problems: Problem[] = [];

  const walk = (folder: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(folder, { withFileTypes: true }).sort(byName);
    } catch (cause) {
      const path = prefix === '' ? '.' : prefix.slice(0, -1);
      problems.push(problem(path, 'error', 'folder-unreadable', `This folder could not be read: ${reason(cause)}.`));
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = prefix + entry.name;
      if (entry.isSymbolicLink()) {
        if (prefix === '' && isMarkerName(entry.name)) {
          problems.push(problem(path, 'error', 'marker-link', 'The marker file is a link, and seefore does not follow links. Make it a file of its own.'));
          files.push({ path });
        } else if (isMarkerName(entry.name)) {
          problems.push(problem(path, 'error', 'marker-nested', 'A source directory cannot sit inside another one. Remove this link, or move its folder out.'));
        } else {
          problems.push(problem(path, 'warning', 'link-not-followed', 'seefore does not follow links, so this one was not read.'));
        }
      } else if (entry.isDirectory()) {
        walk(join(folder, entry.name), path + '/');
      } else if (entry.isFile() && isSourcePath(path)) {
        const read = readText(join(folder, entry.name));
        if (typeof read === 'string') {
          files.push({ path, text: read });
        } else {
          files.push({ path });
          problems.push(problem(path, 'error', read.code, read.message));
        }
      }
    }
  };

  walk(directory, '');
  return { files, problems };
}

/** Reads a file as UTF-8 text, or says why it could not be read and what to do about it. */
function readText(file: string): string | { code: string; message: string } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (cause) {
    return { code: 'file-unreadable', message: `This file could not be read: ${reason(cause)}. Make it readable.` };
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { code: 'not-utf8', message: 'This file is not UTF-8 text, so it could not be read. Save it as UTF-8.' };
  }
}

/** Turns a path from the source directory into one for this machine. */
export function onDisk(directory: string, file: string): string {
  return file === '.' ? directory : join(directory, ...file.split('/'));
}

/** Turns a path of this machine into one with forward slashes. */
export function withSlashes(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

/** True when the folder holds a marker, under any spelling of its name. */
function hasMarker(folder: string): boolean {
  return markerIn(folder) === 'marker';
}

/**
 * Says whether a folder holds a marker. When the folder cannot be listed, the two usual
 * names are asked for one by one, which works wherever the folder can at least be entered.
 * When that is refused too, there is no telling, and the reason is given back.
 */
function markerIn(folder: string): 'marker' | 'none' | { reason: string } {
  const entries = entriesOf(folder);
  if (entries) return entries.some((entry) => isMarkerName(entry.name) && !entry.isDirectory()) ? 'marker' : 'none';
  for (const name of [MARKER_FILE, 'seefore.yml']) {
    try {
      if (!lstatSync(join(folder, name)).isDirectory()) return 'marker';
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) return { reason: reason(cause) };
    }
  }
  return 'none';
}

function entriesOf(folder: string): Dirent[] | undefined {
  try {
    return readdirSync(folder, { withFileTypes: true }).sort(byName);
  } catch {
    return undefined;
  }
}

function byName(a: Dirent, b: Dirent): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function problem(file: string, severity: Problem['severity'], code: string, message: string): Problem {
  return { file, line: 1, column: 1, severity, code, message };
}

function reason(cause: unknown): string {
  if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string') return cause.code;
  return cause instanceof Error ? cause.message : String(cause);
}

export { MARKER_FILE };
