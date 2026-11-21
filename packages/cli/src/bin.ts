import { notStarted } from './check.ts';
import type { Io } from './io.ts';
import { main } from './main.ts';

const io: Io = {
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
};

const argv = process.argv.slice(2);
try {
  process.exitCode = main(argv, io);
} catch (cause) {
  // Nothing should reach here. If something does, say so plainly instead of printing a trace.
  const message = cause instanceof Error ? cause.message : String(cause);
  process.exitCode = notStarted(argv.includes('--json'), io, 'unexpected', `Something went wrong that seefore did not expect: ${message}`);
}
