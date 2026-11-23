import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C4_CODES, CROWDED_FROM } from '@seefore/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult, Failure } from '../src/check.ts';
import { HELP, main } from '../src/main.ts';

const MARKER = 'format: 1\nname: Boxwick\n';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-test-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes files under the temporary folder. A path's folders are made as needed. */
function write(files: Record<string, string | Uint8Array>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
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

function json(args: string[], cwd = '.') {
  const result = run([...args, '--json'], cwd);
  return { code: result.code, data: JSON.parse(result.out) as CheckResult & Failure };
}

/**
 * The block of the C4 checks, with the blank line after it, for a model of this many things,
 * parts and connections, each of which lacks nothing. When part of the directory was left out,
 * the check of a connection says so.
 */
function block(things = 0, parts = 0, connections = 0, complete = true): string[] {
  return [
    'C4 checks, which count what the model lacks:',
    `- A description: ${things} ${things === 1 ? 'thing' : 'things'} checked, 0 without.`,
    `- A technology: ${parts} ${parts === 1 ? 'app, store or component' : 'apps, stores and components'} checked, 0 without.`,
    `- A name for a connection: ${connections} ${connections === 1 ? 'connection' : 'connections'} checked, 0 without.`,
    `- A name that is more than the word "Uses": ${connections} ${connections === 1 ? 'name' : 'names'} checked, 0 that are only that word.`,
    complete ? `- A connection: ${things} ${things === 1 ? 'thing' : 'things'} checked, 0 with none.` : '- A connection: not checked: part of the directory was left out, as the problems above say.',
    '',
  ];
}

/** A source directory made by code: a system with this many apps in it, and so this many boxes in its container view. */
function crowded(apps: number): Record<string, string> {
  const files: Record<string, string> = { 'seefore.yaml': MARKER, 'systems/shop.yaml': 'name: Shop\n' };
  for (let n = 1; n <= apps; n += 1) files[`apps/app-${n}.yaml`] = `name: App ${n}\nin: shop\n`;
  return files;
}

/** What the warning says of a container view of the shop with this many boxes. */
function crowdedMessage(boxes: number): string {
  return (
    `The container view of Shop has ${boxes} boxes. A view of more than ${CROWDED_FROM} cannot be read as one picture: ` +
    'the page draws it as a map. Until focused views exist, read it by pointing at a box.'
  );
}

describe('seefore check', () => {
  it('passes a directory that has only its marker, and says it read no records', () => {
    write({ 'seefore.yaml': MARKER });
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out.split('\n')).toEqual(['Boxwick', `format 1, ${root}`, '', ...block(), '0 records read. No problems.']);
  });

  it('finds the source directory from a folder inside it', () => {
    write({ 'arch/seefore.yaml': MARKER, 'arch/deep/down/note.txt': 'x' });
    const result = json(['check'], 'arch/deep/down');
    expect(result.code).toBe(0);
    expect(result.data.directory).toBe(join(root, 'arch'));
  });

  it('starts from --workdir, in either spelling, whatever the current folder', () => {
    write({ 'repo/architecture/seefore.yaml': MARKER, 'elsewhere/x.txt': '' });
    expect(json(['check', '--workdir=../repo/architecture'], 'elsewhere').data.directory).toBe(join(root, 'repo/architecture'));
    expect(json(['check', '--workdir', join(root, 'repo/architecture')], 'elsewhere').data.name).toBe('Boxwick');
  });

  it('does not pick a source directory below the starting folder, but says where it is', () => {
    write({ 'repo/architecture/seefore.yaml': MARKER });
    const result = run(['check'], 'repo');
    expect(result.code).toBe(2);
    expect(result.out).toBe('');
    expect(result.err).toContain(`There is no seefore.yaml in \`${join(root, 'repo')}\` or in any folder above it`);
    expect(result.err).toContain('There is one below it. To check it, run: seefore check --workdir=architecture');
    expect(json(['check'], 'repo').data.error.below).toEqual([join(root, 'repo/architecture')]);
  });

  it('gives a command that works from where the person stands, also for a path with a space', () => {
    write({ 'my repo/docs/architecture/seefore.yaml': MARKER, 'elsewhere/x.txt': '' });
    const result = run(['check', '--workdir=../my repo'], 'elsewhere');
    expect(result.code).toBe(2);
    const hint = /run: seefore check (--workdir=.*)$/.exec(result.err)?.[1];
    expect(hint).toBe('--workdir="../my repo/docs/architecture"');
    // What it printed is what a shell would pass on once the quotes are taken off.
    const again = json(['check', hint!.replace(/"/g, '')], 'elsewhere');
    expect(again.code).toBe(0);
    expect(again.data.directory).toBe(join(root, 'my repo/docs/architecture'));
  });

  it('lists every source directory below when there are several, and skips hidden folders', () => {
    write({
      'repo/a/architecture/seefore.yaml': MARKER,
      'repo/b/seefore.yaml': MARKER,
      'repo/b/inner/seefore.yaml': MARKER,
      'repo/.cache/x/seefore.yaml': MARKER,
      'repo/node_modules/y/seefore.yaml': MARKER,
      'repo/one/two/three/four/seefore.yaml': MARKER,
    });
    const result = json(['check'], 'repo');
    expect(result.code).toBe(2);
    expect(result.data.error.below).toEqual([join(root, 'repo/a/architecture'), join(root, 'repo/b')]);
    expect(result.data.error.message).toContain('There are 2 below it. To check one, run seefore check with one of: --workdir=a/architecture, --workdir=b');
  });

  it('cannot start in a folder that does not exist', () => {
    const result = run(['check', '--workdir=nowhere']);
    expect(result.code).toBe(2);
    expect(result.err).toContain(`\`${join(root, 'nowhere')}\` is not a directory.`);
  });

  it('prints why it could not start as data too', () => {
    const result = json(['check']);
    expect(result.code).toBe(2);
    expect(result.data.error.code).toBe('no-source-directory');
    expect(result.data.error.message).toContain('seefore.yaml');
    expect(result.data.error.message).toContain('To start one, use the `init` skill of the seefore plugin.');
    expect(result.data.error.below).toBeUndefined();
  });

  it('reports a broken marker with its file, line and column, and exits with 1', () => {
    write({ 'seefore.yaml': 'format: 1\nname: 42\ntitel: Shop\n' });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n')).toEqual([
      '(no name: the marker file could not be read)',
      `format unknown, ${root}`,
      '',
      'seefore.yaml:2:7: error: `name` must be text, but this is a whole number.',
      'seefore.yaml:3:1: error: `titel` is not a key of the marker file. Its keys are `format` and `name`.',
      '',
      // The format can be read, so the records are, and four of the checks run on them.
      ...block(0, 0, 0, false),
      '0 records read. 2 errors, 0 warnings.',
    ]);
  });

  it('prints paths from the current folder, so they can be opened from there', () => {
    write({ 'repo/architecture/seefore.yaml': 'format: 1\n' });
    const result = run(['check', '--workdir=repo/architecture']);
    expect(result.out).toContain('repo/architecture/seefore.yaml:1:1: error: `name` is missing from the marker file.');
  });

  it('warns about YAML it does not read, and still exits with 0', () => {
    write({ 'seefore.yaml': MARKER, 'elements/shop.yaml': 'name: Shop\n', 'notes.yml': 'a: 1\n', 'README.md': '# hi' });
    const result = json(['check']);
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ name: 'Boxwick', format: 1, records: 0, errors: 0, warnings: 2 });
    expect(result.data.problems.map((problem) => [problem.file, problem.severity, problem.code])).toEqual([
      ['elements/shop.yaml', 'warning', 'not-read'],
      ['notes.yml', 'warning', 'not-read'],
    ]);
  });

  it('gives each problem as data with its place', () => {
    write({ 'seefore.yaml': 'format: 1\nname: Boxwick\nname: Again\n' });
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data.problems).toEqual([
      {
        file: 'seefore.yaml',
        line: 3,
        column: 1,
        severity: 'error',
        code: 'yaml-key-twice',
        message: 'The key `name` is written twice in one mapping. Keep one.',
      },
    ]);
  });

  it('skips hidden folders and node_modules', () => {
    write({ 'seefore.yaml': MARKER, '.git/config.yaml': 'a: 1\n', 'node_modules/x/y.yaml': 'a: 1\n', '.hidden.yaml': 'a: 1\n' });
    expect(json(['check']).data.problems).toEqual([]);
  });

  it('reports a file that is not UTF-8, and says how to mend it', () => {
    write({ 'seefore.yaml': MARKER, 'things/bad.yaml': new Uint8Array([0x6e, 0x3a, 0x20, 0xff, 0xfe]) });
    const result = json(['check']);
    expect(result.code).toBe(1);
    // It is in a folder seefore does not read, which is said too.
    expect(result.data.problems).toMatchObject([
      { file: 'things/bad.yaml', line: 1, column: 1, severity: 'warning', code: 'not-read' },
      {
        file: 'things/bad.yaml',
        line: 1,
        column: 1,
        severity: 'error',
        code: 'not-utf8',
        message: 'This file is not UTF-8 text, so it could not be read. Save it as UTF-8.',
      },
    ]);
  });

  it('keeps a record whose file is not UTF-8 for the records that name it, and for seefore uses', () => {
    write({
      'seefore.yaml': MARKER,
      'apps/search.yaml': 'name: Search\nin: catalog\n',
      'connections/find.yaml': 'from: search\nto: catalog\n',
      'systems/catalog.yaml': new Uint8Array([0xff, 0x0a]),
    });
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data.records).toBe(2);
    expect(result.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['systems/catalog.yaml not-utf8']);
    const uses = run(['uses', 'catalog', '--json']);
    expect(uses.code).toBe(0);
    expect(JSON.parse(uses.out)).toMatchObject({ record: { id: 'catalog', family: 'systems', file: 'systems/catalog.yaml' }, complete: false });
  });

  it.skipIf(process.getuid?.() === 0)('keeps a record whose file the disk would not give, and says how to mend it', () => {
    write({ 'seefore.yaml': MARKER, 'apps/search.yaml': 'name: Search\nin: catalog\n', 'systems/catalog.yaml': 'name: Catalog\n' });
    chmodSync(join(root, 'systems', 'catalog.yaml'), 0o000);
    try {
      const result = json(['check']);
      expect(result.code).toBe(1);
      expect(result.data.problems).toEqual([
        { file: 'systems/catalog.yaml', line: 1, column: 1, severity: 'error', code: 'file-unreadable', message: 'This file could not be read: EACCES. Make it readable.' },
      ]);
    } finally {
      chmodSync(join(root, 'systems', 'catalog.yaml'), 0o644);
    }
  });

  it('reads no record under a marker spelt another way in a format it cannot read', () => {
    write({ 'seefore.yml': 'format: 2\nname: Future\n', 'systems/later.yaml': 'name: Future app\n' });
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data).toMatchObject({ name: 'Future', format: 2, records: 0 });
    expect(result.data.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.code}`)).toEqual([
      'seefore.yml:1:1 format-not-readable',
      'seefore.yml:1:1 marker-name',
    ]);
    expect(JSON.parse(run(['list', '--json']).out)).toMatchObject({ systems: [] });
  });

  it('reads no record when the marker writes `format` twice', () => {
    write({ 'seefore.yaml': 'format: 1\nformat: 2\nname: Test\n', 'systems/future.yaml': 'name: Future thing\n' });
    const result = json(['check']);
    expect(result.data.records).toBe(0);
    expect(result.data.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.code}`)).toEqual([
      'seefore.yaml:1:1 format-unknown',
      'seefore.yaml:2:1 yaml-key-twice',
    ]);
  });

  it('does not follow links, and says so', () => {
    write({ 'outside/secret.yaml': 'a: 1\n', 'inside/seefore.yaml': MARKER });
    symlinkSync(join(root, 'outside'), join(root, 'inside', 'linked'));
    const result = json(['check'], 'inside');
    expect(result.code).toBe(0);
    expect(result.data.problems.map((problem) => [problem.file, problem.severity, problem.code])).toEqual([
      ['linked', 'warning', 'link-not-followed'],
    ]);
  });

  it('reports a source directory inside another', () => {
    write({ 'seefore.yaml': MARKER, 'inner/seefore.yaml': MARKER });
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['inner/seefore.yaml marker-nested']);
  });

  it('reports a source directory inside another when started from the inner one too', () => {
    write({ 'outer/seefore.yaml': MARKER, 'outer/inner/seefore.yaml': MARKER });
    const result = json(['check'], 'outer/inner');
    expect(result.code).toBe(1);
    expect(result.data.directory).toBe(join(root, 'outer/inner'));
    expect(result.data.problems).toMatchObject([{ file: 'seefore.yaml', line: 1, column: 1, severity: 'error', code: 'marker-nested' }]);
    expect(result.data.problems[0]?.message).toContain(`at \`${join(root, 'outer')}\``);
  });

  it('is not fooled by a link into a source directory', () => {
    write({ 'outer/seefore.yaml': MARKER, 'outer/child/note.txt': '' });
    symlinkSync(join(root, 'outer', 'child'), join(root, 'alias'));
    const result = json(['check', '--workdir=alias']);
    expect(result.code).toBe(0);
    expect(result.data.directory).toBe(join(root, 'outer'));
  });

  it('follows a link before it applies a .. after it, as the system does', () => {
    write({ 'outer/seefore.yaml': MARKER, 'outer/child/note.txt': '', 'fresh/x.txt': '' });
    symlinkSync(join(root, 'outer', 'child'), join(root, 'alias'));
    // On disk `alias/..` is `outer`, though read as text it looks like the folder above `alias`.
    expect(json(['check', '--workdir=alias/..']).data.directory).toBe(join(root, 'outer'));
    const missing = json(['check', '--workdir=alias/../fresh']);
    expect(missing.code).toBe(2);
    expect(missing.data.error.code).toBe('not-a-directory');
  });

  it('says where the starting folder really is when it finds no source directory', () => {
    write({ 'plain/sub/x.txt': '' });
    symlinkSync(join(root, 'plain', 'sub'), join(root, 'shortcut'));
    const result = json(['check', '--workdir=shortcut']);
    expect(result.data.error).toMatchObject({ code: 'no-source-directory', start: join(root, 'plain', 'sub') });
  });

  it.skipIf(process.getuid?.() === 0)('cannot tell about a folder it may not look into, and says so', () => {
    write({ 'locked/seefore.yaml': MARKER });
    chmodSync(join(root, 'locked'), 0o000);
    try {
      const result = json(['check', '--workdir=locked']);
      expect(result.code).toBe(2);
      expect(result.data.error.code).toBe('folder-unreadable');
      expect(result.data.error.message).toContain('so seefore cannot tell whether it is a source directory');
    } finally {
      chmodSync(join(root, 'locked'), 0o755);
    }
  });

  it.skipIf(process.getuid?.() === 0)('finds a marker in a folder it may enter but not list, and reports the folder', () => {
    write({ 'dark/seefore.yaml': MARKER });
    chmodSync(join(root, 'dark'), 0o300);
    try {
      const result = json(['check', '--workdir=dark']);
      expect(result.code).toBe(1);
      expect(result.data.directory).toBe(join(root, 'dark'));
      expect(result.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['. folder-unreadable', 'seefore.yaml marker-missing']);
    } finally {
      chmodSync(join(root, 'dark'), 0o755);
    }
  });

  it('reports a marker further down under any spelling, and one that is a link', () => {
    write({ 'seefore.yaml': MARKER, 'a/seefore.yml': MARKER, 'b/SEEFORE.YAML': MARKER, 'c/x.txt': '' });
    symlinkSync(join(root, 'nowhere.yaml'), join(root, 'c', 'seefore.yaml'));
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual([
      'a/seefore.yml marker-nested',
      'b/SEEFORE.YAML marker-nested',
      'c/seefore.yaml marker-nested',
    ]);
  });

  it('reads nothing else when the marker cannot say which format the directory is in', () => {
    write({ 'seefore.yaml': 'format: one\nname: Boxwick\n', 'elements/shop.yaml': 'name: Shop\n' });
    const result = json(['check']);
    expect(result.code).toBe(1);
    expect(result.data.problems.map((problem) => `${problem.file} ${problem.severity} ${problem.code}`)).toEqual([
      'seefore.yaml warning format-unknown',
      'seefore.yaml error value-wrong-kind',
    ]);
  });

  it('takes a marker that is a link as a marker, says it must be a file, and reads nothing else', () => {
    write({ 'real/seefore.yaml': MARKER, 'linked/systems/shop.yaml': 'name: Shop\n', 'dangling/x.txt': '' });
    symlinkSync(join(root, 'real', 'seefore.yaml'), join(root, 'linked', 'seefore.yaml'));
    symlinkSync(join(root, 'nowhere.yaml'), join(root, 'dangling', 'seefore.yaml'));
    for (const folder of ['linked', 'dangling']) {
      const result = json(['check'], folder);
      expect(result.code).toBe(1);
      expect(result.data.directory).toBe(join(root, folder));
      expect(result.data.records).toBe(0);
      expect(result.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['seefore.yaml format-unknown', 'seefore.yaml marker-link']);
    }
  });

  it('takes a marker under another spelling as a marker, and says how it is spelt', () => {
    write({ 'upper/SEEFORE.YAML': MARKER, 'short/seefore.yml': MARKER });
    const upper = json(['check'], 'upper');
    expect(upper.code).toBe(1);
    expect(upper.data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual(['SEEFORE.YAML marker-name']);
    expect(json(['check'], 'short').data.problems[0]?.message).toBe('The marker file is named `seefore.yaml`, in lowercase, not `seefore.yml`.');
  });

  it('warns about YAML whose ending is in capitals', () => {
    write({ 'seefore.yaml': MARKER, 'elements/Orders.YAML': ': broken' });
    const result = json(['check']);
    expect(result.data.problems.map((problem) => [problem.file, problem.severity, problem.code])).toEqual([
      ['elements/Orders.YAML', 'warning', 'not-read'],
    ]);
  });

  it.skipIf(process.getuid?.() === 0)('reports a folder it cannot read, and still reads the rest', () => {
    write({ 'seefore.yaml': MARKER, 'locked/a.yaml': 'a: 1\n', 'open/b.yaml': 'b: 1\n' });
    chmodSync(join(root, 'locked'), 0o000);
    try {
      const result = json(['check']);
      expect(result.code).toBe(1);
      expect(result.data.problems.map((problem) => [problem.file, problem.severity, problem.code])).toEqual([
        ['locked', 'error', 'folder-unreadable'],
        ['open/b.yaml', 'warning', 'not-read'],
      ]);
      expect(run(['check']).out).toContain('locked:1:1: error: This folder could not be read: EACCES.');
    } finally {
      chmodSync(join(root, 'locked'), 0o755);
    }
  });

  it('reports what is wrong with the records, each at its place, and counts the records it read', () => {
    write({
      'seefore.yaml': MARKER,
      'systems/shop.yaml': 'name: Shop\n',
      'stores/orders.yaml': 'name: Orders\nin: shop\n',
      'apps/order-api.yaml': 'name: Order API\nin: orders\nkind: server\n',
      'connections/orders-tell.yaml': 'from: orders\nto: shop\nname: Says what is new\n',
    });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n').slice(3)).toEqual([
      'apps/order-api.yaml:2:5: error: `in` names `orders`, which is a store. An app is in a system.',
      'apps/order-api.yaml:3:7: error: `kind` must be one of `service`, `browser`, `mobile`, `desktop`, `command`, `function` and `job`.',
      'connections/orders-tell.yaml:1:7: error: This connection goes from the store `orders` to the system `shop`, but a store acts on nothing ' +
        'but another store. Turn it round, so that it goes from the one that reads or writes the store, and say which in its name.',
      '',
      // The checks read the two records whose files have no error.
      'C4 checks, which count what the model lacks:',
      '- A description: 2 things checked, 2 without.',
      '- A technology: 1 app, store or component checked, 1 without.',
      '- A name for a connection: 0 connections checked, 0 without.',
      '- A name that is more than the word "Uses": 0 names checked, 0 that are only that word.',
      '- A connection: not checked: part of the directory was left out, as the problems above say.',
      '`seefore check --full` lists each.',
      '',
      '4 records read. 3 errors, 0 warnings.',
    ]);
    expect(json(['check']).data.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.code}`)).toEqual([
      'apps/order-api.yaml:2:5 reference-wrong-kind',
      'apps/order-api.yaml:3:7 value-not-allowed',
      'connections/orders-tell.yaml:1:7 store-acts',
    ]);
  });

  it('refuses a comment, says what to do about a slip in plain words, and keeps every code', () => {
    write({
      'seefore.yaml': MARKER,
      'systems/shop.yaml': 'name: Shop\n',
      'apps/port.yaml': 'name: Exporter\nin: shop\ndescription: Listens on port #9100 for scrapes.\n',
      'apps/modes.yaml': 'name: Modes\nin: shop\ndescription: Two modes: node\n',
      'systems/argue.yaml': 'name: Argue\nowner: Two teams argue\n',
      'stores/work.yaml': 'name: Work\nin: shop\nkind: stream\n',
    });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n').slice(3)).toEqual([
      'apps/modes.yaml:3:23: error: YAML reads this colon as the start of another key. Put the whole text in double quotes.',
      'apps/port.yaml:3:30: error: YAML reads ` #9100 for scrapes.` as a comment, so the value stops before it. If this is part of the text, ' +
        'put the whole text in double quotes. If it is a note, remove it: a record holds no comments.',
      'stores/work.yaml:3:7: error: `kind` must be one of `database`, `files`, `cache`, `index`, `queue` and `topic`.',
      'systems/argue.yaml:2:8: error: `owner` holds the id of a record in `owners/`. ' +
        'If who answers takes a sentence to say, leave `owner` out and put the sentence in the description.',
      '',
      'C4 checks, which count what the model lacks:',
      '- A description: 1 thing checked, 1 without.',
      '- A technology: 0 apps, stores and components checked, 0 without.',
      '- A name for a connection: 0 connections checked, 0 without.',
      '- A name that is more than the word "Uses": 0 names checked, 0 that are only that word.',
      '- A connection: not checked: part of the directory was left out, as the problems above say.',
      '`seefore check --full` lists each.',
      '',
      // The two files YAML cannot read whole are not read at all.
      '3 records read. 4 errors, 0 warnings.',
    ]);
    expect(json(['check']).data.problems.map((problem) => `${problem.file} ${problem.code}`)).toEqual([
      'apps/modes.yaml yaml-syntax',
      'apps/port.yaml yaml-comment',
      'stores/work.yaml value-not-allowed',
      'systems/argue.yaml value-invalid',
    ]);
  });

  it('refuses a comment in the marker, and still reads the records', () => {
    write({ 'seefore.yaml': '# The shop\nformat: 1\nname: Boxwick\n', 'systems/shop.yaml': 'name: Shop\n' });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n')).toEqual([
      '(no name: the marker file could not be read)',
      `format unknown, ${root}`,
      '',
      'seefore.yaml:1:1: error: This line is a comment. The marker file holds no comments, since nothing reads them. Remove it.',
      '',
      'C4 checks, which count what the model lacks:',
      '- A description: 1 thing checked, 1 without.',
      '- A technology: 0 apps, stores and components checked, 0 without.',
      '- A name for a connection: 0 connections checked, 0 without.',
      '- A name that is more than the word "Uses": 0 names checked, 0 that are only that word.',
      '- A connection: not checked: part of the directory was left out, as the problems above say.',
      '`seefore check --full` lists each.',
      '',
      '1 record read. 1 error, 0 warnings.',
    ]);
  });

  // A warning never changes the exit code, whichever check gives it.
  it.each([
    [
      'two connections that say one thing',
      {
        'seefore.yaml': MARKER,
        'people/customer.yaml': 'name: Customer\n',
        'systems/shop.yaml': 'name: Shop\n',
        'connections/buys.yaml': 'from: customer\nto: shop\nname: Buys\n',
        'connections/buys-again.yaml': 'from: customer\nto: shop\nname: Buys\n',
      },
      'connections/buys.yaml:1:1: warning: This connection has the same `from`, `to` and `name` as `connections/buys-again.yaml`. ' +
        'If these are the same exchange, keep one. If they are two ways of one exchange, give each its route in `via`, or say in `only` when each is taken. ' +
        'If their purposes differ, give each a name that says which.',
      '4 records read. 0 errors, 2 warnings.',
    ],
    ['a crowded view', crowded(CROWDED_FROM + 1), `systems/shop.yaml:1:1: warning: ${crowdedMessage(CROWDED_FROM + 1)}`, `${CROWDED_FROM + 2} records read. 0 errors, 1 warning.`],
  ])('passes a directory whose records keep every rule, with a warning about %s', (_what, files, line, counted) => {
    write(files);
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.out).toContain(line);
    expect(result.out.endsWith(counted)).toBe(true);
  });

  it('gives a crowded view as data, as any other problem, and still exits with 0', () => {
    write(crowded(CROWDED_FROM + 1));
    const result = json(['check']);
    expect(result.code).toBe(0);
    expect(result.data).toMatchObject({ records: CROWDED_FROM + 2, errors: 0, warnings: 1 });
    expect(result.data.problems).toEqual([
      { file: 'systems/shop.yaml', line: 1, column: 1, severity: 'warning', code: 'view-crowded', message: crowdedMessage(CROWDED_FROM + 1) },
    ]);
    expect(json(['check'], 'systems').data.problems).toEqual(result.data.problems);
  });

  it('refuses a directory written in a newer format', () => {
    write({ 'seefore.yaml': 'format: 2\nname: Boxwick\n' });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.startsWith(`Boxwick\nformat 2, ${root}\n`)).toBe(true);
    expect(result.out).toContain('seefore.yaml:1:1: error: This directory is written in format 2. This seefore reads format 1.');
  });
});

/** These files under a folder of the temporary folder. */
function under(folder: string, files: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, text]) => [`${folder}/${path}`, text]));
}

/** A shop with one of each thing the C4 checks find: a person with no description, an app with no technology, a connection with no name, one named only "Uses", and an app that no connection reaches. */
const GAPS: Readonly<Record<string, string>> = {
  'seefore.yaml': MARKER,
  'people/fan.yaml': 'name: Fan\n',
  'systems/shop.yaml': 'name: Shop\ndescription: Sells.\n',
  'apps/api.yaml': 'name: API\nin: shop\ndescription: Takes orders.\n',
  'apps/report.yaml': 'name: Report\nin: shop\ndescription: Sums up.\ntechnology: [go]\n',
  'connections/fan-to-api.yaml': 'from: fan\nto: api\n',
  'connections/fan-uses-shop.yaml': 'from: fan\nto: shop\nname: Uses\n',
  'technologies/go.yaml': 'name: Go\n',
};

/** The same shop, lacking nothing the checks ask for. */
const WHOLE: Readonly<Record<string, string>> = {
  ...GAPS,
  'people/fan.yaml': 'name: Fan\ndescription: Buys.\n',
  'apps/api.yaml': 'name: API\nin: shop\ndescription: Takes orders.\ntechnology: [go]\n',
  'connections/fan-to-api.yaml': 'from: fan\nto: api\nname: Orders\n',
  'connections/fan-uses-shop.yaml': 'from: fan\nto: shop\nname: Pays\n',
  'connections/report-reads-api.yaml': 'from: report\nto: api\nname: Reads the orders\n',
};

/** What each finding in the shop with gaps says. */
const SAID = {
  description: 'This person has no description. Say what it is for, when that is known.',
  technology:
    'This app names no technology. Name what it is built with, if the facts say: a language, a framework or a product. A protocol that it speaks belongs on its connections.',
  unnamed: 'This connection has no name. Say what the one that acts does, when that is known.',
  vague: 'This connection is named `Uses`, which says nothing of what is done. Say what the one that acts does. If nobody knows yet, leave `name` out.',
  unconnected:
    'No connection starts or ends at this app or at anything in it, and none passes through it. That may be right: add a connection, or name it in `via`, only for an exchange that the facts name.',
};

describe('the C4 checks of seefore check', () => {
  it('count a model that lacks nothing, and send nobody on to --full', () => {
    write(WHOLE);
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.out.split('\n').slice(3)).toEqual([...block(4, 2, 3), '8 records read. No problems.']);
  });

  it('count each thing they find, after the problems and before the last line, and send the reader on to --full', () => {
    write(GAPS);
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.out.split('\n')).toEqual([
      'Boxwick',
      `format 1, ${root}`,
      '',
      `connections/fan-uses-shop.yaml:3:7: warning: ${SAID.vague}`,
      '',
      'C4 checks, which count what the model lacks:',
      '- A description: 4 things checked, 1 without.',
      '- A technology: 2 apps, stores and components checked, 1 without.',
      '- A name for a connection: 2 connections checked, 1 without.',
      '- A name that is more than the word "Uses": 1 name checked, 1 that is only that word.',
      '- A connection: 4 things checked, 1 with none.',
      '`seefore check --full` lists each.',
      '',
      '7 records read. 0 errors, 1 warning.',
    ]);
  });

  it('give the command for --full that works from where the person stands', () => {
    write(under('arch', GAPS));
    expect(run(['check', '--workdir=arch']).out).toContain('\n`seefore check --full --workdir=arch` lists each.\n');
    expect(run(['check'], 'arch/people').out).toContain('\n`seefore check --full` lists each.\n');
  });

  it('list with --full each note beneath its line, as a problem is written, with paths from where the command was run, and not the warning a second time', () => {
    write(under('arch', GAPS));
    const result = run(['check', '--full', '--workdir=arch']);
    expect(result.code).toBe(0);
    expect(result.out.split('\n').slice(3)).toEqual([
      `arch/connections/fan-uses-shop.yaml:3:7: warning: ${SAID.vague}`,
      '',
      'C4 checks, which count what the model lacks:',
      '- A description: 4 things checked, 1 without.',
      `arch/people/fan.yaml:1:1: note: ${SAID.description}`,
      '- A technology: 2 apps, stores and components checked, 1 without.',
      `arch/apps/api.yaml:1:1: note: ${SAID.technology}`,
      '- A name for a connection: 2 connections checked, 1 without.',
      `arch/connections/fan-to-api.yaml:1:1: note: ${SAID.unnamed}`,
      // The warning stands among the problems above, and only there.
      '- A name that is more than the word "Uses": 1 name checked, 1 that is only that word.',
      '- A connection: 4 things checked, 1 with none.',
      `arch/apps/report.yaml:1:1: note: ${SAID.unconnected}`,
      '',
      '7 records read. 0 errors, 1 warning.',
    ]);
  });

  it('send nobody on to --full when what they found is only the warning, which stands among the problems', () => {
    write({ ...WHOLE, 'connections/fan-uses-shop.yaml': 'from: fan\nto: shop\nname: Uses\n' });
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.out.split('\n').slice(3)).toEqual([
      `connections/fan-uses-shop.yaml:3:7: warning: ${SAID.vague}`,
      '',
      'C4 checks, which count what the model lacks:',
      '- A description: 4 things checked, 0 without.',
      '- A technology: 2 apps, stores and components checked, 0 without.',
      '- A name for a connection: 3 connections checked, 0 without.',
      '- A name that is more than the word "Uses": 3 names checked, 1 that is only that word.',
      '- A connection: 4 things checked, 0 with none.',
      '',
      '8 records read. 0 errors, 1 warning.',
    ]);
    // With --full there is nothing more to list.
    expect(run(['check', '--full']).out).toBe(result.out);
  });

  it('list each finding of a check in order of file', () => {
    write({ ...GAPS, 'systems/billing.yaml': 'name: Billing\n', 'components/total.yaml': 'name: Total\nin: report\n' });
    const lines = run(['check', '--full']).out.split('\n');
    const from = lines.indexOf('- A description: 6 things checked, 3 without.');
    expect(lines.slice(from + 1, from + 4).map((line) => line.split(':')[0])).toEqual(['components/total.yaml', 'people/fan.yaml', 'systems/billing.yaml']);
  });

  it('say that a check looked at nothing, in a model with no connection', () => {
    write({ 'seefore.yaml': MARKER, 'people/fan.yaml': 'name: Fan\ndescription: Watches.\n' });
    const lines = run(['check']).out.split('\n');
    expect(lines).toContain('- A name for a connection: 0 connections checked, 0 without.');
    expect(lines).toContain('- A name that is more than the word "Uses": 0 names checked, 0 that are only that word.');
    expect(lines).toContain('- A connection: 1 thing checked, 1 with none.');
    const { c4 } = json(['check']).data;
    expect(c4['connection-unnamed']).toEqual({ severity: 'note', checked: 0, findings: [] });
    expect(c4['connection-vague']).toEqual({ severity: 'warning', checked: 0, findings: [] });
  });

  it('say that the check of a connection was not run when the directory was not read in full, and run the other four on what was read', () => {
    const cases: [string, () => void][] = [
      ['an error in the file of one connection', () => write({ ...GAPS, 'connections/fan-to-api.yaml': 'from: fan\nto: api\nlabel: Orders\n' })],
      ['a file that is not read', () => write({ ...GAPS, 'notes/plan.yaml': 'a: 1\n' })],
      [
        'a link that is not followed',
        () => {
          write({ ...GAPS, 'elsewhere/thing.yaml': 'name: Thing\n' });
          symlinkSync(join(root, 'elsewhere'), join(root, 'linked'));
        },
      ],
    ];
    for (const [what, make] of cases) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
      make();
      const lines = run(['check']).out.split('\n');
      expect(lines, what).toContain('- A connection: not checked: part of the directory was left out, as the problems above say.');
      expect(lines, what).toContain('- A description: 4 things checked, 1 without.');
      const { c4 } = json(['check']).data;
      expect(c4.complete, what).toBe(false);
      expect(c4['element-unconnected'], what).toEqual({ severity: 'note', checked: null, findings: [] });
      expect(c4['description-missing'].findings.map((finding) => finding.file), what).toEqual(['people/fan.yaml']);
    }
  });

  it('say that none of the five was run when the marker cannot say which format the directory is in', () => {
    write({ ...GAPS, 'seefore.yaml': 'format: one\nname: Boxwick\n' });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n').slice(-8)).toEqual([
      'C4 checks, which count what the model lacks:',
      '- A description: not checked, since the records were not read.',
      '- A technology: not checked, since the records were not read.',
      '- A name for a connection: not checked, since the records were not read.',
      '- A name that is more than the word "Uses": not checked, since the records were not read.',
      '- A connection: not checked, since the records were not read.',
      '',
      '0 records read. 1 error, 1 warning.',
    ]);
    const { c4 } = json(['check']).data;
    expect(c4.complete).toBe(false);
    for (const code of C4_CODES) expect(c4[code], code).toMatchObject({ checked: null, findings: [] });
  });

  it('give as data the key `c4`, after the problems: whether the directory was read in full, and for each code its kind, how many it looked at and what it found', () => {
    write(GAPS);
    const { code, data } = json(['check']);
    expect(code).toBe(0);
    expect(Object.keys(data)).toEqual(['directory', 'name', 'format', 'records', 'errors', 'warnings', 'problems', 'c4']);
    expect(Object.keys(data.c4)).toEqual(['complete', ...C4_CODES]);
    expect(data.c4).toEqual({
      complete: true,
      'description-missing': { severity: 'note', checked: 4, findings: [{ file: 'people/fan.yaml', line: 1, column: 1, message: SAID.description }] },
      'technology-missing': { severity: 'note', checked: 2, findings: [{ file: 'apps/api.yaml', line: 1, column: 1, message: SAID.technology }] },
      'connection-unnamed': { severity: 'note', checked: 2, findings: [{ file: 'connections/fan-to-api.yaml', line: 1, column: 1, message: SAID.unnamed }] },
      'connection-vague': { severity: 'warning', checked: 1, findings: [{ file: 'connections/fan-uses-shop.yaml', line: 3, column: 7, message: SAID.vague }] },
      'element-unconnected': { severity: 'note', checked: 4, findings: [{ file: 'apps/report.yaml', line: 1, column: 1, message: SAID.unconnected }] },
    });
    // The warning is among the problems and in their count; the notes are in `c4` alone.
    expect(data.problems).toEqual([{ file: 'connections/fan-uses-shop.yaml', line: 3, column: 7, severity: 'warning', code: 'connection-vague', message: SAID.vague }]);
    expect({ errors: data.errors, warnings: data.warnings }).toEqual({ errors: 0, warnings: 1 });
    expect(data.requireNames).toBeUndefined();
  });

  it('give the same data with --full as without', () => {
    write(GAPS);
    expect(run(['check', '--full', '--json']).out).toBe(run(['check', '--json']).out);
  });

  it('never change the exit code: a warning of theirs is a warning, and a note is none', () => {
    write({ ...GAPS, 'apps/broken.yaml': 'name: Broken\n' });
    expect(run(['check']).code).toBe(1);
    rmSync(join(root, 'apps/broken.yaml'));
    expect(run(['check']).code).toBe(0);
  });
});

describe('--require-names', () => {
  /** A shop whose connections are these, by id and name: a name of `null` is left out. */
  const named = (names: Record<string, string | null>): Record<string, string> => {
    const files: Record<string, string> = { 'seefore.yaml': MARKER, 'people/fan.yaml': 'name: Fan\n', 'systems/shop.yaml': 'name: Shop\n' };
    for (const [id, name] of Object.entries(names)) files[`connections/${id}.yaml`] = `from: fan\nto: shop\n${name === null ? '' : `name: ${name}\n`}`;
    return files;
  };

  /** The paragraph `--require-names` adds, and the exit code, in words; and what it holds as data. */
  const required = (...more: string[]) => {
    const words = run(['check', '--require-names', ...more]);
    const lines = words.out.split('\n');
    const plain = run(['check', ...more]).out.split('\n');
    // The paragraph stands on its own, after the C4 checks and before the last line, and the rest is as it was.
    expect(lines.slice(0, -3)).toEqual(plain.slice(0, -1));
    expect(lines.slice(-2)).toEqual(['', plain.at(-1)]);
    const data = json(['check', '--require-names', ...more]);
    expect(data.code).toBe(words.code);
    expect(Object.keys(data.data.requireNames ?? {})).toEqual(['met', 'complete', 'connections', 'unnamed', 'vague']);
    return { code: words.code, said: lines.at(-3), data: data.data.requireNames, plain: run(['check', ...more]).code };
  };

  /** What the paragraph says when part of the directory was left out. */
  const LEFT_OUT = 'Names are required, and part of the directory was left out, as the problems above say. This run fails.';

  it('ends with 0 and says so when every connection has a name that is more than the word "Uses"', () => {
    write(named({ 'fan-buys': 'Buys', 'fan-pays': 'Pays' }));
    expect(required()).toEqual({
      code: 0,
      said: 'Names are required: every connection has one, and none is only "Uses".',
      data: { met: true, complete: true, connections: 2, unnamed: 0, vague: 0 },
      plain: 0,
    });
  });

  it('ends with 1 when part of the directory was left out, and says that the run fails', () => {
    write({ ...named({ 'fan-buys': 'Buys' }), 'notes/plan.yaml': 'a: 1\n' });
    expect(required()).toEqual({ code: 1, said: LEFT_OUT, data: { met: false, complete: false, connections: 1, unnamed: 0, vague: 0 }, plain: 0 });
  });

  it('ends with 1 when there is an error, which leaves part of the directory out', () => {
    write({ ...named({ 'fan-buys': 'Buys' }), 'people/fan.yaml': 'name: Fan\nage: 3\n' });
    const found = required();
    expect(found).toMatchObject({ code: 1, said: LEFT_OUT, plain: 1 });
    expect(found.data).toMatchObject({ met: false, complete: false });
  });

  it.each([
    [{ 'fan-to-shop': null, 'fan-buys': 'Buys' }, 'Of the connections read, 1 has no name.', 1, 0],
    [{ 'fan-to-shop': null, 'fan-to-shop-too': null, 'fan-uses-shop': 'Uses' }, 'Of the connections read, 2 have no name, and 1 is named only "Uses".', 2, 1],
    [{ 'fan-uses-shop': 'Uses', 'fan-use-shop': 'use' }, 'Of the connections read, 2 are named only "Uses".', 0, 2],
  ])('says, when part of the directory was left out, what was counted among the connections that were read: %j', (names, counted, unnamed, vague) => {
    write({ ...named(names), 'notes/plan.yaml': 'a: 1\n' });
    const connections = Object.keys(names).length;
    expect(required()).toEqual({ code: 1, said: `${LEFT_OUT} ${counted}`, data: { met: false, complete: false, connections, unnamed, vague }, plain: 0 });
  });

  it('says that the records were not read when the marker cannot say which format they are in', () => {
    write({ ...named({ 'fan-to-shop': null }), 'seefore.yaml': 'format: one\nname: Shop\n' });
    expect(required()).toEqual({
      code: 1,
      said: 'Names are required, and the records were not read, as the problems above say. This run fails.',
      data: { met: false, complete: false, connections: 0, unnamed: 0, vague: 0 },
      plain: 1,
    });
  });

  it('ends with 1 when there is no connection to check, and says so', () => {
    write(named({}));
    expect(required()).toEqual({
      code: 1,
      said: 'Names are required, and there is no connection to check. This run fails.',
      data: { met: false, complete: true, connections: 0, unnamed: 0, vague: 0 },
      plain: 0,
    });
  });

  it.each([
    [{ 'fan-to-shop': null, 'fan-uses-shop': 'Uses', 'fan-use-shop': 'use' }, '1 connection has no name, and 2 are named only "Uses". This run fails. `seefore check --full` lists them.', 1, 2],
    [{ 'fan-to-shop': null, 'fan-to-shop-too': null, 'fan-buys': 'Buys' }, '2 connections have no name. This run fails. `seefore check --full` lists them.', 2, 0],
    [{ 'fan-to-shop': null, 'fan-buys': 'Buys' }, '1 connection has no name. This run fails. `seefore check --full` lists it.', 1, 0],
    [{ 'fan-uses-shop': 'USES', 'fan-buys': 'Buys' }, '1 connection is named only "Uses". This run fails. `seefore check --full` lists it.', 0, 1],
  ])('ends with 1 when a connection has no name or is named only "Uses", says how many, that the run fails and where to look: %j', (names, said, unnamed, vague) => {
    write(named(names));
    const connections = Object.keys(names).length;
    expect(required()).toEqual({ code: 1, said: `Names are required: ${said}`, data: { met: false, complete: true, connections, unnamed, vague }, plain: 0 });
  });

  it('names the directory where it says where to look, as the block does, and says it once with --full, which lists them above', () => {
    write(under('arch', named({ 'fan-to-shop': null, 'fan-buys': 'Buys' })));
    const given = required('--workdir=arch');
    expect(given.said).toBe('Names are required: 1 connection has no name. This run fails. `seefore check --full --workdir=arch` lists it.');
    const full = required('--full', '--workdir=arch');
    expect(full.said).toBe('Names are required: 1 connection has no name. This run fails.');
    expect(run(['check', '--require-names', '--full', '--workdir=arch']).out).toContain(
      '\narch/connections/fan-to-shop.yaml:1:1: note: This connection has no name. Say what the one that acts does, when that is known.\n',
    );
  });

  it('is an option of seefore check only, and a mistake in the options with any other command', () => {
    write(named({ 'fan-buys': 'Buys' }));
    for (const args of [['list', '--require-names'], ['uses', 'fan', '--require-names']]) {
      const result = run(args);
      expect(result.code, args.join(' ')).toBe(2);
      expect(result.out).toBe('');
      expect(result.err).toBe('seefore: `--require-names` is an option of `seefore check` only.\nRun `seefore --help` to see how it is used.');
      const data = JSON.parse(run([...args, '--json']).out) as Failure;
      expect(data.error).toEqual({ code: 'usage', message: '`--require-names` is an option of `seefore check` only.' });
    }
  });

  it('is named in the help, with --full for check', () => {
    const flat = HELP.replace(/\s+/g, ' ');
    expect(HELP).toContain('  seefore check [--workdir=<directory>] [--full] [--require-names] [--json]\n');
    expect(flat).toContain('--full For check: list what each C4 check found.');
    expect(flat).toContain('--require-names For check: end with 1 unless the directory was read in full and has connections, and each has a name that is not only "Uses".');
  });
});

describe('the command line', () => {
  it('prints help when asked, and when given nothing', () => {
    expect(run(['--help'])).toEqual({ code: 0, out: HELP, err: '' });
    expect(run(['-h']).out).toBe(HELP);
    expect(run([])).toEqual({ code: 0, out: HELP, err: '' });
  });

  it('says in its help how to show the model in the browser', () => {
    expect(HELP).toContain('  seefore --server [--workdir=<directory>] [--port=<number>] [--no-open]\n');
    expect(HELP).toContain('\n  --server Show the model in the browser: a page on this machine that draws the\n');
    expect(HELP).toContain('\n  --port=<number>         For --server: the port to listen on. Without it, 4173,\n');
    expect(HELP).toContain('\n  --no-open               For --server: do not open the browser.\n');
    for (const line of HELP.split('\n')) expect(line.length, line).toBeLessThanOrEqual(88);
  });

  it('prints its version', () => {
    expect(run(['--version'])).toEqual({ code: 0, out: 'seefore dev', err: '' });
  });

  it('refuses a command it does not have', () => {
    const result = run(['frobnicate']);
    expect(result.code).toBe(2);
    expect(result.err).toBe('seefore: `frobnicate` is not a seefore command. The commands are: check, list, uses.\nRun `seefore --help` to see how it is used.');
  });

  it('refuses an option it does not have, in plain words', () => {
    const result = run(['check', '--nope']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('seefore: `--nope` is not an option of seefore.');
  });

  it('asks for a directory when --workdir has none', () => {
    const result = run(['check', '--workdir']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('`--workdir` needs a directory, as in --workdir=<directory>.');
  });

  it('answers help, version and a missing command as data when asked for data', () => {
    expect(JSON.parse(run(['--help', '--json']).out)).toEqual({ help: HELP });
    expect(JSON.parse(run(['--json', '--version']).out)).toEqual({ version: 'dev' });
    const none = run(['--json']);
    expect(none.code).toBe(2);
    expect((JSON.parse(none.out) as Failure).error).toEqual({ code: 'usage', message: 'No command was given. The commands are: check, list, uses.' });
  });

  it('answers a mistake in the options as data when asked for data', () => {
    for (const args of [['check', '--json', '--nope'], ['check', '--json', 'extra'], ['frobnicate', '--json'], ['--json', 'check', '--workdir']]) {
      const result = run(args);
      expect(result.code).toBe(2);
      expect(result.err).toBe('');
      expect((JSON.parse(result.out) as Failure).error.code).toBe('usage');
    }
  });

  it('refuses a name after check', () => {
    const result = run(['check', 'some/folder']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('Use --workdir=<directory> to say where to look.');
  });
});

describe('the built command', () => {
  const built = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'seefore.cjs');

  it('exists: run `npm run build` first', () => {
    expect(existsSync(built)).toBe(true);
  });

  it('runs by itself and carries its version', () => {
    const version = execFileSync(process.execPath, [built, '--version'], { encoding: 'utf8' });
    expect(version).toMatch(/^seefore \d+\.\d+\.\d+\n$/);
  });

  it('checks a directory and sets the exit code', () => {
    write({ 'good/seefore.yaml': MARKER, 'bad/seefore.yaml': 'format: 1\n' });
    const good = spawnSync(process.execPath, [built, 'check', '--workdir=good'], { cwd: root, encoding: 'utf8' });
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('0 records read. No problems.');
    const bad = spawnSync(process.execPath, [built, 'check', '--workdir=bad'], { cwd: root, encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('bad/seefore.yaml:1:1: error: `name` is missing from the marker file.');
    const none = spawnSync(process.execPath, [built, 'check'], { cwd: root, encoding: 'utf8' });
    expect(none.status).toBe(2);
    expect(none.stdout).toBe('');
    expect(none.stderr).toContain('There is no seefore.yaml');
  });

  it('counts what the C4 checks find, lists it with --full, and ends with 1 under --require-names only', () => {
    write({ ...under('gaps', GAPS), ...under('whole', WHOLE) });
    const runs = (...args: string[]) => spawnSync(process.execPath, [built, ...args], { cwd: root, encoding: 'utf8' });

    const plain = runs('check', '--workdir=gaps');
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain('\n- A connection: 4 things checked, 1 with none.\n`seefore check --full --workdir=gaps` lists each.\n\n7 records read. 0 errors, 1 warning.\n');
    const full = runs('check', '--full', '--workdir=gaps');
    expect(full.status).toBe(0);
    expect(full.stdout).toContain(`\n- A connection: 4 things checked, 1 with none.\ngaps/apps/report.yaml:1:1: note: ${SAID.unconnected}\n\n`);

    const gate = runs('check', '--require-names', '--workdir=gaps');
    expect(gate.status).toBe(1);
    expect(gate.stdout).toContain(
      '\n\nNames are required: 1 connection has no name, and 1 is named only "Uses". This run fails. `seefore check --full --workdir=gaps` lists them.\n\n7 records read. 0 errors, 1 warning.\n',
    );
    const asData = runs('check', '--require-names', '--json', '--workdir=gaps');
    expect(asData.status).toBe(1);
    expect((JSON.parse(asData.stdout) as CheckResult).requireNames).toEqual({ met: false, complete: true, connections: 2, unnamed: 1, vague: 1 });
    const met = runs('check', '--require-names', '--workdir=whole');
    expect(met.status).toBe(0);
    expect(met.stdout).toContain('\n\nNames are required: every connection has one, and none is only "Uses".\n\n8 records read. No problems.\n');

    const mistake = runs('list', '--require-names', '--workdir=gaps');
    expect(mistake.status).toBe(2);
    expect(mistake.stdout).toBe('');
    expect(mistake.stderr).toContain('`--require-names` is an option of `seefore check` only.');
  });

  // The limit is written out here, and not taken from the code, so that a limit changed by
  // mistake fails this test.
  it('warns of a view of 41 boxes and not of 40, once for each such view, and leaves the exit code to the errors', () => {
    /** A shop under the temporary folder with this many apps in it, this many people who use it, and these files besides. */
    const shop = (folder: string, apps: number, people: number, more: Record<string, string> = {}) => {
      const files: Record<string, string> = { [`${folder}/seefore.yaml`]: MARKER, [`${folder}/systems/shop.yaml`]: 'name: Shop\n' };
      for (let n = 1; n <= apps; n += 1) files[`${folder}/apps/app-${n}.yaml`] = `name: App ${n}\nin: shop\n`;
      for (let n = 1; n <= people; n += 1) {
        files[`${folder}/people/person-${n}.yaml`] = `name: Person ${n}\n`;
        files[`${folder}/connections/person-${n}-uses-shop.yaml`] = `from: person-${n}\nto: shop\nname: Uses the shop\n`;
      }
      for (const [path, text] of Object.entries(more)) files[`${folder}/${path}`] = text;
      write(files);
    };
    /** The exit code and what the check counted and found, every field of every problem. */
    const checked = (folder: string) => {
      const result = spawnSync(process.execPath, [built, 'check', '--json', `--workdir=${folder}`], { cwd: root, encoding: 'utf8' });
      const { records, errors, warnings, problems } = JSON.parse(result.stdout) as CheckResult;
      return { status: result.status, records, errors, warnings, problems };
    };
    const crowded = (kind: string, boxes: number) => ({
      file: 'systems/shop.yaml',
      line: 1,
      column: 1,
      severity: 'warning',
      code: 'view-crowded',
      message: `The ${kind} view of Shop has ${boxes} boxes. A view of more than 40 cannot be read as one picture: the page draws it as a map. Until focused views exist, read it by pointing at a box.`,
    });

    // The container view counts each box inside the boundary, and not the boundary.
    shop('at-40', 40, 0);
    expect(checked('at-40')).toEqual({ status: 0, records: 41, errors: 0, warnings: 0, problems: [] });
    shop('at-41', 41, 0);
    expect(checked('at-41')).toEqual({ status: 0, records: 42, errors: 0, warnings: 1, problems: [crowded('container', 41)] });

    // The context view counts the system itself. A system with no part has no container view.
    shop('people-40', 0, 40);
    expect(checked('people-40')).toEqual({ status: 0, records: 81, errors: 0, warnings: 1, problems: [crowded('context', 41)] });

    // Both views of one system, each with its own warning, the context view first.
    shop('both', 40, 40);
    expect(checked('both')).toEqual({ status: 0, records: 121, errors: 0, warnings: 2, problems: [crowded('context', 41), crowded('container', 80)] });

    // A record with an error is not drawn, so it is not counted: 40 boxes are left.
    shop('broken', 41, 0, { 'apps/app-41.yaml': 'in: shop\n' });
    expect(checked('broken')).toEqual({
      status: 1,
      records: 42,
      errors: 1,
      warnings: 0,
      problems: [{ file: 'apps/app-41.yaml', line: 1, column: 1, severity: 'error', code: 'key-missing', message: '`name` is missing from this app.' }],
    });
  });
});
