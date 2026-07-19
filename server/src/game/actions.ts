import {
  GO_TILE_ID,
  type
  GameState,
  LuckCard,
  LuckCardEffect,
  MarketAnnouncement,
  MarketSignal,
  MonthlyBankSettlement,
  MovementEvent,
  PathOption,
  PendingAction,
  PlayerId,
  PlayerState,
  PropertyState,
  RankingEntry,
  SkillCard,
  StockAccount,
  StockId,
  StockOrder,
  StockSymbol,
  StockTradeRecord,
  Tile,
  TileEvent,
  TileId
} from "@monopoly/shared";
import { luckCards } from "../data/luckCards";
import { START_SALARY } from "../data/map";
import { makeSkillCard, rarityWeights, skillCardTemplates } from "../data/skillCards";
import { STOCK_IDS } from "../data/stocks";
import {
  checkGameEndByCalendar,
  getCurrentMonthMarketTheme,
  isStockTradingDay,
  markPlayerActedAndAdvanceDayIfNeeded
} from "./calendar";
import {
  MAX_PROPERTY_LEVEL,
  buildRankings,
  getUpgradeCost
} from "./economy";
import { calculateRent, checkPropertyGroupCompletion } from "./properties";
import { lotteryConfig } from "./lottery";
import { maybeCreateMarketAnnouncement } from "./marketAnnouncements";
import { chooseRandomDirectionAtJunction } from "./movement";
import { applyStockTileEffect, createDirectedStockSignal, createMarketSignal } from "./stockTileEffects";
import { settleMonthlyBankInterest } from "./bank";
import {
  grantStockShares,
  cancelStockOrder,
  settleDailyStockOrders,
  submitStockOrder,
  updatePlayerStockAccounts,
  updateStockMarketDaily
} from "./stocks";

interface BankruptNotice {
  playerId: string;
  nickname: string;
}

interface TicketNotice {
  playerId: string;
  tickets: number;
}

export interface ActionOutcome {
  ok: boolean;
  error?: string;
  dice?: number;
  movements: MovementEvent[];
  tileEvent?: TileEvent | undefined;
  stockUpdated: boolean;
  bankrupted: BankruptNotice[];
  gameEnded: boolean;
  pathChoice?: Extract<PendingAction, { kind: "choosePath" }> | undefined;
  junctionDirections?: Array<{
    playerId: PlayerId;
    junctionTileId: TileId;
    nextTileId: TileId;
    directionLabel: string;
    remainingSteps: number;
  }> | undefined;
  portalChoice?: Extract<PendingAction, { kind: "portalChoice" }> | undefined;
  portalCanceled?: { playerId: PlayerId; tileId: TileId } | undefined;
  lotteryPanel?: Extract<PendingAction, { kind: "lottery" }> | undefined;
  skillShop?: { playerId: PlayerId; offers: SkillCard[] } | undefined;
  skillBought?: { playerId: PlayerId; card: SkillCard } | undefined;
  skillUsed?: { playerId: PlayerId; card: SkillCard } | undefined;
  skillMessage?: { playerId: PlayerId; message: string } | undefined;
  ticketsUpdated?: TicketNotice[] | undefined;
  luckCard?: { playerId: PlayerId; card: LuckCard; tileEvent: TileEvent } | undefined;
  teleports?: MovementEvent[] | undefined;
  stockTrade?: { playerId: PlayerId; record: StockTradeRecord; account: StockAccount } | undefined;
  stockAccount?: { playerId: PlayerId; account: StockAccount } | undefined;
  stockTradeFailed?: { playerId: PlayerId; message: string } | undefined;
  stockOrder?: { playerId: PlayerId; order: StockOrder; account: StockAccount } | undefined;
  stockOrderCanceled?: { playerId: PlayerId; orderId: string; account: StockAccount } | undefined;
  stockSettlement?: { records: StockTradeRecord[] } | undefined;
  bankSettlements?: MonthlyBankSettlement[] | undefined;
  skillRecycled?: { playerId: PlayerId; cardId: string; tickets: number } | undefined;
  privateSignals?: Array<{ playerId: PlayerId; signal: MarketSignal }> | undefined;
  marketAnnouncements?: MarketAnnouncement[] | undefined;
}

interface EffectResult {
  details: string[];
  movements: MovementEvent[];
  bankrupted: BankruptNotice[];
  stockUpdated: boolean;
  ticketsUpdated: TicketNotice[];
  pathChoice?: Extract<PendingAction, { kind: "choosePath" }> | undefined;
  tileOutcome?: ActionOutcome | undefined;
}

interface MovementResolution {
  movement: MovementEvent | null;
  pathChoice?: Extract<PendingAction, { kind: "choosePath" }> | undefined;
  junctionDirections?: ActionOutcome["junctionDirections"] | undefined;
}

function fail(message: string): ActionOutcome {
  return {
    ok: false,
    error: message,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function startTurnClock(state: GameState): void {
  const now = Date.now();
  const seconds = Math.max(15, Math.min(300, Math.floor(state.settings.turnDurationSeconds ?? 60)));
  state.turnDurationSeconds = seconds;
  state.turnStartedAt = now;
  state.turnEndsAt = now + seconds * 1000;
}

function randomItem<T>(items: T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("Cannot choose from an empty list.");
  }
  return item;
}

export function addLog(state: GameState, message: string): void {
  state.logs.unshift({
    id: uid("log"),
    turn: state.completedTurns,
    message,
    createdAt: Date.now()
  });
  state.logs = state.logs.slice(0, 100);
}

function logReason(reason: string): string {
  const exact: Record<string, string> = {
    "a luck card": "事件卡",
    "unused builder coupon": "未使用的建房券补偿",
    "property maintenance": "地产维修费",
    "bank interest": "银行奖励",
    "bank visit": "到访银行",
    "portal toll": "传送门费用",
    "counter shield": "反击护盾",
    "coin magnet": "金币磁铁",
    "small loan": "小额贷款",
    "small loan repayment": "小额贷款还款",
    "delayed tax": "延迟税款",
    "ticket red packet": "彩券红包",
    "coin red packet": "金币红包",
    "lucky wheel": "幸运转盘",
    "unused secret build": "未使用的秘密建造补偿",
    "completing a home lap": "完成个人起点一圈"
  };
  if (exact[reason]) {
    return exact[reason];
  }
  if (reason.startsWith("passing ")) {
    return `经过 ${reason.slice("passing ".length)}`;
  }
  if (reason.startsWith("rent at ")) {
    return `${reason.slice("rent at ".length)} 租金`;
  }
  return reason;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState | null {
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function getCurrentPlayer(state: GameState): PlayerState | null {
  const playerId = state.turnOrder[state.currentTurnIndex];
  return playerId ? getPlayer(state, playerId) : null;
}

export function getTileById(state: GameState, tileId: TileId | undefined): Tile | null {
  if (!tileId) {
    return null;
  }
  return state.tiles.find((tile) => tile.id === tileId) ?? null;
}

export function getCurrentTile(state: GameState, player: PlayerState): Tile | null {
  return getTileById(state, player.currentTileId) ?? state.tiles[player.position] ?? null;
}

function requireCurrentPlayer(state: GameState, playerId: PlayerId): PlayerState | string {
  if (state.status !== "playing") {
    return "游戏尚未开始或已经结束。";
  }
  if (state.pendingMonthlySettlement) {
    return "请先关闭月度结算，等待所有玩家确认后继续。";
  }
  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return "当前不是你的回合。";
  }
  if (currentPlayer.bankrupt) {
    return "已破产玩家只能观战。";
  }
  return currentPlayer;
}

function openMonthlySettlementGate(state: GameState, settlements: MonthlyBankSettlement[]): void {
  if (settlements.length === 0) {
    return;
  }
  const waitingPlayerIds = state.players
    .filter((player) => player.connected && !player.isBot && !player.bankrupt)
    .map((player) => player.id);
  if (waitingPlayerIds.length === 0) {
    return;
  }
  state.pendingMonthlySettlement = {
    id: uid("monthly-settlement"),
    settlements,
    waitingPlayerIds,
    createdAt: Date.now()
  };
}

export function closeMonthlySettlement(state: GameState, playerId: PlayerId): boolean {
  const pending = state.pendingMonthlySettlement;
  if (!pending) {
    return false;
  }
  pending.waitingPlayerIds = pending.waitingPlayerIds.filter((id) => id !== playerId);
  if (pending.waitingPlayerIds.length === 0) {
    state.pendingMonthlySettlement = undefined;
    if (state.status === "playing" && state.phase !== "gameOver") {
      startTurnClock(state);
    }
  }
  return true;
}

export function setPlayerTile(state: GameState, player: PlayerState, tile: Tile, fromTileId?: TileId): void {
  player.lastTileId = fromTileId;
  player.currentTileId = tile.id;
  player.position = tile.index;
}

function sendPlayerToTile(state: GameState, player: PlayerState, targetTileId: TileId): MovementEvent | null {
  const fromTile = getCurrentTile(state, player);
  const targetTile = getTileById(state, targetTileId);
  if (!fromTile || !targetTile) {
    return null;
  }
  setPlayerTile(state, player, targetTile, fromTile.id);
  return createMovement(player, fromTile, [targetTile]);
}

export function createMovement(player: PlayerState, fromTile: Tile, tilePath: Tile[]): MovementEvent {
  const toTile = tilePath[tilePath.length - 1] ?? fromTile;
  return {
    playerId: player.id,
    from: fromTile.index,
    to: toTile.index,
    path: tilePath.map((tile) => tile.index),
    fromTileId: fromTile.id,
    toTileId: toTile.id,
    tilePath: tilePath.map((tile) => tile.id)
  };
}

function markBankrupt(state: GameState, player: PlayerState): BankruptNotice | null {
  if (player.bankrupt) {
    return null;
  }

  player.bankrupt = true;
  player.cash = 0;
  player.insolventUntil = undefined;
  player.skipTurns = 0;
  player.tickets = 0;
  player.skillCards = [];
  player.statusEffects = [];
  player.stocks = Object.fromEntries(STOCK_IDS.map((stockId) => [stockId, 0]));
  player.stockAccount = {
    cashFrozen: 0,
    holdings: {},
    realizedProfit: 0,
    totalMarketValue: 0,
    totalUnrealizedProfit: 0,
    totalUnrealizedProfitRate: 0,
    tradeHistory: [],
    pendingOrders: []
  };
  player.bankAccount = {
    deposit: 0,
    debtPrincipal: 0,
    unpaidInterest: 0,
    monthlyInterestAccrued: 0,
    debt: 0,
    creditLimit: state.settings.creditLimit,
    lastSettlementDay: state.gameCalendar.daysElapsed
  };
  state.pendingStockOrders = state.pendingStockOrders.filter((order) => order.playerId !== player.id);

  for (const tileId of player.properties) {
    const property = state.properties[tileId];
    if (property?.ownerId === player.id) {
      delete property.ownerId;
      property.level = 0;
      property.rentBoostTurns = 0;
      property.rentCutTurns = 0;
      property.rentHornBonus = 0;
      property.insuranceTurns = 0;
      property.mortgageFreezeTurns = 0;
    }
  }
  player.properties = [];

  addLog(state, `${player.nickname} 已经破产，转为观战。`);
  return { playerId: player.id, nickname: player.nickname };
}

function hasDetentionStatus(player: PlayerState): boolean {
  return player.statusEffects.some((effect) => (effect.type === "jail" || effect.type === "hospital") && effect.turns > 0);
}

function startInsolvencyGrace(state: GameState, player: PlayerState, reason: string): void {
  if (player.cash >= 0 || player.bankrupt) {
    player.insolventUntil = undefined;
    return;
  }
  if (!player.insolventUntil || player.insolventUntil <= Date.now()) {
    player.insolventUntil = Date.now() + 60_000;
    addLog(state, `${player.nickname} 现金为负，进入 60 秒筹款期，可抵押地产、借款或兑换资金。原因：${logReason(reason)}。`);
  }
  state.turnEndsAt = Math.max(state.turnEndsAt, player.insolventUntil);
}

function settleExpiredInsolvency(state: GameState, player: PlayerState): BankruptNotice | null {
  if (player.bankrupt || player.cash >= 0) {
    player.insolventUntil = undefined;
    return null;
  }
  if (player.insolventUntil && Date.now() >= player.insolventUntil) {
    return markBankrupt(state, player);
  }
  return null;
}

export function declareBankruptcy(state: GameState, playerId: PlayerId): ActionOutcome {
  if (state.status !== "playing") {
    return fail("游戏不在进行中。");
  }
  if (!state.settings.allowVoluntaryBankruptcy) {
    return fail("本房间未开启主动破产。");
  }

  const player = getPlayer(state, playerId);
  if (!player) {
    return fail("玩家不存在。");
  }
  if (player.bankrupt) {
    return fail("该玩家已经破产。");
  }

  const notice = markBankrupt(state, player);
  const currentPlayer = getCurrentPlayer(state);
  let stockUpdated = false;
  const extraBankrupt: BankruptNotice[] = [];
  const bankSettlements: MonthlyBankSettlement[] = [];
  if (currentPlayer?.id === player.id && state.status === "playing") {
    state.completedTurns += 1;
    const turnAdvance = advanceTurn(state);
    stockUpdated = turnAdvance.stockUpdated;
    extraBankrupt.push(...turnAdvance.bankrupted);
    bankSettlements.push(...turnAdvance.bankSettlements);
  }
  const gameEnded = checkGameEnd(state);

  return {
    ok: true,
    movements: [],
    stockUpdated,
    bankrupted: [...(notice ? [notice] : []), ...extraBankrupt],
    gameEnded,
    bankSettlements,
    ticketsUpdated: [{ playerId: player.id, tickets: player.tickets }]
  };
}

function chargePlayer(
  state: GameState,
  player: PlayerState,
  amount: number,
  reason: string,
  receiverId?: PlayerId
): { paid: number; bankrupted: BankruptNotice[] } {
  if (amount <= 0 || player.bankrupt) {
    return { paid: 0, bankrupted: [] };
  }

  const paid = Math.round(amount);
  player.cash -= paid;

  if (receiverId) {
    const receiver = getPlayer(state, receiverId);
    if (receiver && !receiver.bankrupt) {
      receiver.cash += paid;
    }
  }

  addLog(state, `${player.nickname} 因${logReason(reason)}支付 ${paid} 金币。`);
  startInsolvencyGrace(state, player, reason);
  const notice = settleExpiredInsolvency(state, player);
  return { paid, bankrupted: notice ? [notice] : [] };
}

export function addCash(state: GameState, player: PlayerState, amount: number, reason: string): void {
  if (amount <= 0 || player.bankrupt) {
    return;
  }
  player.cash += Math.round(amount);
  if (player.cash >= 0) {
    player.insolventUntil = undefined;
  }
  addLog(state, `${player.nickname} 因${logReason(reason)}获得 ${Math.round(amount)} 金币。`);
}

function adjustTickets(state: GameState, player: PlayerState, amount: number, reason: string): TicketNotice {
  const before = player.tickets;
  player.tickets = Math.max(0, player.tickets + Math.round(amount));
  const delta = player.tickets - before;
  if (delta !== 0) {
    addLog(state, `${player.nickname} 因${logReason(reason)}${delta > 0 ? "获得" : "失去"} ${Math.abs(delta)} 张彩券。`);
  }
  return { playerId: player.id, tickets: player.tickets };
}

export function addStatus(
  player: PlayerState,
  type: PlayerState["statusEffects"][number]["type"],
  turns: number,
  value?: number,
  extra: Partial<PlayerState["statusEffects"][number]> = {}
): void {
  player.statusEffects = player.statusEffects.filter((effect) => effect.type !== type);
  player.statusEffects.push({
    id: uid("status"),
    type,
    turns,
    value,
    ...extra
  });
}

function takeStatus(player: PlayerState, type: PlayerState["statusEffects"][number]["type"]) {
  const index = player.statusEffects.findIndex((effect) => effect.type === type && effect.turns > 0);
  if (index < 0) {
    return null;
  }
  const [effect] = player.statusEffects.splice(index, 1);
  return effect ?? null;
}

const nextRollStatusTypes = new Set<PlayerState["statusEffects"][number]["type"]>([
  "remoteDice",
  "slowTrap",
  "preciseStep",
  "doubleDice",
  "slowWalk",
  "reverseDice",
  "extraSteps"
]);

function tickStatuses(state: GameState, player: PlayerState): BankruptNotice[] {
  const bankrupted: BankruptNotice[] = [];
  const nextEffects: PlayerState["statusEffects"] = [];
  for (const effect of player.statusEffects) {
    if (nextRollStatusTypes.has(effect.type)) {
      nextEffects.push(effect);
      continue;
    }
    if (effect.type === "jail" || effect.type === "hospital") {
      nextEffects.push(effect);
      continue;
    }
    if ((effect.type === "smallLoan" || effect.type === "taxDelay") && effect.amount && effect.turns <= 1) {
      const payment = chargePlayer(state, player, effect.amount, effect.type === "smallLoan" ? "small loan repayment" : "delayed tax");
      bankrupted.push(...payment.bankrupted);
      continue;
    }
    const nextTurns = effect.turns - 1;
    if (nextTurns > 0) {
      nextEffects.push({ ...effect, turns: nextTurns });
    }
  }
  player.statusEffects = nextEffects;
  return bankrupted;
}

function tickDetentionStatusAfterSkippedTurn(player: PlayerState): void {
  player.statusEffects = player.statusEffects
    .map((effect) => {
      if (effect.type !== "jail" && effect.type !== "hospital") {
        return effect;
      }
      return { ...effect, turns: effect.turns - 1 };
    })
    .filter((effect) => effect.turns > 0);
}

export function updateStockMarket(state: GameState): void {
  updateStockMarketDaily(state);
  addLog(state, "股票市场完成了一次价格更新。");
}

function getForwardOptions(state: GameState, tile: Tile): Tile[] {
  const next = tile.next && tile.next.length > 0 ? tile.next : [state.tiles[(tile.index + 1) % state.tiles.length]?.id];
  return next.map((tileId) => getTileById(state, tileId)).filter((item): item is Tile => Boolean(item));
}

function getBackwardOptions(state: GameState, tile: Tile, player: PlayerState): Tile[] {
  const previous = state.tiles.filter((candidate) => (candidate.next ?? []).includes(tile.id));
  const withoutReturn = previous.filter((candidate) => candidate.id !== player.lastTileId);
  return withoutReturn.length > 0 ? withoutReturn : previous;
}

function createPathChoice(tile: Tile, options: Tile[], playerId: PlayerId, remainingSteps: number): Extract<PendingAction, { kind: "choosePath" }> {
  const labels = tile.directionLabels ?? {};
  const action: Extract<PendingAction, { kind: "choosePath" }> = {
    kind: "choosePath",
    playerId,
    fromTileId: tile.id,
    remainingSteps,
    options: options.map<PathOption>((option) => ({
      tileId: option.id,
      label: labels[option.id] ?? option.name
    }))
  };
  return action;
}

function rewardTravel(state: GameState, player: PlayerState, tile: Tile, collectSalary: boolean): TicketNotice[] {
  const notices: TicketNotice[] = [];
  const rewardTileId = state.settings.lapRewardMode === "home"
    ? player.homeStartTileId ?? GO_TILE_ID
    : GO_TILE_ID;
  if (tile.id === rewardTileId) {
    const lapMoney = state.settings.lapRewardMoney ?? START_SALARY;
    const lapTickets = state.settings.lapRewardTickets ?? 1;
    if (collectSalary && lapMoney > 0) {
      addCash(state, player, lapMoney, `passing ${tile.name}`);
    }
    if (collectSalary && lapTickets > 0) {
      notices.push(adjustTickets(state, player, lapTickets, "completing a home lap"));
    }
  }
  return notices;
}

// Moves along the authoritative graph. If a node has multiple exits, movement pauses and records a pending path choice.
function movePlayerGraph(
  state: GameState,
  player: PlayerState,
  steps: number,
  collectSalary = true
): MovementResolution & { ticketsUpdated: TicketNotice[] } {
  const fromTile = getCurrentTile(state, player);
  if (!fromTile || steps === 0 || player.bankrupt) {
    return { movement: null, ticketsUpdated: [] };
  }

  const path: Tile[] = [];
  const ticketsUpdated: TicketNotice[] = [];
  const junctionDirections: NonNullable<ActionOutcome["junctionDirections"]> = [];
  const reverseWalk = player.statusEffects.some((effect) => effect.type === "reverseWalk" && effect.turns > 0);
  const direction = (steps >= 0 ? 1 : -1) * (reverseWalk ? -1 : 1);
  let remaining = Math.abs(steps);

  while (remaining > 0) {
    const currentTile = getCurrentTile(state, player);
    if (!currentTile) {
      break;
    }

    let nextTile: Tile | null = null;
    if (direction < 0) {
      const options = getBackwardOptions(state, currentTile, player);
      nextTile = options.length > 1 ? randomItem(options) : options[0] ?? null;
    } else {
      const options = getForwardOptions(state, currentTile);
      if (options.length > 1) {
        const canChooseRoute = player.statusEffects.some((effect) => effect.type === "routeChoice" && effect.turns > 0);
        if (canChooseRoute) {
          const pathChoice = createPathChoice(currentTile, options, player.id, remaining);
          state.pendingAction = pathChoice;
          state.phase = "tileAction";
          return {
            movement: path.length > 0 ? createMovement(player, fromTile, path) : null,
            pathChoice,
            junctionDirections,
            ticketsUpdated
          };
        }
        const decision = chooseRandomDirectionAtJunction(state, player.id, currentTile.id);
        nextTile = getTileById(state, decision.nextTileId);
        junctionDirections.push({
          playerId: player.id,
          junctionTileId: currentTile.id,
          nextTileId: decision.nextTileId,
          directionLabel: decision.directionLabel,
          remainingSteps: remaining
        });
        addLog(state, `${player.nickname} 到达 ${currentTile.name}，系统随机决定：${decision.directionLabel}。`);
      } else {
        nextTile = options[0] ?? null;
      }
    }

    if (!nextTile) {
      break;
    }

    const previousTileId = currentTile.id;
    setPlayerTile(state, player, nextTile, previousTileId);
    path.push(nextTile);
    ticketsUpdated.push(...rewardTravel(state, player, nextTile, collectSalary && direction > 0));
    remaining -= 1;
  }

  return {
    movement: path.length > 0 ? createMovement(player, fromTile, path) : null,
    junctionDirections,
    ticketsUpdated
  };
}

export function movePlayer(
  state: GameState,
  playerId: PlayerId,
  steps: number,
  collectSalary = true
): MovementEvent | null {
  const player = getPlayer(state, playerId);
  if (!player || player.bankrupt) {
    return null;
  }
  return movePlayerGraph(state, player, steps, collectSalary).movement;
}

function createTileEvent(
  state: GameState,
  player: PlayerState,
  tile: Tile,
  title: string,
  message: string,
  tone: TileEvent["tone"],
  card?: LuckCard
): TileEvent {
  const event: TileEvent = {
    id: uid("event"),
    playerId: player.id,
    tileId: tile.id,
    title,
    message,
    tone,
    card
  };
  state.lastEvent = event;
  addLog(state, `${player.nickname}: ${title} - ${message}`);
  return event;
}

function chooseOwnedProperty(state: GameState, player: PlayerState): PropertyState | null {
  const owned = player.properties
    .map((tileId) => state.properties[tileId])
    .filter((property): property is PropertyState => Boolean(property));
  return owned.length > 0 ? randomItem(owned) : null;
}

function drawWeightedCard(deck: LuckCard["deck"], player: PlayerState): { card: LuckCard; consumedBoost: boolean } {
  const hasBoost =
    (deck === "chance" && Boolean(player.statusEffects.find((effect) => effect.type === "luckyCharm"))) ||
    (deck === "lottery" && Boolean(player.statusEffects.find((effect) => effect.type === "lotteryBoost"))) ||
    (deck === "arcade" && Boolean(player.statusEffects.find((effect) => effect.type === "luckyCharm")));
  let cards = luckCards.filter((card) => card.deck === deck);
  if (hasBoost) {
    const goodCards = cards.filter((card) => card.tone !== "bad");
    cards = goodCards.length > 0 ? goodCards : cards;
  }

  const total = cards.reduce((sum, card) => sum + card.weight, 0);
  let cursor = Math.random() * total;
  for (const card of cards) {
    cursor -= card.weight;
    if (cursor <= 0) {
      return { card, consumedBoost: hasBoost };
    }
  }
  return { card: cards[cards.length - 1] ?? randomItem(luckCards), consumedBoost: hasBoost };
}

function applyLuckEffect(state: GameState, player: PlayerState, effect: LuckCardEffect): EffectResult {
  const result: EffectResult = {
    details: [],
    movements: [],
    bankrupted: [],
    stockUpdated: false,
    ticketsUpdated: []
  };

  if (effect.type === "cash") {
    const amount = effect.amount ?? 0;
    if (amount >= 0) {
      addCash(state, player, amount, "a luck card");
    } else {
      const payment = chargePlayer(state, player, Math.abs(amount), "a luck card");
      result.bankrupted.push(...payment.bankrupted);
    }
    result.details.push(`现金变化 ${amount >= 0 ? "+" : ""}${amount}。`);
    return result;
  }

  if (effect.type === "tickets") {
    const amount = effect.amount ?? 0;
    result.ticketsUpdated.push(adjustTickets(state, player, amount, "a luck card"));
    result.details.push(`彩券变化 ${amount >= 0 ? "+" : ""}${amount}。`);
    return result;
  }

  if (effect.type === "moveSteps") {
    const movement = movePlayerGraph(state, player, effect.steps ?? 0, (effect.steps ?? 0) > 0);
    if (movement.movement) {
      result.movements.push(movement.movement);
    }
    result.ticketsUpdated.push(...movement.ticketsUpdated);
    result.pathChoice = movement.pathChoice;
    result.details.push(`移动 ${effect.steps ?? 0} 格。`);
    if (!movement.pathChoice && movement.movement) {
      const tileOutcome = handleTileEffect(state, player.id, { allowPortalTrigger: false });
      result.tileOutcome = tileOutcome;
      if (tileOutcome.tileEvent) {
        result.details.push(tileOutcome.tileEvent.message);
      }
    }
    return result;
  }

  if (effect.type === "skipTurn") {
    player.skipTurns += effect.turns ?? 1;
    result.details.push(`将跳过 ${effect.turns ?? 1} 个回合。`);
    return result;
  }

  if (effect.type === "stockGrant") {
    const symbol = effect.symbol ?? randomItem([...STOCK_IDS]);
    const quantity = effect.quantity ?? 1;
    grantStockShares(state, player, symbol, quantity);
    result.details.push(`获得 ${quantity} 股 ${state.stocks[symbol]?.name ?? symbol}。`);
    return result;
  }

  if (effect.type === "stockShift") {
    const symbol = effect.symbol ?? randomItem([...STOCK_IDS]);
    const stock = state.stocks[symbol];
    const previousPrice = stock.currentPrice;
    const nextPrice = Math.max(5, Math.round(previousPrice * (1 + (effect.percent ?? 0))));
    stock.previousPrice = previousPrice;
    stock.currentPrice = nextPrice;
    stock.price = nextPrice;
    stock.change = nextPrice - previousPrice;
    stock.trend = stock.change;
    stock.changeRate = previousPrice > 0 ? Math.round((stock.change / previousPrice) * 10000) / 100 : 0;
    stock.history.push({
      year: state.gameCalendar.year,
      month: state.gameCalendar.month,
      day: state.gameCalendar.day,
      price: nextPrice
    });
    stock.history = stock.history.slice(-90);
    updatePlayerStockAccounts(state);
    result.stockUpdated = true;
    result.details.push(`${stock.name} 价格变化 ${Math.round((effect.percent ?? 0) * 100)}%。`);
    return result;
  }

  if (effect.type === "remoteTrade") {
    addStatus(player, "remoteTrade", effect.turns ?? 1);
    result.details.push("获得一次临时远程交易机会。");
    return result;
  }

  if (effect.type === "skillGrant") {
    const message = grantRandomSkillCard(state, player, effect.rarity);
    result.details.push(message);
    return result;
  }

  if (effect.type === "skillLose") {
    const message = loseRandomSkillCard(state, player);
    result.details.push(message);
    result.ticketsUpdated.push({ playerId: player.id, tickets: player.tickets });
    return result;
  }

  if (effect.type === "skillShopDiscount") {
    addStatus(player, "shopDiscount", effect.turns ?? 5, 1, {
      amount: 3,
      label: "商店折扣",
      description: "下次技能商店前 3 张卡各便宜 1 张彩券，最低 1 张。"
    });
    result.details.push("下次进入技能商店时，前 3 张技能卡各便宜 1 张彩券，最低 1 张。");
    return result;
  }

  if (effect.type === "skillHandLimit") {
    const amount = Math.max(1, effect.amount ?? 1);
    player.maxSkillCards = Math.min(8, player.maxSkillCards + amount);
    result.details.push(`技能卡手牌上限增加 ${amount}。`);
    return result;
  }

  if (effect.type === "skillRecyclePenalty") {
    addStatus(player, "skillRecyclePenalty", effect.turns ?? 3, 0.5);
    result.details.push("短时间内回收技能卡只能获得一半彩券。");
    return result;
  }

  if (effect.type === "skillBlock") {
    addStatus(player, "skillBlock", effect.turns ?? 1);
    result.details.push("技能卡暂时被干扰，短时间内不能使用主动技能。");
    return result;
  }

  if (effect.type === "freeUpgrade") {
    const property = chooseOwnedProperty(state, player);
    if (property && property.level < MAX_PROPERTY_LEVEL) {
      property.level += 1;
      result.details.push("一块自有地产免费提升 1 级。");
    } else {
      addCash(state, player, 600, "unused builder coupon");
      result.details.push("没有可升级地产，改为获得 600 金币。");
    }
    return result;
  }

  if (effect.type === "repairFee") {
    let taxableProperties = player.properties.length;
    for (const tileId of player.properties) {
      const property = state.properties[tileId];
      if (property?.insuranceTurns && property.insuranceTurns > 0) {
        property.insuranceTurns = 0;
        taxableProperties = Math.max(0, taxableProperties - 1);
      }
    }
    const amount = taxableProperties * (effect.amount ?? 200);
    const payment = chargePlayer(state, player, amount, "property maintenance");
    result.bankrupted.push(...payment.bankrupted);
    result.details.push(`地产维修费：${amount} 金币。`);
    return result;
  }

  if (effect.type === "taxRelief") {
    addStatus(player, "taxShield", effect.turns ?? 3);
    result.details.push("税收减免已准备好，将抵消下一次税收格。");
    return result;
  }

  addStatus(player, "rentShield", effect.turns ?? 2);
  result.details.push("租金护盾已准备好，将抵挡下一次租金。");
  return result;
}

export function debugResolveSpecificLuckCard(state: GameState, playerId: PlayerId, cardId: string): ActionOutcome {
  const player = getPlayer(state, playerId);
  if (!player) {
    return fail("Player not found.");
  }
  const tile = getCurrentTile(state, player);
  if (!tile) {
    return fail("Current tile not found.");
  }
  const card = luckCards.find((item) => item.id === cardId);
  if (!card) {
    return fail("Luck card not found.");
  }

  const effect = applyLuckEffect(state, player, card.effect);
  const movements = [...effect.movements];
  const teleports: MovementEvent[] = [];
  const bankrupted = [...effect.bankrupted];
  const ticketsUpdated = [...effect.ticketsUpdated];
  let stockUpdated = effect.stockUpdated;
  let pathChoice = effect.pathChoice;
  let portalChoice: ActionOutcome["portalChoice"];
  let lotteryPanel: ActionOutcome["lotteryPanel"];
  let skillShop: ActionOutcome["skillShop"];
  const privateSignals: NonNullable<ActionOutcome["privateSignals"]> = [];

  if (effect.tileOutcome) {
    movements.push(...effect.tileOutcome.movements);
    teleports.push(...(effect.tileOutcome.teleports ?? []));
    bankrupted.push(...effect.tileOutcome.bankrupted);
    ticketsUpdated.push(...(effect.tileOutcome.ticketsUpdated ?? []));
    stockUpdated = effect.tileOutcome.stockUpdated || stockUpdated;
    pathChoice = effect.tileOutcome.pathChoice ?? pathChoice;
    portalChoice = effect.tileOutcome.portalChoice ?? portalChoice;
    lotteryPanel = effect.tileOutcome.lotteryPanel ?? lotteryPanel;
    skillShop = effect.tileOutcome.skillShop ?? skillShop;
    privateSignals.push(...(effect.tileOutcome.privateSignals ?? []));
  }

  const tileEvent = createTileEvent(
    state,
    player,
    tile,
    card.title,
    `${card.description} ${effect.details.join(" ")}`.trim(),
    card.tone,
    card
  );
  state.phase = "tileAction";
  const gameEnded = Boolean(effect.tileOutcome?.gameEnded) || checkGameEnd(state);

  return {
    ok: true,
    movements,
    teleports,
    tileEvent,
    stockUpdated,
    bankrupted,
    gameEnded,
    pathChoice,
    portalChoice,
    lotteryPanel,
    skillShop,
    ticketsUpdated,
    luckCard: { playerId: player.id, card, tileEvent },
    privateSignals
  };
}

export function debugTeleportToTile(
  state: GameState,
  playerId: PlayerId,
  targetTileId: TileId,
  resolveTile = false
): ActionOutcome {
  const player = getPlayer(state, playerId);
  if (!player) {
    return fail("Player not found.");
  }
  const targetTile = getTileById(state, targetTileId);
  if (!targetTile) {
    return fail("Target tile not found.");
  }
  const fromTile = getCurrentTile(state, player);
  setPlayerTile(state, player, targetTile, fromTile?.id);
  addLog(state, `${player.nickname} 被管理员传送到了 ${targetTile.name}。`);

  const movement = fromTile ? createMovement(player, fromTile, [targetTile]) : null;
  if (!resolveTile) {
    state.phase = "tileAction";
    return {
      ok: true,
      movements: movement ? [movement] : [],
      teleports: movement ? [movement] : [],
      stockUpdated: false,
      bankrupted: [],
      gameEnded: checkGameEnd(state)
    };
  }

  const tileOutcome = handleTileEffect(state, player.id);
  return {
    ...tileOutcome,
    movements: movement ? [movement, ...tileOutcome.movements] : tileOutcome.movements,
    teleports: movement ? [movement, ...(tileOutcome.teleports ?? [])] : tileOutcome.teleports
  };
}

function drawWeightedSkill<T extends typeof skillCardTemplates[number]>(pool: T[]): T {
  const total = pool.reduce((sum, template) => sum + (rarityWeights[template.rarity] ?? 1), 0);
  let cursor = Math.random() * total;
  for (const template of pool) {
    cursor -= rarityWeights[template.rarity] ?? 1;
    if (cursor <= 0) {
      return template;
    }
  }
  const fallback = pool[pool.length - 1];
  if (!fallback) {
    throw new Error("Cannot draw from an empty skill pool.");
  }
  return fallback;
}

const disabledSkillCodes = new Set<string>(["remoteTrade", "portalDiscount", "teleport"]);

function availableSkillTemplates(state: GameState): typeof skillCardTemplates {
  const base = skillCardTemplates.filter((template) => !disabledSkillCodes.has(template.code));
  return state.settings.enableSpecialCards === false
    ? base.filter((template) => template.rarity !== "epic")
    : base;
}

function pickSkillOffers(pool: typeof skillCardTemplates, count: number): typeof skillCardTemplates {
  const remaining = [...pool];
  const picked: typeof skillCardTemplates = [];
  while (picked.length < count && remaining.length > 0) {
    const next = drawWeightedSkill(remaining);
    picked.push(next);
    const index = remaining.findIndex((item) => item.code === next.code);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }
  return picked;
}

function grantRandomSkillCard(state: GameState, player: PlayerState, rarity?: SkillCard["rarity"]): string {
  if (player.skillCards.length >= player.maxSkillCards) {
    player.tickets += 1;
    return "技能卡手牌已满，改为获得 1 张彩券。";
  }
  const fullPool = availableSkillTemplates(state);
  const pool = rarity
    ? fullPool.filter((template) => template.rarity === rarity)
    : fullPool;
  const template = drawWeightedSkill(pool.length > 0 ? pool : fullPool);
  const card = makeSkillCard(template, uid("skill"));
  player.skillCards.push(card);
  addLog(state, `${player.nickname} 获得技能卡 ${card.displayName ?? card.name}。`);
  return `获得技能卡 ${card.displayName ?? card.name}。`;
}

function loseRandomSkillCard(state: GameState, player: PlayerState): string {
  if (player.skillCards.length === 0) {
    player.tickets = Math.max(0, player.tickets - 1);
    return "没有可失去的技能卡，改为失去 1 张彩券。";
  }
  const index = Math.floor(Math.random() * player.skillCards.length);
  const [removed] = player.skillCards.splice(index, 1);
  addLog(state, `${player.nickname} 失去技能卡 ${removed?.displayName ?? removed?.name ?? "未知卡"}。`);
  return `失去技能卡 ${removed?.displayName ?? removed?.name ?? "未知卡"}。`;
}

function buildSkillShopOffers(state: GameState, player: PlayerState): SkillCard[] {
  const pool = availableSkillTemplates(state);
  const offerCount = Math.max(1, Math.min(20, Math.floor(state.settings.skillShopOfferCount ?? 8)));
  const affordable = pool.filter((template) => template.costTickets <= player.tickets);
  const expensive = pool.filter((template) => template.costTickets > player.tickets);
  const picked = [
    ...pickSkillOffers(affordable, offerCount),
    ...pickSkillOffers(expensive, Math.max(0, offerCount - Math.min(offerCount, affordable.length)))
  ].slice(0, offerCount);
  return picked.map((template) => makeSkillCard(template, uid("skill")));
}

function getSkillDistance(state: GameState, fromTileId: TileId, toTileId: TileId): number {
  if (fromTileId === toTileId) {
    return 0;
  }

  const neighbors = new Map<TileId, TileId[]>();
  for (const tile of state.tiles) {
    const current = neighbors.get(tile.id) ?? [];
    for (const next of tile.next ?? []) {
      current.push(next);
      neighbors.set(tile.id, current);
      const reverse = neighbors.get(next) ?? [];
      reverse.push(tile.id);
      neighbors.set(next, reverse);
    }
  }

  const queue: Array<{ tileId: TileId; distance: number }> = [{ tileId: fromTileId, distance: 0 }];
  const seen = new Set<TileId>([fromTileId]);
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    for (const next of neighbors.get(item.tileId) ?? []) {
      if (seen.has(next)) {
        continue;
      }
      if (next === toTileId) {
        return item.distance + 1;
      }
      seen.add(next);
      queue.push({ tileId: next, distance: item.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

interface TileEffectOptions {
  allowPortalTrigger?: boolean;
}

export function handleTileEffect(state: GameState, playerId: PlayerId, options: TileEffectOptions = {}): ActionOutcome {
  const player = getPlayer(state, playerId);
  if (!player) {
    return fail("Player not found.");
  }
  const tile = getCurrentTile(state, player);
  if (!tile) {
    return fail("Tile not found.");
  }

  state.pendingAction = null;
  let tileEvent: TileEvent;
  const movements: MovementEvent[] = [];
  const teleports: MovementEvent[] = [];
  const bankrupted: BankruptNotice[] = [];
  const ticketsUpdated: TicketNotice[] = [];
  let stockUpdated = false;
  let luckCardPayload: ActionOutcome["luckCard"];
  let skillShop: ActionOutcome["skillShop"];
  let pathChoice: ActionOutcome["pathChoice"];
  let portalChoice: ActionOutcome["portalChoice"];
  let lotteryPanel: ActionOutcome["lotteryPanel"];
  const privateSignals: NonNullable<ActionOutcome["privateSignals"]> = [];

  if (tile.type === "start") {
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "Start Plaza",
      "A calm stop at a personal starting plaza.",
      "good"
    );
  } else if (tile.type === "property") {
    const property = state.properties[tile.id];
    if (!property) {
      return fail("Property state not found.");
    }

    if (!property.ownerId) {
      state.pendingAction = { kind: "buyProperty", tileId: tile.id };
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "Open Lot",
        `${tile.name} can be bought for ${tile.price ?? 0} coins.`,
        "neutral"
      );
    } else if (property.ownerId === player.id) {
      if (property.isMortgaged) {
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "抵押地产",
          `${tile.name} 已抵押，赎回后才能升级和收租。`,
          "neutral"
        );
      } else if (property.level < MAX_PROPERTY_LEVEL) {
        state.pendingAction = { kind: "upgradeProperty", tileId: tile.id };
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "Owned Property",
          `${tile.name} can be upgraded for ${getUpgradeCost(tile, property)} coins.`,
          "good"
        );
      } else {
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "Max Level",
          `${tile.name} is already fully upgraded.`,
          "good"
        );
      }
    } else if (property.isMortgaged) {
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "抵押地产",
        "该地产已抵押，本次不收取租金。",
        "neutral"
      );
    } else if (takeStatus(player, "rentShield")) {
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "租金护盾",
        "租金护盾挡下了这次付款。",
        "good"
      );
    } else {
      const owner = getPlayer(state, property.ownerId);
      if (owner && hasDetentionStatus(owner)) {
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "暂停收租",
          `${owner.nickname} 正在医院或监狱，${tile.name} 本次不收租。`,
          "neutral"
        );
      } else if (owner?.statusEffects.some((effect) => effect.type === "ownerRentBlock" && effect.turns > 0)) {
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "房东假期",
          `${owner.nickname} 正在房东假期中，${tile.name} 本次不收租。`,
          "good"
        );
      } else if (player.statusEffects.some((effect) => effect.type === "rentHoliday" && effect.turns > 0)) {
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "假日券",
          "假日券生效，本次不支付租金。",
          "good"
        );
      } else {
        let rent = calculateRent(state, tile.id, player.id);
        if (property.rentLimitTurns && property.rentLimitTurns > 0 && property.rentLimitAmount !== undefined) {
          rent = Math.min(rent, property.rentLimitAmount);
        }
        if (takeStatus(player, "rentDiscountTicket")) {
          rent = Math.ceil(rent * 0.5);
        }
        const comfortKit = player.statusEffects.find((effect) => effect.type === "repairKit" && effect.turns > 0);
        if (comfortKit) {
          rent = Math.ceil(rent * 0.5);
        }
        const rentCoupon = player.statusEffects.find((effect) => effect.type === "repairDiscount" && effect.turns > 0);
        if (rentCoupon) {
          rent = Math.ceil(rent * 0.7);
        }
        const payment = chargePlayer(state, player, rent, `rent at ${tile.name}`, property.ownerId);
        if (property.rentHornBonus && property.rentHornBonus > 0) {
          property.rentHornBonus = 0;
        }
        bankrupted.push(...payment.bankrupted);
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "支付租金",
          `${owner?.nickname ?? "业主"} 收取了 ${payment.paid} 金币租金。${comfortKit ? " 安居维修包让本次租金减半。" : ""}${rentCoupon ? " 房租折扣券让本次租金七折。" : ""}`,
          "bad"
        );
      }
    }
  } else if (tile.type === "choice_junction" || tile.type === "junction") {
    const options = (tile.next ?? [])
      .map((tileId) => tile.directionLabels?.[tileId] ?? getTileById(state, tileId)?.name)
      .filter(Boolean)
      .join(" / ");
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "路口停靠",
      options ? `这里是岔路口，下一次经过会由系统随机决定方向：${options}。` : "这里是岔路口。",
      "neutral"
    );
  } else if (tile.type === "go_jail" || tile.type === "hospital_entry") {
    const targetTileId = tile.type === "go_jail" ? "jail-05" : "hospital-05";
    const targetTile = getTileById(state, targetTileId);
    const movement = targetTile ? sendPlayerToTile(state, player, targetTile.id) : null;
    if (movement) {
      teleports.push(movement);
      movements.push(movement);
    }
    const baseTurns = tile.type === "go_jail" ? state.settings.jailTurns ?? 3 : state.settings.hospitalTurns ?? 3;
    const reduced = tile.type === "go_jail" ? takeStatus(player, "bailPermit") : takeStatus(player, "medicalInsurance");
    const turns = Math.max(1, baseTurns - (reduced ? 1 : 0));
    const statusType = tile.type === "go_jail" ? "jail" : "hospital";
    addStatus(player, statusType, turns, undefined, {
      label: tile.type === "go_jail" ? "泡泡监狱" : "棉花糖医院",
      description: `停留 ${turns} 回合，可在对应面板支付费用提前离开。`
    });
    player.skipTurns = Math.max(player.skipTurns, turns);
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      tile.type === "go_jail" ? "进入监狱" : "进入医院",
      tile.type === "go_jail"
        ? `你被送往泡泡监狱，停留 ${turns} 回合。${reduced ? " 保释券让停留减少 1 回合。" : ""}`
        : `你被送往棉花糖医院，停留 ${turns} 回合。${reduced ? " 医疗保险让停留减少 1 回合。" : ""}`,
      "bad"
    );
  } else if (tile.type === "jail" || tile.type === "hospital") {
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      tile.type === "jail" ? "泡泡监狱" : "棉花糖医院",
      tile.description ?? "这里是处罚支路，等待回合结束后会逐步恢复行动。",
      "neutral"
    );
  } else if (tile.type === "reward") {
    if (tile.shortName?.includes("彩券")) {
      ticketsUpdated.push(adjustTickets(state, player, 1, tile.name));
      tileEvent = createTileEvent(state, player, tile, "支路补给", "获得 1 张彩券。", "good");
    } else {
      addCash(state, player, 500, tile.name);
      tileEvent = createTileEvent(state, player, tile, "支路补给", "获得 500 金币。", "good");
    }
  } else if (tile.type === "draw_card") {
    const beforeTickets = player.tickets;
    const message = grantRandomSkillCard(state, player, "common");
    if (player.tickets !== beforeTickets) {
      ticketsUpdated.push({ playerId: player.id, tickets: player.tickets });
    }
    tileEvent = createTileEvent(state, player, tile, "抽卡补给", message, "good");
  } else if (tile.type === "bank") {
    const bonus = state.settings.bankVisitMoney ?? 400;
    const ticketBonus = state.settings.bankVisitTickets ?? 1;
    if (bonus > 0) {
      addCash(state, player, bonus, "bank visit");
    }
    if (ticketBonus > 0) {
      ticketsUpdated.push(adjustTickets(state, player, ticketBonus, "bank visit"));
    }
    state.pendingAction = { kind: "bank", playerId: player.id, tileId: tile.id };
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "银行服务",
      `银行赠送 ${bonus} 金币和 ${ticketBonus} 张彩券，可继续办理存款、取款、信用借款或还款。`,
      "good"
    );
  } else if (tile.type === "stock") {
    state.pendingAction = { kind: "stockMarket", tileId: tile.id };
    const message = applyStockTileEffect(state, player.id, tile.name);
    const latestPrivateSignal = [...(state.marketSignals ?? [])]
      .reverse()
      .find((signal) => !signal.isPublic && signal.ownerPlayerId === player.id && signal.source === "stock_tile");
    if (latestPrivateSignal) {
      privateSignals.push({ playerId: player.id, signal: latestPrivateSignal });
    }
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "Stock Market",
      message,
      "neutral"
    );
  } else if (tile.type === "skillShop") {
    const offers = buildSkillShopOffers(state, player);
    state.pendingAction = { kind: "skillShop", playerId: player.id, tileId: tile.id, offers };
    skillShop = { playerId: player.id, offers };
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "Skill Shop",
      "Spend tickets to buy one active skill card.",
      "neutral"
    );
  } else if (tile.type === "lottery") {
    const config = lotteryConfig(state);
    const combo = takeStatus(player, "lotteryCombo");
    const maxTickets = config.maxTickets + (combo ? 2 : 0);
    state.pendingAction = {
      kind: "lottery",
      playerId: player.id,
      tileId: tile.id,
      maxTickets,
      ticketPrice: config.ticketPrice,
      purchasedCount: 0
    };
    lotteryPanel = state.pendingAction;
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      "彩票店",
      `可以购买彩票，每张 ${config.ticketPrice} 金币，最多 ${maxTickets} 张。也可以跳过。`,
      "neutral"
    );
  } else if (tile.type === "arcade" || tile.type === "chance" || tile.type === "misfortune") {
    const deck = tile.type === "chance" || tile.type === "misfortune" ? tile.type : tile.type;
    const { card, consumedBoost } = drawWeightedCard(deck, player);
    if (consumedBoost) {
      takeStatus(player, "luckyCharm");
    }
    const effect = applyLuckEffect(state, player, card.effect);
    movements.push(...effect.movements);
    bankrupted.push(...effect.bankrupted);
    ticketsUpdated.push(...effect.ticketsUpdated);
    stockUpdated = effect.stockUpdated;
    pathChoice = effect.pathChoice;
    if (effect.tileOutcome) {
      movements.push(...effect.tileOutcome.movements);
      teleports.push(...(effect.tileOutcome.teleports ?? []));
      bankrupted.push(...effect.tileOutcome.bankrupted);
      ticketsUpdated.push(...(effect.tileOutcome.ticketsUpdated ?? []));
      stockUpdated = effect.tileOutcome.stockUpdated || stockUpdated;
      pathChoice = effect.tileOutcome.pathChoice ?? pathChoice;
      portalChoice = effect.tileOutcome.portalChoice ?? portalChoice;
      skillShop = effect.tileOutcome.skillShop ?? skillShop;
      lotteryPanel = effect.tileOutcome.lotteryPanel ?? lotteryPanel;
      privateSignals.push(...(effect.tileOutcome.privateSignals ?? []));
    }
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      card.title,
      `${card.description} ${effect.details.join(" ")}`.trim(),
      card.tone,
      card
    );
    luckCardPayload = { playerId: player.id, card, tileEvent };
  } else if (tile.type === "tax") {
    if (takeStatus(player, "taxShield")) {
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "Tax Coupon",
        "A tax coupon waived this payment.",
        "good"
      );
    } else {
      const amount = tile.taxAmount ?? Math.max(500, Math.round(player.cash * 0.1));
      const delay = takeStatus(player, "taxDelay");
      if (delay && !delay.amount) {
        addStatus(player, "taxDelay", 3, undefined, { amount });
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "税务缓缴",
          `本次 ${amount} 金币税费延迟 3 天支付。`,
          "neutral"
        );
      } else {
        const payment = chargePlayer(state, player, amount, tile.name);
        bankrupted.push(...payment.bankrupted);
        tileEvent = createTileEvent(
          state,
          player,
          tile,
          "Tax Office",
          `Paid ${payment.paid} coins.`,
          "bad"
        );
      }
    }
  } else if (tile.type === "plaza" || tile.type === "safe_landing" || tile.type === "empty") {
    tileEvent = createTileEvent(
      state,
      player,
      tile,
      tile.type === "safe_landing" ? "安全落点" : "广场休息",
      tile.description ?? "这里没有收费和随机惩罚，可以安心观察地图。",
      "neutral"
    );
  } else {
    if (options.allowPortalTrigger === false) {
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "安全落点",
        "本次移动落在传送区域，但不会再次连环传送。",
        "neutral"
      );
      state.phase = "tileAction";
      const gameEnded = checkGameEnd(state);
      return {
        ok: true,
        movements,
        teleports,
        tileEvent,
        stockUpdated,
        bankrupted,
        gameEnded,
        pathChoice,
        portalChoice,
        lotteryPanel,
        skillShop,
        ticketsUpdated,
        luckCard: luckCardPayload,
        privateSignals
      };
    }
    const portalOptions = tile.portalOptions && tile.portalOptions.length > 0
      ? tile.portalOptions
      : tile.portalTargetId
        ? [{ targetTileId: tile.portalTargetId, label: "传送目标", costTickets: tile.portalCostTickets ?? 0 }]
        : [];
    if (portalOptions.length > 0) {
      const pending: Extract<PendingAction, { kind: "portalChoice" }> = {
        kind: "portalChoice",
        playerId: player.id,
        tileId: tile.id,
        options: portalOptions,
        canCancel: true
      };
      state.pendingAction = pending;
      portalChoice = pending;
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "传送门",
        "你进入了中央传送门，请选择目的地。",
        "neutral"
      );
    } else {
      tileEvent = createTileEvent(
        state,
        player,
        tile,
        "传送门关闭",
        "这个传送门暂时没有可用目的地。",
        "neutral"
      );
    }
  }

  state.phase = "tileAction";
  const gameEnded = checkGameEnd(state);
  return {
    ok: true,
    movements,
    teleports,
    tileEvent,
    stockUpdated,
    bankrupted,
    gameEnded,
    pathChoice,
    portalChoice,
    lotteryPanel,
    skillShop,
    ticketsUpdated,
    luckCard: luckCardPayload,
    privateSignals
  };
}

function consumeDiceStatuses(player: PlayerState, rolledValue: number): number {
  const remote = takeStatus(player, "remoteDice");
  const slowTrap = takeStatus(player, "slowTrap");
  const preciseStep = takeStatus(player, "preciseStep");
  const doubleDice = takeStatus(player, "doubleDice");
  const slowWalk = takeStatus(player, "slowWalk");
  const reverseDice = takeStatus(player, "reverseDice");
  const extraSteps = takeStatus(player, "extraSteps");
  let value = preciseStep ? 1 : remote?.value ? Math.max(1, Math.min(6, Math.floor(remote.value))) : rolledValue;
  if (slowTrap) {
    value = 1;
  }
  if (doubleDice) {
    value *= 2;
  }
  if (slowWalk) {
    value = Math.min(value, 3);
  }
  if (reverseDice) {
    value *= -1;
  }
  if (extraSteps?.value) {
    value += Math.sign(value || 1) * Math.max(0, Math.floor(extraSteps.value));
  }
  return value;
}

export function rollDice(state: GameState, playerId: PlayerId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.phase !== "waitingRoll") {
    return fail("This turn already rolled the dice.");
  }

  const value = consumeDiceStatuses(current, Math.floor(Math.random() * 6) + 1);
  state.dice = value;
  state.pendingAction = null;

  const movement = movePlayerGraph(state, current, value, true);
  const movements = movement.movement ? [movement.movement] : [];

  if (movement.pathChoice) {
    const tile = getCurrentTile(state, current);
    const tileEvent = tile
      ? createTileEvent(state, current, tile, "选择道路", "请选择一条路继续移动。", "neutral")
      : undefined;
    return {
      ok: true,
      dice: value,
      movements,
      tileEvent,
      stockUpdated: false,
      bankrupted: [],
      gameEnded: false,
      pathChoice: movement.pathChoice,
      junctionDirections: movement.junctionDirections,
      ticketsUpdated: movement.ticketsUpdated
    };
  }

  const tileOutcome = handleTileEffect(state, current.id);
  return {
    ...tileOutcome,
    dice: value,
    movements: [...movements, ...tileOutcome.movements],
    junctionDirections: [
      ...(movement.junctionDirections ?? []),
      ...(tileOutcome.junctionDirections ?? [])
    ],
    ticketsUpdated: [...movement.ticketsUpdated, ...(tileOutcome.ticketsUpdated ?? [])]
  };
}

export function choosePathDirection(state: GameState, playerId: PlayerId, tileId: TileId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }

  const pending = state.pendingAction;
  if (pending?.kind !== "choosePath" || pending.playerId !== current.id) {
    return fail("当前没有等待你选择的岔路。");
  }
  if (!pending.options.some((option) => option.tileId === tileId)) {
    return fail("这条路不可选择。");
  }

  const fromTile = getCurrentTile(state, current);
  const targetTile = getTileById(state, tileId);
  if (!fromTile || !targetTile) {
    return fail("没有找到目标道路。");
  }

  state.pendingAction = null;
  const routeChoiceIndex = current.statusEffects.findIndex((effect) => effect.type === "routeChoice" && effect.turns > 0);
  if (routeChoiceIndex >= 0) {
    const routeChoice = current.statusEffects[routeChoiceIndex];
    if (routeChoice) {
      const remainingChoices = Math.max(0, (routeChoice.amount ?? 1) - 1);
      if (remainingChoices > 0) {
        current.statusEffects[routeChoiceIndex] = { ...routeChoice, amount: remainingChoices };
      } else {
        current.statusEffects.splice(routeChoiceIndex, 1);
      }
    }
  }
  setPlayerTile(state, current, targetTile, fromTile.id);
  const firstMovement = createMovement(current, fromTile, [targetTile]);
  const ticketsUpdated = rewardTravel(state, current, targetTile, true);
  const remaining = Math.max(0, pending.remainingSteps - 1);
  const tail = remaining > 0
    ? movePlayerGraph(state, current, remaining, true)
    : { movement: null, ticketsUpdated: [], junctionDirections: [] };
  const movements = [firstMovement, ...(tail.movement ? [tail.movement] : [])];
  ticketsUpdated.push(...tail.ticketsUpdated);
  addLog(state, `${current.nickname} 选择了 ${targetTile.name}。`);

  if (tail.pathChoice) {
    const tileEvent = createTileEvent(
      state,
      current,
      getCurrentTile(state, current) ?? targetTile,
      "选择道路",
      "请选择一条路继续移动。",
      "neutral"
    );
    return {
      ok: true,
      movements,
      tileEvent,
      stockUpdated: false,
      bankrupted: [],
      gameEnded: false,
      pathChoice: tail.pathChoice,
      junctionDirections: tail.junctionDirections,
      ticketsUpdated
    };
  }

  const tileOutcome = handleTileEffect(state, current.id);
  return {
    ...tileOutcome,
    movements: [...movements, ...tileOutcome.movements],
    junctionDirections: [
      ...(tail.junctionDirections ?? []),
      ...(tileOutcome.junctionDirections ?? [])
    ],
    ticketsUpdated: [...ticketsUpdated, ...(tileOutcome.ticketsUpdated ?? [])]
  };
}

export function choosePortalDestination(state: GameState, playerId: PlayerId, targetTileId: TileId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  const pending = state.pendingAction;
  if (pending?.kind !== "portalChoice" || pending.playerId !== current.id) {
    return fail("当前没有等待选择的传送门。");
  }
  const option = pending.options.find((item) => item.targetTileId === targetTileId);
  if (!option) {
    return fail("这个传送目的地不可用。");
  }
  const portalDiscountIndex =
    option.costTickets > 0
      ? current.statusEffects.findIndex((effect) => effect.type === "portalDiscount" && effect.turns > 0)
      : -1;
  const portalCost = Math.max(0, option.costTickets - (portalDiscountIndex >= 0 ? 1 : 0));
  if (current.tickets < portalCost) {
    return fail("彩券不足，无法传送到该目的地。");
  }
  const fromTile = getCurrentTile(state, current);
  const targetTile = getTileById(state, targetTileId);
  if (!fromTile || !targetTile) {
    return fail("传送目的地不存在。");
  }

  const ticketsUpdated: TicketNotice[] = [];
  if (portalDiscountIndex >= 0) {
    current.statusEffects.splice(portalDiscountIndex, 1);
  }
  if (portalCost > 0) {
    ticketsUpdated.push(adjustTickets(state, current, -portalCost, "portal toll"));
  }
  state.pendingAction = null;
  setPlayerTile(state, current, targetTile, fromTile.id);
  const movement = createMovement(current, fromTile, [targetTile]);
  const teleportEvent = createTileEvent(
    state,
    current,
    fromTile,
    "传送成功",
    `传送到【${targetTile.name}】，消耗 ${portalCost} 彩券。`,
    "neutral"
  );
  addLog(state, `${current.nickname} 传送到 ${targetTile.name}。`);
  const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
  return {
    ok: true,
    movements: [movement, ...tileOutcome.movements],
    teleports: [movement, ...(tileOutcome.teleports ?? [])],
    tileEvent: tileOutcome.tileEvent ?? teleportEvent,
    stockUpdated: tileOutcome.stockUpdated,
    bankrupted: tileOutcome.bankrupted,
    gameEnded: tileOutcome.gameEnded,
    pathChoice: tileOutcome.pathChoice,
    portalChoice: tileOutcome.portalChoice,
    lotteryPanel: tileOutcome.lotteryPanel,
    skillShop: tileOutcome.skillShop,
    luckCard: tileOutcome.luckCard,
    ticketsUpdated: [...ticketsUpdated, ...(tileOutcome.ticketsUpdated ?? [])],
    privateSignals: tileOutcome.privateSignals
  };
}

export function cancelPortalChoice(state: GameState, playerId: PlayerId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  const pending = state.pendingAction;
  if (pending?.kind !== "portalChoice" || pending.playerId !== current.id) {
    return fail("当前没有可取消的传送门选择。");
  }
  state.pendingAction = null;
  const tile = getTileById(state, pending.tileId) ?? getCurrentTile(state, current);
  const tileEvent = tile
    ? createTileEvent(state, current, tile, "取消传送", "你选择留在原地。", "neutral")
    : undefined;
  return {
    ok: true,
    movements: [],
    tileEvent,
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    portalCanceled: { playerId: current.id, tileId: pending.tileId }
  };
}

export function closeSkillShop(state: GameState, playerId: PlayerId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.pendingAction?.kind !== "skillShop" || state.pendingAction.playerId !== current.id) {
    return fail("当前没有打开的技能小铺。");
  }
  state.pendingAction = null;
  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
}

export function skipLottery(state: GameState, playerId: PlayerId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.pendingAction?.kind !== "lottery" || state.pendingAction.playerId !== current.id) {
    return fail("当前没有可跳过的彩票面板。");
  }
  const purchasedCount = state.pendingAction.purchasedCount ?? 0;
  state.pendingAction = null;
  const tile = getCurrentTile(state, current);
  const tileEvent = tile
    ? createTileEvent(
        state,
        current,
        tile,
        purchasedCount > 0 ? "结束彩市" : "跳过彩票",
        purchasedCount > 0
          ? `本次已购买 ${purchasedCount} 张彩票，已跳过剩余购买机会。`
          : "你跳过了本次彩票购买，可以继续回合。",
        "neutral"
      )
    : undefined;
  return {
    ok: true,
    movements: [],
    tileEvent,
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
}

export function cancelPendingAction(state: GameState, playerId: PlayerId): ActionOutcome {
  const player = getPlayer(state, playerId);
  if (!player || player.bankrupt) {
    return fail("玩家不存在或已破产。");
  }
  if (!state.pendingAction) {
    return fail("当前没有需要取消的操作。");
  }
  if ("playerId" in state.pendingAction && state.pendingAction.playerId !== playerId) {
    return fail("只能取消自己的待处理操作。");
  }
  state.pendingAction = null;
  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
}

export function buyProperty(state: GameState, playerId: PlayerId, tileId: TileId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.phase !== "tileAction" || state.pendingAction?.kind !== "buyProperty") {
    return fail("No property is available to buy right now.");
  }
  if (state.pendingAction.tileId !== tileId) {
    return fail("That property is not the current offer.");
  }

  const tile = getTileById(state, tileId);
  const property = state.properties[tileId];
  if (!tile || !property || tile.type !== "property") {
    return fail("Invalid property.");
  }
  if (property.ownerId) {
    return fail("This property already has an owner.");
  }

  let price = tile.price ?? 0;
  const acceleratorIndex = current.statusEffects.findIndex((effect) => effect.type === "setAccelerator" && effect.turns > 0);
  const canUseAccelerator =
    acceleratorIndex >= 0
    && Boolean(tile.groupId)
    && Boolean(tile.groupId && state.propertyGroups[tile.groupId])
    && Boolean(tile.groupId && state.propertyGroups[tile.groupId]?.tileIds
      .filter((groupTileId) => groupTileId !== tile.id)
      .every((groupTileId) => state.properties[groupTileId]?.ownerId === current.id));
  if (canUseAccelerator) {
    price = Math.ceil(price * 0.7);
  }
  if (current.cash < price) {
    return fail("现金不足，无法购买这块地产。");
  }

  if (canUseAccelerator) {
    current.statusEffects.splice(acceleratorIndex, 1);
  }
  current.cash -= price;
  property.ownerId = current.id;
  property.level = 1;
  current.properties.push(tileId);
  state.pendingAction = null;
  addLog(state, `${current.nickname} 花费 ${price} 金币购买了 ${tile.name}。`);
  if (tile.groupId && checkPropertyGroupCompletion(state, tile.groupId, current.id)) {
    const group = state.propertyGroups[tile.groupId];
    if (group) {
      addLog(state, `${current.nickname} 集齐了 ${group.name} 地产套装，该区域租金翻倍。`);
    }
  }
  checkGameEnd(state);

  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: state.status === "ended"
  };
}

export function upgradeProperty(state: GameState, playerId: PlayerId, tileId: TileId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.phase !== "tileAction" || state.pendingAction?.kind !== "upgradeProperty") {
    return fail("当前没有可升级的地产。");
  }
  if (state.pendingAction.tileId !== tileId) {
    return fail("这块地产不是当前可升级目标。");
  }

  const tile = getTileById(state, tileId);
  const property = state.properties[tileId];
  if (!tile || !property || property.ownerId !== current.id) {
    return fail("地产归属无效。");
  }
  if (property.isMortgaged) {
    return fail("已抵押地产不能升级，请先赎回。");
  }
  if (property.level >= MAX_PROPERTY_LEVEL) {
    return fail("这块地产已经达到最高等级。");
  }

  const cost = getUpgradeCost(tile, property);
  if (current.cash < cost) {
    return fail("现金不足，无法升级这块地产。");
  }

  current.cash -= cost;
  property.level += 1;
  state.pendingAction = null;
  addLog(state, `${current.nickname} 将 ${tile.name} 升级到 ${property.level} 级。`);

  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
}

export function buyStock(
  state: GameState,
  playerId: PlayerId,
  symbol: StockSymbol,
  quantity: number
): ActionOutcome {
  if (state.status !== "playing") {
    return fail("游戏尚未开始。");
  }
  const player = getPlayer(state, playerId);
  if (!player || player.bankrupt) {
    return fail("玩家不存在或已破产。");
  }
  const trade = submitStockOrder(state, player.id, symbol as StockId, "buy", quantity);
  if (!trade.ok || !trade.order || !trade.account) {
    return {
      ...fail(trade.error ?? "无法提交买入委托。"),
      stockTradeFailed: { playerId: player.id, message: trade.error ?? "无法提交买入委托。" }
    };
  }

  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    stockOrder: { playerId: player.id, order: trade.order, account: trade.account },
    stockAccount: { playerId: player.id, account: trade.account }
  };
}

export function sellStock(
  state: GameState,
  playerId: PlayerId,
  symbol: StockSymbol,
  quantity: number
): ActionOutcome {
  if (state.status !== "playing") {
    return fail("游戏尚未开始。");
  }
  const player = getPlayer(state, playerId);
  if (!player || player.bankrupt) {
    return fail("玩家不存在或已破产。");
  }
  const trade = submitStockOrder(state, player.id, symbol as StockId, "sell", quantity);
  if (!trade.ok || !trade.order || !trade.account) {
    return {
      ...fail(trade.error ?? "无法提交卖出委托。"),
      stockTradeFailed: { playerId: player.id, message: trade.error ?? "无法提交卖出委托。" }
    };
  }

  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    stockOrder: { playerId: player.id, order: trade.order, account: trade.account },
    stockAccount: { playerId: player.id, account: trade.account }
  };
}

export function submitStockOrderAction(
  state: GameState,
  playerId: PlayerId,
  stockId: StockId,
  type: "buy" | "sell",
  shares: number
): ActionOutcome {
  const result = submitStockOrder(state, playerId, stockId, type, shares);
  if (!result.ok || !result.order || !result.account) {
    return fail(result.error ?? "无法提交股票委托。");
  }
  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    stockOrder: { playerId, order: result.order, account: result.account },
    stockAccount: { playerId, account: result.account }
  };
}

export function cancelStockOrderAction(state: GameState, playerId: PlayerId, orderId: string): ActionOutcome {
  const result = cancelStockOrder(state, playerId, orderId);
  if (!result.ok || !result.account || !result.orderId) {
    return fail(result.error ?? "无法取消股票委托。");
  }
  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    stockOrderCanceled: { playerId, orderId: result.orderId, account: result.account },
    stockAccount: { playerId, account: result.account }
  };
}

export function buySkillCard(state: GameState, playerId: PlayerId, skillId: string): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  const pending = state.pendingAction;
  if (state.phase !== "tileAction" || pending?.kind !== "skillShop" || pending.playerId !== current.id) {
    return fail("当前没有打开的技能小铺。");
  }
  if (current.skillCards.length >= current.maxSkillCards) {
    return fail("手牌已满。");
  }
  const card = pending.offers.find((offer) => offer.id === skillId);
  if (!card) {
    return fail("这张技能卡不可购买。");
  }
  const discountIndex = current.statusEffects.findIndex((effect) => effect.type === "shopDiscount" && effect.turns > 0);
  const ticketCost = discountIndex >= 0 ? Math.max(1, card.costTickets - 1) : card.costTickets;
  if (current.tickets < ticketCost) {
    return fail("彩券不足，无法购买技能卡。");
  }

  if (discountIndex >= 0) {
    const discount = current.statusEffects[discountIndex];
    if (discount) {
      const remainingDiscounts = Math.max(0, (discount.amount ?? 3) - 1);
      if (remainingDiscounts > 0) {
        current.statusEffects[discountIndex] = { ...discount, amount: remainingDiscounts };
      } else {
        current.statusEffects.splice(discountIndex, 1);
      }
    }
  }
  current.tickets -= ticketCost;
  current.skillCards.push(card);
  pending.offers = pending.offers.filter((offer) => offer.id !== card.id);
  addLog(state, `${current.nickname} 购买了技能卡 ${card.displayName ?? card.name}。`);
  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    skillBought: { playerId: current.id, card },
    skillShop: { playerId: current.id, offers: pending.offers },
    ticketsUpdated: [{ playerId: current.id, tickets: current.tickets }]
  };
}

export function recycleSkillCard(state: GameState, playerId: PlayerId, skillId: string): ActionOutcome {
  if (state.status !== "playing") {
    return fail("游戏已结束，不能回收技能卡。");
  }
  const player = getPlayer(state, playerId);
  if (!player || player.bankrupt) {
    return fail("玩家不存在或已经破产。");
  }
  const index = player.skillCards.findIndex((card) => card.id === skillId);
  const card = player.skillCards[index];
  if (!card) {
    return fail("没有找到这张技能卡。");
  }

  const penalty = takeStatus(player, "skillRecyclePenalty");
  const refund = penalty ? Math.max(0, Math.floor(card.costTickets * 0.5)) : card.costTickets;
  player.skillCards.splice(index, 1);
  player.tickets += refund;
  addLog(state, `${player.nickname} 回收技能卡 ${card.displayName ?? card.name}，获得 ${refund} 彩券。`);

  return {
    ok: true,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false,
    skillRecycled: { playerId: player.id, cardId: card.id, tickets: player.tickets },
    ticketsUpdated: [{ playerId: player.id, tickets: player.tickets }]
  };
}

function validateSkillTarget(
  state: GameState,
  current: PlayerState,
  card: SkillCard,
  targetPlayerId?: PlayerId
): PlayerState | null {
  if (card.target !== "player") {
    return current;
  }
  const target = targetPlayerId ? getPlayer(state, targetPlayerId) : null;
  if (!target || target.id === current.id || target.bankrupt) {
    return null;
  }
  const distance = getSkillDistance(state, current.currentTileId, target.currentTileId);
  if (card.range !== undefined && distance > card.range) {
    return null;
  }
  return target;
}

function findSkillProperty(
  state: GameState,
  current: PlayerState,
  card: SkillCard,
  targetTileId: TileId | undefined,
  mode: "own" | "rival"
): { tile: Tile; property: PropertyState; owner: PlayerState | null } | string {
  const tile = getTileById(state, targetTileId);
  const property = targetTileId ? state.properties[targetTileId] : undefined;
  if (!tile || tile.type !== "property" || !property?.ownerId) {
    return "请选择一块有效地产。";
  }
  const owner = getPlayer(state, property.ownerId);
  if (mode === "own" && property.ownerId !== current.id) {
    return "只能选择自己的地产。";
  }
  if (mode === "rival" && property.ownerId === current.id) {
    return "请选择对手的地产。";
  }
  const distance = getSkillDistance(state, current.currentTileId, tile.id);
  if (mode === "rival" && card.range !== undefined && distance > card.range) {
    return "目标地产超出技能范围。";
  }
  return { tile, property, owner };
}

function blockAttackWithCounterShield(state: GameState, attacker: PlayerState, defender: PlayerState | null): BankruptNotice[] | null {
  if (!defender || defender.id === attacker.id) {
    return null;
  }
  const shield = takeStatus(defender, "counterShield");
  if (!shield) {
    return null;
  }
  const payment = chargePlayer(state, attacker, 500, "counter shield");
  addLog(state, `${defender.nickname} 的反击护盾抵消了攻击，${attacker.nickname} 损失 500 金币。`);
  return payment.bankrupted;
}

function findNearestUnownedProperty(state: GameState, player: PlayerState, maxDistance: number): Tile | null {
  const candidates = state.tiles
    .filter((tile) => tile.type === "property" && !state.properties[tile.id]?.ownerId)
    .map((tile) => ({ tile, distance: getSkillDistance(state, player.currentTileId, tile.id) }))
    .filter((item) => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0]?.tile ?? null;
}

function chooseUpgradeableProperty(state: GameState, player: PlayerState): PropertyState | null {
  const properties = player.properties
    .map((tileId) => state.properties[tileId])
    .filter((property): property is PropertyState => Boolean(property && !property.isMortgaged && property.level < MAX_PROPERTY_LEVEL));
  return properties.length > 0 ? randomItem(properties) : null;
}

export function useSkillCard(
  state: GameState,
  playerId: PlayerId,
  payload: { skillId: string; targetPlayerId?: PlayerId | undefined; targetTileId?: TileId | undefined; stockId?: StockId | undefined; value?: number | undefined }
): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.phase === "gameOver") {
    return fail("游戏已经结束。");
  }
  if (takeStatus(current, "skillBlock")) {
    return fail("你的技能卡被临时干扰，本次不能使用。");
  }

  const cardIndex = current.skillCards.findIndex((card) => card.id === payload.skillId);
  const card = current.skillCards[cardIndex];
  if (!card) {
    return fail("没有找到这张技能卡。");
  }
  if (card.code === "reverseCompass" && current.statusEffects.some((effect) => effect.type === "reverseWalk" && effect.turns > 0)) {
    return fail("你已经处于反向行走状态，不能重复叠加方向类技能。");
  }
  if (card.code === "routeToken" && current.statusEffects.some((effect) => effect.type === "routeChoice" && effect.turns > 0)) {
    return fail("你已经拥有一次选路机会，先使用后再叠加。");
  }

  const movements: MovementEvent[] = [];
  const teleports: MovementEvent[] = [];
  const bankrupted: BankruptNotice[] = [];
  const ticketsUpdated: TicketNotice[] = [];
  const privateSignals: NonNullable<ActionOutcome["privateSignals"]> = [];
  let tileEvent: TileEvent | undefined;
  let stockUpdated = false;
  const cardName = card.displayName ?? card.name;
  let skillMessage = `${current.nickname} 使用了${cardName}。`;
  let pathChoice: ActionOutcome["pathChoice"];
  let portalChoice: ActionOutcome["portalChoice"];
  let lotteryPanel: ActionOutcome["lotteryPanel"];
  let skillShop: ActionOutcome["skillShop"];

  const target = validateSkillTarget(state, current, card, payload.targetPlayerId);
  if (card.target === "player" && !target) {
    return fail("当前没有可用目标，或目标超出技能范围。");
  }

  let attackBlocked = false;
  if (card.type === "attack" && card.target === "player" && target) {
    const blocked = blockAttackWithCounterShield(state, current, target);
    if (blocked) {
      bankrupted.push(...blocked);
      attackBlocked = true;
      skillMessage = `${target.nickname} 的反击护盾抵消了 ${cardName}。`;
    }
  }

  if (attackBlocked) {
    // The card is still consumed, but no attack effect is applied.
  } else if (card.code === "remoteDice") {
    const value = Math.max(1, Math.min(6, Math.floor(payload.value ?? 6)));
    addStatus(current, "remoteDice", 1, value);
    skillMessage = `${current.nickname} 将下一次骰子点数设为 ${value}。`;
  } else if (card.code === "remoteTrade") {
    addStatus(current, "remoteTrade", 1);
    skillMessage = `${current.nickname} 准备了远程股票委托。`;
  } else if (card.code === "doubleDice") {
    addStatus(current, "doubleDice", 1);
    skillMessage = `${current.nickname} 准备了双倍骰子。`;
  } else if (card.code === "shield") {
    addStatus(current, "rentShield", 2);
    skillMessage = `${current.nickname} 准备了租金护盾。`;
  } else if (card.code === "quickShoes") {
    addStatus(current, "extraSteps", 1, 2);
    skillMessage = `${current.nickname} 穿上小飞鞋，下次移动额外前进 2 格。`;
  } else if (card.code === "stayPermit") {
    const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
    movements.push(...tileOutcome.movements);
    teleports.push(...(tileOutcome.teleports ?? []));
    bankrupted.push(...tileOutcome.bankrupted);
    stockUpdated = tileOutcome.stockUpdated;
    tileEvent = tileOutcome.tileEvent;
    pathChoice = tileOutcome.pathChoice;
    portalChoice = tileOutcome.portalChoice;
    lotteryPanel = tileOutcome.lotteryPanel;
    skillShop = tileOutcome.skillShop;
    privateSignals.push(...(tileOutcome.privateSignals ?? []));
    ticketsUpdated.push(...(tileOutcome.ticketsUpdated ?? []));
    skillMessage = `${current.nickname} 使用停留牌，原地再次处理当前地块。`;
  } else if (card.code === "returnTicket") {
    const fromTile = getCurrentTile(state, current);
    const rewardTileId = state.settings.lapRewardMode === "home"
      ? current.homeStartTileId ?? GO_TILE_ID
      : GO_TILE_ID;
    const targetTile = getTileById(state, rewardTileId);
    if (!fromTile || !targetTile) {
      return fail("当前无法回到起点。");
    }
    setPlayerTile(state, current, targetTile, fromTile.id);
    const movement = createMovement(current, fromTile, [targetTile]);
    movements.push(movement);
    teleports.push(movement);
    addCash(state, current, state.settings.lapRewardMoney ?? START_SALARY, "passing 左上 GO 起点");
    if ((state.settings.lapRewardTickets ?? 1) > 0) {
      ticketsUpdated.push(adjustTickets(state, current, state.settings.lapRewardTickets ?? 1, "completing a home lap"));
    }
    skillMessage = `${current.nickname} 使用回城票，回到左上 GO 并领取奖励。`;
  } else if (card.code === "outerRoutePass") {
    addStatus(current, "forceOuterRoute", 5);
    skillMessage = `${current.nickname} 准备了绕路牌，下次岔路强制走外圈。`;
  } else if (card.code === "innerRoutePass") {
    addStatus(current, "forceInnerRoute", 5);
    skillMessage = `${current.nickname} 准备了钻巷牌，下次岔路强制进入内圈。`;
  } else if (card.code === "junctionCompass") {
    addStatus(current, "routeChoice", 5, undefined, { amount: 2, label: "路口罗盘", description: "接下来 2 次岔路可手动选择。" });
    skillMessage = `${current.nickname} 打开路口罗盘，接下来 2 次岔路可手动选择。`;
  } else if (card.code === "holidayVoucher") {
    addStatus(current, "rentHoliday", 2);
    skillMessage = `${current.nickname} 使用假日券，2 回合内经过对手地产不付租金。`;
  } else if (card.code === "freeze" && target && target.id !== current.id) {
    target.skipTurns += 1;
    skillMessage = `${current.nickname} 冻结了 ${target.nickname} 一回合。`;
  } else if (card.code === "landlordHoliday" && target && target.id !== current.id) {
    addStatus(target, "ownerRentBlock", 2);
    skillMessage = `${current.nickname} 让 ${target.nickname} 进入房东假期，2 回合内无法收租。`;
  } else if (card.code === "auditBill" && target && target.id !== current.id) {
    const stockValue = target.stockAccount.totalMarketValue ?? 0;
    const debt = (target.bankAccount.debtPrincipal ?? target.bankAccount.debt ?? 0) + (target.bankAccount.unpaidInterest ?? 0);
    skillMessage = `${current.nickname} 查看了 ${target.nickname} 的账单：现金 ${target.cash}，存款 ${target.bankAccount.deposit}，借款 ${debt}，股票市值 ${stockValue}。`;
  } else if (card.code === "steal" && target && target.id !== current.id) {
    const payment = chargePlayer(state, target, 1000, "coin magnet", current.id);
    bankrupted.push(...payment.bankrupted);
    skillMessage = `${current.nickname} 从 ${target.nickname} 那里获得 ${payment.paid} 金币。`;
  } else if (card.code === "swap" && target && target.id !== current.id) {
    const currentTile = getCurrentTile(state, current);
    const targetTile = getCurrentTile(state, target);
    if (!currentTile || !targetTile) {
      return fail("Cannot swap positions right now.");
    }
    setPlayerTile(state, current, targetTile, currentTile.id);
    setPlayerTile(state, target, currentTile, targetTile.id);
    movements.push(createMovement(current, currentTile, [targetTile]));
    movements.push(createMovement(target, targetTile, [currentTile]));
    skillMessage = `${current.nickname} 和 ${target.nickname} 交换了位置。`;
  } else if (card.code === "teleport") {
    const targetTile = getTileById(state, payload.targetTileId);
    if (!targetTile || !["start", "bank", "stock", "skillShop", "safe_landing", "plaza"].includes(targetTile.type)) {
      return fail("这个技能只能传送到起点、银行、股票地块、技能小铺或安全广场。");
    }
    const fromTile = getCurrentTile(state, current);
    if (!fromTile) {
      return fail("Current tile not found.");
    }
    setPlayerTile(state, current, targetTile, fromTile.id);
    const movement = createMovement(current, fromTile, [targetTile]);
    movements.push(movement);
    teleports.push(movement);
    const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
    movements.push(...tileOutcome.movements);
    teleports.push(...(tileOutcome.teleports ?? []));
    bankrupted.push(...tileOutcome.bankrupted);
    stockUpdated = tileOutcome.stockUpdated;
    tileEvent = tileOutcome.tileEvent;
    pathChoice = tileOutcome.pathChoice;
    portalChoice = tileOutcome.portalChoice;
    lotteryPanel = tileOutcome.lotteryPanel;
    skillShop = tileOutcome.skillShop;
    privateSignals.push(...(tileOutcome.privateSignals ?? []));
    ticketsUpdated.push(...(tileOutcome.ticketsUpdated ?? []));
    skillMessage = `${current.nickname} 跳到了 ${targetTile.name}。`;
  } else if (card.code === "rentBoost") {
    const property = payload.targetTileId ? state.properties[payload.targetTileId] : null;
    if (!property || property.ownerId !== current.id) {
      return fail("请选择一块自己的地产。");
    }
    property.rentBoostTurns = 3;
    skillMessage = `${current.nickname} 强化了 ${getTileById(state, property.tileId)?.name ?? "一块地产"} 的租金。`;
  } else if (card.code === "stockHint") {
    const signal = createMarketSignal(state, "stock_tile", true, current.id);
    state.marketSignals.push(signal);
    privateSignals.push({ playerId: current.id, signal });
    skillMessage = `${current.nickname} 获得一条个人准确股市情报：${signal.message}`;
  } else if (card.code === "luckyCharm") {
    addStatus(current, "luckyCharm", 3);
    skillMessage = `${current.nickname} 准备了幸运护符。`;
  } else if (card.code === "lotteryBoost") {
    addStatus(current, "lotteryBoost", 3);
    skillMessage = `${current.nickname} 准备了彩票翻倍卡。`;
  } else if (card.code === "taxRelief") {
    addStatus(current, "taxShield", 3);
    skillMessage = `${current.nickname} 准备了税收券。`;
  } else if (card.code === "repairKit") {
    addStatus(current, "repairKit", 3, undefined, {
      label: "安居维修包",
      description: "接下来 3 回合内，每次需要支付地租时只支付一半。"
    });
    skillMessage = `${current.nickname} 准备了安居维修包，接下来 3 回合支付地租减半。`;
  } else if (card.code === "sprint") {
    const sprint = movePlayerGraph(state, current, 3, true);
    if (sprint.movement) {
      movements.push(sprint.movement);
    }
    ticketsUpdated.push(...sprint.ticketsUpdated);
    pathChoice = sprint.pathChoice;
    if (!pathChoice) {
      const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
      movements.push(...tileOutcome.movements);
      teleports.push(...(tileOutcome.teleports ?? []));
      bankrupted.push(...tileOutcome.bankrupted);
      stockUpdated = tileOutcome.stockUpdated;
      tileEvent = tileOutcome.tileEvent;
      pathChoice = tileOutcome.pathChoice;
      portalChoice = tileOutcome.portalChoice;
      lotteryPanel = tileOutcome.lotteryPanel;
      skillShop = tileOutcome.skillShop;
      privateSignals.push(...(tileOutcome.privateSignals ?? []));
      ticketsUpdated.push(...(tileOutcome.ticketsUpdated ?? []));
    }
    skillMessage = `${current.nickname} 向前冲刺 3 格。`;
  } else if (card.code === "rideShare") {
    const startIndex = current.position;
    const candidates = state.tiles
      .slice(startIndex + 1)
      .concat(state.tiles.slice(0, startIndex))
      .filter((tile) => tile.type !== "jail" && tile.type !== "hospital");
    const targetTile = candidates.find((tile) => {
      const property = state.properties[tile.id];
      return tile.type !== "property" || !property?.ownerId || property.ownerId === current.id;
    });
    const fromTile = getCurrentTile(state, current);
    if (!fromTile || !targetTile) {
      return fail("顺风车暂时没有合适落点。");
    }
    setPlayerTile(state, current, targetTile, fromTile.id);
    const movement = createMovement(current, fromTile, [targetTile]);
    movements.push(movement);
    teleports.push(movement);
    const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
    movements.push(...tileOutcome.movements);
    teleports.push(...(tileOutcome.teleports ?? []));
    bankrupted.push(...tileOutcome.bankrupted);
    stockUpdated = tileOutcome.stockUpdated;
    tileEvent = tileOutcome.tileEvent;
    pathChoice = tileOutcome.pathChoice;
    portalChoice = tileOutcome.portalChoice;
    lotteryPanel = tileOutcome.lotteryPanel;
    skillShop = tileOutcome.skillShop;
    privateSignals.push(...(tileOutcome.privateSignals ?? []));
    ticketsUpdated.push(...(tileOutcome.ticketsUpdated ?? []));
    skillMessage = `${current.nickname} 搭上顺风车，移动到 ${targetTile.name}。`;
  } else if (card.code === "slowTrap" && target && target.id !== current.id) {
    addStatus(target, "slowTrap", 1);
    skillMessage = `${current.nickname} 给 ${target.nickname} 放置了减速路牌。`;
  } else if (card.code === "slowWalk") {
    addStatus(current, "slowWalk", 1);
    skillMessage = `${current.nickname} 准备了小步慢行，下次最多移动 3 格。`;
  } else if (card.code === "preciseStep") {
    addStatus(current, "preciseStep", 1);
    skillMessage = `${current.nickname} 准备了精准一步，下次固定移动 1 格。`;
  } else if (card.code === "reverseDice") {
    addStatus(current, "reverseDice", 1);
    skillMessage = `${current.nickname} 准备了反向骰子，下次会反方向移动。`;
  } else if (card.code === "junctionInterference" && target && target.id !== current.id) {
    addStatus(target, "junctionInterference", 2, undefined, { sourcePlayerId: current.id });
    skillMessage = `${current.nickname} 干扰了 ${target.nickname} 的下一个路口选择。`;
  } else if (card.code === "junctionBlessing") {
    addStatus(current, "junctionBlessing", 2);
    skillMessage = `${current.nickname} 获得路口祝福，下次普通路口更容易走向好地点。`;
  } else if (card.code === "smallLoan") {
    addCash(state, current, 1000, "small loan");
    addStatus(current, "smallLoan", 3, undefined, { amount: 1200 });
    skillMessage = `${current.nickname} 获得小额贷款 1000 金币，3 天后偿还 1200 金币。`;
  } else if (card.code === "interestFreeRedeem") {
    addStatus(current, "interestFreeRedeem", 5);
    skillMessage = `${current.nickname} 获得免息赎回资格，下次赎回抵押地产只支付抵押金额。`;
  } else if (card.code === "propertyInsurance") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    found.property.insuranceTurns = 3;
    skillMessage = `${current.nickname} 为 ${found.tile.name} 购买了地产保险。`;
  } else if (card.code === "temporaryRentRaise") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    if (found.property.isMortgaged) {
      return fail("已抵押地产不能临时涨价。");
    }
    found.property.rentBoostTurns = 2;
    skillMessage = `${current.nickname} 让 ${found.tile.name} 接下来 2 天租金提高。`;
  } else if (card.code === "temporaryRentCut") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "rival");
    if (typeof found === "string") {
      return fail(found);
    }
    const blocked = blockAttackWithCounterShield(state, current, found.owner);
    if (blocked) {
      bankrupted.push(...blocked);
      skillMessage = `${found.owner?.nickname ?? "对手"} 的反击护盾抵消了临时降租。`;
    } else {
      found.property.rentCutTurns = 2;
      skillMessage = `${current.nickname} 让 ${found.tile.name} 接下来 2 天租金降低。`;
    }
  } else if (card.code === "setAccelerator") {
    addStatus(current, "setAccelerator", 5, 0.3);
    skillMessage = `${current.nickname} 启动套装加速，下次购买只差 1 块的套装地块可降价 30%。`;
  } else if (card.code === "mortgageFreeze") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "rival");
    if (typeof found === "string") {
      return fail(found);
    }
    const blocked = blockAttackWithCounterShield(state, current, found.owner);
    if (blocked) {
      bankrupted.push(...blocked);
      skillMessage = `${found.owner?.nickname ?? "对手"} 的反击护盾抵消了抵押冻结。`;
    } else {
      found.property.mortgageFreezeTurns = 3;
      skillMessage = `${current.nickname} 冻结了 ${found.tile.name} 的抵押赎回。`;
    }
  } else if (card.code === "ticketRedPacket") {
    const reward = Math.floor(Math.random() * 3);
    ticketsUpdated.push(adjustTickets(state, current, reward, "ticket red packet"));
    skillMessage = `${current.nickname} 打开彩券红包，获得 ${reward} 张彩券。`;
  } else if (card.code === "coinRedPacket") {
    const reward = 200 + Math.floor(Math.random() * 601);
    addCash(state, current, reward, "coin red packet");
    skillMessage = `${current.nickname} 打开金币红包，获得 ${reward} 金币。`;
  } else if (card.code === "lotteryCombo") {
    addStatus(current, "lotteryCombo", 5);
    skillMessage = `${current.nickname} 准备了彩票连抽，下次进入彩市可额外买 2 张。`;
  } else if (card.code === "lotteryGuarantee") {
    addStatus(current, "lotteryGuarantee", 5);
    skillMessage = `${current.nickname} 准备了保底彩票，下次未中奖返还一半成本。`;
  } else if (card.code === "stockFreeCommission") {
    addStatus(current, "stockFreeCommission", 5);
    skillMessage = `${current.nickname} 获得股票免佣，下一个交易日结算手续费为 0。`;
  } else if (card.code === "shortGoggles") {
    addStatus(current, "stockSellCoupon", 5);
    skillMessage = `${current.nickname} 戴上做空护目镜，下一次卖出股票结算手续费为 0。`;
  } else if (card.code === "stockStopLoss") {
    const stockId = payload.stockId ?? (Object.keys(current.stockAccount.holdings)[0] as StockId | undefined);
    if (!stockId || !state.stocks[stockId]) {
      return fail("请选择一只有效股票。");
    }
    addStatus(current, "stockStopLoss", 5, undefined, { stockId });
    skillMessage = `${current.nickname} 为 ${state.stocks[stockId].name} 设置了止损。`;
  } else if (card.code === "stockBuyCoupon") {
    addStatus(current, "stockBuyCoupon", 5);
    skillMessage = `${current.nickname} 获得股票加仓券，下一次买入结算手续费半价。`;
  } else if (card.code === "marketFlash") {
    const signal = createMarketSignal(state, "stock_tile", true, current.id);
    state.marketSignals.push(signal);
    privateSignals.push({ playerId: current.id, signal });
    skillMessage = `${current.nickname} 收到股市快讯：${signal.message}`;
  } else if (card.code === "bullFlag") {
    const signal = createDirectedStockSignal(state, payload.stockId, "bullish", current.id, "system");
    state.marketSignals.push(signal);
    privateSignals.push({ playerId: current.id, signal });
    skillMessage = `${current.nickname} 插下牛市旗帜：${signal.message}`;
  } else if (card.code === "bearAlert") {
    const signal = createDirectedStockSignal(state, payload.stockId, "bearish", current.id, "system");
    state.marketSignals.push(signal);
    privateSignals.push({ playerId: current.id, signal });
    skillMessage = `${current.nickname} 拉响熊市警报：${signal.message}`;
  } else if (card.code === "marketMagnifier") {
    const signal = createMarketSignal(state, "system", true, current.id);
    state.marketSignals.push(signal);
    privateSignals.push({ playerId: current.id, signal });
    skillMessage = `情报放大镜：${signal.message}`;
  } else if (card.code === "luckyWheel") {
    const roll = Math.random();
    if (roll < 0.3) {
      const reward = 500;
      addCash(state, current, reward, "lucky wheel");
      skillMessage = `${current.nickname} 转到金币奖励，获得 ${reward} 金币。`;
    } else if (roll < 0.55) {
      ticketsUpdated.push(adjustTickets(state, current, 1, "lucky wheel"));
      skillMessage = `${current.nickname} 转到彩券奖励，获得 1 张彩券。`;
    } else if (roll < 0.8) {
      const move = movePlayerGraph(state, current, 1, true);
      if (move.movement) {
        movements.push(move.movement);
      }
      ticketsUpdated.push(...move.ticketsUpdated);
      pathChoice = move.pathChoice;
      if (!pathChoice && move.movement) {
        const tileOutcome = handleTileEffect(state, current.id, { allowPortalTrigger: false });
        movements.push(...tileOutcome.movements);
        teleports.push(...(tileOutcome.teleports ?? []));
        bankrupted.push(...tileOutcome.bankrupted);
        stockUpdated = tileOutcome.stockUpdated || stockUpdated;
        tileEvent = tileOutcome.tileEvent;
        pathChoice = tileOutcome.pathChoice;
        portalChoice = tileOutcome.portalChoice;
        lotteryPanel = tileOutcome.lotteryPanel;
        skillShop = tileOutcome.skillShop;
        privateSignals.push(...(tileOutcome.privateSignals ?? []));
        ticketsUpdated.push(...(tileOutcome.ticketsUpdated ?? []));
      }
      skillMessage = `${current.nickname} 转到小位移，前进 1 格。`;
    } else {
      skillMessage = `${current.nickname} 转到空白格，什么也没有发生。`;
    }
  } else if (card.code === "vacantGuide") {
    const nearest = findNearestUnownedProperty(state, current, 6);
    skillMessage = nearest
      ? `空地指南：附近最近的无主地产是 ${nearest.name}。`
      : "空地指南：附近 6 格内没有无主地产。";
  } else if (card.code === "rentDiscountTicket") {
    addStatus(current, "rentDiscountTicket", 5);
    skillMessage = `${current.nickname} 准备了躲租小票，下次租金减少 50%。`;
  } else if (card.code === "rentHorn") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    found.property.rentHornBonus = 500;
    skillMessage = `${current.nickname} 给 ${found.tile.name} 装上收租喇叭，下次收租 +500。`;
  } else if (card.code === "popUpBooth") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    found.property.rentHornBonus = Math.max(found.property.rentHornBonus ?? 0, 800);
    skillMessage = `${current.nickname} 在 ${found.tile.name} 摆出临时摊位，下次收租 +800。`;
  } else if (card.code === "renovationTeam") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    if (!found.property.isMortgaged && found.property.level < MAX_PROPERTY_LEVEL) {
      found.property.level += 1;
      skillMessage = `${current.nickname} 派出装修队，${found.tile.name} 升到 ${found.property.level} 级。`;
    } else {
      skillMessage = `${current.nickname} 派出装修队，但 ${found.tile.name} 当前不能升级。`;
    }
  } else if (card.code === "rentLimitOrder") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "rival");
    if (typeof found === "string") {
      return fail(found);
    }
    found.property.rentLimitTurns = 2;
    found.property.rentLimitAmount = 1000;
    skillMessage = `${current.nickname} 对 ${found.tile.name} 下达限价令，2 回合内租金最高 1000。`;
  } else if (card.code === "secretBuild") {
    const property = chooseUpgradeableProperty(state, current);
    if (!property) {
      addCash(state, current, 500, "unused secret build");
      skillMessage = `${current.nickname} 没有可施工地产，改为获得 500 金币。`;
    } else {
      property.level += 1;
      skillMessage = `${current.nickname} 偷偷施工成功，${getTileById(state, property.tileId)?.name ?? "一块地产"} 升到 ${property.level} 级。`;
    }
  } else if (card.code === "equalizePoor" && target && target.id !== current.id) {
    if (target.cash <= current.cash) {
      return fail("目标现金没有比你更多，不能使用均贫卡。");
    }
    const lost = target.cash - current.cash;
    target.cash = current.cash;
    skillMessage = `${current.nickname} 使用均贫卡，${target.nickname} 失去 ${lost} 金币。`;
  } else if (card.code === "equalizeRich" && target && target.id !== current.id) {
    if (target.cash <= current.cash) {
      return fail("目标现金没有比你更多，不能使用均富卡。");
    }
    const gained = target.cash - current.cash;
    current.cash = target.cash;
    skillMessage = `${current.nickname} 使用均富卡，获得 ${gained} 金币补齐到 ${target.nickname} 的现金水平。`;
  } else if ((card.code === "missile" || card.code === "bomb") && target && target.id !== current.id) {
    const movement = sendPlayerToTile(state, target, "hospital-05");
    if (movement) {
      teleports.push(movement);
      movements.push(movement);
    }
    const hospitalTurns = Math.max(1, state.settings.hospitalTurns - (takeStatus(target, "medicalInsurance") ? 1 : 0));
    target.skipTurns = Math.max(target.skipTurns, hospitalTurns);
    addStatus(target, "hospital", hospitalTurns);
    skillMessage = `${current.nickname} 命中 ${target.nickname}，${target.nickname} 被送进棉花糖医院。`;
    if (card.code === "missile" && Math.random() < 0.25) {
      const selfMovement = sendPlayerToTile(state, current, "jail-05");
      if (selfMovement) {
        teleports.push(selfMovement);
        movements.push(selfMovement);
      }
      const jailTurns = Math.max(1, state.settings.jailTurns - (takeStatus(current, "bailPermit") ? 1 : 0));
      current.skipTurns = Math.max(current.skipTurns, jailTurns);
      addStatus(current, "jail", jailTurns);
      skillMessage += ` 警卫追查导弹来源，${current.nickname} 也被带去泡泡监狱。`;
    }
  } else if (card.code === "reverseCompass") {
    addStatus(current, "reverseWalk", 3);
    skillMessage = `${current.nickname} 打开反向指南针，接下来 3 天会反向移动。`;
  } else if (card.code === "routeToken") {
    addStatus(current, "routeChoice", 5);
    skillMessage = `${current.nickname} 获得路线券，下次遇到岔路可以手动选择。`;
  } else if (card.code === "cardSupply") {
    const beforeTickets = current.tickets;
    const message = grantRandomSkillCard(state, current, "common");
    if (current.tickets !== beforeTickets) {
      ticketsUpdated.push({ playerId: current.id, tickets: current.tickets });
    }
    skillMessage = `${current.nickname} 打开卡包补给：${message}`;
  } else if (card.code === "roadblock" && target && target.id !== current.id) {
    addStatus(target, "slowTrap", 1);
    addStatus(target, "roadblock", 1, undefined, { sourcePlayerId: current.id });
    skillMessage = `${current.nickname} 在 ${target.nickname} 前方放下路障，目标下次只能移动 1 格。`;
  } else if (card.code === "angelCard") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    found.property.insuranceTurns = 5;
    const beforeLevel = found.property.level;
    if (!found.property.isMortgaged && found.property.level < MAX_PROPERTY_LEVEL) {
      found.property.level += 1;
    }
    skillMessage =
      found.property.level > beforeLevel
        ? `${current.nickname} 让 ${found.tile.name} 获得天使保护，并升级到 ${found.property.level} 级。`
        : `${current.nickname} 让 ${found.tile.name} 获得天使保护，当前无法继续升级。`;
  } else if (card.code === "demolishCard") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "rival");
    if (typeof found === "string") {
      return fail(found);
    }
    const blocked = blockAttackWithCounterShield(state, current, found.owner);
    if (blocked) {
      bankrupted.push(...blocked);
      skillMessage = `${found.owner?.nickname ?? "对手"} 的反击护盾抵消了拆除许可。`;
    } else {
      found.property.level = Math.max(1, found.property.level - 1);
      skillMessage = `${current.nickname} 拆除了 ${found.tile.name} 的一段设施，等级降为 ${found.property.level}。`;
    }
  } else if (card.code === "valueBoostCard") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "own");
    if (typeof found === "string") {
      return fail(found);
    }
    const beforeLevel = found.property.level;
    if (!found.property.isMortgaged && found.property.level < MAX_PROPERTY_LEVEL) {
      found.property.level += 1;
    }
    found.property.rentBoostTurns = Math.max(found.property.rentBoostTurns ?? 0, 3);
    skillMessage =
      found.property.level > beforeLevel
        ? `${current.nickname} 为 ${found.tile.name} 贴上升值海报，升级到 ${found.property.level} 级并短期加租。`
        : `${current.nickname} 为 ${found.tile.name} 贴上升值海报，等级已满，短期加租生效。`;
  } else if (card.code === "devilCard") {
    const found = findSkillProperty(state, current, card, payload.targetTileId, "rival");
    if (typeof found === "string") {
      return fail(found);
    }
    const blocked = blockAttackWithCounterShield(state, current, found.owner);
    if (blocked) {
      bankrupted.push(...blocked);
      skillMessage = `${found.owner?.nickname ?? "对手"} 的反击护盾抵消了恶魔涂鸦。`;
    } else {
      found.property.level = Math.max(1, found.property.level - 1);
      found.property.rentCutTurns = Math.max(found.property.rentCutTurns ?? 0, 3);
      skillMessage = `${current.nickname} 在 ${found.tile.name} 留下恶魔涂鸦，地产降级并短期降租。`;
    }
  } else if (card.code === "releasePermit") {
    const hadDetention = current.statusEffects.some((effect) => effect.type === "jail" || effect.type === "hospital");
    current.statusEffects = current.statusEffects.filter((effect) => effect.type !== "jail" && effect.type !== "hospital");
    current.skipTurns = 0;
    skillMessage = hadDetention
      ? `${current.nickname} 使用出院出狱许可，恢复自由行动。`
      : `${current.nickname} 使用出院出狱许可，但当前没有拘留或住院状态。`;
  } else if (card.code === "bankVoucher") {
    addCash(state, current, 500, "bank voucher");
    skillMessage = `${current.nickname} 使用银行礼券，获得 500 金币。`;
  } else if (card.code === "debtExtension") {
    addStatus(current, "debtExtension", 35);
    skillMessage = `${current.nickname} 办理债务展期，下次月度强制还款为 0。`;
  } else if (card.code === "coinRain") {
    for (const player of state.players) {
      if (player.bankrupt) continue;
      addCash(state, player, player.id === current.id ? 1200 : 800, "coin rain");
    }
    skillMessage = `${current.nickname} 召唤金币雨，所有未破产玩家获得金币，自己额外多拿 400。`;
  } else if (card.code === "lotteryPack") {
    addStatus(current, "lotteryPack", 5, undefined, { amount: 2, label: "抽奖券包", description: "下 2 张彩票免费购买。" });
    skillMessage = `${current.nickname} 打开抽奖券包，下 2 张彩票免费购买。`;
  } else if (card.code === "luckyNumber") {
    addStatus(current, "luckyNumber", 5);
    skillMessage = `${current.nickname} 记下幸运号码，下一次彩票中奖判定提高。`;
  } else if (card.code === "medicalInsurance") {
    addStatus(current, "medicalInsurance", 8);
    skillMessage = `${current.nickname} 购买医疗保险，下次进医院停留回合 -1。`;
  } else if (card.code === "bailPermit") {
    addStatus(current, "bailPermit", 8);
    skillMessage = `${current.nickname} 准备保释券，下次进监狱停留回合 -1。`;
  } else if (card.code === "repairDiscount") {
    addStatus(current, "repairDiscount", 5, undefined, {
      label: "房租折扣券",
      description: "接下来 5 回合内，每次需要支付地租时按七折结算。"
    });
    skillMessage = `${current.nickname} 准备了房租折扣券，接下来 5 回合支付地租七折。`;
  } else if (card.code === "taxDelay") {
    addStatus(current, "taxDelay", 5);
    skillMessage = `${current.nickname} 准备了税务缓缴，下一次税收可延迟 3 天支付。`;
  } else if (card.code === "shopDiscount") {
    addStatus(current, "shopDiscount", 5, 1, {
      amount: 3,
      label: "商店折扣",
      description: "下次技能商店前 3 张卡各便宜 1 张彩券，最低 1 张。"
    });
    skillMessage = `${current.nickname} 准备了商店折扣，下次技能商店前 3 张卡各便宜 1 张彩券，最低 1 张。`;
  } else if (card.code === "portalDiscount") {
    addStatus(current, "portalDiscount", 5);
    skillMessage = `${current.nickname} 准备了传送优惠，下一次传送少花 1 张彩券。`;
  } else if (card.code === "counterShield") {
    addStatus(current, "counterShield", 3);
    skillMessage = `${current.nickname} 架起反击护盾，3 天内抵消一次攻击技能。`;
  }

  current.skillCards.splice(cardIndex, 1);
  addLog(state, skillMessage);
  const gameEnded = checkGameEnd(state);

  return {
    ok: true,
    movements,
    teleports,
    tileEvent,
    stockUpdated,
    bankrupted,
    gameEnded,
    pathChoice,
    portalChoice,
    lotteryPanel,
    skillShop,
    skillUsed: { playerId: current.id, card },
    skillMessage: { playerId: current.id, message: skillMessage },
    ticketsUpdated,
    privateSignals
  };
}

function completeRound(state: GameState): boolean {
  const completedRound = state.round;
  addLog(state, `第 ${completedRound} 轮结束。`);
  state.round += 1;
  return false;
}

function moveTurnCursor(state: GameState): boolean {
  const wasLast = state.currentTurnIndex >= state.turnOrder.length - 1;
  state.currentTurnIndex = wasLast ? 0 : state.currentTurnIndex + 1;
  return wasLast;
}

function decayPropertyBoosts(state: GameState, player: PlayerState): void {
  for (const tileId of player.properties) {
    const property = state.properties[tileId];
    if (property?.rentBoostTurns && property.rentBoostTurns > 0) {
      property.rentBoostTurns -= 1;
    }
    if (property?.rentCutTurns && property.rentCutTurns > 0) {
      property.rentCutTurns -= 1;
    }
    if (property?.insuranceTurns && property.insuranceTurns > 0) {
      property.insuranceTurns -= 1;
    }
    if (property?.mortgageFreezeTurns && property.mortgageFreezeTurns > 0) {
      property.mortgageFreezeTurns -= 1;
    }
    if (property?.rentLimitTurns && property.rentLimitTurns > 0) {
      property.rentLimitTurns -= 1;
      if (property.rentLimitTurns <= 0) {
        property.rentLimitAmount = undefined;
      }
    }
  }
}

function willAdvanceDayAfterActing(state: GameState, playerId: PlayerId): boolean {
  const acted = new Set(state.gameCalendar.actedPlayerIdsToday);
  acted.add(playerId);
  const activePlayerIds = state.players.filter((player) => !player.bankrupt).map((player) => player.id);
  return activePlayerIds.length > 0 && activePlayerIds.every((id) => acted.has(id));
}

function finishTradingDayIfNeeded(state: GameState): {
  stockUpdated: boolean;
  settlementRecords: StockTradeRecord[];
  announcements: MarketAnnouncement[];
} {
  if (!isStockTradingDay(state.gameCalendar)) {
    addLog(state, "今日股票休市，委托不结算，股价不更新。");
    return { stockUpdated: false, settlementRecords: [], announcements: [] };
  }
  const announcement = state.settings.enableRandomAnnouncements === false ? null : maybeCreateMarketAnnouncement(state);
  if (announcement) {
    addLog(state, `股市快讯：${announcement.message}`);
  }
  const settlement = settleDailyStockOrders(state);
  if (settlement.records.length > 0) {
    addLog(state, `今日股票委托已统一结算，共 ${settlement.records.length} 笔净结果。`);
    for (const record of settlement.records.slice(0, 10)) {
      const stock = state.stocks[record.stockId];
      const side = record.type === "net_sell" ? "净卖出" : "净买入";
      const profitText =
        record.realizedProfit === undefined
          ? ""
          : `，本次实现盈亏 ${record.realizedProfit >= 0 ? "+" : ""}${record.realizedProfit}`;
      addLog(
        state,
        `${record.nickname ?? "玩家"} ${side} ${stock?.name ?? record.stockId} ${record.shares} 股，成交价 ${record.price}，手续费 ${record.fee}${profitText}。`
      );
    }
  }
  updateStockMarketDaily(state);
  return { stockUpdated: true, settlementRecords: settlement.records, announcements: announcement ? [announcement] : [] };
}

function advanceTurn(state: GameState): {
  stockUpdated: boolean;
  settlementRecords: StockTradeRecord[];
  bankrupted: BankruptNotice[];
  announcements: MarketAnnouncement[];
  bankSettlements: MonthlyBankSettlement[];
} {
  let stockUpdated = false;
  const settlementRecords: StockTradeRecord[] = [];
  const bankrupted: BankruptNotice[] = [];
  const announcements: MarketAnnouncement[] = [];
  const bankSettlements: MonthlyBankSettlement[] = [];
  let safety = 0;
  const endingPlayer = getCurrentPlayer(state);
  if (endingPlayer) {
    const beforeDays = state.gameCalendar.daysElapsed;
    if (willAdvanceDayAfterActing(state, endingPlayer.id)) {
      const trading = finishTradingDayIfNeeded(state);
      stockUpdated = trading.stockUpdated || stockUpdated;
      settlementRecords.push(...trading.settlementRecords);
      announcements.push(...trading.announcements);
    }
    markPlayerActedAndAdvanceDayIfNeeded(state, endingPlayer.id);
    if (state.gameCalendar.daysElapsed > beforeDays) {
      updatePlayerStockAccounts(state);
      bankSettlements.push(...settleMonthlyBankInterest(state));
      for (const player of state.players) {
        bankrupted.push(...tickStatuses(state, player));
        decayPropertyBoosts(state, player);
      }
      const theme = getCurrentMonthMarketTheme(state.gameCalendar);
      addLog(
        state,
        `奇趣历推进到第 ${state.gameCalendar.year} 年 ${state.gameCalendar.month} 月 ${state.gameCalendar.day} 日。市场主题：${theme.title}。`
      );
    }
  }

  while (safety < state.turnOrder.length * 2) {
    const wrapped = moveTurnCursor(state);
    if (wrapped) {
      stockUpdated = completeRound(state) || stockUpdated;
      if (state.round > state.maxRounds) {
        break;
      }
    }

    const nextPlayer = getCurrentPlayer(state);
    if (!nextPlayer || nextPlayer.bankrupt) {
      safety += 1;
      continue;
    }

    nextPlayer.usedActiveSkillThisTurn = false;
    if (nextPlayer.skipTurns > 0) {
      nextPlayer.skipTurns -= 1;
      tickDetentionStatusAfterSkippedTurn(nextPlayer);
      state.completedTurns += 1;
      const beforeDays = state.gameCalendar.daysElapsed;
      if (willAdvanceDayAfterActing(state, nextPlayer.id)) {
        const trading = finishTradingDayIfNeeded(state);
        stockUpdated = trading.stockUpdated || stockUpdated;
        settlementRecords.push(...trading.settlementRecords);
        announcements.push(...trading.announcements);
      }
      markPlayerActedAndAdvanceDayIfNeeded(state, nextPlayer.id);
      if (state.gameCalendar.daysElapsed > beforeDays) {
        updatePlayerStockAccounts(state);
        bankSettlements.push(...settleMonthlyBankInterest(state));
        for (const player of state.players) {
          bankrupted.push(...tickStatuses(state, player));
          decayPropertyBoosts(state, player);
        }
      }
      addLog(state, `${nextPlayer.nickname} 跳过了一个回合。`);
      safety += 1;
      continue;
    }

    break;
  }

  if (bankSettlements.length > 0) {
    openMonthlySettlementGate(state, bankSettlements);
  }
  state.phase = checkGameEndByCalendar(state) ? "gameOver" : "waitingRoll";
  state.pendingAction = null;
  state.dice = null;
  if (state.phase !== "gameOver" && state.status === "playing" && !state.pendingMonthlySettlement) {
    startTurnClock(state);
  } else if (state.pendingMonthlySettlement) {
    const now = Date.now();
    state.turnStartedAt = now;
    state.turnEndsAt = now;
  }
  return { stockUpdated, settlementRecords, bankrupted, announcements, bankSettlements };
}

export function endTurn(state: GameState, playerId: PlayerId): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  if (state.phase !== "tileAction") {
    return fail("Roll the dice before ending the turn.");
  }
  if (state.pendingAction?.kind === "choosePath") {
    return fail("Choose a road before ending the turn.");
  }

  const insolvencyNotice = settleExpiredInsolvency(state, current);
  if (insolvencyNotice) {
    const gameEnded = checkGameEnd(state);
    return {
      ok: true,
      movements: [],
      stockUpdated: false,
      bankrupted: [insolvencyNotice],
      gameEnded
    };
  }
  if (current.cash < 0) {
    const seconds = Math.max(1, Math.ceil(((current.insolventUntil ?? Date.now()) - Date.now()) / 1000));
    return fail(`现金为负，仍在筹款期，请先抵押、借款或兑换资金。剩余约 ${seconds} 秒。`);
  }

  state.completedTurns += 1;
  const turnAdvance = advanceTurn(state);
  const gameEnded = checkGameEnd(state);

  return {
    ok: true,
    movements: [],
    stockUpdated: turnAdvance.stockUpdated,
    stockSettlement: { records: turnAdvance.settlementRecords },
    bankrupted: turnAdvance.bankrupted,
    gameEnded,
    marketAnnouncements: turnAdvance.announcements,
    bankSettlements: turnAdvance.bankSettlements
  };
}

function forceEndCurrentTurn(state: GameState, playerId: PlayerId, reason: string): ActionOutcome {
  const current = requireCurrentPlayer(state, playerId);
  if (typeof current === "string") {
    return fail(current);
  }
  state.pendingAction = null;
  state.phase = "tileAction";
  const insolvencyNotice = settleExpiredInsolvency(state, current);
  if (insolvencyNotice) {
    const gameEnded = checkGameEnd(state);
    return {
      ok: true,
      movements: [],
      stockUpdated: false,
      bankrupted: [insolvencyNotice],
      gameEnded
    };
  }
  addLog(state, `${current.nickname} ${reason}，系统自动结束回合。`);
  state.completedTurns += 1;
  const turnAdvance = advanceTurn(state);
  const gameEnded = checkGameEnd(state);
  return {
    ok: true,
    movements: [],
    stockUpdated: turnAdvance.stockUpdated,
    stockSettlement: { records: turnAdvance.settlementRecords },
    bankrupted: turnAdvance.bankrupted,
    gameEnded,
    marketAnnouncements: turnAdvance.announcements,
    bankSettlements: turnAdvance.bankSettlements
  };
}

export function autoPlayTimedOutTurn(state: GameState): ActionOutcome {
  const current = getCurrentPlayer(state);
  if (!current) {
    return fail("当前没有可自动处理的玩家。");
  }
  if (state.status !== "playing") {
    return fail("游戏已经结束。");
  }

  let rolled: ActionOutcome | null = null;
  if (state.phase === "waitingRoll") {
    rolled = rollDice(state, current.id);
    if (!rolled.ok || rolled.gameEnded || state.status !== "playing") {
      return rolled;
    }
  }

  const stillCurrent = getCurrentPlayer(state)?.id === current.id;
  if (!stillCurrent) {
    return rolled ?? fail("回合已经切换。");
  }

  const ended = forceEndCurrentTurn(state, current.id, "回合倒计时结束");
  if (!rolled) {
    return ended;
  }
  const combined: ActionOutcome = {
    ...ended,
    movements: [...rolled.movements, ...ended.movements],
    tileEvent: rolled.tileEvent ?? ended.tileEvent,
    stockUpdated: rolled.stockUpdated || ended.stockUpdated,
    bankrupted: [...rolled.bankrupted, ...ended.bankrupted],
    gameEnded: rolled.gameEnded || ended.gameEnded,
    teleports: [...(rolled.teleports ?? []), ...(ended.teleports ?? [])],
    ticketsUpdated: [...(rolled.ticketsUpdated ?? []), ...(ended.ticketsUpdated ?? [])],
    privateSignals: [...(rolled.privateSignals ?? []), ...(ended.privateSignals ?? [])],
    marketAnnouncements: [...(rolled.marketAnnouncements ?? []), ...(ended.marketAnnouncements ?? [])],
    bankSettlements: [...(rolled.bankSettlements ?? []), ...(ended.bankSettlements ?? [])],
    stockSettlement: {
      records: [
        ...(rolled.stockSettlement?.records ?? []),
        ...(ended.stockSettlement?.records ?? [])
      ]
    }
  };
  if (rolled.dice !== undefined) {
    combined.dice = rolled.dice;
  }
  return combined;
}

export function checkGameEnd(state: GameState): boolean {
  state.rankings = buildRankings(state);
  if (state.status === "ended") {
    return true;
  }

  const activePlayers = state.players.filter((player) => !player.bankrupt);
  const maxRoundsReached = checkGameEndByCalendar(state);

  if (activePlayers.length <= 1 || maxRoundsReached) {
    state.status = "ended";
    state.phase = "gameOver";
    state.endedAt = Date.now();
    const winner: PlayerState | RankingEntry | undefined =
      activePlayers.length === 1 ? activePlayers[0] : state.rankings[0];
    state.winnerId = winner ? ("id" in winner ? winner.id : winner.playerId) : null;
    addLog(state, "游戏结束，最终排行已结算。");
    return true;
  }

  return false;
}
