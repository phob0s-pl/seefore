import type { Drawn, View } from '@seefore/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/address.ts';
import type { Selection } from '../src/follow.ts';
import type { Shown } from '../src/live.ts';
import { Page, pageTitle } from '../src/page.tsx';
import { CONTAINERS, CONTAINER_PICTURE, CONTEXT, CONTEXT_PICTURE, FAILED_PICTURE, MODEL, PROBLEMS, STATE } from './fixture.ts';

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
