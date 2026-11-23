import { expect, test } from 'vitest';
import { readOptions, run } from '../src/server/command.ts';

test('the options read right', () => {
  expect(readOptions([], '/here')).toEqual({ server: false, workdir: '/here', port: 4400 });
  expect(readOptions(['--server', '--workdir=models/shop', '--port=4411'], '/here')).toEqual({
    server: true,
    workdir: 'models/shop',
    port: 4411,
  });
});

test('the options read wrong', () => {
  expect(readOptions(['--x'], '/here')).toEqual({ error: 'unknown option "--x"' });
  expect(readOptions(['shop'], '/here')).toEqual({ error: 'unknown option "shop"' });
  expect(readOptions(['--port=abc'], '/here')).toEqual({ error: 'the port must be a number from 1 to 65535, not "abc"' });
  expect(readOptions(['--port=70000'], '/here')).toHaveProperty('error');
  expect(readOptions(['--workdir='], '/here')).toHaveProperty('error');
});

test('a folder that is not there, or no --server, ends with 1 and one line', async () => {
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };

  expect(await run(['--server', '--workdir=nowhere'], '/here', io)).toBe(1);
  expect(lines).toEqual(['seefore: cannot read the folder "nowhere"']);

  lines.length = 0;
  expect(await run(['--workdir=nowhere'], '/here', io)).toBe(1);
  expect(lines).toEqual(['seefore: run it as "seefore --server [--workdir=<dir>] [--port=<n>]"']);
});
