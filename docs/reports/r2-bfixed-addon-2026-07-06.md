HEAD: 40f66e83fdfc3d6f9bd4e449fdee80be8275ecbb

# R2 B-fixed add-on execution log — 2026-07-06

## Scope

B' add-on released automatically after R2-core. Run 9 real DeepSeek packet
sessions:

- packets: G2-R1, G2-E1, G2-D1;
- arm: B with `--context-window 48000`;
- repeats: n=3;
- all runs unset `TAUCODE_TRUST_PROTOCOL`, `TAUCODE_SEMANTIC_ANCHOR`, and `TAUCODE_ANCHOR_ACCEPTANCE`.

Snapshot: `experiments/snapshots/taucode`.
`manifestHash=922aa885e628f69f5174219adc443ad14778f4f1dd7bc3ac120c0c47c0b761ba`.

## Order

| # | Repeat | Packet | Arm | context-window | workspace |
| ---: | ---: | --- | --- | ---: | --- |
| 1 | 1 | G2-E1 | B | 48000 | empty |
| 2 | 1 | G2-R1 | B | 48000 | snapshot |
| 3 | 1 | G2-D1 | B | 48000 | snapshot |
| 4 | 2 | G2-D1 | B | 48000 | snapshot |
| 5 | 2 | G2-E1 | B | 48000 | empty |
| 6 | 2 | G2-R1 | B | 48000 | snapshot |
| 7 | 3 | G2-R1 | B | 48000 | snapshot |
| 8 | 3 | G2-D1 | B | 48000 | snapshot |
| 9 | 3 | G2-E1 | B | 48000 | empty |

## Runs

_Filled during execution._

Execution started: 2026-07-05T19:13:02.986Z

| # | Repeat | Packet | Duration | JSONL | Acceptance | Gate | Notes |
| ---: | ---: | --- | ---: | --- | --- | --- | --- |
| 1 | 1 | G2-E1 | 134.73s | `experiments/results/r2-bfixed-addon/01-r1-G2-E1-Bfixed.jsonl` | 4/5 static | clean | turns=24; native=1; projected=0 |
| 2 | 1 | G2-R1 | 199.07s | `experiments/results/r2-bfixed-addon/02-r1-G2-R1-Bfixed.jsonl` | 4/4 static, 2 pending | clean | turns=25; native=1; projected=0 |
| 3 | 1 | G2-D1 | 266.34s | `experiments/results/r2-bfixed-addon/03-r1-G2-D1-Bfixed.jsonl` | 4/4 static | clean | turns=26; native=1; projected=0 |
| 4 | 2 | G2-D1 | 86.39s | `experiments/results/r2-bfixed-addon/04-r2-G2-D1-Bfixed.jsonl` | 4/4 static | INVALID | native compaction not observed; turns=24; native=0; projected=0 |
| 5 | 2 | G2-E1 | 105.49s | `experiments/results/r2-bfixed-addon/05-r2-G2-E1-Bfixed.jsonl` | 5/5 static | clean | turns=21; native=1; projected=0 |
| 6 | 2 | G2-R1 | 139.63s | `experiments/results/r2-bfixed-addon/06-r2-G2-R1-Bfixed.jsonl` | 4/4 static, 2 pending | clean | turns=20; native=1; projected=0 |
| 7 | 3 | G2-R1 | 141.12s | `experiments/results/r2-bfixed-addon/07-r3-G2-R1-Bfixed.jsonl` | 4/4 static, 2 pending | clean | turns=16; native=1; projected=0 |
| 8 | 3 | G2-D1 | 108.39s | `experiments/results/r2-bfixed-addon/08-r3-G2-D1-Bfixed.jsonl` | 4/4 static | INVALID | native compaction not observed; turns=18; native=0; projected=0 |
| 9 | 3 | G2-E1 | 181.84s | `experiments/results/r2-bfixed-addon/09-r3-G2-E1-Bfixed.jsonl` | 5/5 static | clean | turns=28; native=1; projected=0 |

Execution finished: 2026-07-05T19:35:46.001Z

## Post-run Validation

- JSONL files: 9 / 9.
- Provider-error retries: 0.
- Structural issues found by independent JSONL scan: 0.
- All runs have `provider=deepseek`, `data_kind=g2-packet-run`, and `provider_context_window=48000`.
- `TAUCODE_TRUST_PROTOCOL`, `TAUCODE_SEMANTIC_ANCHOR`, and `TAUCODE_ANCHOR_ACCEPTANCE` were unset by command wrapper; meta scan found no anchor targets.
- R1/D1 snapshot runs all matched `manifestHash=922aa885e628f69f5174219adc443ad14778f4f1dd7bc3ac120c0c47c0b761ba`.
- E1 runs used empty workspaces.
- Every run has an artifact row.
- Native compaction observed: R1 3/3, E1 3/3, D1 1/3.
- D1 B-fixed repeat 2 and repeat 3 are INVALID for the native-trigger gate.

## Compare Outputs

- `experiments/results/r2-bfixed-addon/G2-R1-with-Bfixed-compare.md`
- `experiments/results/r2-bfixed-addon/G2-E1-with-Bfixed-compare.md`
- `experiments/results/r2-bfixed-addon/G2-D1-with-Bfixed-compare.md`
