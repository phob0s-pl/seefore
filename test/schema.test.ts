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

const check = (kind: string, record: unknown): boolean => new Ajv().compile(JSON.parse(schemas()[`${kind}.schema.json`] as string))(record);

test('the schemas of a feature, a flow and data pass a good record and refuse a bad one', () => {
  expect(check('features', { name: 'Sales reports', touches: ['promoter', 'loader'], owner: 'sales' })).toBe(true);
  expect(check('features', { name: 'Sales reports', touches: [] })).toBe(false);
  const step = { id: 'gets', reply: 'asks', name: 'The account', data: ['account-details'], after: ['asks'] };
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', feature: 'payments', steps: [{ id: 'asks', does: 'app-asks' }, step] })).toBe(true);
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', steps: [step] })).toBe(false);
  expect(check('flows', { name: 'Paying', starts: 'A fan pays', ends: 'The fan has paid', feature: 'payments', steps: [{ ...step, colour: 'red' }] })).toBe(false);
  expect(check('flows', { name: 'Paying', starts: 'x'.repeat(201), ends: 'Paid', feature: 'payments', steps: [step] })).toBe(false);
  expect(check('data', { name: 'Account details', fields: [{ name: 'balance', description: 'What is owed' }] })).toBe(true);
  expect(check('data', { name: 'Account details', fields: [{ description: 'What is owed' }] })).toBe(false);
});

test('a schema passes a good record and refuses a bad one', () => {
  expect(check('apps', { name: 'Order API', in: 'shop', kind: 'service', technology: ['go'] })).toBe(true);
  expect(check('connections', { from: 'a', to: 'b', access: 'read' })).toBe(true);
  expect(check('people', { name: 'Alice' })).toBe(true);
  expect(check('apps', { name: 'API', in: 'shop', colour: 'red' })).toBe(false);
  expect(check('apps', { name: 'API', in: 'shop', kind: 'wizard' })).toBe(false);
  expect(check('apps', { name: 'API' })).toBe(false);
});

test('the schema of a rule passes a good rule of each form and refuses a bad one', () => {
  expect(check('rules', { name: 'Only the API writes orders', each: { to: { id: 'orders' }, access: ['write', 'read-write'] }, must: { from: { id: 'api' } }, debt: ['worker-writes-orders'] })).toBe(true);
  expect(check('rules', { name: 'No browser reaches outside', never: { from: { kind: 'browser' }, to: { external: true, not: { owner: 'none' } }, via: 'any' } })).toBe(true);
  expect(check('rules', { name: 'People pass the gateway', each: { way: { from: { kind: 'people' }, to: { kind: ['database', 'files'] } } }, must: { through: { within: 'gateway' } } })).toBe(true);
  expect(check('rules', { name: 'Red', never: { from: { not: { colour: 'red' } } } })).toBe(false);
  expect(check('rules', { name: 'Wizards', never: { kind: 'wizard' } })).toBe(false);
  expect(check('rules', { name: 'From a to anywhere', never: { way: { from: { id: 'a' } } } })).toBe(true);
  expect(check('rules', { name: 'No end', never: { way: {} } })).toBe(false);
  expect(check('rules', { name: 'A way deep in a selector', never: { from: { way: { to: { id: 'a' } } } } })).toBe(false);
  expect(check('rules', { name: 'Through in never', never: { through: { id: 'a' } } })).toBe(false);
  expect(check('rules', { never: { id: 'a' } })).toBe(false);
  expect(check('rules', { name: 'Empty', never: {} })).toBe(false);
});
