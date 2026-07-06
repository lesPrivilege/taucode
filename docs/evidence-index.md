# 证据索引 — DeepSeek Agent Harness PM 申请随附

2026-07-06。用法:每条 JD 要求 → 本 repo 内可核验的证据(文件/数据/
commit 历史)。不做自我评价,只指路;审阅者可在 repo 内逐条复核。
随附三份:《确定性 compaction 的一次实作记录》(essay,自然语言)、
《面向上游的项目叙事》(upstream-narrative)、《R2 终判》(r2-verdict,数据)。

## 职责对映

**职责 5(与模型训练团队共同进化模型与 harness)——本项目的中心命题。**
- 理论:working paper《外化天花板与跨层 cache 契约》——「上游做 harness
  拿三笔:训练信号、能力等高线、跨层 cache 契约」;
- 实证打包:`docs/note-upstream-narrative.md`——失效分类学((a)信息缺口/
  (b)摘要缺陷/(c)循环病理/(d)确证螺旋,各带机械判别指纹)作为 RL 可
  消费信号;校准指标(声明可弃但重读率)作为能力等高线测点;
- 给 DeepSeek 的具体 ask 示例:cache 命中边界诊断(一个字段的事)。

**职责 2(定义与衡量「Agent 是否真的帮到人」的指标)**
- 判定门代码化:invalid/suspicious 自动标记(`experiments/lib/gates.ts`,
  带 fixture 测试)——round 1 靠它拦下一半无效 run,round 2 靠它撤回
  一个方向性错误结论(turn 膨胀 = n=1 方差,`r2-verdict.md` 裁定 1);
- 完成率作为一等指标:E1-D 两轮 6/6 完成 vs 成本溢价的 trade-off
  被显式度量,而非只看 token。

**职责 3(真实场景任务跟踪)**
- 45+ 真实 DeepSeek run,全部 JSONL + artifact 留存
  (`experiments/results/`),ambient telemetry 常开;
- DF0 章程(`docs/df0-charter.md`):野生观察 → 分诊模板 → 受控实验的
  完整管线,含两次污染数据的诚实隔离记录。

## 任职要求对映

**要求 6(KV Cache / Agent Loop / Tool Use / Context / Harness
Engineering 第一手)**
- Cache transition 曲线首次受控观测(dip → ~10 turn byte-stable 恢复,
  含 checkpoint CH=0 全清事件)——经 Grok 核证为公开领域空白
  (`docs/note-landscape-compaction.md` 战略发现 1);
- 信任协议(hash 溯源 stale-view hint)野外验证:模型据时序锚点停止
  自证螺旋、按 hash 区分自编辑/跨文件编辑(`v2-tp-wild-field-run.md`);
- 全套机制:纯函数投影、门控、语义锚点、TUI 观测面
  (`extensions/deterministic-compaction/`,137 单测)。

**要求 7(系统性数据方法 + 统计严谨)**
- 四臂配对(A 基线/B' native/C 确定性/D hybrid)× 3 packet × n=3,
  臂序逐 repeat 随机 + 全局交错(防 provider 时段偏置),快照
  manifestHash 保证四臂字节一致起点;
- gate-release 预算(preflight → core → add-on → sweep),防无效
  结构批量复制;中位数报告 + 显式拒绝显著性过度宣称
  (`r2-verdict.md` 诚实边界节)。

**要求 8(异常分支、边界条件、失败场景嗅觉)**
- 负区探针是设计进实验的(D1,故意构造精确原文依赖);
- 两份如实 FAIL/blocked 报告(`df-tui-acceptance`、round 1 污染隔离);
- L3 硬区违规的捕获-回滚-固化为围栏条款全记录(`loop-protocol.md`);
- 监工自身被 LLM-summary 压缩击中的第一方样本 + 恢复协议。

**要求 4(Agent 产品高强度用户)**
- 本项目工作方式即答卷:Cowork(裁决)+ Claude Code(核心实现)+
  Codex(执行/验收)+ Grok(调研核证)+ DeepSeek(被试与日常),
  多 agent 分工协议成文并经两次事故修订(`loop-protocol.md`);
- 产物审计在 ecode 自身内完成(投影 67%、CH 98.1% 同屏)——工具自证。

**要求 3(vibe coding)**:全 repo 代码由 agent 按 packet TDD 写成,
packet(spec 即 prompt)全部在 `GOALS.md` 可查——含验收与修订史。

## 加分项对映与诚实缺口

- **小团队主导产品路线**:GOALS.md 从切分到验收的完整决策轨迹。
- **与研究员深度协作**:**缺口,如实声明**——目前是纸面推演(论文 +
  narrative);upstream-narrative 即「我会怎么开始这件事」的答案。
- **开源社区**:pi 上游零 diff 纪律 + settings 持久化边界发现
  (已标记为候选 issue);未有提交记录,同为待补。

## 一句话

这份索引里没有一个数字不能在 repo 里复算,没有一个失败被藏起来。
判断力的证据不是结论,是结论被修正的过程——两轮实验推翻了自己
round 1 的主要发现,这个修正记录完整在案。

## 最新续行入口

- R2 turn 级复盘: `docs/reports/r2-turn-interaction-retro-2026-07-06.md`
- LLM 声明工作语义设计: `docs/reports/llm-declared-work-semantics-2026-07-06.md`
- extension 解耦改造评估:
  `docs/reports/extension-work-semantics-architecture-2026-07-06.md`
- Fable 设计包 outcome: `docs/arch-c3-design-2026-07-06.md`
  (含 R10 declaration tax probe、R11 持久 hash-addressed ledger 裁定)
- Fable cowork index: `docs/cowork-fable-index-2026-07-06.md`
