# Launcher Test Report — 2026-07-05

Source: `docs/launcher-test-checklist.md`, executed by a dispatched Code-session
(Opus) agent, terminal-driven (real commands, real output — not code review).
Dispatcher (this session) independently re-verified the highest-stakes items
directly against the filesystem after the run; those are marked **[dispatcher-verified]**.

Environment: macOS (Darwin 25.5.0), node v25.9.0, pi v0.80.3, native (not
sandboxed). No provider keys in shell env at test time.

## Pre-flight

- `bin/ecode` was already clean in git — the routing-logic commit a prior
  sandboxed session couldn't land (permission-restricted there) had already
  been committed here as `9f6a1d4`. Nothing pending.
- `pi/packages/coding-agent/dist/cli.js` present pre-test. **[dispatcher-verified:**
  681 bytes, mtime `Jul 5 10:55` — the original G0 build, unchanged.**]**

## Results (10/10 concluded — verification-checkpoint condition 1 met)

| # | Result | Real output excerpt |
| --- | --- | --- |
| T1 | **PASS** | `dist/cli.js` moved aside → `ecode: pi CLI not built. Run: (...)` on stderr, exit 1, no crash. Restored after. **[dispatcher-verified: cli.js back at 681 bytes / original mtime — the move-and-restore left no residue.]** |
| T2 | **PASS** | Fresh scaffold created `.ecode-agent/extensions/deterministic-compaction` → correct realpath. pi started, `0.80.3`, exit 0. |
| T3 | **PASS** | Two stderr lines (checked-vars + profile path) printed; pi then hit its own undefined no-key/no-model behavior (defaults to `google`, `No API key found`) — known boundary, recorded not failed. |
| T4 | **PASS** | `DEEPSEEK_API_KEY=x` → `routing -> deepseek`, then real DeepSeek 401: `{"message":"Authentication Fails, Your api key: x is invalid",...}` — proves the route and model reached DeepSeek's real endpoint. |
| T5 | **PASS** | `--model anthropic/claude-sonnet-4` → zero routing/no-key lines, confirmed with and without a fake key present, and for the `--model=foo` equals-form. |
| T6 | **PASS** | `ECODE_DEFAULT_MODEL=deepseek/deepseek-v4-pro` + fake key present → 0 routing lines, prompt hit DeepSeek with the **pro** model (401) — value flows through as `--model`, correctly takes priority over key-detection. |
| T7 | **PASS** | `export DEEPSEEK_API_KEY=x` written to `.ecode-agent/env`, shell key unset → still routed + hit DeepSeek (file was sourced). `.ecode-agent/env` confirmed `git check-ignore`'d. |
| T8 | **PASS** | Ambient JSONL count in `experiments/results/ambient/` went 5→6 on a fresh `ecode -p` run; newest file a valid `g1c-ambient` session record. **[dispatcher-verified: directory holds 7 files post-test, consistent with continued accumulation; command names cross-checked directly in source — see Finding 1 below.]** |
| T9 | **SKIP** | No real `DEEPSEEK_API_KEY` or `MIMO_API_KEY`+`MIMO_BASE_URL` present (presence-checked only, values never read). Correctly not fabricated. |
| T10 | **PASS** | `~/.pi/` — full recursive `stat` listing (mtime+size+path), 557 entries, identical sha256 before/after all runs. Only read-only `stat` touched `~/.pi/`. |

**0 FAIL.**

## Known-boundary item (the actionable one)

`getModels("deepseek")` was checked live (`--list-models deepseek`): returns
`deepseek-v4-flash` and `deepseek-v4-pro`, both 1M context. The hardcoded
default in `bin/ecode` (`deepseek/deepseek-v4-flash`) **matches** — no script
edit needed. (This also cross-confirms the 1.0M context-window figure seen
earlier in the interactive footer test.)

## Fix-forward (already committed, one commit each)

- `bad552b` — added the test checklist itself (was untracked from the prior session).
- This report's own commit (below) also corrects one checklist wording error
  directly, per the loop-protocol's fix-forward criteria (doc states a fact
  that doesn't match real testing, no design decision involved): T8/T9
  referenced `/compaction status`, but the actual registered command is
  `/compact-status` (a separate command from the `compaction` family — see
  Finding 1). No other fix-forward candidates found; the deepseek default
  needed no change (see above).

## Findings worth archiving

**Finding 1 — the pre-existing `.ecode-agent/` had a dangling extension symlink, meaning the earlier live interactive test almost certainly ran without the extension loaded.**
Before this test run, `.ecode-agent/extensions/deterministic-compaction`
pointed at `/sessions/sleepy-clever-hawking/mnt/ecode/extensions/deterministic-compaction`
(a sandbox-internal path that does not exist on this native Mac) — confirmed
dangling by the dispatcher directly before this test dispatch. T2's fresh
scaffold (triggered because the *directory* didn't exist, not because the
*symlink* was broken) created a correct symlink pointing at the real native
path. **Consequence: the earlier interactive smoke test (the "read GOALS.md"
summary + the `CH95.4%` cache-hit footer reading) almost certainly ran with
pi's DeepSeek connection working but the ecode extension NOT loaded** — that
data is real and valid for DeepSeek's own native prompt caching, but it does
not demonstrate the deterministic-compaction extension itself was active.
T8 (ambient telemetry counter incrementing, verified against a symlink now
confirmed correct) is the first real proof the extension loads on this
machine. Also: the scaffold guard is `[[ ! -d "$AGENT_DIR/extensions" ]]` —
it will not self-heal a broken symlink if the directory already exists, only
a full absence re-triggers it. Anyone reusing a `.ecode-agent/` carried over
from a sandboxed session should re-scaffold rather than assume it's fine.

**Finding 2 — checklist wording bug, fixed forward (see above).** `/compaction`
only has `on|off` / `set keep-recent=N|compact-after=N` / `telemetry on|off`
(extension.ts:330). Status/diff/report are the separate `compact-status`,
`compact-diff`, `compact-report` commands (observability.ts:293/301/309).

**Finding 3 — non-interactive testing coverage gap (not a launcher fault).**
`-p`/`--print` only processes a model prompt; slash commands and TUI footer
rendering aren't exercisable through it. Extension *load* is verifiable
indirectly (ambient telemetry firing), but slash-command *behavior* and
footer output need either a real interactive session or a TUI-driving
harness neither of which exists yet.

## Log-only items (unresolved — for Cowork's retrospective ruling)

| Phenomenon | Why not fix-forward | Suggested options |
| --- | --- | --- |
| Ambient JSONL accumulates one file per `ecode` invocation, unbounded (7 files after this test session alone) | Retention/rotation policy is a design decision, not a bug | (a) cap by count/age, (b) roll into dated per-day files, (c) leave as-is for now and revisit after a week of real DF0 volume data |
| `ecode --help` / `--version` still print the "no provider key detected" stderr nag, since routing-skip only checks for `--model` | Touches routing-strategy logic (which flags should suppress the routing branch) — borderline, protocol says default to log-only when unsure | (a) extend the skip condition to informational flags, (b) leave as a cosmetic non-issue |
| No-op `ecode -p "OK"` wall time ~1.5s (0.78s user) | Pure performance number — protocol: record raw, don't judge | Only worth acting on if it becomes a friction point during actual DF0 daily use |
| Unexplained `bin/` subdirectory inside `.ecode-agent/` (present in the original scaffold, origin unclear, harmless) | Cause unknown; not worth guessing at a fix | Note only; investigate if it recurs or grows |
| T3's undefined pi no-key/no-model behavior (falls back to `google`, then fails on missing credentials for that provider) | Explicitly a named known-boundary, not ecode's contract to define | None needed — already the checklist's own stated boundary |

## Handoff

- Report: this file.
- Fix-forward commits: `bad552b` (checklist added) + this report's commit (checklist wording fix) — `git log --oneline bad552b..HEAD` at merge time.
- Log-only items: table above, none blocking.
- Verification-checkpoint condition met: **1 (all 10 items concluded)**.

---

## Cowork 复盘裁决（2026-07-05，Fable）

**Log-only 逐条**：

1. ambient JSONL 无界累积 → **(c)，带日期重审**：retention 设计在拿到 DF0
   一周真实量级前是拍脑袋；DF0 复盘时用实际文件数/体积定 (a) 或 (b)。
   唯一硬约束（不出本机、gitignored）已满足。
2. `--help`/`--version` 触发路由 stderr → **裁 (a)**：informational flags
   加入 skip 条件。裁决已下，降级为 fix-forward，下轮顺手改。
3. 启动 ~1.5s → **只记录**。DF0 期间成为体感摩擦再议。
4. `.ecode-agent/bin/` 来源不明 → **只记录**，复现或增长再查。
5. T3 pi 无 key 回落 google → **不做**，上游行为，非 ecode 契约。

**Finding 归档**：

- Finding 1 → 两个动作：① launcher 已改为每次启动幂等重链（自愈，
  见 fix commit），守卫类 scaffold 无法修复悬空 symlink 这一课记入实证；
  ② **数据修正**：此前 interactive smoke 的 `CH95.4%` cache 读数验证的是
  pi+DeepSeek 原生链路，**不含** extension——该数据点降级为「DeepSeek 原生
  cache 有效」的证据，不得引用为 extension 效果。跨环境（沙箱→native）
  symlink 漂移本身是墙三（验证基础设施折旧）的微型样本。
- Finding 3 → 覆盖缺口成立：slash-command 行为与 footer 渲染需要真 interactive
  session 验证，纳入下轮验证节点。

**下一轮 loop 定义**：

- 目标：T9 补测（真 key 全链路）+ interactive 会话验证 extension 行为
  （`/compact-status` 门控读数、触发标记线、`/compaction set` 生效）。
- 验证节点：T9 PASS 且 interactive 三项有实测记录；或 log-only 级阻塞。
- 其后即 DF0 起点（日常使用一周）与 G2 round 1（快照构建 + 12 run）。
