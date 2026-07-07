RELEASE-AUDIT — 2026-07-08
`ecode` — long-life-roadmap 待做 16

Gates: docs/long-life-roadmap.md H5 ("release path A when install friction
is low and tests are green from a fresh checkout") and the A1 decision point
in docs/note-release-paths.md ("approve running RELEASE-AUDIT"). This run
is that audit.

Method: `git clone file:///Users/lesprivilege/Projects/ecode ecode-fresh`
stands in for a real user's `git clone https://github.com/<org>/ecode.git`.
`file://` only removes network variance from the *ecode* clone step itself —
it does not change what npm resolves (npm still hit the real registry over
the network throughout). A real GitHub clone would behave identically from
this point on.

All work happened under
`/private/tmp/claude-501/-Users-lesprivilege-Projects-ecode/9b330169-6a95-4e53-9178-074b4c61541b/scratchpad/release-audit/`.
`/Users/lesprivilege/Projects/ecode` and its `pi/` fork were only ever read
from (via `file://`); both were verified clean (`git status`) at the end of
the run. Nothing was committed, nothing was published, nothing left the
machine except ordinary `npm install` registry traffic and pi's own
model-catalog build step (see Finding F6).

Environment: macOS 25.5.0 (Darwin, arm64), Node v25.9.0, npm 11.12.1.
Node v25 is a non-LTS (odd-numbered) release; pi's own `engines` field only
requires `>=22.19.0`. Everything below passed on v25.9.0 — the more common
LTS case (Node 22) was not separately tested, so treat that as an
unexamined variable, not a known-good claim.

## Verdict

**Path A needs X, Y first.** Not ready as-is against the H5 bar. The gap is
narrow and fully diagnosed, not architectural:

- **X — install friction is not low.** The very first command a stranger
  runs in `extensions/deterministic-compaction` or `experiments/` (`npm ci`
  or plain `npm install`) hard-fails with a registry 404, before anything
  else happens. Fix verified: add `peerDependenciesMeta` (`optional: true`
  for each peer) to both package.json files — plain `npm install`, zero
  flags, then succeeds. See Finding F1.
- **Y — typecheck is not green as shipped.** `extensions/deterministic-compaction`'s
  `npm run typecheck` fails (10 errors) even with everything else in place,
  because `tsconfig.json` is missing one `paths` entry that its own sibling
  `vitest.config.ts` and `experiments/tsconfig.json` already have. Fix
  verified: add the one line. Errors go 10 → 0. See Finding F4.
- **Z — the `pi/` dependency is undocumented, not just gitignored.** Once X
  and Y are fixed, a stranger who clones `ecode` and correctly works around
  the install failure will *still* watch every extension/experiments test
  that touches pi fail with `Cannot find package '@earendil-works/pi-*'`,
  with zero guidance from README/CONTRIBUTING about cloning or building a
  second repository to fix it. This is a documentation gap, not a code
  bug. See Finding F3 and F7.

`packages/compaction-core` alone clears the bar today: zero-dependency
claim verified, `npm ci`/`test`/`typecheck`/`build` all green, standalone,
no pi/ needed. If path A shipped only `compaction-core` this week, it would
need no further work. It's the extension (and, incidentally, the
experiments harness) that isn't there yet, and the fixes for both are a
handful of lines plus a paragraph of docs — this is a "next session" gap,
not a redesign.

## Step-by-step table

| # | Step | Command | Outcome | Time |
|---|---|---|---|---|
| 1 | Fresh checkout stand-in | `git clone file://…/ecode ecode-fresh` | PASS | 0.28s |
| 2 | Confirm `pi/` absent (gitignored) | `ls pi` | PASS (absent, as designed) | instant |
| 3 | compaction-core install | `npm ci` | PASS — 45 pkgs | 1.8s |
| 4 | compaction-core test | `npm test` | PASS — 40/40 tests, 2/2 files | 1.8s |
| 5 | compaction-core typecheck | `npm run typecheck` | PASS — 0 errors | 0.9s |
| 6 | compaction-core build (bonus — publish readiness) | `npm run build` | PASS — `dist/` matches package.json `files` | 0.4s |
| 7 | compaction-core zero-dep verification | `npm ls --prod` | PASS — empty tree | instant |
| 8 | extension install (naive) | `npm ci` | **FAIL** — E404 on `@ecode/compaction-core` | 18.4s |
| 9 | extension install (naive, alt) | `npm install` | **FAIL** — same E404 | 1.2s |
| 10 | extension install (workaround) | `npm install --legacy-peer-deps` | PASS — 46 pkgs, 0 vulnerabilities | 0.9s |
| 11 | extension test, pi/ absent | `npm test` | **FAIL** — 17/27 files fail (import errors); the 10 files that could run: 89/89 tests pass | 2.7s |
| 12 | extension typecheck, pi/ absent | `npm run typecheck` | **FAIL** — cascading `TS2307` + missing Node ambient types | ~1s |
| 13 | Clone pi fork (2nd manual step) | `git clone file://…/ecode/pi pi` | PASS | 0.29s |
| 14 | pi workspace install | `npm ci` (at `pi/` root) | PASS — 352 pkgs, 0 vulnerabilities (real registry hit) | 7.6s |
| 15 | extension test, pi/ present | `npm test` | PASS — 27/27 files, 196/196 tests | 5.6s |
| 16 | extension typecheck, pi/ present (unpatched) | `npm run typecheck` | **FAIL** — 10 errors, single root cause (F4) | 5.1s |
| 17 | *(scratch-clone-only patch)* add missing tsconfig `paths` entry | 1-line edit | — | — |
| 18 | extension typecheck, patched | `npm run typecheck` | PASS — 0 errors | ~1s |
| 19 | experiments install (naive) | `npm ci` | **FAIL** — same E404 pattern | 16.5s |
| 20 | experiments install (workaround) | `npm install --legacy-peer-deps` | PASS — 46 pkgs, 0 vulnerabilities | 1.0s |
| 21 | experiments test, pi/ absent | `npm test` | **FAIL** — 2/10 files fail, 6/68 tests fail | 1.3s |
| 22 | experiments typecheck, pi/ absent | `npm run typecheck` | **FAIL** — 233 errors (35 direct `@earendil-works/*` + cascade) | ~1s |
| 23 | experiments test, pi/ present | `npm test` | PASS — 10/10 files, 72/72 tests | 9.3s |
| 24 | experiments typecheck, pi/ present | `npm run typecheck` | PASS — 0 errors (tsconfig here was already correct) | 5.7s |
| 25 | Launcher smoke, pi cloned but **not built** | `./bin/ecode --help` (no API key) | **FAIL gracefully** — actionable message, exit 1 | instant |
| 26 | Build pi (3rd manual step, launcher-only) | `npm run build` (at `pi/` root) | PASS — but see Finding F6 (live network fetch, mutates 8 tracked files) | 8.6s |
| 27 | Launcher smoke, pi built | `./bin/ecode --help` (no API key) | PASS — full help text, clean "no provider key" warning, exit 0 | instant |
| 28 | Launcher smoke, version | `./bin/ecode --version` (no API key) | PASS — prints `0.80.3`, exit 0 | instant |
| 29 | *(isolated-copy verification)* surgical install fix | `npm install` (plain, `peerDependenciesMeta` patch applied, no lockfile) | PASS — 45 pkgs, 0 vulnerabilities, **zero flags needed** | 41s |

Total command execution time: well under 2 minutes. Total wall-clock for
the audit (including investigation): ~18 minutes.

## Findings

### F1 — `npm ci` / `npm install` hard-fail in both `extensions/deterministic-compaction` and `experiments/` (blocking)

Both package.json files declare:

```json
"peerDependencies": {
  "@earendil-works/pi-agent-core": "*",
  "@earendil-works/pi-ai": "*",
  "@earendil-works/pi-coding-agent": "*",
  "@ecode/compaction-core": "*"
}
```

None of these four packages are published to npm (`@ecode/compaction-core`
is the one built in this very repo; the three `@earendil-works/*` names are
pi's own workspace packages, also unpublished). Since npm 7, plain
`npm install`/`npm ci` auto-installs peer dependencies unless told
otherwise. With a wildcard `*` range, npm reaches for the registry and
gets:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@ecode%2fcompaction-core - Not found
```

This aborts the **entire** install — not even `typescript`/`vitest`
(devDependencies) get installed. `npm test` then fails with
`vitest: command not found`, not a test failure. This is not a quirk of
this sandbox: it is standard npm≥7 behavior and would hit any stranger who
runs the obvious first command, in this exact form, unconditionally.

There is no root `package.json`, no npm/pnpm `workspaces` field anywhere in
the repo, and no `.npmrc` — so there is no automatic local-linking
mechanism that would let npm resolve these siblings without touching the
registry. Repo instructions are silent on this (README has zero mentions of
`npm install`, `npm ci`, `workspaces`, or `legacy-peer-deps`).

**Workaround, verified:** `npm install --legacy-peer-deps` succeeds (46
packages, 0 vulnerabilities) in both folders.

**Surgical fix, verified in an isolated copy (step 29):** replace the
blunt `--legacy-peer-deps` flag with `peerDependenciesMeta` marking each
peer optional:

```json
"peerDependenciesMeta": {
  "@earendil-works/pi-agent-core": { "optional": true },
  "@earendil-works/pi-ai": { "optional": true },
  "@earendil-works/pi-coding-agent": { "optional": true },
  "@ecode/compaction-core": { "optional": true }
}
```

With this in place, a **plain** `npm install` — zero flags, no lockfile —
succeeds cleanly (45 packages, 0 vulnerabilities, ~41s cold resolution).
This is the more correct fix: it doesn't change npm's global peer-conflict
policy for the consumer, it just tells npm these four specific peers are
optional (which is true — the extension resolves them via source-level
path aliases, never via `node_modules`). Recommended over `--legacy-peer-deps`.

### F2 — `packages/compaction-core` genuinely stands alone (positive finding)

Verified from the fresh clone, independent of everything else in this
report:

- `package.json`: `"dependencies": {}`, `"peerDependencies": {}` — devDependencies
  are only `typescript` and `vitest`.
- `npm ls --prod` after `npm ci`: empty tree.
- `grep -rn "^import" src/` : the only imports are local (`./types`, etc.);
  nothing external.
- `npm ci` → `npm test` (40/40 tests, 2 files) → `npm run typecheck` (0
  errors) → `npm run build` all pass cleanly and fast (under 2s each), and
  `build` produces exactly the 14 `dist/*.{js,d.ts,*.map}` files that
  `package.json`'s `"files": ["dist"]` promises to publish.

The zero-dependency claim is true. This package is release-ready as-is.

One hygiene note, not a blocker: `npm audit` reports 5 vulnerabilities (3
moderate, 1 high, 1 critical), all inside the dev-only `vitest@2.1.x` →
`vite`/`esbuild` chain (the well-known esbuild dev-server request-forgery
advisory). None of this ships — only `dist/` is published — but it's
inconsistent with `extensions/deterministic-compaction` and `experiments/`,
which both already pin `vitest@^4.1.9` and report 0 vulnerabilities.
Bumping compaction-core to vitest 4 would remove the only vulnerability
noise in this whole audit and align the three packages' toolchains.

### F3 — `pi/` must be manually cloned, installed, and (for the launcher only) built — none of this is documented in `ecode`'s own README/CONTRIBUTING

The `pi/` fork is deliberately gitignored (`pi/` in `.gitignore`, by
design — it's a separate fork of `badlogic/pi-mono`). But nothing at the
`ecode` repo root tells a stranger they need it, or how to get it. The only
place this is discoverable is a source comment inside
`extensions/deterministic-compaction/vitest.config.ts`:

> "Resolve the pi-mono workspace sources … so no build of pi is required.
> Transitive deps … resolve from the pi/packages/coding-agent/node_modules
> tree that owns the resolved sources."

A stranger who clones `ecode`, fixes the F1 install failure, and runs
`npm test` in the extension or experiments folder will watch the majority
of test files fail with `Cannot find package '@earendil-works/pi-tui'`
(and siblings) with no pointer back to a fix. The three concrete steps
that actually resolve it:

1. `git clone <pi-fork-url> pi` as a sibling of the repo's own root
   (`ecode-fresh/pi`, i.e. one level below wherever `extensions/` and
   `experiments/` live).
2. `npm ci` inside `pi/` (it's a real npm-workspaces monorepo — root
   `package.json` has a `workspaces` field for `packages/*`; this step
   pulls 352 packages from the real registry, ~7.6s here, 0 vulnerabilities).
3. (Launcher only, not needed for either package's own test suite) `npm run
   build` inside `pi/` — this is what produces
   `pi/packages/coding-agent/dist/cli.js`, which `bin/ecode` hard-requires.

None of 1–3 appear in `README.md`, `GOALS.md`, or any file a first-time
visitor would naturally open. `docs/g0-survey.md` documents installing
*inside* pi's own monorepo for an unrelated purpose, and
`docs/g2-task-packets.md` documents a different, unrelated workspace-isolation
scheme for 4-arm experiment packets — neither covers this.

Recommendation: a short "Development setup" section in the top-level
README (or a CONTRIBUTING.md, currently absent at the `ecode` root) stating
steps 1–3 explicitly would close this gap for near-zero cost.

### F4 — `extensions/deterministic-compaction`'s `npm run typecheck` fails even with `pi/` fully cloned and installed — one missing `tsconfig.json` line (fixed and verified)

With `pi/` present and built, `npm test` is fully green (196/196), but
`npm run typecheck` still fails with 10 errors, e.g.:

```
../../pi/packages/coding-agent/src/core/auth-storage.ts(16,69): error TS2307:
Cannot find module '@earendil-works/pi-ai/oauth' or its corresponding type declarations.
```

Root cause, confirmed: `extensions/deterministic-compaction/tsconfig.json`'s
`"paths"` map has entries for `@earendil-works/pi-ai` and
`@earendil-works/pi-ai/compat`, but not `@earendil-works/pi-ai/oauth` — even
though the **sibling file in the same folder**, `vitest.config.ts`, already
aliases that subpath correctly, and `experiments/tsconfig.json` (one
directory over) already has the correct three-entry version. This is a
plain omission, not a design decision — the pattern it should match already
exists twice in the same repo.

Verified fix (applied only to the disposable scratch clone, **not** the
real repo): adding one line to
`extensions/deterministic-compaction/tsconfig.json`:

```json
"@earendil-works/pi-ai/oauth": ["../../pi/packages/ai/src/oauth.ts"],
```

takes `npm run typecheck` from 10 errors to 0. The other ~7 errors in the
original list (implicit-`any` parameters, a `Set<unknown>` vs
`ReadonlySet<string>` mismatch, all inside `pi/packages/coding-agent/src/`,
not in the extension's own code) were downstream consequences of the same
unresolved import, not independent bugs — they disappeared with the same
one-line fix. Confirmed independently that `pi`'s own toolchain (`tsgo`, the
experimental native-preview compiler pi typechecks itself with) reports 0
errors on the same file — plain `tsc` (what the extension's `typecheck`
script actually runs) is evidently more complete/strict here, which is why
this had gone unnoticed inside pi's own CI but surfaces the moment a
sibling package points real `tsc` at pi's raw source.

### F5 — `experiments/` typecheck was already correct; test/typecheck failure modes before `pi/` mirror the extension's

Before `pi/` is present: `npm test` → 2/10 files fail, 6/68 tests fail
(one failure is a subprocess `execFileSync` call that does a runtime
`ENOENT` on `pi/packages/coding-agent/src/index.ts`, not just an import-time
resolution error — worth knowing if debugging this cold, since the error
shape looks different from the extension's pure import-time failures).
`npm run typecheck` → 233 errors, 35 of them direct
`Cannot find module '@earendil-works/*'`, the rest cascading (mostly the
same "no `@types/node` reachable yet" pattern described below). After
cloning + installing `pi/`: both are fully green (72/72 tests, 0 typecheck
errors) with no code changes needed — `experiments/tsconfig.json` already
had the complete alias list.

Side note on the `@types/node` cascade: neither package declares
`@types/node` as a devDependency, and both tsconfigs set `"types": []`
(which normally blocks automatic `@types/*` inclusion). Before `pi/` is
cloned, this shows up as `Cannot find name 'process'/'console'`,
`Cannot find module 'node:fs'` even in files that don't import any pi
package. After `pi/` is cloned and installed, these errors vanish too —
because TypeScript's ambient/global declarations are program-wide: once
any file reachable through the path aliases (i.e., something inside
`pi/packages/*/src`) resolves `@types/node` via `pi/node_modules` (hoisted
there by pi's own `npm ci`), that ambient scope becomes visible to every
file in the same compilation, including `experiments/compare.ts`. Nothing
needs to be added here — it's a side effect worth understanding so it isn't
mistaken for a separate missing dependency.

### F6 — `pi`'s own build performs a live network fetch and mutates 8 git-tracked files (observation, not a path-A blocker)

`npm run build` at the `pi/` root includes, inside the `ai` package's build
script:

```
generate-models      → fetches from the OpenRouter API ("Fetched 263 tool-capable models…")
generate-image-models → fetches from the OpenRouter API ("Fetched 35 image models…")
```

Both succeeded here (this sandbox has outbound network access). After the
build, `git status` inside `pi/` shows 8 modified, already-tracked files
(`packages/ai/src/image-models.generated.ts`,
`packages/ai/src/providers/{amazon-bedrock,anthropic,fireworks,huggingface,
mistral,opencode,openrouter}.models.ts`) — the live fetch overwrote
checked-in catalogs with fresher data. This is expected/intentional
upstream behavior (these are meant to be periodically regenerated), but it
means: (a) a stranger who runs `npm run build` inside `pi/` and then
`git status` will see an unexpectedly dirty working tree with no
explanation nearby, and (b) build behavior in a network-restricted
environment (offline CI, air-gapped box) was **not tested here** — whether
the build fails hard or degrades gracefully to the checked-in catalog is an
open question. This doesn't gate path A (compaction-core + the extension
don't need pi *built*, only cloned+installed, per F3), but it does gate
the *launcher* smoke test and is worth flagging since it's a genuine
surprise for anyone building pi fresh.

### F7 — Launcher (`bin/ecode`) behaves correctly and gracefully in both states

`bin/ecode` checks for `pi/packages/coding-agent/dist/cli.js` before doing
anything else:

- **Before `pi/` is built:** exits 1 with
  `ecode: pi CLI not built. Run: (cd ".../pi" && npm install && npm run build)`
  — no stack trace, exact remediation command included. This is the one
  piece of onboarding guidance that already exists in the repo (in a
  shell script, not docs) — it's good, but it only covers the *build* step,
  not the earlier *clone* step from F3, since it assumes `pi/` already
  exists at that path.
- **After `pi/` is built, with no API key exported:** `--help` and
  `--version` both exit 0. The script's own provider-detection logic
  prints a clear, non-fatal warning to stderr
  (`ecode: no provider key detected (checked: DEEPSEEK_API_KEY,
  MIMO_API_KEY+MIMO_BASE_URL).`) and still proceeds to hand off to the
  real `pi` CLI, which prints full `--help` text or the version string as
  appropriate. The launcher's idempotent self-heal (symlinking
  `.ecode-agent/extensions/deterministic-compaction` into place on every
  invocation) also fired correctly and was verified on disk.

No issues found in the launcher itself — it is the best-behaved piece of
the whole audit.

## Friction list (every manual step beyond clone + install + test)

1. `npm ci`/`npm install` must be re-run with `--legacy-peer-deps` (or the
   package.json needs `peerDependenciesMeta`) in both
   `extensions/deterministic-compaction` and `experiments/` — plain install
   hard-fails (F1).
2. The `pi/` fork must be cloned manually as a sibling directory — not
   automated, not documented anywhere a stranger would find it (F3).
3. `pi/` must then be `npm ci`'d separately (it's its own workspace root)
   before any alias-based test/typecheck in the extension or experiments
   will resolve (F3).
4. `extensions/deterministic-compaction/tsconfig.json` needs a one-line fix
   before `npm run typecheck` is green, even with everything above done
   (F4) — this is a real, pre-existing bug, independent of the clone
   choreography.
5. To smoke-test the actual `ecode` launcher (as opposed to the packages'
   test suites), `pi/` must additionally be **built**
   (`npm run build` at its root) — a third manual step, only needed for
   this one purpose (F3, F7).
6. Building `pi/` silently performs a live external network fetch
   (OpenRouter) and leaves 8 tracked files modified — surprising, and its
   offline behavior is untested (F6).
7. (Hygiene, not blocking) `packages/compaction-core` pins `vitest@^2.1.0`,
   the only package of the three with npm-audit findings (5, all dev-only);
   the other two already use `vitest@^4.1.9` with 0 findings (F2).

## What's genuinely ready right now

- `packages/compaction-core`: install, test, typecheck, and build are all
  green from a true fresh clone, no `pi/` involved, zero runtime
  dependencies confirmed empirically (not just by reading package.json).
  Ready to publish today as far as this audit can tell.

## What path A needs before it clears the H5 bar

1. Add `peerDependenciesMeta` (all four peers, `optional: true`) to
   `extensions/deterministic-compaction/package.json` and
   `experiments/package.json` — verified fix, use it exactly as tested
   in Finding F1.
2. Add `"@earendil-works/pi-ai/oauth": ["../../pi/packages/ai/src/oauth.ts"]`
   to `extensions/deterministic-compaction/tsconfig.json`'s `"paths"` —
   verified fix, Finding F4.
3. Write down, in the `ecode` README or a new CONTRIBUTING.md, the three
   commands from Finding F3 (clone pi as a sibling, `npm ci` inside it,
   `npm run build` inside it if you want to run the launcher) — a
   documentation task, not a code change.
4. Decide (A2, per `docs/note-release-paths.md`) whether the release form
   is an actual `npm publish` or a repo-tag + README install section —
   orthogonal to this audit, but 1–3 above are prerequisites either way,
   since both forms still require a stranger to get past `npm install`
   and see green tests.

None of this is deep. Items 1 and 2 are verified, few-line diffs; item 3 is
a paragraph of prose. Path A is close, not far — but it is not "ready
as-is" today, and shipping it without 1–2 means the first thing every
adopter hits is a 404.

## Artifacts

Full logs backing every row of the step table are saved alongside this
report:

- `ext-test-before-pi.log`, `ext-test-after-pi.log`
- `ext-typecheck-before-pi.log`, `ext-typecheck-after-pi.log`,
  `ext-typecheck-after-pi-patched.log`
- `experiments-test-before-pi.log`, `experiments-test-after-pi.log`
- `experiments-typecheck-before-pi.log`, `experiments-typecheck-after-pi.log`
- `pi-build.log`

Scratch clone (disposable, not part of the deliverable):
`ecode-fresh/` (~561 MB total, of which `pi/node_modules` alone is 333 MB).
Both `/Users/lesprivilege/Projects/ecode` and its `pi/` fork were confirmed
untouched (`git status` clean) at the end of this run.
