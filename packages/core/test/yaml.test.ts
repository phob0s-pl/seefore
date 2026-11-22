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
    expect(only('\r\n  \n\n').code).toBe('yaml-empty');
  });

  it('reports YAML that cannot be parsed, at its place', () => {
    const problem = only('name: Orders\nitems: [1, 2\nmore: 3\n');
    expect(problem).toMatchObject({ code: 'yaml-syntax', file: 'a/thing.yaml', line: 2, column: 8 });
    expect(problem.message).toBe('This `[` is never closed. Close it with `]`, or, if this is text, put the whole text in double quotes.');
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
    expect(problems.map((problem) => [problem.code, problem.line, problem.column])).toEqual([
      ['yaml-tag', 2, 7],
      ['yaml-comment', 2, 13],
    ]);
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

/** Every problem of a file, as `line:column code message`. */
function problemsOf(text: string): string[] {
  return read(text).problems.map((problem) => `${problem.line}:${problem.column} ${problem.code} ${problem.message}`);
}

/** The same, each as `line:column code` alone. */
function placesOf(text: string): string[] {
  return read(text).problems.map((problem) => `${problem.line}:${problem.column} ${problem.code}`);
}

describe('a comment', () => {
  const cutShort =
    'YAML reads ` #9100 for scrapes.` as a comment, so the value stops before it. If this is part of the text, ' +
    'put the whole text in double quotes. If it is a note, remove it: a record holds no comments.';

  it('is refused after a value, at its `#`, and says what was lost', () => {
    const { problems, map } = read('name: Exporter\ndescription: Listens on port #9100 for scrapes.\n');
    expect(map).toBeUndefined();
    expect(problems).toEqual([{ file: 'a/thing.yaml', line: 2, column: 30, severity: 'error', code: 'yaml-comment', message: cutShort }]);
  });

  it('is the same after a tab as after a space, and shows the comment with no space made up before it', () => {
    expect(problemsOf('name: Exporter\ndescription: Listens on port\t#9100 for scrapes.\n')).toEqual([
      `2:30 yaml-comment ${cutShort.replace('` #9100', '`#9100')}`,
    ]);
    expect(problemsOf('name: Test\t#oops\r\n')[0]).toContain('YAML reads `#oops` as a comment');
  });

  it('is refused where a value should be, and says the value is then empty', () => {
    expect(problemsOf('name: Thing\ndescription: #1 in the queue.\n')).toEqual([
      '2:14 yaml-comment YAML reads ` #1 in the queue.` as a comment, so the value is empty. If this is part of the text, ' +
        'put the whole text in double quotes. If it is a note, remove it: a record holds no comments.',
    ]);
    expect(placesOf('name: Thing\ntechnology:\n  - # c\n  - go\n')).toEqual(['3:5 yaml-comment']);
    expect(problemsOf('name: Thing\ntechnology:\n  - # c\n  - go\n')[0]).toContain('so the value is empty');
  });

  it('is refused on a line of its own', () => {
    expect(problemsOf('# The order service\nname: Orders\n')).toEqual([
      '1:1 yaml-comment This line is a comment. A record holds no comments, since nothing reads them. Remove it, or say it in `description`.',
    ]);
    expect(placesOf('name: Orders\n  # indented\ndescription: Takes orders.\n')).toEqual(['2:3 yaml-comment']);
  });

  it('is refused after a quote, a bracket or the header of a block, though nothing is lost there', () => {
    const note = 'A record holds no comments, since nothing reads them. Remove it, or say it in `description`.';
    expect(problemsOf('name: "Shop" # the old name\n')).toEqual([`1:14 yaml-comment YAML reads \` # the old name\` as a comment. ${note}`]);
    expect(placesOf('name: Thing\ntechnology: [go] # for now\n')).toEqual(['2:18 yaml-comment']);
    expect(placesOf('name: Thing\ndescription: >- # note\n  Takes orders.\n')).toEqual(['2:17 yaml-comment']);
    expect(problemsOf('name: Thing\ndescription: # note\n  Takes orders.\n')).toEqual([`2:14 yaml-comment YAML reads \` # note\` as a comment. ${note}`]);
  });

  it('gives one error for each comment, and reads the file no further', () => {
    expect(placesOf('# a\nname: Thing #b\ndescription: #c\n')).toEqual(['1:1 yaml-comment', '2:13 yaml-comment', '3:14 yaml-comment']);
  });

  it('is placed at a column that counts as the yaml library counts: a character beyond the first 65,536 takes two', () => {
    // `𐐀` is one character and two UTF-16 code units, so the `#` is the tenth character and stands at column 12.
    expect(placesOf('name: 𐐀𐐀 #note\n')).toEqual(['1:12 yaml-comment']);
  });

  it('cuts a long comment short in the message', () => {
    const [problem] = problemsOf(`name: Thing\ndescription: Takes orders #${'and more '.repeat(10)}\n`);
    expect(problem).toContain('YAML reads ` #and more and more and more and more...` as a comment');
  });

  it('is not a `#` inside quotes, inside a word, or at the start of a line of a block', () => {
    for (const text of [
      'name: "Port #9100"\n',
      "name: 'Port #9100'\n",
      'name: Thing\ndescription: "Two lines,\n  #2 of them"\n',
      'name: Issue#42\n',
      'name: Thing\ndescription: >-\n  # not a comment\n  Takes orders.\n',
      'name: Thing\ndescription: |-\n  # not a comment\n  Takes orders.\n',
    ]) {
      expect(read(text).problems).toEqual([]);
    }
    expect(read('name: Thing\ndescription: |-\n  # not a comment\n  Takes orders.\n').doc?.toJS()).toEqual({
      name: 'Thing',
      description: '# not a comment\nTakes orders.',
    });
  });

  it('is found under every way of ending a line', () => {
    expect(placesOf('name: Thing\r\ndescription: port #9100\r\n')).toEqual(['2:19 yaml-comment']);
    expect(placesOf('name: Thing\rdescription: port #9100\r')).toEqual(['2:19 yaml-comment']);
  });

  it('names the marker file, and no `description`, in the marker', () => {
    const marker = readYaml('seefore.yaml', '# Boxwick\nformat: 1\nname: Boxwick\n', 'The marker file', { notesIn: null });
    expect(marker.problems.map((problem) => problem.message)).toEqual([
      'This line is a comment. The marker file holds no comments, since nothing reads them. Remove it.',
    ]);
    const after = readYaml('seefore.yaml', 'format: 1\nname: Boxwick # the shop\n', 'The marker file', { notesIn: null });
    expect(after.problems[0]?.message).toContain('If it is a note, remove it: the marker file holds no comments.');
  });

  it('comes after a fault of syntax, which is reported alone', () => {
    expect(placesOf('# a\nname: [unclosed\n')).toEqual(['2:7 yaml-syntax']);
  });

  it('is refused at each `#` in a file that holds only comments, which is not called empty', () => {
    const line = 'This line is a comment. A record holds no comments, since nothing reads them. Remove it, or say it in `description`.';
    expect(problemsOf('\r\n  # first\r\n# second\r\n')).toEqual([`2:3 yaml-comment ${line}`, `3:1 yaml-comment ${line}`]);
    expect(placesOf('# only a comment\n')).toEqual(['1:1 yaml-comment']);
  });
});

describe('a slip in the YAML', () => {
  const quoteIt = 'Put the whole text in double quotes.';

  it.each([
    ['a colon inside a text, at the colon', 'description: Two modes: node\n', '2:23', `YAML reads this colon as the start of another key. ${quoteIt}`],
    ['a colon at the end of a text, at the colon', 'description: Ends in a colon:\n', '2:29', `YAML reads this colon as the start of another key. ${quoteIt}`],
    ['a colon after a space at the end', 'description: Ends in a colon :\n', '2:30', `YAML reads this colon as the start of another key. ${quoteIt}`],
    ['a text that starts with `@`', 'description: @home is where\n', '2:14', `This text starts with \`@\`, which YAML keeps for itself. ${quoteIt}`],
    ['a text that starts with `%`', 'description: %off\n', '2:14', `This text starts with \`%\`, which YAML keeps for itself. ${quoteIt}`],
    ['a text that starts with a backtick', 'description: `tick` marks\n', '2:14', `This text starts with a backtick, which YAML keeps for itself. ${quoteIt}`],
    ['a text that starts with `>`', 'description: > is more\n', '2:14', `This text starts with \`>\`, which YAML keeps for itself. ${quoteIt}`],
    ['a text that starts with `&` and a space', 'description: & more\n', '2:14', `This text starts with \`&\`, which YAML keeps for itself. ${quoteIt}`],
    [
      'a text that starts with a quoted word',
      'description: "Fast" checkout\n',
      '2:14',
      `YAML reads the start of this value as something that ends before the line does. ${quoteIt}`,
    ],
    ['a text that starts with `[`', 'description: [draft] Takes orders\n', '2:14', `YAML reads the start of this value as something that ends before the line does. ${quoteIt}`],
    ['a text that starts with `*`', 'description: *star of the show\n', '2:14', `YAML reads the start of this value as something that ends before the line does. ${quoteIt}`],
    ['a text that starts with `- `', 'description: - first of all\n', '2:14', `YAML gives \`- \` a meaning at the start of a value. ${quoteIt}`],
    ['a text that starts with `? `', 'description: ? who knows\n', '2:14', `YAML gives \`? \` a meaning at the start of a value. ${quoteIt}`],
    ['a tab before a key that belongs beside the one above', '\tdescription: Takes orders.\n', '2:1', 'Remove the tab and line `description` up with `name`.'],
    ['a tab before a key, after a list', 'technology:\n  - go\n\tdescription: Takes orders.\n', '4:1', 'Remove the tab and line `description` up with `technology`.'],
    ['a tab before a key under a key with no value', 'owner:\n\tteam: shop\n', '3:1', 'Indent this line with spaces. A tab cannot set the indent.'],
    ['a tab that indents a value', 'description:\n\tTakes orders.\n', '3:1', 'Indent this line with spaces. A tab cannot set the indent.'],
    ['a tab that indents a block', 'description: |\n\tTakes orders.\n', '3:1', 'Indent this line with spaces. A tab cannot set the indent.'],
    [
      'a backslash that starts no escape',
      'description: "C:\\zebra"\n',
      '2:17',
      'In double quotes a backslash starts an escape, and `\\z` is not one YAML knows. To write a backslash, write two: `\\\\`.',
    ],
    [
      'a `\\u` with too few digits, at the first that is not one',
      'description: "prefix\\u12XX"\n',
      '2:25',
      'After `\\u`, write four hexadecimal digits, or write the character itself. To write a backslash, write two: `\\\\`.',
    ],
    [
      'a `\\x` with too few digits, at the first that is not one',
      'description: "a\\x4"\n',
      '2:19',
      'After `\\x`, write two hexadecimal digits, or write the character itself. To write a backslash, write two: `\\\\`.',
    ],
    [
      'a `\\U` with too few digits, at the first that is not one',
      'description: "\\U0001F6"\n',
      '2:23',
      'After `\\U`, write eight hexadecimal digits, or write the character itself. To write a backslash, write two: `\\\\`.',
    ],
    [
      'a `\\U` whose digits name no character',
      'description: "\\UFFFFFFFF"\n',
      '2:15',
      'In double quotes `\\UFFFFFFFF` stands for no character. Write the character itself. To write a backslash, write two: `\\\\`.',
    ],
    [
      'a `]` too many after a list',
      'technology: [emoji]]\n',
      '2:20',
      'This `]` closes nothing. Remove it, or, if this is text, put the whole text in double quotes.',
    ],
    [
      'a `}` too many after a mapping',
      'owner: {team: a}}\n',
      '2:17',
      'This `}` closes nothing. Remove it, or, if this is text, put the whole text in double quotes.',
    ],
    ['a text that starts with `]`', 'description: ]x\n', '2:14', `This text starts with \`]\`, which YAML keeps for itself. ${quoteIt}`],
    ['a quote never closed', 'description: "Takes orders\nowner: shop-team\n', '2:14', 'This `"` is never closed. Put another `"` at the end of the text.'],
    [
      'a line indented under a key, with a colon in it',
      'description: Takes orders\n  and says: done\n',
      '3:11',
      'YAML reads this line as part of the value above it, and this colon as the start of another key. If the line is part of that text, ' +
        'put the whole text in double quotes. If it is a key of its own, start it at the beginning of the line.',
    ],
    ['a fault it does not know', '- first\nname: Thing\n', '2:1', 'YAML cannot read this. Check the indent, the quotes and the brackets around this place.'],
  ])('explains %s, once, in plain words', (_what, text, place, message) => {
    const body = text.startsWith('- ') ? text : `name: Thing\n${text}`;
    expect(problemsOf(body)).toEqual([`${place} yaml-syntax ${message}`]);
  });

  it('says to take the tab off a first key, which starts its line', () => {
    expect(problemsOf('\tname: Thing\n')).toEqual(['1:1 yaml-syntax Remove the tab, so that `name` starts the line.']);
  });

  it('explains each slip on its own line', () => {
    expect(placesOf('name: A: b\ndescription: Two modes: node\n')).toEqual(['1:8 yaml-syntax', '2:23 yaml-syntax']);
  });

  it('points at the first colon of several on one line, once', () => {
    expect(placesOf('name: Thing\ndescription: a: b: c\n')).toEqual(['2:15 yaml-syntax']);
  });

  it('says an anchor, an alias or a tag may have been meant as text', () => {
    const asText = 'If this is text, put it in double quotes.';
    expect(problemsOf('name: Thing\ndescription: &and more\n')).toEqual([
      `2:14 yaml-anchor Anchors (\`&and\`) are not allowed. Write the value out where it is used. ${asText}`,
    ]);
    expect(problemsOf('name: Thing\ndescription: !bang more\n')).toEqual([`2:14 yaml-tag Tags (\`!bang\`) are not allowed. Write the plain value. ${asText}`]);
    expect(problemsOf('name: Thing\ndescription: *star\n')).toEqual([`2:14 yaml-alias Aliases (\`*star\`) are not allowed. Write the value out. ${asText}`]);
  });

  it('never passes on the parser\'s own words', () => {
    for (const text of ['a: [1, 2\n', 'a: b: c\n', 'a:\n\tb\n', '- a\nb: c\n', 'a: "x\n', 'a: |x\n  b\n', 'a: ]x\n', 'a: {b\n']) {
      for (const problem of read(text).problems) {
        expect(problem.code).toBe('yaml-syntax');
        expect(problem.message).not.toMatch(/mapping|implicit|scalar|indicator|token|flow|block/i);
      }
    }
  });
});
