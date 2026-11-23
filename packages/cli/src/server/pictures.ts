import { settingOf, viewsFor } from '@seefore/core';
import type { Failed, Model, Picture, PictureAnswer, View, Views } from '@seefore/core';
import type { Layouts } from './layouts.ts';

/** What asking for a picture comes to: the answer, or why there is none. */
export type Asked =
  | { answer: PictureAnswer }
  /** The revision is no longer the latest, or the reading moved on while the picture waited. */
  | { old: true }
  /** The reading has no such setting: a key of no known form, a scope that is no box of the model, or a depth it does not have. */
  | { unknown: true };

/** A layout waiting for its turn. */
interface Job {
  revision: string;
  view: View;
  /** The views of the settings it takes its turns from, nearest first. */
  above: View[];
  /** Called with the picture, or with nothing when the job was dropped. */
  settle(picture: Picture | undefined): void;
}

/** The view of a setting, and its picture, kept or still to come. */
interface Kept {
  view: View;
  picture: Promise<Picture | undefined>;
}

/**
 * The pictures of the latest reading, each of a setting the page asks for by its key, as the
 * address holds it: `system`, `component~relay`. The view of a setting is worked out when it is
 * first asked for, from the reading's model, which is looked up once. One layout runs at a time,
 * and is handed the views of the settings above, from which it takes its turns. For each setting
 * there is at most one job waiting and one answer kept, a failure too, so that two questions
 * share one layout. When a new reading comes, the work for the one before is dropped and its
 * answers are let go.
 */
export class Pictures {
  private revision = '';
  /** The model of the latest reading, or nothing when it has none, as when the directory is gone. */
  private model: Model | undefined;
  /** The model looked up for the views of its settings, once it is first asked for. */
  private views: Views | undefined;
  /** The answer for each setting of the latest reading that was asked for, by the setting's key. */
  private answers = new Map<string, Kept>();
  private waiting: Job[] = [];
  private running = false;
  private closed = false;

  /** `lookUp` works out the views of a model's settings. Tests give their own. */
  constructor(
    private readonly layouts: Layouts,
    private readonly lookUp: (model: Model) => Views = viewsFor,
  ) {}

  /** Takes a new reading, with its model when it has one. Jobs still waiting for an older one are dropped, and its answers let go. */
  update(revision: string, model: Model | undefined): void {
    this.revision = revision;
    this.model = model;
    this.views = undefined;
    this.answers.clear();
    const dropped = this.waiting;
    this.waiting = [];
    for (const job of dropped) job.settle(undefined);
  }

  /** The view of a setting at a revision, with its picture. It waits for the layout when there is no answer yet. */
  async ask(revision: string, key: string): Promise<Asked> {
    if (revision !== this.revision || this.closed) return { old: true };
    const setting = settingOf(key);
    if (setting === undefined || this.model === undefined) return { unknown: true };
    this.views ??= this.lookUp(this.model);
    const views = this.views;
    // A key of a known form is the key of its setting, and so the id of its view.
    let kept = this.answers.get(key);
    if (kept === undefined) {
      const view = views.viewOf(setting);
      if (view === undefined) return { unknown: true };
      const above = views.above(setting).flatMap((each) => views.viewOf(each) ?? []);
      kept = { view, picture: this.queue(revision, view, above) };
      this.answers.set(key, kept);
    }
    const { view } = kept;
    const picture = await kept.picture;
    return picture === undefined ? { old: true } : { answer: { revision, view, picture } };
  }

  /** Drops every job and stops the layouts. */
  close(): void {
    this.closed = true;
    this.update('', undefined);
    this.layouts.close();
  }

  /** Puts a layout in line, and starts it when nothing else runs. */
  private queue(revision: string, view: View, above: View[]): Promise<Picture | undefined> {
    return new Promise((settle) => {
      this.waiting.push({ revision, view, above, settle });
      void this.next();
    });
  }

  /** Runs the next job in line, if none runs now. Its picture is given only while its reading is the latest. */
  private async next(): Promise<void> {
    if (this.running) return;
    const job = this.waiting.shift();
    if (!job) return;
    this.running = true;
    const picture = await this.layOut(job.view, job.above);
    this.running = false;
    job.settle(job.revision === this.revision ? picture : undefined);
    void this.next();
  }

  /** Lays a view out. A layout that throws gives a failure the reader can be shown. */
  private async layOut(view: View, above: readonly View[]): Promise<Picture> {
    try {
      return await this.layouts.run(view, above);
    } catch (cause) {
      return crashed(view, cause);
    }
  }
}

/** The picture of a view whose layout threw. */
function crashed(view: View, cause: unknown): Failed {
  const why = cause instanceof Error ? cause.message : String(cause);
  return { view: view.id, failed: { reason: 'crash', message: `This view could not be laid out: ${why}` } };
}
