import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult } from '../src/check.ts';
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
      'No other record\'s name or description holds "maintainers".',
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
      'No other record\'s name or description holds "geoip".',
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
      'No other record\'s name or description holds "Downloads the database" or "pool downloads geo".',
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

  it('says that other uses may exist when a file was not read, though there is no error', () => {
    write({ ...RELAYS, 'connection/pool-tests-relays.yaml': 'from: relay-pool-server\nto: relay-server\n' });
    expect(run(['uses', 'relay-pool-server']).out.split('\n').at(-1)).toBe(
      '0 errors, 1 warning: run `seefore check` to see them. Since not every file was read, other uses may exist, and nothing is named as left behind.',
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
      { file: 'stores/relay-lists.yaml', line: 3, column: 1, record: 'relay-lists', field: 'description', names: 'relay-pool-server', words: ['relay pool server'] },
      { file: 'systems/geo.yaml', line: 2, column: 1, record: 'geo', field: 'description', names: 'relay-pool-server', words: ['relay pool server'] },
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

  it('are in full for `seefore check` too, for a directory elsewhere', () => {
    write({ 'repo/architecture/seefore.yaml': 'format: 1\n', 'elsewhere/x.txt': '' });
    const result = run(['check', '--workdir=../repo/architecture'], 'elsewhere');
    expect(result.out).toContain(`${join(root, 'repo/architecture')}/seefore.yaml:1:1: error: \`name\` is missing from the marker file.`);
    expect((JSON.parse(run(['check', '--workdir=../repo/architecture', '--json'], 'elsewhere').out) as CheckResult).problems[0]?.file).toBe('seefore.yaml');
  });
});
