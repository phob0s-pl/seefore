import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

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
