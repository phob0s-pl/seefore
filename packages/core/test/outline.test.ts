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
      infrastructure: [],
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
      conditions: [],
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
    expect(outlineOf(modelOf({}))).toEqual({ people: [], withParts: [], others: [], infrastructure: [], connections: [], owners: [], technologies: [], conditions: [], loose: [] });
  });

  it('gives the pieces of infrastructure apart, in order of id, and the connections that start at one last, after those at a record with an error', () => {
    const outline = outlineOf(
      modelOf({
        ...PARTS,
        'systems/zone.yaml': 'name: [Zone\n',
        'connections/zone-calls-mailer.yaml': 'from: zone\nto: mailer\n',
        'infrastructure/proxy.yaml': 'name: Proxy\n',
        'infrastructure/balancer.yaml': 'name: Balancer\n',
        'infrastructure/idle.yaml': 'name: Idle\n',
        'connections/visitor-reaches-web.yaml': 'from: visitor\nto: web\nvia: [balancer, proxy]\nname: Reaches\n',
        'connections/proxy-checks-web.yaml': 'from: proxy\nto: web\nname: Checks that it is up\n',
        'connections/balancer-checks-proxy.yaml': 'from: balancer\nto: proxy\nname: Checks that it is up\n',
        'connections/balancer-asks-mailer.yaml': 'from: balancer\nto: mailer\nname: Sends an alert\n',
      }),
    );
    expect(outline.infrastructure).toEqual(['balancer', 'idle', 'proxy']);
    expect(outline.connections.slice(-3)).toEqual([
      { start: 'zone', known: false, connections: ['zone-calls-mailer'] },
      { start: 'balancer', known: true, connections: ['balancer-asks-mailer', 'balancer-checks-proxy'] },
      { start: 'proxy', known: true, connections: ['proxy-checks-web'] },
    ]);
    // A connection that only passes through a piece of infrastructure stands under what it starts from.
    expect(outline.connections[0]).toEqual({ start: 'visitor', known: true, connections: ['visitor-reaches-web', 'visitor-uses-web'] });
  });
});

/**
 * Stage 6b: Desk keeps its drafts and its cache, and its editor reads the cache; a gate and an
 * office proxy are part of the archive, an HTTPS proxy is in no system, and a vault system has
 * nothing in it but a piece of its own. Some records say when they are there.
 */
const KEPT: Readonly<Record<string, string>> = {
  'people/staff.yaml': 'name: Staff\nonly: in the head office\n',
  'systems/archive.yaml': 'name: Archive\n',
  'systems/vault.yaml': 'name: Vault\n',
  'apps/desk.yaml': 'name: Desk\nin: archive\nonly: In the hosted edition\n',
  'apps/indexer.yaml': 'name: Indexer\nin: archive\nonly: in the hosted edition\n',
  'components/editor.yaml': 'name: Editor\nin: desk\n',
  'stores/drafts.yaml': 'name: Drafts\nin: desk\n',
  'stores/cache.yaml': 'name: Cache\nin: desk\n',
  'stores/records.yaml': 'name: Records\nin: archive\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: archive\nonly: in the head office\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: archive\n',
  'infrastructure/lock.yaml': 'name: Lock\nin: vault\n',
  'connections/desk-keeps-drafts.yaml': 'from: desk\nto: drafts\naccess: read-write\n',
  'connections/editor-reads-cache.yaml': 'from: editor\nto: cache\naccess: read\n',
  'connections/drafts-copies-records.yaml': 'from: drafts\nto: records\nonly: at night\n',
  'connections/gate-checks-desk.yaml': 'from: gate\nto: desk\n',
  'connections/proxy-checks-desk.yaml': 'from: proxy\nto: desk\n',
  'connections/staff-uses-desk.yaml': 'from: staff\nto: desk\nvia: [office-proxy]\nopens: to\n',
};

describe('the outline of stage 6b', () => {
  const outline = outlineOf(modelOf(KEPT));

  it('puts a store that an app keeps under the app, after its components, and not under the system', () => {
    expect(outline.withParts.find((system) => system.id === 'archive')).toEqual({
      id: 'archive',
      apps: [
        { id: 'desk', components: ['editor'], stores: ['cache', 'drafts'] },
        { id: 'indexer', components: [] },
      ],
      stores: ['records'],
      infrastructure: ['gate', 'office-proxy'],
    });
    expect(outline.loose).toEqual([]);
  });

  it('puts a piece of infrastructure under the system it is in, and keeps one in no system apart', () => {
    expect(outline.infrastructure).toEqual(['proxy']);
    // A system with a piece in it, and nothing else, has a part.
    expect(outline.withParts.map((system) => system.id)).toEqual(['archive', 'vault']);
    expect(outline.withParts[1]).toEqual({ id: 'vault', apps: [], stores: [], infrastructure: ['lock'] });
    expect(outline.others).toEqual([]);
  });

  it('puts the connections of a kept store under it, after its app, those of a piece in a system after the system’s stores, and those of a piece in no system last', () => {
    expect(outline.connections).toEqual([
      { start: 'staff', known: true, connections: ['staff-uses-desk'] },
      { start: 'desk', known: true, connections: ['desk-keeps-drafts', 'editor-reads-cache'] },
      { start: 'drafts', known: true, connections: ['drafts-copies-records'] },
      { start: 'gate', known: true, connections: ['gate-checks-desk'] },
      { start: 'proxy', known: true, connections: ['proxy-checks-desk'] },
    ]);
  });

  it('lists each wording of `only` with the records whose own it is, two that differ in capitals side by side', () => {
    expect(outline.conditions).toEqual([
      { only: 'at night', records: ['drafts-copies-records'] },
      { only: 'in the head office', records: ['office-proxy', 'staff'] },
      { only: 'In the hosted edition', records: ['desk'] },
      { only: 'in the hosted edition', records: ['indexer'] },
    ]);
  });

  it('gives a piece of infrastructure whose system has an error last, and an app there with its kept stores', () => {
    const broken = outlineOf(modelOf({ ...KEPT, 'systems/archive.yaml': 'name: [Archive\n' }));
    expect(broken.loose).toEqual([
      { id: 'desk', family: 'apps', in: 'archive', components: ['editor'], stores: ['cache', 'drafts'] },
      { id: 'indexer', family: 'apps', in: 'archive', components: [] },
      { id: 'records', family: 'stores', in: 'archive', components: [] },
      { id: 'gate', family: 'infrastructure', in: 'archive', components: [] },
      { id: 'office-proxy', family: 'infrastructure', in: 'archive', components: [] },
    ]);
    expect(broken.connections.map((group) => group.start)).toEqual(['staff', 'desk', 'drafts', 'gate', 'proxy']);
  });

  it('gives a store whose app has an error in its file as in a record with an error', () => {
    const broken = outlineOf(modelOf({ ...KEPT, 'apps/desk.yaml': 'name: [Desk\n' }));
    expect(broken.loose.filter((part) => part.family === 'stores')).toEqual([
      { id: 'cache', family: 'stores', in: 'desk', components: [] },
      { id: 'drafts', family: 'stores', in: 'desk', components: [] },
    ]);
  });
});
