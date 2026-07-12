# Deterministic Context Projection in an Agent Loop: An Auditable Account of the Compaction Tax

> Working Paper · Draft v0.1 · 2026-07-07
> Self-contained: all claims are backed by files in this repository. No external citations.
> Status: preliminary evidence (n=3 paired runs per cell). Open items are listed in §8.

## Abstract

Coding agents accumulate conversation context faster than they consume it, and every
serving stack now prices that accumulation in a specific way: input tokens that
extend an unchanged prompt prefix are billed at roughly one tenth of the base rate,
while any byte that breaks the prefix re-prices everything after it. Context
compaction — replacing old conversation content with summaries — is therefore not
merely a window-management technique; it is a transaction against a cache ledger,
and the transaction has a price that the dominant implementation (LLM-generated
summaries) makes impossible to audit.

This paper describes **taucode** (formerly *ecode* during the pi-experiment phase;
name unified 2026-07 — τ = 2π), a small research harness built on the pi coding
agent, that replaces LLM summarization with *deterministic context projection*: a
pure function from message history to a smaller message history, applied only at
send time, gated by a token threshold below which the payload is byte-identical to
the unprojected one. Because the projection is deterministic and the raw history is
never modified, every consequence — cache-hit dips and recoveries, forced re-reads,
lost task state — becomes attributable and measurable. We use this property to
decompose the compaction tax into three separately measurable terms (summary
production cost, prefix-break cost, and semantic-loss cost), and to run paired
four-arm experiments against a provider (DeepSeek) that exposes per-request cache
telemetry.

The headline result is deliberately narrow: on refactor/code-production tasks,
deterministic projection reached the same acceptance and equal-or-better
human-reviewed code quality at roughly one third of the baseline cost (n=3,
medians). The negative results are equally load-bearing: on exploration tasks the
same mechanism failed to preserve *task-progress semantics* and produced the worst
run in the dataset; a semantic-anchor repair was tested against a token-matched
placebo and its completion claim did not survive. We report both, the audit
machinery that caught two of our own wrong conclusions before publication, and a
roadmap of gated follow-ups.

---

## 1. Introduction: the economics, from first principles

### 1.1 What an agent turn pays for

A coding agent is a loop: the harness sends the accumulated conversation (system
prompt, user messages, assistant messages, tool calls, tool results) to a model,
the model replies with text and/or tool calls, the harness executes the tools and
appends the results, and the loop repeats. Three facts about this loop generate
everything else in this paper.

**Fact 1: context grows monotonically, and most of it is tool payload.** Each turn
appends the full text of files read, command output, and the full arguments of
write/edit calls. In our transcripts, old tool payloads dominate context size
within ten to twenty turns.

**Fact 2: providers price prefix stability, not just size.** Serving stacks reuse
the attention KV state of a request prefix that is byte-identical to a previous
request. Providers pass this saving on: cached input tokens are billed at roughly
0.1× the uncached rate (we use DeepSeek's pricing and its per-request telemetry
fields, e.g. `prompt_cache_hit_tokens`, throughout). The corollary is strict:
*the cost of a turn is not a function of context length alone; it is a function of
how many of those bytes extend an unchanged prefix.* An agent that grows its
context append-only pays the expensive rate once per byte and the cheap rate ever
after.

**Fact 3: any compaction is a prefix regime change.** Rewriting history — however
cleverly — changes bytes early in the prompt. Every subsequent token of the request
is then uncached. Compaction therefore never "saves tokens" in a single step; it
*trades a one-time cache break for a shorter prefix whose future turns are cheaper*.
Whether the trade wins depends on how long the session continues after the break
and on what the summary destroyed.

This yields the cost inequality that a compaction scheme must satisfy to be worth
running (first stated in `docs/reports/r2-turn-interaction-retro-2026-07-06.md`):

```text
saved payload cost  >  cache-discontinuity cost + extra-turn cost + re-read cost
```

The right-hand side is the **compaction tax**. We decompose it into three terms:

- **T1 — summary production cost**: tokens spent generating the summary itself
  (an LLM summarizer pays output-token prices; a deterministic function pays zero);
- **T2 — prefix-break cost**: the one-time loss of the cache discount on the
  rewritten span and everything after it;
- **T3 — semantic-loss cost**: the downstream behavior induced by information the
  summary destroyed — re-reading files whose contents were summarized away,
  wandering trajectories, or failing to produce the required artifact at all.

T3 is the largest and least discussed term. It never appears in a token-bill
comparison, because its worst case is not a bigger bill — it is a completed-looking
session with a missing artifact.

### 1.2 Why the dominant implementation cannot be audited

The standard compaction mechanism is to ask a model to summarize the conversation
when the window fills. This has two structural problems, independent of summary
quality.

First, **nondeterminism destroys attribution**. If the same session state can
produce different summaries on different runs, then any downstream failure — a
re-read burst, a lost requirement — cannot be attributed to a specific, inspectable
transformation. The experiment "did compaction cause this?" has no stable treatment.

Second, **the summary rewrites history in place**. Once the original messages are
replaced in the session record, the counterfactual (what the model would have seen
without compaction) is gone, and so is the ability to audit what was lost.

The design hypothesis of this project is that both problems are removable at once:
make the transformation a *pure, deterministic function applied only to the
outgoing payload*, leave the persisted history untouched, and the entire causal
chain — which bytes changed, what the cache did in response, what the model did in
response to that — becomes measurable from logs.

### 1.3 The claim, stated as an existence proposition

We do not claim deterministic projection is universally better. The program is an
existence proposition with a boundary-mapping agenda:

```text
∃ (workload, threshold):  task semantics preserved (acceptance not degraded)
                          ∧ net cost < append-only baseline
```

Section 5 exhibits one proven point (refactor workload × 32k-token threshold).
Section 6 maps where the proposition fails and why. Section 8 lists the sweeps that
turn the point into a region.

---

## 2. Design principles

Four invariants govern the implementation. Each is enforced by tests, not by
convention.

**P1 — Determinism: same state, same bytes.** The projection is a pure function of
the message array and its configuration. Given the same input it renders the same
output, byte for byte. This is what makes the *projected* prefix cacheable again
after the one-time break (T2 is paid once, not per turn), and what makes failures
attributable.

**P2 — Identity below threshold.** Below a configured token estimate
(`compactAfterInputTokens`, default 32,000) the projection returns the *same array
reference*, unchanged. Two consequences: sessions that never grow large pay zero —
the mechanism can be permanently installed without a tax on small sessions; and the
prefix of a warm session is never perturbed early, when cache value is highest.
The same discipline applies within a projected send: if no message qualified for
compaction, the identity is returned rather than a new-but-equal array
(`extensions/deterministic-compaction/src/projection.ts:99-103`).

**P3 — Raw history is append-only; projection exists only at send time.** The
transformation is applied in the harness's context hook, which shapes the outgoing
request payload and is never persisted (verified against the host harness in
`docs/g0-survey.md`, Item 3). The session file always contains the full,
unmodified history. Auditing "what was hidden from the model at turn N" is a replay
of a pure function, not an archaeology of overwritten records.

**P4 — Provenance by content hash.** Summaries and hints never assert facts about
file state in prose; they carry content hashes and diffstats computed at
tool-execution time. Anything the model is told about the past is mechanically
checkable against the workspace.

Two further disciplines follow from P1–P3 and are worth naming because they exclude
a known failure class. *Idempotency*: a projected summary is smaller than every
eligibility threshold, so projecting twice is a no-op — the hook can run on every
send without compounding. *No silent prefix perturbation*: every volatile
addition (trust hints, anchors; §3.4–3.5) is appended strictly at the tail of the
outgoing payload, after the stable prefix, so the cached span is never broken by
advisory content.

---

## 3. System

### 3.1 Host: a thin loop with explicit seams

taucode is built on **pi** (the `pi-mono` coding agent), chosen precisely because it
is a thin loop: its context assembly is small enough to be fully observable, and it
exposes two extension seams that map exactly onto the design:

- **Seam A** — a `context` hook that runs before every LLM call and may transform
  the outgoing message array; its return affects only the send payload and is never
  persisted.
- **Seam B** — a `session_before_compact` hook that may replace pi's native
  LLM-summary compaction with a caller-supplied entry (kept optional and off by
  default in taucode; the native summarizer is retained as an experiment arm, not
  deleted).

The fork discipline is strict: `pi/` carries zero diff against upstream; everything
lives in an out-of-tree extension (`extensions/deterministic-compaction/`) and a
standalone package (`packages/compaction-core/`). The extension is loaded by path
(`pi --extension .../src/extension.ts`) and carries its mechanisms behind
environment flags, all default-off except the projection itself.

### 3.2 The projection core: `messages → messages`

`packages/compaction-core/` (~1,400 lines, no dependency on any harness code)
implements the pure function. Its entry point:

```ts
compactCodeProductions(
  messages: Message[],
  options?: Partial<CompactionOptions>,   // keepRecentAssistantMessages=3,
                                          // minArgTokens=800, minResultTokens=200
  injection?: CompactionInjection,        // five seams, all defaulting to
): CompactionResult                       // original behavior
```

The function walks the message array once (O(n)), pairs tool calls with their
results, and replaces two kinds of payload with typed, deterministic summaries:

- **Old write/edit tool-call arguments** become a `CodeProductionSummary`:
  `{path, chars, lines, head, tail, result, hash?, diffstat?}` — the head/tail
  preserve a five-line preview; the hash and diffstat (when a ledger is injected,
  §3.4) give the summary provenance.
- **Old read/bash/search/find results** become per-tool summaries that keep the
  *locator* and drop the *content*: a read summary keeps `{path, lines, chars,
  hash?}` plus the fixed instruction "Re-run read if exact content is needed";
  bash keeps `{command, exitCode, stderrLines}`; search keeps
  `{pattern, matchCount, fileCount, preview}`.

Protection rules bound the blast radius: the last `keepRecentAssistantMessages`
assistant turns are never touched; error results are never compacted; small
payloads below the token floors are never compacted; a summary that would not be
strictly smaller than its source is discarded. Every replacement is recorded in a
`diffs` array (`{turn, toolName, path, rawTokens, compactedTokens, tokensSaved}`),
which is the observability substrate for everything in §4.

Five injection seams (strategy set, tool-name matcher, path/hash extractor,
per-path summary metadata, protected paths) let a harness adapt the core without
forking it; every seam defaults to the original behavior, and the no-injection
output is pinned byte-exact by tests.

### 3.3 Hybrid gating at the send boundary

The extension wires the core into Seam A
(`extensions/deterministic-compaction/src/projection.ts`):

```ts
function projectContext(messages, config): ProjectionOutcome {
  const rawTokens = estimateAgentTokens(messages);      // pi's own estimator
  if (rawTokens < config.compactAfterInputTokens) {
    return { messages, projected: false, rawTokens };   // identity (P2)
  }
  const compaction = compactCodeProductions(...);
  if (compaction.compactedCount === 0) {
    return { messages, projected: false, rawTokens };   // identity again
  }
  return { messages: projected, projected: true, rawTokens, compaction };
}
```

The gate deliberately reuses the host's token estimator rather than a bespoke one:
the trigger only needs to be *consistent*, while cost accounting uses provider-
reported usage (a lesson recorded as a metric-unit failure class, §6.4). Below the
gate, the send payload is byte-identical and the provider's prefix cache absorbs
the whole history at the discounted rate. Above it, the projection produces a new —
but deterministic, hence re-cacheable — prefix. This is the mechanism behind the
transition shape measured in §5.3: one dip, then recovery.

### 3.4 The trust protocol: hashes against confabulation

Compacting a read result creates a hazard: the model may "remember" file content
that has since changed, and a summary that merely says "you read this file" does
not tell it whether that memory is current. The trust protocol makes staleness
mechanical.

A session-scoped ledger records, per path, the content hash and diffstat of the
latest read/edit (`trust-ledger.ts`). At send time, `staleViewHints`
(`trust-hint.ts:30`) scans the outgoing messages for read views whose content hash
differs from the ledger's current hash *for paths the model itself has since
edited*, and emits at most one line per path:

```text
[stale-view] src/config.ts: view from a1b2c3d4 predates your edit at turn 12
(now e5f6a7b8); re-read only if you need current content.
```

The hint is appended as a volatile tail message — after the stable prefix, never
persisted, replaced (not accumulated) each turn. The wording is deliberately
non-prescriptive ("re-read only if you need"): the protocol supplies verifiable
temporal facts and leaves the decision to the model.

Field validation (§5.4) shows a production-tier model using these hints exactly as
designed, including the hard case: distinguishing "stale because I edited it"
(hash mismatch, re-read) from "current because I was the last editor" (hash match,
no re-read).

### 3.5 Semantic anchors: the same channel, for task state

The exploration failure mode (§6.1) motivated a second tail block: a deterministic,
LLM-free digest of *work state* — files read (path + hash + turn), edits made
(path + diffstat + hash, failures recorded as failures), tests run (command +
parsed result), and pending acceptance targets — accumulated from tool events by a
`WorkAnchor` (`anchor.ts`), rendered only on projected turns. Its discipline
mirrors the trust protocol: every line is a mechanically verifiable fact; no
evaluative language ("almost done") is permitted. Whether this block buys anything
is an empirical question, and §6.2 reports the answer we got, including the placebo
control that dismantled our first interpretation.

### 3.6 Observability

Every mechanism reports into the same surfaces: per-turn JSONL rows (projected
flag, per-path compaction diffs, provider usage including cache-hit tokens and
reasoning tokens, re-read counters), a TUI gate widget showing threshold distance
and trigger markers, a cache-hit trace, and ambient telemetry rows for ordinary
(non-experiment) sessions. Machine-readable *tail evidence* blocks record exactly
which volatile block (anchor, placebo, nudge, substitution) was present on which
turn, so post-run audit can distinguish "tail rendered but ignored" from "tail
absent" (`tail-evidence.ts`; requirement OBS-TAIL, §6.2). The extension carries
137 unit tests; the projection's identity and byte-stability properties are pinned
by fixtures.

---

## 4. Measurement methodology

The harness exists to make one kind of sentence possible: "arm X differed from arm
Y by Z, and here is the artifact trail." This section describes the controls that
license such sentences at all.

### 4.1 Paired arms on frozen workspaces

The unit of measurement is a **packet**: a task prompt plus a workspace snapshot
plus mechanical acceptance criteria. Three packets span the hypothesized regimes:

- **R1** — refactor/code-production: read large sources once, produce new modules;
- **E1** — exploration: survey a codebase and produce a required artifact
  (`SUBSYSTEM-MAP.md`) plus answers;
- **D1** — direct transform: convert data where exact original text may be needed
  after compaction (a designed negative probe).

Each packet runs under four arms: **A** (baseline: no compaction of any kind),
**B′** (pi's native LLM-summary compaction at a comparable window), **C**
(deterministic projection, Seam A), **D** (hybrid: projection plus Seam B
checkpoint). Workspaces are materialized from snapshots whose manifest hash is
verified per run — all arms start from byte-identical trees. Arm order is
re-randomized per repeat and interleaved across packets to prevent provider
time-of-day effects from aliasing into arm effects. Model, provider, thresholds,
and flags are recorded in a per-run manifest; n=3 repeats per cell.

Cost is computed from provider-reported usage in the unit
`uncached_input + 0.1 × cached_input` (thousands), reflecting the actual pricing
asymmetry; medians are reported with full lists alongside.

### 4.2 Codified judgment gates

Two failure classes are checked by pure functions over run summaries
(`experiments/lib/gates.ts`), not by reviewer discretion:

- **`invalid`** — the arm's mechanism never engaged (a projection arm whose
  threshold was never crossed; a native arm where the summarizer never fired).
  Deltas against such runs are meaningless and are excluded *before* interpretation.
- **`suspicious`** — false savings: total tokens went down relative to baseline
  *while churn went up* (re-read count or compacted-path re-read rate increased).
  This encodes the project's founding negative result — token savings that are
  actually the model re-buying destroyed information — as a mechanical flag.

Both gates return the numbers that fired them and refuse to editorialize. Their
fixture tests are part of the repository's test suite.

### 4.3 Controls above the gates

Three further disciplines proved decisive. **Placebo tails**: when testing whether
an informative tail block (the anchor) helps, a token-matched but content-free tail
is run as its own arm — pre-registered before the comparison, not improvised after
(`placebo-tail.ts`). **Blind artifact review**: acceptance scripts bound quality
from below; a human review of produced code, blinded to arm labels, is the actual
quality instrument (§5.2). **Verdict separation**: run reports are evidence;
a single verdict document (`docs/stage-verdict-2026-07.md`) holds the claims and
their allowed phrasings, and downgrades every report to an appendix. Nothing is
citable twice.

### 4.4 What the discipline caught

The methodology section would be decoration if it had never fired. It fired twice.

Round 1 produced a striking "projection causes 2.5× turn inflation" finding. The
gates flagged half of round 1 as invalid (mechanisms not engaged), the finding was
held out of the verdict, and round 2 (n=3) reversed it outright: the same arm ran
at median 18 turns versus baseline 36. The retraction is recorded in
`docs/reports/r2-verdict.md` (ruling 1).

Later, the semantic anchor's completion effect (§6.2) was pre-registered against a
placebo; the placebo matched it, and the intended headline claim was withdrawn
before it was ever made public. Both events are treated as products of the harness,
not embarrassments to it: the audit trail is the deliverable.

---

## 5. Results

All numbers below are from paired real-provider runs (DeepSeek v4-flash via pi),
27 core runs plus 9 add-on runs, n=3 per cell, medians with full lists in the
source reports (`docs/reports/r2-verdict.md`, `r2-turn-interaction-retro-2026-07-06.md`).
Claims are stated with the boundary they were measured under and none beyond it.

### 5.1 The proven point: refactor × deterministic projection

| Packet R1 (refactor) | A (baseline) | B′ (native) | C (projection) | D (hybrid) |
| --- | ---: | ---: | ---: | ---: |
| cost, median [list] | 1342 [492, 1342, 1744] | 601 [433, 601, 762] | **449 [401, 449, 857]** | 879 |
| static acceptance | 4/4 ×3 | 4/4 ×3 | 4/4 ×3 | 4/4 ×3 |
| compacted-path re-reads | 0 | 0 | **0** | 0, 2, 3 |

C's median cost is 33% of baseline with acceptance intact across all repeats, and —
the mechanistically decisive column — zero re-reads of compacted paths: nothing the
projection destroyed was ever needed again. The first-principles explanation is
that refactor work converts read payloads into workspace edits; after the
conversion, the durable state *is the workspace*, and the old bytes in context are
pure debt. This is the workload the mechanism was designed for, and it behaves as
designed.

### 5.2 Quality, bounded from above the scripts

Static checks bound quality from below. A blinded per-file human review of all
three R1-C runs (`review-R1-C-code-quality.md`, summarized in the R2 verdict
addendum) upgraded the claim: the cheapest run (365k tokens, 17 turns) was also
judged the best code (clean encapsulation, no TODOs; sole blemish an `export *`),
and the most expensive run was judged the worst. The cost claim is therefore
cost-*and*-quality confirmed at n=3, not cost-at-quality's-expense.

The review produced a side finding we now treat as the first data point of a
hypothesis: **trajectory wandering and code degradation moved together** — the
worst-quality run was also the most expensive one. If trajectory length is a
usable quality proxy, cost and quality are not a trade-off frontier at this scale
but two projections of the same variable (whether the model stayed oriented). This
is promoted to a measurement target, not asserted (§8).

### 5.3 The cache transition curve

Because the provider reports per-request cache hits, the T2 term is directly
observable. The canonical good shape, from run `19-r3-G2-R1-C.jsonl`:

| turn | payload | input tokens | cache-read tokens |
| ---: | --- | ---: | ---: |
| 10 | raw | 28,042 | 30,336 |
| 11 | first projected | 9,620 | 2,304 |
| 13 | projected | 14,825 | 13,312 |
| 15 | projected | 15,412 | 13,312 |
| 17 | projected | 16,109 | 20,608 |

One dip at the regime change, then recovery as the deterministic rendering holds
byte-stable — exactly the trade described in §1.1: a one-time break purchasing a
shorter, once-again-cached prefix. The counter-example run `14-r2-G2-E1-C` shows
why this curve is subordinate to semantics: its cache also recovered, and the run
still produced no artifact. A cheap stable prefix is worthless to a model that no
longer knows what it was doing — which is the bridge to §6.

### 5.4 The trust protocol in the field

A live flag-on session (`docs/reports/v2-tp-wild-field-run.md`) validated the
stale-view mechanism end to end: no false positives when views were current; hint
fired on a genuinely stale read and the model re-read before answering (correctly);
and in the multi-file stress round, the model re-read *only* files where its view
hash mismatched the ledger, declining to re-read files where it was itself the last
editor. Cache-hit rate was unaffected by the tail append (the observed drop was
attributable to re-read tokens, not prefix breakage). The protocol's design bet —
that mechanical temporal facts, not prose confidence, are what a model can act on
correctly — held under production conditions.

### 5.5 Self-application

The blind review in §5.2 was itself conducted inside a taucode session: the audit
work ran with projection live, saving 56,780 tokens (67%) at a 98.1% cache-hit
rate. We flag this as dogfooding, not as controlled evidence; its value is that the
tooling's own paper trail was produced under the tooling.

---

## 6. Negative results

Each subsection is a claim we either expected to make and cannot, or a failure
whose mechanism is now part of the design. The taxonomy labels (F1–F4) come from
the turn-level retro and now have golden fixtures in the test plan.

### 6.1 F1 — work-semantic loss: projection fails exploration

| Packet E1 (exploration) | A | B′ | C | D |
| --- | ---: | ---: | ---: | ---: |
| cost, median | 1527 | **1287** | 1616 | 2445 |
| static acceptance | 0/5, 5/5, 5/5 | 4/5, 5/5, 5/5 | 4/5, **0/5**, 4/5 | **5/5 ×3** |
| compacted-path re-read rate | 0 | 0 | .231, .211, .625 | .150, .333, .174 |

On exploration, projection's cost advantage vanishes (1616 vs 1527) and its
completion is unstable. The hard failure (`14-r2-G2-E1-C`): twelve projected turns,
zero artifact files, the required `SUBSYSTEM-MAP.md` never produced, re-read bursts
concentrated on compacted paths. The mechanism is legible in the logs: projection
preserved *file evidence* (paths, hashes, previews) but destroyed *progress
semantics* — what has been mapped, what remains, what artifact is owed. When the
model lost orientation it re-opened compacted files (the re-read rate column is
this signal) or, in the worst case, read and reasoned in circles without ever
crossing the artifact-production boundary.

Honesty requires the baseline column too: A also failed once (0/5). Losing the
thread on exploration tasks is partly task nature, not purely a compaction
pathology. But the paired shape stands: what exploration needs preserved is task
state, and extractive summaries do not carry it. Meanwhile arm D completed 6/6
across two rounds (the dataset's only such cell) at ~1.6× baseline cost — its
checkpoint keeps a persistent progress digest in context. The verdict phrasing is
deliberate: **hybrid+checkpoint buys completion on exploration, not cost.**

### 6.2 The anchor's completion claim died by placebo

The semantic anchor (§3.5) was built as the direct, LLM-free response to F1: if
the missing ingredient is progress state, restate it deterministically on every
projected turn. First results looked confirmatory. The controlled comparison
(Branch B, with OBS-TAIL evidence on every turn) says otherwise:

| E1 arm (n=3) | completion | median turns | median total tokens |
| --- | ---: | ---: | ---: |
| C″ (anchor) | 2/3 | 21 | 677,535 |
| C-SB (anchor + sideband summaries) | 1/3 | 21 | 709,726 |
| C+PL (token-matched **placebo** tail) | **3/3** | 28 | 882,010 |

A content-free tail block of matched size completed the task more reliably than
the informative anchor. The ruling (R14 in the design log) splits the variable the
first interpretation had conflated: **the ritual buys completion; the content buys
trajectory.** Any same-shaped reminder at projected turns appears to re-orient the
model toward finishing; the anchor's verifiable facts show up instead in the cost
column (C″ was the cheapest E1 arm observed, one run at 19 turns / 538k) — shorter,
less wandering trajectories, not higher completion. Two corollaries went into the
roadmap rather than the narrative: a governed minimal nudge (the ungoverned variant
completed 3/3 but at ~6× cost — 84 turns, 3.23M tokens — pure ritual with no
content is an expensive superstition), and a calibration study, since "declared
disposable but re-read" is now measurable per path.

### 6.3 F2 — churn hidden by passing checks: the negative probe that didn't bite

D1, the designed negative zone (exact-text dependency under an aggressive 8k
threshold), failed to produce the expected failure: C passed 4/4 ×3 with median
cost below baseline. But the logs show *why* it survived, and the why is a warning:
compacted-path re-read rates ran as high as .917 and .926 — the model repeatedly
asked for exact content, the harness repeatedly compressed it away, and re-reading
repaired the loss each time. The probe was survivable by paying T3 in small
installments. We record this as "the current probe is too weak," not "the negative
zone is empty"; a stronger verbatim-dependency probe is queued (§8). The general
lesson is methodological: acceptance scripts alone would have called this a clean
pass; the churn counters are what kept it honest.

### 6.4 Smaller instruments that failed and were kept

**Sideband summaries (C-SB)** — off-thread LLM summarization of tool results —
violated their own economics in the current implementation: one run spent 186
sideband calls / 158k output tokens to complete 0/5. The net-flow accounting
(summaries must cost less than they save) is now a mock-level precondition for any
rerun; the design is unproven, not disproven, and stays parked. **Native-trigger
nondeterminism (F3)**: pi's window-pressure compaction fired only 1/3 on the small
packet, invalidating two B′ runs — validity gating on observed engagement is now
standard. **Metric-unit mismatch (F4)**: local token estimates and provider usage
are close in direction but not per-turn comparable; all cost math now uses provider
units, estimates only gate. **In-band declarations**: having the model declare work
semantics in-channel costs ~+80 output and ~+66 reasoning tokens per turn
(piggybacked, no turn inflation) — an affordable instrument for the calibration
study, not a free one.

---

## 7. Scope and limitations

Everything above holds within, and only within, the following frame. The
measurements cover *loop-internal* context economics: a thin harness whose entire
context assembly is observable, one provider whose cache telemetry is exposed
(DeepSeek), one model generation (v4-flash), projection thresholds between 8k and
48k tokens, three task packets, n=3 per cell. Medians and paired ranks are
reported; no significance claims are made or licensed at this n. Frontier agent
products assemble context outside the loop (retrieval, IDE state, hidden tool
output) in ways that are not observable from where we stand; nothing here measures
them. Model-generation dependence is a finding, not a nuisance: which failure
modes a model exhibits under compaction (and how well its self-reports calibrate)
shifts with training, which is precisely why the calibration rate is proposed as a
capability measurement rather than assumed constant. Extrapolation to
million-token windows is a mechanism argument (§1.1 survives any window size;
the discount asymmetry and T3 do not disappear), not a data claim. The small scale
is a choice, not a concession: 8k–48k on a cache-observable provider is currently
the only place every line of the compaction-tax ledger can be independently
audited.

One further honesty note: the cost unit prices cached input at 0.1× but ignores
provider-side variation in cache retention and any charge model where cached spans
still occupy window; results should port across providers in shape, not in
constants.

---

## 8. Roadmap

Every open item carries its gate; none is a promise.

1. **SWEEP-R2** — threshold curve: R1-C at 4k/16k/64k and D1-C at 4k, six runs,
   same audit. Gate for: the sweet-spot boundary, and for upgrading §5.1 from a
   point to a curve.
2. **Stronger verbatim probe** — a task where re-reading cannot repair exactness
   loss (or is made expensive). Gate for: any claim about the direct-transform row
   of the dispatch policy.
3. **Second trajectory×quality data point** — required before the §5.2 proxy
   hypothesis is used anywhere.
4. **Governed nudge (NUDGE-GOV)** — the placebo result implies a minimal ritual
   tail; ungoverned it cost 6×. Injection cap plus stop-on-empty-pending. Not
   scheduled until Branch-B follow-ups clear.
5. **Calibration study (C‴)** — measure "declared disposable but re-read" as a
   per-model calibration rate; the declaration tax numbers (§6.4) are in hand.
   This is the paper-axis item: the rate is a capability contour, usable across
   model generations.
6. **Ledger continuation (WS-6)** — restore work-semantic state across sessions
   from the persisted ledger. Gated on dogfooding evidence and retention rules.
7. **Provider-compaction arm (E)** — when a cache-observable provider exposes a
   server-side compaction API, compare it as an arm rather than rewriting the
   thesis around it.
8. **Dispatch policy hardening** — the R2 mapping (refactor → projection;
   exploration/completion-first → checkpoint; exploration/cost-first → native or
   baseline; direct-transform → no special handling *at current probe strength*)
   ships as a recommendation layer only, until it survives held-out task families.

The stop conditions are as much a part of the roadmap as the queue: a mechanism
that lowers tokens but raises artifact failure stops; a mechanism that wins under
only one prompt shape stays experimental; a provider feature that obsoletes a
local rule retires the rule and keeps the measurement harness.

---

## 9. A note on how this was built

The repository's code was written by LLM coding agents working from self-contained
task packets (specification, exact file list, acceptance criteria, prohibited
zones), test-first, with the packets and their revision history preserved in the
repo's goal ledger. Human involvement was deliberately concentrated at the
judgment layer: parameter choices, quality review, gate rulings, and the decision
of what may be claimed — none of which was delegated. Two operational incidents
during the project (a summary-induced context loss affecting the supervising
session itself, and a hard-zone violation by a weaker model) were captured,
rolled back, and codified into the collaboration protocol rather than discarded.
We note this both for provenance and because it is a small instance of the paper's
subject: the workflow was itself an exercise in deciding which context to trust,
which to verify, and which to deliberately forget.

---

*Provenance: assembled 2026-07-07 from this repository's documents and source.
Primary evidence: `docs/reports/r2-verdict.md`, `docs/reports/r2-turn-interaction-retro-2026-07-06.md`,
`docs/reports/branch-b-e1-2026-07-07.md`, `docs/reports/branch-c-e1-2026-07-07.md`,
`docs/reports/ws-tax-probe-2026-07-06.md`, `docs/reports/v2-tp-wild-field-run.md`,
`docs/stage-verdict-2026-07.md`; implementation: `packages/compaction-core/src/compaction.ts`,
`extensions/deterministic-compaction/src/{projection,extension,trust-hint,anchor,tail-evidence}.ts`,
`experiments/lib/gates.ts`. Claim discipline follows `docs/stage-verdict-2026-07.md`;
any conflict resolves in that document's favor.*
