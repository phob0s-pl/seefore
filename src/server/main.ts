// The command `seefore`, as `bin/seefore.js` starts it.
import { run } from './command.ts';

process.exitCode = await run(process.argv.slice(2), process.cwd(), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
