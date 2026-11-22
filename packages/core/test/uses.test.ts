import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import type { Problem } from '../src/problem.ts';
import { isShort, readInFull, recordsWithId, removalOf, usesOf, wordsFor } from '../src/uses.ts';
import type { Removal } from '../src/uses.ts';
import { EXAMPLE } from './example.ts';

/** `removalOf`: what goes with a record, what must go or change, what is left behind, and what may speak of it. */

const MARKER = 'format: 1\nname: Relays\n';

/** A source directory of these files and a marker. */
function directory(files: Readonly<Record<string, string>>): SourceFile[] {
  return Object.entries({ 'seefore.yaml': MARKER, ...files }).map(([path, text]) => ({ path, text }));
}

/** What removing the record with this id would mean, in a directory of these files. */
function review(files: Readonly<Record<string, string>>, id: string): Removal {
  const loaded = load(directory(files));
  const found = removalOf(loaded, id);
  if (!found) throw new Error(`no record ${id}`);
  return found;
}

function ids(records: readonly { id: string }[]): string[] {
  return records.map((record) => record.id);
}

/** Each record left behind, with why and what it assumes. */
function left(removal: Removal): string[] {
  return removal.left.map((one) => `${one.record.id} ${one.reason} ${one.assumes}`);
}

/** A small model like Syncthing's: a pool server that relays join, which keeps a file of them. */
const RELAYS: Readonly<Record<string, string>> = {
  'people/operators.yaml': 'name: Relay operators\ndescription: Run a relay server and let it join the pool.\n',
  'systems/sync.yaml': 'name: Sync\nowner: maintainers\n',
  'systems/geo.yaml': "name: Geo database\ndescription: Somebody else's. The relay pool server places relays on a map with it.\nowner: geo-company\n",
  'apps/relay-pool-server.yaml': 'name: strelaypoolsrv\nin: sync\ndescription: The relay pool server.\ntechnology: [go, geoip]\n',
  'apps/relay-server.yaml': 'name: Relay server\nin: sync\ntechnology: [go]\n',
  'apps/lonely.yaml': 'name: Lonely tool\nin: sync\n',
  'stores/relay-lists.yaml':
    'name: Relay lists\nin: sync\ndescription: |-\n  The known relays, which the relay pool\n  server writes and reads at start.\nkind: files\n',
  'connections/relay-server-joins-pool.yaml': 'from: relay-server\nto: relay-pool-server\nname: Joins the pool\ntechnology: [https]\n',
  'connections/pool-keeps-relay-lists.yaml': 'from: relay-pool-server\nto: relay-lists\nname: Writes the known relays\n',
  'connections/pool-downloads-geo.yaml': 'from: relay-pool-server\nto: geo\nname: Downloads the database\ntechnology: [https]\n',
  'connections/operators-run-relays.yaml': 'from: operators\nto: relay-server\nname: Run\n',
  'owners/maintainers.yaml': 'name: Maintainers\n',
  'owners/geo-company.yaml': 'name: The geo company\n',
  'technologies/go.yaml': 'name: Go\n',
  'technologies/geoip.yaml': 'name: GeoIP\n',
  'technologies/https.yaml': 'name: HTTPS\n',
};

describe('what goes with it', () => {
  it('is what is inside it, then each connection with both ends in it, once', () => {
    const removal = review(
      {
        'people/clerk.yaml': 'name: Clerk\n',
        'systems/shop.yaml': 'name: Shop\n',
        'apps/api.yaml': 'name: API\nin: shop\n',
        'stores/orders.yaml': 'name: Orders\nin: shop\n',
        'components/checkout.yaml': 'name: Checkout\nin: api\n',
        'components/status.yaml': 'name: Status\nin: api\n',
        'connections/api-calls-itself.yaml': 'from: api\nto: api\nname: Hands work to another copy\n',
        'connections/checkout-asks-status.yaml': 'from: checkout\nto: status\n',
        'connections/checkout-keeps-orders.yaml': 'from: checkout\nto: orders\n',
        'connections/clerk-uses-checkout.yaml': 'from: clerk\nto: checkout\n',
      },
      'shop',
    );
    expect(ids(removal.inside)).toEqual(['api', 'checkout', 'status', 'orders']);
    expect(ids(removal.goes)).toEqual(['api', 'checkout', 'status', 'orders', 'api-calls-itself', 'checkout-asks-status', 'checkout-keeps-orders']);
    expect(removal.changes.map((change) => change.record.id)).toEqual(['clerk-uses-checkout']);
  });

  it('is nothing for a record with nothing inside it and no connection to itself', () => {
    expect(review(RELAYS, 'relay-pool-server').goes).toEqual([]);
  });

  it('holds a connection from an app to the same app once, and one whose ends are no ends never', () => {
    const files = {
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'connections/api-calls-itself.yaml': 'from: api\nto: api\n',
      'connections/loop.yaml': 'from: loop\nto: loop\n',
    };
    expect(ids(review(files, 'api').goes)).toEqual(['api-calls-itself']);
    // A connection is not an end, so the one that names itself as both is not inside itself.
    const loop = review(files, 'loop');
    expect(loop.goes).toEqual([]);
    expect(loop.complete).toBe(false);
  });
});

describe('an id that more than one record has', () => {
  it('is answered for by neither, since a record that names it could mean either', () => {
    const loaded = load(directory({ 'owners/twin.yaml': 'name: Owner twin\n', 'systems/twin.yaml': 'name: System twin\n', 'systems/buyer.yaml': 'name: Buyer\nowner: twin\n' }));
    expect(recordsWithId(loaded, 'twin').map((record) => record.file)).toEqual(['owners/twin.yaml', 'systems/twin.yaml']);
    expect(removalOf(loaded, 'twin')).toBeUndefined();
    expect(usesOf(loaded, 'twin')).toBeUndefined();
    expect(recordsWithId(loaded, 'buyer')).toHaveLength(1);
    expect(recordsWithId(loaded, 'nothing')).toEqual([]);
  });
});

describe('what must go or change', () => {
  it('for an element: each connection with one end in it, once, with its place', () => {
    const removal = review(RELAYS, 'relay-pool-server');
    expect(removal.changes).toEqual([
      {
        record: { id: 'pool-downloads-geo', family: 'connections', file: 'connections/pool-downloads-geo.yaml', name: 'Downloads the database' },
        places: [{ file: 'connections/pool-downloads-geo.yaml', line: 1, column: 7, record: 'pool-downloads-geo', field: 'from', names: 'relay-pool-server' }],
      },
      {
        record: { id: 'pool-keeps-relay-lists', family: 'connections', file: 'connections/pool-keeps-relay-lists.yaml', name: 'Writes the known relays' },
        places: [{ file: 'connections/pool-keeps-relay-lists.yaml', line: 1, column: 7, record: 'pool-keeps-relay-lists', field: 'from', names: 'relay-pool-server' }],
      },
      {
        record: { id: 'relay-server-joins-pool', family: 'connections', file: 'connections/relay-server-joins-pool.yaml', name: 'Joins the pool' },
        places: [{ file: 'connections/relay-server-joins-pool.yaml', line: 2, column: 5, record: 'relay-server-joins-pool', field: 'to', names: 'relay-pool-server' }],
      },
    ]);
  });

  it('for an owner: each record whose `owner` names it, and how many parts take it from what they are in', () => {
    const removal = review(RELAYS, 'maintainers');
    expect(removal.changes.map((change) => `${change.record.id} ${change.places.map((place) => place.field)}`)).toEqual(['sync owner']);
    // The three apps and the store in the system.
    expect(removal.inherited).toBe(4);
    expect(removal.left).toEqual([]);
    // Shipping has an owner of its own; the other five parts of the shop take the shop's.
    const shop = removalOf(load(Object.entries(EXAMPLE).map(([path, text]) => ({ path, text }))), 'shop-team');
    expect(shop?.inherited).toBe(5);
  });

  it('for a technology: each record whose `technology` lists it', () => {
    expect(review(RELAYS, 'https').changes.map((change) => change.record.id)).toEqual(['pool-downloads-geo', 'relay-server-joins-pool']);
    expect(review(RELAYS, 'https').inherited).toBe(0);
  });

  it('for a connection: nothing, since nothing names a connection', () => {
    expect(review(RELAYS, 'pool-keeps-relay-lists').changes).toEqual([]);
  });

  it('keeps at its own field a place that names it where it may not be named, and takes no connection to end in an owner', () => {
    const removal = review(
      { ...RELAYS, 'connections/run-by-maintainers.yaml': 'from: relay-server\nto: maintainers\n', 'connections/maintainers-meet.yaml': 'from: maintainers\nto: maintainers\n' },
      'maintainers',
    );
    expect(removal.changes.map((change) => `${change.record.id} ${change.places.map((place) => place.field)}`)).toEqual([
      'maintainers-meet from,to',
      'run-by-maintainers to',
      'sync owner',
    ]);
    expect(removal.goes).toEqual([]);
    expect(removal.complete).toBe(false);
  });
});

describe('what would be left behind', () => {
  it('is each element that would be an end of no connection, and each owner or technology only what goes names', () => {
    const removal = review(RELAYS, 'relay-pool-server');
    // Geo goes, and with it the only user of its owner. HTTPS is named only by two of the connections.
    expect(left(removal)).toEqual([
      'geo no-connection connections-go',
      'relay-lists no-connection connections-go',
      'geoip no-user connections-go',
      'https no-user connections-go',
      'geo-company no-user left-go',
    ]);
  });

  it('leaves out one that keeps a connection, one that had none before, and a technology with another user', () => {
    const out = ids(review(RELAYS, 'relay-pool-server').left.map((one) => one.record));
    // The relay server still has its operators, and through it the system it is in has a connection.
    expect(out).not.toContain('relay-server');
    expect(out).not.toContain('sync');
    expect(out).not.toContain('lonely');
    expect(out).not.toContain('go');
    expect(out).not.toContain('maintainers');
  });

  it('counts a connection of anything inside an element as its own', () => {
    const theirs = {
      'systems/ours.yaml': 'name: Ours\n',
      'systems/theirs.yaml': 'name: Theirs\n',
      'apps/api.yaml': 'name: API\nin: ours\n',
      'apps/service.yaml': 'name: Service\nin: theirs\n',
      'apps/other.yaml': 'name: Other\nin: theirs\n',
      'connections/api-calls-theirs.yaml': 'from: api\nto: theirs\n',
    };
    // Theirs keeps a connection through what is inside it. Ours had one only through the app that goes.
    expect(left(review({ ...theirs, 'connections/other-calls-service.yaml': 'from: other\nto: service\n' }, 'api'))).toEqual([
      'ours no-connection connections-go',
    ]);
    // With nothing inside it connected, theirs is left too, and what is inside it, never connected, is not named.
    expect(left(review(theirs, 'api'))).toEqual(['ours no-connection connections-go', 'theirs no-connection connections-go']);
  });

  it('names an element and what it is in when neither would keep a connection', () => {
    const removal = review(
      {
        'systems/ours.yaml': 'name: Ours\n',
        'systems/theirs.yaml': 'name: Theirs\n',
        'apps/api.yaml': 'name: API\nin: ours\n',
        'apps/web.yaml': 'name: Web\nin: ours\n',
        'apps/service.yaml': 'name: Service\nin: theirs\n',
        'connections/api-calls-service.yaml': 'from: api\nto: service\n',
        'connections/web-calls-api.yaml': 'from: web\nto: api\n',
      },
      'api',
    );
    // Web is left too, and with it the system the removed app was in.
    expect(left(removal)).toEqual(['ours no-connection connections-go', 'theirs no-connection connections-go', 'service no-connection connections-go', 'web no-connection connections-go']);
  });

  it('names apart, only if the stores left go too, a technology they alone use', () => {
    const removal = review(
      {
        'systems/cloud.yaml': 'name: Cloud\n',
        'systems/messaging.yaml': 'name: Messaging\n',
        'apps/push.yaml': 'name: Push service\nin: cloud\ntechnology: [node, fastify]\n',
        'apps/sender.yaml': 'name: Sender\nin: cloud\ntechnology: [node]\n',
        'stores/limits.yaml': 'name: Rate limits\nin: cloud\ntechnology: [valkey]\n',
        'connections/push-counts.yaml': 'from: push\nto: limits\ntechnology: [resp]\n',
        'connections/push-hands-on.yaml': 'from: push\nto: messaging\ntechnology: [https]\n',
        'connections/sender-sends.yaml': 'from: sender\nto: messaging\ntechnology: [https]\n',
        'connections/sender-calls-push.yaml': 'from: sender\nto: push\ntechnology: [https]\n',
        'technologies/node.yaml': 'name: Node.js\n',
        'technologies/fastify.yaml': 'name: Fastify\n',
        'technologies/valkey.yaml': 'name: Valkey\n',
        'technologies/resp.yaml': 'name: RESP\n',
        'technologies/https.yaml': 'name: HTTPS\n',
      },
      'push',
    );
    expect(left(removal)).toEqual([
      'limits no-connection connections-go',
      'fastify no-user connections-go',
      'resp no-user connections-go',
      'valkey no-user left-go',
    ]);
  });

  it('for a connection: tries its two ends', () => {
    expect(left(review(RELAYS, 'operators-run-relays'))).toEqual(['operators no-connection connections-go']);
    expect(left(review(RELAYS, 'pool-downloads-geo'))).toEqual(['geo no-connection connections-go', 'geo-company no-user left-go']);
  });

  it('names nothing when the directory has an error, and says it may not be complete', () => {
    const removal = review({ ...RELAYS, 'connections/broken.yaml': 'from: relay-pool-server\nto: [geo\n' }, 'relay-pool-server');
    expect(removal.complete).toBe(false);
    expect(removal.left).toEqual([]);
    // What is known is still given.
    expect(removal.changes).toHaveLength(3);
    expect(removal.mentions.length).toBeGreaterThan(0);
  });

  it('names nothing when a file was not read, though it has no error', () => {
    const removal = review({ ...RELAYS, 'connection/typo.yaml': 'from: relay-pool-server\nto: geo\n' }, 'relay-pool-server');
    expect(removal.complete).toBe(false);
    expect(removal.left).toEqual([]);
  });

  it('still names what is left when the directory has only warnings of other kinds', () => {
    const files = { ...RELAYS, 'connections/operators-run-relays-again.yaml': 'from: operators\nto: relay-server\nname: Run\n' };
    expect(load(directory(files)).problems.map((problem) => problem.code)).toEqual(['connection-twice', 'connection-twice']);
    const removal = review(files, 'relay-pool-server');
    expect(removal.complete).toBe(true);
    expect(removal.left).toHaveLength(5);
  });
});

describe('what a connection passes through', () => {
  /** A site whose pages are reached through a balancer, an ingress and a part of another app. */
  const ROUTES: Readonly<Record<string, string>> = {
    'people/visitor.yaml': 'name: Visitor\n',
    'people/operator.yaml': 'name: Operator\n',
    'systems/site.yaml': 'name: Site\n',
    'apps/web.yaml': 'name: Web\nin: site\n',
    'apps/workhorse.yaml': 'name: Workhorse\nin: site\n',
    'components/router.yaml': 'name: Router\nin: workhorse\n',
    'infrastructure/balancer.yaml': 'name: Balancer\n',
    'infrastructure/ingress.yaml': 'name: Ingress\ntechnology: [nginx]\n',
    'infrastructure/edge-cache.yaml': 'name: Edge cache\n',
    'connections/visitor-reads-pages.yaml': 'from: visitor\nto: web\nvia: [balancer, ingress, router]\nname: Reads the pages\n',
    'connections/workhorse-asks-web.yaml': 'from: workhorse\nto: web\nname: Asks for the size of a file\n',
    'connections/operator-reloads-ingress.yaml': 'from: operator\nto: ingress\nname: Reloads it\n',
    'connections/operator-empties-cache.yaml': 'from: operator\nto: edge-cache\nname: Empties it\n',
    'technologies/nginx.yaml': 'name: nginx\n',
  };

  it('puts a connection that names the thing, or anything in it, in `via` under what must go or change, at its place there', () => {
    const removal = review(ROUTES, 'workhorse');
    expect(removal.changes).toEqual([
      {
        record: { id: 'visitor-reads-pages', family: 'connections', file: 'connections/visitor-reads-pages.yaml', name: 'Reads the pages' },
        places: [{ file: 'connections/visitor-reads-pages.yaml', line: 3, column: 26, record: 'visitor-reads-pages', field: 'via', names: 'router' }],
      },
      {
        record: { id: 'workhorse-asks-web', family: 'connections', file: 'connections/workhorse-asks-web.yaml', name: 'Asks for the size of a file' },
        places: [{ file: 'connections/workhorse-asks-web.yaml', line: 1, column: 7, record: 'workhorse-asks-web', field: 'from', names: 'workhorse' }],
      },
    ]);
    // The connection that passes through it stays, with what it passes through besides.
    expect(left(removal)).toEqual([]);
  });

  it('leaves behind a piece of infrastructure that only connections which go pass through, and that is the end of none', () => {
    // Both connections to Web go. The ingress is still reloaded by the operator; the balancer has nothing left.
    expect(left(review(ROUTES, 'web'))).toEqual([
      'visitor no-connection connections-go',
      'site no-connection connections-go',
      'workhorse no-connection connections-go',
      'balancer no-user connections-go',
    ]);
  });

  it('leaves behind a piece of infrastructure that is an end only of what goes, unless a connection that stays passes through it', () => {
    expect(left(review(ROUTES, 'operator'))).toEqual(['edge-cache no-connection connections-go']);
    expect(left(review(ROUTES, 'visitor-reads-pages'))).toEqual(['visitor no-connection connections-go', 'balancer no-user connections-go']);
  });

  it('leaves behind no app whose part a connection that stays passes through, when its last connection goes, nor that part', () => {
    // Workhorse asks Web for nothing more, but the pages still pass through its router.
    const out = ids(review(ROUTES, 'workhorse-asks-web').left.map((one) => one.record));
    expect(out).not.toContain('workhorse');
    expect(out).not.toContain('router');
    expect(out).not.toContain('site');
    expect(left(review(ROUTES, 'workhorse-asks-web'))).toEqual([]);
  });

  it('leaves behind no app and no system that a connection which stays passes through, nor what that is in', () => {
    // Hub has a connection only through the proxy app, which the reads still pass through.
    const files = {
      'systems/desk.yaml': 'name: Desk\n',
      'systems/hub.yaml': 'name: Hub\n',
      'systems/peer.yaml': 'name: Peer\n',
      'systems/edge.yaml': 'name: Edge\n',
      'apps/proxy-app.yaml': 'name: Proxy app\nin: hub\n',
      'apps/reader.yaml': 'name: Reader\nin: desk\n',
      'connections/proxy-checks-reader.yaml': 'from: proxy-app\nto: reader\n',
      'connections/edge-checks-reader.yaml': 'from: edge\nto: reader\n',
      'connections/reader-reads.yaml': 'from: reader\nto: peer\nvia: [proxy-app, edge]\n',
    };
    expect(left(review(files, 'proxy-checks-reader'))).toEqual([]);
    expect(left(review(files, 'edge-checks-reader'))).toEqual([]);
  });

  it('does not count a place in `via` that names the thing: it must change, so what the thing is in may be left', () => {
    // The router, not Workhorse, asks Web; once it goes, nothing but the route that must change names Workhorse.
    const files = Object.fromEntries(Object.entries(ROUTES).filter(([path]) => path !== 'connections/workhorse-asks-web.yaml'));
    const removal = review({ ...files, 'connections/router-asks-web.yaml': 'from: router\nto: web\n' }, 'router');
    expect(removal.changes.map((change) => `${change.record.id} ${change.places.map((place) => place.field)}`)).toEqual(['router-asks-web from', 'visitor-reads-pages via']);
    expect(left(removal)).toEqual(['workhorse no-connection connections-go']);
  });

  it('names the owner and the technologies that only a piece of infrastructure left named by nothing names, as if it went too', () => {
    const files = {
      'systems/hub.yaml': 'name: Hub\n',
      'systems/peer.yaml': 'name: Peer\n',
      'apps/reader.yaml': 'name: Reader\nin: hub\n',
      'apps/other.yaml': 'name: Other\nin: hub\n',
      'infrastructure/unused.yaml': 'name: Unused\nowner: platform\ntechnology: [nginx]\n',
      'connections/other-asks-reader.yaml': 'from: other\nto: reader\n',
      'connections/reader-reads.yaml': 'from: reader\nto: peer\nvia: [unused]\n',
      'owners/platform.yaml': 'name: Platform\n',
      'technologies/nginx.yaml': 'name: NGINX\n',
    };
    expect(left(review(files, 'reader-reads'))).toEqual([
      'peer no-connection connections-go',
      'unused no-user connections-go',
      'platform no-user left-go',
      'nginx no-user left-go',
    ]);
  });

  it('works on a piece of infrastructure as on any record', () => {
    const removal = review(ROUTES, 'ingress');
    expect(removal.record).toEqual({ id: 'ingress', family: 'infrastructure', file: 'infrastructure/ingress.yaml', name: 'Ingress' });
    expect(removal.inside).toEqual([]);
    expect(removal.goes).toEqual([]);
    expect(removal.changes.map((change) => `${change.record.id} ${change.places.map((place) => place.field)}`)).toEqual([
      'operator-reloads-ingress to',
      'visitor-reads-pages via',
    ]);
    // The operator still empties the cache, so only what the ingress alone names is left.
    expect(left(removal)).toEqual(['nginx no-user connections-go']);
  });
});

describe('what may speak of it', () => {
  it('finds its id with spaces, also over a line break, and points at the key of the text', () => {
    expect(review(RELAYS, 'relay-pool-server').mentions).toEqual([
      {
        file: 'stores/relay-lists.yaml',
        line: 3,
        column: 1,
        record: 'relay-lists',
        field: 'description',
        names: 'relay-pool-server',
        words: ['relay pool server'],
        goes: false,
      },
      { file: 'systems/geo.yaml', line: 2, column: 1, record: 'geo', field: 'description', names: 'relay-pool-server', words: ['relay pool server'], goes: false },
    ]);
  });

  it('for a rename, finds its name and id in what goes with it too, and says that it goes', () => {
    const removal = review(
      {
        'people/buyer.yaml': 'name: Buyer\ndescription: Shops at Old Shop and pays through Billing.\n',
        'systems/shop.yaml': 'name: Old Shop\n',
        'apps/billing.yaml': 'name: Billing\nin: shop\ndescription: Old Shop sends bills.\n',
        'components/charge.yaml': 'name: Charge\nin: billing\ndescription: Charges a card for Billing, the shop part.\n',
        'connections/charge-sends.yaml': 'from: charge\nto: billing\nname: Bills Old Shop\n',
      },
      'shop',
    );
    expect(removal.mentions.map((mention) => `${mention.record} ${mention.field} ${mention.names} ${mention.words.join(', ')} ${mention.goes ? 'goes' : 'stays'}`)).toEqual([
      'billing description shop Old Shop goes',
      'charge description shop shop goes',
      'charge-sends name shop Old Shop goes',
      // What stays is read for the names of what is inside the thing too; what goes only for the thing's own.
      'buyer description shop Old Shop stays',
      'buyer description billing Billing stays',
    ]);
  });

  it('leaves out its own text, and finds the text of a connection that must change', () => {
    const removal = review(
      { ...RELAYS, 'connections/pool-downloads-geo.yaml': 'from: relay-pool-server\nto: geo\ndescription: Strelaypoolsrv downloads it each week.\n' },
      'relay-pool-server',
    );
    expect(removal.mentions.map((mention) => `${mention.record} ${mention.field} ${mention.words.join(', ')}`)).toEqual([
      'pool-downloads-geo description Strelaypoolsrv',
      'relay-lists description relay pool server',
      'geo description relay pool server',
    ]);
  });

  it('finds the id with its hyphens, and a word beside punctuation, but not a shorter word inside a longer one', () => {
    const files = {
      'systems/git.yaml': 'name: Git service\n',
      'apps/praefect.yaml': 'name: Praefect\nin: git\n',
      'apps/gitaly.yaml': "name: Gitaly\nin: git\ndescription: Reached through Praefect's router.\n",
      'apps/router.yaml': 'name: Router\nin: git\ndescription: Not a praefects or superpraefect, nor a praefectX.\n',
      'stores/praefect-database.yaml': 'name: Praefect-database\nin: git\ndescription: (praefect) keeps its state here.\n',
      'stores/notes.yaml': 'name: Notes\nin: git\ndescription: "Logs: PRAEFECT."\n',
    };
    const removal = review(files, 'praefect');
    expect(removal.mentions.map((mention) => `${mention.file}:${mention.line} ${mention.words.join(', ')}`)).toEqual([
      'apps/gitaly.yaml:3 Praefect',
      'stores/notes.yaml:3 PRAEFECT',
      'stores/praefect-database.yaml:1 Praefect',
      'stores/praefect-database.yaml:3 praefect',
    ]);
  });

  it('gives each word found once, as first written, and not a name found within the id', () => {
    const removal = review(
      {
        'systems/sync.yaml': 'name: Sync\n',
        'apps/relay-pool-server.yaml': 'name: Pool\nin: sync\n',
        'stores/lists.yaml': 'name: Lists\nin: sync\ndescription: The relay pool server writes it. The Relay Pool Server, or the relay-pool-server, reads it.\n',
        'stores/other.yaml': 'name: Other\nin: sync\ndescription: The pool is somewhere else.\n',
      },
      'relay-pool-server',
    );
    expect(removal.mentions.map((mention) => `${mention.record} ${JSON.stringify(mention.words)}`)).toEqual([
      'lists ["relay pool server","relay-pool-server"]',
      'other ["pool"]',
    ]);
  });

  it('searches for what is inside it too, and says which record the words are of', () => {
    const removal = review(RELAYS, 'sync');
    // Everything in Sync goes with it, so only the text of the records outside it is read.
    expect(removal.mentions.map((mention) => `${mention.record} ${mention.names} ${mention.words.join(', ')}`)).toEqual([
      'operators relay-server relay server',
      'geo relay-pool-server relay pool server',
    ]);
  });

  it('looks for a name of fewer than three characters only as it is written, and not for an id that short', () => {
    const removal = review(
      {
        'technologies/go.yaml': 'name: Go\n',
        'owners/ux.yaml': 'name: Design team\n',
        'systems/driver.yaml': 'name: Driver\ndescription: A driver for Go, which the ux people and the design team look after.\n',
        'systems/gate.yaml': 'name: Gate\ndescription: Every request must go through it. GO is not Go-based.\n',
      },
      'go',
    );
    expect(removal.mentions.map((mention) => `${mention.record} ${mention.words.join(', ')}`)).toEqual(['driver Go', 'gate Go']);
    expect(review({ 'owners/ux.yaml': 'name: Design team\n', 'systems/driver.yaml': 'name: Driver\ndescription: For the ux people, the design team.\n' }, 'ux').mentions).toMatchObject([
      { record: 'driver', words: ['design team'] },
    ]);
  });
});

describe('the words searched for', () => {
  it('are the name and the id with spaces for its hyphens', () => {
    expect(wordsFor({ id: 'relay-pool-server', name: 'strelaypoolsrv' })).toEqual(['strelaypoolsrv', 'relay pool server']);
  });

  it('are the id alone when the name is the id in other words', () => {
    expect(wordsFor({ id: 'praefect', name: 'Praefect' })).toEqual(['praefect']);
    expect(wordsFor({ id: 'push-rate-limits', name: 'Push  rate-limits' })).toEqual(['push rate limits']);
  });

  it('keep a short name, and leave out a short id', () => {
    expect(wordsFor({ id: 'go', name: 'Go' })).toEqual(['Go']);
    expect(wordsFor({ id: 'golang', name: 'Go' })).toEqual(['Go', 'golang']);
    expect(wordsFor({ id: 'ui' })).toEqual([]);
    expect(isShort('Go')).toBe(true);
    expect(isShort('a b')).toBe(false);
  });
});

describe('a directory read in full', () => {
  const problem = (severity: Problem['severity'], code: string): Problem => ({ file: 'x.yaml', line: 1, column: 1, severity, code, message: '' });

  it('has no error and no file left unread', () => {
    expect(readInFull([])).toBe(true);
    expect(readInFull([problem('warning', 'connection-twice')])).toBe(true);
    expect(readInFull([problem('error', 'yaml-syntax')])).toBe(false);
    expect(readInFull([problem('warning', 'not-read')])).toBe(false);
    expect(readInFull([problem('warning', 'link-not-followed')])).toBe(false);
  });

  it('is judged on the problems given, such as those from reading the disk', () => {
    const loaded = load(directory(RELAYS));
    expect(removalOf(loaded, 'relay-pool-server')?.complete).toBe(true);
    expect(removalOf(loaded, 'relay-pool-server', { problems: [problem('error', 'folder-unreadable')] })).toMatchObject({ complete: false, left: [] });
  });

  it('cannot be made surer by the problems given: those the directory has still count', () => {
    const loaded = load(directory({ ...RELAYS, 'connections/broken.yaml': 'from: relay-pool-server\nto: [geo\n' }));
    expect(removalOf(loaded, 'relay-pool-server', { problems: [] })).toMatchObject({ complete: false, left: [] });
  });
});

describe('the texts a directory holds', () => {
  it('are each name and description, with the place of its key, whether plain, in quotes or in a block', () => {
    const loaded = load(
      directory({
        'systems/shop.yaml': 'description: "Sells: goods."\nname: Shop\n',
        'apps/api.yaml': 'name: API\nin: shop\ndescription: >-\n  Takes orders\n  and answers.\n',
        'apps/bad.yaml': 'name: 42\nin: shop\n',
      }),
    );
    expect(loaded.texts).toEqual([
      { file: 'apps/api.yaml', line: 1, column: 1, record: 'api', field: 'name', text: 'API' },
      { file: 'apps/api.yaml', line: 3, column: 1, record: 'api', field: 'description', text: 'Takes orders and answers.' },
      { file: 'systems/shop.yaml', line: 1, column: 1, record: 'shop', field: 'description', text: 'Sells: goods.' },
      { file: 'systems/shop.yaml', line: 2, column: 1, record: 'shop', field: 'name', text: 'Shop' },
    ]);
  });

  it('are each condition too, which may speak of another record', () => {
    const loaded = load(directory({ 'systems/shop.yaml': 'name: Shop\n', 'apps/api.yaml': 'name: API\nin: shop\nonly: when the Shop runs its own payments\n' }));
    expect(loaded.texts.filter((text) => text.field === 'only')).toEqual([
      { file: 'apps/api.yaml', line: 3, column: 1, record: 'api', field: 'only', text: 'when the Shop runs its own payments' },
    ]);
  });
});

/**
 * A desk like Vellumoak's: Desk keeps its drafts and a cache, a worker reads the drafts too, an
 * ingress in the system stands before Desk, and the office edition has a proxy of its own.
 */
const DESK: Readonly<Record<string, string>> = {
  'people/staff.yaml': 'name: Staff\n',
  'systems/archive.yaml': 'name: Archive\nowner: archive-team\n',
  'systems/office.yaml': 'name: Office\nonly: in the head office\n',
  'apps/desk.yaml': 'name: Desk\nin: archive\nonly: in the desk edition\n',
  'apps/worker.yaml': 'name: Worker\nin: archive\n',
  'components/editor.yaml': 'name: Editor\nin: desk\n',
  'stores/drafts.yaml': 'name: Drafts\nin: desk\n',
  'stores/cache.yaml': 'name: Cache\nin: desk\n',
  'stores/records.yaml': 'name: Records\nin: archive\n',
  'infrastructure/ingress.yaml': 'name: Ingress\nin: archive\n',
  'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: office\n',
  'connections/staff-uses-desk.yaml': 'from: staff\nto: desk\nvia: [office-proxy, ingress]\nname: Edits records\n',
  'connections/editor-keeps-drafts.yaml': 'from: editor\nto: drafts\naccess: read-write\nname: Keeps edits not yet saved\n',
  'connections/worker-reads-drafts.yaml': 'from: worker\nto: drafts\naccess: read\nname: Reads the drafts to save them\n',
  'connections/worker-writes-records.yaml': 'from: worker\nto: records\naccess: write\nname: Saves the records\n',
  'connections/desk-tells-staff.yaml': 'from: desk\nto: staff\nopens: to\nname: Says when a record is saved\n',
  'owners/archive-team.yaml': 'name: Archive team\n',
};

describe('a store that an app keeps, a piece in a system, and a condition', () => {
  it('puts the stores an app keeps with it, after its components', () => {
    const removal = review(DESK, 'desk');
    expect(removal.inside.map((record) => `${record.id} in ${record.in}`)).toEqual(['editor in desk', 'cache in desk', 'drafts in desk']);
    expect(ids(removal.goes)).toEqual(['editor', 'cache', 'drafts', 'editor-keeps-drafts']);
    expect(removal.changes.map((change) => change.record.id)).toEqual(['desk-tells-staff', 'staff-uses-desk', 'worker-reads-drafts']);
  });

  it('puts in a system its apps with what is in each, then its stores, then its pieces of infrastructure', () => {
    expect(ids(review(DESK, 'archive').inside)).toEqual(['desk', 'editor', 'cache', 'drafts', 'worker', 'records', 'ingress']);
  });

  it('puts a piece of infrastructure with its system, and a connection through it under what must change', () => {
    const removal = review(DESK, 'office');
    expect(ids(removal.inside)).toEqual(['office-proxy']);
    expect(removal.changes).toEqual([
      {
        record: { id: 'staff-uses-desk', family: 'connections', file: 'connections/staff-uses-desk.yaml', name: 'Edits records' },
        places: [{ file: 'connections/staff-uses-desk.yaml', line: 3, column: 7, record: 'staff-uses-desk', field: 'via', names: 'office-proxy' }],
      },
    ]);
    expect(left(removal)).toEqual([]);
  });

  it("leaves behind, when an app's last kept store goes, what reached nothing else, and says nothing of `access`", () => {
    const removal = review(withoutNulls({ ...DESK, 'stores/cache.yaml': null }), 'drafts');
    expect(removal.changes.flatMap((change) => change.places.map((place) => `${change.record.id} ${place.field}`))).toEqual([
      'editor-keeps-drafts to',
      'worker-reads-drafts to',
    ]);
    // The editor's one connection was to the drafts; Desk has connections of its own, and the worker another.
    expect(left(removal)).toEqual(['editor no-connection connections-go']);
    // An app whose only connections were those of its part to the store it kept is left with none too.
    const alone = withoutNulls({ ...DESK, 'stores/cache.yaml': null, 'connections/staff-uses-desk.yaml': null, 'connections/desk-tells-staff.yaml': null });
    expect(left(review(alone, 'drafts'))).toEqual(['desk no-connection connections-go', 'editor no-connection connections-go']);
  });

  it("takes a piece of infrastructure with its system, and leaves behind what only the system's connections reached or named", () => {
    const removal = review(DESK, 'archive');
    expect(removal.changes.map((change) => change.record.id)).toEqual(['desk-tells-staff', 'staff-uses-desk']);
    // The office's proxy is in another system, so it stays, named by nothing.
    expect(left(removal)).toEqual(['staff no-connection connections-go', 'office-proxy no-user connections-go', 'archive-team no-user connections-go']);
  });

  it('takes the stores an app keeps with the app, and makes each connection to them from outside go or change', () => {
    const removal = review(DESK, 'desk');
    const worker = removal.changes.find((change) => change.record.id === 'worker-reads-drafts');
    expect(worker?.places).toEqual([{ file: 'connections/worker-reads-drafts.yaml', line: 2, column: 5, record: 'worker-reads-drafts', field: 'to', names: 'drafts' }]);
    // The worker keeps its connection to the records; the route to Desk named the two pieces.
    expect(left(removal)).toEqual(['staff no-connection connections-go', 'ingress no-user connections-go', 'office-proxy no-user connections-go']);
  });

  it('says what has its condition from it: the parts inside it and the connections at it or in it', () => {
    expect(review(DESK, 'desk').condition).toEqual({
      only: 'in the desk edition',
      parts: ['editor', 'cache', 'drafts'],
      connections: ['desk-tells-staff', 'editor-keeps-drafts', 'staff-uses-desk', 'worker-reads-drafts'],
    });
    // Nothing comes from what a connection passes through.
    expect(review(DESK, 'office').condition).toEqual({ only: 'in the head office', parts: ['office-proxy'], connections: [] });
  });

  it('says nothing of a condition for a record with none of its own, nor for one with an error in its file', () => {
    expect(review(DESK, 'archive')).not.toHaveProperty('condition');
    expect(review(DESK, 'editor')).not.toHaveProperty('condition');
    expect(review({ ...DESK, 'apps/desk.yaml': 'name: Desk\nin: archive\nonly: in the desk edition\ncolour: blue\n' }, 'desk')).not.toHaveProperty('condition');
  });

  it('finds a name in the condition of another record', () => {
    const files = { ...DESK, 'apps/worker.yaml': 'name: Worker\nin: archive\nonly: where the Ingress runs\n' };
    expect(review(files, 'ingress').mentions).toEqual([
      { file: 'apps/worker.yaml', line: 3, column: 1, record: 'worker', field: 'only', names: 'ingress', words: ['Ingress'], goes: false },
    ]);
  });
});

/** Files with those given as `null` left out. */
function withoutNulls(files: Readonly<Record<string, string | null>>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== null));
}
