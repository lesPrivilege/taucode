# Note — 发布路径种子（等 G2/round-2 数据细化）

2026-07-05。状态:种子。两条路径为先后关系,顺序由证据状态决定。

## 路径 A · 解耦插件（地板,随时可发）

compaction-core 零依赖纯函数包 + adapter 集（pi extension 为第一个）。
G1a 架构的既有属性,无需新决策。发布物:`@taucode/compaction-core` +
`extensions/deterministic-compaction`（含 trust-protocol flag）。

## 路径 B · 「DeepSeek-first coding agent」（宣言,等数据）

定位与论文自洽:cache 契约绑定单一 backend 才跨层成立（multi-provider 是
论文反例）——taucode 即论点的演示物。但**成本承诺现在担不起**:

- 已知账:window 填满大大延后、单请求变小,但 CH 可见下降;
- DeepSeek 经济学恰以 hit 折扣 + 廉价 context 为卖点——净省在双模态
  分布下无先验答案;
- 纪律:C vs A 配对数字之前,不做任何节省率宣称（防「15-17%」重演）。

## 叙事排序（裁定）

**主叙事 = context 质量**:工作语义 vs 脏数据——任务完成度、注意力漂移
（代理:tool churn / off-task reads / re-read）、优势区间命中。
不依赖未决 cache 账;与「turn 分类判准 = 产品能力」一致;G2 复核表
（completion / 盲评 / re-read）即其测量面。
**成本叙事第二位**,带数据附注,round 2 后定稿。

## 产品约束（已定）

- **session 开始即开启**:ledger/视图溯源需完整历史,中途加入出处不明。
  开关语义:off→on 仅对新 session 生效,禁止热切。
- 手动开关先行（DF2 已有）,自动策略 = D4 dispatch policy,等交叉点数据。
- bash 结果不参与失配提示（无稳定 path→content 映射),只入 (c) 检测。

## 触发条件

G2 round 1 + round 2（C' 臂）双数据到位 → 复盘定稿:路径 A 立即发;
路径 B 若 cache 账为正或中性 → 全叙事发;若为负 → 只发质量叙事 +
诚实成本注记（负账本身是论文素材,不是发布障碍）。

---

## 定稿草案（2026-07-08，Fable 组装；发布裁决归人）

**触发条件已满足**：R2 core（27 run）+ B' add-on + C''/Branch B/C 均落版，
口径入口 `docs/stage-verdict-2026-07.md`。本节把种子条款逐条兑现成
决策点；每个决策点等人裁，不自动执行。

### 路径 A（解耦插件）——建议：发，先过 RELEASE-AUDIT 门

- 种子条款「随时可发」在 H5 有一个前置：fresh checkout 全绿 + 安装摩擦低
  （`RELEASE-AUDIT`，roadmap 待做 16）。这是唯一剩余门，未跑过。
- 发布物清单不变：`packages/compaction-core` + `extensions/deterministic-compaction`
  （含 trust-protocol flag）+ launcher 说明。
- **决策点 A1**：批准执行 RELEASE-AUDIT（可分发 agent）。
- **决策点 A2**：audit 绿后的形态——npm 发包 vs 仅 repo tag + README 安装节。

### 路径 B（叙事）——cache 账已裁，按工作负载分支适用种子条款

R2 的账不是单值，按任务类型三分（`r2-verdict.md`）：

| 工作负载 | 账 | 种子条款适用 |
| --- | --- | --- |
| refactor / code-production | 正（~1/3 成本达同等验收，n=3 中位，盲评确认） | 全叙事可发，句式锁 H5 限定版 |
| exploration | 成本轴负 / completion 由 hybrid 买到 | 只发质量叙事 + 诚实成本注记；引 R14「ritual 买 completion，content 买轨迹」拆分 |
| direct-transform | 中性（重读修复保真损失，恐惧未复现） | 不需特殊叙事；更狠探针在待验列 |

- 主叙事 = context 质量（本文件原裁定不变）；成本叙事第二位带数据注记。
- **决策点 B1**：渠道排序——建议 pi issues（工程对话）→ DeepSeek 社区
  （provider ask）→ working paper 附录（叙事）。素材已备：
  `docs/upstream-drafts-2026-07-08.md`（外发前逐字过目）。
- **决策点 B2**：时点——建议 A 门（RELEASE-AUDIT）绿后同周发出，
  issue 里可指向可安装的 artifact 而非裸 repo。

### 本节之后

两个决策点包（A1/A2、B1/B2）任一裁定即可动工；全部裁定后本文件
状态从「种子」改「终稿」，并同步 README 的发布口径。
