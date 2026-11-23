import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { keyOf, load, viewsFor } from '@seefore/core';
import type { Model, Setting, View } from '@seefore/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOfStage5 } from '../../core/test/stage-5.ts';
import { layOut } from '../src/index.ts';
import { columnPairs } from './change.ts';
import { files, newRoot, removeRoot, run, statuses, write } from './trial.ts';
import type { Changes, Share, Shares, Trial } from './trial.ts';

/**
 * `scripts/steady.mjs` on the pass numbers that `docs/depth-and-scope.md` adds: 8 to 20, 22 and
 * 23, and `--only` and `--before`, run as a process on models made by code. Each pass number of
 * 8 to 20 must pass on one of the models here and fail on another, as its bar says of what the
 * script measured, so that a script that always says "passes" is caught. Numbers 22 and 23 hold
 * by the way the layout works on any sound model: 22 fails on a file of pictures that differs,
 * and the count of 23 is held to a count made here.
 */

let root: string;
const { marker, app, store, system, person, component, link } = files;

/** A number from 0 to 1, from a seed, the same on every machine. */
function numbers(seed: number): () => number {
  let state = seed * 7919 + 17;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * An estate made from a seed: two or three systems of ours with apps and stores, one app with
 * components, people, and systems outside, joined at random. Its pictures are small, so that one
 * edit or one change of depth weighs much: some of its shares pass a bar and some do not.
 */
function estate(seed: number): Record<string, string> {
  const next = numbers(seed);
  const between = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  const any = <T>(list: readonly T[]): T => list[between(0, list.length - 1)] as T;
  const made: Record<string, string> = { ...marker('Estate') };
  const people = Array.from({ length: between(1, 3) }, (_, at) => `p${at + 1}`);
  const outside = Array.from({ length: between(1, 4) }, (_, at) => `x${at + 1}`);
  const ours = Array.from({ length: between(2, 3) }, (_, at) => `s${at + 1}`);
  for (const id of people) Object.assign(made, person(id));
  for (const id of outside) Object.assign(made, system(id, true));
  const apps: [string, string][] = [];
  const stores: [string, string][] = [];
  for (const id of ours) {
    Object.assign(made, system(id));
    const count = between(2, 5);
    for (let at = 1; at <= count; at++) {
      apps.push([`${id}a${at}`, id]);
      Object.assign(made, app(`${id}a${at}`, id));
    }
    for (let at = 1; at <= between(0, 2); at++) {
      stores.push([`${id}d${at}`, id]);
      Object.assign(made, store(`${id}d${at}`, id));
    }
  }
  const host = any(apps)[0];
  const components = Array.from({ length: between(2, 6) }, (_, at) => `c${at + 1}`);
  for (const id of components) Object.assign(made, component(id, host));
  const joined = new Set<string>();
  const join = (from: string, to: string) => {
    if (from === to || joined.has(`${from} ${to}`) || joined.has(`${to} ${from}`)) return;
    joined.add(`${from} ${to}`);
    Object.assign(made, link(from, to));
  };
  for (const id of people) join(id, any(apps)[0]);
  for (const [id, of] of apps) {
    join(id, any(apps.filter(([, system]) => system === of).map(([other]) => other)));
    if (next() < 0.4) join(id, any(apps)[0]);
    if (next() < 0.4) join(id, any(outside));
    const kept = stores.filter(([, system]) => system === of).map(([store]) => store);
    if (kept.length > 0 && next() < 0.6) join(id, any(kept));
  }
  for (let at = 1; at < components.length; at++) join(components[between(0, at - 1)] ?? '', components[at] ?? '');
  join(components[0] ?? '', any(apps)[0]);
  if (next() < 0.7) join(any(components), any(outside));
  return made;
}

/** A chain made from a seed: one system of ours whose apps call one another in a line, one of them with components. Its pictures are smaller still. */
function chain(seed: number): Record<string, string> {
  const next = numbers(seed);
  const between = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  const made: Record<string, string> = { ...marker('Chain'), ...system('hub'), ...system('zed', true) };
  const apps = between(2, 4);
  for (let at = 1; at <= apps; at++) Object.assign(made, app(`a${at}`, 'hub'));
  for (let at = 2; at <= apps; at++) Object.assign(made, link(`a${at - 1}`, `a${at}`));
  Object.assign(made, link(`a${apps}`, 'zed'));
  if (next() < 0.5) Object.assign(made, person('p1'), link('p1', 'a1'));
  if (next() < 0.5) Object.assign(made, system('yon', true), link(`a${between(1, apps)}`, 'yon'));
  const parts = between(2, 4);
  for (let at = 1; at <= parts; at++) Object.assign(made, component(`c${at}`, 'a1'));
  for (let at = 2; at <= parts; at++) if (next() < 0.7) Object.assign(made, link(`c${at - 1}`, `c${at}`));
  if (next() < 0.5) Object.assign(made, link(`c${parts}`, 'a2'));
  return made;
}

/** A shop with no component: two systems that open, people, and a system outside. */
const SHOP = {
  ...marker('Shop'),
  ...system('shop'),
  ...system('bank'),
  ...system('mail', true),
  ...person('customer'),
  ...person('clerk'),
  ...app('web', 'shop'),
  ...app('api', 'shop'),
  ...app('worker', 'shop'),
  ...store('db', 'shop'),
  ...app('ledger', 'bank'),
  ...app('teller', 'bank'),
  ...link('customer', 'web'),
  ...link('clerk', 'worker'),
  ...link('web', 'api'),
  ...link('api', 'db'),
  ...link('worker', 'db'),
  ...link('api', 'ledger'),
  ...link('teller', 'ledger'),
  ...link('worker', 'mail'),
};

/** The models of the cases of 8 to 20, by the name of their directory. */
const MODELS: Record<string, Record<string, string>> = {
  'estate-1': estate(1),
  'estate-3': estate(3),
  'estate-14': estate(14),
  'chain-6': chain(6),
};

beforeAll(() => {
  root = newRoot();
  for (const [name, made] of Object.entries(MODELS)) write(root, name, made);
  write(root, 'shop', SHOP);
  write(root, 'alone', { ...marker('Alone'), ...system('solo'), ...app('only', 'solo') });
});

afterAll(() => {
  removeRoot(root);
});

/** The model of the files of a directory. */
function modelOf(made: Record<string, string>): Model {
  return load(Object.entries(made).map(([path, text]) => ({ path, text }))).model;
}

/** The mean of the shares there are. */
function meanOf(shares: readonly (number | undefined)[]): number | undefined {
  const there = shares.filter((share) => share !== undefined);
  return there.length === 0 ? undefined : there.reduce((sum, share) => sum + share, 0) / there.length;
}

type Status = 'passes' | 'fails' | 'not tried';

/** The bars of 3 and 4, as the spec has them: 95 % in one column, 75 % in the worst edit that adds something, 80 % both ways. */
function bars(share: Shares | undefined): Status {
  if (share?.columnOrder === undefined || share.adds === undefined || share.orderKept === undefined) return 'not tried';
  return share.columnOrder.mean >= 0.95 && share.adds.worst >= 0.75 && share.orderKept.mean >= 0.8 ? 'passes' : 'fails';
}

/** A bar for the pairs that keep their order both ways. */
function bothWays(share: Share | undefined, bar: number): Status {
  return share === undefined ? 'not tried' : share.mean >= bar ? 'passes' : 'fails';
}

/** A bar for a change of depth: over all, and in the worst. */
function depth(changes: Changes | undefined, mean: number, worst: number): Status {
  const kept = changes?.kept;
  return kept === undefined ? 'not tried' : kept.mean >= mean && kept.worst >= worst ? 'passes' : 'fails';
}

/** What each pass number of 8 to 20 should say, from what the script measured, as the spec sets its bar. */
const JUDGES: Record<number, (all: Trial['all']) => Status> = {
  8: (all) => bothWays(all.shares.everythingSystem?.orderKept, 0.8),
  9: (all) => bars(all.shares.everythingContainer),
  10: (all) => bars(all.shares.everythingComponent),
  11: (all) => bars(all.shares.boundaries),
  12: (all) => bars(all.shares.nested),
  13: (all) => bothWays(all.shares.systemComponent?.orderKept, 0.8),
  14: (all) => bothWays(all.shares.appComponent?.orderKept, 0.8),
  15: (all) => bars(all.shares.components),
  16: (all) => {
    const { container, component } = all.shares.inside;
    return container === undefined || component === undefined ? 'not tried' : container.mean >= 0.8 && component.mean >= 0.8 ? 'passes' : 'fails';
  },
  17: (all) => depth(all.shares.depth?.['everything-system'], 0.75, 0.5),
  18: (all) => depth(all.shares.depth?.['everything-container'], 0.8, 0.75),
  19: (all) => depth(all.shares.depth?.['system-container'], 0.8, 0.6),
  20: (all) => depth(all.shares.depth?.['app-container'], 0.9, 0.8),
};

/** Each setting of a model with its view and the views above it. */
function settingsOf(model: Model): { setting: Setting; view: View; above: View[] }[] {
  const views = viewsFor(model);
  return views.settings().map((setting) => ({ setting, view: views.viewOf(setting) as View, above: views.above(setting).map((each) => views.viewOf(each) as View) }));
}

/** The changes of depth of a model that open nothing: a setting and the same scope one depth down, where no box of the first is open in the second. */
function changesThatOpenNothing(model: Model): number {
  const views = viewsFor(model);
  let found = 0;
  for (const setting of views.settings()) {
    const down = setting.depth === 'system' ? 'container' : setting.depth === 'container' ? 'component' : undefined;
    if (down === undefined) continue;
    const upper = views.viewOf(setting) as View;
    const lower = views.viewOf({ depth: down, scope: setting.scope });
    if (lower === undefined) continue;
    const boxes = new Set(upper.boxes.map((box) => box.id));
    if (!lower.boundaries.some((boundary) => boxes.has(boundary.id))) found += 1;
  }
  return found;
}

/** The views and pictures of stage 5 of a model, as the code of stage 8 wrote them out: each system at System depth, and each that opens at Container depth. */
async function stage8Of(model: Model): Promise<{ views: unknown[]; pictures: unknown[] }> {
  const views = viewsFor(model);
  const settings = model.systems.flatMap((each): Setting[] => {
    const container: Setting = { depth: 'container', scope: each.id };
    return [{ depth: 'system', scope: each.id }, ...((views.viewOf(container)?.boundaries.length ?? 0) > 0 ? [container] : [])];
  });
  const made = { views: [] as unknown[], pictures: [] as unknown[] };
  for (const setting of settings) {
    const view = views.viewOf(setting) as View;
    const old = asOfStage5(view);
    const picture = await layOut(view, []);
    if ('failed' in picture) throw new Error(`${keyOf(setting)} was not drawn.`);
    const { boundaries, view: _, ...rest } = picture;
    made.views.push(old);
    made.pictures.push({ ...rest, view: old.id, ...(boundaries[0] === undefined ? {} : { boundary: boundaries[0] }) });
  }
  return JSON.parse(JSON.stringify(made)) as { views: unknown[]; pictures: unknown[] };
}

describe('the pass numbers of depth and scope', () => {
  it('tries the pass numbers --only names and no other, and says why it cannot try one', async () => {
    const trial = JSON.parse((await run(root, '--json', '--only=8,17-18', 'shop')).out) as Trial;
    expect(trial.passes.map((each) => each.number)).toEqual([8, 17, 18]);
    // What the others need is not laid out: no edit on the pictures of stage 5, no new words.
    expect(trial.directories[0]?.containers).toBeUndefined();
    expect(trial.directories[0]?.words.tried).toBe(0);
    for (const [only, says] of [
      ['7', 'went with the check'],
      ['21', "is the page's"],
      ['24', 'There is no pass number 24'],
      ['1,x', 'neither'],
    ]) {
      const result = await run(root, `--only=${only}`, 'shop');
      expect(result.code).toBe(2);
      expect(result.out).toBe('');
      expect(result.err).toContain(says);
    }
  }, 60_000);

  it('passes and fails each of 8 to 20 as its bar says of what it measured, and each both ways on these models', async () => {
    const seen = new Map<number, Set<Status>>();
    const runs = await Promise.all(Object.keys(MODELS).map(async (name) => [name, await run(root, '--json', '--only=8-20', name)] as const));
    for (const [name, result] of runs) {
      const trial = JSON.parse(result.out) as Trial;
      expect([name, trial.passes.map((each) => each.number)]).toEqual([name, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]);
      for (const each of trial.passes) {
        expect([name, each.number, each.status]).toEqual([name, each.number, JUDGES[each.number]?.(trial.all)]);
        seen.set(each.number, (seen.get(each.number) ?? new Set()).add(each.status));
      }
      expect(result.code).toBe(trial.passes.every((each) => each.status === 'passes') ? 0 : 1);
      // A share is the mean of each edit's own, or each change's, from the rows the script gives,
      // summed in the same order: none when there is no row to rest on.
      const [directory] = trial.directories;
      const rows = directory?.whole ?? {};
      const kept = (list: readonly { orderKept?: number }[] | undefined) => meanOf((list ?? []).map((row) => row.orderKept));
      expect(trial.all.shares.everythingSystem?.orderKept?.mean).toBe(kept(rows.system?.rows));
      expect(trial.all.shares.boundaries?.orderKept?.mean).toBe(kept(rows.container?.rows.filter((row) => (row.boundaries?.[0] ?? 0) > 1 && (row.boundaries?.[1] ?? 0) > 1)));
      expect(trial.all.shares.nested?.orderKept?.mean).toBe(kept(rows.component?.rows.filter((row) => row.nested?.[0] === true && row.nested[1])));
      expect(trial.all.shares.inside.component?.mean).toBe(meanOf((rows.component?.rows ?? []).map((row) => row.insideKept)));
      expect(trial.all.shares.depth?.['everything-system']?.kept?.mean).toBe(kept(directory?.depth?.['everything-system']?.rows));
      // The component edits are tried on everything, the app's system and the app.
      expect(new Set(directory?.components?.rows.map((row) => row.where))).toEqual(new Set(['everything', 'system', 'app']));
    }
    for (let number = 8; number <= 20; number++) expect([number, [...(seen.get(number) ?? [])]]).toEqual([number, expect.arrayContaining(['fails', 'passes'])]);
  }, 120_000);

  it('calls 14, 15 and 20 not tried on a model with no component', async () => {
    const result = await run(root, '--json', '--only=14,15,20', 'shop');
    const trial = JSON.parse(result.out) as Trial;
    expect(statuses(trial)).toEqual({ 14: 'not tried', 15: 'not tried', 20: 'not tried' });
    expect(trial.directories[0]?.notes).toContain('no app has a component, so none is chosen at Component depth');
    expect(result.code).toBe(1);
  }, 60_000);

  it('gives the same picture for every change of depth that opens nothing, and counts each', async () => {
    const trial = JSON.parse((await run(root, '--json', '--only=22', 'estate-1')).out) as Trial;
    const same = trial.directories[0]?.same;
    expect(same?.tried).toBe(changesThatOpenNothing(modelOf(MODELS['estate-1'] ?? {})));
    expect(same?.tried).toBeGreaterThan(10);
    expect(same?.differ).toBe(0);
    // Without the pictures of stage 8, the first half is not tried, and nor is the pass number.
    const [twentySecond] = trial.passes;
    expect(twentySecond?.status).toBe('not tried');
    expect(twentySecond?.measured).toContain('no --before');
  }, 60_000);

  it('holds the two pictures of stage 5 against a file of them, and fails on a picture or a view that differs', async () => {
    const before = join(root, 'before');
    mkdirSync(before, { recursive: true });
    const made = await stage8Of(modelOf(SHOP));
    const tried = async (file: unknown) => {
      writeFileSync(join(before, 'shop.json'), JSON.stringify(file));
      return JSON.parse((await run(root, '--json', '--only=22', `--before=${before}`, 'shop')).out) as Trial;
    };
    const faithful = await tried(made);
    expect(faithful.all.stage8).toEqual({ compared: made.views.length, missing: 0, viewsDiffer: 0, picturesDiffer: 0, notInFile: 0 });
    expect(made.views.length).toBe(5);
    expect(statuses(faithful)).toEqual({ 22: 'passes' });
    // A box one pixel to the right in one picture, and a box of another name in one view.
    const moved = structuredClone(made) as { pictures: { boxes: { x: number }[] }[] };
    (moved.pictures[1]?.boxes[0] ?? { x: 0 }).x += 1;
    expect((await tried(moved)).all.stage8).toMatchObject({ viewsDiffer: 0, picturesDiffer: 1 });
    expect(statuses(await tried(moved))).toEqual({ 22: 'fails' });
    const renamed = structuredClone(made) as { views: { boxes: { name: string }[] }[] };
    (renamed.views[0]?.boxes[0] ?? { name: '' }).name = 'Another name';
    expect((await tried(renamed)).all.stage8).toMatchObject({ viewsDiffer: 1, picturesDiffer: 0 });
    // A picture of stage 5 that the file does not have differs too.
    const fewer = { views: made.views.slice(1), pictures: made.pictures.slice(1) };
    expect((await tried(fewer)).all.stage8).toMatchObject({ compared: 4, notInFile: 1 });
  }, 120_000);

  it('says why it cannot compare a directory that --before has no file for, and ends with exit code 2', async () => {
    const empty = join(root, 'no-pictures');
    mkdirSync(empty, { recursive: true });
    const result = await run(root, '--only=22', `--before=${empty}`, 'shop');
    expect(result.code).toBe(2);
    expect(result.out).toBe('');
    expect(result.err).toContain('has no file of the pictures of stage 8');
    // Without number 22 the folder is not read.
    expect((await run(root, '--only=8', `--before=${empty}`, 'shop')).code).not.toBe(2);
  }, 60_000);

  it('counts every pair of one column of one boundary, or of none, in every setting against its turns', async () => {
    const result = await run(root, '--json', '--only=23', 'estate-3');
    const trial = JSON.parse(result.out) as Trial;
    let pairs = 0;
    const model = modelOf(MODELS['estate-3'] ?? {});
    for (const { view, above } of settingsOf(model)) {
      const picture = await layOut(view, above);
      if ('failed' in picture) throw new Error(`${view.id} was not drawn.`);
      pairs += columnPairs(view, picture, above).length;
    }
    // Each setting is laid out once for 23 alone, and every pair of it is counted.
    expect(trial.all.layouts).toBe(settingsOf(model).length);
    expect(trial.all.walk).toEqual({ pairs, against: 0, views: 0 });
    expect(pairs).toBeGreaterThan(100);
    expect(statuses(trial)).toEqual({ 23: 'passes' });
    // A model with no two boxes of one boundary in one column has nothing to measure.
    expect(statuses(JSON.parse((await run(root, '--json', '--only=23', 'alone')).out) as Trial)).toEqual({ 23: 'not tried' });
  }, 60_000);
});
