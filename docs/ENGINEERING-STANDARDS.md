# How work gets done here

This is a small repository with no ticket tracker, no reviewer and no release
train. What keeps it honest is that everything it promises is either tested or
checked, and the few things that are neither say so out loud.

This file is the standard. `npm run check` is the part of it a machine keeps.

## The standard

**Finish the thing.** The marginal cost of completeness is close to zero: the
hard part was understanding the problem, and that is already paid for by the
time the first line is written. So the feature ships with its tests, its
documentation, its translations and its generated files regenerated — not as
extra credit, as the same piece of work. A change that leaves any of those
behind is not a small change, it is an unfinished one.

**No dangling threads.** If tying it off takes five more minutes, it takes
five more minutes. There is no `TODO` in this tree and there should never be
one: a marker is a promise to come back, and nobody comes back. Do it, or
decide out loud not to do it and delete the half of it that exists.

**No workaround when the real fix exists.** Working around something you can
see and reach leaves two problems where there was one — the original, and the
code that dodges it. Fix the cause. If the cause is genuinely out of reach
(no Android SDK in this environment, for instance), say exactly that, where
the next person will read it, the way [RELEASE.md](RELEASE.md) does.

**Search before building.** Most of what a change needs already exists here:
`kit.loft()` builds bodywork, `i18n` already has the string, the manifest
already carries the measurement, three.js already solved the maths. Read
first. The second implementation of something is worse than the first, because
now they can disagree.

**One way to do a thing.** Duplication is drift with a delay on it. The four
browser suites used to carry four copies of the same twenty-line preamble,
which is how they ended up with three different timeouts for the same wait and
one suite that quietly ignored console errors. They now share
[tests/harness.mjs](../tests/harness.mjs); there is one number and one rule.

**Generated files are generated.** `game/sw.js`, `game/assets/models/*.glb`,
`manifest.json`, the store art and the Android icons all come out of a script.
Never hand-edit one. Change the generator and rerun it — and if you forget,
the gate will tell you, because a stale service worker means returning players
keep the old build forever and nobody finds out for months.

**Explain why, not what.** Every module opens with a comment saying what it is
for and what it is defending against. The code already says what it does; the
reason it does it that way is the thing that gets lost. This applies to commit
messages too: they are the only place a decision is recorded, so write them
like you are explaining the change to someone who has to change it again next
year.

**Test before shipping.** Every claim the README makes about behaviour should
be a check in a suite: that the traffic does not drive through buildings, that
wet roads lengthen the braking distance, that the controls stay on screen at
six screen sizes. If a claim is hard to test, that is usually the code telling
you it is hard to reason about.

**Make the rule executable.** A standard nobody can run is a preference. Every
rule in this file that has a right answer is in `tools/check.mjs`, so it is
enforced in a second rather than remembered during review. When you find a new
class of mistake, the fix is two changes: repair the instance, then add the
check so the class cannot come back.

**Neither time, fatigue nor complexity is a reason to lower it.** They are
reasons to make the piece of work smaller. Ship less, finished — never more,
half-done.

## Done means

- [ ] The behaviour is covered by a check in `tests/`, and it fails without
      the change.
- [ ] `npm test` is green — all suites, not the one you were working on.
- [ ] `npm run check` is green.
- [ ] Player-facing text exists in **both** Turkish and English.
- [ ] Anything generated has been regenerated (`npm run sw` at minimum; also
      `npm run assets` and `npm run store` if you touched the Blender side).
- [ ] The README says what the game now does, if what it does has changed.
- [ ] The commit message explains why, not just what.
- [ ] Nothing was left for later. If something genuinely was, it is written
      down where the next person will find it, with the reason.

## The gate

`npm run check` runs [tools/check.mjs](../tools/check.mjs): about a second, no
browser, no dependencies. `npm test` runs it too, before it opens a browser,
so a typo costs a second rather than a five-minute run. Every check exists
because the mistake it catches does not show up as a failing test — it shows
up in front of a player.

| Check | What it is defending |
|---|---|
| no unfinished work is left in the tree | `TODO`/`FIXME`/`HACK` markers, which are promises nobody keeps |
| no debugging is left switched on | `console.log` in shipped code, `debugger`, a `page.pause()` that would hang CI |
| every module says what it is for | the header comment, where the *why* lives |
| the two translation tables agree | a key in one language and not the other, or `{placeholders}` that differ |
| every string is asked for, and everything asked for exists | keys that render as themselves, and dead strings a translator still has to carry |
| the offline cache matches what ships | a stale `game/sw.js`, which pins returning players to the old build |
| models, manifest and code agree | a model the game loads that was never exported, or geometry nothing uses |
| everything the shell points at exists | a mistyped element id, a missing icon, a stylesheet that 404s |
| the app is called the same thing everywhere | version and app id drift between `package.json`, Capacitor, Gradle and the Android resources |
| no module is stranded | a file nothing imports: dead code, or a feature that silently stopped shipping |
| the docs do not point at anything missing | broken links and `npm run` commands that no longer exist |
| the text is clean | trailing whitespace, tabs, CRLF, missing final newline, code past 100 columns |
| every source file parses | a stray bracket, found in a second instead of in a browser |
| nothing generated or private is tracked | build output in git, and — the one that cannot be undone — a signing key |

The gate reads its file list from git, including files you have not committed
yet, so a new file is held to the standard before it lands rather than after.

When a check fails it prints what it is defending and every instance with a
file and line. Fix the instances. **Do not weaken the check** to get green: if
a rule is genuinely wrong, change the rule deliberately, in its own commit,
with the reason written down.

A check nobody has watched fail is a check you only believe in, so
[tests/gate.test.mjs](../tests/gate.test.mjs) plants each of those fourteen
mistakes in a throwaway copy of the tree and requires that check — that one,
by name — to go red. Adding a check means adding its planted mistake in the
same commit; the suite is where you find out the regular expression you just
wrote matches nothing.

## Conventions

**Languages.** Players read Turkish and English: every string goes in
`game/js/i18n.js`, both tables, or it does not ship. Developers read English:
code, comments, commit messages and everything in `docs/` are in English. The
README is the exception — it is written for players, so it is in Turkish.

**Layout.** Code wraps at 100 columns. Two-space indent, single quotes, no
tabs anywhere, a newline at the end of every file. Prose and data (Markdown,
JSON) wrap where they want to; a table row cannot be broken and a sentence
should not be broken by a counter.

**Comments.** A module-level block at the top of every file saying what it is
for. Inline comments where the code is surprising, the measurement that
justified it where there is one ("50 m tower, 40 m shadow"), and nothing at
all where the code already says it.

**Tests.** One suite per area, a `check(name, ok, extra)` line per claim, named
as the thing being claimed ("traffic queues at a red light") rather than as
the function being called. Game time is stepped through `game.update(1/60)`
rather than waited on — software rendering here manages about four frames a
second, so wall-clock tests would be flaky and slow. Browser suites open the
game through [tests/harness.mjs](../tests/harness.mjs); they do not launch
Chromium themselves. New suites are picked up automatically: drop a
`*.test.mjs` in `tests/` and the runner finds it, running the ones that need
no browser first.

**Commits.** A summary line in the imperative, then prose: what changed, why
that way, what was rejected, and what it cost. Finish with the check count, as
in `Tests: 156 checks, all passing (was 148)`.

## Running it

```bash
npm install
npm run check     # the gate: a second, no browser
npm test          # the gate, then four browser suites
npm run serve     # play it
```

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the same two
commands on every push and pull request, so the answer is the same on your
machine and on the server. The screenshots the suites take are kept as build
artefacts.
