import type { ViewBoundary } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { ELLIPSIS, widthOf } from '../src/measure.ts';
import {
  BOX_PADDING,
  BOX_TEXT_WIDTH,
  BOX_WIDTH,
  CONDITION_FONT,
  CONDITION_LINE_HEIGHT,
  KIND_FONT,
  LABEL_FONT,
  LABEL_LINE_HEIGHT,
  LABEL_WIDTH,
  NAME_FONT,
  ONLY_FONT,
  ROUTE_FONT,
  ROUTE_LINE_HEIGHT,
  SENTENCE_FONT,
  TECHNOLOGY_FONT,
  TECHNOLOGY_LINE_HEIGHT,
  TEXT_INSET,
  TITLE_FONT,
} from '../src/sizes.ts';
import { boxText, labelText, titleText } from '../src/text.ts';
import { arrow, box, route } from './views.ts';

/** True when no line is wider than the width, allowing for the sum of fractions. */
function fit(lines: readonly string[], font: { size: number; bold: boolean }, width: number): boolean {
  return lines.every((line) => widthOf(line, font) <= width + 1e-9);
}

describe('the text of a box', () => {
  it('is the name, the kind line and the first sentence, each broken to fit the box', () => {
    const text = boxText(box('order-api', 'apps', { name: 'Order API', line: '[App: service · Go]', sentence: 'Takes orders and says how far each has got.' }));
    expect(text).toEqual({
      name: ['Order API'],
      line: '[App: service · Go]',
      sentence: ['Takes orders and says how far each', 'has got.'],
      inset: { left: BOX_PADDING, right: BOX_PADDING },
    });
  });

  it('is broken for the room the shape of its look leaves, and says how far in that room is', () => {
    // 216 px wide in bold: it fits a box that fills its rectangle, and not a queue or a piece of infrastructure.
    const name = 'Payment reconciliation events';
    expect(boxText(box('a', 'apps', { name })).name).toEqual([name]);
    for (const look of ['queue-or-topic', 'infrastructure'] as const) {
      const text = boxText(box('a', look === 'infrastructure' ? 'infrastructure' : 'stores', { look, name }));
      expect(text.inset).toEqual(TEXT_INSET[look]);
      expect(text.name).toEqual(['Payment reconciliation', 'events']);
      expect(fit(text.name, NAME_FONT, BOX_WIDTH - text.inset.left - text.inset.right)).toBe(true);
    }
    expect(TEXT_INSET['queue-or-topic']).toEqual({ left: BOX_PADDING, right: BOX_PADDING + 8 });
    expect(TEXT_INSET.infrastructure).toEqual({ left: BOX_PADDING + 4, right: BOX_PADDING + 4 });
  });

  it('keeps a component’s name clear of the sign in its top right corner, which a long name ran under', () => {
    // 216 px wide in bold, as above: one line in an app, two in a component.
    const name = 'Payment reconciliation events';
    const text = boxText(box('a', 'components', { look: 'component', name, line: '[Component · Rust]' }));
    expect(TEXT_INSET.component).toEqual({ left: BOX_PADDING, right: BOX_PADDING + 16 });
    expect(text.inset).toEqual(TEXT_INSET.component);
    expect(text.name).toEqual(['Payment reconciliation', 'events']);
    expect(fit(text.name, NAME_FONT, BOX_WIDTH - text.inset.left - text.inset.right)).toBe(true);
    expect(fit([text.line], KIND_FONT, BOX_WIDTH - text.inset.left - text.inset.right)).toBe(true);
  });

  it('has the name in at most two lines', () => {
    const text = boxText(box('a', 'systems', { name: 'The system that keeps every record of every customer and every order they ever placed' }));
    expect(text.name).toHaveLength(2);
    expect(text.name[1]?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit(text.name, NAME_FONT, BOX_TEXT_WIDTH)).toBe(true);
  });

  it('has the kind line in one line', () => {
    const text = boxText(box('a', 'apps', { line: '[App: service · Go, PostgreSQL, Redis, Kafka, RabbitMQ, Elasticsearch]' }));
    expect(text.line.endsWith(ELLIPSIS)).toBe(true);
    expect(fit([text.line], KIND_FONT, BOX_TEXT_WIDTH)).toBe(true);
  });

  it('has the first sentence in at most four lines', () => {
    const sentence = 'Takes orders from the storefront and from the mobile apps, checks each against the stock and the account, keeps how far each has got, and tells the warehouse, the card provider and the customer whenever anything about it changes.';
    const text = boxText(box('a', 'apps', { sentence }));
    expect(text.sentence).toHaveLength(4);
    expect(text.sentence[3]?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit(text.sentence, SENTENCE_FONT, BOX_TEXT_WIDTH)).toBe(true);
  });

  it('has no sentence when the record has no description', () => {
    expect(boxText(box('a', 'people')).sentence).toEqual([]);
  });
});

describe('the label of an arrow', () => {
  it('is the name of its one connection, in up to three lines of 140 px', () => {
    const label = labelText(arrow('a', 'b', ['Sends every order that is ready to ship, with its lines and its address, once an hour']));
    expect(label?.lines).toHaveLength(3);
    expect(fit(label?.lines ?? [], LABEL_FONT, LABEL_WIDTH)).toBe(true);
    expect(label?.lines.slice(0, 2).join(' ')).toBe('Sends every order that is ready to ship, with its');
  });

  it('cuts a name too long for three lines with an ellipsis', () => {
    const label = labelText(arrow('a', 'b', ['Sends every order that is ready to ship, with its lines, its address, its weight and its price, once an hour, to the warehouse']));
    expect(label?.lines).toHaveLength(3);
    expect(label?.lines[2]?.endsWith(ELLIPSIS)).toBe(true);
  });

  it('gives two or three names a line each', () => {
    const label = labelText(arrow('a', 'b', ['Writes each order', 'Reads how far an order has got, and when it was last changed', 'Deletes old orders']));
    expect(label?.lines).toEqual(['Writes each order', `Reads how far an order${ELLIPSIS}`, 'Deletes old orders']);
    expect(fit(label?.lines ?? [], LABEL_FONT, LABEL_WIDTH)).toBe(true);
  });

  it('gives more names two lines and "+ n more"', () => {
    const label = labelText(arrow('a', 'b', ['Writes each order', 'Reads an order', 'Deletes old orders', 'Counts the orders', 'Unnamed connection']));
    expect(label?.lines).toEqual(['Writes each order', 'Reads an order', '+ 3 more']);
  });

  it('has the technology on a line of its own, in brackets', () => {
    const label = labelText(arrow('a', 'b', ['Places an order'], ['HTTPS', 'JSON']));
    expect(label?.lines).toEqual(['Places an order']);
    expect(label?.technology).toBe('[HTTPS, JSON]');
  });

  it('cuts a technology line wider than the label', () => {
    const label = labelText(arrow('a', 'b', ['Places an order'], ['HTTPS', 'JSON', 'Protocol Buffers', 'gRPC', 'WebSocket']));
    expect(label?.technology?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit([label?.technology ?? ''], TECHNOLOGY_FONT, LABEL_WIDTH)).toBe(true);
  });

  it('has no technology line when its connections do not all name the same', () => {
    expect(labelText(arrow('a', 'b', ['Places an order']))).not.toHaveProperty('technology');
  });

  it('has words as wide as its widest line, and a line height for each line', () => {
    const label = labelText(arrow('a', 'b', ['Writes each order', 'Reads an order'], ['SQL']));
    expect(label?.width).toBe(Math.ceil(widthOf('Writes each order', LABEL_FONT)));
    expect(label?.height).toBe(2 * LABEL_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
  });

  it('has room as wide as a label may be, however narrow its words', () => {
    for (const names of [['Uses'], ['Writes each order', 'Reads an order'], ['A', 'B', 'C', 'D']]) expect(labelText(arrow('a', 'b', names))?.room.width).toBe(LABEL_WIDTH);
  });

  it('has room for three lines of a single connection’s name, however many it takes', () => {
    for (const name of ['Uses', 'Sends every order that is ready to ship', 'Sends every order that is ready to ship, with its lines and its address, once an hour']) {
      const label = labelText(arrow('a', 'b', [name], ['HTTPS']));
      expect(label?.room).toEqual({ width: LABEL_WIDTH, height: 3 * LABEL_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT });
    }
    expect(labelText(arrow('a', 'b', ['Uses']))?.height).toBe(LABEL_LINE_HEIGHT);
  });

  it('has room for the lines the number of names gives, when the arrow has several', () => {
    expect(labelText(arrow('a', 'b', ['Writes', 'Reads']))?.room.height).toBe(2 * LABEL_LINE_HEIGHT);
    expect(labelText(arrow('a', 'b', ['Writes', 'Reads', 'Deletes']))?.room.height).toBe(3 * LABEL_LINE_HEIGHT);
    expect(labelText(arrow('a', 'b', ['Writes', 'Reads', 'Deletes', 'Counts', 'Lists']))?.room.height).toBe(3 * LABEL_LINE_HEIGHT);
  });

  it('has room for the route, the conditions and the technology only when the arrow has them', () => {
    const label = labelText({
      ...arrow('a', 'b', ['Pays'], ['HTTPS']),
      route: route(['Ingress']),
      only: { count: 1, all: true, words: 'when LDAP authentication is configured', line: 'only when LDAP authentication is configured' },
      opened: { count: 1, all: false, line: 'far side opened on 1 of 2' },
    });
    expect(label?.room.height).toBe(3 * LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + 3 * CONDITION_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
    expect(label?.height).toBe(LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + 3 * CONDITION_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
  });

  it('has room as wide as a line that says on how many, when it is wider than a label may be', () => {
    const label = labelText({ ...arrow('a', 'b', ['Pays']), opened: { count: 1, all: false, line: 'far side opened on 123456789 of 987654321, with more words' } });
    expect(label?.room.width).toBe(label?.width);
    expect(label?.width).toBeGreaterThan(LABEL_WIDTH);
  });

  it('is missing when the arrow has no words at all, and so has no room', () => {
    expect(labelText(arrow('a', 'b', []))).toBeUndefined();
  });
});

describe('the route line of a label', () => {
  it('names what the connections pass through, on a line of its own under the names and above the technology', () => {
    const label = labelText({ ...arrow('a', 'b', ['Calls the API'], ['HTTPS']), route: route(['Ingress', 'Workhorse']) });
    expect(label).toMatchObject({ lines: ['Calls the API'], route: 'via Ingress, Workhorse', technology: '[HTTPS]' });
    expect(label?.height).toBe(LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
  });

  it('says on how many connections they pass through something when the routes differ', () => {
    const label = labelText({ ...arrow('a', 'b', ['One', 'Two', 'Three', 'Four', 'Five']), route: route([], 2, 5) });
    expect(label?.lines).toEqual(['One', 'Two', '+ 3 more']);
    expect(label?.route).toBe('via on 2 of 5');
    expect(label?.height).toBe(3 * LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT);
  });

  it('is measured, and the label is as wide as it when it is the widest line', () => {
    const label = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['Load balancer']) });
    expect(label?.width).toBe(Math.ceil(widthOf('via Load balancer', ROUTE_FONT)));
  });

  it('gives as many whole names as fit, and then how many are left, when not all fit', () => {
    const two = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['CDN', 'Ingress', 'The load balancer of the proxies']) });
    expect(two?.route).toBe('via CDN, Ingress, + 1 more');
    const one = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['Ingress', 'Workhorse', 'The load balancer of the proxies']) });
    expect(one?.route).toBe('via Ingress, + 2 more');
    for (const label of [two, one]) {
      expect(fit([label?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
      expect(label?.width).toBeLessThanOrEqual(LABEL_WIDTH);
    }
  });

  it('cuts the first name with an ellipsis when not even it fits whole, and still says how many are left', () => {
    // Boxwick's route: the second hop must not be lost to the cut.
    const label = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['Content delivery network', 'Load balancer']) });
    expect(label?.route).toBe(`via Content${ELLIPSIS} + 1 more`);
    expect(fit([label?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
    // One name alone is cut as any line is.
    const alone = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['The load balancer in front of every proxy']) });
    expect(alone?.route?.endsWith(ELLIPSIS)).toBe(true);
    expect(alone?.route).not.toContain('more');
    expect(fit([alone?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
  });

  it('cuts a name in brackets inside them, and keeps both, and how many are left', () => {
    // The reviewer's route: a long name with a condition, then another thing.
    const name = 'Enterprise gateway for long-lived browser streaming connections behind the regional office perimeter';
    const label = labelText({ ...arrow('a', 'b', ['Pushes']), route: route([`(${name})`, 'Front']) });
    expect(label?.route).toMatch(new RegExp(`^via \\(Enterprise[^)]*${ELLIPSIS}\\), \\+ 1 more$`));
    expect(fit([label?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
    // Alone, too.
    const alone = labelText({ ...arrow('a', 'b', ['Pushes']), route: route([`(${name})`]) });
    expect(alone?.route).toMatch(new RegExp(`^via \\(Enterprise[^)]*${ELLIPSIS}\\)$`));
    expect(fit([alone?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
    // Whole names in brackets that fit are given whole before the count, brackets and all.
    expect(labelText({ ...arrow('a', 'b', ['Pays']), route: route(['(CDN)', 'Ingress', 'The load balancer of the proxies']) })?.route).toBe('via (CDN), + 2 more');
  });

  it('is missing when no connection of the arrow passes through anything', () => {
    expect(labelText(arrow('a', 'b', ['Pays'], ['HTTPS']))).not.toHaveProperty('route');
  });
});

describe('the `only` line of a box', () => {
  it('stands under the kind line, and takes a line from the first sentence', () => {
    const sentence =
      'Takes orders from the storefront and from the mobile apps, checks each against the stock and the account, keeps how far each has got, and tells the warehouse whenever anything changes.';
    const text = boxText(box('a', 'apps', { only: 'in the hosted edition', sentence }));
    expect(text.only).toBe('only in the hosted edition');
    expect(text.sentence).toHaveLength(3);
    expect(text.sentence[2]?.endsWith(ELLIPSIS)).toBe(true);
    expect(boxText(box('a', 'apps', { sentence })).sentence).toHaveLength(4);
  });

  it('is cut with an ellipsis when too long for one line', () => {
    const text = boxText(box('a', 'infrastructure', { only: 'when the hidden S3 or Azure flags are set and the bucket is in the same region' }));
    expect(text.only?.startsWith('only when the hidden')).toBe(true);
    expect(text.only?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit([text.only ?? ''], ONLY_FONT, BOX_WIDTH - text.inset.left - text.inset.right)).toBe(true);
  });

  it('is missing when the record has no `only` of its own', () => {
    expect(boxText(box('a', 'apps'))).not.toHaveProperty('only');
  });
});

describe('the lines of a label that say when its connections are there, and who opened their channel', () => {
  it('stand under the route and above the technology, a line height each', () => {
    const label = labelText({
      ...arrow('a', 'b', ['Says when a job is done'], ['HTTPS']),
      route: route(['(Office proxy)']),
      only: { count: 1, all: true, words: 'in the head office', line: 'only in the head office' },
      opened: { count: 1, all: false, line: 'far side opened on 1 of 2' },
    });
    expect(label).toMatchObject({ route: 'via (Office proxy)', only: ['only in the head office'], opened: 'far side opened on 1 of 2', technology: '[HTTPS]' });
    expect(label?.height).toBe(LABEL_LINE_HEIGHT + ROUTE_LINE_HEIGHT + 2 * CONDITION_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
  });

  it('break the words of a condition onto a second line, as a name, and cut them only after it', () => {
    // A condition of the hand-written Syncthing, which one line cut after "only when LDAP".
    const two = labelText({ ...arrow('a', 'b', ['Checks a login']), only: { count: 1, all: true, words: 'when LDAP authentication is configured', line: 'only when LDAP authentication is configured' } });
    expect(two?.only).toHaveLength(2);
    expect(two?.only?.join(' ')).toBe('only when LDAP authentication is configured');
    expect(fit(two?.only ?? [], CONDITION_FONT, LABEL_WIDTH)).toBe(true);
    expect(two?.height).toBe(LABEL_LINE_HEIGHT + 2 * CONDITION_LINE_HEIGHT);
    const long = labelText({
      ...arrow('a', 'b', ['Pays']),
      only: { count: 1, all: true, words: 'when the hidden S3 or Azure flags are set and the bucket is in the same region', line: 'only when the hidden S3 or Azure flags are set and the bucket is in the same region' },
    });
    expect(long?.only).toHaveLength(2);
    expect(long?.only?.[1]?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit(long?.only ?? [], CONDITION_FONT, LABEL_WIDTH)).toBe(true);
    // Short words keep one line.
    expect(labelText({ ...arrow('a', 'b', ['Pays']), only: { count: 1, all: true, words: 'at night', line: 'only at night' } })?.only).toEqual(['only at night']);
  });

  it('never cut the numbers of a line that says on how many', () => {
    const counted = labelText({ ...arrow('a', 'b', ['Pays']), opened: { count: 12, all: false, line: 'far side opened on 12 of 15' }, only: { count: 12, all: false, line: 'only on 12 of 15' } });
    expect(counted?.opened).toBe('far side opened on 12 of 15');
    expect(counted?.only).toEqual(['only on 12 of 15']);
  });

  it('have no line where every connection opened from the far side: the ring on the line says it', () => {
    const label = labelText({ ...arrow('a', 'b', ['Pays']), opened: { count: 1, all: true } });
    expect(label).not.toHaveProperty('opened');
    expect(label?.height).toBe(LABEL_LINE_HEIGHT);
  });

  it('make a label for an arrow that has no other words', () => {
    expect(labelText({ ...arrow('a', 'b', []), only: { count: 1, all: false, line: 'only on 1 of 2' } })).toMatchObject({ lines: [], only: ['only on 1 of 2'] });
  });
});

describe('the title of a boundary', () => {
  const boundary = (name: string, only?: string): ViewBoundary => ({
    id: 'shop',
    family: 'systems',
    name,
    line: '[System]',
    ...(only === undefined ? {} : { only }),
    title: `${name} [System]${only === undefined ? '' : ` only ${only}`}`,
    scope: true,
    loops: [],
    within: [],
    passing: [],
    kept: [],
  });

  it('says the system’s own `only` after its kind line, whole when it fits', () => {
    expect(titleText(boundary('Shop', 'in production'), 1000)).toBe('Shop [System] only in production');
    expect(titleText(boundary('Shop'), 1000)).toBe('Shop [System]');
  });

  it('keeps the kind line whole, and cuts the name and the `only` to share what is left', () => {
    const width = widthOf('Shop [System] only in production', TITLE_FONT) - 20;
    // A short name keeps whole, and the condition is cut.
    const short = titleText(boundary('Shop', 'in production'), width);
    expect(short.startsWith('Shop [System] only in')).toBe(true);
    expect(short.endsWith(ELLIPSIS)).toBe(true);
    expect(widthOf(short, TITLE_FONT)).toBeLessThanOrEqual(width + 1e-9);
    // A long name and a long condition each keep about half.
    const long = titleText(boundary('The shop of the whole company with every branch', 'when the shop is open in every branch at once'), 400);
    expect(long).toContain(`${ELLIPSIS} [System] only`);
    expect(long.endsWith(ELLIPSIS)).toBe(true);
    expect(widthOf(long, TITLE_FONT)).toBeLessThanOrEqual(400 + 1e-9);
    // With no condition, the name is cut as it always was.
    expect(titleText(boundary('The shop of the whole company with every branch'), 300)).toMatch(new RegExp(`${ELLIPSIS} \\[System\\]$`));
  });
});
