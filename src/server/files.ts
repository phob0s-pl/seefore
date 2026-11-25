import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { ModelAnswer } from '../model/answer.ts';
import { readModel } from '../model/read.ts';
import type { SourceFile } from '../model/read.ts';

/**
 * The `.yaml` and `.yml` files under a folder, at any depth, relative to it with `/`, in
 * order. It skips `node_modules` and folders whose name starts with a dot. It fails as Node
 * does when the folder is not there or cannot be read.
 */
export async function listFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          await walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        }
      } else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
        found.push(prefix + entry.name);
      }
    }
  };
  await walk(folder, '');
  return found.sort();
}

/** The path and text of each YAML file under a folder, as `listFiles` finds them. */
export async function readTexts(folder: string): Promise<SourceFile[]> {
  return Promise.all((await listFiles(folder)).map(async (path) => ({ path, text: await readFile(join(folder, path), 'utf8') })));
}

/** Reads the folder anew: the text of each YAML file goes into the reader of `src/model/`. */
export async function readFolder(folder: string): Promise<ModelAnswer> {
  // A path of `source` is counted from the folder that holds the model's folder: the repository, or the folder of its clones.
  const code = dirname(resolve(folder));
  return { folder: basename(resolve(folder)), ...readModel(await readTexts(folder), { exists: (path) => existsSync(join(code, path)), folder: (path) => statSync(join(code, path), { throwIfNoEntry: false })?.isDirectory() === true }) };
}

/** Takes the files of removed records away. */
export async function removeFiles(folder: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) await rm(join(folder, path));
}

/**
 * Writes what a rename changed: each file it names at its new path, then takes away each old path
 * that no file is written to. All are written first, so `a b` with `b c` loses nothing.
 */
export async function writeRenamed(folder: string, files: readonly SourceFile[], changed: readonly { from: string; to: string }[]): Promise<void> {
  const texts = new Map(files.map((file) => [file.path, file.text]));
  const written = new Set(changed.map((file) => file.to));
  for (const file of changed) {
    await mkdir(dirname(join(folder, file.to)), { recursive: true });
    await writeFile(join(folder, file.to), texts.get(file.to) as string, 'utf8');
  }
  for (const file of changed) if (file.from !== file.to && !written.has(file.from)) await rm(join(folder, file.from));
}
