// `npm run check`: the type checks, the tests and the build of the page, then how long they took.
import { spawnSync } from 'node:child_process';

const start = performance.now();
let passed = true;
for (const step of ['types', 'test', 'build']) {
  if (spawnSync('npm', ['run', step], { stdio: 'inherit' }).status !== 0) {
    passed = false;
    break;
  }
}
const seconds = ((performance.now() - start) / 1000).toFixed(1);
console.log(`\ncheck ${passed ? 'passed' : 'failed'} in ${seconds} seconds`);
process.exitCode = passed ? 0 : 1;
