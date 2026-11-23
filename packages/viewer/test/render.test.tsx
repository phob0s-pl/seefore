import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CROWDED_FROM } from '@seefore/core';
import type { Drawn, View, ViewerState } from '@seefore/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/address.ts';
import type { Selection } from '../src/follow.ts';
import { holdersWords } from '../src/listing.tsx';
import type { Shown } from '../src/live.ts';
import { Page, pageTitle } from '../src/page.tsx';
import { ARCHIVE_FILES, ARCHIVE_STATE, archivePicture, archiveView, stateOf } from './archive.ts';
import {
  BROKEN_HOP_STATE,
  CONTAINERS,
  CONTAINER_PICTURE,
  CONTEXT,
  CONTEXT_PICTURE,
  FAILED_PICTURE,
  HARD_CONTAINERS,
  HARD_MODEL,
  HARD_OUTLINE,
  HARD_PICTURE,
  HARD_STATE,
  MODEL,
  PROBLEMS,
  STATE,
} from './fixture.ts';
import { grid } from './grid.ts';

/** The page drawn without a browser, as React's server rendering draws it. */

const ROOM = { width: 1600, height: 1000 };

/** The markup of the page for a route, with its picture, and something chosen when given. */
function render(route: Route, picture: Shown['picture'] = null, selection: Selection | null = null, state = STATE): string {
  return renderToStaticMarkup(<Page shown={{ state, route, picture, trouble: null }} room={ROOM} initialSelection={selection} />);
}

/** A text as the markup holds it. */
function escaped(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;');
}

/** How many times a piece of markup comes in a text. */
function times(text: string, piece: string): number {
  return text.split(piece).length - 1;
}

/** Every line of text a picture gives: names, kind lines, sentences, labels and the boundary's title. */
function linesOf(drawn: Drawn): string[] {
  return [
    ...drawn.boxes.flatMap((box) => [...box.name, box.line, ...box.sentence]),
    ...drawn.arrows.flatMap((arrow) => (arrow.label === undefined ? [] : [...arrow.label.lines, ...(arrow.label.technology === undefined ? [] : [arrow.label.technology])])),
    ...(drawn.boundary === undefined ? [] : [drawn.boundary.title]),
  ];
}

const containers: Route = { page: 'view', view: CONTAINERS.id };

describe('a picture drawn without a browser', () => {
  const html = render(containers, CONTAINER_PICTURE);

  it('draws every line of text the picture gives, each as it is given', () => {
    for (const line of linesOf(CONTAINER_PICTURE)) expect(html).toContain(`>${escaped(line)}<`);
  });

  it('draws a box for each box and one for the boundary, and an arrow for each arrow', () => {
    expect(times(html, 'class="react-flow__node ')).toBe(CONTAINER_PICTURE.boxes.length + 1);
    expect(times(html, 'class="react-flow__edge ')).toBe(CONTAINER_PICTURE.arrows.length);
  });

  it('draws each arrow along its route, with its head at the end', () => {
    expect(html).toContain('d="M280,275 L440,275"');
    expect(html).toContain('d="M704,224 L760,224 L760,555 L1240,555"');
    expect(html).toContain('d="M704,179 L874,179"');
    // Each head has its tip at the last point.
    for (const tip of ['440,275', '1240,555', '874,179']) expect(html).toContain(`class="arrow-head" points="${tip} `);
  });

  it('draws an arrow for several connections apart from one for a single connection', () => {
    expect(times(html, 'class="arrow arrow-many')).toBe(1);
  });

  it('puts each box inside the boundary at its place in the whole picture', () => {
    expect(html).toContain('data-id="order-api"');
    expect(html).toMatch(/transform:translate\(464px,104px\)[^>]*data-id="order-api"/);
    expect(html).toMatch(/transform:translate\(874px,104px\)[^>]*data-id="orders-database"/);
    expect(html).toMatch(/transform:translate\(440px,40px\)[^>]*data-id="shop"/);
  });

  it('gives every node two hidden handles that cannot be connected', () => {
    expect(times(html, 'class="react-flow__handle ')).toBe(2 * (CONTAINER_PICTURE.boxes.length + 1));
    expect(html).not.toMatch(/react-flow__handle[^"]*\bconnectable\b/);
  });

  it('draws the title of the view and the boundary', () => {
    expect(html).toContain('>Container view: Shop</h1>');
    expect(html).toContain('>Shop [System]<');
  });

  it('marks a box whose copies act on each other with their number', () => {
    expect(times(html, 'class="mark"')).toBe(1);
    expect(html).toContain('>↻ 1<');
  });

  it('tells the kinds apart by shape: a person, a system, an app and a store each draw their own', () => {
    expect(html).toContain('box family-people');
    expect(html).toContain('box family-systems');
    expect(html).toContain('box family-apps');
    expect(html).toContain('box family-stores');
    // The store is a cylinder; a system has a line within its line.
    expect(html).toMatch(/family-stores[^]*?<path class="outline"/);
    expect(html).toMatch(/family-systems[^]*?class="outline rim"/);
  });

  it('holds in the legend what the view lists, and nothing else', () => {
    expect(times(html, 'data-key="')).toBe(CONTAINERS.legend.length);
    for (const entry of CONTAINERS.legend) {
      expect(html).toContain(`data-key="${entry.key}"`);
      expect(html).toContain(`>${escaped(entry.text)}<`);
    }
  });

  it('says how many boxes and arrows there are, and what is not drawn', () => {
    expect(html).toContain('4 boxes and 3 arrows.');
    expect(html).toContain('1 connection between two boxes outside the system is not drawn');
    expect(html).toContain('1 connection to a record with an error is not drawn');
  });

  it('names every box and arrow whole for a screen reader', () => {
    expect(html).toContain(`aria-label="${escaped('Orders database, [Store: database · PostgreSQL]. Keeps orders < 90 days old & how far each has got.')}"`);
    expect(html).toContain(`aria-label="${escaped('Order API to Card provider: Refunds a payment; Takes the payment; Asks for its state [HTTPS]')}"`);
    expect(html).toContain(`aria-label="${escaped('Order API, [App: service · Go]. Takes orders and says how far each has got. 1 connection between its copies.')}"`);
  });

  it('has buttons with names to fit and zoom', () => {
    for (const name of ['Fit diagram', 'Fit selection', 'Zoom out', 'Zoom in']) expect(html).toContain(`>${name}</button>`);
  });

  it('draws text with a < in it as text, never as markup', () => {
    expect(html).toContain('Keeps orders &lt; 90 days old &amp; how');
    expect(html).not.toContain('orders < 90');
  });

  it('draws text that looks like markup as text', () => {
    const view: View = { ...CONTEXT, boxes: CONTEXT.boxes.map((box) => (box.id === 'customer' ? { ...box, name: '<script>alert(1)</script>' } : box)) };
    const drawn: Drawn = { ...CONTEXT_PICTURE, boxes: CONTEXT_PICTURE.boxes.map((box) => (box.id === 'customer' ? { ...box, name: ['<img src=x onerror=alert(1)>'] } : box)) };
    const state = { ...STATE, views: [view, CONTAINERS] };
    const markup = render({ page: 'view', view: view.id }, drawn, null, state);
    expect(markup).not.toContain('<script>alert');
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows everything at full size, and no note that the picture is too small', () => {
    expect(html).toContain('data-detail="all"');
    expect(html).not.toContain('Too small to read');
  });
});

describe('the context view', () => {
  const html = render({ page: 'view', view: CONTEXT.id }, CONTEXT_PICTURE);

  it('draws the system in scope with a thicker line, and has no boundary', () => {
    expect(html).toContain('box family-systems scope');
    expect(html).not.toContain('class="boundary');
  });

  it('draws every line of text the picture gives', () => {
    for (const line of linesOf(CONTEXT_PICTURE)) expect(html).toContain(`>${escaped(line)}<`);
  });
});

describe('the title of the tab', () => {
  it('names what is shown and the model', () => {
    expect(pageTitle({ state: STATE, route: containers, picture: null, trouble: null })).toBe('Container view: Shop · Shop · seefore');
    expect(pageTitle({ state: STATE, route: { page: 'problems' }, picture: null, trouble: null })).toBe('Problems · Shop · seefore');
    expect(pageTitle({ state: null, route: { page: 'start' }, picture: null, trouble: null })).toBe('seefore');
  });
});

describe('the panel', () => {
  it('shows a chosen box whole: its kind, technology, owner and where the owner comes from, description and file', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'order-api' });
    expect(html).toContain('aria-label="Details"');
    expect(html).toContain('App: service');
    expect(html).toContain('>Go<');
    expect(html).toContain('Shop team, taken from Shop');
    expect(html).toContain('Takes orders and says how far each has got.\nRuns as three copies that share their locks.');
    expect(html).toContain('>apps/order-api.yaml<');
  });

  it('lists the connections between a box’s copies, and those inside it', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'order-api' });
    expect(html).toContain('Between its copies (1)');
    expect(html).toContain('Unnamed connection');
    expect(html).toContain('One copy tells the others which orders it holds.');
    expect(html).toContain('Inside it, not drawn (1)');
    expect(html).toContain('Order API / Checkout → Order API / Order status');
  });

  it('lists each connection of a chosen arrow with its own two ends, name, technology and file', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'arrow', id: 'order-api~card-provider' });
    expect(html).toContain('>Order API → Card provider</h2>');
    expect(html).toContain('This arrow stands for 3 connections.');
    expect(html).toContain('Order API / Checkout → Card provider');
    expect(html).toContain('Order API / Order status → Card provider');
    for (const id of ['order-api-refunds', 'checkout-takes-payment', 'order-status-asks-payment']) expect(html).toContain(`>connections/${id}.yaml<`);
    expect(html).toContain('>[HTTPS]<');
  });

  it('lights what is chosen and fades the rest', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'customer' });
    expect(html).toContain('box family-people lit chosen');
    expect(html).toContain('boundary lit');
    expect(html).toContain('box family-apps faded');
    expect(html).toMatch(/class="arrow lit"[^]*?M280,275/);
    expect(html).toContain('class="arrow arrow-many faded"');
  });
});

describe('what stands in place of a picture', () => {
  it('shows the message of a view whose layout failed', () => {
    const html = render({ page: 'view', view: 'card-provider.context' }, FAILED_PICTURE);
    expect(html).toContain('>Context view: Card provider</h1>');
    expect(html).toContain(FAILED_PICTURE.failed.message);
    expect(html).not.toContain('react-flow__node');
  });

  it('says that a view is being laid out while its picture has not come', () => {
    const html = render(containers, null);
    expect(html).toContain('Laying out the view…');
  });

  it('says that the directory is gone, and that the page waits', () => {
    const state = { ...STATE, available: false, problems: [], views: [], errors: 0, warnings: 0 };
    const html = render({ page: 'start' }, null, null, state);
    expect(html).toContain('The directory is gone');
    expect(html).toContain('/work/shop/architecture is not there any more. The page waits for it to come back');
  });

  it('shows the problem of a marker that cannot be read in place of the views', () => {
    const marker = { file: 'seefore.yaml', line: 1, column: 1, severity: 'error' as const, code: 'marker-unreadable', message: 'The marker file is not YAML.' };
    const state = { ...STATE, available: false, name: null, format: null, problems: [marker], views: [] };
    const html = render({ page: 'start' }, null, null, state);
    expect(html).toContain('No views');
    expect(html).toContain('seefore.yaml:1:1');
    expect(html).toContain('The marker file is not YAML.');
  });
});

describe('the sidebar', () => {
  const html = render(containers, CONTAINER_PICTURE);

  it('lists the systems with parts with their views, then the others folded, then the model and the problems with their number', () => {
    const order = ['>Shop</span>', '#/view/shop.context', '#/view/shop.containers', '<details class="others"', '#/view/card-provider.context', '#/model', '>Problems (2)<'];
    const places = order.map((piece) => html.indexOf(piece));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('marks the view shown', () => {
    expect(html).toMatch(/href="#\/view\/shop.containers" aria-current="page"/);
  });
});

describe('the listing of the model', () => {
  const whole = render({ page: 'model' });
  // The listing alone, without the sidebar, which names some records too.
  const html = whole.slice(whole.indexOf('<article class="listing"'));

  it('shows every record of the model', () => {
    const families = [MODEL.people, MODEL.systems, MODEL.apps, MODEL.stores, MODEL.components, MODEL.owners, MODEL.technologies];
    for (const record of families.flat()) expect(html).toContain(`>${escaped(record.name)}</button>`);
    for (const connection of MODEL.connections) expect(html).toContain(`<code>${connection.id}</code>`);
  });

  it('lists in the order of the outline: people, systems with parts and what is in them, the others, connections, owners, technologies', () => {
    const name = (text: string) => `>${text}</button>`;
    const order = [
      'People (1)',
      name('Customer'),
      'Systems with parts (1)',
      name('Shop'),
      name('Order API'),
      name('Checkout'),
      name('Orders database'),
      'Other systems (1)',
      name('Card provider'),
      'Connections (9)',
      'Owners (2)',
      'Technologies (4)',
    ];
    const places = order.map((piece) => html.indexOf(piece));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('shows each connection under what it starts from, with its far end', () => {
    expect(html).toContain('from Order API (app order-api)');
    expect(html).toContain('Checkout → Card provider: Takes the payment');
    expect(html).toContain('→ Shop: Buys goods');
  });

  it('counts what was read and how many problems there are', () => {
    expect(html).toContain('23 records read, 22 listed.');
    expect(html).toContain('1 error and 1 warning.');
  });
});

describe('the problems', () => {
  const html = render({ page: 'problems' });

  it('shows each problem with its file, line and column, and its message', () => {
    for (const problem of PROBLEMS) expect(html).toContain(`>${problem.file}:${problem.line}:${problem.column}<`);
    expect(html).toContain('<code>kind</code> is <code>server</code>');
    expect(html).toContain('The check found 1 error and 1 warning.');
  });
});

/** The page of the hard cases for a route, with their picture, and something chosen when given. */
function hard(route: Route = { page: 'view', view: HARD_CONTAINERS.id }, selection: Selection | null = null): string {
  return render(route, HARD_PICTURE, selection, HARD_STATE);
}

/** The shape a box of a look draws: the markup of its outline, from its look to the end of its picture. */
function shapeOf(html: string, look: string): string {
  const start = html.indexOf(`data-look="${look}"`);
  if (start < 0) throw new Error(`No box looks ${look}.`);
  return html.slice(start, html.indexOf('</svg>', start));
}

/** The markup of the label of an arrow, by its route. */
function labelOf(html: string, route: string): string {
  const end = html.indexOf(`>${route}<`);
  const start = html.lastIndexOf('<g class="arrow-label"', end);
  return html.slice(start, html.indexOf('</g></g>', end));
}

describe('the hard cases in a picture', () => {
  const html = hard();

  it('gives a queue or a topic, a piece of infrastructure and an external system each a shape of its own', () => {
    // A cylinder on its side, a store's upright: their lids are arcs of another axis.
    expect(shapeOf(html, 'queue-or-topic')).toMatch(/<path class="outline" d="M8,1 L232,1 A7,74 0 0 1 232,149/);
    expect(shapeOf(html, 'queue-or-topic')).toContain('class="outline rim"');
    // Pointed at both ends.
    expect(shapeOf(html, 'infrastructure')).toMatch(/<polygon class="outline" points="15,1 225,1 239,75 225,149 15,149 1,75"/);
    // A system's double line, with a solid tab in its top left corner that a system with no mark has not.
    expect(shapeOf(html, 'system-external')).toContain('<rect class="outline"');
    expect(shapeOf(html, 'system-external')).toContain('<rect class="outline rim"');
    expect(shapeOf(html, 'system-external')).toContain('<path class="tab" d="M0,0 L28,0 L0,28 Z">');
    expect(shapeOf(render(containers, CONTAINER_PICTURE), 'system')).not.toContain('class="tab"');
    expect(shapeOf(html, 'app')).toMatch(/<rect class="outline"[^>]*rx="10"/);
  });

  it('draws a box’s text in the room the layout broke it for, and a little more', () => {
    // The layout leaves 12 px each side for an app, 12 and 20 for a topic, 16 for a piece of infrastructure: the page 2 px less.
    expect(html).toMatch(/data-id="web"[^]*?<div class="box-text" style="padding-left:10px;padding-right:10px"/);
    expect(html).toMatch(/data-id="events"[^]*?<div class="box-text" style="padding-left:10px;padding-right:18px"/);
    expect(html).toMatch(/data-id="proxy"[^]*?<div class="box-text" style="padding-left:14px;padding-right:14px"/);
  });

  it('colours a piece of infrastructure by a family of its own, and a queue as a store', () => {
    expect(html).toContain('box family-infrastructure');
    expect(html).toMatch(/box family-stores[^"]*" data-look="queue-or-topic"/);
  });

  it('draws the route line under the names and above the technology, with the other words of the label', () => {
    const label = labelOf(html, 'via HTTPS proxy');
    expect(label).toContain('class="label-route"');
    const places = ['>Asks for pages<', '>via HTTPS proxy<', '>[HTTPS]<'].map((piece) => label.indexOf(piece));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    expect(html).toContain('>via on 1 of 2<');
    expect(times(html, 'class="label-route"')).toBe(2);
  });

  it('marks a box that connections pass through with their number', () => {
    expect(times(html, 'class="mark mark-passing"')).toBe(2);
    expect(html).toMatch(/data-id="proxy"[^]*?class="mark mark-passing">⇢ 1</);
    expect(html).toMatch(/data-id="gateway"[^]*?class="mark mark-passing">⇢ 1</);
  });

  it('puts the mark beside the mark for copies', () => {
    const view = { ...HARD_CONTAINERS, boxes: HARD_CONTAINERS.boxes.map((box) => (box.id === 'proxy' ? { ...box, loops: ['proxy-asks-proxy'] } : box)) };
    const markup = render({ page: 'view', view: view.id }, HARD_PICTURE, null, { ...HARD_STATE, views: [view] });
    expect(markup).toContain('<div class="marks" aria-hidden="true"><div class="mark mark-passing">⇢ 1</div><div class="mark">↻ 1</div></div>');
  });

  it('lists under the legend what is passed through and has no box, with its number', () => {
    const legend = html.slice(html.indexOf('aria-label="Legend"'));
    expect(legend).toContain('>Passes through:<');
    expect(legend).toMatch(/<button type="button" data-id="balancer" aria-label="Load balancer: 1 connection passes through it">Load balancer <span class="passes-count">1<\/span><\/button>/);
    // None for a view with nothing of the kind.
    expect(render(containers, CONTAINER_PICTURE)).not.toContain('Passes through');
  });

  it('has each new look and mark in the legend, with a sample', () => {
    for (const key of ['system-external', 'queue-or-topic', 'infrastructure', 'route', 'passing']) expect(html).toMatch(new RegExp(`data-key="${key}" tabindex="0"><svg class="sample"`));
    expect(html).toMatch(/data-key="route" tabindex="0"><svg[^]*?>via<\/text>/);
    expect(html).toMatch(/data-key="passing" tabindex="0"><svg[^]*?>⇢ 2<\/text>/);
  });

  it('names for a screen reader the route of an arrow and what passes through a box', () => {
    expect(html).toContain(`aria-label="${escaped('Clerk to Web: Asks for pages, via HTTPS proxy [HTTPS]')}"`);
    expect(html).toContain(`aria-label="${escaped('Web to Card provider: Asks for a refund; Takes a payment, via on 1 of 2')}"`);
    expect(html).toContain(
      `aria-label="${escaped("HTTPS proxy, [Infrastructure · nginx]. Ends HTTPS on the desk's host and passes requests on. 1 connection of this view passes through it.")}"`,
    );
  });
});

describe('choosing what is passed through', () => {
  it('lights the arrows that pass through it, and their ends, and opens its panel', () => {
    const html = hard(undefined, { kind: 'passed', id: 'balancer' });
    expect(html).toContain('class="arrow arrow-many lit"');
    // The web app and the card provider are its ends; the gateway, on its way too, has a box of its own and is not lit by the load balancer.
    expect(times(html, 'box family-apps lit" data-look="app"')).toBe(1);
    expect(times(html, 'box family-apps faded" data-look="app"')).toBe(1);
    expect(html).toContain('box family-systems lit" data-look="system-external"');
    expect(html).toContain('box family-infrastructure faded');
    expect(html).toMatch(/<button type="button" data-id="balancer" class="chosen"/);
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toContain('>Load balancer</h2>');
    expect(panel).toContain('<dd>Infrastructure</dd>');
    expect(panel).toContain('Passing through it in this view (1)');
    expect(panel).toContain('Web → Card provider');
  });

  it('lights with a box the arrows that pass through it', () => {
    const html = hard(undefined, { kind: 'box', id: 'gateway' });
    expect(html).toContain('class="arrow arrow-many lit"');
    expect(html).toContain('box family-apps lit chosen" data-look="app"');
    expect(html).toContain('Passing through it in this view (1)');
  });
});

describe('the panel of the hard cases', () => {
  it('gives each connection of an arrow its route in order, each step a link to its record', () => {
    const html = hard(undefined, { kind: 'arrow', id: 'web~cards' });
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toContain(
      '<p class="connection-route">via <span class="hops"><button type="button" class="record-name">Gateway</button>, <button type="button" class="record-name">Load balancer</button></span></p>',
    );
    expect(times(panel, 'class="connection-route"')).toBe(1);
  });

  it('says that a system is external', () => {
    const html = hard(undefined, { kind: 'box', id: 'cards' });
    expect(html.slice(html.indexOf('aria-label="Details"'))).toContain('<dd>System: external</dd>');
  });

  it('lists for a record chosen in the listing the connections of the whole model that pass through it', () => {
    const html = hard({ page: 'model' }, { kind: 'record', id: 'proxy' });
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toContain('<dd>Infrastructure</dd>');
    expect(panel).toContain('<dd>nginx</dd>');
    expect(panel).toContain('Passing through it (1)');
    expect(panel).toContain('Clerk → Web');
  });

  it('gives a connection chosen in the listing its route, as links', () => {
    const html = hard({ page: 'model' }, { kind: 'record', id: 'web-calls-cards' });
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toMatch(/<dt>Via<\/dt><dd><span class="hops"><button type="button" class="record-name">Gateway<\/button>, <button type="button" class="record-name">Load balancer<\/button><\/span><\/dd>/);
  });
});

describe('the listing of the hard cases', () => {
  const whole = hard({ page: 'model' });
  const html = whole.slice(whole.indexOf('<article class="listing"'));

  it('lists the pieces of infrastructure under a heading of their own, after the systems and before the connections', () => {
    const places = ['Other systems (1)', 'Infrastructure (2)', name('Load balancer'), name('HTTPS proxy'), 'Connections (5)'].map((piece) => html.indexOf(piece));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it('says how many connections pass through each piece of infrastructure', () => {
    expect(html).toContain('(nginx; 1 connection passes through it)');
    expect(html).toContain('<code>balancer</code></span><span class="entry-facts"> (1 connection passes through it)</span>');
  });

  it('says on its line what a connection passes through, and that a system is external', () => {
    expect(html).toContain('→ Web, via HTTPS proxy: Asks for pages');
    expect(html).toContain('→ Card provider, via Gateway, Load balancer: Takes a payment');
    expect(html).toContain('<code>cards</code></span><span class="entry-facts"> (external)</span>');
  });

  it('counts the pieces of infrastructure as listed', () => {
    expect(html).toContain('16 records read. ');
  });
});

/** A record's name as the listing makes it a button. */
function name(text: string): string {
  return `>${escaped(text)}</button>`;
}

describe('a step of a route whose record has an error in its file', () => {
  const desk: Route = { page: 'view', view: HARD_CONTAINERS.id };

  it('is shown by its id in the panel of the arrow, as a link like any other step', () => {
    const html = render(desk, HARD_PICTURE, { kind: 'arrow', id: 'web~cards' }, BROKEN_HOP_STATE);
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toContain('<button type="button" class="record-name">Gateway</button>, <button type="button" class="record-name">balancer</button>');
  });

  it('keeps the panel open when chosen there, and says that its file has a problem, with a link to the problems', () => {
    // What the step's link chooses: the record by its id.
    const html = render(desk, HARD_PICTURE, { kind: 'record', id: 'balancer' }, BROKEN_HOP_STATE);
    expect(html).toContain('class="page with-panel"');
    const panel = html.slice(html.indexOf('aria-label="Details"'));
    expect(panel).toContain('>balancer</h2>');
    expect(panel).toContain(
      '<p class="record-problem"><code>infrastructure/balancer.yaml</code> has a problem, so <code>balancer</code> is not in the model: <a href="#/problems">see the problems</a>.</p>',
    );
    // The connection that passes through it is still there, with its whole route.
    expect(panel).toContain('Passing through it (1)');
    expect(panel).toContain('Web → Card provider');
  });
});

describe('the legend of an external system', () => {
  it('draws for an external system the shape the picture draws: a system with its tab', () => {
    const html = hard();
    const sample = html.slice(html.indexOf('data-key="system-external"'), html.indexOf('</svg>', html.indexOf('data-key="system-external"')));
    expect(sample).toContain('class="outline rim"');
    expect(sample).toContain('<path class="tab"');
  });

  it('draws for the system in scope, when it is external, its thicker line with the tab', () => {
    const legend = { ...HARD_CONTAINERS, legend: [{ key: 'system-scope-external' as const, text: 'This system, which is external: what the view is about' }] };
    const html = render(desk(legend), HARD_PICTURE, null, { ...HARD_STATE, views: [legend] });
    const start = html.indexOf('data-key="system-scope-external"');
    const sample = html.slice(start, html.indexOf('</svg>', start));
    expect(sample).toContain('stroke-width="3"');
    expect(sample).toContain('class="outline rim"');
    expect(sample).toContain('<path class="tab"');
    expect(html).toContain('<span>This system, which is external: what the view is about</span>');
  });
});

/** The route of a view of the hard cases. */
function desk(view: View): Route {
  return { page: 'view', view: view.id };
}

describe('the listing, for what passes through and what is in no picture', () => {
  it('says how many connections pass through a system, an app and a component, as `seefore list` does', () => {
    const model = {
      ...HARD_MODEL,
      components: [{ id: 'signer', file: 'components/signer.yaml', name: 'Signer', in: 'gateway' }],
      connections: HARD_MODEL.connections.map((one) => (one.id === 'web-calls-cards' ? { ...one, via: ['gateway', 'signer', 'balancer'] } : one)),
    };
    const outline = { ...HARD_OUTLINE, withParts: [{ id: 'desk', apps: [{ id: 'gateway', components: ['signer'] }, { id: 'web', components: [] }], stores: ['events'] }] };
    const whole = render({ page: 'model' }, null, null, { ...HARD_STATE, model, outline });
    const html = whole.slice(whole.indexOf('<article class="listing"'));
    expect(html).toContain('<code>gateway</code></span><span class="entry-facts"> (service; 1 connection passes through it)</span>');
    expect(html).toContain('<code>signer</code></span><span class="entry-facts"> (1 connection passes through it)</span>');
    expect(html).toContain('<code>balancer</code></span><span class="entry-facts"> (1 connection passes through it)</span>');
    // An app nothing passes through says nothing of it, as `seefore list` does; a piece of infrastructure says so.
    expect(html).toContain('<code>web</code></span><span class="entry-facts"> (service)</span>');
    const none = render({ page: 'model' }, null, null, { ...HARD_STATE, model: { ...model, connections: model.connections.filter((one) => one.id !== 'clerk-uses-web') } });
    expect(none).toContain('<code>proxy</code></span><span class="entry-facts"> (nginx; no connection passes through it)</span>');
    const external = render({ page: 'model' }, null, null, { ...HARD_STATE, model: { ...HARD_MODEL, connections: [...HARD_MODEL.connections, { id: 'clerk-asks-desk', file: 'connections/clerk-asks-desk.yaml', from: 'clerk', to: 'desk', via: ['cards'] }] } });
    expect(external).toContain('<code>cards</code></span><span class="entry-facts"> (external; 1 connection passes through it)</span>');
  });

  it('says at its top how many connections are in no picture, and marks each on its line', () => {
    const html = render({ page: 'model' }, null, null, { ...HARD_STATE, inNoView: ['proxy-checks-web', 'web-asks-cards'] });
    const listing = html.slice(html.indexOf('<article class="listing"'));
    const notice =
      '<p class="in-no-picture" role="note">2 connections are in no picture: no view draws them. A view is about a system, and draws a connection only where an end of it is in that system and neither end is a record with an error. Each is marked “in no picture” under Connections.</p>';
    expect(listing).toContain(notice);
    // Under the name of the model and where it is, before every section.
    expect(listing.indexOf(notice)).toBeLessThan(listing.indexOf('<section'));
    expect(times(listing, '(in no picture)')).toBe(2);
    expect(listing).toMatch(/<code>proxy-checks-web<\/code><\/span><span class="entry-facts"> \(in no picture\)<\/span>/);
    expect(render({ page: 'model' }, null, null, { ...HARD_STATE, inNoView: ['proxy-checks-web'] })).toContain(
      '1 connection is in no picture: no view draws it. A view is about a system, and draws a connection only where an end of it is in that system and neither end is a record with an error. It is marked “in no picture” under Connections.',
    );
    expect(render({ page: 'model' }, null, null, HARD_STATE)).not.toContain('in no picture');
  });
});

/** The page of the archive of stage 6b, on a route, with something chosen when given. */
function archive(route: Route = { page: 'view', view: 'archive.containers' }, selection: Selection | null = null): string {
  const view = route.page === 'view' ? archiveView(route.view) : undefined;
  return render(route, view === undefined ? null : archivePicture(view), selection, ARCHIVE_STATE);
}

/** The markup of the panel of a page. */
function panelOf(html: string): string {
  return html.slice(html.indexOf('aria-label="Details"'));
}

describe('a store that an app keeps, in the picture and the panel', () => {
  const html = archive();

  it('has no box, and the app carries a mark with the number of stores it keeps, a store by its shape', () => {
    expect(html).not.toContain('data-id="drafts"');
    expect(html).toMatch(/data-id="desk"[^]*?<div class="mark mark-kept"><svg class="store-sign"[^]*?<\/svg> 2<\/div>/);
    expect(times(html, 'class="mark mark-kept"')).toBe(1);
    expect(html).toContain(`aria-label="${escaped('Desk, [App: service]. It keeps 2 stores, drawn at it.')}"`);
  });

  it('is listed on the app’s panel with its kind, its `only`, who reads and writes it, and the connections inside the app', () => {
    const panel = panelOf(archive(undefined, { kind: 'box', id: 'desk' }));
    expect(panel).toContain('Keeps (2)');
    expect(panel).toMatch(/class="kept-store"><p><button type="button" class="record-name">Cache<\/button> <span class="kept-kind">\[Store: cache\]<\/span><\/p><p class="kept-only">only when caching is on<\/p>/);
    expect(panel).toMatch(/>Drafts<\/button> <span class="kept-kind">\[Store: files\]<\/span>/);
    expect(panel).toMatch(/<h4>Read by \(1\)<\/h4><ul><li><button type="button" class="record-name">Desk \/ Editor<\/button>: <button type="button" class="record-name">Reads what it cached<\/button><\/li><\/ul>/);
    expect(panel).toMatch(/<h4>Read and written by \(1\)<\/h4><ul><li><button type="button" class="record-name">Desk<\/button>: <button type="button" class="record-name">Keeps edits that are not yet saved<\/button>/);
    expect(panel).toContain('<h4>Does not say (1)</h4>');
    expect(panel).toContain('Inside it, not drawn (2)');
  });

  it('lights its app when it is chosen, in the listing or on a panel', () => {
    const chosen = archive(undefined, { kind: 'record', id: 'drafts' });
    expect(chosen).toContain('box family-apps lit" data-look="app"');
    expect(chosen).toMatch(/data-id="desk"[^]*?box family-apps lit/);
    expect(chosen).toContain('box family-people lit');
    expect(chosen).toContain('box family-infrastructure faded');
    expect(panelOf(chosen)).toContain('<dt>Kept by</dt><dd>Desk</dd>');
    // A store in the system lights nothing: it has a box of its own, and was not chosen in the picture.
    expect(archive(undefined, { kind: 'record', id: 'records' })).not.toContain(' lit');
  });
});

describe('who reads and writes a store, on its panel', () => {
  it('gives the four lists, each left out when empty, each entry the one that acts and the connection', () => {
    const panel = panelOf(archive(undefined, { kind: 'box', id: 'records' }));
    expect(panel).toMatch(/<h3>Written by \(1\)<\/h3><ul><li><button type="button" class="record-name">Desk<\/button>: <button type="button" class="record-name">Saves an edit<\/button><\/li><\/ul>/);
    // A read made only at night says so where it is listed.
    expect(panel).toMatch(
      /<h3>Read by \(1\)<\/h3><ul><li><button type="button" class="record-name">Indexer<\/button>: <button type="button" class="record-name">Reads the records<\/button><span class="uses-only"> \(only at night\)<\/span><\/li><\/ul>/,
    );
    expect(panel).not.toContain('Read and written by');
    expect(panel).not.toContain('Does not say');
  });

  it('says for each connection, in words, what it does to the store', () => {
    const panel = panelOf(archive(undefined, { kind: 'arrow', id: 'desk~records' }));
    expect(panel).toContain('<p class="connection-access">Writes to the store.</p>');
    expect(panelOf(archive({ page: 'model' }, { kind: 'record', id: 'desk-keeps-drafts' }))).toContain('<dt>Access</dt><dd>Reads and writes the data of the store.</dd>');
  });
});

describe('a piece of infrastructure in a system, in the picture and the panel', () => {
  const html = archive();

  it('stands inside the boundary in its own shape, where a connection starts or ends at it', () => {
    expect(html).toMatch(/data-id="gate"[^]*?data-look="infrastructure"/);
    expect(html).toContain('Boundary: this system, with its apps, stores and pieces of infrastructure inside');
  });

  it('is listed under the legend as the system’s own when it is only passed through, in brackets when it has an `only`', () => {
    const legend = html.slice(html.indexOf('aria-label="Legend"'));
    expect(legend).toContain('<span class="passes-group">part of Archive:</span><ul aria-label="Passes through, part of Archive">');
    expect(legend).toContain(
      `<button type="button" data-id="office-proxy" aria-label="${escaped('Office proxy, only in the head office, part of Archive: 1 connection passes through it')}">(Office proxy) <span class="passes-count">1</span></button>`,
    );
    expect(legend).toContain('<span class="passes-group">others:</span><ul aria-label="Passes through, others">');
    expect(legend).toMatch(/data-id="proxy" aria-label="HTTPS proxy: 1 connection passes through it">HTTPS proxy </);
  });

  it('says on its panel which system it is in', () => {
    expect(panelOf(archive(undefined, { kind: 'box', id: 'gate' }))).toContain('<dt>In</dt><dd>Archive</dd>');
  });
});

describe('a condition, in the picture and the panel', () => {
  const html = archive();

  it('puts a box’s own `only` on a line under its kind line', () => {
    expect(html).toMatch(/data-id="indexer"[^]*?<div class="box-line text-line">\[App\]<\/div><div class="box-only text-line">only in the hosted edition<\/div>/);
    expect(times(html, 'class="box-only')).toBe(1);
    expect(html).toContain(`aria-label="${escaped('Indexer, [App]. Only in the hosted edition.')}"`);
  });

  it('says on an arrow when its connections are there, under the route, and puts a thing with `only` in brackets on the route', () => {
    expect(html).toContain('<text class="label-only"');
    expect(html).toContain('>only at night<');
    expect(html).toContain('>via HTTPS proxy, (Office proxy)<');
  });

  it('gives on the panel a record’s own `only`, then those it has from others, each with a link to where it comes from', () => {
    const panel = panelOf(archive({ page: 'model' }, { kind: 'record', id: 'indexer-reads-records' }));
    expect(panel).toContain('<dt>Only</dt><dd>at night</dd>');
    expect(panel).toContain('<dt>Only, from others</dt><dd><ul class="conditions"><li>only in the hosted edition, from <button type="button" class="record-name">Indexer</button></li></ul></dd>');
    // A connection whose ends have conditions and it none has only those from others.
    const ends = panelOf(archive({ page: 'model' }, { kind: 'record', id: 'indexer-reads-drafts' }));
    expect(ends).not.toContain('<dt>Only</dt>');
    expect(ends).toContain('only in the hosted edition, from <button type="button" class="record-name">Indexer</button>');
  });

  it('has each new mark in the legend where the view draws it, with a sample, and none told by colour alone', () => {
    const legend = html.slice(html.indexOf('aria-label="Legend"'));
    for (const key of ['kept', 'opened', 'only', 'route-only']) expect(legend).toMatch(new RegExp(`data-key="${key}" tabindex="0"><svg class="sample"`));
    expect(legend).toMatch(/data-key="only" tabindex="0"><svg[^]*?>only …<\/text>/);
    expect(legend).toMatch(/data-key="route-only" tabindex="0"><svg[^]*?>via \(…\)<\/text>/);
    expect(legend).toMatch(/data-key="opened" tabindex="0"><svg[^]*?<circle class="arrow-ring"/);
    expect(legend).toMatch(/data-key="kept" tabindex="0"><svg[^]*?class="sample-store-sign"/);
    expect(legend).not.toContain('data-key="opened-some"');
  });
});

describe('a channel that the far side opened, in the picture and the panel', () => {
  it('draws a small ring on the arrow just before its head, when every connection of the arrow says so', () => {
    const html = archive();
    // One on the arrow from Desk to the browser, and one in the legend's sample.
    expect(times(html, '<circle class="arrow-ring"')).toBe(2);
    expect(html).toMatch(/<path class="arrow-line" d="[^"]*"><\/path><circle class="arrow-ring" cx="[\d.]+" cy="[\d.]+" r="4"><\/circle><polygon class="arrow-head"/);
    expect(html).toContain(`aria-label="${escaped('Desk to Staff browser: Says when a job is done, via HTTPS proxy, (Office proxy), down a channel the far side opened')}"`);
  });

  it('says it in a line of the label when only some connections say so, and in the legend', () => {
    const state = stateOf({ ...ARCHIVE_FILES, 'connections/desk-pings-browser.yaml': 'from: desk\nto: browser\nname: Pings it\n' });
    const view = archiveView('archive.containers', state);
    const html = render({ page: 'view', view: view.id }, archivePicture(view), null, state);
    expect(html).not.toContain('<circle class="arrow-ring"');
    expect(html).toContain('<text class="label-opened"');
    expect(html).toContain('>far side opened on 1 of 2<');
    expect(html).toMatch(/data-key="opened-some" tabindex="0"><svg[^]*?>opened<\/text>/);
  });

  it('says it on the panel for each connection, in words', () => {
    expect(panelOf(archive(undefined, { kind: 'arrow', id: 'desk~browser' }))).toContain('<p class="connection-opened">Sent down a channel that the far side opened.</p>');
  });
});

describe('the listing of stage 6b', () => {
  const whole = archive({ page: 'model' });
  const html = whole.slice(whole.indexOf('<article class="listing"'));

  it('nests a kept store under its app, after its components, and a piece of infrastructure under its system', () => {
    const order = ['<code>desk</code>', '<code>editor</code>', '<code>cache</code>', '<code>drafts</code>', '<code>indexer</code>', '<code>records</code>', '<code>gate</code>', '<code>office-proxy</code>'].map((piece) =>
      html.indexOf(piece),
    );
    expect(order.every((place) => place >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // In the word `seefore list` writes there, as an app is: `infrastructure gate: Gate`.
    expect(html).toContain('>Gate</button> <span class="entry-id">infrastructure <code>gate</code></span>');
    // A piece in no system stays under the heading it had.
    expect(html).toMatch(/<h2>Infrastructure \(1\)<\/h2><ul><li class="entry"><div class="entry-head"><button type="button" class="record-name">HTTPS proxy<\/button> <span class="entry-id"><code>proxy<\/code>/);
    expect(html).not.toContain('Parts in a record with an error');
  });

  it('writes what a connection does to a store, and that the far side opened its channel, before its name', () => {
    expect(html).toContain('>→ Drafts: [read-write] Keeps edits that are not yet saved<');
    expect(html).toContain('>→ Records: [write] Saves an edit<');
    expect(html).toContain('>→ Staff browser, via HTTPS proxy, (Office proxy): [opened by the far side] Says when a job is done<');
    expect(html).toContain('>→ Drafts: Opens a draft by hand<');
  });

  it('writes the `only` of a thing after its name', () => {
    expect(html).toContain('>Indexer</button><span class="entry-only"> (only in the hosted edition)</span>');
    expect(html).toContain('>→ Records: [read] Reads the records</button><span class="entry-only"> (only at night)</span>');
  });

  it('has the conditions: each wording, with how many records hold it', () => {
    expect(html).toContain('<h2>Conditions (4)</h2>');
    const conditions = html.slice(html.indexOf('<h2>Conditions (4)</h2>'));
    const order = ['only at night', 'only in the head office', 'only in the hosted edition', 'only when caching is on'].map((words) => conditions.indexOf(`>${words} <`));
    expect(order.every((place) => place >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(conditions).toContain('>only in the head office <span class="entry-facts">(1 record)</span>');
    // The indexer's two connections have its condition from it.
    expect(conditions).toContain('>only in the hosted edition <span class="entry-facts">(1 record, 2 more have it from it)</span>');
  });

  it('says how many more have a wording from those that hold it, as `seefore list` does', () => {
    expect(holdersWords({ records: ['relay'], under: [] })).toBe('1 record');
    expect(holdersWords({ records: ['relay'], under: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe('1 record, 6 more have it from it');
    expect(holdersWords({ records: ['relay', 'proxy'], under: ['a'] })).toBe('2 records, 1 more has it from them');
  });
});

/**
 * The review of stage 6b, its first test: a person whose id is `constructor`, which every object
 * of JavaScript has a property of, and one whose id is `tostring`, in a state that has come as
 * JSON, as the page gets it from the server.
 */
describe('a record whose id every object has a property of', () => {
  const files = {
    'seefore.yaml': 'format: 1\nname: Review\n',
    'people/constructor.yaml': 'name: Constructor\n',
    'people/tostring.yaml': 'name: To string\nonly: on weekdays\n',
    'systems/shelf.yaml': 'name: Shelf\n',
    'connections/constructor-uses-shelf.yaml': 'from: constructor\nto: shelf\nname: Uses it\n',
  };
  const state: ViewerState = JSON.parse(JSON.stringify(stateOf(files)));

  it('is listed, with no condition and no owner it does not have', () => {
    const whole = render({ page: 'model' }, null, null, state);
    const html = whole.slice(whole.indexOf('<article class="listing"'));
    expect(html).toContain('>Constructor</button> <span class="entry-id"><code>constructor</code></span>');
    expect(html).toContain('>To string</button><span class="entry-only"> (only on weekdays)</span>');
    expect(html).toContain('>→ Shelf: Uses it<');
  });

  it('opens its panel, and so does its connection', () => {
    const panel = panelOf(render({ page: 'model' }, null, { kind: 'record', id: 'constructor' }, state));
    expect(panel).toContain('<dt>Kind</dt><dd>Person</dd>');
    expect(panel).not.toContain('<dt>Only');
    expect(panel).not.toContain('<dt>Owner');
    const connection = panelOf(render({ page: 'model' }, null, { kind: 'record', id: 'constructor-uses-shelf' }, state));
    expect(connection).toContain('<dt>From and to</dt><dd>Constructor → Shelf</dd>');
    expect(panelOf(render({ page: 'model' }, null, { kind: 'record', id: 'tostring' }, state))).toContain('<dt>Only</dt><dd>on weekdays</dd>');
  });

  it('is drawn in a view, its panel opened there too', () => {
    const view = archiveView('shelf.context', state);
    const html = render({ page: 'view', view: view.id }, archivePicture(view), { kind: 'box', id: 'constructor' }, state);
    expect(html).toContain('data-id="constructor"');
    expect(panelOf(html)).toContain('<dt>Kind</dt><dd>Person</dd>');
  });
});

/**
 * The archive with an edge system that is there only in production, whose gate the route of a
 * push passes through, and a vault whose one piece, its lock, staff open.
 */
const EDGED: Readonly<Record<string, string>> = {
  ...ARCHIVE_FILES,
  'systems/edge.yaml': 'name: Edge\nonly: in production\n',
  'infrastructure/edge-gate.yaml': 'name: Edge gate\nin: edge\n',
  'connections/desk-tells-browser.yaml': 'from: desk\nto: browser\nvia: [proxy, edge-gate, office-proxy]\nopens: to\nname: Says when a job is done\n',
  'systems/vault.yaml': 'name: Vault\n',
  'infrastructure/lock.yaml': 'name: Lock\nin: vault\n',
  'connections/staff-opens-lock.yaml': 'from: staff\nto: lock\nname: Opens it\n',
};
const EDGED_STATE = stateOf(EDGED);

/** The page of the edged archive on a route, with something chosen when given. */
function edged(route: Route = { page: 'view', view: 'archive.containers' }, selection: Selection | null = null): string {
  const view = route.page === 'view' ? archiveView(route.view, EDGED_STATE) : undefined;
  return render(route, view === undefined ? null : archivePicture(view), selection, EDGED_STATE);
}

describe('a thing on a route whose condition comes from what it is in', () => {
  it('stands in brackets on the arrow and in the list under the legend', () => {
    const html = edged();
    expect(EDGED_STATE.errors).toBe(0);
    expect(html).toContain('>via HTTPS proxy, (Edge gate), (Office proxy)<');
    const legend = html.slice(html.indexOf('aria-label="Legend"'));
    expect(legend).toContain(`data-id="edge-gate" aria-label="${escaped('Edge gate, only in production: 1 connection passes through it')}">(Edge gate) <span class="passes-count">1</span>`);
  });

  it('is given on the panel beside its name, with the record the condition comes from when it is not its own', () => {
    const panel = panelOf(edged(undefined, { kind: 'arrow', id: 'desk~browser' }));
    expect(panel).toContain(
      '<div class="connection-route">via <ol class="hops hops-conditions"><li><button type="button" class="record-name">HTTPS proxy</button></li><li><button type="button" class="record-name">(Edge gate)</button><span class="hop-only"> only in production, from <button type="button" class="record-name">Edge</button></span></li><li><button type="button" class="record-name">(Office proxy)</button><span class="hop-only"> only in the head office</span></li></ol></div>',
    );
    // The connection has nothing from what it passes through.
    expect(panel).not.toContain('class="connection-only"');
    expect(panel).not.toContain('<ul class="conditions">');
  });

  it('stands in brackets in the listing, as `seefore list` writes it', () => {
    expect(edged({ page: 'model' })).toContain('>→ Staff browser, via HTTPS proxy, (Edge gate), (Office proxy): [opened by the far side] Says when a job is done<');
  });
});

describe('a system that holds only pieces of infrastructure', () => {
  it('has a container view when a connection ends at its piece, and none when its piece is only passed through', () => {
    expect(EDGED_STATE.views.map((view) => view.id)).toEqual(['archive.context', 'archive.containers', 'vault.context', 'vault.containers', 'edge.context']);
  });

  it('stands with the systems with parts in the sidebar and the listing alike, or with the others in both', () => {
    const html = edged();
    const sidebar = html.slice(0, html.indexOf('</nav>'));
    const order = ['>Archive</span>', '>Vault</span>', '#/view/vault.containers', '<details class="others"', '#/view/edge.context'].map((piece) => sidebar.indexOf(piece));
    expect(order.every((place) => place >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const whole = edged({ page: 'model' });
    const listing = whole.slice(whole.indexOf('<article class="listing"'));
    const others = listing.slice(listing.indexOf('<h2>Other systems (1)</h2>'));
    expect(listing).toContain('<h2>Systems with parts (2)</h2>');
    expect(listing.indexOf('<code>lock</code>')).toBeLessThan(listing.indexOf('<h2>Other systems (1)</h2>'));
    // The edge, with its gate beneath it.
    expect(others).toMatch(/^<h2>Other systems \(1\)<\/h2><ul><li class="entry"><div class="entry-head"><button type="button" class="record-name">Edge<\/button>[^]*?<ul><li class="entry"><div class="entry-head"><button type="button" class="record-name">Edge gate<\/button> <span class="entry-id">infrastructure <code>edge-gate<\/code>/);
    expect(listing).toContain('>only in production <span class="entry-facts">(1 record, 1 more has it from it)</span>');
  });
});

describe('a store that an app keeps, chosen while the view is shown', () => {
  const html = archive(undefined, { kind: 'record', id: 'drafts' });

  it('lights only the arrows that hold one of its connections, and fades the app’s others', () => {
    // The indexer's and the staff's readings of the drafts; not Desk's saves to the records, nor its push to the browser.
    expect(times(html, 'class="arrow lit"')).toBe(2);
    expect(times(html, 'class="arrow faded"')).toBe(4);
    expect(html).toContain('box family-apps lit" data-look="app"');
  });

  it('says on its panel how many of its connections are inside its app, and so not drawn', () => {
    const panel = panelOf(html);
    expect(panel).toContain('<h3>Inside Desk, not drawn (1)</h3>');
    expect(panel).toContain('Desk keeps it, and this view draws it at Desk: 1 of its connections is inside Desk, and so not drawn. 2 are on the arrows that light with it.');
    expect(panel).toContain('>Keeps edits that are not yet saved</p>');
    // Not where the app has no box.
    expect(panelOf(archive({ page: 'view', view: 'archive.context' }, { kind: 'record', id: 'drafts' }))).not.toContain('Inside Desk');
  });
});

describe('the line under the title of a view that draws stores at their apps', () => {
  it('says how many', () => {
    expect(archive()).toMatch(/<p class="view-counts">[^<]*2 stores are drawn at the apps that keep them\./);
    const one = stateOf({ ...ARCHIVE_FILES, 'stores/cache.yaml': 'name: Cache\nin: archive\nkind: cache\n' });
    const view = archiveView('archive.containers', one);
    expect(render({ page: 'view', view: view.id }, archivePicture(view), null, one)).toContain('1 store is drawn at the app that keeps it.');
    expect(render(containers, CONTAINER_PICTURE)).not.toContain('drawn at the app');
  });
});

describe('the boundary of a system that has a condition', () => {
  it('says it after the kind line, whole for a screen reader', () => {
    const state = stateOf({ ...ARCHIVE_FILES, 'systems/archive.yaml': 'name: Archive\nonly: in production\n' });
    const view = archiveView('archive.containers', state);
    const html = render({ page: 'view', view: view.id }, archivePicture(view), null, state);
    expect(html).toContain('>Archive [System] only in production<');
    expect(html).toContain('aria-label="Archive [System] only in production, the boundary of the system"');
    expect(html).toMatch(/data-key="only" tabindex="0"><svg/);
  });
});

describe('the legend, with every mark of the stage', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

  it('is never taller than a quarter of the window, and scrolls inside, so that the picture keeps its room', () => {
    const rule = /\n\.legend \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('max-height: 25vh;');
    expect(rule).toContain('overflow-y: auto;');
    // A line at its foot says there is more while there is; it is measured in the browser.
    expect(/\n\.legend-more \{[^}]*position: sticky;/.test(css)).toBe(true);
  });

  it('has each line take the focus, so that the keyboard lights what it explains as the pointer does', () => {
    const html = render(containers, CONTAINER_PICTURE);
    for (const entry of CONTAINERS.legend) expect(html).toContain(`<li data-key="${entry.key}" tabindex="0">`);
  });
});

/** The rules of the style sheet, each as its selectors and its body. */
function rulesOf(css: string): { selectors: string[]; body: string }[] {
  const plain = css.replace(/\/\*[^]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selectors: (rule[1] ?? '').split(',').map((one) => one.trim()), body: rule[2] ?? '' }));
}

describe('the dashed outline for `only`, taken out', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');

  it('leaves nothing dashed in the style sheet but the boundary and its sample', () => {
    const dashed = rulesOf(css).filter((rule) => /dashed|dasharray/.test(rule.body));
    expect(dashed.flatMap((rule) => rule.selectors).sort()).toEqual(['.boundary', '.sample-boundary']);
  });

  it('draws no box, arrow or line of the legend as dashed, whatever has an `only`', () => {
    for (const html of [archive(), edged(), hard()]) {
      expect(html).not.toMatch(/class="[^"]*\bdashed\b/);
      expect(html).not.toContain('data-key="dashed"');
      expect(html).not.toContain('Dashed outline');
    }
  });
});

describe('the reading line', () => {
  it('stands under the note, which stands under the counts, and says the words of what is chosen, whole in its title', () => {
    const html = render(containers, CONTAINER_PICTURE, { kind: 'box', id: 'order-api' });
    expect(html).toContain('</p><p class="small-note" role="status"></p><p class="reading-line" title="Order API [App: service · Go]">Order API [App: service · Go]</p></header>');
    const arrow = render(containers, CONTAINER_PICTURE, { kind: 'arrow', id: 'order-api~orders-database' });
    expect(arrow).toContain(`<p class="reading-line" title="${escaped('Order API → Orders database: Writes each order · [SQL]')}">`);
    const passed = hard(undefined, { kind: 'passed', id: 'balancer' });
    expect(passed).toContain(`>${escaped("Load balancer: 1 of this view's connections passes through it")}</p></header>`);
  });

  it('keeps its place and says nothing when nothing is chosen, and is no live region', () => {
    const html = render(containers, CONTAINER_PICTURE);
    expect(html).toContain('<p class="reading-line"></p></header>');
    expect(html).not.toMatch(/class="reading-line"[^>]*(role|aria-live)=/);
  });

  it('is one line of one height, cut with an ellipsis when too long', () => {
    const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');
    const rule = rulesOf(css).find((one) => one.selectors.includes('.reading-line'))?.body ?? '';
    for (const part of ['height: 20px;', 'line-height: 20px;', 'white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;']) expect(rule).toContain(part);
  });
});

describe('the note of a crowded view on the page', () => {
  /** The page of a grid of so many apps. */
  const page = (apps: number) => {
    const { state, view, drawn } = grid(apps);
    return render({ page: 'view', view: view.id }, drawn, null, state);
  };
  const words = `A crowded view: more than ${CROWDED_FROM} boxes. It opens as a map, with no words. Point at a box or a line to read it here; click it to keep it lit.`;

  it('says it under the counts for a view of more boxes than the limit', () => {
    const html = page(CROWDED_FROM + 1);
    expect(html).toContain(`<p class="small-note" role="status">${words}</p>`);
    expect(html).not.toContain('Too small to read');
  });

  it('is not there for a view at the limit', () => {
    expect(page(CROWDED_FROM)).not.toContain('A crowded view');
  });
});

describe('the light below the zoom at which names are drawn', () => {
  const rules = rulesOf(readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8'));
  /** The body of the rule with this selector. */
  const body = (selector: string) => rules.find((rule) => rule.selectors.includes(selector))?.body ?? '';
  const shapes = ".diagram[data-detail='shapes']";

  it('keeps a lit line as wide on the screen as at full size, a thick one too', () => {
    expect(body(`${shapes} .arrow.lit .arrow-line`)).toContain('stroke-width: calc(1.5px / var(--zoom, 1));');
    expect(body(`${shapes} .arrow-many.lit .arrow-line`)).toContain('stroke-width: calc(3px / var(--zoom, 1));');
    // At full size the lines are those widths.
    expect(body('.arrow-line')).toContain('stroke-width: 1.5;');
    expect(body('.arrow-many .arrow-line')).toContain('stroke-width: 3;');
  });

  it('fills a lit box with a tint of its colour, and a chosen one with a tint of the accent', () => {
    expect(body(`${shapes} .box.lit .outline:not(.rim)`)).toMatch(/fill: color-mix\(in srgb, var\(--line-colour\) \d+%, var\(--ground\)\);/);
    expect(body(`${shapes} .box.chosen .outline:not(.rim)`)).toMatch(/fill: color-mix\(in srgb, var\(--accent\) \d+%, var\(--ground\)\);/);
  });

  it('fades what is not lit to the lines further from the lit', () => {
    expect(body(`${shapes} .box.faded`)).toContain('--line-colour: var(--dim-line);');
    expect(body(`${shapes} .boundary.faded`)).toContain('border-color: var(--dim-line);');
    expect(body(`${shapes} .arrow.faded .arrow-line`)).toContain('stroke: var(--dim-line);');
    expect(body(`${shapes} .arrow.faded .arrow-head`)).toContain('fill: var(--dim-line);');
  });
});
