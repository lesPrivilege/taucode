# V3-WS Semantic Anchor Handoff

2026-07-06. This note records the V3-WS work-semantic anchor implementation and
the follow-up harness wiring state. It is distilled from the implementation
handoff and checked against the current repo.

## Purpose

R2 showed that deterministic projection is strong for refactor/code-production
work, but exploration still needs progress semantics. In the E1 failure shape,
projection happened many times and the expected `SUBSYSTEM-MAP.md` artifact was
not produced. The V3-WS hypothesis is that a deterministic work anchor can supply
the missing "what have I done / what is still pending" state without paying for
D's persisted checkpoint path.

The anchor is the C'' arm: default off, enabled only by `ECODE_SEMANTIC_ANCHOR=1`.

## Implemented Surface

Extension:

- `extensions/deterministic-compaction/src/anchor.ts`
  - `WorkAnchor`: session-scoped accumulator of mechanical work facts.
  - `renderAnchorBlock`: deterministic sectioned block under `[work-anchor]`.
  - `anchorTailMessage`: volatile send-time user message carrier.
  - `parseTestResult`: conservative bash test-run classifier.
- `extensions/deterministic-compaction/src/extension.ts`
  - feeds the anchor from `tool_result` events when the anchor flag is on;
  - records reads, successful edits/writes, failed edits/writes, and test runs;
  - injects the anchor only on projected turns;
  - appends the anchor after any stale-view hint.

Harness:

- `experiments/run.ts`
  - when `ECODE_SEMANTIC_ANCHOR=1` and the scenario is a packet, extracts
    `file-exists` acceptance targets and sets `ECODE_ANCHOR_ACCEPTANCE`;
  - restores the caller's prior `ECODE_ANCHOR_ACCEPTANCE` after the run;
  - records `mechanism.anchor_acceptance_targets` in JSONL meta.
- `experiments/test/preflight-wiring.test.ts`
  - verifies E1-style packet `file-exists` checks become anchor pending targets.

## Channel Discipline

The anchor reuses the same volatile tail channel as V2-TP stale-view hints.

When both flags are on and a projected turn emits both blocks, the order is:

```text
[...projectedMessages, staleHintMessage, anchorTailMessage]
```

Properties:

- send-time only;
- never persisted into session history;
- one anchor block per projected turn;
- multi-line content inside one user message, not many messages;
- no injection on non-projected turns;
- flag-off path remains the v1 behavior.

## Anchor Content

Every line is mechanical evidence:

- `read: path@hash`
- `edits: path +N -M hash old→new`
- `edits: path failed`
- `tests: command → result`
- `pending: path`

No confidence, progress judgment, or natural-language reassurance is injected.
Pending targets are satisfied only by successful edit/write records; failed edits
do not clear a pending target.

## Validation State

Current extension test coverage includes:

- pure anchor formatting and state accumulation;
- failed edit keeps pending target;
- config parsing for `ECODE_SEMANTIC_ANCHOR` / `ECODE_ANCHOR_ACCEPTANCE`;
- projected-turn-only injection;
- no anchor when the flag is off;
- replacement behavior across projected turns;
- V2-TP coexistence order and count;
- mock replay of the E1-style "projection loses work semantics" failure shape.

The current expected local verification is:

```bash
cd extensions/deterministic-compaction && npm test && npm run typecheck
cd experiments && npm test && npm run typecheck
```

## What Is Not Done

V3-WS design item 2, deterministic read-summary symbol extraction, is not part of
this implementation. It should remain a separate packet (`SYMBOL-SUMMARY`) so it
does not blur the C'' evaluation.

No C'' real-provider evaluation has been run yet. R2 core and B' add-on explicitly
unset `ECODE_SEMANTIC_ANCHOR` and `ECODE_ANCHOR_ACCEPTANCE`, so the R2 baseline
remains uncontaminated.

## Next Validation

Run E1 with:

```bash
ECODE_SEMANTIC_ANCHOR=1
```

and compare against R2 A/B'/C/D.

Decision question: can deterministic anchors recover D-like E1 completion
stability without D's checkpoint cost?

Success condition: E1 static completion approaches D, while cost remains closer
to C/B' than D.
