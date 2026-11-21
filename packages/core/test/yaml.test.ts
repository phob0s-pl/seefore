import { describe, expect, it } from 'vitest';
import { readYaml } from '../src/yaml.ts';

function read(text: string) {
  return readYaml('a/thing.yaml', text, 'A record');
}

function only(text: string) {
  const { problems, map } = read(text);
  expect(map).toBeUndefined();
  expect(problems).toHaveLength(1);
  return problems[0]!;
}

describe('reading a YAML file', () => {
  it('reads a mapping', () => {
    const yaml = read('name: Orders\nsize: 3\n');
    expect(yaml.problems).toEqual([]);
    expect(yaml.doc?.toJS()).toEqual({ name: 'Orders', size: 3 });
  });

  it('says where a node is', () => {
    const yaml = read('name: Orders\nsize: 3\n');
    expect(yaml.at(yaml.doc?.getIn(['size'], true))).toEqual({ line: 2, column: 7 });
  });

  it('reports an empty file', () => {
    expect(only('')).toMatchObject({ code: 'yaml-empty', line: 1, column: 1, severity: 'error' });
    expect(only('# only a comment\n').code).toBe('yaml-empty');
  });

  it('reports YAML that cannot be parsed, at its place', () => {
    const problem = only('name: Orders\nitems: [1, 2\nmore: 3\n');
    expect(problem).toMatchObject({ code: 'yaml-syntax', file: 'a/thing.yaml' });
    expect(problem.line).toBeGreaterThan(1);
    expect(problem.message).toMatch(/^This is not YAML that can be read: /);
  });

  it('reports a tab used to indent', () => {
    expect(only('a:\n\tb: 1\n')).toMatchObject({ code: 'yaml-syntax', line: 2 });
  });

  it('reports a key written twice, and names it', () => {
    const problem = only('name: Orders\nsize: 3\nname: Sales\n');
    expect(problem).toMatchObject({ code: 'yaml-key-twice', line: 3, column: 1 });
    expect(problem.message).toBe('The key `name` is written twice in one mapping. Keep one.');
  });

  it('reports a key written twice deeper down', () => {
    expect(only('owner:\n  team: a\n  team: b\n')).toMatchObject({ code: 'yaml-key-twice', line: 3, column: 3 });
  });

  it('reports more than one document', () => {
    expect(only('a: 1\n---\nb: 2\n')).toMatchObject({ code: 'yaml-many-documents', line: 2, column: 1 });
  });

  it('reports a file that is not a mapping', () => {
    expect(only('- a\n- b\n').message).toBe('A record is a mapping of keys and values, but this file holds a list.');
    expect(only('just text\n').message).toBe('A record is a mapping of keys and values, but this file holds a single value.');
  });

  it('reports anchors and aliases', () => {
    const { problems, map } = read('a: &shared 1\nb: *shared\n');
    expect(map).toBeUndefined();
    expect(problems.map((problem) => [problem.code, problem.line, problem.column])).toEqual([
      ['yaml-anchor', 1, 4],
      ['yaml-alias', 2, 4],
    ]);
  });

  it('reports tags', () => {
    const { problems } = read('a: !!str 1\nb: !mine 2\n');
    expect(problems.map((problem) => [problem.code, problem.line, problem.column])).toEqual([
      ['yaml-tag', 1, 4],
      ['yaml-tag', 2, 4],
    ]);
    expect(problems[0]?.message).toContain('`!!str`');
    expect(problems[1]?.message).toContain('`!mine`');
  });

  it('points at a tag where it is written, also when a comment follows it', () => {
    const { problems } = read('a: 1\nname: !!str # comment\n  value\n');
    expect(problems.map((problem) => [problem.code, problem.line, problem.column])).toEqual([['yaml-tag', 2, 7]]);
  });

  it('reports an anchor and a tag on the same value, each at its place', () => {
    const { problems } = read('a: &one !!str text\n');
    expect(problems.map((problem) => [problem.code, problem.line, problem.column])).toEqual([
      ['yaml-anchor', 1, 4],
      ['yaml-tag', 1, 9],
    ]);
  });

  it('refuses a directive, so a file cannot change what its values mean', () => {
    const older = only('%YAML 1.1\n---\nref: on\n');
    expect(older).toMatchObject({ code: 'yaml-directive', line: 1, column: 1 });
    expect(older.message).toBe('Directives (`%YAML`) are not allowed. Remove this line.');
    expect(only('%YAML 1.3\n---\na: 1\n').code).toBe('yaml-directive');
    expect(read('%TAG !e! tag:example.com,2000:\n---\na: 1\n').problems.map((problem) => problem.code)).toEqual(['yaml-directive']);
  });

  it('reads the words older YAML took for true and false as text', () => {
    const yaml = read('a: on\nb: off\nc: yes\nd: no\ne: y\nf: n\ng: ~\nh: True\n');
    expect(yaml.problems).toEqual([]);
    expect(yaml.doc?.toJS()).toEqual({ a: 'on', b: 'off', c: 'yes', d: 'no', e: 'y', f: 'n', g: null, h: true });
  });

  it('reads a file whose lines end in a carriage return alone, and counts its lines', () => {
    const yaml = read('format: 1\rname: Test\r');
    expect(yaml.problems).toEqual([]);
    expect(yaml.doc?.toJS()).toEqual({ format: 1, name: 'Test' });
    expect(only('format: 1\rname: !!str Test\r')).toMatchObject({ code: 'yaml-tag', line: 2, column: 7 });
  });

  it('reads a file whose lines end in carriage return and line feed', () => {
    expect(read('format: 1\r\nname: Test\r\n').doc?.toJS()).toEqual({ format: 1, name: 'Test' });
  });

  it('does not take punctuation inside text for an anchor, an alias or a tag', () => {
    const yaml = read('a: "not &an anchor !tag *alias"\nb: plain ! text & more\nc: a*b\n');
    expect(yaml.problems).toEqual([]);
  });

  it('reports a key that is not text', () => {
    expect(only('1: one\n')).toMatchObject({ code: 'yaml-key-not-text', line: 1, column: 1 });
    expect(only('[a, b]: pair\n').code).toBe('yaml-key-not-text');
  });

  it('does not treat a merge key as a merge', () => {
    const yaml = read('a:\n  x: 1\nb:\n  <<: 2\n');
    expect(yaml.problems).toEqual([]);
    expect(yaml.doc?.toJS()).toEqual({ a: { x: 1 }, b: { '<<': 2 } });
  });
});
