import { describe, expect, it } from 'vitest';
import { NAME_MAX, readMarker } from '../src/marker.ts';

function problemsOf(text: string) {
  const read = readMarker(text);
  expect(read.marker).toBeUndefined();
  return read.problems.map((problem) => `${problem.line}:${problem.column} ${problem.code} ${problem.message}`);
}

describe('the marker file', () => {
  it('reads format and name', () => {
    expect(readMarker('format: 1\nname: "Boxwick"\n')).toEqual({
      marker: { format: 1, name: 'Boxwick' },
      problems: [],
      readable: true,
    });
  });

  it('reads a name without quotes', () => {
    expect(readMarker('format: 1\nname: Home Assistant\n').marker?.name).toBe('Home Assistant');
  });

  it('names the file in every problem', () => {
    const { problems } = readMarker('format: one\n');
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.file === 'seefore.yaml' && problem.severity === 'error')).toBe(true);
  });

  it('reports a missing key', () => {
    expect(problemsOf('format: 1\n')).toEqual(['1:1 key-missing `name` is missing from the marker file.']);
    expect(problemsOf('name: Boxwick\n')).toEqual(['1:1 key-missing `format` is missing from the marker file.']);
  });

  it('reports a value of the wrong kind, at the value', () => {
    expect(problemsOf('format: 1\nname: 42\n')).toEqual(['2:7 value-wrong-kind `name` must be text, but this is a whole number.']);
    expect(problemsOf('format: one\nname: Boxwick\n')).toEqual(['1:9 value-wrong-kind `format` must be a number, but this is text.']);
    expect(problemsOf('format: 1.5\nname: Boxwick\n')).toEqual([
      '1:9 value-wrong-kind `format` must be a whole number, but this is a number that is not whole.',
    ]);
    expect(problemsOf('format: 1\nname:\n')).toEqual(['2:6 value-wrong-kind `name` must be text, but this is empty.']);
    expect(problemsOf('format: 1\nname: [Box, wick]\n')).toEqual(['2:7 value-wrong-kind `name` must be text, but this is a list.']);
    expect(problemsOf('format: 1\nname: { first: Box }\n')).toEqual(['2:7 value-wrong-kind `name` must be text, but this is a mapping.']);
  });

  it('reports a key it does not have, at the key, and lists the ones it has', () => {
    expect(problemsOf('format: 1\nname: Boxwick\ntitel: Shop\n')).toEqual([
      '3:1 key-unknown `titel` is not a key of the marker file. Its keys are `format` and `name`.',
    ]);
  });

  it('reports an empty name, a name on two lines and a name that is too long', () => {
    expect(problemsOf('format: 1\nname: ""\n')).toEqual(['2:7 value-too-small `name` is empty.']);
    expect(problemsOf('format: 1\nname: "   "\n')).toEqual(['2:7 value-too-small `name` is empty.']);
    expect(problemsOf('format: 1\nname: "Box\\nwick"\n')).toEqual(['2:7 value-invalid `name` must be on one line.']);
    expect(problemsOf(`format: 1\nname: ${'x'.repeat(NAME_MAX + 1)}\n`)).toEqual([
      `2:7 value-too-big \`name\` has ${NAME_MAX + 1} characters. It may have at most ${NAME_MAX}.`,
    ]);
  });

  it('reports a format below 1', () => {
    expect(problemsOf('format: 0\nname: Boxwick\n')).toEqual(['1:9 value-too-small `format` must be at least 1.']);
  });

  it('reports every problem of one read', () => {
    expect(problemsOf('format: one\nname: 42\nextra: true\n')).toHaveLength(3);
  });

  it('refuses a format it cannot read, and says the directory must be left alone', () => {
    const read = readMarker('format: 2\nname: Boxwick\n');
    expect(read.readable).toBe(false);
    expect(read.marker).toEqual({ format: 2, name: 'Boxwick' });
    expect(read.problems).toEqual([
      {
        file: 'seefore.yaml',
        line: 1,
        column: 1,
        severity: 'error',
        code: 'format-not-readable',
        message: 'This directory is written in format 2. This seefore reads format 1. Install a newer seefore to read it.',
      },
    ]);
  });

  it('looks at the format first: a newer format is refused whole, whatever else its marker holds', () => {
    const read = readMarker('format: 2\nname: Boxwick\nnewkey: something\n');
    expect(read.readable).toBe(false);
    expect(read.problems.map((problem) => problem.code)).toEqual(['format-not-readable']);
    const nameless = readMarker('format: 3\ntitle: [a, list]\n');
    expect(nameless.readable).toBe(false);
    expect(nameless.marker).toBeUndefined();
    expect(nameless.problems.map((problem) => problem.code)).toEqual(['format-not-readable']);
  });

  it('refuses a newer format even when the marker breaks a rule of this one', () => {
    const tagged = readMarker('format: 2\nname: !!str Test\n');
    expect(tagged.readable).toBe(false);
    expect(tagged.problems.map((problem) => problem.code)).toEqual(['format-not-readable']);
    expect(tagged.marker).toEqual({ format: 2, name: 'Test' });
    const directive = readMarker('%YAML 1.1\n---\nformat: 5\nname: Test\n');
    expect(directive.readable).toBe(false);
    expect(directive.problems.map((problem) => problem.code)).toEqual(['format-not-readable']);
  });

  it('is not readable when it cannot say which format the directory is in', () => {
    expect(readMarker('format: one\nname: Boxwick\n').readable).toBe(false);
    expect(readMarker('name: Boxwick\n').readable).toBe(false);
    expect(readMarker('format: [1\n').readable).toBe(false);
    expect(readMarker('').readable).toBe(false);
  });

  it('is readable when the format is known, though something else is wrong', () => {
    expect(readMarker('format: 1\n').readable).toBe(true);
    expect(readMarker('format: 1\nname: !!str Test\n').readable).toBe(true);
    expect(readMarker('format: 1\nname: A\nname: B\n').readable).toBe(true);
  });

  it('refuses a comment, names the marker file, and still reads the directory', () => {
    const read = readMarker('# The shop\nformat: 1\nname: Boxwick\n');
    expect(read.readable).toBe(true);
    expect(read.marker).toBeUndefined();
    expect(read.problems.map((problem) => `${problem.line}:${problem.column} ${problem.code} ${problem.message}`)).toEqual([
      '1:1 yaml-comment This line is a comment. The marker file holds no comments, since nothing reads them. Remove it.',
    ]);
    expect(problemsOf('format: 1\nname: Boxwick #2\n')).toEqual([
      '2:15 yaml-comment YAML reads ` #2` as a comment, so the value stops before it. If this is part of the text, ' +
        'put the whole text in double quotes. If it is a note, remove it: the marker file holds no comments.',
    ]);
  });

  it('looks at the format before a comment: a newer format is refused whole', () => {
    const read = readMarker('# Written by a newer seefore\nformat: 2\nname: Boxwick\n');
    expect(read.readable).toBe(false);
    expect(read.problems.map((problem) => problem.code)).toEqual(['format-not-readable']);
  });

  it('passes on what is wrong with the YAML', () => {
    expect(problemsOf('')).toEqual(['1:1 yaml-empty This file is empty. The marker file is a mapping of keys and values.']);
    expect(problemsOf('format: 1\nformat: 1\nname: Boxwick\n')).toEqual([
      '2:1 yaml-key-twice The key `format` is written twice in one mapping. Keep one.',
    ]);
  });
});
