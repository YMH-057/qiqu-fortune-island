# 奇趣财富岛 (Qiqu Fortune Island) — 架构标准与编码规范

> 本文档旨在为 AI 辅助编程和人工开发者提供项目架构、代码风格和设计模式的完整参考。所有后续开发应遵循本文档的标准。

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构规范](#3-目录结构规范)
4. [TypeScript 配置规范](#4-typescript-配置规范)
5. [共享类型设计规范](#5-共享类型设计规范)
6. [服务端编码规范](#6-服务端编码规范)
7. [客户端编码规范](#7-客户端编码规范)
8. [Socket.IO 通信规范](#8-socketio-通信规范)
9. [CSS 样式规范](#9-css-样式规范)
10. [国际化 (i18n) 规范](#10-国际化-i18n-规范)
11. [游戏逻辑设计模式](#11-游戏逻辑设计模式)
12. [命名约定](#12-命名约定)
13. [数据流与状态管理](#13-数据流与状态管理)
14. [错误处理模式](#14-错误处理模式)
15. [脚本与工具链](#15-脚本与工具链)

---

## 1. 项目概览

| 属性         | 详情                                            |
| ------------ | ----------------------------------------------- |
| **项目名称** | 奇趣财富岛 (Qiqu Fortune Island)                |
| **类型**     | 卡通风格网页端多人联机大富翁游戏                |
| **仓库结构** | npm Workspaces Monorepo                         |
| **运行时**   | Node.js (服务端) + 浏览器 (客户端)              |
| **协议**     | 实时联机，Socket.IO WebSocket                   |
| **权威来源** | 服务端是唯一权威状态来源 (Server-authoritative) |
| **语言**     | TypeScript (strict mode) 全栈                   |
| **许可证**   | 原创作品，非官方                                |

### 技术栈一览

| 层面     | 技术                                            |
| -------- | ----------------------------------------------- |
| 前端框架 | React 18 + TypeScript                           |
| 构建工具 | Vite 5                                          |
| 后端框架 | Express 4 + Socket.IO 4                         |
| 共享类型 | `@monopoly/shared` 本地 workspace 包            |
| 图标库   | Lucide React                                    |
| CSS      | 纯 CSS（无预处理/无 CSS-in-JS），CSS 自定义属性 |
| 存储     | 内存存储 (MemoryRoomStore)，可替换接口          |
| 开发工具 | tsx (服务端热重载), concurrently (并行启动)     |

---

## 2. 整体架构

### 2.1 三层 Monorepo 架构

```
┌─────────────────────────────────────────────────┐
│                  @monopoly/shared                 │
│         共享类型、常量、接口定义                    │
│         被 client 和 server 共同引用               │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     ▼                           ▼
┌──────────────┐         ┌──────────────┐
│ @monopoly/   │         │ @monopoly/   │
│   client     │◄────────│   server     │
│              │Socket.IO│              │
│ React+Vite   │  实时   │ Express+     │
│ 纯展示层     │  通信   │ Socket.IO    │
│              │         │ 权威游戏逻辑  │
└──────────────┘         └──────────────┘
```

### 2.2 核心设计原则

1. **Server-Authoritative（服务端权威）**：所有游戏逻辑（掷骰、移动、购买、事件结算）由服务端计算并推送结果。客户端只发送操作请求，不自行修改游戏状态。
2. **单向数据流**：客户端 → emit 事件 → 服务端处理 → broadcast 结果 → 客户端渲染。
3. **不可变更新**：游戏状态在服务端通过直接变异（mutate）方式修改，但对外广播时通过过滤构造新的视图对象（如 `gameForPlayer`）。
4. **接口抽象存储**：`RoomStore` 接口定义了存储契约，当前 `MemoryRoomStore` 实现可替换为 Redis/SQLite。

### 2.3 游戏状态机

```
等待掷骰 (waitingRoll) ──rollDice──▶ 地块动作 (tileAction) ──endTurn──▶ 等待掷骰 (下一位)
                                         │
                                    gameOver 条件满足
                                         │
                                         ▼
                                    游戏结束 (gameOver)
```

---

## 3. 目录结构规范

```
根目录 /
├── package.json              # npm workspaces 根配置
├── tsconfig.base.json        # 共享 TS 严格配置
├── shared/                   # @monopoly/shared — 纯类型包
│   ├── package.json          # "types"/"exports" 指向 src/index.ts
│   └── src/
│       └── index.ts          # 所有共享类型、常量、接口
├── server/                   # @monopoly/server
│   ├── package.json
│   └── src/
│       ├── index.ts          # Express 入口, /health, /network-info
│       ├── socket.ts         # Socket.IO 事件注册和广播逻辑
│       ├── data/             # 静态游戏数据配置
│       │   ├── bigMap.ts     # 地图格子定义
│       │   ├── map.ts        # 地图导出入口
│       │   ├── events.ts     # 好运/厄运事件卡
│       │   ├── luckCards.ts  # 运气卡定义
│       │   ├── skillCards.ts # 技能卡模板和权重
│       │   ├── stocks.ts     # 股票初始化数据
│       │   └── propertyGroups.ts # 地产套装
│       ├── game/             # 核心游戏逻辑（纯函数+状态变异）
│       │   ├── actions.ts    # 主操作分发 (rollDice, buyProperty, ...)
│       │   ├── bank.ts       # 银行存取贷还
│       │   ├── calendar.ts   # 游戏日历/月份主题
│       │   ├── createGameState.ts # 初始化 GameState
│       │   ├── economy.ts    # 租金计算、资产计算、排行
│       │   ├── exchange.ts   # 金币/彩券兑换
│       │   ├── lottery.ts    # 彩票购买与抽奖
│       │   ├── marketAnnouncements.ts # 市场公告生成
│       │   ├── mortgage.ts   # 地产抵押/赎回
│       │   ├── movement.ts   # 移动和路口决策
│       │   ├── properties.ts # 地产套装检查、租金计算
│       │   ├── stocks.ts     # 股票交易/日终结算
│       │   └── stockTileEffects.ts # 股票地块情报
│       └── rooms/            # 房间管理
│           ├── RoomStore.ts  # RoomStore 接口 + MemoryRoomStore
│           └── RoomManager.ts # 房间 CRUD、玩家管理、设置
├── client/                   # @monopoly/client
│   ├── package.json
│   ├── vite.config.ts        # Vite 配置 + 音频清单插件
│   └── src/
│       ├── main.tsx          # React 入口
│       ├── App.tsx           # 根组件，View 路由 + 全局状态
│       ├── i18n.tsx          # 国际化 Context + 字典
│       ├── styles.css        # 全局样式（唯一的 CSS 文件）
│       ├── pages/            # 页面级组件
│       │   ├── HomePage.tsx  # 首页：创建/加入房间
│       │   ├── RoomPage.tsx  # 房间：准备/设置
│       │   └── GamePage.tsx  # 游戏主页面
│       ├── components/       # UI 组件（~30+ 个）
│       │   ├── Board.tsx     # 棋盘 SVG 网格
│       │   ├── Dice.tsx      # 骰子按钮
│       │   ├── ActionBar.tsx # 底部操作栏
│       │   ├── GameLayout.tsx # 游戏布局容器
│       │   ├── PlayerPanel.tsx # 玩家列表
│       │   └── ... (其余组件)
│       ├── game/             # 客户端本地游戏工具
│       │   ├── boardLayout.ts # 棋盘坐标映射
│       │   ├── economy.ts    # 客户端资产格式化
│       │   ├── localResults.ts # 本地结果存储
│       │   └── localizeLog.ts  # 日志本地化
│       ├── socket/
│       │   └── socket.ts     # Socket.IO 客户端单例
│       └── audio/
│           └── AudioManager.ts # 音频管理器
└── scripts/                  # 构建/工具脚本
    ├── start-public.ps1      # 公网启动
    ├── stop-public.ps1       # 公网停止
    ├── generate-map-plan.ts  # 地图文档生成
    ├── generate-skill-card-rules.ts # 技能卡文档生成
    └── audit-rule-docs.ts    # 规则文档审计
```

### 目录命名约定

- **`data/`** — 纯数据定义，无业务逻辑，不应引用 `game/`
- **`game/`** — 核心游戏逻辑，可引用 `data/` 和 `@monopoly/shared`
- **`rooms/`** — 房间管理层，协调 data + game
- **`components/`** — React UI 组件，按功能命名
- **`pages/`** — 页面级组件，对应一个完整的视图
- **`socket/`** — Socket.IO 相关代码

---

## 4. TypeScript 配置规范

### 4.1 根基配置 (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

**关键要求**：
- ✅ **strict: true** — 全项目严格模式
- ✅ **noUncheckedIndexedAccess: true** — 数组/对象索引访问必须处理 undefined
- ✅ **exactOptionalPropertyTypes: true** — 可选属性不能显式赋 `undefined`
- ✅ 所有 workspace 包必须 `extends` 根基配置

### 4.2 各包配置差异

| 包     | module   | moduleResolution | 特殊配置                      |
| ------ | -------- | ---------------- | ----------------------------- |
| server | CommonJS | Node             | esModuleInterop, outDir: dist |
| client | ESNext   | Bundler          | jsx: react-jsx, noEmit        |
| shared | ESNext   | Bundler          | noEmit, 仅类型导出            |

---

## 5. 共享类型设计规范

### 5.1 类型定义哲学

`shared/src/index.ts` 是项目的类型基石，约 1000+ 行，包含所有前后端共享的类型定义。**不应包含任何运行时代码**（纯类型和 `const` 常量除外）。

### 5.2 类型命名模式

```typescript
// 基础类型别名
export type PlayerId = string;
export type RoomId = string;
export type TileId = string;

// 联合类型字面量
export type TileType = "start" | "property" | "bank" | ...;
export type SkillCardCode = "remoteDice" | "remoteTrade" | ...;

// 接口 — 数据对象
export interface PlayerState { ... }
export interface GameState { ... }

// 带 ? 的可选字段必须显式标记 | undefined
export interface Tile {
  price?: number | undefined;     // ✅ 正确
  // price?: number;              // ❌ 会被 exactOptionalPropertyTypes 限制
}
```

### 5.3 常量定义模式

```typescript
// 使用 as const 确保字面量类型
export const GO_TILE_ID = "tile-00" as const;

export const START_TILE_OPTIONS = [
  { tileId: "tile-00", nameZh: "左上 GO", nameEn: "Upper-left GO" },
  // ...
] as const;

// 从 const 数组推导类型
export type AvatarId = (typeof AVATAR_DEFINITIONS)[number]["id"];
```

### 5.4 枚举 vs 联合类型

**项目策略**：使用字符串联合类型而非 TypeScript enum。例如：

```typescript
// ✅ 项目使用的方式
export type GamePhase = "waitingRoll" | "tileAction" | "gameOver";

// ❌ 不使用 enum
// enum GamePhase { WaitingRoll, TileAction, GameOver }
```

### 5.5 接口继承与组合

游戏状态通过嵌套接口组合：

```
GameState
├── settings: GameSettings
├── tiles: Tile[]
├── players: PlayerState[]
│   ├── bankAccount: PlayerBankAccount
│   ├── stockAccount: StockAccount
│   │   └── holdings: Record<StockId, StockHolding>
│   └── statusEffects: StatusEffect[]
├── properties: Record<TileId, PropertyState>
├── stocks: Record<StockId, Stock>
├── gameCalendar: GameCalendar
├── pendingAction: PendingAction (联合类型)
└── ...
```

---

## 6. 服务端编码规范

### 6.1 模块职责

| 模块         | 职责                                     | 不应做的事         |
| ------------ | ---------------------------------------- | ------------------ |
| `index.ts`   | HTTP 服务器启动，中间件，健康检查        | 不处理游戏逻辑     |
| `socket.ts`  | Socket.IO 事件注册，广播协调，回合计时器 | 不直接修改游戏状态 |
| `data/*.ts`  | 静态数据定义和导出                       | 不引用 `game/`     |
| `game/*.ts`  | 纯游戏逻辑函数，接收 GameState 并修改    | 不处理网络/IO      |
| `rooms/*.ts` | 房间生命周期，玩家管理                   | 不处理具体游戏规则 |

### 6.2 游戏逻辑函数模式

所有游戏操作函数遵循统一签名：

```typescript
// actions.ts 中的主操作函数
export function rollDice(gameState: GameState): ActionOutcome { ... }
export function buyProperty(gameState: GameState, playerId: PlayerId, tileId: TileId): ActionOutcome { ... }
export function endTurn(gameState: GameState): ActionOutcome { ... }

// 子模块中的辅助函数
export function calculateRent(gameState: GameState, tileId: TileId, visitorPlayerId: PlayerId): number { ... }
export function exchangeMoneyToTickets(gameState: GameState, playerId: PlayerId, ticketAmount: number): TicketExchangeResult { ... }
```

**关键模式**：
- 函数直接修改传入的 `GameState` 对象（变异模式），而非返回新对象
- 返回结果统一为 `{ ok: boolean; error?: string; ...其他字段 }`
- 使用 `uid(prefix)` 工具函数生成唯一 ID

### 6.3 结果类型模式

```typescript
// 简单结果
export interface BankActionResult {
  ok: boolean;
  message: string;
}

// 复杂结果（ActionOutcome 包含 ~30+ 可选字段）
export interface ActionOutcome {
  ok: boolean;
  error?: string;
  dice?: number;
  movements: MovementEvent[];
  tileEvent?: TileEvent | undefined;
  stockUpdated: boolean;
  bankrupted: BankruptNotice[];
  gameEnded: boolean;
  // ... 更多可选广播字段
}
```

### 6.4 日志写入模式

```typescript
function addLog(gameState: GameState, message: string): void {
  gameState.logs.unshift({
    id: uid("log"),
    turn: gameState.completedTurns,
    message,
    createdAt: Date.now()
  });
  gameState.logs = gameState.logs.slice(0, 120); // 最多保留 120 条
}
```

### 6.5 安全校验模式

```typescript
// 金额规范化
function normalizeAmount(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const normalized = Math.floor(amount);
  return normalized > 0 ? normalized : null;
}

// 玩家存在性检查
function getPlayer(state: GameState, playerId: PlayerId): PlayerState | null {
  return state.players.find((player) => player.id === playerId) ?? null;
}
```

---

## 7. 客户端编码规范

### 7.1 组件结构

所有组件遵循：
```typescript
// 1. 导入
import { ... } from "...";

// 2. Props 接口（内联定义）
interface ComponentNameProps {
  prop1: Type;
  prop2?: Type | undefined;
}

// 3. 函数组件（默认导出或命名导出）
export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // hooks
  // 事件处理函数
  // JSX 返回
  return <div>...</div>;
}
```

### 7.2 View 路由模式

`App.tsx` 使用简单的条件渲染实现页面路由（不使用 React Router）：

```typescript
type View = "home" | "room" | "game";

// 在 App 中：
{view === "home" && <HomePage ... />}
{view === "room" && <RoomPage ... />}
{view === "game" && <GamePage ... />}
```

### 7.3 Socket 通信模式

客户端通过统一的 socket 单例发送和接收事件：

```typescript
// 发送操作请求
socket.emit("rollDice");
socket.emit("buyProperty", { tileId: "tile-42" });

// 接收状态更新
socket.on("gameStateUpdated", (gameState) => { ... });
socket.on("roomUpdated", (roomState) => { ... });

// 确认回调
socket.emit("createRoom", { nickname }, (ack: SocketAck) => {
  if (ack.ok) { ... }
});
```

### 7.4 本地存储模式

```typescript
const sessionKey = "monopoly-online-session";

function loadSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
}
```

### 7.5 棋盘渲染模式

使用 CSS Grid 布局渲染棋盘：
- `BOARD_SIZE = 9` 定义 9×9 网格
- `getBoardCell(index)` 将格子索引映射到 grid row/col
- 每个格子是一个 `<div>` 包含：类型图标、名称、价格、等级、玩家棋子

---

## 8. Socket.IO 通信规范

### 8.1 事件命名约定

| 方向          | 命名                    | 说明                                            |
| ------------- | ----------------------- | ----------------------------------------------- |
| 客户端→服务端 | `camelCase` 动词        | `rollDice`, `buyProperty`, `endTurn`            |
| 服务端→客户端 | `camelCase` 过去式/状态 | `gameStateUpdated`, `diceRolled`, `playerMoved` |
| 双向确认      | `(data, ack) => void`   | ack 回调返回 `SocketAck`                        |

### 8.2 广播模式

```typescript
// 向房间内所有人广播
io.to(room.id).emit("diceRolled", { playerId, value });

// 向特定玩家发送（隐私信息）
io.to(player.socketId).emit("gameStateUpdated", gameForPlayer(game, player.id));

// 向房间内所有人广播，排除自己
socket.to(room.id).emit("chatMessage", message);
```

### 8.3 信息隔离

```typescript
// 服务端过滤私有信息后再发送给每个玩家
function gameForPlayer(game: GameState, playerId: string): GameState {
  return {
    ...game,
    marketSignals: (game.marketSignals ?? []).filter(
      (signal) => signal.isPublic || signal.ownerPlayerId === playerId
    )
  };
}
```

每个玩家收到的 `GameState` 中，股票情报被过滤为仅包含公开情报和自己的私有情报。

---

## 9. CSS 样式规范

### 9.1 技术选择

- **纯 CSS**：单一 `styles.css` 文件，无预处理、无 CSS Modules、无 CSS-in-JS
- **CSS 自定义属性**：定义在 `:root` 中
- **类名约定**：`camelCase`（与 React 组件的 className 一致）

### 9.2 样式组织

```css
:root {
  /* 全局变量 */
  --app-safe-top: env(safe-area-inset-top, 0px);
  --compact-board-width: clamp(560px, 164vw, 780px);
}

/* 基础重置 */
* { box-sizing: border-box; }
body { margin: 0; ... }

/* 元素基础样式 */
button, input, select { ... }

/* 功能类 */
.primaryButton { ... }

/* 布局类 */
.game-layout { ... }
.boardWrap { ... }
.boardGrid { ... }

/* 组件类 */
.boardTile { ... }
.playerCard { ... }
.actionBar { ... }
```

### 9.3 响应式策略

- 使用 `clamp()`, `min()`, `dvh` 等现代 CSS 单位
- 媒体查询：`(max-width: 860px), (max-height: 560px)` 切换紧凑布局
- Safe area 支持：`env(safe-area-inset-*)`

---

## 10. 国际化 (i18n) 规范

### 10.1 架构

```
i18n.tsx
├── Language 类型: "zh" | "en"
├── DictionaryKey 联合类型（所有翻译 key）
├── dictionaries: Record<Language, Record<DictionaryKey, string>>
├── I18nContext (React Context)
├── useI18n() hook → { t, language, setLanguage, tileName, tileType }
└── I18nProvider 包裹 <App />
```

### 10.2 使用模式

```typescript
const { t, language, tileName } = useI18n();

// 简单翻译
<span>{t("appName")}</span>

// 带参数的翻译（通过 tile 对象）
<strong>{tileName(tile)}</strong>
```

### 10.3 注意事项

- **⚠️ 大部分错误消息未国际化**：服务端返回的错误消息硬编码为中文，没有经过 i18n 系统
- 语言偏好存储在 `localStorage` 中
- 字典 key 需在 `DictionaryKey` 类型中预先定义

---

## 11. 游戏逻辑设计模式

### 11.1 数据驱动设计

游戏配置（地图、股票、事件、技能卡）全部以 TypeScript 数据定义：

```typescript
// bigMap.ts — 使用工厂函数定义格子
const d = (index, id, type, name, shortName, x, y, next, options) => ({...});

const definitions: TileDefinition[] = [
  d(0, "tile-00", "start", "左上 GO 起点", "GO", 375, 260, ["tile-01", "tile-26"], {...}),
  // ...
];
```

### 11.2 状态效果系统

使用 `StatusEffect[]` 统一管理所有临时效果（技能、监狱、医院等）：

```typescript
interface StatusEffect {
  id: string;
  type: StatusEffectType; // ~70 种效果类型
  turns: number;          // 剩余持续回合
  value?: number;         // 可选数值参数
  sourcePlayerId?: PlayerId;
}
```

### 11.3 待处理动作 (PendingAction)

使用联合类型建模游戏中的等待状态：

```typescript
type PendingAction =
  | { kind: "buyProperty"; tileId: TileId }
  | { kind: "upgradeProperty"; tileId: TileId }
  | { kind: "choosePath"; playerId: PlayerId; fromTileId: TileId; options: PathOption[]; remainingSteps: number }
  | { kind: "portalChoice"; ... }
  | { kind: "lottery"; ... }
  | { kind: "skillShop"; ... }
  | { kind: "bank"; ... };
```

### 11.4 回合计时器

服务端使用 `setTimeout` 实现回合超时自动操作：

```typescript
const turnTimers = new Map<string, NodeJS.Timeout>();

function scheduleTurnTimer(io, manager, room) {
  const delay = Math.max(250, game.turnEndsAt - Date.now());
  const timer = setTimeout(() => {
    autoPlayTimedOutTurn(freshGame);
  }, delay);
  turnTimers.set(room.id, timer);
}
```

### 11.5 随机性处理

所有随机数由服务端生成：
- `Math.random()` 用于骰子、事件抽卡、彩票
- `shuffle()` Fisher-Yates 洗牌用于回合顺序
- 路口方向选择使用加权随机

---

## 12. 命名约定

### 12.1 文件命名

| 类型          | 格式                   | 示例                                |
| ------------- | ---------------------- | ----------------------------------- |
| React 组件    | PascalCase `.tsx`      | `PlayerPanel.tsx`, `Dice.tsx`       |
| 游戏逻辑模块  | camelCase `.ts`        | `createGameState.ts`, `movement.ts` |
| 数据模块      | camelCase `.ts`        | `bigMap.ts`, `skillCards.ts`        |
| 工具/配置     | camelCase `.ts`        | `vite.config.ts`                    |
| Markdown 文档 | UPPER_SNAKE_CASE `.md` | `GAME_RULES.md`, `SKILL_CARDS.md`   |

### 12.2 代码命名

| 元素       | 格式             | 示例                             |
| ---------- | ---------------- | -------------------------------- |
| 接口/类型  | PascalCase       | `GameState`, `PlayerState`       |
| 函数/方法  | camelCase        | `rollDice`, `createGameState`    |
| 变量/常量  | camelCase        | `turnTimers`, `initialMoney`     |
| 全局常量   | UPPER_SNAKE_CASE | `GO_TILE_ID`, `BOARD_SIZE`       |
| React 组件 | PascalCase       | `ActionBar`, `PlayerPanel`       |
| CSS 类名   | camelCase        | `.boardWrap`, `.playerCard`      |
| 事件名     | camelCase        | `gameStateUpdated`, `diceRolled` |
| ID 前缀    | 短前缀+随机字符  | `P` (Player), `log-`, `lottery-` |

### 12.3 Workspace 包命名

使用 `@monopoly/` 作用域前缀，`file:` 协议本地引用。

---

## 13. 数据流与状态管理

### 13.1 服务端状态

```
RoomManager (单例)
  └── RoomStore (接口，当前 MemoryRoomStore)
        └── Map<RoomId, RoomRecord>
              └── RoomRecord
                    ├── players: RoomMember[]
                    ├── settings: GameSettings
                    ├── chat: ChatMessage[]
                    └── game?: GameState (开始后)
```

### 13.2 客户端状态

```
App (根组件)
├── view: View              → 页面路由
├── room: RoomPublicState   → 房间信息
├── game: GameState         → 游戏状态（由服务端推送）
├── playerId: string        → 本地玩家 ID
├── nickname: string        → 玩家昵称
├── error: string           → 错误信息
└── marketSignalPopup       → 市场情报弹窗

GamePage (游戏页面内额外状态)
├── animatedPositions       → SVG 动画位置
├── visibleEvent            → 事件弹窗
├── diceValue / rolling     → 骰子动画状态
├── selectedTileId          → 选中地块
├── sidebarTab              → 侧边栏标签
├── activeModal             → 当前模态框
├── monthlySettlements      → 月结算数据
└── mobilePanel             → 移动端面板
```

### 13.3 状态同步流程

```
[客户端]                    [服务端]
   │                           │
   ├─ emit("rollDice") ───────▶│
   │                           ├─ rollDice(gameState)
   │                           ├─ 变异 gameState
   │                           ├─ 计算 ActionOutcome
   │                           │
   │◄── emit("diceRolled") ────┤
   │◄── emit("playerMoved") ───┤
   │◄── emit("tileEvent") ─────┤
   │◄── emit("gameStateUpdated")┤
   │                           │
   ├─ setGame(newState)        │
   └─ 重新渲染                 │
```

---

## 14. 错误处理模式

### 14.1 服务端

```typescript
// 操作函数返回 ok/error 模式
export function mortgageProperty(...): PropertyFinanceResult {
  const found = findOwnedProperty(...);
  if ("error" in found) {
    return { ok: false, message: found.error };
  }
  // 正常逻辑
}

// Socket 层面统一错误推送
function emitError(socket: GameSocket, message: string): void {
  socket.emit("errorMessage", { message });
}

// Ack 回调错误
function ackError(ack, message: string): void {
  ack?.({ ok: false, error: message });
}
```

### 14.2 客户端

```typescript
// App.tsx 中的全局错误处理
const [error, setError] = useState<string | null>(null);

socket.on("errorMessage", ({ message }) => setError(message));

// localStorage 异常安全
try {
  return JSON.parse(raw) as StoredSession;
} catch {
  window.localStorage.removeItem(sessionKey);
  return null;
}
```

---

## 15. 脚本与工具链

### 15.1 npm scripts 体系

| 命令                 | 用途                          |
| -------------------- | ----------------------------- |
| `npm run dev`        | 并行启动前后端                |
| `npm run dev:server` | 仅启动服务端 (tsx watch)      |
| `npm run dev:client` | 仅启动客户端 (vite)           |
| `npm run build`      | 生产构建                      |
| `npm run typecheck`  | 全项目类型检查 (tsc --noEmit) |
| `npm run docs`       | 生成规则文档                  |
| `npm run public`     | 启动公网隧道                  |

### 15.2 文档生成

`scripts/` 中的脚本从 `server/src/data/` 中读取数据定义并生成 Markdown 文档（`SKILL_CARDS.md`, `MAP_PLAN.md`），保证文档与代码不脱节。

### 15.3 Vite 自定义插件

`vite.config.ts` 中包含 `audioManifestPlugin`，自动扫描 `public/audio/` 目录生成 `manifest.json` 并监听文件变化热更新。

---

## 附录：常见反模式（应避免）

| ❌ 反模式                    | ✅ 正确做法                              |
| --------------------------- | --------------------------------------- |
| 客户端自行计算租金/资产     | 由服务端计算并推送，客户端仅展示        |
| 在 `data/` 中引用 `game/`   | data 层保持纯净，不依赖业务逻辑         |
| 使用 TypeScript enum        | 使用字符串联合类型                      |
| 可选属性不加 `\| undefined` | 始终显式标注 `\| undefined`             |
| 在组件中直接操作 DOM        | 使用 React state 和事件处理             |
| 创建新的 CSS 文件           | 将样式追加到 `styles.css`               |
| 硬编码中文字符串在新功能中  | 通过 `i18n.tsx` 的 `t()` 函数处理       |
| 使用 `any` 类型             | 始终使用具体类型或 `unknown` + 类型守卫 |

---

> 📝 **最后更新**: 2026-07-08
> 📝 **维护者**: 基于项目源码自动分析生成，请随项目演进同步更新。
