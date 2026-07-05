# R2 preflight — 2026-07-06

## Scope

Gate-release checklist executed by Codex:

1. R1:C rerun with artifact retention and pending command logs.
2. B-fixed proves native compaction can trigger under a comparable context window.
3. D1 low-threshold probe proves negative-zone compaction actually triggers for C/D.
4. Env wiring prep for C''/anchor: `ECODE_ANCHOR_ACCEPTANCE` is filled from packet `file-exists` checks when `ECODE_SEMANTIC_ANCHOR=1`.

## Harness prep

- G3-AR artifact exporter installed in `run.ts`.
- `compare.ts` now labels DeepSeek packet data as real workload data, not synthetic smoke fixtures.
- `export-review.ts` can generate local review markdown from a run/session JSONL and matching ambient rows.
- B-fixed support: `run.ts --context-window <n>` overrides provider model `contextWindow`; DeepSeek model override verified in meta as `provider_context_window`.
- Anchor env support: experiments test confirms `ECODE_SEMANTIC_ANCHOR=1` injects file-exists targets into `ECODE_ANCHOR_ACCEPTANCE`.

Verification before runs:

- `npm test -- --run` in `experiments`: 9 files, 47 tests passed.
- `DEEPSEEK_API_KEY` non-empty, value not printed.
- Snapshot: `experiments/snapshots/taucode`, `manifestHash=922aa885e628f69f5174219adc443ad14778f4f1dd7bc3ac120c0c47c0b761ba`.
- All preflight runs used `env -u ECODE_TRUST_PROTOCOL -u ECODE_SEMANTIC_ANCHOR -u ECODE_ANCHOR_ACCEPTANCE`.

## Runs

| # | Gate | Command shape | Result | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | R1:C artifact retention | `G2-R1 arm C, 32k, keep=3` | PASS for artifact gate | `experiments/results/r2-preflight/R1-C-artifact.jsonl`; artifact row present; outputs copied; diff files present; command logs present |
| 2 | B-fixed native trigger | `G2-R1 arm B, --context-window 48000` | PASS | `native_compactions_observed=1`; meta `provider_context_window=48000`; static 4/4 |
| 3 | D1 C low-threshold trigger | `G2-D1 arm C, compact-after=8000` | PASS | `projected_turn_count=31`; static 4/4; artifact `COMPACTION-REFERENCE.md` present |
| 4 | D1 D low-threshold trigger | `G2-D1 arm D, compact-after=8000` | PASS | `projected_turn_count=19`; static 4/4; artifact `COMPACTION-REFERENCE.md` present |

## Notes

- R1:C artifact run completed static acceptance 4/4 but `projected_turn_count=0`; this run's gate was artifact/command retention, not compaction proof.
- R1 command logs captured `pnpm test -- packages/core/test/compaction.test.ts` PASS and `pnpm run typecheck` FAIL. Baseline snapshot `pnpm run typecheck` fails with the same `packages/core/src/events.ts` errors, so this is recorded as `baseline-red`, not a task-induced artifact failure.
- D1-low used the裁定 option "低阈值 8k"; both C and D crossed the seam-A gate.
- D1-D low8k compare flags SUSPICIOUS vs C: total tokens down with re-reads up. This does not block preflight because the gate here was trigger proof, not quality/net-savings judgment.

## Outputs

- JSONL:
  - `experiments/results/r2-preflight/R1-C-artifact.jsonl`
  - `experiments/results/r2-preflight/R1-B-fixed-cw48000.jsonl`
  - `experiments/results/r2-preflight/D1-C-low8k.jsonl`
  - `experiments/results/r2-preflight/D1-D-low8k.jsonl`
- Compare:
  - `experiments/results/r2-preflight/R1-preflight-compare.md`
  - `experiments/results/r2-preflight/D1-low8k-compare.md`
- Review:
  - `experiments/results/reviews/r2-preflight-d1-d-low8k-review.md`

## Decision

R2-preflight is GREEN for its release gates:

- artifact retention works;
- B-fixed can trigger native compaction;
- D1 low-threshold C/D both trigger deterministic projection;
- anchor env wiring is ready for later C'' evaluation.

**27-run R2-core is released.**
