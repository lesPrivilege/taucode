# Stage Verdict — 2026-07 收束

2026-07-07，Fable。本文是 R2 → C2 → Branch B → Branch C 全链的口径收束：
每条微调机制归入「已证 / 已测未过 / 待验」三态之一，附证据指针。
本文之后，对外口径以此为准；各 run 报告降为证据附件，不再单独引用作结论。

## 一、已证有用（可入叙事，带全部限定词）

| 机制 | 主张 | 证据 |
| --- | --- | --- |
| 确定性投影 × refactor | ~1/3 成本达同等验收 + 人工盲评质量（n=3，中位，DeepSeek/pi） | `r2-verdict.md` + 盲评补记 |
| hash 时序锚点（trust protocol） | 终止确证螺旋：模型可区分自编辑与陈旧视图 | `v2-tp-wild-field-run.md`（野外验证） |
| 恒等路径纪律 | 阈值下逐字节不动 → 常驻安装零代价，小 session 免疫 | 全 fixture 体系；R16 |
| 审计/归因基础设施 | 判定门两轮拦错、预注册 placebo 成文前拦下错误归因 | R2 verdict 判定纪律；`branch-b-e1-2026-07-07.md` |

允许的叙事句式：成本轴主张（refactor 限定）+ 测量能力主张。
**不允许**：任何「修复探索类 completion」表述。

## 二、已测未过门禁（结论同样是资产）

| 机制 | 结果 | 处置 |
| --- | --- | --- |
| C'' anchor 的 completion 主张 | 被 placebo 平权（2/3 vs 3/3）；成本信号保留（E1 最便宜臂，19 turns/538k） | R14：拆分为「ritual 买 completion，content 买轨迹」 |
| C-SB 旁路摘要（现实现） | 净流违约（r3: 186 calls/158k output，0/5）；spec 违约非设计证伪 | R13：复跑先过 mock 净流账 |
| 无治理 cue（C+N） | completion 3/3 但 84 turns/3.23M（~6×） | R17：`NUDGE-GOV` 候选，不排期 |
| 负区恐惧（direct-transform） | 未复现；重读修复了保真损失 | 现探针强度下不需特殊处理；更狠探针在待验列 |
| in-band 声明税 | +80 output / +66 reasoning per turn；声明 turn 膨胀未发生（piggyback 生效） | 税数字入 R8 决策；C''' 保持校准定位 |

## 三、待验（roadmap 存量，全部有明确触发/门禁）

1. `NUDGE-GOV`：cue + 预算治理（注入上限 / pending 清空即停）——R17 候选。
2. `SWEEP-R2`：R1-C 4k/16k/64k + D1-C 4k——甜点区阈值边界。
3. 更狠负区探针：verbatim 依赖任务——dispatch policy 的 direct-transform 行。
4. C''' 校准研究：模型自知程度测量（论文轴，非产品轴）。
5. WS-6 续行注入：门禁 = WS-5 dogfooding 证据 + 持久层 retention 规则。
6. provider compaction E 臂：触发器 = cache-observable backend 暴露 compaction API（R6）。
7. 256k note 三门禁：外部数字核验、轨迹×质量第二数据点、SWEEP 曲线可读。

## 四、文档拓扑（收束后的活/冻结面）

活文档（继续维护）：

- `long-life-roadmap.md` — 队列与地平线；
- `arch-c3-design-2026-07-06.md` — 协议 spec + R1–R17 裁定记录；
- `note-256k-plateau-context-economy.md` — 叙事种子（门禁未清，不外引）;
- `evidence-index.md` — 证据指针；
- 本文 — 对外口径唯一入口。

冻结为证据（不再单独作结论引用）：全部 `reports/` run 报告、
`cowork-fable-index-2026-07-06.md`（已 closed）、R2 前的设计 note
（`note-view-based-context.md` 等，其内容已被 arch-c3 吸收）。

## 五、Scope claim

结论适用于「loop 内 context 经济学」（pi thin loop + DeepSeek 缓存遥测，
8k–48k 投影阈值）。不覆盖：frontier agent 的 loop 外 context 装配
（不可观测）、其他模型代际（校准率即能力等高线，跨模型属论文轴）、
1M 尺度外推（存在性命题的机制论证成立，数据未及）。

## 一句话

三轮实验后的诚实资产负债表：一个已证的甜点区（refactor × 投影）、
一个被拆开的假设（completion 与成本由不同成分购买）、一套拦住了
自己两次错误叙事的审计纪律——待验清单全部带门禁，没有悬空的承诺。
