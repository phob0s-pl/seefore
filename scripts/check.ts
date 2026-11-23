// `npm run check`: the type checks, the build of the page and the tests, then how long they took.
// The page is built before the tests, since the test in a browser opens the built page.
import { spawnSync } from 'node:child_process';

const start = performance.now();
let passed = true;
for (const step of ['types', 'build', 'test']) {
  if (spawnSync('npm', ['run', step], { stdio: 'inherit' }).status !== 0) {
    passed = false;
    break;
  }
}
const seconds = ((performance.now() - start) / 1000).toFixed(1);
console.log(`\ncheck ${passed ? 'passed' : 'failed'} in ${seconds} seconds`);
process.exitCode = passed ? 0 : 1;
