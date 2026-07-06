# Fable Cowork Index

> **2026-07-06 outcome (final):** cowork pass closed. All seven questions
> ruled + amendments R8–R12 (sideband C-SB preferred over in-band C''';
> provider-unit accounting binding; tax probe WS-2.5; persistent ledger
> WS-5/WS-6; two-hash-space discipline with `decl_id`). Design packet:
> `docs/arch-c3-design-2026-07-06.md`. **Implementation fully landed**:
> WS-0 (semantic-events), WS-1/1.5 (unified SemanticLedger), WS-2
> (declaration capture, `decl_id`, canonical JSON), WS-3 (sideband
> summarizer skeleton), WS-4 (projection policy: verbatim window +
> form-only substitution + contradiction suppression), EXP-WS (C-SB /
> C+PL / C'''-capture arms, `extension_flags` in JSONL meta). All flags
> default-off; 275 tests green across compaction-core / extension /
> experiments; flag-off byte-identity preserved throughout.
>
> **Gates before any real C-SB / C''' run:** (1) `C2-ANCHOR-E1` runs and
> is audited R2-style — its result picks Branch A/B in the design packet's
> experiment manifest; (2) WS-2.5 tax-probe number available for the
> branch decision. WS-6 (resume injection) stays deferred until WS-5
> dogfooding evidence and a persistent-ledger retention rule exist.
> README narrative unchanged by design: mechanism facts may be listed,
> but claims wait for C2 data (roadmap "narrative third" rule).
>
> **2026-07-07 experiment closure:** C2-ANCHOR-E1 → C'' failed the D-grade
> completion gate (Branch B activated). Branch B → C-SB rejected as
> implemented (spec violation vs Deliverable 4, R13); C+PL 3/3 fired the
> pre-registered R7 trigger → tail-affordance hypothesis (R14: ritual buys
> completion, content buys trajectory). Branch C → C+N 3/3 on completion
> but ~6× cost without a governor; neither arm promotes (R17); `NUDGE-GOV`
> recorded as candidate, not scheduled. Reports:
> `c2-anchor-e1-2026-07-06.md`, `ws-tax-probe-2026-07-06.md`,
> `branch-b-e1-2026-07-07.md`, `branch-c-e1-2026-07-07.md`. Narrative seed
> with verification gates: `docs/note-256k-plateau-context-economy.md`.
> README narrative remains frozen throughout. **This cowork is closed.**

2026-07-06. This is the handoff entry for the next cowork. Goal: design the real
direction for view-based context / work-semantics preservation after R2, without
letting the current extension accrete more coupled behavior.

## Start Here

Read in this order:

1. `docs/arch-c3-design-2026-07-06.md`
2. `docs/reports/r2-verdict.md`
3. `docs/reports/r2-turn-interaction-retro-2026-07-06.md`
4. `docs/reports/llm-declared-work-semantics-2026-07-06.md`
5. `docs/reports/extension-work-semantics-architecture-2026-07-06.md`
6. `docs/note-view-based-context.md`
7. `docs/reports/v3-ws-semantic-anchor-handoff-2026-07-06.md`
8. `docs/long-life-roadmap.md`
9. `docs/reports/compaction-strategy-research-2026-07-06.md`

## Current State

R2 is complete:

- `experiments/results/r2-core/`: 27 JSONL + 3 compare files.
- `experiments/results/r2-bfixed-addon/`: 9 JSONL + 3 compare files.
- R1/code-production is the established advantage zone for deterministic
  projection.
- E1/exploration exposed the key failure: lost work semantics, not merely lost
  bytes.
- D1/direct-transform mostly passed static checks but still showed high
  compacted-path re-read pressure; it is not proof of safety.

Implementation state:

- V2 trust protocol exists behind `ECODE_TRUST_PROTOCOL`.
- V3 work-semantic anchor exists behind `ECODE_SEMANTIC_ANCHOR`.
- Current anchors are harness-authored structured extraction from tool events.
- Model-authored JSON work semantics are not implemented yet.
- `extension.ts` is now the main architectural pressure point.

## Design Frame

The design is one system with three faces:

- **Intent declaration:** model -> harness downward contract.
- **Semantic ledger:** storage layer keyed by `path#hash`.
- **Trust protocol:** harness -> model upward contract.

These should share the same hash-addressed evidence model. They should not become
three features with three stores and three policy surfaces.

## Original Fable Questions

1. Should C'' semantic anchor be validated on E1 before adding model-declared
   sidecars, or should C''' be designed now and run as the next controlled arm?
2. What exact sideband channel should carry the model JSON block in pi: assistant
   content block, tool-like sidecar, structured response field, or a synthetic
   harness event?
3. What is the mechanical definition of `semantic_complete`?
4. Which declarations are allowed to change projection policy on the first
   experiment: `verbatim`, `semantic`, `routing`, `disposable`, or only one of
   them?
5. How should false declarations be surfaced: metric only, tail warning, dispatch
   penalty, or packet-level failure reason?
6. Should provider server-side compaction become a separate E arm now, or remain
   landscape context until DeepSeek exposes a comparable contract?
7. What is the smallest experiment that can distinguish "semantic ledger helped"
   from "prompt reminder helped"?

## Outcome Addendum

`ARCH-C'''-DESIGN` is complete. The design packet landed at
`docs/arch-c3-design-2026-07-06.md`.

It fixes nine rulings:

- design now, run later;
- sideband channel for in-band declarations is a dedicated tool call;
- `semantic_complete` has ex-ante and ex-post mechanical tests;
- first policy scope is narrow: `verbatim` protection and `semantic`
  form-substitution only;
- false declarations are metric-only in round 1;
- provider server-side compaction stays landscape until a cache-observable
  compaction API exists;
- attribution experiment uses C'', policy arm, and C+PL placebo;
- if C'' is insufficient, C-SB is preferred over in-band C''' as the policy arm;
- all economics use provider-token units, not local estimates.

It also defines six deliverables:

- declaration schema;
- author-agnostic ledger records and calibration metrics;
- projection policy scope;
- sideband summarizer spec and net-flow accounting;
- fixture/byte-stability test matrix;
- branch-style E1 manifest.

Next coding dispatch is WS-0..WS-6 plus EXP-WS:

- WS-0 and WS-1 are landed.
- Shared WS-1.5 record prep is landed: declaration/summary record types and
  inert storage surfaces exist in `SemanticLedger`.
- WS-2 is landed.
- WS-3, WS-5, and WS-2.5 are landed.
- WS-4 and EXP-WS are landed: default-off projection policy, protected-path
  seam, form-only substitution, and addon arm manifest/meta wiring.
- WS-6 is deferred until WS-5 dogfooding proves the persisted ledger answers
  "where was I?" and a retention rule exists.
- `extension.ts` remains a binder: flag parsing and module instantiation only;
  policy/schema/provider rules live outside it.
- Runtime prerequisite remains `C2-ANCHOR-E1`; no C'''/C-SB real arm runs before
  that anchor result is audited.

## Non-Negotiables

- Model declarations are hints, never facts.
- Harness facts are path/hash/diffstat/turn/test evidence, never confidence
  prose.
- DeepSeek reasoning replay must stay separate from work-semantics sidecars.
- Flag-off behavior must remain byte-identical.
- If sidecar output/replay cost exceeds avoided re-read/input cost, the design
  fails even if it feels cleaner.

## One Sentence

Fable's design problem is not "how do we summarize better"; it is "how do model
intent and harness provenance cooperate under one `path#hash` contract without
turning the extension into a ball of policy state."
