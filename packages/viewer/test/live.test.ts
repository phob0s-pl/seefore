import type { PictureAnswer, ViewerState } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { Live, NO_PICTURE, UNREACHABLE } from '../src/live.ts';
import type { Server, Shown } from '../src/live.ts';
import { CONTAINER_PICTURE, CONTEXT_PICTURE, STATE, answerFor } from './fixture.ts';

/** Keeping the page in step with the server: a state and its picture together, and a late answer dropped. */

/** A promise that the test settles when it likes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type PictureReply = PictureAnswer | 'stale' | 'missing';

/** A server whose every answer the test gives by hand, in the order it likes. */
function handServer() {
  const states: ReturnType<typeof deferred<ViewerState>>[] = [];
  const pictures: { revision: string; view: string; reply: ReturnType<typeof deferred<PictureReply>> }[] = [];
  const server: Server = {
    state() {
      const reply = deferred<ViewerState>();
      states.push(reply);
      return reply.promise;
    },
    picture(revision, view) {
      const reply = deferred<PictureReply>();
      pictures.push({ revision, view, reply });
      return reply.promise;
    },
  };
  return { server, states, pictures };
}

/** Lets every answer given so far be taken in. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

/** A Live on a hand server, with everything it showed. */
function start(route: Shown['route'] = { page: 'start' }) {
  const hand = handServer();
  const shown: Shown[] = [];
  const live = new Live(hand.server, (each) => shown.push(each), route);
  return { ...hand, shown, live };
}

const R2: ViewerState = { ...STATE, revision: 'r2' };

describe('keeping the page in step', () => {
  it('shows a state only with the picture of its view, and opens the first view at the start', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(shown).toEqual([]);
    expect(pictures[0]).toMatchObject({ revision: 'r1', view: 'shop.context' });
    pictures[0]?.reply.resolve(answerFor('shop.context'));
    await settle();
    expect(shown).toEqual([{ state: STATE, route: { page: 'view', view: 'shop.context' }, picture: CONTEXT_PICTURE, trouble: null }]);
  });

  it('opens the view the address names', async () => {
    const { live, states, pictures } = start({ page: 'view', view: 'shop.containers' });
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(pictures[0]?.view).toBe('shop.containers');
  });

  it('keeps the state and picture it has until the picture of a new reading comes', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.context'));
    await settle();
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    expect(shown).toHaveLength(1);
    pictures[1]?.reply.resolve(answerFor('shop.context', 'r2'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ state: { revision: 'r2' }, picture: CONTEXT_PICTURE });
  });

  it('drops the picture of an older reading that comes after a newer one', async () => {
    const { live, states, pictures, shown } = start({ page: 'view', view: 'shop.containers' });
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    pictures[1]?.reply.resolve(answerFor('shop.containers', 'r2'));
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.containers'));
    await settle();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ state: { revision: 'r2' }, picture: CONTAINER_PICTURE });
  });

  it('drops a state read before a newer one that comes later', async () => {
    const { live, states, pictures } = start();
    void live.refresh();
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    states[0]?.resolve(STATE);
    await settle();
    expect(pictures.map((picture) => picture.revision)).toEqual(['r2']);
  });

  it('drops an answer for another revision, and reads the state again', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.context', 'r0'));
    await settle();
    expect(shown).toEqual([]);
    expect(states).toHaveLength(2);
  });

  it('reads the state again when the server says the revision is no longer the latest', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve('stale');
    await settle();
    states[1]?.resolve(R2);
    await settle();
    pictures[1]?.reply.resolve(answerFor('shop.context', 'r2'));
    await settle();
    expect(shown).toEqual([{ state: R2, route: { page: 'view', view: 'shop.context' }, picture: CONTEXT_PICTURE, trouble: null }]);
  });

  it('opens another view at the revision it holds, waiting for its picture', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.context'));
    await settle();
    void live.go({ page: 'view', view: 'shop.containers' });
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'view', view: 'shop.containers' }, picture: null });
    expect(pictures[1]).toMatchObject({ revision: 'r1', view: 'shop.containers' });
    pictures[1]?.reply.resolve(answerFor('shop.containers'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'view', view: 'shop.containers' }, picture: CONTAINER_PICTURE });
  });

  it('drops the picture of a view the reader has left', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    void live.go({ page: 'view', view: 'shop.containers' });
    void live.go({ page: 'model' });
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.context'));
    pictures[1]?.reply.resolve(answerFor('shop.containers'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'model' }, picture: null });
  });

  it('opens the first view when the view shown is gone from a new reading', async () => {
    const { live, states, pictures, shown } = start({ page: 'view', view: 'shop.containers' });
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.containers'));
    await settle();
    void live.refresh();
    states[1]?.resolve({ ...R2, views: STATE.views.filter((view) => view.id !== 'shop.containers') });
    await settle();
    expect(pictures[1]?.view).toBe('shop.context');
    pictures[1]?.reply.resolve(answerFor('shop.context', 'r2'));
    await settle();
    expect(shown.at(-1)?.route).toEqual({ page: 'view', view: 'shop.context' });
  });

  it('shows a state with no views at once, and the view wanted again when the views come back', async () => {
    const { live, states, pictures, shown } = start({ page: 'view', view: 'shop.containers' });
    void live.refresh();
    states[0]?.resolve({ ...STATE, available: false, views: [] });
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'start' }, picture: null });
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    expect(pictures[0]).toMatchObject({ revision: 'r2', view: 'shop.containers' });
  });

  it('says when the server cannot be reached, and keeps what it shows', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answerFor('shop.context'));
    await settle();
    void live.refresh();
    states[1]?.reject(new Error('gone'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ state: STATE, picture: CONTEXT_PICTURE, trouble: UNREACHABLE });
  });

  it('says so when the server has no picture of a view its state lists', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve('missing');
    await settle();
    expect(shown.at(-1)?.picture).toEqual({ view: 'shop.context', failed: { reason: 'crash', message: NO_PICTURE } });
  });
});
