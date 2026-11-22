import { spawn } from 'node:child_process';

/**
 * Opens an address in the person's browser, with what this system opens addresses with. When
 * that fails nothing more is done: the address is printed anyway.
 */
export function openInBrowser(address: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [address]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', address]]
        : ['xdg-open', [address]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Nothing to do: the address is printed.
  }
}
