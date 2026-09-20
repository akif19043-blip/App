/**
 * The standards gate, as a suite.
 *
 *     node tests/standards.test.mjs
 *
 * Everything here is checked by tools/check.mjs; this file only reports it in
 * the same PASS/FAIL shape as the browser suites, so `npm test` is one answer
 * rather than two. It needs no server and no browser, which is why the runner
 * runs it before the ones that do: a stale service worker or a missing
 * translation should cost a second to find out about, not a full browser run.
 *
 * That the checks themselves work is gate.test.mjs's job, not this one's.
 *
 * docs/ENGINEERING-STANDARDS.md says what each check is defending, and why.
 */

import { runChecks, scope } from '../tools/check.mjs';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

const { files, sources } = scope();
console.log(`   ${files} files, ${sources} of them source`);

for (const result of runChecks()) {
  check(result.name, result.ok);
  if (result.ok) continue;
  console.log(`      ${result.why}`);
  for (const problem of result.problems.slice(0, 20)) console.log(`      - ${problem}`);
  const extra = result.problems.length - 20;
  if (extra > 0) console.log(`      - ...and ${extra} more`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
