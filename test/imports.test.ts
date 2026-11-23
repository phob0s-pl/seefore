import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** What each folder of `src/` may import, as the table of specs/A3.md has it. */
const ALLOWED: Record<string, { folders: string[]; packages: string[]; node: boolean }> = {
  model: { folders: ['model'], packages: ['yaml', 'zod'], node: false },
  server: { folders: ['server', 'model'], packages: [], node: true },
  ui: {
    folders: ['ui', 'model'],
    packages: ['react', 'react-dom', '@xyflow/react', 'elkjs', 'react-router-dom', 'lucide-react', '@fontsource/inter', '@fontsource/ibm-plex-mono'],
    node: false,
  },
};

const IMPORT = /\b(?:import|export)\s(?:[^'";]*?\sfrom\s)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/g;

/** Every import of a file of `src/` that its folder may not use, as `file: import`. */
function forbidden(): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = join(entry.parentPath, entry.name);
    const folder = relative(SRC, file).split(sep)[0] ?? '';
    const allowed = ALLOWED[folder];
    if (allowed === undefined) {
      found.push(`${relative(SRC, file)}: is in no folder of A3`);
      continue;
    }
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const name = match[1] ?? match[2] ?? '';
      const ok = name.startsWith('.')
        ? allowed.folders.some((own) => resolve(dirname(file), name).startsWith(join(SRC, own) + sep))
        : name.startsWith('node:')
          ? allowed.node
          : allowed.packages.some((pkg) => name === pkg || name.startsWith(`${pkg}/`));
      if (!ok) found.push(`${relative(SRC, file)}: ${name}`);
    }
  }
  return found;
}

test("the imports of each folder keep to A3's table", () => {
  expect(forbidden()).toEqual([]);
});
