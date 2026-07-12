# Compaction / Summarization Strategy Research

2026-07-06. R2 has finished. This note updates the earlier landscape with real
taucode data and current provider/harness practice. It answers five questions:
what mainstream strategies exist, what taucode built, what R2 showed, where the
boundaries are, and what to validate next.

## Executive Take

Server-side compaction has become the frontier default for long-running agents.
Anthropic, OpenAI, and xAI now expose API/server-side compaction paths; agent
frameworks also ship client-side pruning, sliding-window, and LLM-summary
strategies. The industry direction is clear: context management is no longer a
nice-to-have harness hack, it is a first-class runtime feature.

taucode's contribution is different: it is not "another summary." It is a
deterministic, send-time projection strategy for an ecosystem without
server-side compaction but with observable prefix-cache economics. It keeps
provenance mechanically checkable with path/hash/diffstat evidence and measures
the trade-off against DeepSeek cache hits.

R2 gives the first clean local answer:

- Refactor / code-production heavy work: deterministic projection wins. R1-C
  reached comparable static acceptance and human-reviewed artifact quality at
  about one third of A's median cost.
- Exploration: deterministic projection alone does not win. C was cost-neutral
  vs A and completion was unstable.
- Hybrid checkpoint: buys exploration completion rate, not cost. E1-D is the
  cleanest completion signal but costs more.
- Native LLM summary is a real competitor. B' was strong on E1 cost and decent
  on completion, but less controllable on small direct-transform tasks because
  trigger semantics depend on context-window pressure.

## Mainstream Strategy Map

| Strategy | Mechanism | Strength | Failure Mode | Where It Shows Up |
| --- | --- | --- | --- | --- |
| Server-side compaction | Provider summarizes/compacts old context under a provider-managed contract | Low integration, cache/runtime can be handled inside provider | Opaque to downstream; hard to audit exactly what was kept | Anthropic, OpenAI, xAI |
| Standalone compaction endpoint | Client sends a context window to a compact API and gets a compacted state/item | Explicit control point; useful for stateless agents | Still provider-specific and often opaque/encrypted | OpenAI `/responses/compact`, xAI SDK/API |
| LLM summarization | Ask a model to summarize older messages into prose or structured state | Can preserve task semantics and intent | Costly, non-deterministic, can drop paths/errors/signatures | pi native, Microsoft/Semantic Kernel style reducers, many agents |
| Structured / anchored summary | Maintains sectioned state: intent, files, decisions, pending tasks | Better "continue the task" retention than plain summaries | Still an LLM-generated artifact unless generated deterministically | Factory evaluation, Claude Code-style session state patterns |
| Tool-result clearing / pruning | Remove or replace old tool outputs while keeping recent turns | Cheap, predictable, avoids giant stale results | Can destroy prefix cache at the edit point; may lose latent detail | Anthropic context editing, Claude context engineering guidance |
| Sliding window / truncation | Drop oldest messages or keep a fixed recent window | Simple and robust against overflow | Loses early constraints and hidden dependencies | ADK/Microsoft-style framework primitives |
| External memory | Move durable state to files, vector DB, graph, or session store | Separates working context from long-term facts | Retrieval policy becomes the hard problem | Agent memory systems, project-state files |
| Deterministic extractive projection | Replace large known structures with deterministic summaries, keep path/hash/head-tail evidence | Reproducible, cheap, auditable, cache-aware | Weak on implicit work semantics unless anchors/checkpoints fill the gap | taucode C arm |

## What taucode Built

taucode built four comparable arms in the same pi harness:

- **A baseline**: no compaction.
- **B / B' native LLM summary**: pi native summarization, with B' using a
  comparable 48k context window.
- **C deterministic projection**: seam-A send-time projection. It summarizes
  read/tool results and code-production payloads deterministically, keeps recent
  turns, and never mutates session history.
- **D hybrid checkpoint**: seam-A plus seam-B checkpoint, replacing native
  compaction with a deterministic persisted checkpoint when pi's native trigger
  fires.

The extension also added mechanisms that are not standard in most provider
compaction docs:

- **Provenance ledger**: read/edit views carry hashes and turns.
- **Stale-view hints**: when a compacted/read view predates an edit, the model
  sees a mechanical tail hint.
- **Artifact retention**: each run keeps outputs, diffs, command logs, and
  reviewable evidence.
- **Cache telemetry**: DeepSeek `cacheRead` lets the harness measure the real
  uncached/cached cost trade-off.
- **Semantic anchor flag**: V3-WS can inject deterministic work-state anchors,
  intended as a cheaper substitute for D's persisted checkpoint.

This places taucode between provider compaction and ordinary client summaries:
it is client-side like an agent framework, but it aims for provider-contract
properties: byte stability, deterministic reconstruction, and measurable cache
transition behavior.

## What R2 Showed

R2 data source: `docs/reports/r2-verdict.md`.

**R1 / refactor-code-production**

- A median cost: 1342.
- C median cost: 449.
- C static acceptance: 4/4 x3.
- Human artifact review: all R1-C outputs passed tests; r3 had both the lowest
  cost and best code quality.

Interpretation: code-production creates large structured payloads that are safe
to compact extractively. The thing being compressed is mostly work product,
not tacit task intent.

**E1 / exploration**

- A median cost: 1527.
- C median cost: 1616.
- B' median cost: 1287.
- D median cost: 2445.
- D completion: 5/5 x3 in round 2, and 6/6 across both rounds.

Interpretation: exploration needs progress semantics. Pure extractive compaction
does not reliably preserve "where am I in the map?" D helps because the persisted
checkpoint supplies a progress anchor. V3-WS should test whether deterministic
semantic anchors can buy the same completion stability without D's LLM/native
trigger cost profile.

**D1 / direct-transform negative probe**

- C median cost: 214 vs A 250.
- Static acceptance: 4/4 x3.
- B' valid trigger rate: 1/3.

Interpretation: the old fear that direct-transform tasks would be harmed by
projection did not reproduce at this probe strength. This is not proof of safety;
it means the negative probe is too easy or the deterministic summaries are
faithful enough at this scale.

## Boundaries

1. **n=3 is directional, not statistical.** R2 supports strategy selection and
   next experiments, not universal claims.

2. **Single model / single harness.** The result is DeepSeek v4-flash through pi.
   Other models may react differently to extractive summaries, checkpoints, and
   stale-view hints.

3. **Static acceptance is not full quality.** R1-C got artifact review, but the
   rest of the matrix still leans on static checks plus run metadata.

4. **Exploration remains unresolved.** C does not currently beat A/B' on E1.
   D buys completion with cost. C'' is the actual next hypothesis.

5. **Server-side compaction changes the comparison.** If DeepSeek or another
   cache-observable backend exposes provider compaction, taucode should compare it
   as a new arm instead of assuming the client-side rule remains best.

6. **Opaque compaction is hard to audit.** OpenAI/xAI-style compact items may be
   operationally excellent but limit downstream evidence. taucode's artifact and
   provenance discipline is strongest where the client can inspect what survived.

7. **Cache trade-off is workload-shaped.** Anthropic's context editing docs
   explicitly note cache invalidation trade-offs for clearing. R2 confirms the
   important question is not request size alone but total task cost after cache
   dip, recovery, re-reads, and trajectory length.

8. **The ~256K effective-window plateau is landscape support, pending
   verification.** Mainstream coding agents hold effective context near
   200K–272K despite larger advertised windows (context rot, compaction
   headroom, cost). This validates the problem taucode addresses — context as a
   managed budget — and suggests a third term in the cost inequality: held raw
   bytes degrade reasoning quality even when they fit. Argument structure and
   evidence gates: `docs/note-256k-plateau-context-economy.md`. External
   numbers unverified; not yet citable in public narrative.

## Next Validation Plan

### 1. Sweep C Where It Already Wins

Run the approved six-run sweep:

- R1-C at 4k / 16k / 64k.
- D1-C at 4k.

Question: where is the optimal projection threshold, and does a lower threshold
finally expose direct-transform harm?

Decision changed by this: default `compact-after` for code-production workloads.

### 2. Test C'' On E1

Run E1 with `TAUCODE_SEMANTIC_ANCHOR=1` and compare against R2 A/B'/C/D.

Question: can deterministic work anchors recover D-like completion without D's
checkpoint cost?

Success condition: E1 static completion approaches D, while cost stays closer to
C/B' than D.

### 3. Add Stronger Negative Probes

Design direct-transform packets where exact old text matters after multiple
projection events:

- line-cited edits after repeated reads;
- rename/refactor tasks where old signatures become traps;
- tasks requiring exact diagnostics or literal generated strings.

Question: where does extractive compaction start to harm verbatim dependence?

Decision changed by this: dispatch policy for `direct-transform`.

### 4. Compare Provider Compaction If Available

If a cache-observable provider exposes server-side compaction, add an E arm:

- E = provider server-side compaction, no taucode projection.
- E' = provider compaction + taucode provenance/telemetry only.

Question: does provider compaction dominate client deterministic projection on
cost, completion, and cache recovery?

Decision changed by this: whether taucode remains a compaction mechanism or becomes
mainly an evaluation/provenance harness.

### 5. Make Audit Boring

Before the next public claim, add a one-command audit that checks:

- JSONL schema;
- provider errors;
- env flags;
- manifestHash equality;
- acceptance rows;
- artifact directory completeness;
- cache signal presence;
- command-check logs.

Question: can every report number be mechanically traced to artifacts?

Decision changed by this: whether release-path claims are ready to publish.

## Source Notes

Official/provider sources:

- Anthropic compaction: https://platform.claude.com/docs/en/build-with-claude/compaction
- Anthropic context engineering / tool clearing / memory:
  https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- Anthropic context editing and prompt caching:
  https://platform.claude.com/docs/en/build-with-claude/context-editing
- OpenAI compaction guide:
  https://developers.openai.com/api/docs/guides/compaction
- OpenAI compact endpoint:
  https://developers.openai.com/api/reference/resources/responses/methods/compact/
- xAI context compaction:
  https://docs.x.ai/developers/advanced-api-usage/context-compaction
- DeepSeek context caching:
  https://api-docs.deepseek.com/guides/kv_cache
- DeepSeek pricing / cache-hit vs miss prices:
  https://api-docs.deepseek.com/quick_start/pricing
- Google ADK context compaction:
  https://adk.dev/context/compaction/
- Microsoft Agent Framework compaction:
  https://learn.microsoft.com/en-us/agent-framework/agents/conversations/compaction
- Factory context compression evaluation:
  https://docs.factory.ai/guides/power-user/evaluating-context-compression

Local taucode sources:

- R2 verdict: `docs/reports/r2-verdict.md`
- R2 turn interaction retro: `docs/reports/r2-turn-interaction-retro-2026-07-06.md`
- LLM-declared work semantics / view-based context:
  `docs/reports/llm-declared-work-semantics-2026-07-06.md`
- Extension architecture / work-semantics decoupling:
  `docs/reports/extension-work-semantics-architecture-2026-07-06.md`
- ARCH-C''' design outcome, including C-SB, provider-unit accounting,
  declaration-tax probe, and persistent ledger:
  `docs/arch-c3-design-2026-07-06.md`
- Fable cowork handoff:
  `docs/cowork-fable-index-2026-07-06.md`
- Earlier landscape: `docs/note-landscape-compaction.md`
- Long-life roadmap: `docs/long-life-roadmap.md`
- Evidence index: `docs/evidence-index.md`

## One Sentence

Mainstream compaction is moving provider-side and summary-heavy; taucode's niche is
the measurable client-side alternative for cache-observable systems: deterministic
forgetting with provenance, artifacts, and task-type dispatch.
