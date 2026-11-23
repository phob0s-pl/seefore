import { settingOf } from '@seefore/core';
import type { Picture, View, ViewerState } from '@seefore/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOX_WIDTH, TEXT_INSET } from '../../layout/src/sizes.ts';
import { START } from '../src/address.ts';
import type { Route } from '../src/address.ts';
import type { Selection } from '../src/follow.ts';
import { COMPONENT_SIGN, SYSTEM_INNER } from '../src/geometry.ts';
import type { Shown } from '../src/live.ts';
import { Page, pageTitle } from '../src/page.tsx';
import { scopeGroups } from '../src/sidebar.tsx';
import { TEXT_SLACK } from '../src/theme.ts';
import { ARCHIVE_FILES, ARCHIVE_STATE, archivePicture, archiveView, stateOf } from './archive.ts';
import { COMPONENT_PICTURE, CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE, HARD_CONTAINERS, HARD_PICTURE, HARD_STATE, STATE, VIEWS } from './fixture.ts';
import { placedPicture } from './placed.ts';

/**
 * The page of stage 9, drawn without a browser: the two controls, the button that makes a box
 * the scope, several boundaries and a boundary inside a boundary, the title of each kind of
 * setting, the new lines of the legend, and what the page says while a picture is laid out, when
 * the box in scope is gone and when there is nothing to draw.
 */

const ROOM = { width: 1600, height: 1000 };

/** The route of the setting with this key. */
function routeTo(key: string): Route {
  const setting = settingOf(key);
  if (setting === undefined) throw new Error(`No setting ${key}.`);
  return { page: 'view', setting };
}

/** The view a route shows: the fixture's made by hand for the shop, else the engine's, as the server hands it. */
function viewFor(route: Route, state: ViewerState): View | undefined {
  if (route.page !== 'view') return undefined;
  const key = `${route.setting.depth}${route.setting.scope === null ? '' : `~${route.setting.scope}`}`;
  if (state.model === STATE.model && VIEWS[key] !== undefined) return VIEWS[key];
  return archiveView(key, state);
}

/** What the page is shown for a route, with the view and picture drawn, and more when given. */
function shownFor(route: Route, picture: Picture | null, state: ViewerState = STATE, view = viewFor(route, state), more: Partial<Shown> = {}): Shown {
  const shot = picture === null || view === undefined ? null : { view, picture };
  return { state, route, shot, laying: false, gone: false, setting: route.page === 'view' ? route.setting : START, trouble: null, ...more };
}

/** The markup of the page for a route and its picture, with something chosen when given. */
function render(route: Route, picture: Picture | null = null, selection: Selection | null = null, state: ViewerState = STATE, view?: View, more: Partial<Shown> = {}): string {
  return renderToStaticMarkup(<Page shown={shownFor(route, picture, state, view ?? viewFor(route, state), more)} room={ROOM} initialSelection={selection} />);
}

/** The page of a setting of the shop as the engine works it out, with a picture placed by hand. */
function engine(key: string, selection: Selection | null = null, state: ViewerState = STATE): string {
  const view = archiveView(key, state);
  return render(routeTo(key), placedPicture(view), selection, state, view);
}

/** A text as the markup holds it. */
function escaped(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;');
}

/** A text as it reads, from how the markup holds it. */
function unescaped(text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

/** The markup of the panel of a page. */
function panelOf(html: string): string {
  return html.slice(html.indexOf('aria-label="Details"'));
}

/** The markup of the sidebar alone. */
function sidebarOf(html: string): string {
  return html.slice(html.indexOf('<nav class="sidebar"'), html.indexOf('</nav>') + '</nav>'.length);
}

/** The shape a box of a look draws: the markup of its outline, from its look to the end of its picture. */
function shapeOf(html: string, look: string): string {
  const start = html.indexOf(`data-look="${look}"`);
  if (start < 0) throw new Error(`No box looks ${look}.`);
  return html.slice(start, html.indexOf('</svg>', start));
}

/** The depths the Depth control offers, as `System, checked` or `System, cannot be chosen`. */
function depthsOf(html: string): string[] {
  return [...sidebarOf(html).matchAll(/<label><input type="radio"([^>]*)\/>([A-Za-z]+)<\/label>/g)].map((found) => {
    const attributes = found[1] ?? '';
    return `${found[2] ?? ''}${attributes.includes(' checked=""') ? ', checked' : ''}${attributes.includes(' disabled=""') ? ', cannot be chosen' : ''}`;
  });
}

/** The groups and options of the Scope control, as text, set in by dots for each space, the option chosen marked with a star. */
function scopesOf(html: string): string[] {
  const select = /<select[^>]*>([^]*?)<\/select>/.exec(sidebarOf(html))?.[1] ?? '';
  return [...select.matchAll(/<optgroup label="([^"]*)">|<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map((found) =>
    found[1] !== undefined ? `[${unescaped(found[1])}]` : `${unescaped(found[4] ?? '').replaceAll(' ', '.')}${found[3] === undefined ? '' : ' *'}`,
  );
}

const containers = routeTo('container~shop');

describe('the sidebar', () => {
  const html = render(containers, CONTAINER_PICTURE);

  it('has the model’s name, then Depth, then Scope, then "View", "Model" and "Problems" with their number, and no list of views', () => {
    const sidebar = sidebarOf(html);
    const order = ['<p class="model-name">Shop</p>', '<legend>Depth</legend>', '>Scope</label>', '>View</a>', '>Model</a>', '>Problems (2)</a>'].map((piece) => sidebar.indexOf(piece));
    expect(order.every((place) => place >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sidebar).not.toContain('Context view');
    expect(sidebar).not.toContain('#/view/system~shop');
  });

  it('shows the three depths at once, as a group of radio buttons named Depth that a keyboard and a screen reader work as they are, the present one chosen', () => {
    expect(sidebarOf(html)).toMatch(/<fieldset class="depth"><legend>Depth<\/legend><label><input type="radio" name="([^"]+)" value="system"\/>System<\/label><label><input type="radio" name="\1" checked="" value="container"/);
    expect(depthsOf(html)).toEqual(['System', 'Container, checked', 'Component']);
  });

  it('lists in Scope, a list labelled Scope, "Everything" first, then each box that can be the scope, grouped and ordered as the listing, a component by its own name with its app after it in brackets', () => {
    expect(scopesOf(html)).toEqual(['Everything', '[People]', 'Customer', '[Shop]', 'Shop *', 'Order API', 'Checkout (Order API)', 'Order status (Order API)', 'Orders database', '[Other systems]', 'Card provider']);
    expect(sidebarOf(html)).toMatch(/<label for="([^"]+)">Scope<\/label><select id="\1">/);
  });

  it('offers, for each choice of Scope, the depths from the box’s own, and the others cannot be chosen', () => {
    const depths = (key: string) => depthsOf(render(routeTo(key)));
    expect(depths('system')).toEqual(['System, checked', 'Container', 'Component']);
    expect(depths('component')).toEqual(['System', 'Container', 'Component, checked']);
    expect(depths('component~customer')).toEqual(['System', 'Container', 'Component, checked']);
    expect(depths('container~order-api')).toEqual(['System, cannot be chosen', 'Container, checked', 'Component']);
    expect(depths('component~checkout')).toEqual(['System, cannot be chosen', 'Container, cannot be chosen', 'Component, checked']);
    expect(depths('container~orders-database')).toEqual(['System, cannot be chosen', 'Container, checked', 'Component']);
  });

  it('offers in Scope, for each choice of Depth, every box, the one in scope chosen, and Everything when it is everything', () => {
    const plain = (options: string[]) => options.map((option) => option.replace(' *', ''));
    const all = plain(scopesOf(html));
    const chosen = (key: string) => scopesOf(render(routeTo(key))).filter((option) => option.endsWith(' *'));
    for (const key of ['system', 'container', 'component', 'component~checkout', 'system~card-provider', 'container~order-api']) expect(plain(scopesOf(render(routeTo(key)))), key).toEqual(all);
    expect(chosen('system')).toEqual(['Everything *']);
    expect(chosen('component')).toEqual(['Everything *']);
    expect(chosen('component~checkout')).toEqual(['Checkout (Order API) *']);
    expect(chosen('system~card-provider')).toEqual(['Card provider *']);
  });

  it('tells two boxes of one name apart by their ids, not counting capitals, and a box named as Everything is', () => {
    const twins = stateOf({
      'seefore.yaml': 'format: 1\nname: Twins\n',
      'people/everything.yaml': 'name: everything\n',
      'systems/billing.yaml': 'name: Billing\n',
      'systems/billing-old.yaml': 'name: Billing\n',
      'systems/ledger.yaml': 'name: Ledger\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/billing-api.yaml': 'name: API\nin: billing\n',
      'apps/ledger-api.yaml': 'name: API\nin: ledger\n',
      'apps/shop-app.yaml': 'name: shop\nin: ledger\n',
      'components/billing-worker.yaml': 'name: Worker\nin: billing-api\n',
      'components/ledger-worker.yaml': 'name: worker\nin: ledger-api\n',
      'components/sorter.yaml': 'name: Sorter\nin: ledger-api\n',
      'infrastructure/proxy.yaml': 'name: Proxy\n',
      'connections/everything-reloads-proxy.yaml': 'from: everything\nto: proxy\n',
    });
    expect(scopesOf(render({ page: 'model' }, null, null, twins))).toEqual([
      'Everything *',
      '[People]',
      'everything (everything)',
      '[Billing (billing)]',
      'Billing (billing)',
      'API (billing-api)',
      'Worker (billing-worker) (API)',
      '[Ledger]',
      'Ledger',
      'API (ledger-api)',
      'worker (ledger-worker) (API)',
      'Sorter (API)',
      'shop (shop-app)',
      '[Other systems]',
      'Billing (billing-old)',
      'Shop (shop)',
      '[Infrastructure]',
      'Proxy',
    ]);
    expect(scopeGroups(twins).map((group) => group.label)).toEqual(['People', 'Billing (billing)', 'Ledger', 'Other systems', 'Infrastructure']);
  });

  it('leads back with "View" to the setting last shown, from the model and the problems, whose controls show it, and marks the page shown', () => {
    expect(sidebarOf(html)).toContain('<a href="#/view/container~shop" aria-current="page">View</a>');
    const model = render({ page: 'model' }, null, null, STATE, undefined, { setting: { depth: 'component', scope: 'checkout' } });
    expect(sidebarOf(model)).toContain('<a href="#/view/component~checkout">View</a>');
    expect(sidebarOf(model)).toContain('<a href="#/model" aria-current="page">Model</a>');
    expect(depthsOf(model)).toEqual(['System, cannot be chosen', 'Container, cannot be chosen', 'Component, checked']);
    const problems = render({ page: 'problems' }, null, null, STATE, undefined, { setting: { depth: 'container', scope: null } });
    expect(sidebarOf(problems)).toContain('<a href="#/view/container">View</a>');
    expect(sidebarOf(problems)).toContain('<a href="#/problems" aria-current="page">Problems (2)</a>');
  });

  it('lets nothing be chosen while there is no model', () => {
    const none = render({ page: 'start' }, null, null, { ...STATE, available: false, problems: [], scopes: [] });
    expect(sidebarOf(none)).toContain('<fieldset class="depth" disabled="">');
    expect(sidebarOf(none)).toMatch(/<select id="[^"]+" disabled="">/);
  });
});

/** The button that makes a record the scope, as the panel has it. */
const SHOW = '<p class="panel-scope"><button type="button">Show with its neighbours</button></p>';

describe('the button "Show with its neighbours"', () => {
  it('stands on the panel of a box that can be the scope, under its name', () => {
    for (const id of ['customer', 'card-provider', 'order-api', 'orders-database']) {
      const panel = panelOf(render(containers, CONTAINER_PICTURE, { kind: 'box', id }));
      expect(panel, id).toContain(SHOW);
      expect(panel.indexOf('</h2>'), id).toBeLessThan(panel.indexOf(SHOW));
    }
  });

  it('stands on the panel of a boundary, and of a record chosen in the listing', () => {
    expect(panelOf(render(routeTo('component~shop'), COMPONENT_PICTURE, { kind: 'box', id: 'order-api' }))).toContain(SHOW);
    expect(panelOf(render({ page: 'model' }, null, { kind: 'record', id: 'checkout' }))).toContain(SHOW);
  });

  it('is not shown for the present scope, as a box or as a boundary, in the picture or the listing', () => {
    expect(panelOf(render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'shop' }))).not.toContain('Show with its neighbours');
    expect(panelOf(render(routeTo('system~shop'), CONTEXT_PICTURE, { kind: 'box', id: 'shop' }, STATE, CONTEXT))).not.toContain('Show with its neighbours');
    expect(panelOf(render({ page: 'model' }, null, { kind: 'record', id: 'checkout' }, STATE, undefined, { setting: { depth: 'component', scope: 'checkout' } }))).not.toContain(
      'Show with its neighbours',
    );
  });

  it('is not shown for what cannot be the scope: an arrow, a thing only passed through, a store an app keeps, a connection, an owner', () => {
    expect(panelOf(render(containers, CONTAINER_PICTURE, { kind: 'arrow', id: 'order-api~card-provider' }))).not.toContain('Show with its neighbours');
    expect(panelOf(render(routeTo(HARD_CONTAINERS.id), HARD_PICTURE, { kind: 'passed', id: 'balancer' }, HARD_STATE, HARD_CONTAINERS))).not.toContain('Show with its neighbours');
    const desk = archiveView('container~archive');
    expect(panelOf(render(routeTo('container~archive'), archivePicture(desk), { kind: 'record', id: 'drafts' }, ARCHIVE_STATE, desk))).not.toContain('Show with its neighbours');
    for (const id of ['customer-uses-shop', 'shop-team']) expect(panelOf(render({ page: 'model' }, null, { kind: 'record', id })), id).not.toContain('Show with its neighbours');
  });

  it('is the only way a box becomes the scope: a click on it opens its panel and changes no setting', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'order-api' });
    expect(depthsOf(html)).toEqual(['System', 'Container, checked', 'Component']);
    expect(scopesOf(html).filter((option) => option.endsWith(' *'))).toEqual(['Shop *']);
  });
});

describe('a boundary inside a boundary', () => {
  const picture = COMPONENT_PICTURE;
  const html = render(routeTo('component~shop'), picture);
  /** The place of a node as React Flow draws it: from the top left of its parent, or of the picture. */
  const at = (id: string) => {
    for (const found of html.matchAll(/transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\)[^>]*data-id="([^"]+)"/g)) if (found[3] === id) return { x: Number(found[1]), y: Number(found[2]) };
    throw new Error(`No node ${id}.`);
  };
  const rect = (id: string) => picture.boxes.find((box) => box.id === id) ?? picture.boundaries.find((boundary) => boundary.id === id) ?? { x: Number.NaN, y: Number.NaN };

  it('draws each boundary as a node, the outer one before the inner, and each box at its place in the whole picture, as React Flow puts a child back from its parent’s', () => {
    for (const id of ['shop', 'order-api', 'checkout', 'order-status', 'orders-database', 'customer', 'card-provider']) {
      const place = rect(id);
      expect(at(id), id).toEqual({ x: place.x, y: place.y });
    }
    expect(html.indexOf('data-id="shop"')).toBeLessThan(html.indexOf('data-id="order-api"'));
    expect(html.indexOf('data-id="order-api"')).toBeLessThan(html.indexOf('data-id="checkout"'));
    // The inner boundary stands above the outer, and the boxes in it above it.
    expect(html).toMatch(/style="z-index:0;transform:[^"]*" data-id="shop"/);
    expect(html).toMatch(/style="z-index:1;transform:[^"]*" data-id="order-api"/);
    expect(html).toMatch(/style="z-index:2;transform:[^"]*" data-id="checkout"/);
  });

  it('draws an arrow from the top left of the picture, wherever its ends stand', () => {
    const arrow = picture.arrows.find((each) => each.id === 'checkout~order-status');
    const [start, end] = arrow?.sections[0] ?? [];
    expect(html).toContain(`d="M${start?.x},${start?.y} L${end?.x},${end?.y}"`);
  });

  it('draws a system’s boundary and an app’s, told apart by their titles and their lines, the chosen one thicker', () => {
    expect(html).toMatch(/<div class="boundary family-systems scope ?"/);
    expect(html).toMatch(/<div class="boundary family-apps ?"/);
    expect(html).toContain('>Order API [App: service · Go]<');
    expect(html).toContain(`aria-label="${escaped('Order API [App: service · Go], the boundary of the app. 1 connection between its copies.')}"`);
  });

  it('carries on an open box’s boundary the marks it carries as a box', () => {
    expect(html).toMatch(/data-id="order-api"[^]*?<div class="marks" aria-hidden="true"><div class="mark">↻ 1<\/div><\/div><\/div>/);
  });

  it('draws a component with a shape of its own and its line', () => {
    expect(html).toMatch(/box family-components ?" data-look="component"/);
    expect(shapeOf(html, 'component')).toMatch(/<rect class="outline" x="1" y="1" width="238" height="148" stroke-width="2"><\/rect><path class="outline rim" d="M/);
    expect(html).toContain('>[Component]<');
  });

  it('keeps a component’s text clear of the sign in its top right corner, in the room the layout broke its lines for', () => {
    const { left, right } = TEXT_INSET.component;
    // The left edge of the sign, with its tabs and half its line.
    const sign = BOX_WIDTH - COMPONENT_SIGN.inset - COMPONENT_SIGN.size - SYSTEM_INNER / 2;
    // A line may run to the edge of its room, and the page gives it a little more.
    expect(BOX_WIDTH - right + TEXT_SLACK).toBeLessThan(sign);
    const components = new Set(['checkout', 'order-status']);
    const insetted = { ...picture, boxes: picture.boxes.map((each) => (components.has(each.id) ? { ...each, inset: { left, right } } : each)) };
    const drawn = render(routeTo('component~shop'), insetted);
    expect(drawn.match(/data-look="component"[^]*?<div class="box-text" style="([^"]*)"/)?.[1]).toBe(`padding-left:${left - TEXT_SLACK}px;padding-right:${right - TEXT_SLACK}px`);
  });

  it('lets a boundary be chosen as a box is: it lights what a box lights, says its words on the reading line, and opens its panel', () => {
    const chosen = render(routeTo('component~shop'), picture, { kind: 'box', id: 'order-api' });
    expect(chosen).toMatch(/<div class="boundary family-apps lit chosen"/);
    expect(chosen).toContain('box family-systems lit" data-look="system"');
    expect(chosen).toContain('box family-components faded');
    expect(chosen).toContain('<p class="reading-line" title="Order API [App: service · Go]"><span>Order API [App: service · Go]</span></p>');
    const panel = panelOf(chosen);
    expect(panel).toContain('>Order API</h2>');
    expect(panel).toContain('Between its copies (1)');
  });
});

describe('several boundaries', () => {
  it('draws each open system of everything as a boundary of its own', () => {
    const state = stateOf({
      'seefore.yaml': 'format: 1\nname: Pair\n',
      'systems/east.yaml': 'name: East\n',
      'systems/west.yaml': 'name: West\n',
      'apps/east-app.yaml': 'name: East app\nin: east\n',
      'apps/west-app.yaml': 'name: West app\nin: west\n',
      'connections/east-app-calls-west-app.yaml': 'from: east-app\nto: west-app\nname: Calls\n',
    });
    const html = engine('container', null, state);
    expect(html.match(/<div class="boundary family-systems ?"/g)).toHaveLength(2);
    expect(html).toContain('>East [System]<');
    expect(html).toContain('>West [System]<');
    expect(html).toContain('Boundary: a system, with its apps and stores inside');
  });
});

describe('the title of each kind of setting', () => {
  it('names the depth and the scope, and keeps "Context view" for one system at System depth', () => {
    const title = (key: string) => /<h1 class="view-title">([^<]*)<\/h1>/.exec(engine(key))?.[1];
    expect(title('system')).toBe('System view: Everything');
    expect(title('container')).toBe('Container view: Everything');
    expect(title('component')).toBe('Component view: Everything');
    expect(title('system~shop')).toBe('Context view: Shop');
    expect(title('container~shop')).toBe('Container view: Shop');
    expect(title('component~shop')).toBe('Component view: Shop');
  });

  it('has the kind of a chosen box that is not a system after its name, and the page’s tab title follows', () => {
    const title = (key: string) => /<h1 class="view-title">([^<]*)<\/h1>/.exec(engine(key))?.[1];
    expect(title('container~order-api')).toBe('Container view: Order API [App]');
    expect(title('component~order-api')).toBe('Component view: Order API [App]');
    expect(title('component~checkout')).toBe('Component view: Checkout [Component]');
    expect(title('system~customer')).toBe('System view: Customer [Person]');
    expect(title('container~orders-database')).toBe('Container view: Orders database [Store]');
    expect(title('system~card-provider')).toBe('Context view: Card provider');
    expect(engine('container~order-api')).toContain('aria-label="The picture: Container view: Order API [App]"');
    const app = archiveView('container~order-api', STATE);
    expect(pageTitle(shownFor(routeTo('container~order-api'), placedPicture(app), STATE, app))).toBe('Container view: Order API [App] · Shop · seefore');
  });
});

describe('the legend of stage 9', () => {
  const keys = (html: string) => [...html.matchAll(/<li data-key="([^"]+)"/g)].map((found) => found[1]);

  it('has the lines for a component and for the boundary of an app only where the picture draws them, each with its sample', () => {
    const open = engine('component~shop');
    expect(keys(open)).toEqual(expect.arrayContaining(['component', 'boundary-app']));
    expect(open).toMatch(/data-key="component" tabindex="0" aria-describedby="[^"]+"><svg class="sample"[^]*?<g class="sample-box family-components">/);
    expect(open).toMatch(/data-key="boundary-app" tabindex="0" aria-describedby="[^"]+"><svg class="sample"[^]*?<rect class="sample-boundary sample-boundary-app"/);
    expect(open).toContain('<span>Component: a part of an app</span>');
    expect(open).toContain('<span>Boundary: an app, with its components inside</span>');
    for (const key of ['container~shop', 'system', 'container~order-api']) expect(keys(engine(key)), key).not.toContain('boundary-app');
    expect(keys(engine('container~shop'))).not.toContain('component');
  });

  it('has "This box" for a chosen box that is not a system, with the thicker line as its sample, in the box’s own shape, and on the box', () => {
    const sample = (html: string) => {
      const start = html.indexOf('data-key="scope"');
      return html.slice(start, html.indexOf('</svg>', start));
    };
    const app = engine('container~order-api');
    expect(keys(app)).toContain('scope');
    expect(app).toContain('<span>This box: what the view is about</span>');
    expect(sample(app)).toContain('<g class="sample-box family-apps"><rect class="outline" x="1.5" y="1.5" width="45" height="27" rx="4" stroke-width="3">');
    expect(sample(engine('container~orders-database'))).toMatch(/<g class="sample-box family-stores"><path class="outline" d="M[^"]*" stroke-width="3">/);
    expect(sample(engine('component~checkout'))).toContain('<g class="sample-box family-components"><rect class="outline" x="1.5" y="1.5" width="45" height="27" stroke-width="3">');
    expect(sample(engine('component~order-api'))).toContain('<rect class="sample-boundary sample-boundary-app sample-scope"');
    expect(shapeOf(app, 'app')).toMatch(/<rect class="outline" x="2" y="2" width="236" height="146" rx="10" stroke-width="4">/);
    expect(app).toContain('box family-apps scope');
    expect(keys(engine('container~shop'))).not.toContain('scope');
    expect(keys(engine('system'))).not.toContain('scope');
    // Open, the chosen app has the thicker line on its boundary.
    expect(engine('component~order-api')).toMatch(/<div class="boundary family-apps scope ?"/);
  });

  it('gives each look the thicker line when it is the chosen box', () => {
    expect(shapeOf(engine('system~customer'), 'person')).toContain('stroke-width="4"');
    expect(shapeOf(engine('container~orders-database'), 'store')).toContain('stroke-width="4"');
    expect(shapeOf(engine('component~checkout'), 'component')).toMatch(/<rect class="outline" x="2" y="2" width="236" height="146" stroke-width="4">/);
  });

  it('says of a system, with everything as the scope, what a system is, and draws no box thicker', () => {
    const everything = engine('system');
    expect(everything).toContain('<span>System: software seen as one thing, ours or somebody else&#x27;s</span>');
    expect(everything).not.toContain(' scope ');
    expect(everything).not.toContain('stroke-width="4"');
  });
});

describe('the counts of a view of one box that is not a system', () => {
  it('say how many connections between two of its neighbours are not drawn', () => {
    const view = archiveView('container~desk');
    expect(view.left.outside).toEqual(['indexer-reads-records']);
    const html = render(routeTo('container~desk'), archivePicture(view), null, ARCHIVE_STATE, view);
    expect(html).toContain('1 connection between two of its neighbours is not drawn: <a href="#/model">see the model</a>.');
  });

  it('count the stores drawn at the boundary of an open app', () => {
    const state = stateOf(ARCHIVE_FILES);
    const view = archiveView('component~archive', state);
    expect(view.boundaries.map((boundary) => [boundary.id, boundary.kept.length])).toContainEqual(['desk', 2]);
    expect(render(routeTo('component~archive'), placedPicture(view), null, state, view)).toMatch(/<p class="view-counts">[^<]*2 stores are drawn at the apps that keep them\./);
  });
});

describe('while a picture is laid out, and when the box in scope is gone', () => {
  it('keeps the picture before, and says over its canvas that the next is laid out, where a screen reader hears it', () => {
    const html = render(routeTo('component~shop'), CONTAINER_PICTURE, null, STATE, CONTAINERS, { laying: true });
    expect(html).toContain('<div class="canvas"><p class="laying" role="status">Laying out the view…</p>');
    // The picture before stays, and the controls show the setting chosen.
    expect(html).toContain('>Container view: Shop</h1>');
    expect(depthsOf(html)).toEqual(['System', 'Container', 'Component, checked']);
    expect(render(containers, CONTAINER_PICTURE)).toContain('<div class="canvas"><p class="laying" role="status"></p>');
  });

  it('says it while the first picture is laid out', () => {
    expect(render(containers, null)).toContain('<p class="waiting" role="status">Laying out the view…</p>');
  });

  it('says under the title that the box is gone, and that this is everything', () => {
    const view = archiveView('container', STATE);
    const html = render(routeTo('container'), placedPicture(view), null, STATE, view, { gone: true });
    expect(html).toContain('</div></div><p class="gone" role="status">That box is gone. This is everything.</p><p class="view-counts">');
    expect(render(containers, CONTAINER_PICTURE)).toContain('<p class="gone" role="status"></p>');
  });
});

describe('a model with nothing to draw', () => {
  it('says "No boxes to draw." under the title of everything at System depth', () => {
    const state = stateOf({ 'seefore.yaml': 'format: 1\nname: Empty\n', 'owners/team.yaml': 'name: Team\n' });
    expect(state.scopes).toEqual([]);
    const html = engine('system', null, state);
    expect(html).toContain('>System view: Everything</h1>');
    expect(html).toContain('<p class="nothing">No boxes to draw.</p>');
    expect(html).not.toContain('react-flow');
  });
});
