import { Worker } from 'node:worker_threads';
import type { Picture, View } from '@seefore/core';
import type { Answer, Job } from './job.ts';
import { closed, failed, stopped, threw, tooLong } from './words.ts';

/**
 * The runner keeps the layout apart from the server, in a worker thread, under a time limit.
 * ELK can hang on some settings, and a hang blocks the thread it runs in: here that thread is
 * ended and another started, and the server goes on answering.
 */

/** The longest one layout may take, in milliseconds. Measured: the slowest normal one took 0.6 s. */
export const LAYOUT_LIMIT = 5000;

/** How a runner is started. */
export interface RunnerOptions {
  /** The file of the worker thread, as a path or a file URL: `dist/layout-worker.cjs` beside the built command, `src/worker.ts` in a test. */
  worker: string | URL;
  /** The longest one layout may take, in milliseconds. `LAYOUT_LIMIT` unless given. */
  limit?: number;
}

/** Lays out views one at a time, in the order asked, each under the limit. */
export interface Runner {
  /**
   * The picture of a view, once every view asked for before it is done. A layout past the
   * limit, one that throws and one whose thread fails each give a `Failed` with words to show.
   * It never rejects.
   */
  layOut(view: View): Promise<Picture>;
  /** Ends the worker thread. A view still waiting, or asked for after, gives a `Failed`. */
  close(): Promise<void>;
}

/** Starts a runner. Its worker thread starts with the first layout and is kept for the next. */
export function startRunner(options: RunnerOptions): Runner {
  return new LayoutRunner(options.worker, options.limit ?? LAYOUT_LIMIT);
}

/** A view waiting for its picture, and how to give it. */
interface Waiting {
  view: View;
  give: (picture: Picture) => void;
}

/** The layout under way: its number, the thread it runs in, who waits for it and the timer of its limit. */
interface Running {
  job: number;
  worker: Worker;
  waiting: Waiting;
  timer: ReturnType<typeof setTimeout>;
}

/** A runner with one worker thread and a queue. */
class LayoutRunner implements Runner {
  readonly #file: string | URL;
  readonly #limit: number;
  readonly #queue: Waiting[] = [];
  #worker: Worker | undefined;
  #running: Running | undefined;
  #jobs = 0;
  #closed = false;

  constructor(file: string | URL, limit: number) {
    this.#file = file;
    this.#limit = limit;
  }

  layOut(view: View): Promise<Picture> {
    if (this.#closed) return Promise.resolve(failed(view.id, 'crash', closed()));
    return new Promise((give) => {
      this.#queue.push({ view, give });
      this.#next();
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    const running = this.#running;
    if (running !== undefined) this.#finish(failed(running.waiting.view.id, 'crash', closed()));
    for (const waiting of this.#queue.splice(0)) waiting.give(failed(waiting.view.id, 'crash', closed()));
    const worker = this.#worker;
    this.#worker = undefined;
    if (worker !== undefined) await worker.terminate();
  }

  /** Starts the next layout in the queue, unless one is under way or the runner is closed. */
  #next(): void {
    if (this.#closed || this.#running !== undefined) return;
    const waiting = this.#queue.shift();
    if (waiting === undefined) return;
    this.#jobs += 1;
    const job: Job = { job: this.#jobs, view: waiting.view };
    try {
      const worker = (this.#worker ??= this.#start());
      const timer = setTimeout(() => this.#stop(), this.#limit);
      this.#running = { job: job.job, worker, waiting, timer };
      worker.postMessage(job);
    } catch (error) {
      if (this.#running !== undefined) this.#finish(failed(waiting.view.id, 'crash', threw(error)));
      else {
        waiting.give(failed(waiting.view.id, 'crash', threw(error)));
        this.#next();
      }
    }
  }

  /** A new worker thread, which does not keep the process alive while it waits. */
  #start(): Worker {
    const worker = new Worker(this.#file);
    worker.unref();
    worker.on('message', (answer: Answer) => {
      if (this.#running?.worker === worker && this.#running.job === answer.job) this.#finish(answer.picture);
    });
    worker.on('error', (error) => this.#lost(worker, threw(error)));
    worker.on('exit', () => this.#lost(worker, stopped()));
    return worker;
  }

  /** A worker thread failed or ended: it is not used again, and the layout it ran fails. */
  #lost(worker: Worker, message: string): void {
    if (this.#worker === worker) this.#worker = undefined;
    const running = this.#running;
    if (running?.worker === worker) this.#finish(failed(running.waiting.view.id, 'crash', message));
  }

  /** The layout under way passed its limit: its thread is ended, and the next layout gets a new one. */
  #stop(): void {
    const running = this.#running;
    if (running === undefined) return;
    if (this.#worker === running.worker) this.#worker = undefined;
    void running.worker.terminate();
    this.#finish(failed(running.waiting.view.id, 'time', tooLong(this.#limit)));
  }

  /** The layout under way is over: its picture is given, and the next starts. */
  #finish(picture: Picture): void {
    const running = this.#running;
    if (running === undefined) return;
    clearTimeout(running.timer);
    this.#running = undefined;
    running.waiting.give(picture);
    this.#next();
  }
}
