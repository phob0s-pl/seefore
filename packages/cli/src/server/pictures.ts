import type { Failed, Picture, PictureAnswer, View } from '@seefore/core';
import type { Layouts } from './layouts.ts';

/** What asking for a picture comes to: the answer, or why there is none. */
export type Asked =
  | { answer: PictureAnswer }
  /** The revision is no longer the latest, or the reading moved on while the picture waited. */
  | { old: true }
  /** The reading has no view with that id. */
  | { unknown: true };

/** A layout waiting for its turn. */
interface Job {
  revision: string;
  view: View;
  /** Called with the picture, or with nothing when the job was dropped. */
  settle(picture: Picture | undefined): void;
}

/**
 * The pictures of the latest reading. One layout runs at a time. For each view there is at
 * most one job waiting and one answer kept, a failure too. When a new reading comes, the work
 * for the one before is dropped and its answers are let go.
 */
export class Pictures {
  private revision = '';
  private views = new Map<string, View>();
  /** The answer for each view of the latest reading that was asked for, kept or still to come. */
  private answers = new Map<string, Promise<Picture | undefined>>();
  private waiting: Job[] = [];
  private running = false;
  private closed = false;

  constructor(private readonly layouts: Layouts) {}

  /** Takes a new reading. Jobs still waiting for an older one are dropped, and its answers let go. */
  update(revision: string, views: readonly View[]): void {
    this.revision = revision;
    this.views = new Map(views.map((view) => [view.id, view]));
    this.answers.clear();
    const dropped = this.waiting;
    this.waiting = [];
    for (const job of dropped) job.settle(undefined);
  }

  /** The picture of a view at a revision. It waits for the layout when there is no answer yet. */
  async ask(revision: string, id: string): Promise<Asked> {
    if (revision !== this.revision || this.closed) return { old: true };
    const view = this.views.get(id);
    if (!view) return { unknown: true };
    let answer = this.answers.get(id);
    if (!answer) {
      answer = this.queue(revision, view);
      this.answers.set(id, answer);
    }
    const picture = await answer;
    return picture === undefined ? { old: true } : { answer: { revision, picture } };
  }

  /** Drops every job and stops the layouts. */
  close(): void {
    this.closed = true;
    this.update('', []);
    this.layouts.close();
  }

  /** Puts a layout in line, and starts it when nothing else runs. */
  private queue(revision: string, view: View): Promise<Picture | undefined> {
    return new Promise((settle) => {
      this.waiting.push({ revision, view, settle });
      void this.next();
    });
  }

  /** Runs the next job in line, if none runs now. Its picture is given only while its reading is the latest. */
  private async next(): Promise<void> {
    if (this.running) return;
    const job = this.waiting.shift();
    if (!job) return;
    this.running = true;
    const picture = await this.layOut(job.view);
    this.running = false;
    job.settle(job.revision === this.revision ? picture : undefined);
    void this.next();
  }

  /** Lays a view out. A layout that throws gives a failure the reader can be shown. */
  private async layOut(view: View): Promise<Picture> {
    try {
      return await this.layouts.run(view);
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
