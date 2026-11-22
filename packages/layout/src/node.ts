/**
 * The part of the layout that needs Node: the runner, which lays views out in a worker thread
 * under a time limit. Kept apart from `@seefore/layout`, so that `layOut` stays free of Node.
 * It does not load ELK itself: the worker thread does.
 */
export { LAYOUT_LIMIT, startRunner } from './runner.ts';
export type { Runner, RunnerOptions } from './runner.ts';
