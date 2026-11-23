import type { View } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import { READING_NAMES, keptReading, readingOf } from '../src/reading.ts';
import { ARCHIVE_FILES, ARCHIVE_STATE, archiveView, stateOf } from './archive.ts';
import { CONTAINERS, HARD_CONTAINERS } from './fixture.ts';
import { studioView } from './studio.ts';

/** What the reading line says for what is pointed at, focused or chosen. */

const studio = studioView('studio.containers');

describe('the reading line of a box', () => {
  it('says its name and its kind line', () => {
    expect(readingOf(CONTAINERS, { kind: 'box', id: 'order-api' })).toBe('Order API [App: service · Go]');
    expect(readingOf(HARD_CONTAINERS, { kind: 'box', id: 'cards' })).toBe('Card provider [System: external]');
  });

  it('says its own `only` after them', () => {
    expect(readingOf(studio, { kind: 'box', id: 'api' })).toBe('API [App: service] only in the hosted edition');
  });

  it('says for the boundary its title: the name, the kind line and the system’s own `only`', () => {
    expect(readingOf(CONTAINERS, { kind: 'box', id: 'shop' })).toBe('Shop [System]');
    expect(readingOf(studio, { kind: 'box', id: 'studio' })).toBe('Studio [System] only in production');
  });
});

describe('the reading line of an arrow', () => {
  it('says its two ends by name, its name and its technology', () => {
    expect(readingOf(CONTAINERS, { kind: 'arrow', id: 'order-api~orders-database' })).toBe('Order API → Orders database: Writes each order · [SQL]');
  });

  it('names the boundary as an end', () => {
    expect(readingOf(CONTAINERS, { kind: 'arrow', id: 'customer~shop' })).toBe('Customer → Shop: Buys goods');
  });

  it('says every name of its connections up to three', () => {
    expect(readingOf(CONTAINERS, { kind: 'arrow', id: 'order-api~card-provider' })).toBe('Order API → Card provider: Refunds a payment; Takes the payment; Asks for its state · [HTTPS]');
  });

  it('says, for more than three, how many of how many it names', () => {
    const names = ['Asks', 'Tells', 'Sends', 'Takes', 'Reads'];
    const many: View = {
      ...CONTAINERS,
      arrows: CONTAINERS.arrows.map((arrow) => (arrow.id === 'customer~shop' ? { ...arrow, connections: names.map((name) => name.toLowerCase()), names, technology: ['HTTPS'] } : arrow)),
    };
    expect(READING_NAMES).toBe(3);
    expect(readingOf(many, { kind: 'arrow', id: 'customer~shop' })).toBe('Customer → Shop, 3 of its 5 connections: Asks; Tells; Sends · [HTTPS]');
  });

  it('says its route with the brackets as its label has them', () => {
    expect(readingOf(studio, { kind: 'arrow', id: 'editor~web' })).toBe('Editor → Web: Edits a page · via Edge, (Office proxy) · [HTTPS]');
    expect(readingOf(HARD_CONTAINERS, { kind: 'arrow', id: 'web~cards' })).toBe('Web → Card provider: Asks for a refund; Takes a payment · via on 1 of 2');
  });

  it('says when its connections are there, and who opened the channel', () => {
    expect(readingOf(studio, { kind: 'arrow', id: 'api~web' })).toBe('API → Web: Tells of changes · the far side opened the channel');
    expect(readingOf(studio, { kind: 'arrow', id: 'worker~crm' })).toBe('Worker → CRM: Asks for customers; Reads changes · only on 1 of 2 · far side opened on 1 of 2');
    const archive = archiveView('archive.containers');
    expect(readingOf(archive, { kind: 'arrow', id: 'indexer~records' })).toBe('Indexer → Records: Reads the records · only at night');
    expect(readingOf(archive, { kind: 'arrow', id: 'desk~browser' })).toBe('Desk → Staff browser: Says when a job is done · via HTTPS proxy, (Office proxy) · the far side opened the channel');
  });
});

describe('the reading line of a thing passed through', () => {
  it('says its name as the list has it, and how many of the view’s connections pass through it', () => {
    expect(readingOf(HARD_CONTAINERS, { kind: 'passed', id: 'balancer' })).toBe("Load balancer: 1 of this view's connections passes through it");
    expect(readingOf(studio, { kind: 'passed', id: 'office' })).toBe("(Office proxy): 1 of this view's connections passes through it");
    const two: View = { ...HARD_CONTAINERS, passed: HARD_CONTAINERS.passed.map((each) => ({ ...each, connections: ['web-asks-cards', 'web-calls-cards'] })) };
    expect(readingOf(two, { kind: 'passed', id: 'balancer' })).toBe("Load balancer: 2 of this view's connections pass through it");
  });
});

describe('the reading line of a line of the legend', () => {
  it('says what it lights, and how much of the picture that is', () => {
    expect(readingOf(studio, { kind: 'legend', id: 'app' })).toBe('Lights every app: 3 boxes');
    expect(readingOf(studio, { kind: 'legend', id: 'route' })).toBe('Lights every arrow with a route: 2 arrows');
    expect(readingOf(studio, { kind: 'legend', id: 'opened' })).toBe('Lights every arrow with a ring before its head: 1 arrow');
    expect(readingOf(studio, { kind: 'legend', id: 'only' })).toBe('Lights every box, boundary and arrow that has an “only …” line: 1 box, the boundary and 1 arrow');
    expect(readingOf(studio, { kind: 'legend', id: 'kept' })).toBe('Lights every app that keeps stores: 1 box');
    expect(readingOf(studio, { kind: 'legend', id: 'boundary' })).toBe('Lights the boundary of Studio');
  });

  it('names the shapes each line lights and no others: other systems but the external ones, stores but queues and topics', () => {
    expect(readingOf(studio, { kind: 'legend', id: 'system' })).toBe('Lights every other system that is not external: 1 box');
    expect(readingOf(studio, { kind: 'legend', id: 'system-external' })).toBe('Lights every external system: 1 box');
    expect(readingOf(studio, { kind: 'legend', id: 'store' })).toBe('Lights every store that is not a queue or a topic: 1 box');
    expect(readingOf(studio, { kind: 'legend', id: 'queue-or-topic' })).toBe('Lights every queue and topic: 1 box');
  });

  it('counts the things in the list under the legend that it lights', () => {
    expect(readingOf(studio, { kind: 'legend', id: 'route-only' })).toBe(
      'Lights every arrow and box whose connections pass through a thing in brackets, and each such thing in the list: 1 arrow and 1 thing in the list',
    );
  });
});

describe('the reading line of a store that an app keeps, chosen in the listing or on a panel', () => {
  it('says its name, its kind line as a box would have it, its own `only`, and the app that keeps it', () => {
    expect(keptReading(ARCHIVE_STATE, 'drafts', 'desk')).toBe('Drafts [Store: files], kept by Desk');
    expect(keptReading(ARCHIVE_STATE, 'cache', 'desk')).toBe('Cache [Store: cache] only when caching is on, kept by Desk');
    const tech = stateOf({ ...ARCHIVE_FILES, 'technologies/quill.yaml': 'name: Quill\n', 'technologies/inkpot.yaml': 'name: Inkpot\n', 'stores/drafts.yaml': 'name: Drafts\nin: desk\nkind: files\ntechnology: [quill, inkpot]\n' });
    expect(keptReading(tech, 'drafts', 'desk')).toBe('Drafts [Store: files · Inkpot, Quill], kept by Desk');
    expect(keptReading(ARCHIVE_STATE, 'nothing', 'desk')).toBe('');
  });
});

describe('the reading line with nothing to say', () => {
  it('is empty for nothing, and for what the view does not hold', () => {
    expect(readingOf(CONTAINERS, null)).toBe('');
    expect(readingOf(CONTAINERS, { kind: 'box', id: 'nobody' })).toBe('');
    expect(readingOf(CONTAINERS, { kind: 'arrow', id: 'nobody~shop' })).toBe('');
    expect(readingOf(CONTAINERS, { kind: 'passed', id: 'balancer' })).toBe('');
    expect(readingOf(CONTAINERS, { kind: 'legend', id: 'kept' })).toBe('');
  });
});
