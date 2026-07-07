# 失效指纹检测器 — 设计与能力矩阵（FP-1）

2026-07-08，Fable。对应 long-life-roadmap H1「golden fixtures for the known
failure classes」。目标：把 README 的失效分类学（(a) 信息缺口/理性恢复、
(b) 摘要缺陷、(c) 循环病理、(d) 确证螺旋）从叙事变成对 run JSONL 的
**确定性判定函数**——gates.ts 同款纪律：boolean + 机器可读 reasons，
不下好坏判断；参数全部显式、默认值标注 provisional（定档归人）。

定义来源（不新造语义）：

- (d) 判别器：`re_reads > 0` 且 `compacted_path_re_reads ≈ 0`
  （df0-charter.md:58-60 入档形式；note-upstream-narrative.md:23 同）。
- (a)/(b)/(c) 分诊：df0-charter.md:34-41——对 compacted-path 重读事件分诊，
  判据「重读后决策是否成功」；(c) = 反复读同一 path 无进展。
- 命名对照：README 的「信息缺口」= df0 的 (a)「理性恢复」（缺口与其
  理性响应，同一类的两面）。

## 能力矩阵（诚实声明：哪些今天就机械可判，哪些不行）

| 类 | 现 telemetry 是否足够 | v1 检测器 | 精确版还缺什么 |
| --- | --- | --- | --- |
| (a) 信息缺口 | ✓ `compacted_path_re_reads` 序列 | **完整**：gap turn 定位 + 计数 | — |
| (b) 摘要缺陷 | ✗ 无失败编辑/决策结果字段 | **接口 + signal-absent**：仅当未来行含 `failed_edit_calls` / `failed_edits_on_compacted_paths` 时触发判定，否则显式报 signal 缺席 | schema 增量（只增不改）：per-turn 失败编辑计数。v3-ws 分支 ledger 已有 failed-edit 语义，接线是后续 packet |
| (c) 循环病理 | △ 只有 turn 级聚合 | **近似（标注 PROXY）**：连续 K turn 全部 read 均为 re-read（K provisional=4） | per-read path 事件（同 path 重复计数）+ 进展判据；分类学此格野外零观测（note-upstream-narrative.md:68），golden 只能合成 |
| (d) 确证螺旋 | ✓ 怀疑型重读结构 + cache 序列 | **完整核心**：doubt_re_reads ≥ N（provisional=3）∧ cp 占比 ≤ ε（provisional=0.1）；佐证信号（窗口 CH%、reasoning）只作注记不作门条件 | `reasoning_tokens` 在现 corpus 全缺席（字段在 schema、真实 run 未填）——注记降级 |

**结构性空真标注**：A 臂（无压缩机制）下 `compacted_path_re_reads = 0`
是构造使然，(d) 的「非信息缺口」条件退化。检测器读 meta.mechanism，
机制不在位时 (d) 结果携带 `vacuous_baseline` 注记——触发照报，语义由
消费方（人）分辨。这不是免责条款，是防误读的机器可读语境。

## 触发语义

检测器是**筛查器不是裁决**：triggered = 该行为指纹在此 run 出现，
不等于 run 失败、不等于机制有害。(a) 在 D1 类任务上大量出现且被
stage-verdict 判为「重读修复保真损失」的正常代价——正因如此 reasons
只报数字与 turn 位置。

## 参数（全部 provisional，定档待人裁）

```
loopStreakMin      = 4     // (c) 连续全重读 turn 数下限
spiralDoubtMin     = 3     // (d) 怀疑型重读总数下限
spiralCpShareMax   = 0.1   // (d) cp 重读占全部重读比例上限（≈0 的量化）
```

依据（可推翻）：真实 corpus 53 个 run 扫描下，(d) 默认档位命中约 1/4
（含空真基线臂），教科书样本（G2-D1-D：31 重读/0 cp/16 怀疑 turn）
显著高于阈值一个量级；(c) 档位=4 时命中集中在 D1 类高强度重读 run。
**判定门/报告不得在参数定档前引用检测器结果作结论**（判权纪律）。

## 实现位

- `experiments/lib/fingerprints.ts`：纯函数。tolerant turn 序列提取
  （复用 read-run.ts 的 readJsonl；不改动 read-run.ts 既有导出）；
  四个 `fingerprint*()` + `fingerprintRun(path)` 汇总入口。
- `experiments/test/fingerprints.test.ts`：合成边界用例 + golden 断言。
- `experiments/test/fixtures/fingerprints/`：真实 run 原样拷贝（带
  `# source:` 溯源注释行），选样由 corpus 扫描给出而非叙事记忆：
  - (a) 正样本：`r2-core/10-r2-G2-D1-C.jsonl`（cp 重读 22，gap turn 16，C 臂在位）
  - (d) 正样本：`g2-round1/G2-D1-D.jsonl`（重读 31、cp 0、怀疑 turn 16，D 臂在位）
  - (d) 空真语境样本：`r2-core/03-r1-G2-D1-A.jsonl`（A 臂，重读 32/cp 0——
    触发但携带 vacuous_baseline）
  - 阴性样本：`r2-core/08-r1-G2-R1-C.jsonl`（重读 1、cp 0，安静 run）
  - (c) 无真实 golden（野外零观测），合成用例覆盖；真实高 streak run
    （`20-r3-G2-D1-D` streak=14）作 PROXY 触发样本入册，分诊未证注明。

## 禁区

- 不改 run JSONL schema 既有字段（(b) 所需字段为**增量提案**，本 packet
  不接线生产端）；不碰 pi/；不碰 compaction-core 算法；
- 检测器输出不进任何现有报告/verdict 文档——先过参数定档，再谈引用。

## 验收

- vitest 全绿（既有 9 个测试文件不回归 + 新 fingerprints.test.ts）；
- 四类各有：触发正例、不触发反例、边界例（参数±1）；(b) 有 signal-absent
  例与字段在场触发例；(d) 有 vacuous_baseline 注记例；
- golden fixtures 直读文件断言，与上表数字逐项一致；
- 全部真实 corpus 跑通不抛错（53 run 冒烟）。
