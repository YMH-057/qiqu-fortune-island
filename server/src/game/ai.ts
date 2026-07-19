import type { GameState, PendingAction, PlayerId, PlayerState, SkillCard, TileId } from "@monopoly/shared";
import {
  type ActionOutcome,
  autoPlayTimedOutTurn,
  buyProperty,
  buySkillCard,
  cancelPortalChoice,
  choosePathDirection,
  choosePortalDestination,
  closeSkillShop,
  declareBankruptcy,
  endTurn,
  rollDice,
  skipLottery,
  upgradeProperty
} from "./actions";
import { borrowCredit } from "./bank";
import { getUpgradeCost } from "./economy";
import { calculateMortgageValue, mortgageProperty } from "./mortgage";

export const AI_TURN_DELAY_MS = 850;
const AI_CASH_RESERVE_AFTER_BUY = 2500;
const AI_CASH_RESERVE_AFTER_UPGRADE = 3500;

export type AiTurnCommand =
  | { kind: "none"; reason: string }
  | { kind: "rollDice"; playerId: PlayerId }
  | { kind: "buyProperty"; playerId: PlayerId; tileId: TileId }
  | { kind: "upgradeProperty"; playerId: PlayerId; tileId: TileId }
  | { kind: "choosePath"; playerId: PlayerId; tileId: TileId }
  | { kind: "choosePortal"; playerId: PlayerId; targetTileId: TileId }
  | { kind: "cancelPortal"; playerId: PlayerId }
  | { kind: "buySkillCard"; playerId: PlayerId; skillId: string }
  | { kind: "closeSkillShop"; playerId: PlayerId }
  | { kind: "skipLottery"; playerId: PlayerId }
  | { kind: "borrowCredit"; playerId: PlayerId; amount: number }
  | { kind: "mortgageProperty"; playerId: PlayerId; tileId: TileId }
  | { kind: "declareBankruptcy"; playerId: PlayerId }
  | { kind: "endTurn"; playerId: PlayerId };

export interface AiTurnStepResult {
  command: AiTurnCommand;
  outcome?: ActionOutcome | undefined;
  dicePlayerId?: PlayerId | undefined;
}

export function isAiControlledPlayer(
  player: Pick<PlayerState, "isBot" | "bankrupt"> | null | undefined
): boolean {
  return Boolean(player?.isBot && !player.bankrupt);
}

function emptyOutcome(ok: boolean, error?: string): ActionOutcome {
  const outcome: ActionOutcome = {
    ok,
    movements: [],
    stockUpdated: false,
    bankrupted: [],
    gameEnded: false
  };
  if (error !== undefined) {
    outcome.error = error;
  }
  return outcome;
}

function getCurrentAiPlayer(state: GameState): PlayerState | null {
  const playerId = state.turnOrder[state.currentTurnIndex];
  const player = playerId ? state.players.find((item) => item.id === playerId) : undefined;
  return isAiControlledPlayer(player) ? player ?? null : null;
}

function getPendingForAi(state: GameState, player: PlayerState): PendingAction | null {
  const pending = state.pendingAction;
  if (!pending) {
    return null;
  }
  if ("playerId" in pending && pending.playerId !== player.id) {
    return null;
  }
  return pending;
}

function chooseAffordablePortal(pending: Extract<PendingAction, { kind: "portalChoice" }>, player: PlayerState) {
  return pending.options.find((option) => option.costTickets <= player.tickets) ?? null;
}

function chooseSkillOffer(offers: SkillCard[], player: PlayerState): SkillCard | null {
  if (player.skillCards.length >= player.maxSkillCards) {
    return null;
  }
  const discount = player.statusEffects.some((effect) => effect.type === "shopDiscount" && effect.turns > 0);
  return [...offers]
    .sort((left, right) => left.costTickets - right.costTickets)
    .find((offer) => {
      const cost = discount ? Math.max(1, offer.costTickets - 1) : offer.costTickets;
      return player.tickets - cost >= 1;
    }) ?? null;
}

function getCreditRemaining(player: PlayerState): number {
  const principal = player.bankAccount.debtPrincipal ?? player.bankAccount.debt ?? 0;
  return Math.max(0, (player.bankAccount.creditLimit ?? 0) - principal);
}

function getAiRecoveryCommand(state: GameState, player: PlayerState): AiTurnCommand | null {
  if (player.cash >= 0) {
    return null;
  }
  const needed = Math.abs(player.cash) + 1000;
  const remainingCredit = getCreditRemaining(player);
  if (remainingCredit > 0) {
    return {
      kind: "borrowCredit",
      playerId: player.id,
      amount: Math.min(remainingCredit, needed)
    };
  }
  const mortgageTile = player.properties
    .map((tileId) => ({
      tile: state.tiles.find((tile) => tile.id === tileId),
      property: state.properties[tileId]
    }))
    .filter((entry) => entry.tile?.type === "property" && entry.property?.ownerId === player.id && !entry.property.isMortgaged)
    .sort((left, right) => calculateMortgageValue(right.tile!) - calculateMortgageValue(left.tile!))[0]?.tile;
  if (mortgageTile) {
    return { kind: "mortgageProperty", playerId: player.id, tileId: mortgageTile.id };
  }
  if (player.insolventUntil !== undefined && player.insolventUntil > Date.now()) {
    return { kind: "none", reason: "等待负现金筹款期结束。" };
  }
  return { kind: "declareBankruptcy", playerId: player.id };
}

export function getAiTurnCommand(state: GameState): AiTurnCommand {
  if (state.status !== "playing" || state.phase === "gameOver") {
    return { kind: "none", reason: "游戏不在进行中。" };
  }
  if (state.pendingMonthlySettlement) {
    return { kind: "none", reason: "等待真人玩家关闭月度结算。" };
  }

  const player = getCurrentAiPlayer(state);
  if (!player) {
    return { kind: "none", reason: "当前回合玩家不是 AI。" };
  }

  const recovery = getAiRecoveryCommand(state, player);
  if (recovery) {
    return recovery;
  }

  if (state.phase === "waitingRoll") {
    return { kind: "rollDice", playerId: player.id };
  }

  const pending = getPendingForAi(state, player);
  if (!pending) {
    return { kind: "endTurn", playerId: player.id };
  }

  if (pending.kind === "buyProperty") {
    const tile = state.tiles.find((item) => item.id === pending.tileId);
    const price = tile?.price ?? 0;
    if (price > 0 && player.cash - price >= AI_CASH_RESERVE_AFTER_BUY) {
      return { kind: "buyProperty", playerId: player.id, tileId: pending.tileId };
    }
    return { kind: "endTurn", playerId: player.id };
  }

  if (pending.kind === "upgradeProperty") {
    const tile = state.tiles.find((item) => item.id === pending.tileId);
    const property = state.properties[pending.tileId];
    const cost = tile && property ? getUpgradeCost(tile, property) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(cost) && player.cash - cost >= AI_CASH_RESERVE_AFTER_UPGRADE) {
      return { kind: "upgradeProperty", playerId: player.id, tileId: pending.tileId };
    }
    return { kind: "endTurn", playerId: player.id };
  }

  if (pending.kind === "choosePath") {
    const option = pending.options[Math.floor(Math.random() * pending.options.length)] ?? pending.options[0];
    return option
      ? { kind: "choosePath", playerId: player.id, tileId: option.tileId }
      : { kind: "endTurn", playerId: player.id };
  }

  if (pending.kind === "portalChoice") {
    const option = chooseAffordablePortal(pending, player);
    return option
      ? { kind: "choosePortal", playerId: player.id, targetTileId: option.targetTileId }
      : { kind: "cancelPortal", playerId: player.id };
  }

  if (pending.kind === "skillShop") {
    const offer = chooseSkillOffer(pending.offers, player);
    return offer
      ? { kind: "buySkillCard", playerId: player.id, skillId: offer.id }
      : { kind: "closeSkillShop", playerId: player.id };
  }

  if (pending.kind === "lottery") {
    return { kind: "skipLottery", playerId: player.id };
  }

  return { kind: "endTurn", playerId: player.id };
}

function executeAiTurnCommand(state: GameState, command: AiTurnCommand): AiTurnStepResult {
  switch (command.kind) {
    case "rollDice":
      return { command, outcome: rollDice(state, command.playerId), dicePlayerId: command.playerId };
    case "buyProperty":
      return { command, outcome: buyProperty(state, command.playerId, command.tileId) };
    case "upgradeProperty":
      return { command, outcome: upgradeProperty(state, command.playerId, command.tileId) };
    case "choosePath":
      return { command, outcome: choosePathDirection(state, command.playerId, command.tileId) };
    case "choosePortal":
      return { command, outcome: choosePortalDestination(state, command.playerId, command.targetTileId) };
    case "cancelPortal":
      return { command, outcome: cancelPortalChoice(state, command.playerId) };
    case "buySkillCard":
      return { command, outcome: buySkillCard(state, command.playerId, command.skillId) };
    case "closeSkillShop":
      return { command, outcome: closeSkillShop(state, command.playerId) };
    case "skipLottery":
      return { command, outcome: skipLottery(state, command.playerId) };
    case "borrowCredit": {
      const result = borrowCredit(state, command.playerId, command.amount);
      return { command, outcome: emptyOutcome(result.ok, result.ok ? undefined : result.message) };
    }
    case "mortgageProperty": {
      const result = mortgageProperty(state, command.playerId, command.tileId);
      return { command, outcome: emptyOutcome(result.ok, result.ok ? undefined : result.message) };
    }
    case "declareBankruptcy":
      return { command, outcome: declareBankruptcy(state, command.playerId) };
    case "endTurn":
      return { command, outcome: endTurn(state, command.playerId) };
    case "none":
      return { command };
  }
}

export function runAiTurnStep(state: GameState): AiTurnStepResult {
  const step = executeAiTurnCommand(state, getAiTurnCommand(state));
  if (step.outcome?.ok !== false) {
    return step;
  }

  const player = getCurrentAiPlayer(state);
  const waitingForInsolvencyGrace =
    player &&
    player.cash < 0 &&
    player.insolventUntil !== undefined &&
    player.insolventUntil > Date.now();
  if (waitingForInsolvencyGrace) {
    return step;
  }

  return {
    command: step.command,
    outcome: autoPlayTimedOutTurn(state)
  };
}
