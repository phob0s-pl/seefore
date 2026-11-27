import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  return { folder: basename(resolve(folder)), ...readModel(await readTexts(folder)) };
}

/** Takes the files of removed records away. */
export async function removeFiles(folder: string, paths: readonly string[]): Promise<void> {
  for (const path of paths) await rm(join(folder, path));
}

/**
 * Why files cannot be written as new ones below the model's folder, a line each; none when all
 * can. The reader passes over a link, and reads names as they are spelt. So a path that the
 * model has no file at may still be taken: by a link, or by `App-New.yaml` where `app-new.yaml`
 * is to go, on a disk that does not tell case apart. Each part of the way is looked up in its
 * folder's own list of names: a folder on the way must be a folder itself, and nothing may bear
 * the file's name, in any case. Case is held on every disk, so that a model does not come to
 * hold two names that another disk cannot. Nothing is written or made here.
 */
export async function blockedWrites(folder: string, paths: readonly string[]): Promise<string[]> {
  const reasons: string[] = [];
  const said = (path: string) => `\`${path}\``;
  for (const path of paths) {
    const parts = path.split('/');
    const refuse = (why: string) => reasons.push(`${said(path)} cannot be written: ${why}`);
    let dir = folder;
    for (const [index, part] of parts.entries()) {
      const names = await readdir(dir, { withFileTypes: true });
      const entry = names.find((each) => each.name === part) ?? names.find((each) => each.name.toLowerCase() === part.toLowerCase());
      if (entry === undefined) {
        // Nothing of that name: the folder is made, and the file is new. The disk is asked once more, since it may hold the name under a spelling that its list does not show.
        if (await lstat(join(dir, part)).then(() => true, () => false)) refuse(`${said(parts.slice(0, index + 1).join('/'))} is there under another spelling`);
        break;
      }
      const there = said([...parts.slice(0, index), entry.name].join('/'));
      if (entry.name !== part) refuse(`${there} is there, and the two differ only by case, which not every disk tells apart`);
      else if (entry.isSymbolicLink()) refuse(`${there} is a link, and seefore writes no file through one`);
      else if (index === parts.length - 1) refuse('it is there already, and was not when the model was read');
      else if (!entry.isDirectory()) refuse(`${there} is no folder`);
      else {
        dir = join(dir, part);
        continue;
      }
      break;
    }
  }
  return reasons;
}

/** The paths a rename writes where the model has no file: each new path that no file of the same rename leaves. */
export function newOfRename(changed: readonly { from: string; to: string }[]): string[] {
  const left = new Set(changed.map((file) => file.from));
  return changed.filter((file) => !left.has(file.to)).map((file) => file.to);
}

/**
 * Writes what a rename changed: each file it names at its new path, then takes away each old path
 * that no file is written to. All are written first, so `a b` with `b c` loses nothing. A path
 * that the model had no file at is written only where nothing is.
 */
export async function writeRenamed(folder: string, files: readonly SourceFile[], changed: readonly { from: string; to: string }[]): Promise<void> {
  const texts = new Map(files.map((file) => [file.path, file.text]));
  const written = new Set(changed.map((file) => file.to));
  const fresh = new Set(newOfRename(changed));
  for (const file of changed) {
    await mkdir(dirname(join(folder, file.to)), { recursive: true });
    await writeFile(join(folder, file.to), texts.get(file.to) as string, { encoding: 'utf8', flag: fresh.has(file.to) ? 'wx' : 'w' });
  }
  for (const file of changed) if (file.from !== file.to && !written.has(file.from)) await rm(join(folder, file.from));
}

/**
 * Writes what an apply did: the files of the records it adds and rewrites, each in its folder,
 * made when it is not there; then takes away the files it removes; and last the change's own
 * file, with `status: applied`. Stopped halfway, the change is still open, and the check tells
 * what is in. Nothing is undone here: the folder is in Git.
 */
export async function writeApplied(folder: string, written: readonly SourceFile[], gone: readonly string[], change: SourceFile, fresh: readonly string[]): Promise<void> {
  for (const file of written) {
    await mkdir(dirname(join(folder, file.path)), { recursive: true });
    // A record the change adds is written only where nothing is.
    await writeFile(join(folder, file.path), file.text, { encoding: 'utf8', flag: fresh.includes(file.path) ? 'wx' : 'w' });
  }
  await removeFiles(folder, gone);
  await writeFile(join(folder, change.path), change.text, 'utf8');
}
