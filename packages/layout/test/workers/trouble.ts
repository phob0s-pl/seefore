import { parentPort } from 'node:worker_threads';
import { layOut } from '../../src/index.ts';
import type { Answer, Job } from '../../src/job.ts';

/**
 * A worker thread for the tests of the runner. It lays out as the real one does, except three
 * views: `system~hangs`, which it never finishes; `system~throws`, at which its thread throws;
 * and `system~exits`, at which its thread ends.
 */

const port = parentPort;
if (port === null) throw new Error('This runs only as a worker thread.');

port.on('message', (job: Job) => {
  if (job.view.id === 'system~hangs') hang();
  if (job.view.id === 'system~throws') throw new Error('The thread broke on purpose.');
  if (job.view.id === 'system~exits') process.exit(3);
  void layOut(job.view).then((picture) => {
    const answer: Answer = { job: job.job, picture };
    port.postMessage(answer);
  });
});

/** Never returns, and never lets the thread do anything else. */
function hang(): void {
  for (;;) {
    // As a layout that never ends.
  }
}
