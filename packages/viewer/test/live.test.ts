import { settingOf } from '@seefore/core';
import type { PictureAnswer, Setting, ViewerState } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/address.ts';
import { Live, NO_PICTURE, UNREACHABLE } from '../src/live.ts';
import type { Server, Shown } from '../src/live.ts';
import { CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE, STATE, VIEWS, answerFor } from './fixture.ts';

/** Keeping the page in step with the server: a state and its picture together, a late answer dropped, and the picture before kept while the next is laid out. */

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
  const pictures: { revision: string; setting: string; reply: ReturnType<typeof deferred<PictureReply>> }[] = [];
  const server: Server = {
    state() {
      const reply = deferred<ViewerState>();
      states.push(reply);
      return reply.promise;
    },
    picture(revision, setting) {
      const reply = deferred<PictureReply>();
      pictures.push({ revision, setting, reply });
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
function start(route: Route = { page: 'start' }) {
  const hand = handServer();
  const shown: Shown[] = [];
  const live = new Live(hand.server, (each) => shown.push(each), route);
  return { ...hand, shown, live };
}

/** The route of a setting named by its key. */
function view(key: string): Route {
  const setting = settingOf(key);
  if (setting === undefined) throw new Error(`No setting ${key}.`);
  return { page: 'view', setting };
}

/** The server's answer for a setting: the fixture's view when it has one, else one made up with nothing in it. */
function answer(key: string, revision = STATE.revision): PictureAnswer {
  if (VIEWS[key] !== undefined) return answerFor(key, revision);
  const setting = settingOf(key) as Setting;
  const made = { ...CONTEXT, id: key, depth: setting.depth, scope: setting.scope, title: key };
  return { revision, view: made, picture: { ...CONTEXT_PICTURE, view: key } };
}

const R2: ViewerState = { ...STATE, revision: 'r2' };

describe('keeping the page in step', () => {
  it('shows a state only with the picture of its setting, and opens everything at System depth at the start', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(shown).toEqual([]);
    expect(pictures[0]).toMatchObject({ revision: 'r1', setting: 'system' });
    pictures[0]?.reply.resolve(answer('system'));
    await settle();
    expect(shown).toEqual([
      { state: STATE, route: view('system'), shot: { view: answer('system').view, picture: { ...CONTEXT_PICTURE, view: 'system' } }, laying: false, gone: false, setting: { depth: 'system', scope: null }, trouble: null },
    ]);
  });

  it('opens the setting the address names', async () => {
    const { live, states, pictures } = start(view('container~shop'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(pictures[0]?.setting).toBe('container~shop');
  });

  it('opens a box the address names at a depth it does not have at the shallowest it has, and puts the address right', async () => {
    const { live, states, pictures, shown } = start(view('system~checkout'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(pictures[0]?.setting).toBe('component~checkout');
    pictures[0]?.reply.resolve(answer('component~checkout'));
    await settle();
    expect(shown.at(-1)?.route).toEqual(view('component~checkout'));
  });

  it('opens the start for a box the address names that the model does not have', async () => {
    const { live, states, pictures } = start(view('container~nowhere'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    expect(pictures[0]?.setting).toBe('system');
  });

  it('keeps the state and picture it has until the picture of a new reading comes, and says that one is laid out', async () => {
    const { live, states, pictures, shown } = start(view('system~shop'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('system~shop'));
    await settle();
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    expect(shown.at(-1)).toMatchObject({ state: { revision: 'r1' }, shot: { picture: CONTEXT_PICTURE }, laying: true });
    pictures[1]?.reply.resolve(answer('system~shop', 'r2'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ state: { revision: 'r2' }, shot: { view: CONTEXT, picture: CONTEXT_PICTURE }, laying: false });
  });

  it('drops the picture of an older reading that comes after a newer one', async () => {
    const { live, states, pictures, shown } = start(view('container~shop'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    pictures[1]?.reply.resolve(answer('container~shop', 'r2'));
    await settle();
    pictures[0]?.reply.resolve(answer('container~shop'));
    await settle();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ state: { revision: 'r2' }, shot: { view: CONTAINERS, picture: CONTAINER_PICTURE } });
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
    pictures[0]?.reply.resolve(answer('system', 'r0'));
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
    pictures[1]?.reply.resolve(answer('system', 'r2'));
    await settle();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ state: R2, route: view('system'), laying: false });
  });

  it('opens another setting at the revision it holds, keeping the picture before while the new one is laid out', async () => {
    const { live, states, pictures, shown } = start(view('system~shop'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('system~shop'));
    await settle();
    void live.go(view('container~shop'));
    await settle();
    // The controls and the address show the new setting at once; the picture before stays, and the page says it lays out the next.
    expect(shown.at(-1)).toMatchObject({ route: view('container~shop'), setting: { depth: 'container', scope: 'shop' }, shot: { view: CONTEXT }, laying: true });
    expect(pictures[1]).toMatchObject({ revision: 'r1', setting: 'container~shop' });
    pictures[1]?.reply.resolve(answer('container~shop'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('container~shop'), shot: { view: CONTAINERS, picture: CONTAINER_PICTURE }, laying: false });
  });

  it('drops a late answer for a setting the reader has left, and puts in only the one wanted', async () => {
    const { live, states, pictures, shown } = start(view('system~shop'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('system~shop'));
    await settle();
    void live.go(view('container~shop'));
    void live.go(view('component~shop'));
    await settle();
    pictures[2]?.reply.resolve(answer('component~shop'));
    await settle();
    pictures[1]?.reply.resolve(answer('container~shop'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('component~shop'), shot: { view: { id: 'component~shop' } }, laying: false });
    expect(shown.some((each) => each.shot?.view.id === 'container~shop')).toBe(false);
  });

  it('drops the picture of a setting the reader has left for the model, and keeps the setting for "View"', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    void live.go(view('container~shop'));
    void live.go({ page: 'model' });
    await settle();
    pictures[0]?.reply.resolve(answer('system'));
    pictures[1]?.reply.resolve(answer('container~shop'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'model' }, shot: null, setting: { depth: 'container', scope: 'shop' } });
  });

  it('shows everything at the same depth when the box in scope is gone from a new reading, says so, and opens the box again when it is back', async () => {
    const { live, states, pictures, shown } = start(view('component~order-api'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('component~order-api'));
    await settle();
    const without: ViewerState = { ...R2, scopes: STATE.scopes.filter((scope) => scope.id !== 'order-api') };
    void live.refresh();
    states[1]?.resolve(without);
    await settle();
    expect(pictures[1]).toMatchObject({ revision: 'r2', setting: 'component' });
    pictures[1]?.reply.resolve(answer('component', 'r2'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('component'), gone: true, laying: false });
    // Still gone in the next reading.
    void live.refresh();
    states[2]?.resolve({ ...without, revision: 'r3' });
    await settle();
    expect(pictures[2]).toMatchObject({ revision: 'r3', setting: 'component' });
    pictures[2]?.reply.resolve(answer('component', 'r3'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ gone: true });
    // Back.
    void live.refresh();
    states[3]?.resolve({ ...STATE, revision: 'r4' });
    await settle();
    expect(pictures[3]).toMatchObject({ revision: 'r4', setting: 'component~order-api' });
    pictures[3]?.reply.resolve(answer('component~order-api', 'r4'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('component~order-api'), gone: false });
  });

  it('says no more that the box is gone once the reader chooses another setting', async () => {
    const { live, states, pictures, shown } = start(view('container~order-api'));
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('container~order-api'));
    await settle();
    void live.refresh();
    states[1]?.resolve({ ...R2, scopes: STATE.scopes.filter((scope) => scope.id !== 'order-api') });
    await settle();
    pictures[1]?.reply.resolve(answer('container', 'r2'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ gone: true });
    void live.go(view('system'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('system'), gone: false, laying: true });
  });

  it('shows a state with no model at once, and the setting wanted again when the model comes back', async () => {
    const { live, states, pictures, shown } = start(view('container~shop'));
    void live.refresh();
    states[0]?.resolve({ ...STATE, available: false, scopes: [] });
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: { page: 'start' }, shot: null });
    void live.refresh();
    states[1]?.resolve(R2);
    await settle();
    expect(pictures[0]).toMatchObject({ revision: 'r2', setting: 'container~shop' });
  });

  it('says when the server cannot be reached, and keeps what it shows', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve(answer('system'));
    await settle();
    void live.refresh();
    states[1]?.reject(new Error('gone'));
    await settle();
    expect(shown.at(-1)).toMatchObject({ state: STATE, shot: { view: { id: 'system' } }, trouble: UNREACHABLE });
  });

  it('says so when the server has no picture of a setting its state has', async () => {
    const { live, states, pictures, shown } = start();
    void live.refresh();
    states[0]?.resolve(STATE);
    await settle();
    pictures[0]?.reply.resolve('missing');
    await settle();
    expect(shown.at(-1)).toMatchObject({ route: view('system'), shot: null, laying: false, trouble: NO_PICTURE });
  });
});
