import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSource } from '../src/check.ts';
import { readingOf } from '../src/server/source.ts';

/**
 * The views of a model are the costly part of a reading. Here the core library's `viewsOf` and
 * `viewsFor` are counted wherever they are called from, the core library itself too, so this
 * file stands apart: no other test sees the count.
 */

const made = vi.hoisted(() => ({ views: 0, looked: 0 }));

vi.mock('../../core/src/views.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../core/src/views.ts')>();
  return {
    ...original,
    viewsOf: (...args: Parameters<typeof original.viewsOf>) => {
      made.views += 1;
      return original.viewsOf(...args);
    },
    viewsFor: (...args: Parameters<typeof original.viewsFor>) => {
      made.looked += 1;
      return original.viewsFor(...args);
    },
  };
});

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-test-')));
  made.views = 0;
  made.looked = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes a source directory under the temporary folder: a shop with this many apps, and these files besides. */
function shop(apps: number, more: Record<string, string> = {}): string {
  const files: Record<string, string> = { 'seefore.yaml': 'format: 1\nname: Shop\n', 'systems/shop.yaml': 'name: Shop\n', ...more };
  for (let n = 1; n <= apps; n += 1) files[`apps/app-${n}.yaml`] = `name: App ${n}\nin: shop\n`;
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe('the views of a reading', () => {
  it('are not made by the check, which counts no box of any view', () => {
    const opened = readSource(shop(41));
    expect(opened.problems).toEqual([]);
    expect([made.views, made.looked]).toEqual([0, 0]);
  });

  it('are made once for each reading of the server, and the model is looked up once more for what can be the scope', () => {
    const reading = readingOf(shop(41));
    expect(reading.views.map((view) => [view.id, view.boxes.length])).toEqual([
      ['system~shop', 1],
      ['container~shop', 41],
    ]);
    expect(reading.scopes).toHaveLength(42);
    expect(reading.problems).toEqual([]);
    expect([made.views, made.looked]).toEqual([1, 1]);
  });

  it('are none, and not made, when the marker cannot be read', () => {
    const reading = readingOf(shop(41, { 'seefore.yaml': 'format: [1\n' }));
    expect(reading.available).toBe(false);
    expect(reading.views).toEqual([]);
    expect(reading.scopes).toEqual([]);
    expect([made.views, made.looked]).toEqual([0, 0]);
  });
});
