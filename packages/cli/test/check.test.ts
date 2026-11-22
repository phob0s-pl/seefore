import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('seefore check', () => {
  it('passes a directory that has only its marker, and says it read no records', () => {
    write({ 'seefore.yaml': MARKER });
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toBe(`Boxwick\nformat 1, ${root}\n\n0 records read. No problems.`);
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
      'stores/work.yaml': 'name: Work\nin: shop\nkind: queue\n',
    });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.split('\n').slice(3)).toEqual([
      'apps/modes.yaml:3:23: error: YAML reads this colon as the start of another key. Put the whole text in double quotes.',
      'apps/port.yaml:3:30: error: YAML reads ` #9100 for scrapes.` as a comment, so the value stops before it. If this is part of the text, ' +
        'put the whole text in double quotes. If it is a note, remove it: a record holds no comments.',
      'stores/work.yaml:3:7: error: `kind` must be one of `database`, `files`, `cache` and `index`. ' +
        'A queue or a topic is a store with no `kind` at this stage. Say which in its description.',
      'systems/argue.yaml:2:8: error: `owner` holds the id of a record in `owners/`. ' +
        'If who answers takes a sentence to say, leave `owner` out and put the sentence in the description.',
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
      '1 record read. 1 error, 0 warnings.',
    ]);
  });

  it('passes a directory whose records keep every rule, with a warning about a check', () => {
    write({
      'seefore.yaml': MARKER,
      'people/customer.yaml': 'name: Customer\n',
      'systems/shop.yaml': 'name: Shop\n',
      'connections/buys.yaml': 'from: customer\nto: shop\nname: Buys\n',
      'connections/buys-again.yaml': 'from: customer\nto: shop\nname: Buys\n',
    });
    const result = run(['check']);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'connections/buys.yaml:1:1: warning: This connection has the same `from`, `to` and `name` as `connections/buys-again.yaml`. ' +
        'If these are the same exchange, keep one. If their purposes differ, give each a name that says which.',
    );
    expect(result.out.endsWith('4 records read. 0 errors, 2 warnings.')).toBe(true);
  });

  it('refuses a directory written in a newer format', () => {
    write({ 'seefore.yaml': 'format: 2\nname: Boxwick\n' });
    const result = run(['check']);
    expect(result.code).toBe(1);
    expect(result.out.startsWith(`Boxwick\nformat 2, ${root}\n`)).toBe(true);
    expect(result.out).toContain('seefore.yaml:1:1: error: This directory is written in format 2. This seefore reads format 1.');
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
});
