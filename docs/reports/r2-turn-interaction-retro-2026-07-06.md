# R2 Turn Interaction Retro

2026-07-06. Scope: R2 core (`experiments/results/r2-core/`: 27 JSONL + 3
compare reports) and B-fixed add-on (`experiments/results/r2-bfixed-addon/`: 9
JSONL + 3 compare reports). This is the "why did the turns behave this way?"
retro after `docs/reports/r2-verdict.md`.

## Question

Given the R2 ruling and the real logs:

- what did the harness do inside these turns?
- what did the DeepSeek API do?
- where did the established advantage come from?
- where did expectations fail?
- from first principles, how should the interaction be improved?

## First Principles

An agent turn pays for three things:

1. **Payload size**: the bytes/tokens sent this turn.
2. **Cache discontinuity**: if the prefix changes, cheap cached input becomes
   expensive uncached input until a new stable prefix is established.
3. **Trajectory length**: if the model gets disoriented, it calls more tools,
   re-reads files, or fails to produce the artifact.

Compaction wins only when:

```text
saved payload cost > cache-discontinuity cost + extra-turn cost + re-read cost
```

and quality is not harmed. R2 shows that this inequality is workload-shaped.

## What The Harness Did

### Arm A

Harness behavior:

- disables pi native compaction;
- installs no ecode projection hook;
- records observer metrics only;
- preserves raw session history and raw tool results in the provider payload.

API-visible result:

- DeepSeek sees a growing stable prefix;
- cacheRead is high once the conversation warms up;
- context can become large, but no local projection changes the prefix.

### Arm B'

Harness behavior:

- enables pi native compaction;
- installs no ecode seam-A hook;
- sets provider context window to 48k for comparability;
- observes native compaction engagement.

API-visible result:

- DeepSeek receives pi's native summarization/compaction behavior, not ecode
  deterministic projection;
- no `projected` turns appear in JSONL;
- R1 and E1 observed native compaction 3/3; D1 observed it only 1/3, making two
  D1 B' runs invalid for the native-trigger gate.

### Arm C

Harness behavior:

- disables native compaction;
- installs seam-A deterministic projection;
- on each context hook, estimates payload tokens and, above threshold, replaces
  compactable old tool payloads/results with deterministic summaries;
- keeps recent assistant turns protected;
- does not mutate session history;
- records projected turns, compacted paths, re-reads, and cacheRead.

API-visible result:

- DeepSeek receives alternating payload regimes: full raw turns when under the
  gate or when recent context is protected; compact projected turns when seam-A
  fires;
- the first projected turn often has a cacheRead dip because the prefix changed;
- subsequent turns can recover cache if the projected prefix remains stable.

### Arm D

Harness behavior:

- installs seam-A plus seam-B checkpoint replacement;
- keeps native compaction enabled only so pi can trigger the seam-B hook;
- in R2 core, no native compaction was observed for D, so the practical behavior
  was seam-A projection plus checkpoint-ready configuration.

API-visible result:

- in these R2 JSONLs, D's observed difference from C is mostly policy/config
  shape and trajectory, not an observed native summarizer call;
- D nevertheless completed E1 5/5 x3, suggesting its checkpoint/progress-state
  affordance or prompt dynamics helped exploration, but the JSONL does not expose
  a separate summarizer-token row.

## Established Advantage: R1 / Code Production

R1 is the clean advantage zone.

| Arm | Turns | Reads | Re-reads | Compacted-path re-reads | Static |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 36,45,19 | 10,6,7 | 3,1,0 | 0 | 4/4 x3 |
| B' | 25,20,16 | 7,6,3 | 2,0,0 | 0 | 4/4 x3 |
| C | 18,34,17 | 5,9,4 | 1,2,0 | 0 | 4/4 x3 |
| D | 35,15,44 | 13,7,10 | 6,3,5 | 0,2,3 | 4/4 x3 |

The decisive C signal is not just smaller input. It is smaller input with no
compacted-path churn.

Example: `19-r3-G2-R1-C.jsonl`

- projected turns: 11, 13, 15, 17;
- total reads: 4;
- total re-reads: 0;
- compacted-path re-reads: 0;
- static acceptance: 4/4;
- artifact review later judged this the best R1-C code-quality run, with the
  lowest turn count and clean internal typing.

First-principles explanation:

- R1 reads large code once, then transforms it into new files.
- The future need is not "verbatim old read output"; it is "edit the workspace."
- The workspace itself becomes the durable state.
- Therefore seam-A can compress old read/tool payloads without creating an
  information debt.

This is exactly the shape deterministic projection was built for.

## Where Expectations Failed: E1 / Exploration

E1 is the counterexample to "smaller context is enough."

| Arm | Turns | Reads | Re-reads | Compacted-path re-read rate | Static |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 38,29,15 | 28,23,16 | 11,8,0 | 0 | 0/5,5/5,5/5 |
| B' | 24,21,28 | 16,24,17 | 1,9,2 | 0 | 4/5,5/5,5/5 |
| C | 53,29,39 | 26,19,40 | 10,5,25 | .231,.211,.625 | 4/5,0/5,4/5 |
| D | 31,59,52 | 20,30,23 | 3,11,5 | .150,.333,.174 | 5/5 x3 |

The worst C failure is `14-r2-G2-E1-C.jsonl`:

- projected turns: 12;
- static acceptance: 0/5;
- artifact output files: none;
- `SUBSYSTEM-MAP.md` missing;
- re-read turns include turn 10 with 3 re-reads, all compacted-path re-reads.

`27-r3-G2-E1-C.jsonl` did produce the artifact but still shows the pathology:

- reads: 40;
- re-reads: 25;
- compacted-path re-reads: 25;
- static: 4/5, missing one required regex;
- repeated re-read bursts at turns 8, 11, 12, 16, 18, 28, 29, 30, 33, 35, 36.

First-principles explanation:

- Exploration is not only about retaining facts. It is about retaining task
  state: what has been mapped, what still needs to be mapped, and what artifact
  must be produced.
- Deterministic projection preserved path/hash/head-tail evidence but did not
  preserve "progress through the investigation."
- When the model needed orientation, it re-opened files whose prior results had
  been compacted. That is exactly the `compacted_path_re_read_rate` signal.
- In the hard failure, the model spent turns reading and reasoning but never
  crossed the artifact-production boundary.

B' and D point to the missing ingredient from opposite sides:

- B' likely helped by compressing into semantic summary rather than extractive
  summaries; it was E1's cheapest arm and completed 2/3 fully.
- D completed 3/3, likely because the checkpoint/progress affordance keeps the
  task "where am I?" state more salient, but at higher cost.

The C'' semantic anchor is therefore not polish; it is the direct response to
the observed E1 failure mode.

## Direct Transform: D1 Did Not Bite, But It Warned Us

D1 was meant as a negative zone: exact original text might be needed after
compaction.

Observed:

- A, C, D all reached 4/4 static acceptance x3.
- C median cost was lower than A in the final verdict.
- But C/D often showed extreme compacted-path re-read rates:
  - C: .188, .917, .926
  - D: .714, .167, .675

Interpretation:

- The static task was forgiving enough that re-reading exact text repaired any
  information loss.
- Low 8k threshold created a nearly per-turn projection regime.
- The model repeatedly asked for exact content; the harness repeatedly compressed
  it away; the workspace/output still passed.

This is not a proof that direct-transform is safe. It is a proof that the current
D1 probe can be survived by re-reading. A stronger negative probe should make
that repair loop expensive or impossible.

## API-Side Behavior: Cache Dip And Recovery

DeepSeek reported cacheRead on every real run. The logs show:

- stable raw turns warm cache quickly;
- projected turns can sharply reduce input size but often reset or reduce
  cacheRead on that turn;
- after the projected form stabilizes, cacheRead can recover.

Example `19-r3-G2-R1-C.jsonl`:

- turn 10 raw: input 28,042, cacheRead 30,336;
- turn 11 projected: input 9,620, cacheRead 2,304;
- turn 13 projected: input 14,825, cacheRead 13,312;
- turn 15 projected: input 15,412, cacheRead 13,312;
- turn 17 projected: input 16,109, cacheRead 20,608.

That is the good transition shape: one dip, then byte-stable recovery.

Example `14-r2-G2-E1-C.jsonl`:

- projection starts at turn 6;
- turn 10 is projected and performs 3 compacted-path re-reads;
- no artifact is produced;
- cache recovery later does not matter because trajectory semantics failed.

So the cache question is secondary to the task-state question. A cheap stable
prefix is not useful if the model no longer knows what to do.

## Failure Taxonomy

### F1: Work-Semantic Loss

Symptom:

- exploration run reads many files;
- projection fires repeatedly;
- output artifact is missing or incomplete.

Evidence:

- `14-r2-G2-E1-C`: 0/5 static, no `SUBSYSTEM-MAP.md`.
- `27-r3-G2-E1-C`: artifact exists, but 25 compacted-path re-reads and 4/5.

Fix direction:

- C'' work anchor: pending targets + files read + edits/tests already done;
- inject only on projected turns;
- keep it deterministic and mechanical.

### F2: Churn Hidden By Passing Static Checks

Symptom:

- static acceptance passes;
- compacted-path re-read rate is very high.

Evidence:

- D1 C/D runs pass 4/4 but often re-read compacted paths in most read calls.

Fix direction:

- make churn a first-class quality gate, not only a suspicious note;
- for direct-transform tasks, raise threshold or disable projection when compacted
  path re-read rate crosses a small online threshold.

### F3: Native Trigger Non-Determinism

Symptom:

- B' is intended to test native compaction;
- small tasks do not always trigger native compaction even with a fixed context
  window.

Evidence:

- D1 B' native observed 1/3; two runs invalid.

Fix direction:

- for native-summary arms, use explicit provider/server compaction APIs where
  available;
- otherwise treat native-on as opportunistic and gate validity on observed
  engagement, as R2 did.

### F4: Metric Unit Mismatch

Symptom:

- estimated `input_tokens` and provider `cacheRead` are not always the same unit;
  some rows have cacheRead greater than estimated input.

Interpretation:

- pi's local payload estimator and provider usage tokenizer are close enough for
  direction but not identical enough for per-turn cache ratio math.

Fix direction:

- use provider usage input tokens when available for cache economics;
- keep local estimates for projection triggering, but label them as estimates.

## Interaction Improvements

### 1. Add Online Churn Feedback

Current C projects deterministically but does not react when the model re-reads
what was just compacted.

Improvement:

- maintain a per-path `compacted -> reread` ledger inside the harness;
- if a path is re-read after compaction within N turns, mark it hot;
- hot paths are temporarily protected from projection or summarized with richer
  verbatim detail.

This turns `compacted_path_re_read_rate` from post-hoc verdict into runtime
control.

### 2. Dispatch By Workload Shape

R2 already gives a first policy:

- code-production/refactor: C by default;
- exploration/completion-first: D or C'';
- exploration/cost-first: B' or A until C'' proves itself;
- direct-transform: baseline or high threshold unless churn stays low.

Implement as recommendation first, not automatic switching.

### 3. Run C'' On E1 Before More Generalization

C'' directly attacks F1.

Expected effect:

- `SUBSYSTEM-MAP.md` pending target is visible after projected turns;
- previously-read/edited/tested state is compactly visible;
- artifact production should happen earlier or more reliably.

Success condition:

- E1 static approaches D's 5/5 x3;
- cost stays closer to C/B' than D;
- compacted-path re-read rate drops vs C.

### 4. Make Exact-Text Tasks Declare Their Retention Need

Direct-transform failures are about verbatim dependency.

Improvement path:

- add task/packet-level retention mode: semantic vs verbatim;
- or let future tool calls declare retention intent;
- verbatim paths get a larger protection window or no projection until edited.

This is the view-based context line from the roadmap, but R2 says it should be
data-gated by stronger D probes.

### 5. Separate Measurement Tokens From Trigger Tokens

Projection needs a cheap local estimate; economics needs provider truth.

Improvement:

- JSONL turn rows should carry both local estimated payload tokens and provider
  reported input tokens if exposed;
- cost tables should compute from provider units only;
- cache ratio should not divide provider cacheRead by local estimated input.

### 6. Audit Native Summary As A Distinct Arm

B' was useful but not fully transparent.

Improvement:

- capture native compaction entry content/metadata when possible;
- distinguish the summarizer call from normal LLM turns;
- if using a provider with explicit compaction API, add it as E arm instead of
  relying on pi's overflow semantics.

## Closing Assessment

The established advantage is real but narrow in the best possible way: it is
mechanistically explainable.

For R1, harness-side deterministic projection removed old structured payloads
after they had already been converted into workspace edits. The API paid one or
more cache transition dips, then recovered; no future turn needed the compacted
paths, so the savings survived.

For E1, the same move removed the wrong kind of state. The missing state was not
file bytes; it was progress semantics. The API could cache the new prefix, but
the model spent turns re-reading or failed to produce the artifact.

For D1, the negative probe passed because re-reading repaired exactness loss, but
the logs show the repair loop clearly. That is a warning, not a free pass.

The next improvement is not "summarize better" in the abstract. It is to close
the control loop:

```text
project -> observe re-read / missing artifact -> protect or anchor -> measure again
```

That is the smallest principled step from R2 toward a durable context runtime.
