import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstSentence } from '@seefore/core';
import { EXAMPLE } from '../../core/test/example.ts';
import type { Failure } from '../src/check.ts';
import { LINE_WIDTH, widthOf } from '../src/list.ts';
import type { ListResult } from '../src/list.ts';
import { HELP, main } from '../src/main.ts';
import { readingOf } from '../src/server/source.ts';

/** `seefore list` as a person reads it in a terminal: the order, the connections, the sentences, the width. */

const MARKER = 'format: 1\nname: Boxwick\n';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-test-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes files under the temporary folder. A path's folders are made as needed. */
function write(files: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/** Runs the command in-process in the temporary folder, as if printing to a terminal of `columns` when given. */
function run(args: string[], columns?: number) {
  const out: string[] = [];
  const err: string[] = [];
  const io = { cwd: root, out: (text: string) => out.push(text), err: (text: string) => err.push(text), ...(columns === undefined ? {} : { columns }) };
  const code = main(args, io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** The lines of a listing from a heading to the blank line that ends its section. */
function section(out: string, heading: string): string[] {
  const lines = out.split('\n');
  const start = lines.indexOf(heading);
  expect(start, `the heading ${heading}`).toBeGreaterThanOrEqual(0);
  return lines.slice(start, lines.indexOf('', start));
}

/** The lines of a listing below its name and directory. */
function body(out: string): string[] {
  return out.split('\n').slice(3);
}

/** A model with a part of each sort, and a connection from each sort of thing that can start one. */
const PARTS: Readonly<Record<string, string>> = {
  'seefore.yaml': MARKER,
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
};

describe('the order of the listing', () => {
  it('puts the systems with an app or a store first, whatever their ids, and says how many under each heading', () => {
    write(PARTS);
    const result = run(['list']);
    expect(result.code).toBe(0);
    expect(body(result.out).filter((line) => /^[A-Z]/.test(line))).toEqual([
      'People (1)',
      'Systems with parts (2)',
      'Other systems (1)',
      'Connections (7)',
    ]);
    expect(section(result.out, 'Systems with parts (2)')).toEqual([
      'Systems with parts (2)',
      '  archive-service: Archive service',
      '    store archive: Archive',
      '  site: Site',
      '    app web: Web',
      '    app worker: Worker',
      '      component resize: Resize',
      '      component upload: Upload',
      '    store queue: Queue',
    ]);
    expect(section(result.out, 'Other systems (1)')).toEqual(['Other systems (1)', '  mailer: Mailer']);
    expect(result.out).not.toMatch(/\bours\b/i);
  });

  it('calls them only systems when none has a part', () => {
    write({ 'seefore.yaml': MARKER, 'systems/site.yaml': 'name: Site\n', 'systems/mailer.yaml': 'name: Mailer\n' });
    expect(body(run(['list']).out)).toEqual(['Systems (2)', '  mailer: Mailer', '  site: Site', '', '2 records read. No problems.']);
  });
});

describe('the connections', () => {
  it("puts each under what it starts from, in the order of the listing, a component's under its app, and in order of id beneath", () => {
    write(PARTS);
    expect(section(run(['list']).out, 'Connections (7)')).toEqual([
      'Connections (7)',
      '  from Visitor (person visitor)',
      '    visitor-uses-web: -> Web: Uses',
      '  from Web (app web)',
      '    web-sends-file: -> Worker / Upload: Sends a file',
      '  from Worker (app worker)',
      '    resize-writes-queue: Resize -> Queue: Queues the result',
      '    upload-calls-resize: Upload -> Worker / Resize: Resizes',
      '    worker-wakes-worker: -> Worker: Wakes another copy',
      '  from Queue (store queue)',
      '    queue-feeds-archive: -> Archive: Hands on old messages',
      '  from Mailer (system mailer)',
      '    mailer-calls-web: -> Web',
    ]);
  });

  it('puts one that starts at a record with an error last, under its id, and a part in such a record under the last heading', () => {
    write({
      ...PARTS,
      'apps/broken.yaml': 'name: [Broken\n',
      'components/part.yaml': 'name: Part\nin: broken\ndescription: A piece of what is broken.\n',
      'connections/broken-calls-web.yaml': 'from: broken\nto: web\nname: Calls\n',
      'connections/part-calls-web.yaml': 'from: part\nto: web\nname: Calls too\n',
      'connections/web-calls-part.yaml': 'from: web\nto: part\nname: Calls back\n',
    });
    const result = run(['list']);
    expect(result.code).toBe(0);
    const connections = section(result.out, 'Connections (10)');
    expect(connections.slice(3, 6)).toEqual([
      '  from Web (app web)',
      '    web-calls-part: -> broken / Part: Calls back',
      '    web-sends-file: -> Worker / Upload: Sends a file',
    ]);
    expect(connections.slice(-5)).toEqual([
      '  from Mailer (system mailer)',
      '    mailer-calls-web: -> Web',
      '  from broken (a record with an error)',
      '    broken-calls-web: -> Web: Calls',
      '    part-calls-web: Part -> Web: Calls too',
    ]);
    expect(body(result.out).slice(-4)).toEqual([
      'Parts in a record with an error (1)',
      '  component part: Part (in: broken) - A piece of what is broken.',
      '',
      '21 records read. 1 error, 0 warnings: run `seefore check` to see them.',
    ]);
  });
});

describe('what a connection passes through, and whose a system is', () => {
  /** A box office whose orders pass through a load balancer and a gateway, with a queue, a topic and somebody else's system. */
  const TICKETS: Readonly<Record<string, string>> = {
    'seefore.yaml': MARKER,
    'people/buyer.yaml': 'name: Buyer\n',
    'people/operator.yaml': 'name: Operator\n',
    'systems/box-office.yaml': 'name: Box office\n',
    'systems/card-provider.yaml': 'name: Card provider\ndescription: Takes card payments.\nexternal: true\nowner: card-company\n',
    'systems/edge.yaml': 'name: Edge network\n',
    'apps/shop.yaml': 'name: Shop\nin: box-office\n',
    'apps/shop-api.yaml': 'name: Shop API\nin: box-office\ntechnology: [go]\n',
    'apps/gateway.yaml': 'name: Gateway\nin: box-office\nkind: service\n',
    'components/checkout.yaml': 'name: Checkout\nin: shop-api\n',
    'components/router.yaml': 'name: Router\nin: shop-api\n',
    'stores/sales.yaml': 'name: Ticket sales\nin: box-office\nkind: topic\ntechnology: [kafka]\n',
    'stores/receipts.yaml': 'name: Receipts to send\nin: box-office\nkind: queue\n',
    'infrastructure/load-balancer.yaml': 'name: Load balancer\ndescription: Spreads the requests.\ntechnology: [haproxy]\nowner: platform-team\n',
    'infrastructure/spare-proxy.yaml': 'name: Spare proxy\n',
    'connections/buyer-uses-shop.yaml': 'from: buyer\nto: shop\nname: Picks seats\n',
    'connections/shop-places-order.yaml': 'from: shop\nto: checkout\nvia: [edge, load-balancer, gateway, router]\nname: Places an order\ntechnology: [https]\n',
    'connections/shop-asks-seats.yaml': 'from: shop\nto: shop-api\nvia: [load-balancer]\n',
    'connections/checkout-pays.yaml': 'from: checkout\nto: card-provider\nname: Takes the payment\n',
    'connections/checkout-puts-sale.yaml': 'from: checkout\nto: sales\nname: Puts each sale\n',
    'connections/shop-api-queues-receipt.yaml': 'from: shop-api\nto: receipts\nname: Queues a receipt\n',
    'connections/gateway-calls-edge.yaml': 'from: gateway\nto: edge\nname: Clears the cache\n',
    'connections/operator-reloads-balancer.yaml': 'from: operator\nto: load-balancer\nname: Reloads its settings\n',
    'connections/balancer-checks-api.yaml': 'from: load-balancer\nto: shop-api\nname: Checks that each copy is up\n',
    'connections/spare-proxy-checks-api.yaml': 'from: spare-proxy\nto: shop-api\n',
    'owners/platform-team.yaml': 'name: Platform team\n',
    'owners/card-company.yaml': 'name: The card company\n',
    'technologies/go.yaml': 'name: Go\n',
    'technologies/https.yaml': 'name: HTTPS\n',
    'technologies/kafka.yaml': 'name: Kafka\n',
    'technologies/haproxy.yaml': 'name: HAProxy\n',
  };

  it('writes the route on the line of a connection, in order, a component with its app', () => {
    write(TICKETS);
    const connections = section(run(['list']).out, 'Connections (10)');
    expect(connections.slice(7, 12)).toEqual([
      '  from Shop (app shop)',
      '    shop-asks-seats: -> Shop API, via Load balancer',
      '    shop-places-order: -> Shop API / Checkout, via Edge network, Load balancer, Gateway, Shop',
      '        API / Router: Places an order (HTTPS)',
      '  from Shop API (app shop-api)',
    ]);
  });

  it('lists the pieces of infrastructure under a heading of their own, after the systems, each with how many connections pass through it', () => {
    write(TICKETS);
    const out = run(['list']).out;
    expect(body(out).filter((line) => /^[A-Z]/.test(line))).toEqual([
      'People (2)',
      'Systems with parts (1)',
      'Other systems (2)',
      'Infrastructure (2)',
      'Connections (10)',
      'Owners (2)',
      'Technologies (4)',
    ]);
    expect(section(out, 'Infrastructure (2)')).toEqual([
      'Infrastructure (2)',
      '  load-balancer: Load balancer (HAProxy; owner: Platform team; 2 connections pass through it) -',
      '      Spreads the requests.',
      '  spare-proxy: Spare proxy (no connection passes through it)',
    ]);
  });

  it('says how many connections pass through an app, a component and a system, and which systems are external', () => {
    write(TICKETS);
    const out = run(['list']).out;
    expect(section(out, 'Systems with parts (1)')).toEqual([
      'Systems with parts (1)',
      '  box-office: Box office',
      '    app gateway: Gateway (service; 1 connection passes through it)',
      '    app shop: Shop',
      '    app shop-api: Shop API (Go)',
      '      component checkout: Checkout',
      '      component router: Router (1 connection passes through it)',
      '    store receipts: Receipts to send (queue)',
      '    store sales: Ticket sales (topic; Kafka)',
    ]);
    expect(section(out, 'Other systems (2)')).toEqual([
      'Other systems (2)',
      '  card-provider: Card provider (external; owner: The card company) - Takes card payments.',
      '  edge: Edge network (1 connection passes through it)',
    ]);
  });

  it('puts the connections that start at a piece of infrastructure under it, after the other groups', () => {
    write({ ...TICKETS, 'systems/broken.yaml': 'name: [Broken\n', 'connections/broken-calls-api.yaml': 'from: broken\nto: broken\n' });
    const connections = section(run(['list']).out, 'Connections (11)');
    expect(connections.slice(-6)).toEqual([
      '  from broken (a record with an error)',
      '    broken-calls-api: -> broken',
      '  from Load balancer (piece of infrastructure load-balancer)',
      '    balancer-checks-api: -> Shop API: Checks that each copy is up',
      '  from Spare proxy (piece of infrastructure spare-proxy)',
      '    spare-proxy-checks-api: -> Shop API',
    ]);
  });

  it('counts the pieces of infrastructure among the records it lists', () => {
    write({ ...TICKETS, 'infrastructure/broken-proxy.yaml': 'name: Broken proxy\ncolour: blue\n' });
    expect(run(['list']).out.split('\n').at(-1)).toBe('31 records read, 30 listed. 1 error, 0 warnings: run `seefore check` to see them.');
  });

  it('gives in the data the pieces of infrastructure, and `via` and `external` where a record has them', () => {
    write(TICKETS);
    const data = JSON.parse(run(['list', '--json']).out) as ListResult;
    expect(data.infrastructure).toEqual([
      {
        id: 'load-balancer',
        file: 'infrastructure/load-balancer.yaml',
        name: 'Load balancer',
        description: 'Spreads the requests.',
        technology: ['haproxy'],
        owner: 'platform-team',
      },
      { id: 'spare-proxy', file: 'infrastructure/spare-proxy.yaml', name: 'Spare proxy' },
    ]);
    expect(data.connections.find((connection) => connection.id === 'shop-places-order')).toEqual({
      id: 'shop-places-order',
      file: 'connections/shop-places-order.yaml',
      from: 'shop',
      to: 'checkout',
      via: ['edge', 'load-balancer', 'gateway', 'router'],
      name: 'Places an order',
      technology: ['https'],
    });
    expect(data.systems.find((system) => system.id === 'card-provider')).toEqual({
      id: 'card-provider',
      file: 'systems/card-provider.yaml',
      name: 'Card provider',
      description: 'Takes card payments.',
      external: true,
      owner: 'card-company',
    });
    // A piece of infrastructure is in nothing: it has the owner it names, and only that.
    expect(data.ownership['load-balancer']).toEqual({ owner: 'platform-team', from: 'load-balancer' });
    expect(Object.keys(data.ownership)).not.toContain('spare-proxy');
  });
});

describe('what is in what, reads and writes, who opened a channel, and conditions', () => {
  /**
   * An archive whose Desk keeps its drafts, with a proxy that is part of the archive, an office
   * proxy that is part of the office and there only in the head office, and a CDN in no system.
   */
  const DESK: Readonly<Record<string, string>> = {
    'seefore.yaml': MARKER,
    'people/staff.yaml': 'name: Staff\nonly: in the head office\n',
    'systems/archive.yaml': 'name: Archive\nowner: archive-team\n',
    'systems/office.yaml': 'name: Office\n',
    'apps/desk.yaml': 'name: Desk\nin: archive\nkind: service\n',
    'apps/staff-browser.yaml': 'name: Staff browser\nin: archive\nkind: browser\n',
    'components/editor.yaml': 'name: Editor\nin: desk\n',
    'stores/drafts.yaml': 'name: Drafts\nin: desk\ndescription: Edits that are not yet saved, in a file beside Desk.\nkind: files\n',
    'stores/records.yaml': 'name: Records\nin: archive\nkind: database\n',
    'infrastructure/proxy.yaml': 'name: HTTPS proxy\nin: archive\n',
    'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: office\nonly: in the head office\n',
    'infrastructure/cdn.yaml': 'name: CDN\n',
    'connections/staff-browser-asks-desk.yaml': 'from: staff-browser\nto: desk\nvia: [proxy]\nname: Asks for pages\n',
    'connections/desk-keeps-drafts.yaml': 'from: desk\nto: drafts\naccess: read-write\nname: Keeps edits not yet saved\n',
    'connections/editor-reads-drafts.yaml': 'from: editor\nto: drafts\naccess: read\n',
    'connections/desk-saves-records.yaml': 'from: desk\nto: records\naccess: write\nname: Saves each record\n',
    'connections/desk-tells-browser.yaml': 'from: desk\nto: staff-browser\nvia: [proxy, office-proxy]\nopens: to\nname: Says a job is done\nonly: with jobs in the background\n',
    'connections/staff-edits.yaml': 'from: staff\nto: staff-browser\nname: Edits records\n',
    'owners/archive-team.yaml': 'name: Archive team\n',
  };

  it('puts a store under the app that keeps it, after its components, and a piece of infrastructure under its system', () => {
    write(DESK);
    const out = run(['list']).out;
    expect(run(['check']).code).toBe(0);
    // Each record is counted once, under one heading.
    expect(body(out).filter((line) => /^[A-Z]/.test(line))).toEqual([
      'People (1)',
      'Systems with parts (2)',
      'An owner holds for what is beneath it until a part names its own.',
      'Infrastructure (1)',
      'Connections (6)',
      'Owners (1)',
      'Conditions (2)',
    ]);
    expect(out.split('\n').at(-1)).toBe('18 records read. No problems.');
    expect(section(out, 'Systems with parts (2)')).toEqual([
      'Systems with parts (2)',
      'An owner holds for what is beneath it until a part names its own.',
      '  archive: Archive (owner: Archive team)',
      '    app desk: Desk (service)',
      '      component editor: Editor',
      '      store drafts: Drafts (files) - Edits that are not yet saved, in a file beside Desk.',
      '    app staff-browser: Staff browser (browser)',
      '    store records: Records (database)',
      '    infrastructure proxy: HTTPS proxy (2 connections pass through it)',
      '  office: Office',
      '    infrastructure office-proxy: Office proxy (only in the head office) (1 connection passes',
      '        through it)',
    ]);
    // A piece in no system stays under the heading it had.
    expect(section(out, 'Infrastructure (1)')).toEqual(['Infrastructure (1)', '  cdn: CDN (no connection passes through it)']);
  });

  it('writes what a connection does to a store, and that the far side opened its channel, before its name, and a condition after a name', () => {
    write(DESK);
    const out = run(['list']).out;
    expect(section(out, 'People (1)')).toEqual(['People (1)', '  staff: Staff (only in the head office)']);
    expect(section(out, 'Connections (6)')).toEqual([
      'Connections (6)',
      '  from Staff (person staff)',
      '    staff-edits: -> Staff browser: Edits records',
      '  from Desk (app desk)',
      '    desk-keeps-drafts: -> Drafts: [read-write] Keeps edits not yet saved',
      '    desk-saves-records: -> Records: [write] Saves each record',
      '    desk-tells-browser: -> Staff browser, via HTTPS proxy, (Office proxy):',
      '        [opened by the far side] Says a job is done (only with jobs in the background)',
      '    editor-reads-drafts: Editor -> Drafts: [read]',
      '  from Staff browser (app staff-browser)',
      '    staff-browser-asks-desk: -> Desk, via HTTPS proxy: Asks for pages',
    ]);
  });

  it('lists each wording of a condition once, in order of its words in any case, with how many records hold it and how many more have it from them', () => {
    write({
      ...DESK,
      'apps/staff-browser.yaml': 'name: Staff browser\nin: archive\nkind: browser\nonly: In the head office\n',
      'components/editor.yaml': 'name: Editor\nin: desk\nonly: with jobs in the background\n',
      'stores/records.yaml': 'name: Records\nin: archive\nkind: database\nonly: in the head office\n',
    });
    // Two wordings that differ only in capitals stand side by side, in the order of their characters.
    expect(section(run(['list']).out, 'Conditions (3)')).toEqual([
      'Conditions (3)',
      // The three connections at the staff browser.
      '  only In the head office (1 record, 3 more have it from it)',
      // The staff's connection to the browser, and Desk's to the records.
      '  only in the head office (3 records, 2 more have it from them)',
      // The editor's connection to the drafts.
      '  only with jobs in the background (2 records, 1 more has it from them)',
    ]);
    write({ 'apps/desk.yaml': 'name: Desk\nin: archive\nkind: service\nonly: in the hosted edition\n' });
    expect(section(run(['list']).out, 'Conditions (4)').slice(1)).toEqual([
      '  only In the head office (1 record, 3 more have it from it)',
      '  only in the head office (3 records, 2 more have it from them)',
      // Desk's editor and drafts, and the five connections that start or end at Desk or in it.
      '  only in the hosted edition (1 record, 7 more have it from it)',
      '  only with jobs in the background (2 records, 1 more has it from them)',
    ]);
    // A wording no other record has from the records that hold it says only how many hold it.
    write({ 'stores/records.yaml': 'name: Records\nin: archive\nkind: database\nonly: while records are kept\n', 'connections/desk-saves-records.yaml': 'from: desk\nto: drafts\n' });
    expect(run(['list']).out.split('\n')).toContain('  only while records are kept (1 record)');
  });

  it('counts as having a wording from others only a record that does not hold it as its own', () => {
    write({ ...DESK, 'systems/archive.yaml': 'name: Archive\nowner: archive-team\nonly: on site\n', 'apps/desk.yaml': 'name: Desk\nin: archive\nkind: service\nonly: on site\n' });
    const archived = ['desk-keeps-drafts', 'desk-saves-records', 'desk-tells-browser', 'drafts', 'editor', 'editor-reads-drafts', 'proxy', 'records', 'staff-browser', 'staff-browser-asks-desk', 'staff-edits'];
    expect(section(run(['list']).out, 'Conditions (3)')[2]).toBe(`  only on site (2 records, ${archived.length} more have it from them)`);
  });

  it('puts a thing on a route in brackets when it has a condition from what it is in, so that taking out an `only` said again changes nothing', () => {
    const said = { ...DESK, 'systems/office.yaml': 'name: Office\nonly: in the head office\n' };
    write(said);
    expect(run(['check']).out).toContain('`only` says "in the head office", and so does `office`, the system it is in.');
    const route = (): string[] => {
      const lines = section(run(['list']).out, 'Connections (6)');
      const at = lines.findIndex((line) => line.startsWith('    desk-tells-browser:'));
      return lines.slice(at, at + 2);
    };
    const before = route();
    expect(before).toEqual(['    desk-tells-browser: -> Staff browser, via HTTPS proxy, (Office proxy):', '        [opened by the far side] Says a job is done (only with jobs in the background)']);
    write({ 'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: office\n' });
    expect(run(['check']).code).toBe(0);
    expect(route()).toEqual(before);
  });

  it('has no heading for conditions when no record has `only`', () => {
    write(PARTS);
    expect(run(['list']).out).not.toContain('Conditions');
    expect(run(['list']).out).not.toContain('only');
  });

  it('puts a kept store of an app with an error, and a piece in a system with an error, under the last heading, and a loose app with what it keeps', () => {
    write({ ...DESK, 'apps/desk.yaml': 'name: [Desk\n', 'systems/office.yaml': 'name: [Office\n' });
    const result = run(['list']);
    expect(section(result.out, 'Parts in a record with an error (3)')).toEqual([
      'Parts in a record with an error (3)',
      '  store drafts: Drafts (in: desk; files) - Edits that are not yet saved, in a file beside Desk.',
      '  component editor: Editor (in: desk)',
      '  infrastructure office-proxy: Office proxy (only in the head office) (in: office; 1 connection',
      '      passes through it)',
    ]);
    write({ ...DESK, 'systems/archive.yaml': 'name: [Archive\n' });
    const loose = section(run(['list']).out, 'Parts in a record with an error (6)');
    expect(loose.slice(0, 5)).toEqual([
      'Parts in a record with an error (6)',
      '  app desk: Desk (in: archive; service)',
      '    component editor: Editor',
      '    store drafts: Drafts (files) - Edits that are not yet saved, in a file beside Desk.',
      '  app staff-browser: Staff browser (in: archive; browser)',
    ]);
  });

  it('gives in the data the three fields, `in` of a kept store and of a piece, and the conditions each record is under, its own first', () => {
    write({ ...DESK, 'systems/office.yaml': 'name: Office\nonly: in the head office edition\n' });
    const data = JSON.parse(run(['list', '--json']).out) as ListResult;
    expect(data.stores.find((store) => store.id === 'drafts')).toMatchObject({ in: 'desk' });
    expect(data.infrastructure.find((piece) => piece.id === 'office-proxy')).toEqual({
      id: 'office-proxy',
      file: 'infrastructure/office-proxy.yaml',
      name: 'Office proxy',
      in: 'office',
      only: 'in the head office',
    });
    expect(data.connections.find((connection) => connection.id === 'desk-tells-browser')).toEqual({
      id: 'desk-tells-browser',
      file: 'connections/desk-tells-browser.yaml',
      from: 'desk',
      to: 'staff-browser',
      via: ['proxy', 'office-proxy'],
      opens: 'to',
      name: 'Says a job is done',
      only: 'with jobs in the background',
    });
    expect(data.connections.find((connection) => connection.id === 'desk-keeps-drafts')).toMatchObject({ access: 'read-write' });
    // As the server gives the page: each record under any condition, its own first, then from others, nearest first.
    expect(data.conditions).toEqual({
      staff: [{ only: 'in the head office', from: 'staff' }],
      office: [{ only: 'in the head office edition', from: 'office' }],
      'office-proxy': [
        { only: 'in the head office', from: 'office-proxy' },
        { only: 'in the head office edition', from: 'office' },
      ],
      'desk-tells-browser': [{ only: 'with jobs in the background', from: 'desk-tells-browser' }],
      'staff-edits': [{ only: 'in the head office', from: 'staff' }],
    });
    expect(data.ownership['drafts']).toEqual({ owner: 'archive-team', from: 'archive' });
    expect(data.ownership['proxy']).toEqual({ owner: 'archive-team', from: 'archive' });
    expect(Object.keys(data.ownership)).not.toContain('cdn');
    // The same contract as the state the server gives the page, and as the help says.
    const state = readingOf(root);
    expect(data.conditions).toEqual(state.conditions);
    expect(data.ownership).toEqual(state.ownership);
    expect(HELP.replace(/\s+/g, ' ')).toContain(
      '--json Print the result as data. For list: the records of each family, and by id who answers for each part and the conditions each record is under, its own first.',
    );
    expect(HELP.replace(/\s+/g, ' ')).toContain('--full For list: show each description whole, beneath its record, and each condition a record has from another.');
  });
});

describe('a description', () => {
  it('shows its whole first sentence, by the rules of the platform', () => {
    expect(firstSentence('Takes orders. Says how far each has got.')).toBe('Takes orders.');
    expect(firstSentence('Is it up? Then it answers.')).toBe('Is it up?');
    expect(firstSentence('Says "Done." Then it stops.')).toBe('Says "Done."');
    expect(firstSentence('Runs on example.com and keeps 2.5 GB, as v2.1 does. Then more.')).toBe('Runs on example.com and keeps 2.5 GB, as v2.1 does.');
    const long = 'Holds every order the shop has taken since it opened, with each change made to it, who made it and when, for as long as the law asks.';
    expect(firstSentence(`${long} Then more.`)).toBe(long);
  });

  it('does not end a sentence at "e.g.", "i.e." or another short form, even before a capital', () => {
    expect(firstSentence('Takes events, e.g. Sentry sends them. Then more.')).toBe('Takes events, e.g. Sentry sends them.');
    expect(firstSentence('E.g. Sentry sends them. Then more.')).toBe('E.g. Sentry sends them.');
    expect(firstSentence('Holds files, i.e. The uploads. Then more.')).toBe('Holds files, i.e. The uploads.');
    expect(firstSentence('Holds files (e.g. PDF and PNG). Then more.')).toBe('Holds files (e.g. PDF and PNG).');
    expect(firstSentence('Weighs Redis vs. Valkey. Then more.')).toBe('Weighs Redis vs. Valkey.');
  });

  it('does not end a sentence at a title before a name, written with its capital', () => {
    expect(firstSentence('Calls Dr. Smith for advice. Then pays.')).toBe('Calls Dr. Smith for advice.');
    for (const title of ['Mr.', 'Mrs.', 'Ms.', 'Prof.', 'St.']) expect(firstSentence(`Asks ${title} Jones. Then more.`)).toBe(`Asks ${title} Jones.`);
    expect(firstSentence('Answers in 5 ms. Then retries.')).toBe('Answers in 5 ms.');
  });

  it('ends a sentence at capital letters with dots when a capital follows, and not at small ones', () => {
    expect(firstSentence('Available in the U.S. Only staff administer it.')).toBe('Available in the U.S.');
    // A rule of thumb: the words cannot tell this from the end of a sentence.
    expect(firstSentence('Calls the U.S. Postal Service. Then more.')).toBe('Calls the U.S.');
    expect(firstSentence('Available in the U.S. only to staff. Then more.')).toBe('Available in the U.S. only to staff.');
    expect(firstSentence('Runs at 3 a.m. Then more.')).toBe('Runs at 3 a.m. Then more.');
  });

  it('ends a sentence at a full stop before a small letter, a backtick, a quotation mark or a digit', () => {
    expect(firstSentence('Holds the options. syncthing writes it when they change.')).toBe('Holds the options.');
    expect(firstSentence('Takes each event over HTTP. `relay` then forwards it.')).toBe('Takes each event over HTTP.');
    expect(firstSentence('Keeps the logs. "Old" ones go first.')).toBe('Keeps the logs.');
    expect(firstSentence('Keeps the logs. 30 days of them.')).toBe('Keeps the logs.');
    // Not after a short form, a title, letters with dots, "etc." or the dots of a pause.
    expect(firstSentence('Takes events, e.g. sentry sends them. Then more.')).toBe('Takes events, e.g. sentry sends them.');
    expect(firstSentence('Weighs redis vs. valkey. Then more.')).toBe('Weighs redis vs. valkey.');
    expect(firstSentence('Holds approx. 30 days. Then more.')).toBe('Holds approx. 30 days.');
    expect(firstSentence('Asks Dr. smith. Then more.')).toBe('Asks Dr. smith.');
    expect(firstSentence('Holds files, logs, etc. and more. Then more.')).toBe('Holds files, logs, etc. and more.');
    expect(firstSentence('Holds files, logs, etc. Then more.')).toBe('Holds files, logs, etc.');
    expect(firstSentence('Waits... then retries. Then more.')).toBe('Waits... then retries.');
  });

  it('ends a sentence with no space after it in a script that writes none, such as Chinese or Japanese', () => {
    expect(firstSentence('接收订单。随后发货。')).toBe('接收订单。');
    expect(firstSentence('注文を受ける。次に発送する。')).toBe('注文を受ける。');
    expect(firstSentence('（完了しました！）次へ。')).toBe('（完了しました！）');
  });

  it('does not end a sentence inside a link', () => {
    expect(firstSentence('Calls https://example.com/a?b=1 daily. Then more.')).toBe('Calls https://example.com/a?b=1 daily.');
    expect(firstSentence('Reads https://example.com/a!b. Then more.')).toBe('Reads https://example.com/a!b.');
  });

  it('shows a text with no end of a sentence whole, and on one line', () => {
    expect(firstSentence('Takes orders and says how far each has got')).toBe('Takes orders and says how far each has got');
    expect(firstSentence('  Takes orders\nand says   how far.\n\nThen more.\n')).toBe('Takes orders and says how far.');
  });

  it('shows its first sentence on the line of its record, in the listing', () => {
    write({ 'seefore.yaml': MARKER, 'people/clerk.yaml': 'name: Clerk\ndescription: >-\n  Packs the orders, e.g. Monday.\n  Works at night.\n' });
    expect(body(run(['list']).out)[1]).toBe('  clerk: Clerk - Packs the orders, e.g. Monday.');
  });
});

describe('--full', () => {
  const CLERK = {
    'seefore.yaml': MARKER,
    'people/clerk.yaml': 'name: Clerk\ndescription: >-\n  Packs the orders.\n  Works at night.\n\n  Is asleep by day,\n  and may not be woken.\n',
    'people/porter.yaml': 'name: Porter\n',
  };

  it('shows each description whole beneath its record, each paragraph starting a line of its own', () => {
    write(CLERK);
    const result = run(['list', '--full']);
    expect(result.code).toBe(0);
    expect(section(result.out, 'People (2)')).toEqual([
      'People (2)',
      '  clerk: Clerk',
      '      Packs the orders. Works at night.',
      '      Is asleep by day, and may not be woken.',
      '  porter: Porter',
    ]);
    expect(section(run(['list']).out, 'People (2)')).toEqual(['People (2)', '  clerk: Clerk - Packs the orders.', '  porter: Porter']);
  });

  it('wraps a description at the width, and a record line that wraps goes on deeper than the description', () => {
    write({
      'seefore.yaml': MARKER,
      'people/visitor.yaml': 'name: Visitor\n',
      'systems/site.yaml': 'name: Site\n',
      'connections/visitor-reads-the-pages.yaml':
        'from: visitor\nto: site\nname: Reads the pages of the site\ndescription: Through the proxy, which ends TLS and passes each request on.\n',
    });
    expect(section(run(['list', '--full'], 50).out, 'Connections (1)')).toEqual([
      'Connections (1)',
      '  from Visitor (person visitor)',
      '    visitor-reads-the-pages: -> Site: Reads the',
      '            pages of the site',
      '        Through the proxy, which ends TLS and',
      '        passes each request on.',
    ]);
  });

  it('shows a description as it is written, with each run of spaces kept, except where a line wraps', () => {
    write({
      'seefore.yaml': MARKER,
      'people/clerk.yaml': 'name: Clerk\ndescription: |-\n  Accepts the token "A  B".\n  Steps:\n    first   this,\n    then that.\n',
    });
    expect(section(run(['list', '--full']).out, 'People (1)')).toEqual([
      'People (1)',
      '  clerk: Clerk',
      '      Accepts the token "A  B".',
      '      Steps:',
      '        first   this,',
      '        then that.',
    ]);
    expect(section(run(['list', '--full'], 20).out, 'People (1)').slice(2, 4)).toEqual(['      Accepts the', '      token "A  B".']);
    // The short view still puts its first sentence on one line, in single spaces.
    expect(section(run(['list']).out, 'People (1)')[1]).toBe('  clerk: Clerk - Accepts the token "A B".');
  });

  it('says beneath a part or a connection each condition it has from another record, nearest first, before its description', () => {
    write({
      'seefore.yaml': MARKER,
      'people/fan.yaml': 'name: Fan\n',
      'systems/stadium.yaml': 'name: Stadium\nonly: on match days\n',
      'apps/gates.yaml': 'name: Gates\nin: stadium\nonly: at the eleven venues with gates\n',
      'components/reader.yaml': 'name: Ticket reader\nin: gates\ndescription: Reads each ticket.\n',
      'connections/fan-shows-ticket.yaml': 'from: fan\nto: reader\nname: Shows a ticket\n',
    });
    const out = run(['list', '--full']).out;
    expect(section(out, 'Systems with parts (1)')).toEqual([
      'Systems with parts (1)',
      '  stadium: Stadium (only on match days)',
      '    app gates: Gates (only at the eleven venues with gates)',
      '        has from Stadium: only on match days',
      '      component reader: Ticket reader',
      '          has from Gates: only at the eleven venues with gates',
      '          has from Stadium: only on match days',
      '          Reads each ticket.',
    ]);
    expect(section(out, 'Connections (1)').slice(2)).toEqual([
      '    fan-shows-ticket: -> Gates / Ticket reader: Shows a ticket',
      '        has from Gates: only at the eleven venues with gates',
      '        has from Stadium: only on match days',
    ]);
    // The short listing shows a record's own condition alone.
    expect(run(['list']).out).not.toContain('has from');
  });

  it('changes nothing in the data', () => {
    write(EXAMPLE);
    expect(run(['list', '--full', '--json']).out).toBe(run(['list', '--json']).out);
  });

  it('is an option of list only', () => {
    write(EXAMPLE);
    for (const args of [['check', '--full'], ['uses', 'shop', '--full']]) {
      const result = run(args);
      expect(result.code).toBe(2);
      expect(result.err).toBe('seefore: `--full` is an option of `seefore list` only.\nRun `seefore --help` to see how it is used.');
      const data = JSON.parse(run([...args, '--json']).out) as Failure;
      expect(data.error).toEqual({ code: 'usage', message: '`--full` is an option of `seefore list` only.' });
    }
  });
});

describe('the width', () => {
  const WORDS = 'Takes the orders of the shop and keeps each of them, with every change made to it and the name of whoever made it.';
  const LONG = {
    'seefore.yaml': MARKER,
    'people/clerk.yaml': `name: Clerk\ndescription: ${WORDS}\n`,
    'systems/site.yaml': 'name: Site\n',
    'apps/web.yaml': `name: Web\nin: site\ndescription: ${WORDS}\n`,
    'components/form.yaml': `name: Form\nin: web\ndescription: ${WORDS}\n`,
  };

  /** The widest line of a listing, leaving out the line that names the directory. */
  const widest = (out: string): number => Math.max(...out.split('\n').filter((_, at) => at !== 1).map(widthOf));

  it('wraps at 96 columns, and a wrapped line goes on deeper than its record', () => {
    write(LONG);
    const out = run(['list']).out;
    expect(LINE_WIDTH).toBe(96);
    expect(widest(out)).toBeLessThanOrEqual(96);
    expect(section(out, 'Systems with parts (1)')).toEqual([
      'Systems with parts (1)',
      '  site: Site',
      '    app web: Web - Takes the orders of the shop and keeps each of them, with every change made',
      '        to it and the name of whoever made it.',
      '      component form: Form - Takes the orders of the shop and keeps each of them, with every',
      '          change made to it and the name of whoever made it.',
    ]);
  });

  it("wraps at the terminal's width when that is narrower, and at 96 when it is wider", () => {
    write(LONG);
    const narrow = run(['list'], 60).out;
    expect(widest(narrow)).toBeLessThanOrEqual(60);
    expect(section(narrow, 'People (1)')).toEqual([
      'People (1)',
      '  clerk: Clerk - Takes the orders of the shop and keeps each',
      '      of them, with every change made to it and the name of',
      '      whoever made it.',
    ]);
    expect(run(['list'], 200).out).toBe(run(['list']).out);
  });

  it('never breaks a word, an id or a link', () => {
    const link = 'https://example.com/a/very/long/path/that/goes/on/and/on/for/a/while/index.html?page=1';
    write({ 'seefore.yaml': MARKER, 'people/a-clerk-with-a-long-id.yaml': `name: Clerk\ndescription: See ${link} for more.\n` });
    expect(section(run(['list'], 30).out, 'People (1)')).toEqual(['People (1)', '  a-clerk-with-a-long-id:', '      Clerk - See', `      ${link}`, '      for more.']);
  });

  it('counts a wide character as two columns and a mark that combines as none', () => {
    const wide = String.fromCodePoint(0x65e5, 0x672c);
    const accent = `e${String.fromCodePoint(0x301)}`;
    expect(widthOf('abc')).toBe(3);
    expect(widthOf(wide)).toBe(4);
    expect(widthOf(accent)).toBe(1);
    // Counted by characters, "Packs" would fit on the first line, and the accents not on the second.
    write({ 'seefore.yaml': MARKER, 'people/a.yaml': `name: ${wide.repeat(2)}\ndescription: Packs ${accent.repeat(6)}.\n` });
    expect(section(run(['list'], 20).out, 'People (1)')).toEqual(['People (1)', `  a: ${wide.repeat(2)} -`, `      Packs ${accent.repeat(6)}.`]);
  });

  it('counts an emoji as two columns, as a terminal shows it, also one joined of several, with a skin tone, or a flag', () => {
    expect(widthOf('🚀')).toBe(2);
    expect(widthOf('👩‍💻')).toBe(2);
    expect(widthOf('👍🏽')).toBe(2);
    expect(widthOf('🇵🇱')).toBe(2);
    expect(widthOf('❤️')).toBe(2);
    expect(widthOf('1️⃣')).toBe(2);
    // Without the selector that asks for a picture, a heart is text, one column wide.
    expect(widthOf('❤')).toBe(1);
  });

  it('wraps a line of emoji at the width, counted apart from the listing', () => {
    write({ 'seefore.yaml': MARKER, 'people/rocket.yaml': `name: Rocket\ndescription: ${Array(37).fill('🚀').join(' ')}.\n` });
    const lines = section(run(['list']).out, 'People (1)');
    // Each rocket takes two columns; everything else in these lines takes one.
    const columns = (line: string): number => line.replace(/🚀/gu, '##').length;
    expect(lines.map(columns)).toEqual([10, 96, 39]);
  });
});

describe('the command it names', () => {
  const BROKEN = { 'seefore.yaml': MARKER, 'people/clerk.yaml': 'name: Clerk\ncolour: blue\n', 'people/porter.yaml': 'name: Porter\n' };

  it('names the directory when the listing was started with --workdir, and keeps the command on one line', () => {
    write(Object.fromEntries(Object.entries(BROKEN).map(([path, text]) => [`my repo/architecture/${path}`, text])));
    write({ 'elsewhere/x.txt': '' });
    const io = (cwd: string, columns: number) => {
      const out: string[] = [];
      return { cwd: join(root, cwd), out: (text: string) => out.push(text), err: () => undefined, columns, printed: out };
    };
    const narrow = io('.', 40);
    main(['list', '--workdir=my repo/architecture'], narrow);
    expect(narrow.printed.join('\n').split('\n').slice(-4)).toEqual([
      '2 records read, 1 listed. 1 error, 0',
      '    warnings: run',
      '    `seefore check --workdir="my repo/architecture"`',
      '    to see them.',
    ]);
    // From elsewhere, by its full path, since a path from there would climb out with `..`.
    const elsewhere = io('elsewhere', 200);
    main(['list', '--workdir=../my repo/architecture'], elsewhere);
    const command = `\`seefore check --workdir="${join(root, 'my repo/architecture')}"\``;
    expect(elsewhere.printed.join('\n').split('\n').filter((line) => line.includes(command))).toHaveLength(1);
  });

  it('is the command alone when the listing was started inside the directory', () => {
    write(BROKEN);
    expect(run(['list']).out.split('\n').at(-1)).toBe('2 records read, 1 listed. 1 error, 0 warnings: run `seefore check` to see them.');
  });
});

describe('an id that is also the name of what every object has', () => {
  it('lists `constructor` and `tostring` as any other, and the data holds for them only what was put there', () => {
    write({
      'seefore.yaml': MARKER,
      'people/constructor.yaml': 'name: Constructor\n',
      'systems/tostring.yaml': 'name: To string\nonly: on Tuesdays\n',
      'apps/valueof.yaml': 'name: Value of\nin: tostring\n',
      'connections/constructor-asks.yaml': 'from: constructor\nto: valueof\nname: Asks\n',
    });
    expect(run(['check']).code).toBe(0);
    const result = run(['list', '--full']);
    expect(result.code).toBe(0);
    expect(section(result.out, 'People (1)')).toEqual(['People (1)', '  constructor: Constructor']);
    const data = JSON.parse(run(['list', '--json']).out) as ListResult;
    // A person has no owner and no condition: neither object holds a key for it of its own.
    expect(Object.hasOwn(data.conditions, 'constructor')).toBe(false);
    expect(Object.hasOwn(data.ownership, 'constructor')).toBe(false);
    expect(data.conditions['tostring']).toEqual([{ only: 'on Tuesdays', from: 'tostring' }]);
    expect(Object.keys(data.conditions)).toEqual(['tostring', 'valueof', 'constructor-asks']);
    expect(run(['uses', 'constructor']).code).toBe(0);
  });
});

describe('owners', () => {
  it('shows an owner only where it is named, and says once that it holds for what is beneath', () => {
    write(EXAMPLE);
    const out = run(['list']).out;
    expect(out.match(/owner: /g)).toHaveLength(3);
    expect(out.split('\n').filter((line) => line.includes('holds for'))).toEqual(['An owner holds for what is beneath it until a part names its own.']);
  });

  it('says nothing of owners above when no part takes one', () => {
    write({
      'seefore.yaml': MARKER,
      'systems/site.yaml': 'name: Site\n',
      'apps/web.yaml': 'name: Web\nin: site\nowner: web-team\n',
      'owners/web-team.yaml': 'name: Web team\n',
    });
    expect(section(run(['list']).out, 'Systems with parts (1)')).toEqual(['Systems with parts (1)', '  site: Site', '    app web: Web (owner: Web team)']);
  });

  it('gives in the data the owner of each part that has one and the record it comes from', () => {
    write({
      ...EXAMPLE,
      'components/order-status.yaml': 'name: Order status\nin: order-api\nowner: logistics-team\n',
      'systems/card-provider.yaml': 'name: Card provider\n',
      'apps/fraud-check.yaml': 'name: Fraud check\nin: card-provider\n',
    });
    const data = JSON.parse(run(['list', '--json']).out) as ListResult;
    expect(data.ownership['checkout']).toEqual({ owner: 'shop-team', from: 'shop' });
    expect(data.ownership['order-status']).toEqual({ owner: 'logistics-team', from: 'order-status' });
    expect(data.ownership['shipping']).toEqual({ owner: 'logistics-team', from: 'shipping' });
    expect(Object.keys(data.ownership)).not.toContain('card-provider');
    expect(Object.keys(data.ownership)).not.toContain('fraud-check');
    // What is written stays as written: a part that takes its owner from above has no `owner` of its own.
    expect(data.components.find((component) => component.id === 'checkout')).not.toHaveProperty('owner');
  });
});
