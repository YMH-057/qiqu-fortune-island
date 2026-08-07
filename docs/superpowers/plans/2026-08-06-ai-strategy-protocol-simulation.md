# AI Strategy, Protocol And Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加房间级 AI 难度、严格 `qiqu-ai/1` 外部决策协议、脱敏审计与确定性完整局模拟。

**Architecture:** `GameSettings` 保存房间级难度，`aiPolicy.ts` 将难度转换为策略参数，`ai.ts` 只消费策略。`aiProtocol.ts` 负责协议信封与校验，`aiDecisionAudit.ts` 负责有界内存审计，Provider 仅负责 HTTP 调用与回落。

**Tech Stack:** TypeScript、React、Socket.IO、Node.js assert、Vite。

## Global Constraints

- 服务端继续是唯一权威状态源。
- 默认 AI 难度为 `balanced`，不改变旧房间的默认体验。
- 审计不记录 API Key、完整游戏状态或 HTTP 正文。
- 所有新行为先写失败测试，再写实现。

---

### Task 1: 房间级 AI 难度

**Files:** `shared/src/index.ts`, `server/src/rooms/RoomManager.ts`, `server/src/game/aiPolicy.ts`, `server/src/game/ai.ts`, `client/src/pages/RoomPage.tsx`, `scripts/test-ai.ts`, `scripts/test-room-capacity.ts`

- [ ] 在测试中构造现金边界、攻击卡和股票预算场景，确认三档尚未产生不同决策。
- [ ] 运行 `npm.cmd run test:ai` 并确认新断言失败。
- [ ] 定义 `AiDifficulty = "conservative" | "balanced" | "aggressive"` 和 `getAiPolicy(difficulty)`，将现金储备、股票预算、攻击卡开关注入 AI 决策。
- [ ] 在 `RoomManager` 中默认为均衡并只接受三个法定值，大厅添加三段选择控件。
- [ ] 重跑 AI、房间、类型检查。

### Task 2: `qiqu-ai/1` 协议与调用审计

**Files:** `server/src/game/aiProtocol.ts`, `server/src/game/aiDecisionAudit.ts`, `server/src/game/aiDecisionProvider.ts`, `scripts/test-ai-provider.ts`, `server/.env.example`

- [ ] 先写请求信封、响应版本/requestId 拒绝、环形审计和脱敏字段测试。
- [ ] 运行 `npm.cmd run test:ai-provider` 并确认缺少协议函数导致失败。
- [ ] 实现 `AI_DECISION_PROTOCOL_VERSION`, `createAiDecisionRequest`, `parseAiDecisionResponse` 和最多 500 条的 `AiDecisionAuditStore`。
- [ ] Provider 发送版本信封，在成功、超时、非法响应、本地回落和动作拒绝时记录脱敏审计。
- [ ] 重跑 Provider 和安全测试。

### Task 3: 确定性完整局模拟

**Files:** `scripts/test-ai-simulation.ts`, `scripts/test-fixtures.ts`, `package.json`

- [ ] 先写带固定 PRNG 的 4 人/8 人短局模拟，要求在步数上限内进入 `ended`。
- [ ] 每步断言所有金额有限、持仓非负、地产归属与玩家列表一致、当前玩家有效。
- [ ] 运行测试定位任何卡死状态，只修复被失败种子证明的服务端问题。
- [ ] 将 `test:simulation` 纳入根 `npm test`。

### Task 4: 文档、UI 与发布验证

**Files:** `README.md`, `GAME_RULES.md`, `AI_FILL_DESIGN.md`, `client/src/styles.css`

- [ ] 说明三档策略、`qiqu-ai/1` 信封、审计范围和 API 回落。
- [ ] 运行 `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run docs:audit`, `npm.cmd run build` 和 `git diff --check`。
- [ ] 浏览器检查大厅难度控件在桌面和手机窄宽下不重叠。
- [ ] 运行敏感信息扫描，提交并推送当前分支。

