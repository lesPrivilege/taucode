# Upstream 对话草稿 — 三个 pi issue + DeepSeek ask

2026-07-08，Fable 组装。状态：**草稿，未外发**。外发是判权动作：逐字过目、
定渠道、定时点均归人。对应 long-life-roadmap 待做 17（UPSTREAM-ISSUES）与
H4 provider 诉求。每条都对现版 pi 源码重新核证过（2026-07 fork，
ee24a9e）；候选清单相对 H0 的变动见文末「退役候选」。

纪律提醒：issue 文本只含可核验事实与窄 ask，不含节省率数字、不提
本 repo 未证的结论。发布时把相对路径换成 repo 固定链接（main 或
commit-pinned）。

---

## Issue 1 — Extension API: no settings write-back, so runtime tuning cannot persist

**To**: badlogic/pi-mono · **Label 建议**: enhancement

> **Summary.** Extensions can register commands that tune their own behaviour at
> runtime, but the extension API exposes no way to persist a setting. Config is
> read once at extension-factory time, and the `<cwd>/.pi/settings.json` writer
> is off by default — so any `/mycmd set …` command is session-local by
> construction, and the tuned values silently reset on the next process start.
>
> **Where we hit it.** We maintain a compaction extension with runtime tuning
> commands (`/compaction set keep-recent=N`, `set compact-after=N`). After a
> genuine restart the parameters reset to env defaults. Root cause traced in our
> report (tuning.ts reads config at factory time; no write surface on
> `ExtensionAPI`; settings writer default-off).
>
> **Ask (narrow).** Either (a) expose a minimal write surface on `ExtensionAPI`
> (e.g. `pi.settings.set(key, value)` scoped to an extension namespace in
> `.pi/settings.json`), or (b) document the intended pattern for extensions that
> want persistent settings, if one exists.
>
> **Non-goals.** Not asking for hot-reload of extension code, nor for global
> settings mutation outside the extension's own namespace.

证据：`docs/reports/launcher-interactive-2026-07-05.md`（DF2 persistence
ceiling — confirmed + root-caused 节）；行为在 2026-07 fork 复核仍成立。

---

## Issue 2 — read tool: optional structured result metadata (path + content hash) for provenance

**To**: badlogic/pi-mono · **Label 建议**: enhancement

> **Summary.** `read` results are plain text — no path prefix, no content hash
> (the path exists only in the paired toolCall's arguments). Context-management
> extensions that need provenance (e.g. "this view of file X is older than your
> edit at turn N" trust hints) must reconstruct identity by re-parsing toolCall
> args and hashing the result text themselves. That works, but the linkage is
> convention, not contract: any transform that rewrites result text silently
> breaks it.
>
> **Ask (narrow).** An optional structured metadata field on tool results —
> `{path, contentHash}` for file-backed tools — populated by the built-in
> `read`/`edit` tools. Additive: renderers and models that ignore it see today's
> behaviour.
>
> **Why it generalises.** Any extension doing compaction, staleness hints, or
> file-view accounting needs the same triple (path, hash, turn). One structured
> field makes provenance verifiable instead of inferred, for the whole extension
> ecosystem.
>
> **Non-goals.** No change to the rendered text the model sees by default; no
> hashline injection into content.

证据：`docs/g0-survey.md` Item 1（read 结果无 path/hash 结构，
file:line 引用在案）；我们的降级路径实现
`extensions/deterministic-compaction/`（从 toolCall args 取 path、对
result text 现算 hash）。信任协议的野外验证
`docs/reports/v2-tp-wild-field-run.md` 说明这个三元组实际购买什么。

---

## Issue 3 — session_before_compact: hook-provided compactions are excluded from later file-op extraction (`fromHook`) — document or flag

**To**: badlogic/pi-mono · **Label 建议**: docs / question

> **Summary.** When an extension returns `{compaction}` from
> `session_before_compact`, the entry is stored with `fromHook: true`. On the
> NEXT native compaction, `extractFileOperations()` skips file-op extraction
> from that entry's details (`if (!prevCompaction.fromHook && …)`), so
> read/modified-file continuity carried in `details` silently stops flowing
> through hook-provided checkpoints.
>
> **Consequence for extension authors.** A hook-provided compaction summary must
> be fully self-contained; if it relies on pi's file-op carry-forward the way
> native summaries do, that information is dropped one compaction later — with
> no warning.
>
> **Ask (narrow).** Either document this contract in the extension docs
> ("hook compactions: include your own file-op state; pi will not extract it"),
> or extract file-ops from hook entries when their `details` shape matches the
> native one. Documentation alone fully resolves this.
>
> **Non-goals.** Not proposing changes to native compaction behaviour.

证据：pi `packages/coding-agent/src/core/compaction/compaction.ts`
`extractFileOperations()` 的 `!prevCompaction.fromHook` 分支（2026-07 fork
仍在，行号以发布时源码为准）；我们 seam-B checkpoint 的自含设计因此而来
（GOALS.md G1b 任务 3 注记）。

---

## DeepSeek ask — cache 命中边界诊断（一个字段）

**渠道候选**：DeepSeek 开发者社区 / API feedback。中文为主，附英文摘要。

> 你们的 `prompt_cache_hit_tokens` 是我们整个实验管线可行的前提——它让
> 下游第一次能对账「预期 cache transition 曲线 vs 实测」。同类接口里
> 这不是标配，值得说明。
>
> **诉求（窄）**：cache 命中的**边界诊断**——本次请求前缀在第几个 token
> 断的（或 cached span 的标识）。现在下游只能从 hit 比例反推断点位置；
> 加一个字段，所有 harness 的 cache 调试从反推变成工程。
>
> **顺带**：我们的确定性投影实验显示压缩区可以重新字节稳定（transition
> 后 ~10 turn 恢复稳态）。若压缩发生在 cache 契约之内（server 端），
> transition 成本直接归零——参照系已有（Anthropic 2026-01 的 server-side
> compaction）。DeepSeek 的价差结构下这件事杠杆更大。
>
> *(EN summary: `prompt_cache_hit_tokens` is what makes client-side cache
> accounting possible at all — thank you. Narrow ask: expose WHERE the prefix
> match broke (offset or cached-span id), turning cache debugging from
> inference into engineering. Side note: our deterministic-projection data
> shows compacted regions re-stabilise byte-wise; server-side compaction
> inside the cache contract would zero the transition cost.)*

证据：`docs/g0-survey.md` Item 5（字段透传 file:line）、
`docs/note-upstream-narrative.md`「对 DeepSeek 的具体话」、
`docs/reports/r2-verdict.md`（transition 曲线观测）。

---

## 退役候选（相对 H0 清单的变动，防重提）

- **「cache diagnostics」作为 pi issue**：对现版源码不成立——footer 已
  聚合并渲染 cacheRead 与命中率（`footer.ts` totalCacheRead /
  latestCacheHitRate），session stats 亦含 cacheRead 汇总
  （`agent-session.ts` tokens.cacheRead）。按 DRIFT 纪律退役；cache
  边界诊断的真实缺口在 provider 侧（见 DeepSeek ask）。
- **MCP 支持缺失**：真实缺口（源码无 MCP client），但 ask 范围过大不符
  「窄 issue」纪律，且 roadmap D3 已计划以 extension bridge 自解。不提。
