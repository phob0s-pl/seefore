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
});
