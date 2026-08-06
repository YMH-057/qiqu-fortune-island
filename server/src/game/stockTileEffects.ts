import type { GameState, MarketEvent, MarketSignal, PlayerId, Stock, StockId, StockSector } from "@monopoly/shared";
import { nextTradingDate } from "./calendar";

const sectors: StockSector[] = [
  "tech",
  "food",
  "transport",
  "energy",
  "entertainment",
  "finance",
  "estate",
  "industry",
  "retail",
  "communication"
];

const sectorNames: Record<StockSector, string> = {
  tech: "科技",
  food: "食品",
  transport: "航运",
  energy: "能源",
  entertainment: "娱乐",
  finance: "金融",
  estate: "地产",
  industry: "制造",
  retail: "零售",
  communication: "通信"
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomItem<T>(items: T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("Cannot choose from an empty list.");
  }
  return item;
}

function targetDate(gameState: GameState) {
  return nextTradingDate(gameState.gameCalendar);
}

function sameTargetDate(
  left: MarketSignal["targetDate"],
  right: MarketSignal["targetDate"]
): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function signalScopesOverlap(
  gameState: GameState,
  existing: MarketSignal,
  stockId?: StockId,
  sector?: StockSector
): boolean {
  if (existing.stockId && stockId) {
    return existing.stockId === stockId;
  }
  if (existing.sector && sector) {
    return existing.sector === sector;
  }
  if (existing.stockId && sector) {
    return gameState.stocks[existing.stockId]?.sector === sector;
  }
  if (existing.sector && stockId) {
    return gameState.stocks[stockId]?.sector === existing.sector;
  }
  return false;
}

function consistentGuaranteedDirection(
  gameState: GameState,
  date: MarketSignal["targetDate"],
  stockId: StockId | undefined,
  sector: StockSector | undefined,
  proposed: Extract<MarketSignal["direction"], "bullish" | "bearish">
): Extract<MarketSignal["direction"], "bullish" | "bearish"> {
  const existing = gameState.marketSignals.find((signal) =>
    !signal.used
    && signal.accuracy >= 1
    && (signal.direction === "bullish" || signal.direction === "bearish")
    && sameTargetDate(signal.targetDate, date)
    && signalScopesOverlap(gameState, signal, stockId, sector)
  );
  return existing?.direction === "bullish" || existing?.direction === "bearish"
    ? existing.direction
    : proposed;
}

export function createMarketSignal(
  gameState: GameState,
  source: MarketSignal["source"],
  stronger = false,
  ownerPlayerId?: PlayerId
): MarketSignal {
  const stocks = Object.values(gameState.stocks);
  const isPrivateSignal = Boolean(ownerPlayerId) || source === "stock_tile";
  const stockChance = isPrivateSignal || stronger ? 1 : 0.86;
  const stock = Math.random() < stockChance ? randomItem(stocks) : null;
  const sector = stock ? undefined : randomItem(sectors);
  const directionRoll = Math.random();
  const proposedDirection: MarketSignal["direction"] =
    isPrivateSignal || stronger
      ? directionRoll < 0.5
        ? "bullish"
        : "bearish"
      : directionRoll < 0.49
        ? "bullish"
        : directionRoll < 0.98
          ? "bearish"
          : directionRoll < 0.99
            ? "volatile"
            : "stable";
  const nextDate = targetDate(gameState);
  const direction = isPrivateSignal && (proposedDirection === "bullish" || proposedDirection === "bearish")
    ? consistentGuaranteedDirection(gameState, nextDate, stock?.id, sector, proposedDirection)
    : proposedDirection;
  const label = stock ? stock.name : `${sectorNames[sector ?? "tech"]}行业`;
  const directionText: Record<MarketSignal["direction"], string> = {
    bullish: "上涨",
    bearish: "下跌",
    volatile: "波动加大",
    stable: "趋于稳定"
  };
  return {
    id: uid("signal"),
    stockId: stock?.id,
    sector,
    direction,
    strength: stronger || isPrivateSignal ? 0.065 : 0.038,
    accuracy: isPrivateSignal ? 1 : stronger ? 0.85 : 0.68,
    targetDate: nextDate,
    source,
    message: `情报显示：${label} 下个交易日可能${directionText[direction]}。`,
    isPublic: !isPrivateSignal,
    ownerPlayerId: isPrivateSignal ? ownerPlayerId : undefined
  };
}

export function createDirectedStockSignal(
  gameState: GameState,
  stockId: StockId | undefined,
  direction: Extract<MarketSignal["direction"], "bullish" | "bearish">,
  ownerPlayerId: PlayerId,
  source: MarketSignal["source"] = "system"
): MarketSignal {
  const stocks = Object.values(gameState.stocks);
  const stock = (stockId ? gameState.stocks[stockId] : undefined) ?? randomItem(stocks);
  const nextDate = targetDate(gameState);
  const consistentDirection = consistentGuaranteedDirection(gameState, nextDate, stock.id, undefined, direction);
  const directionText = consistentDirection === "bullish" ? "上涨" : "下跌";
  return {
    id: uid("signal"),
    stockId: stock.id,
    direction: consistentDirection,
    strength: 0.075,
    accuracy: 1,
    targetDate: nextDate,
    source,
    message: `情报显示：${stock.name} 下个交易日可能${directionText}。`,
    isPublic: false,
    ownerPlayerId
  };
}

export function createMarketEvent(gameState: GameState): MarketEvent {
  const sector = randomItem(sectors);
  const direction = randomItem<MarketEvent["direction"]>(["bullish", "bearish", "volatile"]);
  const directionText: Record<MarketEvent["direction"], string> = {
    bullish: "利好",
    bearish: "利空",
    volatile: "震荡",
    stable: "稳定"
  };
  return {
    id: uid("market-event"),
    title: `${sectorNames[sector]}新闻`,
    message: `金融新闻社发布${sectorNames[sector]}${directionText[direction]}消息，未来 2 个交易日会影响价格。`,
    sector,
    direction,
    strength: 0.022,
    startDate: {
      year: gameState.gameCalendar.year,
      month: gameState.gameCalendar.month,
      day: gameState.gameCalendar.day
    },
    daysRemaining: 2,
    isPublic: true
  };
}

export function applyStockTileEffect(gameState: GameState, playerId: PlayerId, tileName: string): string {
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player) {
    return "股票地块效果未触发。";
  }

  if (tileName.includes("交易") || tileName.includes("交易所")) {
    player.statusEffects = player.statusEffects.filter((effect) => effect.type !== "stockFeeDiscount");
    player.statusEffects.push({
      id: uid("status"),
      type: "stockFeeDiscount",
      turns: 1,
      value: 0.5
    });
    return "股票交易所提供手续费半价优惠，下一次股票结算时生效。";
  }

  if (tileName.includes("新闻")) {
    const event = createMarketEvent(gameState);
    gameState.marketEvents.push(event);
    return event.message;
  }

  const signal = createMarketSignal(gameState, "stock_tile", tileName.includes("观察") || tileName.includes("大厅"), playerId);
  gameState.marketSignals.push(signal);
  return "你获得了一条 100% 准确的个人股市情报，请在股票面板的市场情报中查看。";
}

export function stockSectorAverageChange(stocks: Stock[], sector: StockSector, days: number): number {
  const sectorStocks = stocks.filter((stock) => stock.sector === sector);
  if (sectorStocks.length === 0) {
    return 0;
  }
  const total = sectorStocks.reduce((sum, stock) => {
    const history = stock.history.slice(-days);
    const first = history[0];
    const last = history[history.length - 1];
    if (!first || !last || first.price <= 0) {
      return sum;
    }
    return sum + ((last.price - first.price) / first.price) * 100;
  }, 0);
  return Math.round((total / sectorStocks.length) * 100) / 100;
}
