// Installs the built seefore command on this machine from a packed copy, the way a person who
// downloads it would get it. The installed command does not depend on this checkout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'seefore-pack-'));
try {
  const packed = execFileSync('npm', ['pack', '--workspace', 'seefore', '--pack-destination', folder, '--json'], {
    encoding: 'utf8',
  });
  const { filename } = JSON.parse(packed)[0];
  execFileSync('npm', ['install', '--global', join(folder, filename)], { stdio: 'inherit' });
  console.log('installed. Try: seefore --version   (to remove it: npm uninstall --global seefore)');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
