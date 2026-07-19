import { GO_TILE_ID, START_TILE_OPTIONS, type GameSettings, type GameState, type PlayerState, type RoomId, type RoomPlayer, type TileId } from "@monopoly/shared";
import { mapTiles } from "../data/map";
import { propertyGroups } from "../data/propertyGroups";
import { createInitialStocks, STOCK_IDS } from "../data/stocks";
import { createInitialCalendar, getDurationDays } from "./calendar";
import { INITIAL_CASH } from "./economy";
import { createEmptyStockAccount } from "./stocks";

const avatarNames = ["Pilot", "Bot", "Ranger", "Maker"];
const START_TILE_IDS: TileId[] = START_TILE_OPTIONS.map((option) => option.tileId);

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current !== undefined && swap !== undefined) {
      result[index] = swap;
      result[swapIndex] = current;
    }
  }
  return result;
}

export function createGameState(roomId: RoomId, roomPlayers: RoomPlayer[], settings: GameSettings): GameState {
  const durationDays = getDurationDays(settings.durationMode);
  const initialMoney = Math.max(0, Math.min(999999, Math.floor((settings.initialMoney ?? INITIAL_CASH) + (settings.bankInitialMoney ?? 0))));
  const initialTickets = Math.max(0, Math.min(999, Math.floor((settings.initialTickets ?? 3) + (settings.bankInitialTickets ?? 0))));
  const initialSkillCardLimit = Math.max(1, Math.min(99, Math.floor(settings.initialSkillCardLimit ?? 5)));
  const creditLimit = Math.max(0, Math.min(999999, Math.floor(settings.creditLimit ?? 20000)));
  const now = Date.now();
  const turnDurationSeconds = Math.max(15, Math.min(300, Math.floor(settings.turnDurationSeconds ?? 60)));
  const sharedStartTileId =
    settings.startTileId && START_TILE_IDS.includes(settings.startTileId)
      ? settings.startTileId
      : GO_TILE_ID;
  const usedStartTiles = new Set<TileId>();
  const players: PlayerState[] = roomPlayers.map((player, index) => {
    const selectedStart =
      !settings.useSharedStartTile &&
      player.selectedStartTileId &&
      START_TILE_IDS.includes(player.selectedStartTileId) &&
      !usedStartTiles.has(player.selectedStartTileId)
        ? player.selectedStartTileId
        : undefined;
    const startTileId =
      settings.useSharedStartTile
        ? sharedStartTileId
        : selectedStart ??
          START_TILE_IDS.find((tileId) => !usedStartTiles.has(tileId)) ??
          START_TILE_IDS[index % START_TILE_IDS.length] ??
          GO_TILE_ID;
    usedStartTiles.add(startTileId);
    const startTile = mapTiles.find((tile) => tile.id === startTileId) ?? mapTiles[0];
    return {
      id: player.id,
      nickname: player.nickname,
      color: player.color,
      avatar: avatarNames[index % avatarNames.length] ?? "Pilot",
      selectedAvatarId: player.selectedAvatarId,
      isBot: player.isBot,
      cash: initialMoney,
      position: startTile?.index ?? 0,
      currentTileId: startTile?.id ?? "tile-00",
      homeStartTileId: startTile?.id ?? "tile-00",
      tickets: initialTickets,
      skillCards: [],
      maxSkillCards: initialSkillCardLimit,
      statusEffects: [],
      usedActiveSkillThisTurn: false,
      properties: [],
      stocks: Object.fromEntries(STOCK_IDS.map((stockId) => [stockId, 0])),
      stockAccount: createEmptyStockAccount(),
      bankAccount: {
        deposit: 0,
        debtPrincipal: 0,
        unpaidInterest: 0,
        monthlyInterestAccrued: 0,
        debt: 0,
        creditLimit,
        lastSettlementDay: 0
      },
      moveDirection: 1,
      bankrupt: false,
      insolventUntil: undefined,
      skipTurns: 0,
      connected: player.connected
    };
  });

  const properties = mapTiles.reduce<Record<TileId, GameState["properties"][TileId]>>((acc, tile) => {
    if (tile.type === "property") {
      acc[tile.id] = {
        tileId: tile.id,
        level: 0
      };
    }
    return acc;
  }, {});

  return {
    roomId,
    status: "playing",
    phase: "waitingRoll",
    settings: { ...settings },
    tiles: mapTiles.map((tile) => ({ ...tile })),
    players,
    turnOrder: shuffle(players.map((player) => player.id)),
    currentTurnIndex: 0,
    round: 1,
    completedTurns: 0,
    maxRounds: durationDays,
    dice: null,
    properties,
    propertyGroups,
    stocks: createInitialStocks(),
    pendingStockOrders: [],
    marketSignals: [],
    marketEvents: [],
    marketAnnouncements: [],
    bankSettlements: [],
    pendingMonthlySettlement: undefined,
    ticketExchangeRate: {
      moneyToTicketCost: Math.max(1, Math.floor(settings.moneyToTicketCost ?? 1000)),
      ticketToMoneyValue: Math.max(1, Math.floor(settings.ticketToMoneyValue ?? 600))
    },
    gameCalendar: createInitialCalendar(),
    pendingAction: null,
    lastEvent: null,
    logs: [
      {
        id: `log-${Date.now()}`,
        turn: 0,
        message: "游戏开始，先手玩家已随机决定。",
        createdAt: Date.now()
      }
    ],
    rankings: [],
    winnerId: null,
    startedAt: Date.now(),
    endedAt: null,
    turnStartedAt: now,
    turnEndsAt: now + turnDurationSeconds * 1000,
    turnDurationSeconds,
    latestLotteryResults: []
  };
}
