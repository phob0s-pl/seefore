import type { Picture, View } from '@seefore/core';

/** What the runner sends the worker thread: a view to lay out, the views it takes its turns from, and a number to answer to. */
export interface Job {
  job: number;
  view: View;
  /** The views of the settings above it, nearest first. */
  above: View[];
}

/** What the worker thread sends back: the picture of the job with that number. */
export interface Answer {
  job: number;
  picture: Picture;
}
