import { keyOf, load, settingOf, viewsFor } from '@seefore/core';
import type { Drawn, Model, Setting, View } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { graphOf, sorted, turnsFrom, turnsOf, unzips } from '../src/graph.ts';
import { layOut } from '../src/index.ts';
import { startRunner } from '../src/runner.ts';
import { BOX_HEIGHT, BOX_WIDTH } from '../src/sizes.ts';
import { againstWalk, columnPairs } from './change.ts';
import { nesting, troubles } from './geometry.ts';

/**
 * The layout of the views of depth and scope, as `docs/depth-and-scope.md` says under "The
 * layout": a boundary inside a boundary, several boundaries, the walk over every drawn thing,
 * the turns taken from the picture one depth up, two people, and the split of a long column. On
 * models made by code.
 */

/** The model of a source directory of these files and a marker. */
function modelOf(files: Readonly<Record<string, string>>): Model {
  return load(Object.entries({ 'seefore.yaml': 'format: 1\nname: Layout\n', ...files }).map(([path, text]) => ({ path, text }))).model;
}

/**
 * A shop of two apps with components, one of which keeps a store, a store and a gate of its
 * own; a bank with an app of components; a mail system with nothing in it; and two people, one
 * of whom asks the other, while the other reaches the shop through a proxy in no system, which
 * has no box.
 */
const ESTATE: Readonly<Record<string, string>> = {
  'people/ann.yaml': 'name: Ann\n',
  'people/bob.yaml': 'name: Bob\n',
  'systems/shop.yaml': 'name: Shop\n',
  'systems/bank.yaml': 'name: Bank\n',
  'systems/mail.yaml': 'name: Mail\n',
  'apps/web.yaml': 'name: Web\nin: shop\n',
  'apps/api.yaml': 'name: API\nin: shop\n',
  'apps/ledger.yaml': 'name: Ledger\nin: bank\n',
  'components/page.yaml': 'name: Page\nin: web\n',
  'components/cart.yaml': 'name: Cart\nin: web\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\n',
  'components/status.yaml': 'name: Status\nin: api\n',
  'components/client.yaml': 'name: Bank client\nin: api\n',
  'components/post.yaml': 'name: Post\nin: ledger\n',
  'components/audit.yaml': 'name: Audit\nin: ledger\n',
  'stores/orders.yaml': 'name: Orders\nin: shop\n',
  'stores/cache.yaml': 'name: Cache\nin: api\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: shop\n',
  'infrastructure/proxy.yaml': 'name: Proxy\n',
  'connections/ann-asks-bob.yaml': 'from: ann\nto: bob\nname: Asks for help\n',
  'connections/bob-uses-page.yaml': 'from: bob\nto: page\nvia: [proxy]\nname: Opens the shop\n',
  'connections/page-fills-cart.yaml': 'from: page\nto: cart\nname: Fills the cart\n',
  'connections/cart-calls-checkout.yaml': 'from: cart\nto: checkout\nname: Checks out\n',
  'connections/checkout-asks-status.yaml': 'from: checkout\nto: status\nname: Asks how far it has got\n',
  'connections/checkout-writes-orders.yaml': 'from: checkout\nto: orders\nname: Writes the order\n',
  'connections/status-keeps-cache.yaml': 'from: status\nto: cache\nname: Keeps what it found\n',
  'connections/client-posts.yaml': 'from: client\nto: post\nname: Books the sale\n',
  'connections/post-tells-audit.yaml': 'from: post\nto: audit\nname: Tells the audit\n',
  'connections/gate-checks-api.yaml': 'from: gate\nto: api\nname: Checks that it answers\n',
  'connections/api-sends-mail.yaml': 'from: api\nto: mail\nname: Sends a receipt\n',
  'connections/ann-uses-web.yaml': 'from: ann\nto: web\nname: Browses\n',
  'connections/ledger-tells-shop.yaml': 'from: ledger\nto: shop\nname: Tells the shop\n',
  'connections/audit-wakes-ledger.yaml': 'from: audit\nto: ledger\nname: Wakes the ledger\n',
};

/** The picture of a view laid out from the views above it, which the test needs drawn. */
async function drawn(view: View, above: readonly View[] = []): Promise<Drawn> {
  const picture = await layOut(view, above);
  if ('failed' in picture) throw new Error(`${view.id} was not drawn: ${picture.failed.message}`);
  return picture;
}

/** Each setting of a model with its view and the views above it, as the server would lay it out. */
function settingsOf(model: Model): { setting: Setting; view: View; above: View[] }[] {
  const views = viewsFor(model);
  return views.settings().map((setting) => ({ setting, view: views.viewOf(setting) as View, above: views.above(setting).map((each) => views.viewOf(each) as View) }));
}

/** The view with its boxes, boundaries and arrows in the opposite order. */
function reordered(view: View): View {
  return { ...view, boxes: [...view.boxes].reverse(), boundaries: [...view.boundaries].reverse(), arrows: [...view.arrows].reverse() };
}

describe('every setting of a model', () => {
  const model = modelOf(ESTATE);
  const all = settingsOf(model);

  it('is laid out, with no box outside its boundary, no boundary across another, and no box, line or label over another', async () => {
    expect(all).toHaveLength(35);
    for (const { view, above } of all) {
      const picture = await drawn(view, above);
      expect([view.id, nesting(view, picture)]).toEqual([view.id, []]);
      expect([view.id, troubles(picture)]).toEqual([view.id, []]);
    }
  }, 60_000);

  it('stands in every column of every boundary in the order of its turns', async () => {
    let pairs = 0;
    for (const { view, above } of all) {
      const picture = await drawn(view, above);
      expect([view.id, againstWalk(view, picture, above)]).toEqual([view.id, []]);
      pairs += columnPairs(view, picture, above).length;
    }
    expect(pairs).toBeGreaterThan(20);
  }, 60_000);

  it('gives the same picture from the same views in another order', async () => {
    for (const key of ['system', 'container', 'component', 'component~shop', 'component~api', 'container~web']) {
      const found = all.find((each) => keyOf(each.setting) === key);
      if (found === undefined) throw new Error(`No setting ${key}.`);
      expect(await drawn(reordered(found.view), found.above.map(reordered))).toEqual(await drawn(found.view, found.above));
    }
  }, 60_000);
});

describe('the boundaries of a picture', () => {
  const model = modelOf(ESTATE);
  const views = viewsFor(model);

  it('are a tree for ELK, each with its children inside it and the settings of the boundary of stage 5', () => {
    const view = sorted(views.viewOf({ depth: 'component', scope: null }) as View);
    const graph = graphOf(view, new Map());
    const shop = graph.children?.find((child) => child.id === 'shop');
    const api = shop?.children?.find((child) => child.id === 'api');
    expect(graph.children?.map((child) => child.id)).toEqual(['ann', 'bank', 'bob', 'mail', 'shop']);
    expect(shop?.children?.map((child) => child.id)).toEqual(['api', 'gate', 'orders', 'web']);
    expect(api?.children?.map((child) => child.id)).toEqual(['checkout', 'client', 'status']);
    for (const boundary of [shop, api]) expect(boundary?.layoutOptions?.['elk.padding']).toBe(graph.children?.find((child) => child.id === 'bank')?.layoutOptions?.['elk.padding']);
    // The arrows stay at the top, from the top left of the whole picture.
    expect(graph.edges?.map((edge) => edge.id)).toContain('cart~checkout');
    expect(graph.layoutOptions?.['elk.json.edgeCoords']).toBe('ROOT');
  });

  it('take the turn of the earliest thing inside them, from the inside out', () => {
    const view = sorted(views.viewOf({ depth: 'component', scope: 'shop' }) as View);
    const turns = turnsOf(view);
    for (const boundary of view.boundaries) {
      const inside = [...view.boxes, ...view.boundaries].filter((each) => each.boundary === boundary.id);
      expect(turns.get(boundary.id)).toBe(Math.min(...inside.map((each) => turns.get(each.id) ?? 0)));
    }
    // The shop's turn is that of its earliest app's boundary, which is that of the app's earliest component.
    expect(turns.get('shop')).toBe(Math.min(turns.get('web') ?? 0, turns.get('api') ?? 0, turns.get('orders') ?? 0, turns.get('gate') ?? 0));
  });

  it('give a component the size every box has', async () => {
    const picture = await drawn(views.viewOf({ depth: 'component', scope: null }) as View);
    for (const box of picture.boxes) expect([box.id, box.width, box.height]).toEqual([box.id, BOX_WIDTH, BOX_HEIGHT]);
  });
});

describe('a picture one depth down', () => {
  const model = modelOf(ESTATE);
  const views = viewsFor(model);
  const viewOf = (key: string) => views.viewOf(settingOf(key) as Setting) as View;
  const aboveOf = (key: string) => views.above(settingOf(key) as Setting).map((each) => views.viewOf(each) as View);

  it.each(['container', 'component', 'component~shop', 'component~api', 'component~ann'])('keeps the turns of the picture above for everything in both: %s', (key) => {
    const above = aboveOf(key);
    const [up, ...further] = above;
    if (up === undefined) throw new Error(`Nothing above ${key}.`);
    const turns = turnsFrom(viewOf(key), above);
    const upper = turnsFrom(up, further);
    const both = [...upper.keys()].filter((id) => turns.has(id));
    expect(both.length).toBeGreaterThan(0);
    for (const id of both) expect([id, turns.get(id)]).toEqual([id, upper.get(id)]);
  });

  it('keeps the order down every column of the picture above, for the boxes in both that stand in one column of one boundary in each', async () => {
    for (const key of ['container', 'component', 'component~shop', 'component~api']) {
      const above = aboveOf(key);
      const [up, ...further] = above;
      if (up === undefined) throw new Error(`Nothing above ${key}.`);
      const before = await drawn(up, further);
      const after = await drawn(viewOf(key), above);
      const parents = (view: View) => new Map([...view.boxes, ...view.boundaries].map((each) => [each.id, each.boundary]));
      const [was, now] = [parents(up), parents(viewOf(key))];
      const places = (picture: Drawn) => new Map([...picture.boxes, ...picture.boundaries].map((each) => [each.id, each]));
      const [a, b] = [places(before), places(after)];
      const ids = [...a.keys()].filter((id) => b.has(id) && before.boxes.some((box) => box.id === id) && after.boxes.some((box) => box.id === id));
      for (const [at, one] of ids.entries()) {
        for (const other of ids.slice(at + 1)) {
          const [p, q, r, s] = [a.get(one), a.get(other), b.get(one), b.get(other)];
          if (p === undefined || q === undefined || r === undefined || s === undefined) continue;
          if (was.get(one) !== was.get(other) || now.get(one) !== now.get(other) || Math.abs(p.x - q.x) >= 1 || Math.abs(r.x - s.x) >= 1) continue;
          expect([key, one, other, Math.sign(p.y - q.y)]).toEqual([key, one, other, Math.sign(r.y - s.y)]);
        }
      }
    }
  }, 60_000);

  it('is the same picture laid out afresh as after a change of depth: nothing is taken from a picture laid out before', async () => {
    const fresh = await drawn(viewOf('component'), aboveOf('component'));
    await drawn(viewOf('container~shop'), aboveOf('container~shop'));
    await drawn(viewOf('container'), aboveOf('container'));
    expect(await drawn(viewOf('component'), aboveOf('component'))).toEqual(fresh);
  }, 60_000);

  it('keeps the turns of its own walk for one system at Container depth, whose picture must not change', async () => {
    expect(aboveOf('container~shop')).toEqual([]);
    expect(turnsFrom(viewOf('container~shop'), aboveOf('container~shop'))).toEqual(turnsOf(sorted(viewOf('container~shop'))));
  });
});

describe('two people, one acting on the other', () => {
  const model = modelOf(ESTATE);
  const everything = viewsFor(model).viewOf({ depth: 'system', scope: null }) as View;

  it('let the person acted on go of the first column, and keep every other person there', () => {
    const graph = graphOf(sorted(everything), new Map());
    const first = (graph.children ?? []).filter((child) => child.layoutOptions?.['elk.layered.layering.layerConstraint'] === 'FIRST').map((child) => child.id);
    expect(first).toEqual(['ann']);
  });

  it('are laid out, with the arrow between them', async () => {
    const picture = await drawn(everything);
    expect(picture.arrows.map((arrow) => arrow.id)).toContain('ann~bob');
    expect(troubles(picture)).toEqual([]);
  });
});

describe('the split of a long column', () => {
  /** A system that asks `count - 1` others, each a box of its own. */
  const asking = (count: number, parts = false) => {
    const files: Record<string, string> = { 'systems/hub.yaml': 'name: Hub\n', ...(parts ? { 'apps/core.yaml': 'name: Core\nin: hub\n' } : {}) };
    for (let n = 1; n < count; n += 1) {
      files[`systems/other-${String(n).padStart(2, '0')}.yaml`] = `name: Other ${n}\n`;
      files[`connections/hub-asks-${n}.yaml`] = `from: ${parts ? 'core' : 'hub'}\nto: other-${String(n).padStart(2, '0')}\n`;
    }
    return viewsFor(modelOf(files));
  };

  it('stays for one system at System depth, from 16 boxes', () => {
    expect(unzips(asking(16).viewOf({ depth: 'system', scope: 'hub' }) as View)).toBe(true);
    expect(unzips(asking(15).viewOf({ depth: 'system', scope: 'hub' }) as View)).toBe(false);
  });

  it('stays at a deeper depth of a system that opens nothing, whose picture is the same, and goes where the system opens', async () => {
    const closed = asking(16);
    expect(unzips(closed.viewOf({ depth: 'container', scope: 'hub' }) as View)).toBe(true);
    const system = await drawn(closed.viewOf({ depth: 'system', scope: 'hub' }) as View);
    const container = await drawn(closed.viewOf({ depth: 'container', scope: 'hub' }) as View);
    expect({ ...container, view: '' }).toEqual({ ...system, view: '' });
    expect(unzips(asking(16, true).viewOf({ depth: 'container', scope: 'hub' }) as View)).toBe(false);
  });

  it('is not made with everything as the scope, nor for another box', () => {
    const views = asking(20);
    expect(unzips(views.viewOf({ depth: 'system', scope: null }) as View)).toBe(false);
    expect(unzips(views.viewOf({ depth: 'system', scope: 'other-01' }) as View)).toBe(false);
  });
});

describe('the runner', () => {
  it('lays a view out from the views above it, as in this thread', async () => {
    const views = viewsFor(modelOf(ESTATE));
    const setting: Setting = { depth: 'component', scope: null };
    const view = views.viewOf(setting) as View;
    const above = views.above(setting).map((each) => views.viewOf(each) as View);
    const runner = startRunner({ worker: new URL('../src/worker.ts', import.meta.url) });
    try {
      expect(await runner.layOut(view, above)).toEqual(await layOut(view, above));
    } finally {
      await runner.close();
    }
  }, 30_000);
});
