import { notStarted } from './check.ts';
import type { Io } from './io.ts';
import { main } from './main.ts';
import { openInBrowser } from './server/open.ts';

const columns = process.stdout.isTTY ? process.stdout.columns : undefined;

const io: Io = {
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
  // A terminal that does not say how wide it is counts as none.
  ...(columns !== undefined && columns > 0 ? { columns } : {}),
  terminal: process.stdout.isTTY === true,
  // The built command is one file, with the page and the layout's worker beside it.
  home: __dirname,
  open: openInBrowser,
  // Asked for only by --server. A second Ctrl+C stops the command at once, as it would without this.
  untilStopped: () =>
    new Promise((stopped) => {
      process.once('SIGINT', () => stopped());
      process.once('SIGTERM', () => stopped());
    }),
};

const argv = process.argv.slice(2);
Promise.resolve()
  .then(() => main(argv, io))
  .then(
    (code) => {
      process.exitCode = code;
    },
    (cause: unknown) => {
      // Nothing should reach here. If something does, say so plainly instead of printing a trace.
      const message = cause instanceof Error ? cause.message : String(cause);
      process.exitCode = notStarted(argv.includes('--json'), io, 'unexpected', `Something went wrong that seefore did not expect: ${message}`);
    },
  );
