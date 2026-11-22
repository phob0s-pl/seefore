import { describe, expect, it } from 'vitest';
import { ELLIPSIS, widthOf } from '../src/measure.ts';
import {
  BOX_TEXT_WIDTH,
  KIND_FONT,
  LABEL_FONT,
  LABEL_LINE_HEIGHT,
  LABEL_WIDTH,
  NAME_FONT,
  ROUTE_FONT,
  ROUTE_LINE_HEIGHT,
  SENTENCE_FONT,
  TECHNOLOGY_FONT,
  TECHNOLOGY_LINE_HEIGHT,
} from '../src/sizes.ts';
import { boxText, labelText } from '../src/text.ts';
import { arrow, box, route } from './views.ts';

/** True when no line is wider than the width, allowing for the sum of fractions. */
function fit(lines: readonly string[], font: { size: number; bold: boolean }, width: number): boolean {
  return lines.every((line) => widthOf(line, font) <= width + 1e-9);
}

describe('the text of a box', () => {
  it('is the name, the kind line and the first sentence, each broken to fit the box', () => {
    const text = boxText(box('order-api', 'apps', { name: 'Order API', line: '[App: service · Go]', sentence: 'Takes orders and says how far each has got.' }));
    expect(text).toEqual({ name: ['Order API'], line: '[App: service · Go]', sentence: ['Takes orders and says how far each', 'has got.'] });
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

  it('takes as much room as its widest line, and a line height for each line', () => {
    const label = labelText(arrow('a', 'b', ['Writes each order', 'Reads an order'], ['SQL']));
    expect(label?.width).toBe(Math.ceil(widthOf('Writes each order', LABEL_FONT)));
    expect(label?.height).toBe(2 * LABEL_LINE_HEIGHT + TECHNOLOGY_LINE_HEIGHT);
  });

  it('is missing when the arrow has no words at all', () => {
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

  it('is cut with an ellipsis when it is wider than the label', () => {
    const label = labelText({ ...arrow('a', 'b', ['Pays']), route: route(['The customer’s HTTP proxy', 'The load balancer of the proxies', 'Ingress']) });
    expect(label?.route?.endsWith(ELLIPSIS)).toBe(true);
    expect(label?.route?.startsWith('via The customer’s')).toBe(true);
    expect(fit([label?.route ?? ''], ROUTE_FONT, LABEL_WIDTH)).toBe(true);
    expect(label?.width).toBeLessThanOrEqual(LABEL_WIDTH);
  });

  it('is missing when no connection of the arrow passes through anything', () => {
    expect(labelText(arrow('a', 'b', ['Pays'], ['HTTPS']))).not.toHaveProperty('route');
  });
});
