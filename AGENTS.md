# AGENTS.md — 接棒开发指引（信用证辅助制单微信小程序）

本文件是 AI 编程代理（Codex 等）的入口说明。先读本文件，再按顺序读 `HANDOFF.md`（真实开发状态）、`PRD.md`（需求与验收基线）、`specs/manual-workflow/tasks.md`（已完成/待办）。

## 项目一句话

原生微信小程序「单证之间」：根据信用证辅助生成发票/装箱单抬头草稿（Word），支持手动录入、46/47 场额外条款、字段模板复用、SWIFT 文本粘贴解析（候选 → 人工核对后写入）。**纯本地存储，无云端。**

## 环境与命令

- Node.js（无第三方依赖，`"type": "module"`）。
- `npm test` — 全部自动测试（当前 35 项，必须全绿才能提交）。
- `npm run check` — 关键文件语法检查。
- `npm run sync:miniprogram` — 修改 `src/domain/documents.mjs` 后必须执行，重新生成 `miniprogram/lib/domain.js`（不要直接手改生成物）。
- 微信开发者工具导入仓库根目录即可编译；`project.config.json` 已配置用户提供的正式 AppID `wx95fc344fe5970613`。此前游客模式下的 `webapi_getwxaasyncsecinfo:fail` 报错是基础库限制，不代表业务代码失败。

## 代码布局

| 路径 | 说明 |
|---|---|
| `src/domain/documents.mjs` | 业务规则唯一权威来源（字段、条款、校验、模板、生成快照） |
| `miniprogram/lib/domain.js` | 上者的生成副本，由 sync 脚本产出 |
| `miniprogram/lib/store.js` | 本地存储（业务/模板/生成记录、JSON 备份导出恢复、损坏数据保留） |
| `miniprogram/lib/lc-text.js` | SWIFT 文本保守解析，未识别的保留原文 |
| `miniprogram/lib/docx.js` | 无依赖的最小 OOXML 生成（纯 JS zip + CRC） |
| `miniprogram/lib/ui.js` | 页面公共 UI 辅助 |
| `miniprogram/pages/` | home（业务总览/备份）、editor（制单工作台）、templates、preview |
| `tests/*.test.mjs` | node:test + vm 沙箱加载小程序模块的测试 |
| `scripts/ocr-pdf.py`、`scripts/ocr-image.swift` | **仅 macOS 开发用** OCR 工具，不是小程序功能 |
| `specs/manual-workflow/ocr-feasibility.md` | OCR 方案评估（结论：暂不做端上识别） |
| `design/` | 早期网页原型，仅参考 |

## 硬性约束（违反即为事故）

1. **不创建云环境、不接 CloudBase**（用户明确暂缓）；不上传体验版、不发布。
2. **已有用户提供的正式 AppID**；真机预览需使用小程序管理员或已添加为开发成员的微信号。未经用户另行授权，不上传体验版或发布。
3. `.local/` 是真实客户业务样本，已被 gitignore：**只读本机验证用，禁止提交、上传、在回复或日志中引用具体客户资料**。不要把样本内容写进测试或文档。
4. `scripts/ocr-pdf.py` 是桌面工具，**不要把它描述或实现成小程序能力**；小程序端 OCR 目前明确不做（见 ocr-feasibility.md）。
5. 识别/解析结果一律走"候选 → 人工核对"，不静默写入已确认字段；不虚构编号值。
6. 表述口径：自动测试通过 ≠ 真机验收通过；本机 OCR ≠ 小程序支持 PDF 识别。

## 代码风格约定

- 小程序端代码是无依赖 CommonJS（`require`/`module.exports`），单行紧凑风格（见现有文件），保持风格一致；改完先 `node --check`。
- 页面 JS 手工拼接闭合括号易错，提交前必须 `npm run check`。
- 测试用 `vm.runInNewContext` 沙箱加载模块；跨 realm 对象用 `assert.deepEqual` 会因原型不同失败，比较前先 `JSON.parse(JSON.stringify(actual))` 归一化。
- 测试中的 wx API 用内存 mock（见 `tests/workflow.test.mjs` 的 `createEnv()`），新增页面交互时同步扩展 mock。

## 当前状态（2026-09-26）

- 35 项测试全通过；功能见 README「当前可用」。
- 最近新增：手填 → 信用证文本 → 集中核对三步引导；字段按单据选择保留范围；所选单据一键生成，结果关联信用证号和发票号。

## 下一步优先级

1. 使用已提供的正式 AppID → 在开发者工具和真机人工验收（表单、文件导入、Word 打开、备份恢复）。
2. 用户恢复 CloudBase 后 → 按 `specs/manual-workflow/ocr-feasibility.md` 做"上传 → 云函数 OCR → 候选 → 人工核对"，先确认数据出端合规。
3. 有脱敏正式单据模板后 → 字段映射与正式版式（PRD 阶段 A/E）。

## 提交纪律

- 提交前：`npm test` 全绿 + `npm run check` 通过 + `git status` 无 `.local/` 内容。
- 提交信息说明"实际完成 / 未完成依赖 / 下一步"，与 HANDOFF.md、tasks.md 同步更新。
