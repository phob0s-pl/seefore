import { describe, expect, it } from 'vitest';
import { c4Of } from '../src/c4.ts';
import type { Format } from '../src/format.ts';
import { load, loadAs } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import { emptyModel } from '../src/model.ts';

const MARKER = { path: 'seefore.yaml', text: 'format: 1\nname: Boxwick\n' } satisfies SourceFile;

/** No family of records exists yet, so the rules for records are tried with two made up here. */
const WITH_FAMILIES: Format = { version: 1, families: [{ folder: 'things' }, { folder: 'others' }] };

function file(path: string, text = 'name: A thing\n'): SourceFile {
  return { path, text };
}

function codes(problems: { file: string; code: string }[]) {
  return problems.map((problem) => `${problem.file} ${problem.code}`);
}

describe('a source directory with only its marker', () => {
  it('loads with no records and no problems', () => {
    expect(load([MARKER])).toEqual({
      marker: { format: 1, name: 'Boxwick' },
      records: [],
      unread: [],
      references: [],
      texts: [],
      model: emptyModel(),
      problems: [],
      // The C4 checks ran on a model with nothing in it, and so looked at nothing.
      c4: c4Of(emptyModel(), { complete: true }),
    });
  });

  it('reports a missing marker', () => {
    const loaded = load([]);
    expect(loaded.marker).toBeUndefined();
    expect(loaded.problems).toEqual([
      {
        file: 'seefore.yaml',
        line: 1,
        column: 1,
        severity: 'error',
        code: 'marker-missing',
        message: 'There is no `seefore.yaml` here, so this is not a seefore source directory.',
      },
    ]);
  });

  it('reports a marker under another spelling, and not that there is none', () => {
    expect(codes(load([file('seefore.yml', MARKER.text)]).problems)).toEqual(['seefore.yml marker-name']);
    expect(codes(load([file('SEEFORE.YAML', MARKER.text)]).problems)).toEqual(['SEEFORE.YAML marker-name']);
    const both = load([MARKER, file('Seefore.yml', MARKER.text)]);
    expect(both.marker?.name).toBe('Boxwick');
    expect(codes(both.problems)).toEqual(['Seefore.yml marker-name']);
  });

  it('reads the records under a marker spelt another way when it gives a format it reads', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yml', MARKER.text), file('things/shop.yaml')]);
    expect(loaded.marker).toEqual({ format: 1, name: 'Boxwick' });
    expect(loaded.records.map((record) => record.id)).toEqual(['shop']);
    expect(codes(loaded.problems)).toEqual(['seefore.yml marker-name']);
  });

  it('reads no records under a marker spelt another way that gives a format it cannot read', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yml', 'format: 2\nname: Future\n'), file('things/later.yaml', 'name: Future app\n')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.model).toEqual(emptyModel());
    expect(loaded.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.code} ${problem.message}`)).toEqual([
      'seefore.yml:1:1 format-not-readable This directory is written in format 2. This seefore reads format 1. Install a newer seefore to read it.',
      'seefore.yml:1:1 marker-name The marker file is named `seefore.yaml`, in lowercase, not `seefore.yml`.',
    ]);
  });

  it('reads no records under a marker spelt another way that cannot say which format they are in', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('SEEFORE.YAML', 'name: Boxwick\n'), file('things/shop.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems.map((problem) => `${problem.file} ${problem.severity} ${problem.code}`)).toEqual([
      'SEEFORE.YAML warning format-unknown',
      'SEEFORE.YAML error key-missing',
      'SEEFORE.YAML error marker-name',
    ]);
  });

  it('reads no records when there is no marker', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('things/shop.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(codes(loaded.problems)).toEqual(['seefore.yaml marker-missing']);
  });

  it('reads no records when the marker is there but could not be read', () => {
    const loaded = loadAs(WITH_FAMILIES, [{ path: 'seefore.yaml' }, file('things/shop.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems).toEqual([
      {
        file: 'seefore.yaml',
        line: 1,
        column: 1,
        severity: 'warning',
        code: 'format-unknown',
        message: 'The marker file could not be read, so nothing else in this directory was read.',
      },
    ]);
  });

  it('leaves alone what is not YAML', () => {
    const loaded = load([MARKER, file('README.md', '# notes'), file('things/picture.png', '')]);
    expect(loaded.problems).toEqual([]);
  });

  it('warns about every YAML file it does not read', () => {
    const loaded = load([MARKER, file('notes.yaml'), file('elements/shop.yaml'), file('elements/deep/api.yml')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems.map((problem) => [problem.file, problem.severity, problem.code])).toEqual([
      ['elements/deep/api.yml', 'warning', 'not-read'],
      ['elements/shop.yaml', 'warning', 'not-read'],
      ['notes.yaml', 'warning', 'not-read'],
    ]);
    expect(loaded.problems[1]?.message).toBe(
      'seefore does not read this file: it knows no records in `elements/`. The folders it reads are `apps`, `components`, ' +
        '`connections`, `infrastructure`, `owners`, `people`, `stores`, `systems` and `technologies`.',
    );
    expect(loaded.problems[2]?.message).toBe(
      'seefore does not read this file. Records sit in folders, and the only file at the top is `seefore.yaml`.',
    );
    const none = loadAs({ version: 1, families: [] }, [MARKER, file('elements/shop.yaml')]);
    expect(none.problems[0]?.message).toBe(
      'seefore does not read this file: it knows no records in `elements/`. This format has no folders of records yet.',
    );
  });

  it('reports a source directory inside another, once, and leaves what is under it alone', () => {
    const loaded = load([MARKER, file('inner/seefore.yaml', MARKER.text), file('inner/things/a.yaml')]);
    expect(codes(loaded.problems)).toEqual(['inner/seefore.yaml marker-nested']);
  });

  it('reports a marker further down under any spelling of its name', () => {
    const loaded = load([MARKER, file('a/seefore.yml', MARKER.text), file('b/deep/SEEFORE.YAML', MARKER.text), file('b/deep/x.yaml')]);
    expect(codes(loaded.problems)).toEqual(['a/seefore.yml marker-nested', 'b/deep/SEEFORE.YAML marker-nested']);
  });

  it('reads nothing more when the format is one it cannot read', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yaml', 'format: 7\nname: Boxwick\n'), file('things/a.yaml', ': broken')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.marker).toEqual({ format: 7, name: 'Boxwick' });
    expect(codes(loaded.problems)).toEqual(['seefore.yaml format-not-readable']);
  });

  it('takes paths with a leading ./', () => {
    const loaded = load([{ path: './seefore.yaml', text: MARKER.text }, file('./notes.yaml')]);
    expect(loaded.marker?.name).toBe('Boxwick');
    expect(loaded.problems.map((problem) => problem.file)).toEqual(['notes.yaml']);
  });

  it('keeps a backslash in a name as it is, and does not take it for a folder', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things\\on.yaml'), file('things/a\\b.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems.map((problem) => [problem.file, problem.code])).toEqual([
      ['things/a\\b.yaml', 'id-invalid'],
      ['things\\on.yaml', 'not-read'],
    ]);
  });
});

describe('records', () => {
  it('reads one record from each file, named by the file', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/shop.yaml', 'name: Shop\n'), file('others/api.yaml', 'name: API\nsize: 2\n')]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.records).toEqual([
      { id: 'api', family: 'others', file: 'others/api.yaml', value: { name: 'API', size: 2 } },
      { id: 'shop', family: 'things', file: 'things/shop.yaml', value: { name: 'Shop' } },
    ]);
  });

  it('still reads the rest when one file is broken', () => {
    const loaded = loadAs(WITH_FAMILIES, [
      MARKER,
      file('things/broken.yaml', 'name: [unclosed\n'),
      file('things/empty.yaml', ''),
      file('things/shop.yaml'),
    ]);
    expect(loaded.records.map((record) => record.id)).toEqual(['shop']);
    expect(codes(loaded.problems)).toEqual(['things/broken.yaml yaml-syntax', 'things/empty.yaml yaml-empty']);
  });

  it('still reads the records when the marker is broken', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yaml', 'format: 1\n'), file('things/shop.yaml')]);
    expect(loaded.marker).toBeUndefined();
    expect(loaded.records.map((record) => record.id)).toEqual(['shop']);
    expect(codes(loaded.problems)).toEqual(['seefore.yaml key-missing']);
  });

  it('reads no records when the marker cannot say which format they are in', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yaml', 'format: one\nname: Boxwick\n'), file('things/shop.yaml'), file('things/broken.yaml', ': x')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems.map((problem) => `${problem.file} ${problem.severity} ${problem.code}`)).toEqual([
      'seefore.yaml warning format-unknown',
      'seefore.yaml error value-wrong-kind',
    ]);
  });

  it('reads no records when the marker writes `format` twice, whichever format each says', () => {
    for (const text of ['format: 1\nformat: 2\nname: Test\n', 'format: 1\nformat: 1\nname: Test\n']) {
      const loaded = loadAs(WITH_FAMILIES, [file('seefore.yaml', text), file('things/future.yaml')]);
      expect(loaded.records).toEqual([]);
      expect(loaded.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.severity} ${problem.code}`)).toEqual([
        'seefore.yaml:1:1 warning format-unknown',
        'seefore.yaml:2:1 error yaml-key-twice',
      ]);
    }
  });

  it('reads no records of a newer format, also when its marker breaks a rule of this one', () => {
    const loaded = loadAs(WITH_FAMILIES, [file('seefore.yaml', 'format: 2\nname: !!str Test\n'), file('things/shop.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(codes(loaded.problems)).toEqual(['seefore.yaml format-not-readable']);
  });

  it('reports a file whose name is not an id, and does not take it as a record', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/Shop_API.yaml')]);
    expect(loaded.records).toEqual([]);
    expect(loaded.problems).toHaveLength(1);
    expect(loaded.problems[0]).toMatchObject({ file: 'things/Shop_API.yaml', line: 1, column: 1, code: 'id-invalid' });
    expect(loaded.problems[0]?.message).toContain("A record's id is its file's name.");
  });

  it('reports both what is wrong with the name and with the content', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/Shop.yaml', '- a list\n')]);
    expect(codes(loaded.problems)).toEqual(['things/Shop.yaml id-invalid', 'things/Shop.yaml yaml-not-mapping']);
  });

  it('keeps a record whose file could not be read, by its folder and name, and leaves why to whoever read the disk', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, { path: 'things/shop.yaml' }, file('others/api.yaml')]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.records.map((record) => record.id)).toEqual(['api']);
    expect(loaded.unread).toEqual([{ id: 'shop', family: 'things', file: 'things/shop.yaml' }]);
  });

  it('holds a file that could not be read to the rules for where a record sits and what it is named', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, { path: 'things/Shop.yaml' }, { path: 'things/api.yaml' }, file('others/api.yaml'), { path: 'thing/x.yaml' }]);
    expect(codes(loaded.problems)).toEqual(['others/api.yaml id-twice', 'thing/x.yaml not-read', 'things/Shop.yaml id-invalid', 'things/api.yaml id-twice']);
    expect(loaded.unread.map((record) => record.id)).toEqual(['api']);
  });

  it('tells a record named like the marker from a source directory inside, and gives both ways out', () => {
    const loaded = load([MARKER, file('systems/seefore.yaml', 'name: Seefore\n'), file('systems/shop.yaml', 'name: Shop\n'), file('apps/search.yaml', 'name: Search\nin: shop\n')]);
    expect(codes(loaded.problems)).toEqual(['apps/search.yaml reference-unknown', 'systems/seefore.yaml marker-nested']);
    expect(loaded.problems[1]?.message).toBe(
      'A file named `seefore.yaml` marks a source directory, so `systems/` was taken for a source directory inside this one, ' +
        'and none of its other files were read. If this file is meant as a record, give it another id: `seefore` cannot be an id. ' +
        'If `systems/` really is a source directory, move it out of this one.',
    );
  });

  it('reports an id used in two folders, on both files', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/shop.yaml'), file('others/shop.yaml')]);
    expect(codes(loaded.problems)).toEqual(['others/shop.yaml id-twice', 'things/shop.yaml id-twice']);
    expect(loaded.problems[0]?.message).toBe(
      'The id `shop` names 2 records: `others/shop.yaml` and `things/shop.yaml`. An id names one record in the whole directory.',
    );
  });

  it('reports a record in a folder inside a folder', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/more/shop.yaml')]);
    expect(codes(loaded.problems)).toEqual(['things/more/shop.yaml record-nested']);
    expect(loaded.records).toEqual([]);
  });

  it('reports a record whose file does not end in .yaml, in lowercase', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/shop.yml'), file('things/Orders.YAML', ': broken')]);
    expect(loaded.records).toEqual([]);
    expect(codes(loaded.problems)).toEqual(['things/Orders.YAML record-extension', 'things/shop.yml record-extension']);
    expect(loaded.problems[0]?.message).toBe("A record's file ends in `.yaml`, in lowercase, not `.YAML`.");
  });

  it('takes an id that older YAML read as true for the text it is', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('things/on.yaml', 'next: yes\nother: off\n')]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.records).toEqual([{ id: 'on', family: 'things', file: 'things/on.yaml', value: { next: 'yes', other: 'off' } }]);
  });

  it('names the folders it reads when a file is in none of them', () => {
    const loaded = loadAs(WITH_FAMILIES, [MARKER, file('thing/shop.yaml')]);
    expect(loaded.problems[0]).toMatchObject({ severity: 'warning', code: 'not-read' });
    expect(loaded.problems[0]?.message).toBe(
      'seefore does not read this file: it knows no records in `thing/`. The folders it reads are `others` and `things`.',
    );
  });

  it('gives problems in order of file, then place', () => {
    const loaded = loadAs(WITH_FAMILIES, [
      file('things/z.yaml', 'a: &x 1\nb: *x\n'),
      file('things/a.yaml', ''),
      file('seefore.yaml', 'format: 1\nname: 3\n'),
    ]);
    expect(loaded.problems.map((problem) => `${problem.file}:${problem.line}`)).toEqual([
      'seefore.yaml:2',
      'things/a.yaml:1',
      'things/z.yaml:1',
      'things/z.yaml:2',
    ]);
  });
});
