# Environment variable & path rename: ecode → taucode

**Canonical identity:** `taucode` (τ = 2π).  
**Former name (pi-experiment phase):** `ecode` (Euler's *e*, paired with pi).  
**Rename date:** 2026-07 (identity merge; experiment numbers and conclusions unchanged).

## Dual-read rule

Readers accept **TAUCODE_\*** first. If that key is **unset**, they fall back to the
legacy **ECODE_\*** name with the same suffix. Writers (launcher defaults, experiment
harness) set the **TAUCODE_\*** form; the launcher also re-exports a few legacy names
for any still-unmigrated path.

Do not rely on legacy names for new work. They exist so old shells, scripts, and
dogfood profiles keep working across the rename.

## Variable对照表

| Canonical (use this) | Legacy (still read) | Role |
| --- | --- | --- |
| `TAUCODE_COMPACT_AFTER_INPUT_TOKENS` | `ECODE_COMPACT_AFTER_INPUT_TOKENS` | Seam A projection threshold (default 32000) |
| `TAUCODE_KEEP_RECENT_ASSISTANT_MSGS` | `ECODE_KEEP_RECENT_ASSISTANT_MSGS` | Keep-recent protection window (default 3) |
| `TAUCODE_SEAM_B` | `ECODE_SEAM_B` | Optional seam B (LLM-summary replace) |
| `TAUCODE_DEFAULT_MODEL` | `ECODE_DEFAULT_MODEL` | Launcher `--model` override |
| `TAUCODE_OPENAI_COMPAT_BASE_URL` | `ECODE_OPENAI_COMPAT_BASE_URL` | OpenAI-compat base URL (launcher route) |
| `TAUCODE_TRUST_PROTOCOL` | `ECODE_TRUST_PROTOCOL` | V2 trust protocol master switch |
| `TAUCODE_SEMANTIC_ANCHOR` | `ECODE_SEMANTIC_ANCHOR` | V3 work-semantic anchor (C'') |
| `TAUCODE_ANCHOR_ACCEPTANCE` | `ECODE_ANCHOR_ACCEPTANCE` | Anchor pending targets (comma list) |
| `TAUCODE_WS_DECLARATION` | `ECODE_WS_DECLARATION` | Work-semantics declaration tool |
| `TAUCODE_WS_DECLARE_NUDGE` | `ECODE_WS_DECLARE_NUDGE` | Declaration tax probe (`every-turn`) |
| `TAUCODE_SIDEBAND_SUMMARY` | `ECODE_SIDEBAND_SUMMARY` | Sideband summarizer switch |
| `TAUCODE_SIDEBAND_MIN_TOKENS` | `ECODE_SIDEBAND_MIN_TOKENS` | Sideband min payload tokens |
| `TAUCODE_SIDEBAND_MODEL` | `ECODE_SIDEBAND_MODEL` | Sideband model id |
| `TAUCODE_LEDGER_PERSIST` | `ECODE_LEDGER_PERSIST` | Append-only ledger sink |
| `TAUCODE_WS_POLICY` | `ECODE_WS_POLICY` | Projection policy switch |
| `TAUCODE_WS_VERBATIM_WINDOW` | `ECODE_WS_VERBATIM_WINDOW` | Verbatim protect window (turns) |
| `TAUCODE_WS_PLACEBO` | `ECODE_WS_PLACEBO` | Placebo tail control |
| `TAUCODE_WS_PLACEBO_TOKENS` | `ECODE_WS_PLACEBO_TOKENS` | Placebo tail target tokens |
| `TAUCODE_WS_NUDGE` | `ECODE_WS_NUDGE` | Compact orientation nudge |
| `TAUCODE_AMBIENT_DIR` | `ECODE_AMBIENT_DIR` | Ambient telemetry output dir override |
| `TAUCODE_TRC` | `ECODE_TRC` | Frontier TRC master switch |
| `TAUCODE_TRC_TRIGGER_TOKENS` | `ECODE_TRC_TRIGGER_TOKENS` | TRC input-token trigger |
| `TAUCODE_TRC_KEEP` | `ECODE_TRC_KEEP` | TRC keep tool_uses window |
| `TAUCODE_TRC_CLEAR_AT_LEAST` | `ECODE_TRC_CLEAR_AT_LEAST` | TRC clear_at_least gate |
| `TAUCODE_TRC_EXCLUDE_TOOLS` | `ECODE_TRC_EXCLUDE_TOOLS` | TRC exclude tool names |
| `TAUCODE_TRC_CLEAR_TOOL_INPUTS` | `ECODE_TRC_CLEAR_TOOL_INPUTS` | TRC clear tool inputs |
| `TAUCODE_TRC_PRESERVE_ERRORS` | `ECODE_TRC_PRESERVE_ERRORS` | TRC preserve isError results |

## Path对照表

| Canonical | Legacy (still accepted where noted) |
| --- | --- |
| `bin/taucode` | `bin/ecode` (removed; use `bin/taucode`) |
| `.taucode-agent/` | `.ecode-agent/` (launcher falls back if only legacy exists) |
| `.taucode/ledger/` | `.ecode/ledger/` (new writes use `.taucode/`) |
| `.taucode/ws-tax-probe/` | `.ecode/ws-tax-probe/` (new writes use `.taucode/`) |
| `@taucode/*` packages | `@ecode/*` (not published; scope renamed in-tree) |

## Packages

| Canonical | Former |
| --- | --- |
| `@taucode/compaction-core` | `@ecode/compaction-core` |
| `@taucode/context-pruning` | `@ecode/context-pruning` |
| `@taucode/deterministic-compaction` | `@ecode/deterministic-compaction` |
| `@taucode/frontier-pruning` | `@ecode/frontier-pruning` |
| `@taucode/experiments` | `@ecode/experiments` |

## URLs

| Canonical | Legacy |
| --- | --- |
| https://github.com/lesPrivilege/taucode | https://github.com/lesPrivilege/ecode (GitHub 301) |
| https://lesprivilege.github.io/taucode/ | https://lesprivilege.github.io/ecode/ (**404 — no auto redirect**; update bookmarks) |
