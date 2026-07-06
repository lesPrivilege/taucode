# WS-2.5 Declaration Tax Probe — 2026-07-06

Scope: paired measurement run for in-band work-semantics declaration overhead.
Scenario: `G2-E1`; arm: physical `C`; provider: real DeepSeek; compact-after:
32000; keep-recent: 3. Both v2 runs enabled `ECODE_WS_DECLARATION=1`; the nudge
run additionally enabled `ECODE_WS_DECLARE_NUDGE=every-turn`.

## Harness Fix Before Measurement

Two measurement issues were fixed before treating the probe as usable:

- experiment runs now persist tax rows under
  `experiments/results/ws-tax-probe/.ws-tax-probe/` instead of the temporary
  workspace that `run.ts` deletes;
- JSONL turn/summary rows now include provider reasoning tokens
  (`reasoning_tokens`, `total_reasoning_tokens`) when DeepSeek reports them.

Verification:

- `cd experiments && npm test && npm run typecheck` passed.

## Paired v2 Runs

| Mode | JSONL | Static | Turns | Input | Output | Reasoning | Re-reads | Comp-path re-reads |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| no nudge | `G2-E1-C-declare-no-nudge-v2.jsonl` | 5/5 | 37 | 1,119,636 | 15,742 | 2,629 | 6 | 2 |
| nudge | `G2-E1-C-declare-nudge-v2.jsonl` | 5/5 | 23 | 635,378 | 11,634 | 3,159 | 3 | 2 |

Paired deltas (`nudge - no nudge`):

- turns: -14
- input tokens: -484,258
- output tokens: -4,108 total
- reasoning tokens: +530 total
- per-turn output rate: +80.37 tokens/turn
- per-turn reasoning rate: +66.29 tokens/turn

Tax rows:

- `experiments/results/ws-tax-probe/.ws-tax-probe/G2-E1-C-declare-nudge-v2.jsonl`
- rows: 23
- output sum: 11,634
- reasoning sum: 3,159
- declaration-only turns: 0

## Interpretation Boundary

The nudge changed behavior substantially: both v2 runs passed 5/5, but the
nudge run used fewer turns and lower total output while spending more reasoning.
This is a measurement run, not an experiment arm. The usable cost number for
Branch B planning is: in this paired run, every-turn declaration nudging added
about **+66 reasoning tokens/turn** and raised the output rate by about
**+80 output tokens/turn**, while also changing task trajectory.
