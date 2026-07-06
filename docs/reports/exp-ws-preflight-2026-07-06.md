# EXP-WS Preflight — 2026-07-06

Scope: verify newly wired EXP-WS addon arms before any Branch B real run.

## C+PL Placebo Dry Runs

Output directory: `experiments/results/exp-ws-preflight/`.

1. `G2-E1-CPL-dryrun.jsonl`
   - provider: mock
   - arm: `C+PL`
   - data_kind: `mock-packet-smoke`
   - `extension_flags.placebo_token_matching`: `true`
   - `placebo_tail_target_tokens`: 120
   - projected turns: 0 (G2-E1 mock smoke is one turn, so this validates manifest
     and metadata only)

2. `refactor-CPL-projected-dryrun.jsonl`
   - provider: mock
   - arm: `C+PL`
   - data_kind: `synthetic-smoke-fixture`
   - compact-after: 0
   - projected turns: 6/10
   - `extension_flags.placebo_token_matching`: `true`
   - `placebo_tail_target_tokens`: 120

## Implementation Notes

- `C+PL` now opens a real default-off placebo tail (`ECODE_WS_PLACEBO`) instead
  of only recording a manifest flag.
- The tail is fixed generic reminder text and carries no work semantics.
- Token targeting is local-estimate only and is not provider cost accounting.
  Provider-unit economics still require real Branch B runs.

## Verification

- `cd extensions/deterministic-compaction && npm test && npm run typecheck`
  passed after adding `placebo-tail.ts`.
- `cd experiments && npm test && npm run typecheck` passed after the addon-arm
  wiring changes.
