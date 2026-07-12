# T4 — read-dedup wiring assessment (V2-TP task 4)

2026-07-05. Assessment only — no implementation (scope containment per packet).

## What read-dedup does

`taucode/packages/core/src/read-dedup.ts` intercepts read tool calls and returns a
short stub when the file is unchanged since a prior read in the same session. Purpose:
detect and short-circuit pathology (c) — circular re-reads that inflate input tokens
without adding information.

Mechanism: before the read executes, read the target from disk, compute SHA-256/8-hex,
scan backward through messages for a prior read result of the same resolved path with
the same hash. If found → return a dedup stub (`¶path#hash\n[Dedup: file unchanged…]`)
instead of the full file content.

## Delta from taucode to pi extension

| Aspect | taucode | pi extension (V2-TP) |
| --- | --- | --- |
| Interception point | Pre-execution (`tryDedupRead` called in tool dispatch) | `tool_result` event (post-execution, can replace result) |
| Hash source for comparison | Scans messages for `¶path#hash` or `[compacted read result]…#hash` | Trust ledger: `ledger.get(path).hash` (already populated by task ① wiring) |
| Path resolution | `meta.sourcePath` on prior results | Not available in pi — use `event.input.path` + cwd (same as task ① wiring) |
| Hashline in result | Required (`¶path#hash\n…`) | NOT present (g0-survey Item 1: pi read results are plain text) |
| File read at intercept time | Yes (to compute current hash) | Unnecessary — `tool_result` content IS the current file content; hash it directly |

## Minimal wiring scheme

### Seam: `tool_result` event for `read` (same event as task ① wiring)

The task ① handler already fires on every non-error read result. The dedup logic adds
one conditional branch BEFORE the ledger update:

```
on("tool_result" for read):
  1. hash the result content → currentHash
  2. look up ledger.get(path)
  3. IF ledger entry exists AND entry.hash === currentHash:
     → return { content: dedup stub, details: { dedup: true } }
     → do NOT update ledger (view is unchanged, no new information)
  4. ELSE:
     → ledger.recordView(path, content, turn)  [existing task ① logic]
     → return nothing (pass through the full result)
```

### Dedup stub format (pi-adapted)

```
[unchanged since turn <N>] <path> (#<hash>) — prior read is authoritative.
```

No hashline prefix (pi model doesn't expect it). Short enough to be negligible tokens.
`turn <N>` references the ledger entry's turn so the model knows where in its history
the authoritative view lives.

### Why `tool_result` replacement, not `tool_call` blocking

Pi's `tool_call` event can return `{ block: true }` but provides no result-replacement
path — the model would get an error, not a stub. The `tool_result` event returns
`{ content, details, isError }` which REPLACES the result the model sees. This is
exactly the right seam: the read executed (cheap — local fs), we got the content for
free, and we can decide post-hoc whether to pass it through or replace it.

### Flag gating

Gated behind `TAUCODE_TRUST_PROTOCOL` (same flag as all V2-TP work). The ledger is only
populated when the flag is on, so the dedup check naturally requires it.

### Interaction with stale-view hints

No conflict. Stale-view hints fire when a READ result's hash DIFFERS from the ledger's
current hash (meaning an edit happened since the read). Dedup fires when the hash
MATCHES (file unchanged). These are mutually exclusive conditions on the same check.

### Interaction with compaction projection

A deduped result (short stub) is well below `minResultTokens` (200 tokens), so
compaction-core will never try to further compact it. No interaction.

## Concerns / open questions

1. **Partial reads (offset/limit)**: if the model reads lines 10-50, the content is a
   subset. The ledger records hash(subset). Next full read of the same path → hash(full)
   ≠ hash(subset) → no dedup. This is correct (the views are genuinely different).
   However, two identical partial reads of the same range WOULD dedup correctly.

2. **Model behaviour shift**: returning a dedup stub changes what the model sees. Some
   models might re-read in a loop expecting full content. Mitigation: the stub says
   "prior read is authoritative" — same mitigation as taucode uses. Monitor via ambient
   telemetry (re-read-after-dedup events).

3. **Cost of implementation**: ~20 lines in the existing `tool_result` handler + a test.
   The ledger and event plumbing are already wired (task ①). Estimated time: <30 min.

## Recommendation

Wire it as described above. The ledger makes this trivially cheap compared to taucode's
message-scanning approach. The `tool_result` replacement seam is tailor-made for this
use case. Keep it behind the same flag; add an ambient counter for dedup events so the
effect is observable in round-2 data.

Do NOT attempt until round-1 (flag-off) baseline data is collected — the dedup is a
token-saving optimisation whose value is only assessable against the baseline's
re-read rate.
