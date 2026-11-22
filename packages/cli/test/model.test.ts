import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXAMPLE } from '../../core/test/example.ts';
import type { Failure } from '../src/check.ts';
import type { ListResult } from '../src/list.ts';
import { main } from '../src/main.ts';
import type { UsesResult } from '../src/uses.ts';

/** `seefore list` and `seefore uses`: the model read back, for a person and as data. */

const MARKER = 'format: 1\nname: Boxwick\n';

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

function json<T>(args: string[], cwd = '.') {
  const result = run([...args, '--json'], cwd);
  return { code: result.code, data: JSON.parse(result.out) as T & Failure };
}

/** The example shop, written as a person reads it. */
const SHOP_LISTED = [
  'People',
  '  customer: Customer - Buys from the shop.',
  '  warehouse-clerk: Warehouse clerk - Packs the orders that are ready to ship.',
  '',
  'Systems',
  "  card-provider: Card provider (owner: The card provider) - Takes card payments. Another company's service.",
  '  shop: Shop (owner: Shop team) - Sells goods and ships them.',
  '    app order-api: Order API (service; Go; owner: Shop team, from `shop`) - Takes orders and says how far each has got.',
  '      component checkout: Checkout (owner: Shop team, from `shop`) - Takes a basket and a payment and makes an order of them.',
  '      component order-status: Order status (owner: Shop team, from `shop`) - Answers how far an order has got.',
  '    app shipping: Shipping (service; owner: Logistics team) - Tells the warehouse what to pack and records what was sent.',
  '    app storefront: Storefront (browser; TypeScript, React; owner: Shop team, from `shop`) - Where a customer fills a basket and pays.',
  '    store orders-database: Orders database (database; PostgreSQL; owner: Shop team, from `shop`) - Every order and how far it has got.',
  '',
  'Connections',
  '  card-provider-confirms: Card provider -> Order API: Confirms a payment (HTTPS) - Calls back when the payment is done. That this answers the call above is for...',
  '  checkout-keeps-orders: Checkout -> Orders database: Writes each order (SQL)',
  '  checkout-takes-payment: Checkout -> Card provider: Takes the payment (HTTPS)',
  '  clerk-packs: Warehouse clerk -> Shipping: Sees what to pack and marks it sent',
  '  customer-shops: Customer -> Storefront: Fills a basket and pays',
  '  order-status-reads-orders: Order status -> Orders database: Reads how far an order has got (SQL)',
  '  shipping-reads-orders: Shipping -> Orders database: Reads the orders that are ready to ship (SQL)',
  "  storefront-places-order: Storefront -> Checkout: Places an order (HTTPS) - Hands the customer's basket over as an order.",
  '',
  'Owners',
  '  card-provider-company: The card provider',
  '  logistics-team: Logistics team',
  '  shop-team: Shop team',
  '',
  'Technologies',
  '  go: Go',
  '  https: HTTPS',
  '  postgresql: PostgreSQL',
  '  react: React',
  '  sql: SQL',
  '  typescript: TypeScript',
  '',
  '27 records read. No problems.',
];

describe('seefore list', () => {
  it('lists the example shop in words, each record on a line and what is in a thing beneath it', () => {
    write(EXAMPLE);
    const result = run(['list']);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toBe([`Shop`, `format 1, ${root}`, '', ...SHOP_LISTED].join('\n'));
  });

  it('gives the model as data, one list for each family, each record as its file says with its id and file', () => {
    write(EXAMPLE);
    const { code, data } = json<ListResult>(['list']);
    expect(code).toBe(0);
    expect(Object.keys(data)).toEqual([
      'directory',
      'name',
      'format',
      'records',
      'errors',
      'warnings',
      'people',
      'systems',
      'apps',
      'stores',
      'components',
      'connections',
      'owners',
      'technologies',
    ]);
    expect(data).toMatchObject({ directory: root, name: 'Shop', format: 1, records: 27, errors: 0, warnings: 0 });
    expect(data.people).toEqual([
      { id: 'customer', file: 'people/customer.yaml', name: 'Customer', description: 'Buys from the shop.' },
      { id: 'warehouse-clerk', file: 'people/warehouse-clerk.yaml', name: 'Warehouse clerk', description: 'Packs the orders that are ready to ship.' },
    ]);
    expect(data.apps[0]).toEqual({
      id: 'order-api',
      file: 'apps/order-api.yaml',
      name: 'Order API',
      in: 'shop',
      description: 'Takes orders and says how far each has got.',
      kind: 'service',
      technology: ['go'],
    });
    expect(data.connections.map((connection) => `${connection.from} ${connection.to}`)).toContain('checkout card-provider');
    expect(data.technologies).toHaveLength(6);
  });

  it('lists a directory that has only its marker', () => {
    write({ 'seefore.yaml': MARKER });
    expect(run(['list']).out).toBe(`Boxwick\nformat 1, ${root}\n\n0 records read. No problems.`);
    expect(json<ListResult>(['list']).data).toEqual({
      directory: root,
      name: 'Boxwick',
      format: 1,
      records: 0,
      errors: 0,
      warnings: 0,
      people: [],
      systems: [],
      apps: [],
      stores: [],
      components: [],
      connections: [],
      owners: [],
      technologies: [],
    });
  });

  it('leaves out a record with an error in its own file, and what is in it, and says how many problems there are', () => {
    write({
      ...EXAMPLE,
      'systems/shop.yaml': 'name: Shop\nowner: [shop-team\n',
      'connections/database-tells.yaml': 'from: orders-database\nto: shipping\nname: Tells what is ready\n',
    });
    const result = run(['list']);
    expect(result.code).toBe(0);
    const lines = result.out.split('\n');
    expect(lines.slice(lines.indexOf('Systems'), lines.indexOf('Systems') + 3)).toEqual([
      'Systems',
      "  card-provider: Card provider (owner: The card provider) - Takes card payments. Another company's service.",
      '',
    ]);
    expect(result.out).not.toContain('database-tells');
    // 27 records, the broken system not among them, and the new connection: 6 are in the system.
    expect(lines.at(-1)).toBe('27 records read, 20 listed. 2 errors, 0 warnings: run `seefore check` to see them.');
    const { data } = json<ListResult>(['list']);
    expect(data.systems.map((system) => system.id)).toEqual(['card-provider']);
    expect(data.apps.map((app) => app.id)).toEqual(['order-api', 'shipping', 'storefront']);
    expect(data.connections.map((connection) => connection.id)).not.toContain('database-tells');
    expect(data).toMatchObject({ records: 27, errors: 2, warnings: 0 });
  });

  it('shows the id of what a connection names when that record is left out, and keeps a record with a warning', () => {
    write({
      'seefore.yaml': MARKER,
      'people/visitor.yaml': 'name: Visitor\n',
      'systems/site.yaml': 'name: Site\ncolour: blue\n',
      'connections/visits.yaml': 'from: visitor\nto: site\nname: Visits\n',
      'connections/visits-again.yaml': 'from: visitor\nto: site\nname: Visits\n',
    });
    const lines = run(['list']).out.split('\n');
    expect(lines.slice(3)).toEqual([
      'People',
      '  visitor: Visitor',
      '',
      'Connections',
      '  visits: Visitor -> site: Visits',
      '  visits-again: Visitor -> site: Visits',
      '',
      '4 records read, 3 listed. 1 error, 2 warnings: run `seefore check` to see them.',
    ]);
  });

  it('shows what is known of a record, and only that', () => {
    write({
      'seefore.yaml': MARKER,
      'systems/site.yaml': 'name: Site\n',
      'apps/web.yaml': 'name: Web\nin: site\n',
      'apps/worker.yaml': 'name: Worker\nin: site\nkind: job\nowner: night-team\n',
      'stores/files.yaml': 'name: Uploads\nin: site\ntechnology: [s3]\n',
      'components/upload.yaml': 'name: Upload\nin: worker\ntechnology: [go, s3]\n',
      'connections/web-calls.yaml': 'from: web\nto: worker\n',
      'connections/worker-writes.yaml': 'from: upload\nto: files\ntechnology: [s3]\n',
      'owners/night-team.yaml': 'name: Night team\ndescription: |\n  Runs what runs at night.\n  Asleep by day.\n',
      'technologies/go.yaml': 'name: Go\n',
      'technologies/s3.yaml': 'name: Amazon S3\n',
    });
    expect(run(['list']).out.split('\n').slice(3)).toEqual([
      'Systems',
      '  site: Site',
      '    app web: Web',
      '    app worker: Worker (job; owner: Night team)',
      '      component upload: Upload (Go, Amazon S3; owner: Night team, from `worker`)',
      '    store files: Uploads (Amazon S3)',
      '',
      'Connections',
      '  web-calls: Web -> Worker',
      '  worker-writes: Upload -> Uploads (Amazon S3)',
      '',
      'Owners',
      '  night-team: Night team - Runs what runs at night. Asleep by day.',
      '',
      'Technologies',
      '  go: Go',
      '  s3: Amazon S3',
      '',
      '10 records read. No problems.',
    ]);
  });

  it('cuts a long description to one line, at a word', () => {
    const long = 'Holds every order the shop has taken since it opened, with each change made to it and who made it.';
    write({ 'seefore.yaml': MARKER, 'people/clerk.yaml': `name: Clerk\ndescription: ${long}\n` });
    const line = run(['list']).out.split('\n')[4];
    expect(line).toBe('  clerk: Clerk - Holds every order the shop has taken since it opened, with each change made...');
    expect(line?.length).toBeLessThanOrEqual('  clerk: Clerk - '.length + 80);
  });

  it('cannot start where there is no source directory, and names itself in the hint', () => {
    write({ 'repo/architecture/seefore.yaml': MARKER });
    const result = run(['list'], 'repo');
    expect(result.code).toBe(2);
    expect(result.out).toBe('');
    expect(result.err).toContain('so there is no source directory to list. There is one below it. To list it, run: seefore list --workdir=architecture');
    expect(json(['list'], 'repo').data.error.code).toBe('no-source-directory');
  });

  it('starts from --workdir', () => {
    write(EXAMPLE, 'repo/architecture');
    write({ 'elsewhere/x.txt': '' });
    expect(json<ListResult>(['list', '--workdir=../repo/architecture'], 'elsewhere').data.name).toBe('Shop');
  });

  it('takes no names after it', () => {
    const result = run(['list', 'apps']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('seefore: `seefore list` takes no names after it, but got `apps`.');
    expect(json(['list', 'apps']).data.error.code).toBe('usage');
  });

  it('lists nothing, and says why, when the marker cannot say which format the directory is in', () => {
    write({ 'seefore.yaml': 'format: one\nname: Boxwick\n', 'people/clerk.yaml': 'name: Clerk\n' });
    const result = run(['list']);
    expect(result.code).toBe(0);
    expect(result.out).toBe(`(no name: the marker file could not be read)\nformat unknown, ${root}\n\n0 records read. 1 error, 1 warning: run \`seefore check\` to see them.`);
  });
});

describe('seefore uses', () => {
  it('shows what removing an app would break, in words', () => {
    write(EXAMPLE);
    const result = run(['uses', 'order-api']);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out.split('\n')).toEqual([
      'app order-api: Order API (apps/order-api.yaml)',
      '',
      '2 records are inside it:',
      '  component checkout: Checkout (components/checkout.yaml)',
      '  component order-status: Order status (components/order-status.yaml)',
      '',
      '5 places name it or anything inside it:',
      '  connections/card-provider-confirms.yaml:2:5: `to` names `order-api`.',
      '  connections/checkout-keeps-orders.yaml:1:7: `from` names `checkout`.',
      '  connections/checkout-takes-payment.yaml:1:7: `from` names `checkout`.',
      '  connections/order-status-reads-orders.yaml:1:7: `from` names `order-status`.',
      '  connections/storefront-places-order.yaml:2:5: `to` names `checkout`.',
    ]);
  });

  it('shows what is inside a system as a tree, to the bottom', () => {
    write(EXAMPLE);
    expect(run(['uses', 'shop']).out.split('\n').slice(0, 10)).toEqual([
      'system shop: Shop (systems/shop.yaml)',
      '',
      '6 records are inside it:',
      '  app order-api: Order API (apps/order-api.yaml)',
      '    component checkout: Checkout (components/checkout.yaml)',
      '    component order-status: Order status (components/order-status.yaml)',
      '  app shipping: Shipping (apps/shipping.yaml)',
      '  app storefront: Storefront (apps/storefront.yaml)',
      '  store orders-database: Orders database (stores/orders-database.yaml)',
      '',
    ]);
    expect(run(['uses', 'shop']).out).toContain('12 places name it or anything inside it:');
  });

  it('gives paths from where it was run', () => {
    write(EXAMPLE, 'architecture');
    expect(run(['uses', 'go', '--workdir=architecture']).out.split('\n')).toEqual([
      'technology go: Go (architecture/technologies/go.yaml)',
      '',
      '1 place names it:',
      '  architecture/apps/order-api.yaml:5:14: `technology` names `go`.',
    ]);
  });

  it('says so when nothing names it', () => {
    write(EXAMPLE);
    expect(run(['uses', 'clerk-packs']).out).toBe('connection clerk-packs: Sees what to pack and marks it sent (connections/clerk-packs.yaml)\n\nNothing names it.');
    write({ 'apps/lonely.yaml': 'name: Lonely\nin: card-provider\n', 'components/part.yaml': 'name: Part\nin: lonely\n' });
    expect(run(['uses', 'lonely']).out.split('\n').slice(-1)).toEqual(['Nothing names it or anything inside it.']);
  });

  it('answers as data', () => {
    write(EXAMPLE);
    const { code, data } = json<UsesResult>(['uses', 'order-api']);
    expect(code).toBe(0);
    expect(data).toEqual({
      directory: root,
      record: { id: 'order-api', family: 'apps', file: 'apps/order-api.yaml', name: 'Order API', in: 'shop' },
      inside: [
        { id: 'checkout', family: 'components', file: 'components/checkout.yaml', name: 'Checkout', in: 'order-api' },
        { id: 'order-status', family: 'components', file: 'components/order-status.yaml', name: 'Order status', in: 'order-api' },
      ],
      references: [
        { file: 'connections/card-provider-confirms.yaml', line: 2, column: 5, record: 'card-provider-confirms', field: 'to', names: 'order-api' },
        { file: 'connections/checkout-keeps-orders.yaml', line: 1, column: 7, record: 'checkout-keeps-orders', field: 'from', names: 'checkout' },
        { file: 'connections/checkout-takes-payment.yaml', line: 1, column: 7, record: 'checkout-takes-payment', field: 'from', names: 'checkout' },
        { file: 'connections/order-status-reads-orders.yaml', line: 1, column: 7, record: 'order-status-reads-orders', field: 'from', names: 'order-status' },
        { file: 'connections/storefront-places-order.yaml', line: 2, column: 5, record: 'storefront-places-order', field: 'to', names: 'checkout' },
      ],
      errors: 0,
      warnings: 0,
    });
  });

  it('refuses an id that no record has, in plain words, with exit code 2', () => {
    write(EXAMPLE);
    const result = run(['uses', 'basket']);
    expect(result).toEqual({ code: 2, out: '', err: 'seefore: No record has the id `basket`. Run `seefore list` to see the records there are.' });
    const { code, data } = json(['uses', 'basket']);
    expect(code).toBe(2);
    expect(data.error).toEqual({ code: 'no-such-record', message: 'No record has the id `basket`. Run `seefore list` to see the records there are.' });
  });

  it('says what is wrong with an id that is not one', () => {
    write(EXAMPLE);
    expect(json(['uses', 'Order_API']).data.error).toEqual({
      code: 'no-such-record',
      message: '`Order_API` is not an id: an id is written in lowercase, like `order-api`. Run `seefore list` to see the records there are.',
    });
  });

  it('says that a directory with errors may hide the record', () => {
    write({ ...EXAMPLE, 'apps/order-api.yaml': 'name: [Order API\n' });
    expect(run(['uses', 'basket']).err).toBe(
      'seefore: No record has the id `basket`. Run `seefore list` to see the records there are. This directory has errors too: `seefore check` shows them.',
    );
  });

  it('still shows a record whose file is broken, and says that what it names is not known', () => {
    write({ ...EXAMPLE, 'apps/order-api.yaml': 'name: [Order API\n' });
    const result = run(['uses', 'order-api']);
    expect(result.code).toBe(0);
    const lines = result.out.split('\n');
    expect(lines[0]).toBe('app order-api (apps/order-api.yaml)');
    expect(lines.at(-1)).toBe('1 error, 0 warnings: run `seefore check` to see them. 1 record could not be read, so what it names is not known.');
    expect(json<UsesResult>(['uses', 'order-api']).data).toMatchObject({ errors: 1, warnings: 0, record: { id: 'order-api', family: 'apps' } });
  });

  it('needs one id', () => {
    write(EXAMPLE);
    const none = run(['uses']);
    expect(none.code).toBe(2);
    expect(none.err).toContain('seefore: `seefore uses` needs the id of a record, as in `seefore uses order-api`.');
    const two = json(['uses', 'shop', 'order-api']);
    expect(two.code).toBe(2);
    expect(two.data.error).toEqual({ code: 'usage', message: '`seefore uses` takes one id, but got `shop order-api`.' });
  });

  it('cannot start where there is no source directory, and gives the whole command in the hint', () => {
    write(EXAMPLE, 'repo/architecture');
    const result = run(['uses', 'shop'], 'repo');
    expect(result.code).toBe(2);
    expect(result.err).toContain('so there is no source directory to read. There is one below it. To read it, run: seefore uses shop --workdir=architecture');
  });
});

describe('the built command', () => {
  const built = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'seefore.cjs');

  it('lists the model and shows what a removal would break', () => {
    write(EXAMPLE, 'shop');
    const listed = spawnSync(process.execPath, [built, 'list', '--workdir=shop'], { cwd: root, encoding: 'utf8' });
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe([`Shop`, `format 1, ${join(root, 'shop')}`, '', ...SHOP_LISTED, ''].join('\n'));
    const used = spawnSync(process.execPath, [built, 'uses', 'order-api', '--json'], { cwd: join(root, 'shop'), encoding: 'utf8' });
    expect(used.status).toBe(0);
    expect((JSON.parse(used.stdout) as UsesResult).inside.map((record) => record.id)).toEqual(['checkout', 'order-status']);
    const missing = spawnSync(process.execPath, [built, 'uses', 'basket'], { cwd: join(root, 'shop'), encoding: 'utf8' });
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('No record has the id `basket`.');
  });
});
