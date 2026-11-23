import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listFiles } from '../src/server/files.ts';

test('the files of a small folder are listed, relative and in order', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const files = ['shop.yaml', 'b/c/deep.yml', 'a.yaml', 'notes.md', '.git/x.yaml', 'node_modules/y/z.yaml'];
  for (const file of files) {
    await mkdir(join(folder, file, '..'), { recursive: true });
    await writeFile(join(folder, file), 'id: x\n');
  }
  expect(await listFiles(folder)).toEqual(['a.yaml', 'b/c/deep.yml', 'shop.yaml']);
});
