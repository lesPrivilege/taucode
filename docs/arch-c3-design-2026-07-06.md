# ARCH-C'''-DESIGN — Work-Semantics Protocol Design

2026-07-06, Fable. Output of the cowork pass started from
`docs/cowork-fable-index-2026-07-06.md`. This document fixes the rulings, the
protocol schemas, the policy scope, the test plan, and the experiment manifest
for model-declared work semantics — plus one amendment produced during the
cowork: a **sideband summarizer** arm that answers the reasoning-tax objection
to in-band declarations.

Inputs: `r2-verdict.md`, `r2-turn-interaction-retro-2026-07-06.md`,
`llm-declared-work-semantics-2026-07-06.md`,
`extension-work-semantics-architecture-2026-07-06.md`,
`note-view-based-context.md`, `v3-ws-semantic-anchor-handoff-2026-07-06.md`.

## Notation

- **C**: deterministic projection (seam-A).
- **C''**: C + deterministic work anchor (`TAUCODE_SEMANTIC_ANCHOR`).
- **C'''**: C'' + model-declared retention sidecar (in-band tool call).
- **C-SB**: C'' + sideband summarizer (cheap off-loop LLM writes prose
  summaries into the ledger; main transcript byte-stable).
- **C+PL**: C + placebo tail (token-matched static reminder; ablation control).

## Rulings

R1 — **Design now, run later.** This design does not burn runs. No C'''/C-SB
real run before `C2-ANCHOR-E1` lands. The experiment manifest below branches on
the C'' result.

R2 — **Sideband channel = dedicated tool call** (`declare_work_semantics`).
Rejected: assistant content block (collides with DeepSeek v4 reasoning-replay
rules), structured response field (no provider contract), synthetic harness
event (model has no voice). A tool call is a legal transcript element with a
natural schema boundary; the harness replaces the tool result with a one-line
ledger ack, so the declaration is replayed in full at most once.
Known tax (recorded, unresolved): each declaration may cost a turn of main-model
reasoning. This is why C-SB exists as the preferred policy arm (R8).

R3 — **`semantic_complete`, mechanical definition.**
Ex ante (checkable): declared `path#hash` matches a ledger-observed view AND
`summary` is non-empty; otherwise the declaration is `unverified` and carries no
authority. In-contract: harness may collapse that view's raw form to ledger
form. Ex post (falsifiable): a re-read of that path while the disk hash is
unchanged is a calibration failure; a re-read after an edit (hash changed) is
normal succession, not a failure.

R4 — **First-experiment policy scope.** `verbatim`: full authority (protection
only; failure mode is wasted tokens). `semantic`: form-only substitution — may
change only *how* a view is compacted (ledger line + prose summary instead of
head-tail extract), never *whether*; the compaction set stays byte-identical to
C''. `routing` / `disposable`: capture-only, calibration counters only.
Malformed / unmatched: ignored with a metric, never a crash.

R5 — **False declarations: metric-only in round 1.** No tail warnings, no
dispatch penalty, no packet failure. Injected warnings would contaminate the
calibration data. Tail warnings are a round-2 candidate with a data-derived
trigger (e.g., ≥2 contradictions on one path).

R6 — **Provider server-side compaction stays landscape.** Revive trigger:
a cache-observable backend exposes an explicit compaction API.

R7 — **Minimal attribution experiment**: three arms on E1, n=3 — C'' (control),
policy arm (C-SB or C''', per R8 branch), C+PL (placebo). C''−placebo isolates
"mechanical facts vs any reminder"; policy−C'' isolates the semantic increment.

R8 (amendment) — **If C'' is insufficient on E1, the next policy arm is C-SB,
not C'''.** In-band declarations pay main-loop reasoning and risk declaration-
turn inflation; the sideband summarizer pays a cheap model off the critical
path and keeps the main transcript byte-stable. C''' is demoted to a
capture-only calibration study (model self-knowledge measurement; paper
material), and does not carry a policy KPI.

R9 (amendment, from retro F4) — **Provider-unit accounting is a hard
constraint.** All calibration/net-flow economics use provider usage tokens.
Local estimates may only gate projection triggering and must be labeled
estimates.

## Architecture Constraint: Author-Agnostic Ledger

One storage surface, three producers. Ledger records carry an `author` field so
C'', C''', and C-SB share storage, renderers, and calibration metrics. Policy
consumes the ledger and never asks who wrote a record beyond the authority
rules in R4. This keeps the "one system, three faces" invariant from the index.

## Deliverable 1 — Declaration Sidecar Schema

Tool exposed to the model when `TAUCODE_WS_DECLARATION=1`:

```json
{
  "name": "declare_work_semantics",
  "description": "Declare retention intent for files you have read or edited.",
  "input_schema": {
    "items": [
      {
        "path": "string, workspace-relative",
        "hash": "string, the content hash you saw (from read/edit evidence)",
        "retention": "verbatim | semantic | routing | disposable",
        "semantic_complete": "boolean, optional",
        "summary": "string, required when retention=semantic",
        "reason": "string, optional"
      }
    ],
    "pending": ["string, optional artifact paths still owed"],
    "decisions": ["string, optional"]
  }
}
```

Harness behavior:

- validate schema; reject whole block on schema violation (metric
  `ws_declaration_malformed`);
- each item must match an observed `path#hash` in the ledger, else recorded as
  `unverified` (metric `ws_declaration_unmatched`); hashes are never inferred;
- tool result returned to the model is exactly one line:
  `[ws] recorded N declarations (M matched, K unverified)`;
- declarations never enter reasoning content; DeepSeek replay semantics
  untouched (adapter regression test required).

## Deliverable 2 — Ledger Records And Calibration Metrics

```ts
type Author = "harness" | "model-inband" | "sideband";

type LedgerRecord =
  | { kind: "view"; path: string; hash: string; turn: number }
  | { kind: "edit"; path: string; oldHash?: string; newHash: string;
      diffstat: string; turn: number }
  | { kind: "edit_failed"; path: string; turn: number }
  | { kind: "test"; command: string; result: string; turn: number }
  | { kind: "declaration"; path: string; hash: string; retention: Retention;
      semanticComplete?: boolean; summary?: string; verified: boolean;
      turn: number; author: "model-inband" }
  | { kind: "summary"; path: string; hash: string; text: string;
      sourceHashes: string[]; turn: number; author: Author;
      providerCost?: { model: string; inputTokens: number; outputTokens: number } };
```

The ledger absorbs `TrustLedger` + `WorkAnchor` roles behind their existing
renderers (arch doc Step 1). Storage only; no compaction decisions.

Calibration metrics (JSONL per run, provider units per R9):

- `declared_disposable_reread_rate` — disposable/routing, later re-read;
- `declared_semantic_verbatim_reread_rate` — semantic_complete, re-read while
  disk hash unchanged (R3 ex-post failure);
- `declared_verbatim_never_used_rate` — verbatim protection never touched;
- `declaration_turn_overhead` — turns whose only tool call is the declaration;
- `sideband_cost_tokens` — Σ summarizer provider tokens (cheap rate);
- `compacted_path_reread_rate` — existing, the primary benefit proxy;
- `ws_declaration_malformed`, `ws_declaration_unmatched`.

Every metric changes a named decision: the first three calibrate model
self-knowledge (paper axis); overhead + sideband cost feed the net-flow gate;
re-read rate is the success criterion.

## Deliverable 3 — Projection Policy Rules (first experiment)

Module: `projection-policy.ts` (arch doc §5), pure function:

```text
(projection outcome, ledger snapshot, config, packet metadata)
  → { protectPaths, formSubstitutions, tailBlocks, calibrationEvents }
```

| Declaration | Policy effect (round 1) |
| --- | --- |
| `verbatim`, verified | protect path from projection for a bounded window (`TAUCODE_WS_VERBATIM_WINDOW`, default 8 turns) |
| `semantic`, verified, hash matches, no prior contradiction | form-only substitution: ledger line + summary replaces head-tail extract; compaction set unchanged vs C'' |
| `routing` / `disposable` | no policy effect; calibration counters only |
| unverified / malformed | no effect; metric |

Sideband `summary` records get the same form-only substitution right as
verified `semantic` declarations — same authority rule, different author.

Per-workload strategy profiles: policy takes a `profile` value
(`code-production | exploration | direct-transform`) as *data*, not as branches
in `extension.ts`. Round 1 profiles differ only in threshold and anchor flags,
matching the R2 dispatch table; online churn feedback (retro improvement 1) is
a separate later packet.

## Deliverable 4 — Sideband Summarizer (C-SB)

Flag: `TAUCODE_SIDEBAND_SUMMARY=1`. Model: `TAUCODE_SIDEBAND_MODEL`
(default: same provider, non-thinking cheap tier).

Mechanics:

- at seam-A projection time, for each view entering compaction with estimated
  payload ≥ `TAUCODE_SIDEBAND_MIN_TOKENS` (default 2k), fire an async summarizer
  call: input = view content + packet task statement excerpt; output ≤ 200
  tokens prose;
- write result to ledger as `kind: "summary"`, `author: "sideband"`, keyed
  `path#hash`, with `providerCost`;
- non-blocking: the current turn uses the deterministic extract; the summary
  becomes available for form-substitution on subsequent projected turns;
- if the file is edited before the summary lands, the summary is stillborn
  (stale hash) — recorded, never injected;
- main transcript remains byte-identical to C'' except for tail/substitution
  content that C'' policy already owns.

Net-flow gate (Non-Negotiable, provider units):

```text
Σ sideband provider cost + Σ substituted-summary replay delta
  < Σ avoided re-read input + trajectory-length savings
```

If this inequality fails on E1, C-SB is judged failed even if completion
improves — record it and stop, per roadmap stop conditions.

## Deliverable 5 — Fixtures And Byte-Stability Tests

- `semantic-events` fixtures: read, edit, write, failed edit, test pass/fail,
  declaration tool call.
- Byte-stability: flag-off identical; trust-on/anchor-off; anchor-on/
  declaration-off; anchor-on/sideband-off. Each new flag adds one identity
  fixture for its off state.
- Ledger lineage: read → edit → stale view → hint; declaration → edit →
  invalidation-is-not-failure (R3).
- Declaration parser: valid block, invalid JSON, unknown retention, missing
  hash, unmatched hash, duplicate declaration, `semantic` without summary.
- Policy: verbatim protection window expiry; semantic form-substitution
  produces byte-identical compaction *set* vs C'' fixture; disposable
  contradiction increments counter without policy change.
- Sideband: deterministic mock summarizer in tests; async landing order;
  stillborn-on-edit; cost accounting rows present.
- Adapter regression: assistant thinking blocks survive projection and
  declaration capture unchanged (DeepSeek replay).

## Deliverable 6 — Experiment Manifest (E1 × work semantics)

Prerequisite: `C2-ANCHOR-E1` (E1 × C'', n=3, real DeepSeek) has landed and been
audited like R2.

**Branch A — C'' sufficient** (E1 static reaches 5/5 ×3 and median cost ≤
~1.2× C): no policy arm needed. Run C''' as capture-only calibration study,
n=3, declarations recorded but policy-inert. Sideband deferred until a workload
shows the gap again.

**Branch B — C'' insufficient**: run three arms, n=3 each, same packet, same
audit discipline as R2:

| Arm | Flags | Question |
| --- | --- | --- |
| C'' | anchor | control |
| C-SB | anchor + sideband | does LLM semantic fusion close the completion gap at cheap-model prices? |
| C+PL | placebo tail | is the anchor effect just "any reminder helps"? |

Placebo spec: fixed generic reminder text, token-matched to the median C''
anchor block, injected on the same projected-turn schedule.

Success criteria (any policy arm):

- E1 static acceptance approaches D (target 5/5 ×3);
- median cost < D (2445) and ideally ≤ B' (1287) territory;
- `compacted_path_reread_rate` drops vs C;
- net-flow gate passes (Deliverable 4);
- no provider reasoning-replay regressions;
- if C+PL ≈ C'', the anchor line is reminder effect — re-evaluate the whole
  anchor thesis before further investment.

C''' in-band policy arm runs only if C-SB fails *and* calibration data from the
capture study shows high model self-knowledge (low contradiction rates).

## Dispatch Plan (coding packets)

Ordered; each lands independently with tests green and flag-off byte-identity.

- **WS-0 Extraction** — move the `tool_result` handling from `extension.ts`
  into `semantic-events.ts`; no behavior change. Acceptance: flag-off payloads
  byte-identical; V2-TP and V3-WS tests pass without fixture rewrites.
  Status 2026-07-06: landed as `src/semantic-events.ts` with direct fixtures;
  extension tests 143/143 and typecheck pass.
- **WS-1 Unified ledger** — `semantic-ledger.ts` absorbs `TrustLedger` +
  `WorkAnchor` behind existing renderers. Acceptance: C'' anchor text
  byte-identical on existing fixtures; one path/hash authority.
  Status 2026-07-06: landed as runtime `SemanticLedger`; `TrustLedger` is a
  compatibility wrapper, `WorkAnchor` remains renderer-fixture surface only.
  Extension tests 147/147 and typecheck pass. WS-2 and WS-3 may now proceed in
  parallel.
- **WS-1.5 Shared record prep** — `SemanticLedger` now predeclares the
  author-agnostic record surface for WS-2/WS-3: `Author = harness |
  model-inband | sideband`, inert `declaration` records, and inert `summary`
  records with optional provider-token cost. No producer or policy behavior.
- **WS-2 Declaration capture** — `work-semantics-declaration.ts` + tool
  registration behind `TAUCODE_WS_DECLARATION`; capture-only, no policy effect.
  Acceptance: parser test matrix (Deliverable 5); adapter regression;
  metrics rows appear in JSONL.
  Status 2026-07-06: landed as `work-semantics-declaration.ts` +
  `declare_work_semantics`; capture-only with canonical `decl_id`, path#hash
  verification, one-line ack, and online re-read calibration in
  `SemanticLedger.recordView`. Extension tests 161/161, experiments tests 47/47,
  both typechecks pass.
- **WS-3 Sideband summarizer** — behind `TAUCODE_SIDEBAND_SUMMARY`, mock
  provider in tests. Acceptance: async/non-blocking, stillborn-on-edit, cost
  rows, flag-off identity.
  Status 2026-07-06: landed as `sideband-summary.ts`; async read-summary
  scheduling writes inert `summary` records with provider-token cost. No
  projection substitution or injection behavior.
- **WS-4 Policy hints** — `projection-policy.ts` with R4 scope: verbatim
  window + form-only substitution (declaration- and sideband-sourced).
  Acceptance: policy test matrix; projected turns log which record changed
  policy; compaction-set identity vs C'' fixture.
  Status 2026-07-06: landed as `projection-policy.ts` plus compaction-core
  protected-path injection. `TAUCODE_WS_POLICY` is default-off; verified
  `verbatim` declarations protect paths for `TAUCODE_WS_VERBATIM_WINDOW` turns,
  and verified semantic declarations / sideband summaries can replace compacted
  read summary text by form only. Projection diffs stay unchanged for
  substitution cases.
- **EXP-WS Harness** — `experiments/run.ts` manifest support for C-SB / C+PL /
  C'''-capture arms + placebo token-matching. Acceptance: preflight wiring
  tests; flags recorded in JSONL meta.
  Status 2026-07-06: landed as addon arm specs over physical A/B/C/D arms.
  `C-SB`, `C+PL`, and `C'''-capture` are accepted by `run.ts`/`plan.ts`;
  JSONL meta records `extension_flags` for audit.

`extension.ts` remains a binder: packets may add flag parsing and module
instantiation there, but policy/schema/provider rules live in their own modules.

## Addendum 2026-07-06 — Tax Probe And Persistent Ledger

Two rulings added after WS-1.5, from the cowork discussion.

R10 — **Declaration tax probe (WS-2.5).** The in-band reasoning/output tax
(R2 "known tax, unresolved") gets its own cheap measurement instead of waiting
for E1. Mechanism: `TAUCODE_WS_DECLARE_NUDGE=every-turn` — a prompt nudge asking
the model to emit one `declare_work_semantics` call per turn. Measured in
dogfooding or mock runs, paired against an identical no-nudge run:

- per-turn declaration output tokens (provider units, R9);
- reasoning-token delta vs the paired run;
- `declaration_turn_overhead` (already in Deliverable 2);
- turn-count delta (declaration-turn inflation check).

Constraints: piggybacks on WS-2 capture machinery, no new mechanism; the nudge
changes model behavior, so it is a *measurement run type* and must never be
combined with any experiment arm. Output: one number the R8 branch can cite —
"an in-band declaration costs ~X output + Y reasoning tokens per turn."

R11 — **Persistent hash-addressed ledger (WS-5 write-only, WS-6 resume).**
The extension already extracts semantic events; when taucode codes taucode, those
facts should outlive the session for work continuation and decision reference.

WS-5 scope (write-only):

- flag `TAUCODE_LEDGER_PERSIST=1`, default off;
- append-only JSONL at `.taucode/ledger/<session-id>.jsonl`, one record per
  ledger entry (same shapes as Deliverable 2, plus session id + timestamp);
- `declaration.decisions`, `pending`, edits, and test results are the
  high-value continuation records; read views persist as hash lines only
  (storage-not-prose holds on disk too);
- `.taucode/ledger/` is gitignored by default; committing is a user choice —
  hash-addressed records keep diffs mergeable if committed;
- persistence must be flag-off in all experiment manifests; baselines stay
  uncontaminated;
- the persisted store needs its own retention rule before WS-6 (the
  self-inflation warning from `note-view-based-context.md`).

WS-6 scope (deferred, evidence-gated): loading a prior session's ledger and
injecting a continuation block via the existing volatile tail channel. This is
D-arm checkpoint semantics made deterministic and cross-session. Gate: WS-5
dogfooding shows the persisted records actually answer "where was I?" at
session start — capture before policy, same discipline as WS-2.

R12 — **Two hash spaces, one identity discipline.** The file-content hash
(`path#hash`) and the declaration-block hash are different roles and must not
be conflated:

- **File-content hash** = harness-observed fact, verifiable against disk at
  any time. The trust root is the filesystem, always.
- **Declaration-block hash** (`decl_id = sha256(canonical JSON)`) = identity
  of a model utterance. It proves "the model said exactly this, untampered";
  it never proves the statement true.

What `decl_id` buys, mechanically:

- **Idempotent recording**: a re-emitted identical declaration maps to the
  same `decl_id`; no duplicate ledger rows. The one-line ack may cite the id.
- **Stable citation**: calibration events, audits, and tail hints reference
  `decl_id`, giving every metric row a traceable evidence pointer.
- **Snapshot addressing**: WS-5 persisted records are dedupable across
  sessions/branches; a WS-6 continuation block carries its `decl_id` so the
  injected progress state can be re-verified against the stored ledger before
  injection.

Schema consequence (amends Deliverable 2): `declaration` and `summary`
records gain an `id` field — `decl_id` as primary key, `path#hash` as the
foreign key into fact space. Trust-protocol reporting emits evidence chains
("decl X at turn N references P#H; P#H observed/stale"), never treats a
`decl_id` as authority.

Mechanical requirement (WS-2 acceptance): canonical JSON serialization
(sorted keys, fixed whitespace) before hashing, with a fixture proving that
semantically identical blocks with different key order produce one `decl_id`.

Dispatch additions:

- **WS-2.5 Tax probe** — after WS-2. Acceptance: paired-run JSONL rows with
  provider-unit declaration cost; nudge flag has its own off-state identity
  fixture.
  Status 2026-07-06: landed as `tax-probe.ts`; `TAUCODE_WS_DECLARE_NUDGE=every-turn`
  appends a volatile nudge and writes per-turn output/reasoning/declaration-only
  JSONL rows under `.taucode/ws-tax-probe/`.
- **WS-5 Ledger persistence** — parallel-safe with WS-2/WS-3 (consumes the
  ledger surface, adds a sink; only shared file is the binder's flag wiring).
  Acceptance: flag-off writes nothing; JSONL schema fixture; no read-back path
  exists.
  Status 2026-07-06: landed as `ledger-persistence.ts`; `TAUCODE_LEDGER_PERSIST=1`
  writes append-only JSONL under `.taucode/ledger/`, persists read views as hash
  lines only, and has no read-back path.
- **WS-2 amendment (R12)** — declaration parser computes `decl_id` over
  canonical JSON; ledger records carry `id`; canonicalization fixture
  required.

## Addendum 2026-07-07 — Branch B Verdict And Branch C

Rulings after the Branch B real runs
(`docs/reports/branch-b-e1-2026-07-07.md`).

R13 — **C-SB failure is spec violation, not design falsification.**
Deliverable 4 specified output ≤ 200 tokens and one summary per stable
`path#hash` view. The measured run averaged ~850 output tokens/call (r3: 186
rows, 158,240 output tokens) and re-summarized repeated projection diffs.
The net-flow Non-Negotiable was violated by the implementation shape, not by
the mechanism. The five fixes in the Branch B report (dedupe by `path#hash`,
hard output cap, value-gated summarization, per-turn/per-run call caps,
calibrated substitution) are **enforcement of the original spec**, not new
design. C-SB retry is deprioritized and must pass a mock net-flow account
before any real run.

R14 — **Tail-affordance hypothesis (three independent hints).** D checkpoints
(6/6 across R2 rounds), tax-probe nudge (−14 turns, 5/5), and C+PL (3/3) are
unrelated interventions sharing one property: a stable, ritual tail on every
projected turn. Meanwhile C'' beat C+PL on cost (677k vs 882k median, 21 vs 28
median turns) while losing on completion (2/3 vs 3/3). Refined hypothesis:

```text
ritual buys completion; content buys trajectory (cost)
```

The R7 pre-registered trigger ("C+PL ≈ C'' → re-evaluate anchor thesis") has
fired. The anchor thesis is not falsified; it is split — its completion claim
is placebo-equivalent at n=3, its cost claim retains signal.

R15 — **Branch C: the discriminating experiment.** Two arms, E1, n=3, real
DeepSeek, same packet/audit discipline, OBS-TAIL evidence mandatory:

| Arm | Tail on projected turns | Question |
| --- | --- | --- |
| C+N | minimal fixed nudge, ~10 tokens (e.g. `[note] context was compacted; state your next step before continuing.`) | does a near-zero-cost ritual reproduce placebo's 3/3? |
| C'' | deterministic anchor (unchanged) | does mechanical content keep its trajectory/cost advantage? |

Readout matrix:

- C+N ≈ 3/3 and cost ≤ C'': ritual/content split confirmed → product shape:
  **minimal nudge default-on (completion at near-zero cost) + anchor opt-in
  (trajectory savings)**; C-SB/C''' demoted to optional enhancements.
- C+N < C'': ritual alone insufficient; anchor content matters for completion
  too → anchor stays primary, nudge becomes its cheap fallback.
- Both 3/3, C'' cheaper: ship both, anchor default for exploration profiles.

Implementation: `C+N` is a new addon arm (fixed tail text, no token matching
needed — the point is minimal cost), rendered through the same volatile tail
channel, with `nudge` tail-block evidence in JSONL per OBS-TAIL. n=3 reads
direction only; E1 completion variance is known to be high.

R16 — **Dynamic unification ruling.** The old "enable only at session start /
skip small sessions" heuristic is retired: the identity-below-threshold path
is byte-identical, so always-installed is free for sessions that never
trigger. The unified form is: seam-A always present, per-turn policy decides.
"Which dirty turns" is answered ex-post by the churn ledger (compacted then
re-read = wrong choice; compacted and never touched = right choice) — dirt is
not ex-ante observable, and per-replacement accounting means one good
replacement already pays (the existence proposition at turn granularity).
Provider stamp: DeepSeek's per-request `cacheRead` delta is today's only
break-point evidence; precise prefix-break diagnostics remain an H4 provider
ask. Continuation after replacement is inherent (send-time projection, no
history mutation).

R17 — **Branch C verdict (2026-07-07).** C'': 5/5, 5/5, 4/5 (2/3 full),
median 19 turns / 538,519 tokens. C+N: 5/5 ×3 (3/3) but median 84 turns /
3,231,687 tokens. Readout: completion direction favors the cue (R14's ritual
hypothesis survives), but the ungoverned nudge inflates wandering ~6× on
cost — R15 matrix row 1 fails its cost condition. **Neither arm promotes.**
Refined ruling: a projected-turn cue improves artifact completion but needs a
budget/stop governor before it can be a default (candidates: cap nudge
injections per run; stop nudging once pending targets clear; nudge only while
a pending target is incomplete). Recorded as candidate packet `NUDGE-GOV`,
not scheduled. Note C'' cost improved batch-over-batch (538k vs 677k median)
— consistent with E1's known variance breadth; direction-only discipline
maintained. README narrative stays frozen.

## Non-Negotiables (restated, binding on all packets)

- Model declarations are hints, never facts; hashes are never inferred.
- Harness facts are path/hash/diffstat/turn/test evidence; no confidence prose.
- DeepSeek reasoning replay stays separate from work-semantics sidecars.
- Flag-off behavior remains byte-identical, per flag, with a fixture proving it.
- Provider-unit accounting only, for all economics (R9).
- If sidecar/sideband cost exceeds avoided re-read/input cost, the design
  fails even if it feels cleaner.

## One Sentence

The semantic author moves off the critical path: the harness keeps provenance,
the model may declare intent once through a tool, a cheap sideband model writes
the prose, and one author-tagged `path#hash` ledger arbitrates them all —
metric-first, policy-later.
