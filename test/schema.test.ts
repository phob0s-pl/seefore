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
