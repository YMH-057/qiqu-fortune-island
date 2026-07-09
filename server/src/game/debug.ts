import type {
  DebugCatalog,
  DebugCommand,
  GamePhase,
  GameState,
  PlayerId,
  PlayerState,
  SkillCard,
  StockHolding,
  StockId,
  StockLot,
  TileId
} from "@monopoly/shared";
import { luckCards } from "../data/luckCards";
import { makeSkillCard, skillCardTemplates } from "../data/skillCards";
import { type ActionOutcome, addLog, addStatus, debugResolveSpecificLuckCard, debugTeleportToTile, getPlayer, getTileById, setPlayerTile, startTurnClock } from "./actions";
import { MAX_PROPERTY_LEVEL } from "./economy";
import { calculateMortgageRedeemCost, calculateMortgageValue } from "./mortgage";
import { updatePlayerStockAccounts } from "./stocks";

interface DebugExecutionResult {
  ok: boolean;
  error?: string;
  message?: string;
  outcome?: ActionOutcome;
  stockUpdated?: boolean;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function currentTurnPlayerIndex(state: GameState, playerId: PlayerId): number {
  return state.turnOrder.findIndex((item) => item === playerId);
}

function focusTurnOnPlayer(state: GameState, playerId: PlayerId, phase: GamePhase = "tileAction"): void {
  const turnIndex = currentTurnPlayerIndex(state, playerId);
  if (turnIndex >= 0) {
    state.currentTurnIndex = turnIndex;
  }
  state.phase = phase;
  if (phase === "waitingRoll") {
    state.dice = null;
    state.pendingAction = null;
  }
  startTurnClock(state);
}

function setPlayerInsolvency(state: GameState, player: PlayerState): void {
  if (player.cash >= 0) {
    player.insolventUntil = undefined;
    return;
  }
  player.insolventUntil = Date.now() + 60_000;
  state.turnEndsAt = Math.max(state.turnEndsAt, player.insolventUntil);
}

function findPlayerOrError(state: GameState, playerId: PlayerId): PlayerState | string {
  const player = getPlayer(state, playerId);
  return player ?? "Player not found.";
}

function currentDateLot(state: GameState, stockId: StockId, shares: number, price: number): StockLot {
  return {
    id: `debug-lot-${Date.now()}-${stockId}`,
    stockId,
    shares,
    costPerShare: price,
    totalCost: Math.round(price * shares * 100) / 100,
    acquiredAt: {
      year: state.gameCalendar.year,
      month: state.gameCalendar.month,
      day: state.gameCalendar.day
    },
    source: "grant"
  };
}

function removePropertyFromAllPlayers(state: GameState, tileId: TileId): void {
  for (const player of state.players) {
    player.properties = player.properties.filter((ownedTileId) => ownedTileId !== tileId);
  }
}

function assignPropertyToPlayer(state: GameState, tileId: TileId, ownerPlayerId: PlayerId | null | undefined): string | null {
  const property = state.properties[tileId];
  if (!property) {
    return "Property state not found.";
  }

  removePropertyFromAllPlayers(state, tileId);
  if (!ownerPlayerId) {
    delete property.ownerId;
    property.level = 0;
    property.isMortgaged = false;
    property.mortgageValue = undefined;
    property.mortgageRedeemCost = undefined;
    property.rentBoostTurns = 0;
    property.rentCutTurns = 0;
    property.rentHornBonus = 0;
    property.rentLimitTurns = 0;
    property.rentLimitAmount = undefined;
    property.insuranceTurns = 0;
    property.mortgageFreezeTurns = 0;
    return null;
  }

  const owner = getPlayer(state, ownerPlayerId);
  if (!owner) {
    return "Property owner not found.";
  }
  property.ownerId = owner.id;
  owner.properties = [...new Set([...owner.properties, tileId])];
  return null;
}

function buildHolding(state: GameState, stockId: StockId, shares: number): StockHolding {
  const stock = state.stocks[stockId];
  const currentPrice = stock.currentPrice ?? stock.price;
  const totalCost = Math.round(currentPrice * shares * 100) / 100;
  return {
    stockId,
    shares,
    averageCost: currentPrice,
    totalCost,
    currentPrice,
    marketValue: totalCost,
    unrealizedProfit: 0,
    unrealizedProfitRate: 0,
    lots: [currentDateLot(state, stockId, shares, currentPrice)]
  };
}

function buildCatalog(): DebugCatalog {
  return {
    skillCards: [...skillCardTemplates]
      .map((card) => ({
        code: card.code,
        name: card.displayName ?? card.name,
        rarity: card.rarity,
        type: card.type,
        target: card.target,
        costTickets: card.costTickets
      }))
      .sort((left, right) => left.costTickets - right.costTickets || left.name.localeCompare(right.name, "zh-CN")),
    luckCards: [...luckCards]
      .map((card) => ({
        id: card.id,
        deck: card.deck,
        title: card.title,
        description: card.description,
        tone: card.tone
      }))
      .sort((left, right) => left.deck.localeCompare(right.deck) || left.title.localeCompare(right.title, "zh-CN"))
  };
}

function grantSkillCard(
  state: GameState,
  targetPlayerId: PlayerId,
  skillCode: Extract<DebugCommand, { kind: "grantSkillCard" }>["skillCode"]
): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }
  const template = skillCardTemplates.find((item) => item.code === skillCode);
  if (!template) {
    return { ok: false, error: "Skill template not found." };
  }

  const card: SkillCard = makeSkillCard(template, `debug-${Date.now()}`);
  player.skillCards.push(card);
  player.maxSkillCards = Math.max(player.maxSkillCards, player.skillCards.length);
  addLog(state, `${player.nickname} 获得了管理员发放的技能卡【${card.displayName ?? card.name}】。`);
  return { ok: true, message: `已向 ${player.nickname} 发放技能卡【${card.displayName ?? card.name}】。` };
}

function triggerLuckCard(state: GameState, targetPlayerId: PlayerId, cardId: string): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }
  focusTurnOnPlayer(state, player.id, "tileAction");
  state.pendingAction = null;
  const outcome = debugResolveSpecificLuckCard(state, player.id, cardId);
  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? "Could not trigger luck card." };
  }
  const card = luckCards.find((item) => item.id === cardId);
  return { ok: true, message: `已触发【${card?.title ?? cardId}】。`, outcome };
}

function teleportPlayer(state: GameState, targetPlayerId: PlayerId, tileId: TileId, resolveTile: boolean): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }
  focusTurnOnPlayer(state, player.id, "tileAction");
  state.pendingAction = null;
  const outcome = debugTeleportToTile(state, player.id, tileId, resolveTile);
  if (!outcome.ok) {
    return { ok: false, error: outcome.error ?? "Could not teleport player." };
  }
  return {
    ok: true,
    message: `已将 ${player.nickname} 传送到 ${getTileById(state, tileId)?.name ?? tileId}${resolveTile ? " 并结算格子效果" : ""}。`,
    outcome
  };
}

function setPlayerResources(
  state: GameState,
  targetPlayerId: PlayerId,
  patch: Extract<DebugCommand, { kind: "setPlayerResources" }>
): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }

  if (patch.cash !== undefined) {
    player.cash = clampInteger(patch.cash, -999999, 9999999);
  }
  if (patch.tickets !== undefined) {
    player.tickets = clampInteger(patch.tickets, 0, 9999);
  }
  if (patch.deposit !== undefined) {
    player.bankAccount.deposit = clampInteger(patch.deposit, 0, 9999999);
  }
  if (patch.debtPrincipal !== undefined) {
    player.bankAccount.debtPrincipal = clampInteger(patch.debtPrincipal, 0, 9999999);
  }
  if (patch.unpaidInterest !== undefined) {
    player.bankAccount.unpaidInterest = clampInteger(patch.unpaidInterest, 0, 9999999);
  }
  player.bankAccount.creditLimit = state.settings.creditLimit;
  player.bankAccount.debt = player.bankAccount.debtPrincipal + player.bankAccount.unpaidInterest;
  setPlayerInsolvency(state, player);
  addLog(state, `${player.nickname} 的资金与银行数据已由管理员调整。`);
  return { ok: true, message: `已更新 ${player.nickname} 的现金、彩券或银行数据。` };
}

function setPropertyState(state: GameState, patch: Extract<DebugCommand, { kind: "setPropertyState" }>): DebugExecutionResult {
  const tile = getTileById(state, patch.tileId);
  if (!tile || tile.type !== "property") {
    return { ok: false, error: "Only property tiles can be edited here." };
  }
  const property = state.properties[patch.tileId];
  if (!property) {
    return { ok: false, error: "Property state not found." };
  }

  const ownerError = assignPropertyToPlayer(state, patch.tileId, patch.ownerPlayerId);
  if (ownerError) {
    return { ok: false, error: ownerError };
  }

  if (property.ownerId) {
    if (patch.level !== undefined) {
      property.level = clampInteger(patch.level, 0, MAX_PROPERTY_LEVEL);
    }
    if (patch.isMortgaged !== undefined) {
      if (patch.isMortgaged) {
        property.isMortgaged = true;
        property.mortgageValue = calculateMortgageValue(tile);
        property.mortgageRedeemCost = calculateMortgageRedeemCost(tile);
      } else {
        property.isMortgaged = false;
        property.mortgageValue = undefined;
        property.mortgageRedeemCost = undefined;
      }
    }
  }

  addLog(
    state,
    property.ownerId
      ? `${tile.name} 已由管理员设为 ${getPlayer(state, property.ownerId)?.nickname ?? property.ownerId} 持有。`
      : `${tile.name} 已由管理员重置为空地。`
  );
  return { ok: true, message: `已更新地产【${tile.name}】的归属和状态。` };
}

function setPlayerStockHolding(
  state: GameState,
  targetPlayerId: PlayerId,
  stockId: StockId,
  shares: number
): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }
  const stock = state.stocks[stockId];
  if (!stock) {
    return { ok: false, error: "Stock not found." };
  }

  const safeShares = clampInteger(shares, 0, 999999);
  state.pendingStockOrders = state.pendingStockOrders.filter(
    (order) => !(order.playerId === player.id && order.stockId === stockId)
  );
  if (safeShares <= 0) {
    delete player.stockAccount.holdings[stockId];
    delete player.stocks[stockId];
  } else {
    player.stockAccount.holdings[stockId] = buildHolding(state, stockId, safeShares);
    player.stocks[stockId] = safeShares;
  }
  updatePlayerStockAccounts(state);
  addLog(state, `${player.nickname} 的 ${stock.name} 持仓已由管理员设为 ${safeShares} 股。`);
  return { ok: true, message: `已将 ${player.nickname} 的 ${stock.name} 持仓设为 ${safeShares} 股。` };
}

function setStockPrice(state: GameState, stockId: StockId, nextPrice: number): DebugExecutionResult {
  const stock = state.stocks[stockId];
  if (!stock) {
    return { ok: false, error: "Stock not found." };
  }
  const previousPrice = stock.currentPrice ?? stock.price;
  const safePrice = Math.max(5, Math.round(nextPrice * 100) / 100);
  stock.previousPrice = previousPrice;
  stock.currentPrice = safePrice;
  stock.price = safePrice;
  stock.change = Math.round((safePrice - previousPrice) * 100) / 100;
  stock.trend = stock.change;
  stock.changeRate = previousPrice > 0 ? Math.round(((stock.change / previousPrice) * 100) * 100) / 100 : 0;
  stock.history.push({
    year: state.gameCalendar.year,
    month: state.gameCalendar.month,
    day: state.gameCalendar.day,
    price: safePrice
  });
  stock.history = stock.history.slice(-90);
  updatePlayerStockAccounts(state);
  addLog(state, `${stock.name} 的价格已由管理员调整为 ${safePrice}。`);
  return { ok: true, message: `已将 ${stock.name} 的价格调整为 ${safePrice}。`, stockUpdated: true };
}

function setPlayerDetention(
  state: GameState,
  targetPlayerId: PlayerId,
  detention: Extract<DebugCommand, { kind: "setPlayerDetention" }>["detention"],
  turns: number | undefined
): DebugExecutionResult {
  const player = findPlayerOrError(state, targetPlayerId);
  if (typeof player === "string") {
    return { ok: false, error: player };
  }

  player.statusEffects = player.statusEffects.filter((effect) => effect.type !== "jail" && effect.type !== "hospital");
  if (detention === "none") {
    player.skipTurns = 0;
    addLog(state, `${player.nickname} 已被管理员解除监狱/医院状态。`);
    return { ok: true, message: `已清除 ${player.nickname} 的拘留状态。` };
  }

  const safeTurns = clampInteger(turns ?? 3, 1, 10);
  addStatus(player, detention, safeTurns, undefined, {
    label: detention === "jail" ? "泡泡监狱" : "棉花糖医院",
    description: `管理员设置：停留 ${safeTurns} 回合。`
  });
  player.skipTurns = safeTurns;
  const targetTile = getTileById(state, detention === "jail" ? "jail-05" : "hospital-05");
  if (targetTile) {
    setPlayerTile(state, player, targetTile);
  }
  addLog(state, `${player.nickname} 已被管理员送往${detention === "jail" ? "泡泡监狱" : "棉花糖医院"} ${safeTurns} 回合。`);
  return {
    ok: true,
    message: `已将 ${player.nickname} 送往${detention === "jail" ? "监狱" : "医院"} ${safeTurns} 回合。`
  };
}

function setTurnState(state: GameState, patch: Extract<DebugCommand, { kind: "setTurnState" }>): DebugExecutionResult {
  if (patch.currentPlayerId) {
    const turnIndex = currentTurnPlayerIndex(state, patch.currentPlayerId);
    if (turnIndex < 0) {
      return { ok: false, error: "Turn player not found in turn order." };
    }
    state.currentTurnIndex = turnIndex;
  }
  if (patch.round !== undefined) {
    state.round = clampInteger(patch.round, 1, Math.max(1, state.maxRounds));
  }
  if (patch.completedTurns !== undefined) {
    state.completedTurns = clampInteger(patch.completedTurns, 0, 999999);
  }
  if (patch.clearPendingAction) {
    state.pendingAction = null;
  }
  if (patch.phase) {
    state.phase = patch.phase;
    if (patch.phase === "waitingRoll") {
      state.dice = null;
      state.pendingAction = null;
    }
  }
  startTurnClock(state);
  addLog(state, "管理员调整了当前回合、阶段或回合计数。");
  return { ok: true, message: "已更新当前回合与阶段。"};
}

export function getDebugCatalog(): DebugCatalog {
  return buildCatalog();
}

export function executeDebugCommand(state: GameState, command: DebugCommand): DebugExecutionResult {
  switch (command.kind) {
    case "getCatalog":
      return { ok: true, message: "Debug catalog ready." };
    case "grantSkillCard":
      return grantSkillCard(state, command.targetPlayerId, command.skillCode);
    case "triggerLuckCard":
      return triggerLuckCard(state, command.targetPlayerId, command.cardId);
    case "teleportPlayer":
      return teleportPlayer(state, command.targetPlayerId, command.tileId, Boolean(command.resolveTile));
    case "setPlayerResources":
      return setPlayerResources(state, command.targetPlayerId, command);
    case "setPropertyState":
      return setPropertyState(state, command);
    case "setPlayerStockHolding":
      return setPlayerStockHolding(state, command.targetPlayerId, command.stockId, command.shares);
    case "setStockPrice":
      return setStockPrice(state, command.stockId, command.price);
    case "setPlayerDetention":
      return setPlayerDetention(state, command.targetPlayerId, command.detention, command.turns);
    case "setTurnState":
      return setTurnState(state, command);
    default:
      return { ok: false, error: "Unsupported debug command." };
  }
}
