import { parentPort } from 'node:worker_threads';
import { layOut } from './index.ts';
import type { Answer, Job } from './job.ts';

/**
 * The worker thread the runner starts: it takes a view and gives back its picture, one at a
 * time, so that a layout that never ends blocks only this thread, which the runner then ends.
 * The built command has it as `dist/layout-worker.cjs`.
 */

const port = parentPort;
if (port === null) throw new Error('The layout worker runs only as a worker thread, started by the runner.');

port.on('message', (job: Job) => {
  void layOut(job.view).then((picture) => {
    const answer: Answer = { job: job.job, picture };
    port.postMessage(answer);
  });
});
