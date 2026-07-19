# 8 人房间与 AI 补位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有多人房间与 AI 补位扩展到 8 人，并验证所有 AI 回合都能结束。

**Architecture:** 共享包提供人数和出生点常量；房间管理器执行成员校验；AI 模块只生成并执行服务端命令；客户端共用棋子偏移工具。Socket 保持广播协调职责。

**Tech Stack:** TypeScript、React、Socket.IO、Node.js assert、Vite。

## Global Constraints

- 服务端仍是唯一权威状态来源。
- 真人与 AI 总数为 2～8 人。
- 不改变地图、地产、股票和结算规则。

---

### Task 1: 房间容量与资源锁定

**Files:** `shared/src/index.ts`、`server/src/rooms/RoomManager.ts`、`scripts/test-room-capacity.ts`

- [x] 写入 8 人房间失败测试并确认旧实现失败。
- [x] 导出共享最小/最大人数常量和 8 个出生点。
- [x] 让真人加入、AI 加入和开局校验共用共享常量。
- [x] 验证第 8 人成功、第 9 人失败，且角色和出生点唯一。

### Task 2: AI 负现金恢复

**Files:** `server/src/game/ai.ts`、`scripts/test-ai.ts`

- [x] 写入抵押与禁止主动破产的失败测试。
- [x] 增加借款、抵押、到期自动结算的顺序策略。
- [x] 验证 AI 不会永久停在负现金回合。

### Task 3: 8 人客户端显示

**Files:** `client/src/game/playerTokenLayout.ts`、`client/src/components/Board.tsx`、`client/src/components/GraphBoard.tsx`、`client/src/pages/RoomPage.tsx`、`client/src/styles.css`

- [x] 封装 8 个唯一棋子偏移并添加测试。
- [x] 两种棋盘共用偏移函数。
- [x] 大厅显示 8 人容量并让长玩家列表可滚动。

### Task 4: 文档、验证与发布

**Files:** `README.md`、`GAME_RULES.md`、`AI_FILL_DESIGN.md`

- [x] 更新人数、出生点与 AI 恢复策略。
- [x] 运行测试、类型检查、规则审计、构建和敏感信息扫描。
- [ ] 提交并推送到 GitHub。
