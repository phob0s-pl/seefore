// Copies the conventions of stage 4 from the spec into the model skill, word for word.
//
// The spec, docs/modelling.md, is the source. The skill is installed apart from this
// repository, so it cannot point at the spec and has to carry the text. Two texts kept by hand
// drift; this keeps them one.
//
//   node scripts/sync-skill.mjs           copies each block from the spec into the skill
//   node scripts/sync-skill.mjs --check   changes nothing, and fails when the two differ

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'docs/modelling.md';
const SKILL = 'plugin/skills/model/SKILL.md';

/** The blocks the skill takes from the spec. Each stands between a pair of marks in both. */
const BLOCKS = ['conventions', 'cannot-say-yet'];

const start = (name) => `<!-- ${name}:start -->`;
const end = (name) => `<!-- ${name}:end -->`;

/** Where a block's text starts and ends in a file. Each mark must be there once, in order. */
function place(file, text, name) {
  const from = text.indexOf(start(name));
  const to = text.indexOf(end(name));
  const once = (mark) => text.indexOf(mark) === text.lastIndexOf(mark);
  if (from < 0 || to < 0) throw new Error(`${file} lacks the marks of the block "${name}".`);
  if (!once(start(name)) || !once(end(name))) throw new Error(`${file} has a mark of the block "${name}" twice.`);
  if (to < from) throw new Error(`${file} has the marks of the block "${name}" the wrong way round.`);
  return { from: from + start(name).length, to };
}

function main() {
  const check = process.argv.includes('--check');
  const spec = readFileSync(join(root, SPEC), 'utf8');
  const before = readFileSync(join(root, SKILL), 'utf8');

  let skill = before;
  for (const name of BLOCKS) {
    const source = place(SPEC, spec, name);
    const target = place(SKILL, skill, name);
    skill = skill.slice(0, target.from) + spec.slice(source.from, source.to) + skill.slice(target.to);
  }

  if (skill === before) {
    console.log(`${SKILL} carries the conventions of ${SPEC} word for word.`);
    return 0;
  }
  if (check) {
    console.error(`${SKILL} does not carry the conventions of ${SPEC} word for word.`);
    console.error('The spec is the source. Change it there, then run `npm run sync:skill`.');
    return 1;
  }
  writeFileSync(join(root, SKILL), skill);
  console.log(`Copied the conventions of ${SPEC} into ${SKILL}.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (fault) {
  console.error(fault instanceof Error ? fault.message : String(fault));
  process.exitCode = 1;
}
