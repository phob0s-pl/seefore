import { describe, expect, it } from 'vitest';
import { C4_CODES, c4NotRun, c4Of } from '../src/c4.ts';
import type { C4Code, C4Report } from '../src/c4.ts';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import { emptyModel } from '../src/model.ts';
import type { Problem } from '../src/problem.ts';

const MARKER = 'format: 1\nname: Shop\n';

/** A source directory made of these files, with its marker. */
function directory(files: Record<string, string>): SourceFile[] {
  return Object.entries({ 'seefore.yaml': MARKER, ...files }).map(([path, text]) => ({ path, text }));
}

/** The report of the C4 checks on these files. */
function c4(files: Record<string, string>, problems: readonly Problem[] = []): C4Report {
  return load(directory(files), { problems }).c4;
}

/** What one check found, as `file:line:column message`. */
function found(report: C4Report, code: C4Code): string[] {
  return report[code].findings.map((finding) => `${finding.file}:${finding.line}:${finding.column} ${finding.message}`);
}

/** The files of what one check found. */
function files(report: C4Report, code: C4Code): string[] {
  return report[code].findings.map((finding) => finding.file);
}

/** How many records each check looked at, in the order of the set. */
function checked(report: C4Report): (number | null)[] {
  return C4_CODES.map((code) => report[code].checked);
}

/** A shop that lacks nothing the checks ask for: each thing says what it is for, each part is built with something, each connection is named, and each thing is reached. */
const WHOLE: Record<string, string> = {
  'people/customer.yaml': 'name: Customer\ndescription: Buys.\n',
  'systems/shop.yaml': 'name: Shop\ndescription: Sells.\n',
  'apps/api.yaml': 'name: API\nin: shop\ndescription: Takes orders.\ntechnology: [go]\n',
  'stores/orders.yaml': 'name: Orders\nin: shop\ndescription: Holds orders.\ntechnology: [go]\n',
  'components/checkout.yaml': 'name: Checkout\nin: api\ndescription: Takes a basket.\ntechnology: [go]\n',
  'infrastructure/proxy.yaml': 'name: Proxy\ndescription: Passes calls on.\n',
  'connections/customer-buys.yaml': 'from: customer\nto: checkout\nvia: [proxy]\nname: Buys\n',
  'connections/checkout-writes.yaml': 'from: checkout\nto: orders\nname: Writes each order\n',
  'owners/team.yaml': 'name: Team\n',
  'technologies/go.yaml': 'name: Go\n',
};

describe('the C4 checks on a model that lacks nothing', () => {
  it('find nothing, and say how many records each looked at', () => {
    const loaded = load(directory(WHOLE));
    expect(loaded.problems).toEqual([]);
    expect(loaded.c4.complete).toBe(true);
    // Six things; three parts; two connections, both named; six things again.
    expect(checked(loaded.c4)).toEqual([6, 3, 2, 2, 6]);
    for (const code of C4_CODES) expect(loaded.c4[code].findings, code).toEqual([]);
  });

  it('give each check its kind: a note, and a warning for the bare "Uses"', () => {
    const report = c4(WHOLE);
    expect(C4_CODES.map((code) => report[code].severity)).toEqual(['note', 'note', 'note', 'warning', 'note']);
  });

  it('look at nothing in a model with no records, and say so', () => {
    const report = c4({});
    expect(report.complete).toBe(true);
    expect(checked(report)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('a description', () => {
  it('is asked of every thing, by the noun of its kind, at the start of its file', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'stores/orders.yaml': 'name: Orders\nin: shop\n',
      'components/checkout.yaml': 'name: Checkout\nin: api\n',
      'infrastructure/proxy.yaml': 'name: Proxy\n',
    });
    expect(report['description-missing'].checked).toBe(6);
    const said = (noun: string) => `This ${noun} has no description. Say what it is for, when that is known.`;
    expect(found(report, 'description-missing')).toEqual([
      `apps/api.yaml:1:1 ${said('app')}`,
      `components/checkout.yaml:1:1 ${said('component')}`,
      `infrastructure/proxy.yaml:1:1 ${said('piece of infrastructure')}`,
      `people/fan.yaml:1:1 ${said('person')}`,
      `stores/orders.yaml:1:1 ${said('store')}`,
      `systems/shop.yaml:1:1 ${said('system')}`,
    ]);
  });

  it('is not asked of a connection, an owner or a technology', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\ndescription: Watches.\n',
      'connections/fan-to-fan.yaml': 'from: fan\nto: fan\nname: Waves\n',
      'owners/team.yaml': 'name: Team\n',
      'technologies/go.yaml': 'name: Go\n',
    });
    expect(report['description-missing']).toEqual({ severity: 'note', checked: 1, findings: [] });
  });
});

describe('a technology', () => {
  it('is asked of every app, store and component', () => {
    const report = c4({
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'stores/orders.yaml': 'name: Orders\nin: api\n',
      'components/checkout.yaml': 'name: Checkout\nin: api\n',
    });
    expect(report['technology-missing'].checked).toBe(3);
    const said = (noun: string) => `This ${noun} names no technology. Name what it is built with, if the facts say.`;
    expect(found(report, 'technology-missing')).toEqual([
      `apps/api.yaml:1:1 ${said('app')}`,
      `components/checkout.yaml:1:1 ${said('component')}`,
      `stores/orders.yaml:1:1 ${said('store')}`,
    ]);
  });

  it('is not asked of a person, a system, a piece of infrastructure or a connection', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'infrastructure/proxy.yaml': 'name: Proxy\nin: shop\n',
      'connections/fan-calls-shop.yaml': 'from: fan\nto: shop\nvia: [proxy]\nname: Calls\n',
    });
    expect(report['technology-missing']).toEqual({ severity: 'note', checked: 0, findings: [] });
  });

  it('is not taken from what a part is in: a component of an app that names one still names none', () => {
    const report = c4({
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\ntechnology: [go]\n',
      'components/checkout.yaml': 'name: Checkout\nin: api\n',
      'technologies/go.yaml': 'name: Go\n',
    });
    expect(files(report, 'technology-missing')).toEqual(['components/checkout.yaml']);
  });
});

describe('a name for a connection', () => {
  it('is asked of every connection, at the start of its file', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'connections/fan-to-shop.yaml': 'from: fan\nto: shop\ndescription: Nobody has said what for.\n',
      'connections/fan-buys.yaml': 'from: fan\nto: shop\nname: Buys\n',
    });
    expect(report['connection-unnamed'].checked).toBe(2);
    expect(found(report, 'connection-unnamed')).toEqual([
      'connections/fan-to-shop.yaml:1:1 This connection has no name. Say what the one that acts does, when that is known.',
    ]);
  });

  it('is not asked of a thing', () => {
    const report = c4({ 'people/fan.yaml': 'name: Fan\n' });
    expect(report['connection-unnamed']).toEqual({ severity: 'note', checked: 0, findings: [] });
  });
});

describe('a name that says more than "Uses"', () => {
  /** A connection named this, as its file writes the name. */
  const named = (name: string): Record<string, string> => ({
    'people/fan.yaml': 'name: Fan\n',
    'systems/shop.yaml': 'name: Shop\n',
    'connections/fan-to-shop.yaml': `from: fan\nto: shop\nname: ${name}\n`,
  });

  it.each(['Uses', 'USE', 'use', 'uSeS', '"Uses"'])('is not %s, which warns at the name', (name) => {
    const loaded = load(directory(named(name)));
    const shown = name.replace(/"/g, '');
    const message =
      `This connection is named \`${shown}\`, which says nothing of what is done. Say what the one that acts does. If nobody knows yet, leave \`name\` out.`;
    expect(found(loaded.c4, 'connection-vague')).toEqual([`connections/fan-to-shop.yaml:3:7 ${message}`]);
    // The warning is a problem as any other warning is.
    expect(loaded.problems).toEqual([{ file: 'connections/fan-to-shop.yaml', line: 3, column: 7, severity: 'warning', code: 'connection-vague', message }]);
  });

  it.each([
    'Uses TLS to sign in',
    'Use internal web apps in the browser',
    'Holds seats',
    'Uses.',
    'Used',
    'Reuses',
    'Использует',
    '使う',
    // A letter of another script that folds to an `s` in some case rules is not read as one.
    'Uſes',
  ])('passes %s', (name) => {
    const loaded = load(directory(named(name)));
    expect(loaded.c4['connection-vague']).toEqual({ severity: 'warning', checked: 1, findings: [] });
    expect(loaded.problems).toEqual([]);
  });

  it.each(['" Uses"', '"Uses "', '""'])('leaves %s to the error it has, and counts it nowhere', (name) => {
    const loaded = load(directory(named(name)));
    expect(loaded.problems.map((problem) => `${problem.severity} ${problem.code}`)).toEqual([
      name === '""' ? 'error value-too-small' : 'error value-invalid',
    ]);
    expect(loaded.c4['connection-vague']).toEqual({ severity: 'warning', checked: 0, findings: [] });
    expect(loaded.c4['connection-unnamed']).toEqual({ severity: 'note', checked: 0, findings: [] });
  });

  it('looks only at the connections that have a name', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'connections/fan-to-shop.yaml': 'from: fan\nto: shop\n',
      'connections/fan-uses-shop.yaml': 'from: fan\nto: shop\nname: Uses\n',
      'connections/fan-buys.yaml': 'from: fan\nto: shop\nname: Buys\n',
    });
    expect(report['connection-unnamed'].checked).toBe(3);
    expect(report['connection-vague'].checked).toBe(2);
    expect(files(report, 'connection-vague')).toEqual(['connections/fan-uses-shop.yaml']);
  });

  it('stands among the problems in their order, and is counted as a warning', () => {
    const loaded = load(
      directory({
        'people/fan.yaml': 'name: Fan\n',
        'systems/shop.yaml': 'name: Shop\n',
        'connections/a-uses.yaml': 'from: fan\nto: shop\nname: Uses\n',
        'connections/b-twice.yaml': 'from: fan\nto: shop\nname: Buys\n',
        'connections/c-twice.yaml': 'from: fan\nto: shop\nname: Buys\n',
        'connections/d-use.yaml': 'from: fan\nto: shop\nname: use\n',
      }),
    );
    expect(loaded.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.code}`)).toEqual([
      'connections/a-uses.yaml:3:7 connection-vague',
      'connections/b-twice.yaml:1:1 connection-twice',
      'connections/c-twice.yaml:1:1 connection-twice',
      'connections/d-use.yaml:3:7 connection-vague',
    ]);
  });
});

describe('a field with a wrong value', () => {
  it('has its error, and is in no count', () => {
    const loaded = load(
      directory({
        'people/fan.yaml': 'name: Fan\ndescription: ""\n',
        'systems/shop.yaml': 'name: Shop\ndescription: Sells.\n',
        'apps/api.yaml': 'name: API\nin: shop\ndescription: Takes orders.\ntechnology: []\n',
        'connections/shop-calls.yaml': 'from: shop\nto: api\nname: ""\n',
      }),
    );
    expect(loaded.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual([
      'apps/api.yaml value-too-small',
      'connections/shop-calls.yaml value-too-small',
      'people/fan.yaml value-too-small',
    ]);
    // A record whose file has an error is not in the model, so the checks never see it.
    expect(checked(loaded.c4)).toEqual([1, 0, 0, 0, null]);
    for (const code of C4_CODES) expect(loaded.c4[code].findings, code).toEqual([]);
  });
});

describe('a connection', () => {
  /** A note on a thing that no connection reaches, by the noun of its kind and what it can hold. */
  const alone = (what: string) => `No connection starts or ends at ${what}. That may be right: add one only for an exchange that the facts name.`;

  it('reaches a thing that it starts at, ends at or names only in `via`', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'infrastructure/proxy.yaml': 'name: Proxy\n',
      'systems/gateway.yaml': 'name: Gateway\n',
      'connections/fan-calls-shop.yaml': 'from: fan\nto: shop\nvia: [proxy, gateway]\nname: Calls\n',
    });
    expect(report['element-unconnected']).toEqual({ severity: 'note', checked: 4, findings: [] });
  });

  it('reaches a thing that it goes from and to, and both people of a connection between two', () => {
    const report = c4({
      'people/clerk.yaml': 'name: Clerk\n',
      'people/manager.yaml': 'name: Manager\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/worker.yaml': 'name: Worker\nin: shop\n',
      'connections/clerk-asks-manager.yaml': 'from: clerk\nto: manager\nname: Asks for leave\n',
      'connections/worker-wakes-worker.yaml': 'from: worker\nto: worker\nname: Wakes another copy\n',
    });
    expect(report['element-unconnected'].findings).toEqual([]);
  });

  it('counts one under a condition, and one whose channel the far side opened', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'systems/feed.yaml': 'name: Feed\n',
      'connections/fan-calls-shop.yaml': 'from: fan\nto: shop\nname: Calls\nonly: in the hosted edition\n',
      'connections/feed-tells-shop.yaml': 'from: feed\nto: shop\nopens: to\nname: Tells of news\n',
    });
    expect(report['element-unconnected'].findings).toEqual([]);
  });

  it('reaches a system and an app through what is in them, two levels down, and not a part through its app', () => {
    const parts = {
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'components/checkout.yaml': 'name: Checkout\nin: api\n',
      'stores/cache.yaml': 'name: Cache\nin: api\n',
    };
    const toComponent = c4({ ...parts, 'connections/fan-buys.yaml': 'from: fan\nto: checkout\nname: Buys\n' });
    expect(found(toComponent, 'element-unconnected')).toEqual([`stores/cache.yaml:1:1 ${alone('this store')}`]);
    const toStore = c4({ ...parts, 'connections/fan-reads.yaml': 'from: fan\nto: cache\nname: Reads the cache\n' });
    expect(found(toStore, 'element-unconnected')).toEqual([`components/checkout.yaml:1:1 ${alone('this component, and none passes through it')}`]);
  });

  it('counts a part with no connection of its own, though its system has many', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/shop.yaml': 'name: Shop\n',
      'apps/api.yaml': 'name: API\nin: shop\n',
      'infrastructure/balancer.yaml': 'name: Balancer\nin: shop\n',
      'connections/fan-buys.yaml': 'from: fan\nto: shop\nname: Buys\n',
      'connections/fan-pays.yaml': 'from: fan\nto: shop\nname: Pays\n',
    });
    expect(found(report, 'element-unconnected')).toEqual([
      `apps/api.yaml:1:1 ${alone('this app or at anything in it, and none passes through it')}`,
      `infrastructure/balancer.yaml:1:1 ${alone('this piece of infrastructure, and none passes through it')}`,
    ]);
  });

  it('counts an external system with no part and no connection, and a person who does nothing yet', () => {
    const report = c4({
      'people/fan.yaml': 'name: Fan\n',
      'systems/partner.yaml': 'name: Partner\nexternal: true\n',
    });
    expect(found(report, 'element-unconnected')).toEqual([
      `people/fan.yaml:1:1 ${alone('this person')}`,
      `systems/partner.yaml:1:1 ${alone('this system or at anything in it, and none passes through it')}`,
    ]);
  });

  it('is not made by being in something, by an owner, by words or by a view', () => {
    const report = c4({
      'systems/shop.yaml': 'name: Shop\nowner: team\n',
      'apps/api.yaml': 'name: API\nin: shop\ndescription: Calls Shop and Billing.\n',
      'systems/billing.yaml': 'name: Billing\nowner: team\n',
      'owners/team.yaml': 'name: Team\n',
    });
    // The shop has a container view, with the app in it.
    expect(files(report, 'element-unconnected')).toEqual(['apps/api.yaml', 'systems/billing.yaml', 'systems/shop.yaml']);
    expect(report['element-unconnected'].checked).toBe(3);
  });
});

describe('a directory that was not read in full', () => {
  const SOUND: Record<string, string> = {
    'people/fan.yaml': 'name: Fan\n',
    'systems/shop.yaml': 'name: Shop\n',
    'apps/api.yaml': 'name: API\nin: shop\n',
    'connections/fan-calls-api.yaml': 'from: fan\nto: api\nname: Calls\n',
    'connections/fan-uses-shop.yaml': 'from: fan\nto: shop\nname: Uses\n',
  };

  /** That the check of a connection was not run, and the other four ran on what was read. */
  const notRunAlone = (report: C4Report, connections: number) => {
    expect(report.complete).toBe(false);
    expect(report['element-unconnected']).toEqual({ severity: 'note', checked: null, findings: [] });
    expect(checked(report)).toEqual([3, 1, connections, connections, null]);
    expect(files(report, 'technology-missing')).toEqual(['apps/api.yaml']);
  };

  it('is read in full when nothing is wrong but warnings', () => {
    const report = c4(SOUND);
    expect(report.complete).toBe(true);
    expect(report['element-unconnected'].checked).toBe(3);
  });

  it('runs the check of a connection only then: an error in the file of one connection leaves what it touched looking alone', () => {
    const report = c4({ ...SOUND, 'connections/fan-calls-api.yaml': 'from: fan\nto: api\nname: Calls\nlabel: Calls\n' });
    notRunAlone(report, 1);
    expect(files(report, 'connection-vague')).toEqual(['connections/fan-uses-shop.yaml']);
  });

  it('is not, with a YAML file that is not read', () => {
    const report = c4({ ...SOUND, 'notes/plan.yaml': 'a: 1\n' });
    notRunAlone(report, 2);
  });

  it('is not, with a link that was not followed, or a file that could not be read, as the reader of the disk says', () => {
    const link: Problem = { file: 'apps/linked.yaml', line: 1, column: 1, severity: 'warning', code: 'link-not-followed', message: 'Not followed.' };
    notRunAlone(c4(SOUND, [link]), 2);
    const folder: Problem = { file: 'stores', line: 1, column: 1, severity: 'error', code: 'folder-unreadable', message: 'Not read.' };
    notRunAlone(c4(SOUND, [folder]), 2);
  });

  it('is told so by the reader of the disk only to turn it off: a warning of another kind leaves it read in full, and none hides an error the core found', () => {
    const other: Problem = { file: 'apps/api.yaml', line: 1, column: 1, severity: 'warning', code: 'view-crowded', message: 'Crowded.' };
    expect(c4(SOUND, [other]).complete).toBe(true);
    notRunAlone(c4({ ...SOUND, 'apps/broken.yaml': 'name: [Broken\n' }, []), 2);
  });

  it('is not when a record has an id that another has, though each file is sound', () => {
    const report = c4({ ...SOUND, 'systems/api.yaml': 'name: Another API\n' });
    expect(report.complete).toBe(false);
    expect(report['element-unconnected'].checked).toBeNull();
  });
});

describe('a marker that cannot say which format the directory is in', () => {
  it.each([
    ['a format that is not a number', 'format: one\nname: Shop\n'],
    ['a format this seefore does not read', 'format: 2\nname: Shop\n'],
    ['no format', 'name: Shop\n'],
  ])('leaves all five checks not run, with %s', (_what, marker) => {
    const loaded = load([
      { path: 'seefore.yaml', text: marker },
      { path: 'people/fan.yaml', text: 'name: Fan\n' },
    ]);
    expect(loaded.c4).toEqual(c4NotRun());
    expect(loaded.c4.complete).toBe(false);
    expect(checked(loaded.c4)).toEqual([null, null, null, null, null]);
  });

  it('leaves them not run when there is no marker at all', () => {
    expect(load([]).c4).toEqual(c4NotRun());
  });
});

describe('a note', () => {
  it('is no problem: it is not among the problems, and is not counted as an error or a warning', () => {
    const loaded = load(
      directory({
        'people/fan.yaml': 'name: Fan\n',
        'systems/shop.yaml': 'name: Shop\n',
        'apps/api.yaml': 'name: API\nin: shop\n',
        'connections/fan-to-shop.yaml': 'from: fan\nto: shop\n',
      }),
    );
    expect(loaded.problems).toEqual([]);
    expect(C4_CODES.map((code) => loaded.c4[code].findings.length)).toEqual([3, 1, 1, 0, 1]);
  });

  it('is in order of file, whatever the kind of the record', () => {
    const report = c4({
      'systems/a-shop.yaml': 'name: Shop\n',
      'people/z-fan.yaml': 'name: Fan\n',
      'apps/m-api.yaml': 'name: API\nin: a-shop\n',
      'infrastructure/b-proxy.yaml': 'name: Proxy\n',
    });
    expect(files(report, 'description-missing')).toEqual(['apps/m-api.yaml', 'infrastructure/b-proxy.yaml', 'people/z-fan.yaml', 'systems/a-shop.yaml']);
    expect(files(report, 'element-unconnected')).toEqual(files(report, 'description-missing'));
  });
});

describe('the checks as a function of the model', () => {
  it('run on a model made by hand, and put a warning at the start of its file when they are not told where its name is', () => {
    const model = emptyModel();
    model.people.push({ id: 'fan', file: 'people/fan.yaml', name: 'Fan' });
    model.connections.push({ id: 'fan-uses-fan', file: 'connections/fan-uses-fan.yaml', from: 'fan', to: 'fan', name: 'Uses' });
    const report = c4Of(model, { complete: true });
    expect(found(report, 'connection-vague')[0]).toMatch(/^connections\/fan-uses-fan\.yaml:1:1 This connection is named `Uses`/);
    expect(report['element-unconnected'].findings).toEqual([]);
    expect(c4Of(model, { complete: false })['element-unconnected'].checked).toBeNull();
  });
});
