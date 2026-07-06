# Extension Work-Semantics Architecture Review

2026-07-06. This note reviews the current deterministic-compaction extension
after R2 and V3-WS, then sketches the least-coupled way to add model-declared
work semantics.

> Outcome addendum: Fable's follow-up design pass landed at
> `docs/arch-c3-design-2026-07-06.md`. It keeps the extraction/ledger/policy
> boundary proposed here, but amends the experiment plan: C-SB sideband
> summarization is the preferred policy arm if C'' is insufficient; in-band
> C''' is capture-first calibration unless sideband fails and calibration data
> justifies paying main-loop reasoning tax. All economics must use provider
> token units.

## Verdict

The current extension is a workable experiment harness, not yet a clean context
protocol implementation.

The good news: the important mechanisms already have small, testable modules:
`projection.ts` handles send-time projection, `anchor.ts` renders deterministic
work anchors, `trust-ledger.ts` owns path/hash evidence, and `adapter.ts`
preserves assistant thinking while converting pi messages to the core shape.

The problem is where they meet. `extension.ts` has become the session bus and
policy engine at once. It parses env flags, normalizes tool events, records trust
state, records work anchors, projects context, appends stale hints and anchors,
updates widgets, collects telemetry, and registers commands. Adding
model-authored JSON blocks directly here would couple model behavior, storage,
projection policy, and UI into one file.

The fix should be extraction before invention: keep behavior byte-stable, but
turn `extension.ts` into a thin binder around semantic events, a semantic ledger,
projection policy, and renderers.

## Current Shape

`extension.ts` currently performs four jobs that should be separate:

- **Pi binding.** Registers `context`, `tool_result`, `message_end`,
  `agent_end`, `session_shutdown`, commands, and widgets.
- **Event normalization.** Reads `event.toolName`, `event.input`,
  `event.content`, `event.details`, current turn, cwd, disk contents, and test
  output shape.
- **Semantic state mutation.** Updates `TrustLedger` and `WorkAnchor` from the
  same tool-result listener.
- **Send-time policy.** Runs projection, computes stale hints, renders anchor
  tails, emits trigger markers, and updates telemetry.

This was the right implementation tempo for R2/V3: each feature is flag-gated,
testable, and default-off. It is the wrong place to add the next protocol layer.

## What Is Already Clean

`projection.ts` is close to the desired boundary. It is mostly pure: estimate
tokens, decide whether the threshold fires, call the compaction core, and return
an outcome. Identity below threshold preserves provider prefix cache behavior.

`anchor.ts` is also clean. It records mechanical facts only: latest reads,
latest edits, test runs, and pending acceptance targets. It has no pi imports and
no model inference.

`trust-ledger.ts` is the right primitive for stale-view discipline: `path`,
content hash, edit hash, turn, and diffstat. It is not yet the full semantic
ledger, but it has the correct address space.

`adapter.ts` matters more than it looks. It keeps assistant `thinking` blocks in
the core transcript conversion. For DeepSeek sessions, work-semantics sidecars
must not be smuggled into reasoning content; provider replay semantics need to
stay separate from ecode's ledger semantics.

## Coupling Risks

The main risk is not code size; it is authority confusion.

If model-declared JSON goes straight into the current `tool_result` or `context`
handler, the extension will implicitly treat a model statement as if it were the
same category as a file hash. That breaks the trust protocol.

The categories need to stay distinct:

- **Observed fact:** harness saw a read/edit/write/test and can attach path,
  hash, diffstat, exit status, and turn.
- **Model declaration:** model says a view is semantic-complete, verbatim-needed,
  disposable, or routing-only.
- **Policy decision:** harness chooses what to keep raw, compact into ledger
  form, or re-inject as a tail hint.
- **Calibration outcome:** later behavior contradicts or validates the
  declaration.

Today `TrustLedger` and `WorkAnchor` both use path/hash ideas, but they are
parallel accumulators. That is fine for C'', but the JSON sidecar design needs
one ledger surface so the same `path#hash` can address observed facts,
declarations, and later contradictions.

## Target Boundary

The non-coupled design has six pieces.

### 1. Pi Binder

`extension.ts` should only wire pi events to internal modules:

- resolve config;
- instantiate services;
- register pi hooks and commands;
- pass normalized outputs to policy/renderers;
- keep observability best-effort.

No JSON schema, retention semantics, provider-specific reasoning rules, or
ledger mutation details should live here.

### 2. Semantic Event Normalizer

New module: `semantic-events.ts`.

It converts pi events into a small append-only vocabulary:

```ts
type SemanticEvent =
  | { kind: "view"; path: string; hash: string; turn: number }
  | { kind: "edit"; path: string; oldHash?: string; newHash: string; diffstat: string; turn: number }
  | { kind: "edit_failed"; path: string; turn: number }
  | { kind: "test"; command: string; result: "pass" | "fail" | `${number}/${number} pass`; turn: number }
  | { kind: "declaration"; path: string; hash: string; retention: Retention; semanticComplete?: boolean; turn: number };
```

This is where pi-specific `tool_result` shapes, disk reads after edit, patch
parsing, and test-output classification belong.

### 3. Semantic Ledger

New module: `semantic-ledger.ts`.

It should absorb the current `TrustLedger` and `WorkAnchor` roles without losing
their renderers:

- latest observed view per `path#hash`;
- latest edit lineage per path;
- test log;
- model declarations per `path#hash`;
- calibration counters: declared disposable but re-read, declared
  semantic-complete but verbatim re-read, declared verbatim but never used;
- stale status when current disk hash differs from a stored view hash.

The ledger is storage, not prose. It should not decide how to compact.

### 4. Declaration Parser

New module: `work-semantics-declaration.ts`.

It parses a narrow model-authored sidecar:

```json
{
  "work_semantics": {
    "items": [
      {
        "path": "src/foo.ts",
        "hash": "abc123",
        "retention": "semantic",
        "semantic_complete": true,
        "reason": "routing map updated"
      }
    ]
  }
}
```

The parser should accept only schema-valid blocks and should never infer hashes.
If the block lacks a matching observed `path#hash`, it is recorded as an
unverified declaration or ignored behind a metric. A declaration is a hint, not
authority.

### 5. Projection Policy

New module: `projection-policy.ts`.

Inputs:

- raw/projection outcome;
- semantic ledger snapshot;
- config flags;
- task packet metadata when available.

Outputs:

- raw paths to protect;
- compacted views allowed to collapse into ledger form;
- tail messages to append;
- calibration events to log.

This module is where the cooperation happens: the model declares intent, the
harness checks it against facts, and policy chooses the least expensive context
that still protects work semantics.

### 6. Tail Renderers

Keep renderers separate:

- stale-view hints;
- work anchors;
- semantic ledger summaries;
- calibration warnings, if any.

A renderer turns ledger/policy output into volatile tail text. It must not read
the filesystem or mutate state.

## Cooperation Protocol

The LLM and harness should divide labor by epistemic strength.

The model is strong at intent:

- "this read was only for routing";
- "this content must remain verbatim";
- "this summary is enough for future work";
- "this artifact is done, tests passed, next step is X".

The harness is strong at provenance:

- which path was read;
- which bytes/hash were observed;
- whether an edit changed disk;
- whether a view is stale after an edit;
- whether the model later re-read something it declared complete.

So the protocol is:

1. Model emits a sidecar declaration when it has a retention judgment.
2. Harness stores that declaration at `path#hash` only if it can tie it to an
   observed view or edit.
3. Projection policy may use the declaration to compact more aggressively, but
   only inside deterministic guardrails.
4. Harness injects mechanical reminders when the model is about to reason from a
   stale or contradicted view.
5. Later re-read behavior becomes calibration data, not a hidden failure.

This protects "work semantics" without asking either side to pretend it is good
at the other's job.

## Migration Plan

### Step 0: No-Behavior Extraction

Extract the existing `tool_result` handler into `semantic-events.ts` while
preserving the current `TrustLedger` and `WorkAnchor` public behavior.

Acceptance:

- flag-off send payloads remain byte-identical;
- V2-TP and V3-WS tests pass without fixture rewrites;
- no model-authored declarations yet.

### Step 1: Unified Ledger

Introduce `SemanticLedger` behind the current renderers. Keep
`renderAnchorBlock` and stale hint rendering unchanged at first.

Acceptance:

- C'' anchor text remains byte-identical for existing fixtures;
- stale hints still use the same path/hash/diffstat facts;
- code has one path/hash authority.

### Step 2: Sidecar Parser Behind A Flag

Add `ECODE_WORK_SEMANTICS_DECLARATION=1`.

Start with sideband parsing only: detect and store declarations, but do not let
them change projection. This gives calibration data before policy risk.

Acceptance:

- invalid JSON blocks are ignored with a metric, not a crash;
- unmatched hashes do not gain authority;
- DeepSeek reasoning/thinking replay remains untouched.

### Step 3: Policy Hints

Allow declarations to affect projection only in narrow cases:

- `verbatim` protects exact text for a bounded recent window;
- `semantic` + matching hash + no contradiction allows collapse to ledger form;
- `routing`/`disposable` may be compacted earliest, but later re-read counts
  against calibration.

Acceptance:

- projected turns log which declaration changed policy;
- false declarations are visible in metrics;
- context savings are compared against sidecar output/replay cost.

### Step 4: E1 C''' Experiment

Run:

- C: deterministic projection;
- C'': deterministic work anchor;
- C''': work anchor + model-declared sidecar + policy hints.

Success:

- static artifact acceptance approaches D/B' on E1;
- compacted-path re-read rate drops versus C;
- total cost stays below D;
- no provider reasoning replay regressions.

## Tests To Add

- `semantic-events` fixtures for read, edit, write, failed edit, test pass/fail.
- Byte-stability tests: flag-off, trust-on/anchor-off, anchor-on/declaration-off.
- Ledger lineage tests: read -> edit -> stale view -> hint.
- Declaration parser tests: valid block, invalid JSON, unknown retention, missing
  hash, unmatched hash, duplicate declaration.
- Policy tests: verbatim protection, semantic collapse, disposable contradiction.
- Adapter regression: assistant thinking survives unchanged across projection.

## Boundary Rules

- Provider-specific reasoning replay belongs in the pi adapter/provider layer,
  not in semantic declarations.
- Model declarations never replace observed harness facts.
- The ledger may store prose supplied by the model, but policy must key decisions
  off schema fields plus path/hash verification.
- UI widgets display state; they do not compute state.
- All new mechanisms stay default-off until one controlled run and one artifact
  review pass.

## One Sentence

The extension should become a thin pi binding around a semantic ledger and
projection policy: the model declares work intent, the harness verifies
provenance, and neither side is allowed to silently impersonate the other.
