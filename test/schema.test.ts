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

test('a schema passes a good record and refuses a bad one', () => {
  const check = (kind: string, record: unknown): boolean => new Ajv().compile(JSON.parse(schemas()[`${kind}.schema.json`] as string))(record);
  expect(check('apps', { name: 'Order API', in: 'shop', kind: 'service', technology: ['go'] })).toBe(true);
  expect(check('connections', { from: 'a', to: 'b', access: 'read' })).toBe(true);
  expect(check('people', { name: 'Alice' })).toBe(true);
  expect(check('apps', { name: 'API', in: 'shop', colour: 'red' })).toBe(false);
  expect(check('apps', { name: 'API', in: 'shop', kind: 'wizard' })).toBe(false);
  expect(check('apps', { name: 'API' })).toBe(false);
});
