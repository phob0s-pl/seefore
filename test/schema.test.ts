import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { expect, test } from 'vitest';
import { schemas } from '../src/model/schema.ts';

const SCHEMA = fileURLToPath(new URL('../schema/', import.meta.url));

test('the files in schema/ are what the shapes write now', () => {
  for (const [name, text] of Object.entries(schemas())) {
    expect(readFileSync(SCHEMA + name, 'utf8'), `${name}: run "npm run schema"`).toBe(text);
  }
});

/** Whether the schema of a kind passes a record. The other schemas are at hand by their file names, as the schema of a change refers to them. */
const check = (kind: string, record: unknown): boolean => {
  const ajv = new Ajv();
  const all = schemas();
  for (const [name, text] of Object.entries(all)) if (name !== `${kind}.schema.json`) ajv.addSchema(JSON.parse(text) as object, name);
  return ajv.compile(JSON.parse(all[`${kind}.schema.json`] as string))(record) as boolean;
};

test('the schemas of a feature, a flow and data pass a good record and refuse a bad one', () => {
  expect(check('features', { name: 'Sales reports', touches: ['person-promoter', 'app-loader'], owner: 'owner-sales' })).toBe(true);
  expect(check('features', { name: 'Sales reports', touches: [] })).toBe(false);
  const step = { id: 'gets', reply: 'asks', name: 'The account', data: ['data-account-details'], after: ['asks'] };
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', feature: 'feature-payments', steps: [{ id: 'asks', does: 'app-asks' }, step] })).toBe(true);
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', steps: [step] })).toBe(false);
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', feature: 'feature-payments', steps: [{ ...step, colour: 'red' }] })).toBe(false);
  expect(check('flows', { name: 'Paying', starts: 'x'.repeat(201), ends: 'Paid', feature: 'feature-payments', steps: [step] })).toBe(false);
  expect(check('data', { name: 'Account details', fields: [{ name: 'balance', description: 'What is owed' }] })).toBe(true);
  expect(check('data', { name: 'Account details', fields: [{ description: 'What is owed' }] })).toBe(false);
});

test("the schema of a flow passes a step with `access` and `removes`, and refuses `access: read-write` and `removes` that is no list of ids", () => {
  const flow = (step: Record<string, unknown>) => ({ name: 'Taking a job', starts: 'A job waits', ends: 'It is done', feature: 'feature-jobs', steps: [{ id: 'takes', does: 'connection-api-takes-jobs', ...step }] });
  expect(check('flows', flow({ access: 'read', data: ['data-job'], removes: ['data-job'] }))).toBe(true);
  expect(check('flows', flow({ access: 'write', removes: ['data-job', 'data-entry'] }))).toBe(true);
  expect(check('flows', flow({ access: 'read-write' }))).toBe(false);
  expect(check('flows', flow({ removes: [] }))).toBe(false);
  expect(check('flows', flow({ removes: 'data-job' }))).toBe(false);
  expect(check('flows', flow({ removes: ['Data job'] }))).toBe(false);
});

test('the schema of a change’s input passes a prompt with a name, with or without what was given, and refuses the rest', () => {
  const input = { name: 'Listening copies on time after a donation', prompt: 'Run two jobs at once.\nNo new hardware.' };
  expect(check('changes', input)).toBe(true);
  expect(check('changes', { ...input, given: ['The copies took longer than two working days.', 'Any way will do.'] })).toBe(true);
  expect(check('changes', { name: input.name })).toBe(false);
  expect(check('changes', { prompt: input.prompt })).toBe(false);
  expect(check('changes', { ...input, need: 'Copies are late.' })).toBe(false);
  expect(check('changes', { ...input, given: [] })).toBe(false);
  expect(check('changes', { ...input, given: ['One line\nand a second'] })).toBe(false);
  expect(check('changes', { ...input, prompt: '   ' })).toBe(false);
  expect(check('changes', { ...input, given: Array.from({ length: 16 }, (_, at) => `Answer ${at}`) })).toBe(false);
});

test('the schema of a change’s input passes what was assumed, with what was given or without it, and refuses what it refuses of what was given', () => {
  const input = { name: 'Listening copies on time after a donation', prompt: 'Run two jobs at once.\nNo new hardware.' };
  const assumed = ['The two jobs share the one machine there is. A second machine would change it.'];
  expect(check('changes', { ...input, assumed })).toBe(true);
  expect(check('changes', { ...input, given: ['Any way will do.'], assumed })).toBe(true);
  expect(check('changes', { ...input, assumed: [] })).toBe(false);
  expect(check('changes', { ...input, assumed: ['One line\nand a second'] })).toBe(false);
  expect(check('changes', { ...input, assumed: [' A space first.'] })).toBe(false);
  expect(check('changes', { ...input, assumed: ['x'.repeat(301)] })).toBe(false);
  expect(check('changes', { ...input, assumed: Array.from({ length: 16 }, (_, at) => `Choice ${at}`) })).toBe(false);
  expect(check('changes', { ...input, assumed: 'One choice.' })).toBe(false);
});

test('the schema of a line of context passes one of must and prefer with a why, and refuses the rest; a system has no such key', () => {
  expect(check('context', { must: 'No order is lost.', why: 'The promise.' })).toBe(true);
  expect(check('context', { prefer: 'One service.', why: 'One team.', system: 'system-shop' })).toBe(true);
  expect(check('context', { must: 'No order is lost.', prefer: 'One service.', why: 'Both.' })).toBe(false);
  expect(check('context', { why: 'Neither.' })).toBe(false);
  expect(check('context', { must: 'No order is lost.' })).toBe(false);
  expect(check('context', { must: 'No order is lost.', why: 'The promise.', name: 'A name' })).toBe(false);
  expect(check('context', { must: 'No order is lost.', why: 'The promise.', system: 'Not an id' })).toBe(false);
  expect(check('systems', { name: 'Shop', context: [{ must: 'No order is lost.', why: 'The promise.' }] })).toBe(false);
});

test('the schema of a change holds its body: a record under add by the schema of its folder, the keys under update by its kind, and paths', () => {
  const input = { name: 'Settlement from a ledger', prompt: 'Move Settlement onto a ledger.' };
  const body = {
    add: { 'apps/app-ledger': { name: 'Ledger', in: 'system-boxwick', kind: 'service' }, 'context/context-payouts-to-the-cent': { must: 'A payout is worked out to the cent.', why: 'Finance asks for it.' } },
    update: { 'apps/app-settlement': { description: 'Reads the ledger.', owner: null }, 'flows/flow-paying-promoters': { steps: ['works-out', { id: 'reads-entries', does: 'connection-settlement-reads-ledger' }] } },
    remove: ['connections/connection-settlement-reads-orders'],
  };
  expect(check('changes', { ...input, ...body })).toBe(true);
  expect(check('changes', input)).toBe(true);
  // A record under `add` is held whole; a key under `update` is one of its kind; a path is a folder and an id.
  expect(check('changes', { ...input, add: { 'apps/app-ledger': { in: 'system-boxwick' } } })).toBe(false);
  expect(check('changes', { ...input, add: { 'apps/app-ledger': { name: 'Ledger', in: 'system-boxwick', colour: 'red' } } })).toBe(false);
  expect(check('changes', { ...input, update: { 'apps/app-settlement': { colour: 'red' } } })).toBe(false);
  expect(check('changes', { ...input, update: { 'apps/app-settlement': {} } })).toBe(false);
  expect(check('changes', { ...input, add: { ledger: { name: 'Ledger', in: 'boxwick' } } })).toBe(false);
  expect(check('changes', { ...input, add: { 'changes/other': { name: 'Other', prompt: 'Another.' } } })).toBe(false);
  expect(check('changes', { ...input, remove: ['apps/Ledger'] })).toBe(false);
  expect(check('changes', { ...input, remove: ['apps/app-ledger', 'apps/app-ledger'] })).toBe(false);
});

test('a schema passes a good record and refuses a bad one', () => {
  expect(check('apps', { name: 'Order API', in: 'system-shop', kind: 'service', technology: ['tech-go'] })).toBe(true);
  expect(check('connections', { from: 'app-a', to: 'app-b', access: 'read' })).toBe(true);
  expect(check('people', { name: 'Alice' })).toBe(true);
  expect(check('apps', { name: 'API', in: 'system-shop', colour: 'red' })).toBe(false);
  expect(check('apps', { name: 'API', in: 'system-shop', kind: 'wizard' })).toBe(false);
  expect(check('apps', { name: 'API' })).toBe(false);
});

test('the schema of a rule passes a good rule of each form and refuses a bad one', () => {
  expect(check('rules', { name: 'Only the API writes orders', each: { to: { id: 'store-orders' }, access: ['write', 'read-write'] }, must: { from: { id: 'app-api' } }, debt: ['connection-worker-writes-orders'] })).toBe(true);
  expect(check('rules', { name: 'No browser reaches outside', never: { from: { kind: 'browser' }, to: { external: true, not: { owner: 'none' } }, via: 'any' } })).toBe(true);
  expect(check('rules', { name: 'People pass the gateway', each: { way: { from: { kind: 'people' }, to: { kind: ['database', 'files'] } } }, must: { through: { within: 'infra-gateway' } } })).toBe(true);
  expect(check('rules', { name: 'Red', never: { from: { not: { colour: 'red' } } } })).toBe(false);
  expect(check('rules', { name: 'Wizards', never: { kind: 'wizard' } })).toBe(false);
  expect(check('rules', { name: 'From a to anywhere', never: { way: { from: { id: 'app-a' } } } })).toBe(true);
  expect(check('rules', { name: 'No end', never: { way: {} } })).toBe(false);
  expect(check('rules', { name: 'A way deep in a selector', never: { from: { way: { to: { id: 'app-a' } } } } })).toBe(false);
  expect(check('rules', { name: 'Through in never', never: { through: { id: 'app-a' } } })).toBe(false);
  expect(check('rules', { never: { id: 'app-a' } })).toBe(false);
  expect(check('rules', { name: 'Empty', never: {} })).toBe(false);
});

test('the schema of a review passes one with points and one with none, and refuses a point with a wrong word, address or id', () => {
  const point = { name: 'An order is typed in and never saved', severity: 'block', about: ['flows/flow-placing-an-order#types-in', 'stores/store-orders', 'need'], finding: 'No step writes the store.' };
  expect(check('reviews', { read: '4c1d9a70' })).toBe(true);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, recommendation: 'The flow says where.', status: 'reopened', comments: ['It says so now.', 'A description says it.'] } } })).toBe(true);
  expect(check('reviews', { points: { 'never-saved': point } })).toBe(false);
  expect(check('reviews', { read: '4C1D9A70' })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'Never saved': point } })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, severity: 'high' } } })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, status: 'done' } } })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, about: ['changes/orders-by-post'] } } })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, about: [] } } })).toBe(false);
  expect(check('reviews', { read: '4c1d9a70', points: { 'never-saved': { ...point, who: 'A reviewer' } } })).toBe(false);
});

test('the schema of a repository passes one in form and refuses a path on a disk, a slash in its name and a workspace that is not true; a system and an app name one, a store does not', () => {
  const repository = { name: 'shop-deploy', description: 'The compose file.', url: 'https://example.org/tea/shop-deploy', workspace: true };
  expect(check('repositories', repository)).toBe(true);
  expect(check('repositories', { name: 'shop-deploy', url: 'git@example.org:tea/shop-deploy.git' })).toBe(true);
  for (const url of ['https://example.org/a', 'http://example.org/a', 'ssh://git@example.org/a.git', 'git://example.org/a', 'git@example.org:tea/shop.git']) expect(check('repositories', { ...repository, url }), url).toBe(true);
  for (const url of ['src/shop', 'shop.git', 'src\\shop', 'FILE:///x', 'h:/srv/shop.git', '/tmp/x', '~/x', './x', 'C:\\x', 'https://example.org/a b', 'https://example.org/a\u0085', 'HTTPS://example.org/a', `https://example.org/${'a'.repeat(181)}`])
    expect(check('repositories', { ...repository, url }), url).toBe(false);
  for (const name of ['tea/shop-deploy', 'tea\\shop-deploy', 'tea:shop', 'shop\tdeploy', '.', '..']) expect(check('repositories', { ...repository, name }), name).toBe(false);
  expect(check('repositories', { ...repository, workspace: false })).toBe(false);
  expect(check('repositories', { ...repository, path: '../shop-deploy' })).toBe(false);
  expect(check('systems', { name: 'Shop', repository: 'repo-shop' })).toBe(true);
  expect(check('apps', { name: 'API', in: 'system-shop', repository: 'repo-shop' })).toBe(true);
  expect(check('stores', { name: 'Orders', in: 'system-shop', repository: 'repo-shop' })).toBe(false);
  expect(check('changes', { name: 'A deploy repository', prompt: 'The deploy files are in their own repository.', add: { 'repositories/repo-shop-deploy': repository } })).toBe(true);
});
