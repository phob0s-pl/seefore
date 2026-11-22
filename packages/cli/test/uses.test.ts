import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult, Failure } from '../src/check.ts';
import { main } from '../src/main.ts';
import type { UsesResult } from '../src/uses.ts';

/** `seefore uses` as the review of a removal: the four lists, in words and as data. */

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-test-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes files under the temporary folder. A path's folders are made as needed. */
function write(files: Readonly<Record<string, string>>, under = '.'): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, under, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Runs the command in-process, from `cwd` inside the temporary folder. */
function run(args: string[], cwd = '.') {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { cwd: join(root, cwd), out: (text) => out.push(text), err: (text) => err.push(text) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function json(args: string[], cwd = '.') {
  const result = run([...args, '--json'], cwd);
  return { code: result.code, data: JSON.parse(result.out) as UsesResult };
}

/** What a connection that passes through the thing must do to its route, as each heading says it. */
const ROUTE = 'name another in its place in `via`, or leave it out, and leave out `via` too if nothing is left in it';

/** A small model like Syncthing's: a pool server that relays join, which keeps a file of them. */
const RELAYS: Readonly<Record<string, string>> = {
  'seefore.yaml': 'format: 1\nname: Relays\n',
  'people/operators.yaml': 'name: Relay operators\ndescription: Run a relay server and let it join the pool.\n',
  'systems/sync.yaml': 'name: Sync\nowner: maintainers\n',
  'systems/geo.yaml': "name: Geo database\ndescription: Somebody else's. The relay pool server places relays on a map with it.\nowner: geo-company\n",
  'apps/relay-pool-server.yaml': 'name: strelaypoolsrv\nin: sync\ndescription: The relay pool server.\ntechnology: [go, geoip]\n',
  'apps/relay-server.yaml': 'name: Relay server\nin: sync\ntechnology: [go]\n',
  'stores/relay-lists.yaml': 'name: Relay lists\nin: sync\ndescription: >-\n  The known relays, which the\n  relay pool server writes.\nkind: files\n',
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

describe('seefore uses, in words', () => {
  it('reviews the removal of an app: what goes, what must go or change, what is left, and what may speak of it', () => {
    write(RELAYS);
    const result = run(['uses', 'relay-pool-server']);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out.split('\n')).toEqual([
      'app relay-pool-server: strelaypoolsrv (apps/relay-pool-server.yaml)',
      '',
      'Goes with it: nothing is inside it.',
      '',
      '3 connections have one end in it. Each must go or get another end:',
      '  connections/pool-downloads-geo.yaml:1:7: `from`',
      '  connections/pool-keeps-relay-lists.yaml:1:7: `from`',
      '  connections/relay-server-joins-pool.yaml:2:5: `to`',
      '',
      'If they go, 2 records are left with no connection:',
      '  system geo: Geo database (systems/geo.yaml)',
      '  store relay-lists: Relay lists (stores/relay-lists.yaml)',
      '',
      '2 records are named by nothing but it and those connections:',
      '  technology geoip: GeoIP (technologies/geoip.yaml)',
      '  technology https: HTTPS (technologies/https.yaml)',
      '',
      'If the 2 records left with no connection go too, 1 more record is named by nothing:',
      '  owner geo-company: The geo company (owners/geo-company.yaml)',
      '',
      '2 records may speak of it ("strelaypoolsrv", "relay pool server"). Read each:',
      '  stores/relay-lists.yaml:3:1: `description` says "relay pool server"',
      '  systems/geo.yaml:2:1: `description` says "relay pool server"',
    ]);
  });

  it('for a system: what is inside it as a tree, the connections with both ends in it, and the words of what is inside', () => {
    write(RELAYS);
    expect(run(['uses', 'sync']).out.split('\n')).toEqual([
      'system sync: Sync (systems/sync.yaml)',
      '',
      'Goes with it: 3 records inside it, and 2 connections with both ends in it:',
      '  app relay-pool-server: strelaypoolsrv (apps/relay-pool-server.yaml)',
      '  app relay-server: Relay server (apps/relay-server.yaml)',
      '  store relay-lists: Relay lists (stores/relay-lists.yaml)',
      '  connection pool-keeps-relay-lists: Writes the known relays (connections/pool-keeps-relay-lists.yaml)',
      '  connection relay-server-joins-pool: Joins the pool (connections/relay-server-joins-pool.yaml)',
      '',
      '2 connections have one end in it. Each must go or get another end:',
      '  connections/operators-run-relays.yaml:2:5: `to` names `relay-server`',
      '  connections/pool-downloads-geo.yaml:1:7: `from` names `relay-pool-server`',
      '',
      'If they go, 2 records are left with no connection:',
      '  person operators: Relay operators (people/operators.yaml)',
      '  system geo: Geo database (systems/geo.yaml)',
      '',
      '4 records are named by nothing but it and those connections:',
      '  owner maintainers: Maintainers (owners/maintainers.yaml)',
      '  technology geoip: GeoIP (technologies/geoip.yaml)',
      '  technology go: Go (technologies/go.yaml)',
      '  technology https: HTTPS (technologies/https.yaml)',
      '',
      'If the 2 records left with no connection go too, 1 more record is named by nothing:',
      '  owner geo-company: The geo company (owners/geo-company.yaml)',
      '',
      '2 records may speak of it ("sync") or of something inside it. Read each:',
      '  people/operators.yaml:2:1: `description` says "relay server"',
      '  systems/geo.yaml:2:1: `description` says "relay pool server"',
    ]);
  });

  it('for an owner: each record that names it, and how many parts take it from what they are in', () => {
    write(RELAYS);
    expect(run(['uses', 'maintainers']).out.split('\n')).toEqual([
      'owner maintainers: Maintainers (owners/maintainers.yaml)',
      '',
      '1 record names it in `owner`. It must name another in its place, or leave it out:',
      '  systems/sync.yaml:2:8: `owner`',
      '',
      '3 more parts take it from what they are in. Their files hold no `owner` to change.',
      '',
      'No other record\'s name, `only` or description holds "maintainers".',
    ]);
  });

  it('for a technology: each record that names it, and what may speak of it', () => {
    write(RELAYS);
    expect(run(['uses', 'geoip']).out.split('\n')).toEqual([
      'technology geoip: GeoIP (technologies/geoip.yaml)',
      '',
      '1 record names it in `technology`. It must name another in its place, or leave it out:',
      '  apps/relay-pool-server.yaml:4:18: `technology`',
      '',
      'No other record\'s name, `only` or description holds "geoip".',
    ]);
  });

  it('for a connection: what its ends and its technologies would lose', () => {
    write(RELAYS);
    expect(run(['uses', 'pool-downloads-geo']).out.split('\n')).toEqual([
      'connection pool-downloads-geo: Downloads the database (connections/pool-downloads-geo.yaml)',
      '',
      'Nothing names it.',
      '',
      'If it goes, 1 record is left with no connection:',
      '  system geo: Geo database (systems/geo.yaml)',
      '',
      'If the record left with no connection goes too, 1 more record is named by nothing:',
      '  owner geo-company: The geo company (owners/geo-company.yaml)',
      '',
      'No other record\'s name, `only` or description holds "Downloads the database" or "pool downloads geo".',
    ]);
  });

  it('says so when nothing is left with no connection, and gives every word found in a text on one line', () => {
    write({
      ...RELAYS,
      'connections/operators-watch-geo.yaml': 'from: operators\nto: geo\ndescription: Through the strelaypoolsrv map, the relay pool server one.\n',
    });
    const lines = run(['uses', 'operators-run-relays']).out.split('\n');
    expect(lines.slice(2, 5)).toEqual(['Nothing names it.', '', 'If it goes, nothing is left with no connection.']);
    expect(run(['uses', 'relay-pool-server']).out.split('\n').slice(-4)).toEqual([
      '3 records may speak of it ("strelaypoolsrv", "relay pool server"). Read each:',
      '  connections/operators-watch-geo.yaml:3:1: `description` says "strelaypoolsrv" and "relay pool server"',
      '  stores/relay-lists.yaml:3:1: `description` says "relay pool server"',
      '  systems/geo.yaml:2:1: `description` says "relay pool server"',
    ]);
  });

  it('shows what is known in a directory with an error, says that other uses may exist, and names nothing as left behind', () => {
    write({ ...RELAYS, 'connections/pool-tests-relays.yaml': 'from: relay-pool-server\nto: [relay-server\n' });
    const result = run(['uses', 'relay-pool-server']);
    expect(result.code).toBe(0);
    expect(result.out.split('\n')).toEqual([
      'app relay-pool-server: strelaypoolsrv (apps/relay-pool-server.yaml)',
      '',
      'Goes with it: nothing is inside it.',
      '',
      '3 connections have one end in it. Each must go or get another end:',
      '  connections/pool-downloads-geo.yaml:1:7: `from`',
      '  connections/pool-keeps-relay-lists.yaml:1:7: `from`',
      '  connections/relay-server-joins-pool.yaml:2:5: `to`',
      '',
      '2 records may speak of it ("strelaypoolsrv", "relay pool server"). Read each:',
      '  stores/relay-lists.yaml:3:1: `description` says "relay pool server"',
      '  systems/geo.yaml:2:1: `description` says "relay pool server"',
      '',
      '1 error, 0 warnings: run `seefore check` to see them. 1 record could not be read, so what it names is not known. ' +
        'Since the directory has errors, other uses may exist, and nothing is named as left behind.',
    ]);
    expect(json(['uses', 'relay-pool-server']).data).toMatchObject({ complete: false, left: [], errors: 1, warnings: 0 });
  });

  it('for a system with parts inside it that speak of it: what stays, then what goes, which a rename leaves', () => {
    write({
      'seefore.yaml': 'format: 1\nname: Shop\n',
      'people/buyer.yaml': 'name: Buyer\ndescription: Shops at Old Shop and pays through Billing.\n',
      'systems/shop.yaml': 'name: Old Shop\n',
      'apps/billing.yaml': 'name: Billing\nin: shop\ndescription: Old Shop sends bills.\n',
      'components/charge.yaml': 'name: Charge\nin: billing\ndescription: Charges a card for Billing, the shop part.\n',
      'connections/charge-sends.yaml': 'from: charge\nto: billing\nname: Bills Old Shop\ndescription: Old Shop inside.\n',
      'connections/buyer-pays.yaml': 'from: buyer\nto: billing\nname: Pays\n',
    });
    expect(run(['uses', 'shop']).out.split('\n')).toEqual([
      'system shop: Old Shop (systems/shop.yaml)',
      '',
      'Goes with it: 2 records inside it, and 1 connection with both ends in it:',
      '  app billing: Billing (apps/billing.yaml)',
      '    component charge: Charge (components/charge.yaml)',
      '  connection charge-sends: Bills Old Shop (connections/charge-sends.yaml)',
      '',
      '1 connection has one end in it. It must go or get another end:',
      '  connections/buyer-pays.yaml:2:5: `to` names `billing`',
      '',
      'If it goes, 1 record is left with no connection:',
      '  person buyer: Buyer (people/buyer.yaml)',
      '',
      '1 record may speak of it ("Old Shop", "shop") or of something inside it. Read each:',
      '  people/buyer.yaml:2:1: `description` says "Old Shop" and "Billing"',
      '',
      '3 records that go with it speak of it too. For a rename, read these as well:',
      '  apps/billing.yaml:3:1: `description` says "Old Shop"',
      '  components/charge.yaml:3:1: `description` says "shop"',
      '  connections/charge-sends.yaml:3:1: `name` says "Old Shop"',
      '  connections/charge-sends.yaml:4:1: `description` says "Old Shop"',
    ]);
    // With nothing that stays speaking of it, the first sentence says so of what stays alone.
    write({ 'people/buyer.yaml': 'name: Buyer\n' });
    expect(run(['uses', 'shop']).out).toContain(
      'No name, `only` or description of a record that stays holds "Old Shop" or "shop", or the name or the id of anything inside it.\n\n' +
        '3 records that go with it speak of it too. For a rename, read these as well:',
    );
    expect(json(['uses', 'shop']).data.mentions.map((mention) => `${mention.record} ${mention.goes}`)).toEqual([
      'billing true',
      'charge true',
      'charge-sends true',
      'charge-sends true',
    ]);
  });

  it('says how a short name and a short id were looked for', () => {
    write({
      'seefore.yaml': 'format: 1\nname: Tools\n',
      'systems/compiler.yaml': 'name: Compiler\ndescription: Compiles Go. Builds must go through it.\n',
      'technologies/go.yaml': 'name: Go\n',
      'owners/ux.yaml': 'name: Design team\n',
    });
    expect(run(['uses', 'go']).out.split('\n').slice(-4)).toEqual([
      '1 record may speak of it ("Go"). Read each:',
      '  systems/compiler.yaml:2:1: `description` says "Go"',
      '',
      'A name of one or two characters is looked for as it is written, capitals and all, and an id that short is not looked for.',
    ]);
    expect(run(['uses', 'ux']).out.split('\n').slice(-3)).toEqual([
      'No other record\'s name, `only` or description holds "Design team".',
      '',
      'An id of one or two characters is not looked for.',
    ]);
  });

  it('shows a place that names it where it may not be named at its own field, under a line of its own, and asks for no edit that would not mend it', () => {
    write({ ...RELAYS, 'connections/run-by-maintainers.yaml': 'from: relay-server\nto: maintainers\n' });
    expect(run(['uses', 'maintainers']).out.split('\n').slice(2, 8)).toEqual([
      '1 record names it in `owner`. It must name another in its place, or leave it out:',
      '  systems/sync.yaml:2:8: `owner`',
      '',
      '1 reference names it in a field that may not hold it. It is a reference to mend, as `seefore check` reports:',
      '  connections/run-by-maintainers.yaml:2:5: `to`',
      '',
    ]);
  });

  it('does not say that a connection passes through a technology that `via` names, which is a reference to mend', () => {
    write({ ...RELAYS, 'connections/operators-run-relays.yaml': 'from: operators\nto: relay-server\nvia: [https, geoip]\nname: Run\n' }, 'repo');
    const lines = run(['uses', 'https', '--workdir=repo']).out.split('\n');
    expect(lines.slice(2, 9)).toEqual([
      '2 records name it in `technology`. Each must name another in its place, or leave it out:',
      '  repo/connections/pool-downloads-geo.yaml:4:14: `technology`',
      '  repo/connections/relay-server-joins-pool.yaml:4:14: `technology`',
      '',
      '1 reference names it in a field that may not hold it. It is a reference to mend, as `seefore check --workdir=repo` reports:',
      '  repo/connections/operators-run-relays.yaml:3:7: `via`',
      '',
    ]);
    expect(lines.join('\n')).not.toContain('through it');
    // A record of a kind that nothing may name is named only where it may not be, so "nothing names it" is not said.
    write({ 'connections/geo-runs.yaml': 'from: pool-downloads-geo\nto: geo\n' }, 'repo');
    expect(run(['uses', 'pool-downloads-geo', '--workdir=repo']).out.split('\n').slice(2, 5)).toEqual([
      '1 reference names it in a field that may not hold it. It is a reference to mend, as `seefore check --workdir=repo` reports:',
      '  repo/connections/geo-runs.yaml:1:7: `from`',
      '',
    ]);
  });

  it('says that other uses may exist when a file was not read, though there is no error', () => {
    write({ ...RELAYS, 'connection/pool-tests-relays.yaml': 'from: relay-pool-server\nto: relay-server\n' });
    expect(run(['uses', 'relay-pool-server']).out.split('\n').at(-1)).toBe(
      '0 errors, 1 warning: run `seefore check` to see them. Since not every file was read, other uses may exist, and nothing is named as left behind.',
    );
  });
});

describe('seefore uses, for what a connection passes through', () => {
  /** A site whose pages are reached through a balancer, an ingress and a part of another app. */
  const ROUTES: Readonly<Record<string, string>> = {
    'seefore.yaml': 'format: 1\nname: Routes\n',
    'people/visitor.yaml': 'name: Visitor\n',
    'people/operator.yaml': 'name: Operator\n',
    'systems/site.yaml': 'name: Site\n',
    'apps/web.yaml': 'name: Web\nin: site\n',
    'apps/workhorse.yaml': 'name: Workhorse\nin: site\n',
    'components/router.yaml': 'name: Router\nin: workhorse\n',
    'infrastructure/balancer.yaml': 'name: Balancer\n',
    'infrastructure/ingress.yaml': 'name: Ingress\ntechnology: [nginx]\n',
    'connections/visitor-reads-pages.yaml': 'from: visitor\nto: web\nvia: [balancer, ingress, router]\nname: Reads the pages\n',
    'connections/workhorse-asks-web.yaml': 'from: workhorse\nto: web\nname: Asks for the size of a file\n',
    'connections/operator-reloads-ingress.yaml': 'from: operator\nto: ingress\nname: Reloads it\n',
    'technologies/nginx.yaml': 'name: nginx\n',
  };

  it('puts a connection that passes through the thing, or anything in it, under what must change, apart from those with an end in it', () => {
    write(ROUTES);
    expect(run(['uses', 'workhorse']).out.split('\n')).toEqual([
      'app workhorse: Workhorse (apps/workhorse.yaml)',
      '',
      'Goes with it: 1 record inside it:',
      '  component router: Router (components/router.yaml)',
      '',
      '1 connection has one end in it. It must go or get another end:',
      '  connections/workhorse-asks-web.yaml:1:7: `from`',
      '',
      `1 connection passes through it. It must ${ROUTE}:`,
      '  connections/visitor-reads-pages.yaml:3:26: `via` names `router`',
      '',
      'If the connection with one end in it goes, nothing is left with no connection.',
      '',
      'No other record\'s name, `only` or description holds "workhorse", or the name or the id of anything inside it.',
    ]);
  });

  it('leaves behind a piece of infrastructure that only the connections that go pass through', () => {
    write(ROUTES);
    expect(run(['uses', 'web']).out.split('\n').slice(2)).toEqual([
      'Goes with it: nothing is inside it.',
      '',
      '2 connections have one end in it. Each must go or get another end:',
      '  connections/visitor-reads-pages.yaml:2:5: `to`',
      '  connections/workhorse-asks-web.yaml:2:5: `to`',
      '',
      'If they go, 3 records are left with no connection:',
      '  person visitor: Visitor (people/visitor.yaml)',
      '  system site: Site (systems/site.yaml)',
      '  app workhorse: Workhorse (apps/workhorse.yaml)',
      '',
      '1 record is named by nothing but it and those connections:',
      '  piece of infrastructure balancer: Balancer (infrastructure/balancer.yaml)',
      '',
      'No other record\'s name, `only` or description holds "web".',
    ]);
    expect(json(['uses', 'web']).data.left.map((one) => `${one.record.id} ${one.reason} ${one.assumes}`)).toContain('balancer no-user connections-go');
  });

  it('works on a piece of infrastructure as on any record', () => {
    write(ROUTES);
    expect(run(['uses', 'ingress']).out.split('\n')).toEqual([
      'piece of infrastructure ingress: Ingress (infrastructure/ingress.yaml)',
      '',
      '1 connection has one end in it. It must go or get another end:',
      '  connections/operator-reloads-ingress.yaml:2:5: `to`',
      '',
      `1 connection passes through it. It must ${ROUTE}:`,
      '  connections/visitor-reads-pages.yaml:3:17: `via`',
      '',
      'If the connection with one end in it goes, 1 record is left with no connection:',
      '  person operator: Operator (people/operator.yaml)',
      '',
      '1 record is named by nothing but it and the connection with one end in it:',
      '  technology nginx: nginx (technologies/nginx.yaml)',
      '',
      'No other record\'s name, `only` or description holds "ingress".',
    ]);
    // One that only connections pass through has nothing else to say of them.
    expect(run(['uses', 'balancer']).out.split('\n').slice(2, 5)).toEqual([
      `1 connection passes through it. It must ${ROUTE}:`,
      '  connections/visitor-reads-pages.yaml:3:7: `via`',
      '',
    ]);
  });

  it('keeps an app that a connection which stays passes through, and what it is in, when its last connection goes', () => {
    write(ROUTES);
    expect(run(['uses', 'workhorse-asks-web']).out.split('\n').slice(2, 5)).toEqual(['Nothing names it.', '', 'If it goes, nothing is left with no connection.']);
  });

  it('names what only a piece of infrastructure left named by nothing names, if that goes too', () => {
    write({
      'seefore.yaml': 'format: 1\nname: Sole\n',
      'systems/hub.yaml': 'name: Hub\n',
      'systems/peer.yaml': 'name: Peer\n',
      'apps/reader.yaml': 'name: Reader\nin: hub\n',
      'apps/other.yaml': 'name: Other\nin: hub\n',
      'infrastructure/unused.yaml': 'name: Unused\nowner: platform\ntechnology: [nginx]\n',
      'connections/other-asks-reader.yaml': 'from: other\nto: reader\n',
      'connections/reader-reads.yaml': 'from: reader\nto: peer\nvia: [unused]\n',
      'owners/platform.yaml': 'name: Platform\n',
      'technologies/nginx.yaml': 'name: NGINX\n',
    });
    expect(run(['uses', 'reader-reads']).out.split('\n').slice(4, 14)).toEqual([
      'If it goes, 1 record is left with no connection:',
      '  system peer: Peer (systems/peer.yaml)',
      '',
      '1 record is named by nothing but it:',
      '  piece of infrastructure unused: Unused (infrastructure/unused.yaml)',
      '',
      'If the record left with no connection and the piece of infrastructure named by nothing go too, 2 more records are named by nothing:',
      '  owner platform: Platform (owners/platform.yaml)',
      '  technology nginx: NGINX (technologies/nginx.yaml)',
      '',
    ]);
    // With the peer kept by another connection, only the piece of infrastructure is taken to go.
    write({ 'connections/other-asks-peer.yaml': 'from: other\nto: peer\n' });
    expect(run(['uses', 'reader-reads']).out).toContain('If the piece of infrastructure named by nothing goes too, 2 more records are named by nothing:');
  });
});

describe('seefore uses, for a connection with one end in the thing that also passes through it', () => {
  /** A system whose two apps a connection starts at and passes through, and a route through both. */
  const BOTH: Readonly<Record<string, string>> = {
    'seefore.yaml': 'format: 1\nname: Both\n',
    'systems/desk.yaml': 'name: Desk\n',
    'systems/middle.yaml': 'name: Middle\n',
    'systems/service.yaml': 'name: Service\n',
    'apps/mux.yaml': 'name: Mux\nin: middle\n',
    'apps/gateway.yaml': 'name: Gateway\nin: middle\n',
    'components/adapter.yaml': 'name: Adapter\nin: gateway\n',
    'infrastructure/balancer.yaml': 'name: Balancer\n',
    'connections/gateway-checks-mux.yaml': 'from: gateway\nto: mux\n',
    'connections/dual.yaml': 'from: mux\nto: service\nvia: [adapter]\n',
    'connections/route.yaml': 'from: desk\nto: service\nvia: [adapter, mux, balancer]\n',
  };

  it('says both edits, and the edits it says pass `seefore check`', () => {
    write(BOTH);
    expect(run(['uses', 'middle']).out.split('\n').slice(8, 17)).toEqual([
      `1 connection has one end in it and passes through it too. It must go or get another end. If it gets another end, it must also ${ROUTE}:`,
      '  connections/dual.yaml:1:7: `from` names `mux`',
      '  connections/dual.yaml:3:7: `via` names `adapter`',
      '',
      `1 connection passes through it. It must ${ROUTE}:`,
      '  connections/route.yaml:3:7: `via` names `adapter`',
      '  connections/route.yaml:3:16: `via` names `mux`',
      '',
      'If the connection with one end in it goes, nothing is left with no connection.',
    ]);
    // Keep the exchange: remove the thing and what goes with it, give it another end, and leave out what goes from each route.
    for (const file of ['systems/middle.yaml', 'apps/mux.yaml', 'apps/gateway.yaml', 'components/adapter.yaml', 'connections/gateway-checks-mux.yaml']) rmSync(join(root, file));
    write({ 'connections/dual.yaml': 'from: desk\nto: service\n', 'connections/route.yaml': 'from: desk\nto: service\nvia: [balancer]\n' });
    expect(run(['check'])).toMatchObject({ code: 0 });
    expect(run(['check']).out.split('\n').at(-1)).toBe('5 records read. No problems.');
  });

  it('says it for each such connection when there are more than one', () => {
    write({ ...BOTH, 'connections/twice.yaml': 'from: service\nto: mux\nvia: [adapter, balancer]\n' });
    expect(run(['uses', 'middle']).out.split('\n')[8]).toBe(
      `2 connections have one end in it and pass through it too. Each must go or get another end. One that gets another end must also ${ROUTE}:`,
    );
  });
});

describe('seefore uses, for what is in what and a condition', () => {
  /** An archive whose Desk, there only in the desk edition, keeps its drafts, with an ingress that is part of the archive. */
  const DESK: Readonly<Record<string, string>> = {
    'seefore.yaml': 'format: 1\nname: Desk\n',
    'people/staff.yaml': 'name: Staff\n',
    'systems/archive.yaml': 'name: Archive\n',
    'apps/desk.yaml': 'name: Desk\nin: archive\nonly: in the desk edition\n',
    'apps/worker.yaml': 'name: Worker\nin: archive\nonly: when Desk saves in the background\n',
    'components/editor.yaml': 'name: Editor\nin: desk\n',
    'stores/drafts.yaml': 'name: Drafts\nin: desk\n',
    'stores/records.yaml': 'name: Records\nin: archive\n',
    'infrastructure/ingress.yaml': 'name: Ingress\nin: archive\n',
    'connections/staff-uses-desk.yaml': 'from: staff\nto: desk\nvia: [ingress]\nname: Edits records\n',
    'connections/editor-keeps-drafts.yaml': 'from: editor\nto: drafts\naccess: read-write\nname: Keeps edits not yet saved\n',
    'connections/desk-tells-staff.yaml': 'from: desk\nto: staff\nopens: to\nname: Says when a record is saved\n',
    'connections/worker-saves-records.yaml': 'from: worker\nto: records\naccess: write\nname: Saves the records\n',
  };

  it('says how many records have its condition from it, and puts the store it keeps with it', () => {
    write(DESK);
    expect(run(['uses', 'desk']).out.split('\n')).toEqual([
      'app desk: Desk (apps/desk.yaml)',
      '',
      '2 records inside it and 3 connections that start or end at it or at something inside it have its condition from it: ' +
        'only in the desk edition. A connection that gets another end no longer has it: give it that `only` if it still holds.',
      '',
      'Goes with it: 2 records inside it, and 1 connection with both ends in it:',
      '  component editor: Editor (components/editor.yaml)',
      '  store drafts: Drafts (stores/drafts.yaml)',
      '  connection editor-keeps-drafts: Keeps edits not yet saved (connections/editor-keeps-drafts.yaml)',
      '',
      '2 connections have one end in it. Each must go or get another end:',
      '  connections/desk-tells-staff.yaml:1:7: `from`',
      '  connections/staff-uses-desk.yaml:2:5: `to`',
      '',
      'If they go, 1 record is left with no connection:',
      '  person staff: Staff (people/staff.yaml)',
      '',
      '1 record is named by nothing but it and those connections:',
      '  piece of infrastructure ingress: Ingress (infrastructure/ingress.yaml)',
      '',
      // A condition may speak of a thing, as a name or a description may.
      '1 record may speak of it ("desk") or of something inside it. Read each:',
      '  apps/worker.yaml:3:1: `only` says "Desk"',
    ]);
  });

  it('puts a piece of infrastructure with its system, and says nothing of a condition where nothing has one from it', () => {
    write(DESK);
    const lines = run(['uses', 'archive']).out.split('\n');
    expect(lines.slice(0, 9)).toEqual([
      'system archive: Archive (systems/archive.yaml)',
      '',
      'Goes with it: 6 records inside it, and 2 connections with both ends in it:',
      '  app desk: Desk (apps/desk.yaml)',
      '    component editor: Editor (components/editor.yaml)',
      '    store drafts: Drafts (stores/drafts.yaml)',
      '  app worker: Worker (apps/worker.yaml)',
      '  store records: Records (stores/records.yaml)',
      '  piece of infrastructure ingress: Ingress (infrastructure/ingress.yaml)',
    ]);
    expect(lines.join('\n')).not.toContain('condition');
    // A condition that only the record itself holds is said nowhere else.
    write({ 'apps/worker.yaml': 'name: Worker\nin: archive\nonly: when Desk saves in the background\n', 'connections/worker-saves-records.yaml': 'from: staff\nto: records\n' });
    expect(run(['uses', 'worker']).out).not.toContain('its condition');
  });

  it('says it of one connection, for a thing that holds nothing', () => {
    write({ ...DESK, 'stores/records.yaml': 'name: Records\nin: archive\nonly: where records are kept\n' });
    expect(run(['uses', 'records']).out.split('\n')[2]).toBe(
      '1 connection that starts or ends at it has its condition from it: only where records are kept. ' +
        'A connection that gets another end no longer has it: give it that `only` if it still holds.',
    );
    expect(json(['uses', 'records']).data.condition).toEqual({ only: 'where records are kept', parts: [], connections: ['worker-saves-records'] });
  });
});

describe('an id that more than one record has', () => {
  const CLASH = {
    'seefore.yaml': 'format: 1\nname: Clash\n',
    'owners/twin.yaml': 'name: Owner twin\n',
    'systems/twin.yaml': 'name: System twin\n',
    'systems/buyer.yaml': 'name: Buyer\nowner: twin\n',
    'connections/meet.yaml': 'from: buyer\nto: twin\n',
  };
  const MESSAGE =
    '2 records have the id `twin`: `owners/twin.yaml` and `systems/twin.yaml`. A record that names `twin` could mean either, ' +
    'so what a removal or a rename would touch cannot be told. One of them must get another id first.';

  it('gives no lists, names both files, and ends with exit code 2', () => {
    write(CLASH);
    expect(run(['uses', 'twin'])).toEqual({ code: 2, out: '', err: `seefore: ${MESSAGE}` });
    const { code, data } = json(['uses', 'twin']);
    expect(code).toBe(2);
    expect((data as unknown as Failure).error).toEqual({ code: 'id-twice', message: MESSAGE });
  });

  it('names each file from where the command was run, and says when there are more than two', () => {
    write({ ...CLASH, 'technologies/twin.yaml': 'name: Tech twin\n' }, 'repo');
    expect(run(['uses', 'twin', '--workdir=repo']).err).toBe(
      'seefore: 3 records have the id `twin`: `repo/owners/twin.yaml`, `repo/systems/twin.yaml` and `repo/technologies/twin.yaml`. ' +
        'A record that names `twin` could mean any of them, so what a removal or a rename would touch cannot be told. All of them but one must get another id first.',
    );
  });
});

describe('seefore uses, as data', () => {
  it('keeps every key it had, and gives the four lists, the count for an owner and whether it is complete', () => {
    write(RELAYS);
    const { code, data } = json(['uses', 'relay-pool-server']);
    expect(code).toBe(0);
    expect(Object.keys(data)).toEqual([
      'directory',
      'record',
      'inside',
      'references',
      'goes',
      'changes',
      'left',
      'inherited',
      'mentions',
      'complete',
      'errors',
      'warnings',
    ]);
    expect(data.changes.map((change) => change.record.id)).toEqual(['pool-downloads-geo', 'pool-keeps-relay-lists', 'relay-server-joins-pool']);
    expect(data.left).toEqual([
      { record: { id: 'geo', family: 'systems', file: 'systems/geo.yaml', name: 'Geo database' }, reason: 'no-connection', assumes: 'connections-go' },
      { record: { id: 'relay-lists', family: 'stores', file: 'stores/relay-lists.yaml', name: 'Relay lists', in: 'sync' }, reason: 'no-connection', assumes: 'connections-go' },
      { record: { id: 'geoip', family: 'technologies', file: 'technologies/geoip.yaml', name: 'GeoIP' }, reason: 'no-user', assumes: 'connections-go' },
      { record: { id: 'https', family: 'technologies', file: 'technologies/https.yaml', name: 'HTTPS' }, reason: 'no-user', assumes: 'connections-go' },
      { record: { id: 'geo-company', family: 'owners', file: 'owners/geo-company.yaml', name: 'The geo company' }, reason: 'no-user', assumes: 'left-go' },
    ]);
    expect(data.mentions).toEqual([
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
    expect(data).toMatchObject({ goes: [], inherited: 0, complete: true });
    expect(json(['uses', 'maintainers']).data.inherited).toBe(3);
  });
});

describe('paths', () => {
  it('are given from where the command was run, and in full when they would climb out of it', () => {
    write(RELAYS, 'repo/architecture');
    write({ 'elsewhere/x.txt': '' });
    expect(run(['uses', 'geoip', '--workdir=repo/architecture']).out.split('\n')[0]).toBe('technology geoip: GeoIP (repo/architecture/technologies/geoip.yaml)');
    const full = join(root, 'repo/architecture');
    expect(run(['uses', 'geoip', '--workdir=../repo/architecture'], 'elsewhere').out.split('\n').slice(0, 4)).toEqual([
      `technology geoip: GeoIP (${full}/technologies/geoip.yaml)`,
      '',
      '1 record names it in `technology`. It must name another in its place, or leave it out:',
      `  ${full}/apps/relay-pool-server.yaml:4:18: \`technology\``,
    ]);
    // From inside the directory, a path does not climb out.
    expect(run(['uses', 'geoip'], 'repo/architecture/apps').out.split('\n')[3]).toBe('  relay-pool-server.yaml:4:18: `technology`');
  });

  it('name the directory in a command to run next, when it was named to start with, so that the command works from there', () => {
    const broken = { ...RELAYS, 'connections/pool-tests-relays.yaml': 'from: relay-pool-server\nto: [relay-server\n' };
    write(broken, 'repo/architecture');
    write({ 'elsewhere/x.txt': '' });
    const full = join(root, 'repo/architecture');
    const brief = (out: string): string | undefined => out.split('\n').at(-1)?.split('. ')[0];
    expect(brief(run(['uses', 'geoip', '--workdir=../repo/architecture'], 'elsewhere').out)).toBe(`1 error, 0 warnings: run \`seefore check --workdir=${full}\` to see them`);
    expect(brief(run(['uses', 'geoip', '--workdir=repo/architecture']).out)).toBe('1 error, 0 warnings: run `seefore check --workdir=repo/architecture` to see them');
    // From the directory itself, or from inside it with no --workdir, the command finds it alone.
    expect(brief(run(['uses', 'geoip', '--workdir=.'], 'repo/architecture').out)).toBe('1 error, 0 warnings: run `seefore check` to see them');
    expect(brief(run(['uses', 'geoip'], 'repo/architecture/apps').out)).toBe('1 error, 0 warnings: run `seefore check` to see them');
    expect(run(['uses', 'basket', '--workdir=../repo/architecture'], 'elsewhere').err).toBe(
      `seefore: No record has the id \`basket\`. Run \`seefore list --workdir=${full}\` to see the records there are. ` +
        `This directory has errors too: \`seefore check --workdir=${full}\` shows them.`,
    );
  });

  it('quote the directory for the shell in a command to run next', () => {
    write({ ...RELAYS, 'connection/typo.yaml': 'from: geo\nto: sync\n' }, 'my repo/architecture');
    expect(run(['uses', 'geoip', '--workdir=my repo/architecture']).out.split('\n').at(-1)).toMatch(
      /^0 errors, 1 warning: run `seefore check --workdir="my repo\/architecture"` to see them\./,
    );
  });

  it('are in full for `seefore check` too, for a directory elsewhere', () => {
    write({ 'repo/architecture/seefore.yaml': 'format: 1\n', 'elsewhere/x.txt': '' });
    const result = run(['check', '--workdir=../repo/architecture'], 'elsewhere');
    expect(result.out).toContain(`${join(root, 'repo/architecture')}/seefore.yaml:1:1: error: \`name\` is missing from the marker file.`);
    expect((JSON.parse(run(['check', '--workdir=../repo/architecture', '--json'], 'elsewhere').out) as CheckResult).problems[0]?.file).toBe('seefore.yaml');
  });
});
