// `npm run dev [-- --workdir=<dir>]`: the command on port 4400 and Vite together. Vite serves
// the page as it is edited and passes `/api` on to the command. Without --workdir, the small
// folder of the tests.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const given = process.argv.slice(2).find((arg) => arg.startsWith('--workdir='))?.slice('--workdir='.length);
// npm runs this in the package's folder; a folder given is read from where npm was run.
const workdir = given === undefined ? here('../test/small') : resolve(process.env.INIT_CWD ?? process.cwd(), given);

// The command will not start without a built page, though Vite serves its own.
if (!existsSync(here('../dist/ui/index.html'))) await build({ logLevel: 'warn' });

const command = spawn(process.execPath, [here('../src/server/main.ts'), '--server', `--workdir=${workdir}`], { stdio: 'inherit' });
const vite = await createServer();
await vite.listen();
vite.printUrls();

const stop = async (code: number): Promise<void> => {
  command.kill();
  await vite.close();
  process.exit(code);
};
command.on('exit', (code) => void stop(code ?? 0));
process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
