import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { Model } from '../src/model.ts';
import { outlineOf } from '../src/outline.ts';
import { EXAMPLE } from './example.ts';

/** `outlineOf`: the listing of a model as a tree of ids, in the order `seefore list` prints it. */

const MARKER = 'format: 1\nname: Outline\n';

/** The model of a source directory of these files and a marker. */
function modelOf(files: Readonly<Record<string, string>>): Model {
  return load(Object.entries({ 'seefore.yaml': MARKER, ...files }).map(([path, text]) => ({ path, text }))).model;
}

/** A model with a part of each sort, and a connection from each sort of thing that can start one. */
const PARTS: Readonly<Record<string, string>> = {
  'people/visitor.yaml': 'name: Visitor\n',
  'systems/site.yaml': 'name: Site\n',
  'systems/mailer.yaml': 'name: Mailer\n',
  'systems/archive-service.yaml': 'name: Archive service\n',
  'apps/web.yaml': 'name: Web\nin: site\n',
  'apps/worker.yaml': 'name: Worker\nin: site\n',
  'stores/queue.yaml': 'name: Queue\nin: site\n',
  'stores/archive.yaml': 'name: Archive\nin: archive-service\n',
  'components/upload.yaml': 'name: Upload\nin: worker\n',
  'components/resize.yaml': 'name: Resize\nin: worker\n',
  'connections/visitor-uses-web.yaml': 'from: visitor\nto: web\nname: Uses\n',
  'connections/web-sends-file.yaml': 'from: web\nto: upload\nname: Sends a file\n',
  'connections/upload-calls-resize.yaml': 'from: upload\nto: resize\nname: Resizes\n',
  'connections/resize-writes-queue.yaml': 'from: resize\nto: queue\nname: Queues the result\n',
  'connections/worker-wakes-worker.yaml': 'from: worker\nto: worker\nname: Wakes another copy\n',
  'connections/queue-feeds-archive.yaml': 'from: queue\nto: archive\nname: Hands on old messages\n',
  'connections/mailer-calls-web.yaml': 'from: mailer\nto: web\n',
  'connections/site-calls-mailer.yaml': 'from: site\nto: mailer\n',
};

describe('the outline', () => {
  it('gives the example shop as a tree of ids, in the order of the listing', () => {
    const model = load(Object.entries(EXAMPLE).map(([path, text]) => ({ path, text }))).model;
    expect(outlineOf(model)).toEqual({
      people: ['customer', 'warehouse-clerk'],
      withParts: [
        {
          id: 'shop',
          apps: [
            { id: 'order-api', components: ['checkout', 'order-status'] },
            { id: 'shipping', components: [] },
            { id: 'storefront', components: [] },
          ],
          stores: ['orders-database'],
        },
      ],
      others: ['card-provider'],
      connections: [
        { start: 'customer', known: true, connections: ['customer-shops'] },
        { start: 'warehouse-clerk', known: true, connections: ['clerk-packs'] },
        { start: 'order-api', known: true, connections: ['checkout-keeps-orders', 'checkout-takes-payment', 'order-status-reads-orders'] },
        { start: 'shipping', known: true, connections: ['shipping-reads-orders'] },
        { start: 'storefront', known: true, connections: ['storefront-places-order'] },
        { start: 'card-provider', known: true, connections: ['card-provider-confirms'] },
      ],
      owners: ['card-provider-company', 'logistics-team', 'shop-team'],
      technologies: ['go', 'https', 'postgresql', 'react', 'sql', 'typescript'],
      loose: [],
    });
  });

  it('puts the systems with an app or a store first, whatever their ids', () => {
    const outline = outlineOf(modelOf(PARTS));
    expect(outline.withParts.map((system) => system.id)).toEqual(['archive-service', 'site']);
    expect(outline.withParts[1]).toEqual({
      id: 'site',
      apps: [
        { id: 'web', components: [] },
        { id: 'worker', components: ['resize', 'upload'] },
      ],
      stores: ['queue'],
    });
    expect(outline.others).toEqual(['mailer']);
  });

  it("puts each connection under the person, system, app or store it starts from, a component's under its app, in the order of the listing", () => {
    expect(outlineOf(modelOf(PARTS)).connections).toEqual([
      { start: 'visitor', known: true, connections: ['visitor-uses-web'] },
      { start: 'site', known: true, connections: ['site-calls-mailer'] },
      { start: 'web', known: true, connections: ['web-sends-file'] },
      { start: 'worker', known: true, connections: ['resize-writes-queue', 'upload-calls-resize', 'worker-wakes-worker'] },
      { start: 'queue', known: true, connections: ['queue-feeds-archive'] },
      { start: 'mailer', known: true, connections: ['mailer-calls-web'] },
    ]);
  });

  it('gives the parts whose `in` names a record with an error last, an app with its components', () => {
    const outline = outlineOf(
      modelOf({
        ...PARTS,
        'systems/site.yaml': 'name: [Site\n',
        'apps/broken.yaml': 'name: Broken\ncolour: blue\n',
        'components/part.yaml': 'name: Part\nin: broken\n',
      }),
    );
    expect(outline.withParts.map((system) => system.id)).toEqual(['archive-service']);
    expect(outline.loose).toEqual([
      { id: 'web', family: 'apps', in: 'site', components: [] },
      { id: 'worker', family: 'apps', in: 'site', components: ['resize', 'upload'] },
      { id: 'queue', family: 'stores', in: 'site', components: [] },
      { id: 'part', family: 'components', in: 'broken', components: [] },
    ]);
  });

  it('puts the connections that start at a record with an error, or at a part in one, after the rest, under that record by its id', () => {
    const outline = outlineOf(
      modelOf({
        ...PARTS,
        'systems/site.yaml': 'name: [Site\n',
        'apps/broken.yaml': 'name: [Broken\n',
        'components/part.yaml': 'name: Part\nin: broken\n',
        'connections/broken-calls-mailer.yaml': 'from: broken\nto: mailer\n',
        'connections/part-calls-mailer.yaml': 'from: part\nto: mailer\n',
        'connections/mailer-calls-part.yaml': 'from: mailer\nto: part\n',
        'systems/zone.yaml': 'name: [Zone\n',
        'connections/a-zone-calls-mailer.yaml': 'from: zone\nto: mailer\n',
      }),
    );
    expect(outline.connections).toEqual([
      { start: 'visitor', known: true, connections: ['visitor-uses-web'] },
      { start: 'mailer', known: true, connections: ['mailer-calls-part', 'mailer-calls-web'] },
      // The parts of the broken system still stand under themselves, after the other systems.
      { start: 'web', known: true, connections: ['web-sends-file'] },
      { start: 'worker', known: true, connections: ['resize-writes-queue', 'upload-calls-resize', 'worker-wakes-worker'] },
      { start: 'queue', known: true, connections: ['queue-feeds-archive'] },
      { start: 'broken', known: false, connections: ['broken-calls-mailer', 'part-calls-mailer'] },
      { start: 'site', known: false, connections: ['site-calls-mailer'] },
      { start: 'zone', known: false, connections: ['a-zone-calls-mailer'] },
    ]);
  });

  it('is empty for an empty model', () => {
    expect(outlineOf(modelOf({}))).toEqual({ people: [], withParts: [], others: [], connections: [], owners: [], technologies: [], loose: [] });
  });
});
