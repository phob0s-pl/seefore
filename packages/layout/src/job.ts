import type { Picture, View } from '@seefore/core';

/** What the runner sends the worker thread: a view to lay out, with a number to answer to. */
export interface Job {
  job: number;
  view: View;
}

/** What the worker thread sends back: the picture of the job with that number. */
export interface Answer {
  job: number;
  picture: Picture;
}
