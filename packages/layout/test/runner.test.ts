import type { Picture } from '@seefore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layOut } from '../src/index.ts';
import { LAYOUT_LIMIT, startRunner } from '../src/node.ts';
import type { Runner } from '../src/node.ts';
import { box, contextView, crowded, shopContainers, shopContext } from './views.ts';

/** The real worker thread, as source. */
const WORKER = new URL('../src/worker.ts', import.meta.url);

/** A worker thread that hangs, throws or ends on the views named for it, and lays out the others. */
const TROUBLE = new URL('./workers/trouble.ts', import.meta.url);

/** A limit for the tests that is short, and still long enough to start a thread and lay out a small view. */
const SHORT = 1500;

/** A view of one box with the id `system~<name>`. */
function named(name: string) {
  return contextView(name, [box(name, 'systems', { scope: true })], []);
}

const runners: Runner[] = [];

/** A runner that is closed after the test. */
function runner(worker: URL | string, limit?: number): Runner {
  const started = startRunner(limit === undefined ? { worker } : { worker, limit });
  runners.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(runners.splice(0).map((each) => each.close()));
});

describe('the runner', () => {
  it('lays a view out in a worker thread, as the layout does in this one', async () => {
    const view = shopContainers();
    expect(await runner(WORKER).layOut(view)).toEqual(await layOut(view));
  });

  it('gives each view its own picture, one at a time, in the order asked', async () => {
    const asked = runner(WORKER);
    const order: string[] = [];
    const views = [shopContainers(), shopContext(), named('alone'), crowded(10, 5)];
    const pictures = await Promise.all(
      views.map(async (view) => {
        const picture = await asked.layOut(view);
        order.push(picture.view);
        return picture;
      }),
    );
    expect(pictures.map((picture) => picture.view)).toEqual(views.map((view) => view.id));
    expect(order).toEqual(views.map((view) => view.id));
    expect(pictures.every((picture) => !('failed' in picture))).toBe(true);
  });

  it('stops a layout that passes its limit, says so, and lays out the next in a new thread', async () => {
    const asked = runner(TROUBLE, SHORT);
    const started = performance.now();
    const [stopped, next] = await Promise.all([asked.layOut(named('hangs')), asked.layOut(named('after'))]);
    expect(stopped).toEqual({
      view: 'system~hangs',
      failed: { reason: 'time', message: 'This view took more than 1.5 seconds to lay out, so it was stopped and is not drawn. The other views still draw.' },
    });
    expect(next).toMatchObject({ view: 'system~after', boxes: [{ id: 'after' }] });
    expect(performance.now() - started).toBeLessThan(2 * SHORT + 1000);
  });

  it('reports a thread that throws, and lays out the next in a new thread', async () => {
    const asked = runner(TROUBLE, SHORT);
    const [broken, next] = await Promise.all([asked.layOut(named('throws')), asked.layOut(named('after'))]);
    expect(broken).toEqual({
      view: 'system~throws',
      failed: { reason: 'crash', message: 'This view could not be laid out, so it is not drawn. The other views still draw. The layout engine said: “The thread broke on purpose”.' },
    });
    expect(next).toMatchObject({ view: 'system~after', boxes: [{ id: 'after' }] });
  });

  it('reports a thread that ends, and lays out the next in a new thread', async () => {
    const asked = runner(TROUBLE, SHORT);
    const [ended, next] = await Promise.all([asked.layOut(named('exits')), asked.layOut(named('after'))]);
    expect(ended).toEqual({
      view: 'system~exits',
      failed: { reason: 'crash', message: 'The layout of this view stopped before it finished, so it is not drawn. The other views still draw.' },
    });
    expect(next).toMatchObject({ view: 'system~after' });
  });

  it('reports a layout that throws in the thread', async () => {
    const view = contextView('a', [box('a', 'systems', { scope: true })], [{ id: 'a~nowhere', from: 'a', to: 'nowhere', connections: ['c'], names: ['Uses'], technology: [] }]);
    const picture = await runner(WORKER).layOut(view);
    expect(picture).toMatchObject({ view: 'system~a', failed: { reason: 'crash' } });
  });

  it('gives a failure, and never throws, when the worker thread cannot start', async () => {
    const picture = await runner(new URL('./workers/missing.ts', import.meta.url), SHORT).layOut(named('a'));
    expect(picture).toMatchObject({ view: 'system~a', failed: { reason: 'crash', message: expect.stringContaining('This view could not be laid out') } });
  });

  it('gives a failure for a view still waiting when it is closed, and for one asked after', async () => {
    const asked = startRunner({ worker: TROUBLE, limit: SHORT });
    const waiting = [asked.layOut(named('hangs')), asked.layOut(named('after'))];
    await asked.close();
    const closed = 'The layout was closed before this view was laid out, so it is not drawn.';
    expect(await Promise.all(waiting)).toEqual([
      { view: 'system~hangs', failed: { reason: 'crash', message: closed } },
      { view: 'system~after', failed: { reason: 'crash', message: closed } },
    ]);
    expect(await asked.layOut(named('late'))).toEqual({ view: 'system~late', failed: { reason: 'crash', message: closed } });
  });

  it('gives a view of 300 boxes back inside the limit, drawn or as a failure', async () => {
    const view = crowded(200, 100);
    expect(view.boxes).toHaveLength(300);
    const started = performance.now();
    const picture: Picture = await runner(WORKER).layOut(view);
    expect(performance.now() - started).toBeLessThan(LAYOUT_LIMIT + 2000);
    if ('failed' in picture) expect(picture.failed.reason).toBe('time');
    else expect(picture.boxes).toHaveLength(300);
  }, 20_000);
});
