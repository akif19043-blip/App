/**
 * Does the gate actually bite?
 *
 *     node tests/gate.test.mjs
 *
 * A check nobody has watched fail is a check you only believe in. Every rule
 * in tools/check.mjs is asserted here by planting exactly the mistake it
 * exists to catch and requiring that check -- that one, by name -- to go red.
 *
 * Nothing is planted in the real tree. The working copy is copied into a
 * throwaway directory first, and `git init` there is enough for the gate to
 * enumerate files, because it asks git for untracked files as well as
 * tracked ones. The copy is deleted whether this passes or fails.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
};

// --- a disposable copy of the repository ------------------------------------

/** What the real tree looks like now, to prove at the end it still does. */
const gitStatusAtStart = execFileSync(
  'git', ['status', '--porcelain', '--', 'game', 'tools', 'tests'],
  { cwd: ROOT }).toString();

const SKIP = ['.git', 'node_modules', '.test-shots', '__pycache__'];
const copy = mkdtempSync(join(tmpdir(), 'dortyol-gate-'));
process.on('exit', () => rmSync(copy, { recursive: true, force: true }));

cpSync(ROOT, copy, {
  recursive: true,
  filter: (source) => !SKIP.some((name) => source.split('/').includes(name)),
});
execFileSync('git', ['init', '-q'], { cwd: copy });

/** Run the gate in the copy and return the names of the checks that failed. */
function gate() {
  let output;
  try {
    output = execFileSync(process.execPath, [join(copy, 'tools', 'check.mjs')],
                          { cwd: copy, stdio: 'pipe' }).toString();
  } catch (err) {
    output = ((err.stdout || '') + (err.stderr || '')).toString();
  }
  return output.split('\n')
    .filter((line) => line.startsWith('FAIL  '))
    .map((line) => line.slice(6).trim());
}

const file = (path) => join(copy, path);
const original = new Map();

/** Edit a file in the copy, remembering what it looked like. */
function edit(path, change) {
  const full = file(path);
  const before = readFileSync(full, 'utf8');
  if (!original.has(full)) original.set(full, before);
  writeFileSync(full, change(before));
}

/** Add a file the repository does not have. */
function add(path, body) {
  const full = file(path);
  if (!original.has(full)) original.set(full, null);
  writeFileSync(full, body);
}

/**
 * Stage a file in the copy's index.
 *
 * The one way to plant a tracked secret: `.gitignore` already excludes
 * `*.keystore`, so an untracked one is invisible to the gate -- correctly,
 * because an ignored file is not going anywhere. It takes a deliberate
 * `git add -f` to create the situation that check exists for.
 */
function track(path) {
  execFileSync('git', ['add', '-f', path], { cwd: copy });
  staged.push(path);
}

const staged = [];

/** Put everything back, so each planted mistake is tested on its own. */
function restore() {
  for (const path of staged.splice(0)) {
    execFileSync('git', ['rm', '--cached', '-q', '--ignore-unmatch', path],
                 { cwd: copy });
  }
  for (const [full, before] of original) {
    if (before === null) rmSync(full, { force: true });
    else writeFileSync(full, before);
  }
  original.clear();
}

// --- the gate is clean to begin with ----------------------------------------

check('the gate passes on an untouched copy of the tree', gate().length === 0,
      gate().join(', '));

// --- one planted mistake per check ------------------------------------------

const MISTAKES = [
  ['no unfinished work is left in the tree',
   () => edit('game/js/hud.js', (s) => s + '\n// TODO: tidy this up later\n')],

  ['no debugging is left switched on',
   () => edit('game/js/hud.js', (s) => s + "\nconsole.log('where am I');\n")],

  ['every module says what it is for',
   () => edit('game/js/quality.js', (s) => s.replace(/^\/\*\*[\s\S]*?\*\/\n/, ''))],

  ['the two translation tables agree',
   () => edit('game/js/i18n.js', (s) => s.replace("    'hud.map': 'Map',\n", ''))],

  ['every string is asked for, and everything asked for exists',
   () => edit('game/js/i18n.js',
              (s) => s.replace(/'hud\.map':/g, "'hud.nobodyAsksForThis':"))],

  ['the offline cache matches what ships',
   () => edit('game/css/style.css', (s) => s + '\n/* a new rule */\n')],

  ['models, manifest and code agree',
   () => edit('game/assets/models/manifest.json',
              (s) => s.replace('"models": {', '"models": {\n    "ghost": {"tris": 1},'))],

  ['everything the shell points at exists',
   () => edit('game/index.html',
              (s) => s.replace('id="menu-coins"', 'id="menu-coin"'))],

  ['the app is called the same thing everywhere',
   () => edit('package.json', (s) => s.replace('"version": "1.0.0"', '"version": "1.1.0"'))],

  ['no module is stranded',
   () => add('game/js/orphan.js', '/** Nothing imports this. */\nexport const x = 1;\n')],

  ['the docs do not point at anything missing',
   () => edit('README.md', (s) => s + '\n[missing](docs/NOT-A-FILE.md)\n')],

  ['the text is clean',
   () => edit('game/js/hud.js', (s) => s + '\nconst padded = 1;   \n')],

  ['every source file parses',
   () => edit('game/js/garage.js', (s) => s + '\nfunction broken( {\n')],

  ['nothing generated or private is tracked',
   () => {
     add('dortyol-release.keystore', 'not really a key\n');
     track('dortyol-release.keystore');
   }],
];

for (const [name, plant] of MISTAKES) {
  plant();
  const failed = gate();
  restore();
  const noticed = failed.includes(name);
  check(`it notices: ${name}`, noticed,
        noticed ? '' : `instead got: ${failed.join(', ') || 'nothing'}`);
}

// --- and the tree is exactly as it was --------------------------------------

check('the working copy was never touched',
      execFileSync('git', ['status', '--porcelain', '--', 'game', 'tools', 'tests'],
                   { cwd: ROOT }).toString() === gitStatusAtStart);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
