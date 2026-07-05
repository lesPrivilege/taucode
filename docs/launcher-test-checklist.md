# ecode launcher 联调清单（Code agent + Opus，terminal 实测）

2026-07-05。对象：`bin/ecode`（含 env-presence 路由，改动可能尚未 commit——
先 `git status` 确认工作区状态并顺手补 commit）。报告按本清单逐项记
PASS / FAIL / SKIP + 实际输出摘录。

## 前置

- [ ] `pi/` 已 build（`dist/cli.js` 存在；否则脚本应给出 build 提示——这本身是 T1）
- [ ] 测试时 shell 里 **不要** 预设 DEEPSEEK_API_KEY（T4 之前）

## 用例

| # | 操作 | 预期 |
| --- | --- | --- |
| T1 | 临时 mv 走 dist/cli.js 后跑 `ecode` | 报 build 提示，exit 1，不崩 |
| T2 | 首次运行（无 `.ecode-agent/`） | 自动 scaffold；`extensions/deterministic-compaction` symlink 指向正确；TUI 起来 |
| T3 | 无任何 key 跑 `ecode` | stderr 两行提示（列出查过的变量名 + profile 路径），CLI 照常进入（无 model 默认行为由 pi 决定，记录实际表现） |
| T4 | `DEEPSEEK_API_KEY=x ecode`（假 key） | stderr `routing -> deepseek`；model 为 deepseek/deepseek-v4-flash；发消息应得认证类报错（记录报错形态） |
| T5 | `ecode --model <其他>` | 路由整段跳过，无 routing stderr |
| T6 | `ECODE_DEFAULT_MODEL=... ecode` | 用该值，优先于 key 探测 |
| T7 | `.ecode-agent/env` 写一行假 export 后跑 | 被 source（用 T4 同法验证）；确认该文件不在 `git status` 中 |
| T8 | extension 实际加载 | 会话内 `/compact-status` 有输出；footer 正常 |
| T9 | 真 key（若已备好） | 真实一问一答跑通；`/compact-status` 显示门控位置；ambient JSONL 落盘（检查 `experiments/results/ambient/`） |
| T10 | 隔离验证 | 跑过 ecode 后 `~/.pi/` 无新增/改动（对比 mtime） |

## 已知边界（报告时不算 FAIL）

- 沙箱侧曾观察到 `.git/objects` 权限告警——Mac 本地不应复现，若复现单列。
- T3 无 key 时 pi 自身的 model 解析行为未定义，如实记录即可。
- deepseek 默认 model 名以 `getModels("deepseek")` 实际返回为准，若与
  `deepseek-v4-flash` 不符，改脚本默认值并在报告标注。

## 报告格式

逐项 `T# PASS/FAIL/SKIP + 一行实测输出`；FAIL 附最小复现命令。
杂项发现（性能、日志噪音、体验毛刺）单列一节，供 DF0 一周试用参考。
