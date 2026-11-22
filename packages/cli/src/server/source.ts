import { randomBytes } from 'node:crypto';
import { statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { conditionsOf, connectionsInNoView, emptyModel, outlineOf, ownership, viewsOf } from '@seefore/core';
import type { Condition, Model, Problem, View, ViewerState } from '@seefore/core';
import { readSource } from '../check.ts';

/** What one reading of the source directory found: the state, before it is given a revision. */
export type Reading = Omit<ViewerState, 'revision'>;

/** How a reading is made. Tests give their own, to count readings or to make up views. */
export type Read = (directory: string) => Reading;

/** How long to wait after a file event for more, so that a burst of them is read once. */
export const GATHER_MS = 50;
/** How often to look whether the directory went, came back or was put in place anew. */
export const LOOK_MS = 500;

/** The problems that mean the marker cannot say which format the directory is in: nothing else is read then. */
const FORMAT_UNKNOWN = new Set(['marker-missing', 'format-unknown', 'format-not-readable']);

/**
 * Reads the source directory as `seefore check` does, with the same problems, and works out
 * the model's views, its listing, the conditions each record is under and the connections that
 * no view holds. When the directory is gone, or its marker cannot say which format it is in,
 * there is no model and there are no views.
 */
export function readingOf(directory: string, views: (model: Model) => View[] = viewsOf): Reading {
  if (identityOf(directory) === undefined) {
    return unavailable(directory, {
      file: '.',
      line: 1,
      column: 1,
      severity: 'error',
      code: 'directory-gone',
      message: 'The source directory is gone. seefore reads it again as soon as it is back.',
    });
  }
  const { loaded, problems, errors, warnings } = readSource(directory);
  const available = !problems.some((problem) => FORMAT_UNKNOWN.has(problem.code));
  const model = available ? loaded.model : emptyModel();
  const drawn = available ? views(model) : [];
  return {
    directory,
    available,
    name: loaded.marker?.name ?? null,
    format: loaded.marker?.format ?? null,
    records: loaded.records.length,
    errors,
    warnings,
    problems,
    model,
    ownership: Object.fromEntries(ownership(model)),
    conditions: conditionsByRecord(model),
    outline: outlineOf(model),
    views: drawn,
    inNoView: connectionsInNoView(model, drawn),
  };
}

/** The conditions of each part and connection of a model that is under any, by id, so that the page need not work them out. */
function conditionsByRecord(model: Model): Record<string, Condition[]> {
  const records = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections].flat();
  const found = records.map((record): [string, Condition[]] => [record.id, conditionsOf(model, record.id)]);
  return Object.fromEntries(found.filter(([, conditions]) => conditions.length > 0));
}

/** A reading with no model, and the one problem that says why. */
function unavailable(directory: string, problem: Problem): Reading {
  const model = emptyModel();
  return {
    directory,
    available: false,
    name: null,
    format: null,
    records: 0,
    errors: problem.severity === 'error' ? 1 : 0,
    warnings: problem.severity === 'error' ? 0 : 1,
    problems: [problem],
    model,
    ownership: {},
    conditions: {},
    outline: outlineOf(model),
    views: [],
    inNoView: [],
  };
}

/**
 * The source directory as it is now, read again whenever its files change. Each reading that
 * finds something other than the one before gets a new revision, and those who follow are
 * told. It watches the directory it was given and never another: when that one goes, the
 * state says so, and the same path is looked at until it is back.
 */
export class Source {
  /** The latest reading, with its revision. */
  state: ViewerState;
  private readonly run = `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  private count = 0;
  private followers = new Set<(state: ViewerState) => void>();
  private watcher: FSWatcher | undefined;
  /** The folder found at the path when last looked, as the disk knows it; missing when there was none. */
  private seen: string | undefined;
  private gathering: NodeJS.Timeout | undefined;
  private readonly looking: NodeJS.Timeout;

  constructor(
    readonly directory: string,
    private readonly read: Read = readingOf,
  ) {
    // Watching starts before the first reading, so that no change falls between the two.
    this.seen = identityOf(directory);
    if (this.seen !== undefined) this.startWatching();
    this.state = { revision: this.nextRevision(), ...this.safeRead() };
    this.looking = setInterval(() => this.look(), LOOK_MS);
    this.looking.unref();
  }

  /** Calls back after every new reading. Gives back what stops it. */
  follow(follower: (state: ViewerState) => void): () => void {
    this.followers.add(follower);
    return () => this.followers.delete(follower);
  }

  /** Stops watching and reading. */
  close(): void {
    clearInterval(this.looking);
    clearTimeout(this.gathering);
    this.gathering = undefined;
    this.unwatch();
    this.followers.clear();
  }

  /**
   * Looks whether the folder at the path is still the one being watched. When it went, came
   * back, or was put in place anew, as a checkout may do, the watcher moves to what is there
   * now, and the directory is read again. A watcher that could not start is tried again, and
   * the directory read, at each look.
   */
  private look(): void {
    const now = identityOf(this.directory);
    if (now === this.seen && (this.watcher !== undefined || now === undefined)) return;
    this.seen = now;
    this.unwatch();
    if (now !== undefined) this.startWatching();
    this.gather();
  }

  /** Watches the directory with its folders. A watcher that fails is dropped, and started again at the next look. */
  private startWatching(): void {
    try {
      this.watcher = watch(this.directory, { recursive: true }, (_event, file) => {
        if (!skipped(file)) this.gather();
      });
    } catch {
      return;
    }
    this.watcher.on('error', () => {
      this.unwatch();
      this.gather();
    });
  }

  private unwatch(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  /**
   * Reads again once the events stop coming for a moment, so that a burst is read once.
   * Readings never overlap: one runs to its end before an event is taken in, and an event
   * that came while it ran causes one more.
   */
  private gather(): void {
    clearTimeout(this.gathering);
    this.gathering = setTimeout(() => this.again(), GATHER_MS);
    this.gathering.unref();
  }

  /** Reads the directory, and gives the reading a new revision when it differs from the last. */
  private again(): void {
    this.gathering = undefined;
    const reading = this.safeRead();
    const { revision: _old, ...last } = this.state;
    if (JSON.stringify(reading) === JSON.stringify(last)) return;
    this.state = { revision: this.nextRevision(), ...reading };
    for (const follower of this.followers) follower(this.state);
  }

  /** A reading, or one that says what went wrong, so that a fault in reading never stops the server. */
  private safeRead(): Reading {
    try {
      return this.read(this.directory);
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause);
      return unavailable(this.directory, {
        file: '.',
        line: 1,
        column: 1,
        severity: 'error',
        code: 'unexpected',
        message: `Something went wrong that seefore did not expect while reading this directory: ${why}`,
      });
    }
  }

  /** A revision unlike any other of this run or of an earlier one. */
  private nextRevision(): string {
    this.count += 1;
    return `${this.run}-${this.count}`;
  }
}

/** Which folder is at a path, as the disk knows it, so that one put in place anew is told apart. Missing when there is no folder. */
function identityOf(directory: string): string | undefined {
  try {
    const stats = statSync(directory, { bigint: true });
    return stats.isDirectory() ? `${stats.dev}:${stats.ino}` : undefined;
  } catch {
    return undefined;
  }
}

/** True for an event in a file or folder that the reading skips: hidden ones and `node_modules`. */
function skipped(file: string | null): boolean {
  if (file === null) return false;
  return file.split(/[\\/]/).some((part) => part.startsWith('.') || part === 'node_modules');
}
