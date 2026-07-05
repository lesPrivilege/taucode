# V2-TP acceptance report

2026-07-05. All tasks per the V2-TP packet (GOALS.md line 188–224).

## Implementation summary

| Task | Commit(s) | Status |
| --- | --- | --- |
| Flag scaffold (`ECODE_TRUST_PROTOCOL`, default OFF) | `0421625` | DONE |
| T1: View ledger (path→{hash, turn}, SHA-256/8-hex) | `de30799` | DONE |
| T2: summaryMeta injection seam (hash+diffstat) | `77357de` | DONE |
| T3: Stale-view hint scanner (pure, read-only) | `735da16` | DONE |
| T3: Wire stale-view hints into context hook (volatile tail) | `2fabed2` | DONE |
| Wiring: tool_result events → ledger (read/edit/write) | this session | DONE |
| Obs: ambient JSONL records `trust_protocol_enabled` | this session | DONE |
| T4: read-dedup assessment report (docs only) | this session | DONE |
| Mock fixture: edit→stale-read → stale-view hint | this session | DONE |

## Verification against packet acceptance criteria

### flag-off: byte-identical to v1 (全部现有测试字节级同行为)

**PASS** — 73/73 tests green with `ECODE_TRUST_PROTOCOL` unset (default OFF).

Evidence:
- `trust-protocol.test.ts`: asserts `resolveConfig().trustProtocolEnabled === false` when env unset
- `trust-wiring.test.ts`: "does NOT register a tool_result handler when flag is off"
- `trust-fixture-replay.test.ts`: "NO hint when flag is OFF (v1 byte-identical behavior)" — context hook returns `undefined` (identity pass-through)
- All 60 pre-existing tests (smoke, adapter, projection, observability, telemetry, tuning, seam-b, gate-widget) pass unchanged — they run without the flag, confirming v1 behaviour is preserved

### flag-on single tests

| Criterion | Test file | Assertion |
| --- | --- | --- |
| hash same → no injection | `trust-hint.test.ts` "no hint when the read view hash matches the ledger" | staleViewHints returns [] |
| hash different → injection, exact format | `trust-hint.test.ts` "emits an exact-format hint…" | `[stale-view] <path>: view from <A> predates your edit at turn <N> (now <B>); re-read only if you need current content.` |
| edit summary投影后含 hash+diffstat | `trust-ledger.test.ts` "records an edit as path → {hash, turn, diffstat}" | LedgerEntry carries diffstat |
| Hint in volatile tail (prefix stability) | `trust-hint.test.ts` "is appended, leaving the base array as an unchanged prefix" | `sent.slice(0, base.length) === base` |
| parseDiffstat from unified patch | `trust-ledger.test.ts` "counts added and removed lines…" | "+2 -1" from a real patch |

### mock fixture: edit后读到旧视图, flag-on 出现 stale-view 行

**PASS** — `trust-fixture-replay.test.ts`:
- Full sequence: read(v1) → edit(v2 on disk) → context with stale read → hint appended
- Asserts: `[stale-view]`, path, turn number, both hashes (birth and current)
- Asserts: original messages preserved as prefix (cache stability)

### Ambient records flag state

**PASS** — `AmbientSessionRow` now includes `trust_protocol_enabled: boolean`.
`AmbientCollector.setTrustProtocolEnabled(flag)` is called at install time.
Every session's JSONL row carries the flag state → round-2 analysis can partition by on/off.

### Prohibitions respected

| Prohibition | Status |
| --- | --- |
| No changes to `pi/` | Confirmed: `pi/` never touched (read-only reference) |
| No changes to compaction-core algorithm | Confirmed: only the injection point (summaryMeta) was used |
| No non-filesystem-verifiable statements injected | Confirmed: hint text references hashes and turn numbers only |
| Flag default never ON | Confirmed: `readBoolEnv` returns false for unset/empty |

## Test suite final state

```
Test Files  14 passed (14)
Tests       73 passed (73)
Duration    2.48s
```

Breakdown of new tests (this session):
- `trust-ledger.test.ts` +4 (parseDiffstat)
- `trust-wiring.test.ts` +6 (tool_result → ledger → hint, flag-off guard)
- `trust-fixture-replay.test.ts` +3 (full replay fixture)

## Files changed this session

```
extensions/deterministic-compaction/src/trust-ledger.ts    — added parseDiffstat
extensions/deterministic-compaction/src/extension.ts       — tool_result handler, fs imports, telemetry.setTrustProtocolEnabled
extensions/deterministic-compaction/src/ambient-telemetry.ts — trust_protocol_enabled field + setter
extensions/deterministic-compaction/test/trust-ledger.test.ts — parseDiffstat tests
extensions/deterministic-compaction/test/trust-wiring.test.ts — NEW (wiring integration)
extensions/deterministic-compaction/test/trust-fixture-replay.test.ts — NEW (replay fixture)
docs/t4-read-dedup-assessment.md — NEW (T4 evaluation report)
docs/v2-tp-acceptance.md — this file
```

## Remaining (not in V2-TP scope, noted for completeness)

- **Round-2 execution**: flag-on C' arm comparison — requires round-1 baseline first
- **Read-dedup implementation**: assessed in T4 report, wiring trivial, deferred to post-baseline
- **g0-survey Item 8**: reasoning_content finding (separate one-liner, outside V2-TP)
