# OBS-TAIL Preflight — 2026-07-06

Scope: Branch B precondition. Projected turn JSONL rows must carry mechanical
evidence that volatile tail blocks or substitutions were actually present in the
send payload.

## Fields

Each `type:"turn"` row now includes:

- `tail_blocks`: array of evidence blocks `{ source, line_count, content_hash }`;
- `anchor_lines`: direct count of rendered anchor lines;
- `anchor_hash`: hash of anchor block content, or `null` when absent.

Sources currently used:

- `trust_hint`
- `anchor`
- `placebo`
- `nudge`
- `substitution`

Hashes are SHA-256 truncated to 16 hex chars. They prove payload-shape presence
without writing the full tail prose into JSONL.

## Verification

- Extension fixture: projected turn with `semanticAnchorEnabled` and
  `placeboTailEnabled` records both `anchor` and `placebo` evidence.
- Experiments fixture: `C+PL` projected mock run writes `tail_blocks` with
  `source:"placebo"` in the turn row.
- CLI dry-run `results/obs-tail-preflight/refactor-CPL-obs-tail.jsonl`:
  projected turn 5 has `source:"placebo"`, `line_count:2`, hash
  `5642e0bdc3a6055a`.
- CLI dry-run `results/obs-tail-preflight/refactor-C-anchor-obs-tail.jsonl`:
  projected turn 5 has `anchor_lines:2`, `anchor_hash:"4a3b77347a995f23"`,
  and a matching `source:"anchor"` block.

Commands passed:

- `cd extensions/deterministic-compaction && npm test && npm run typecheck`
  (27 files / 192 tests)
- `cd experiments && npm test && npm run typecheck`
  (9 files / 50 tests)

## Branch B Gate

Branch B real runs may start only after confirming the planned run's projected
turn rows include the relevant source:

- C'': `source:"anchor"` with `anchor_lines > 0`;
- C-SB: `source:"anchor"` plus `source:"substitution"` when policy substitutes;
- C+PL: `source:"placebo"`.
