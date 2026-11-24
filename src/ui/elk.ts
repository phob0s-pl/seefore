import ELK from 'elkjs/lib/elk-api.js';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { Engine } from './layout.ts';

let elk: Engine | undefined;

/** ELK in a worker of the browser, made when the first diagram is laid out. */
export function engine(): Engine {
  elk ??= new ELK({ workerUrl });
  return elk;
}
