import type {
  GameState,
  PlayerId,
  PlayerState,
  Stock,
  StockAccount,
  StockHolding,
  StockId,
  StockLot,
  StockOrder,
  StockOrderDate,
  StockTradeRecord
} from "@monopoly/shared";
import { getCurrentMonthMarketTheme, getMonthLength, isStockTradingDay } from "./calendar";
import { appendGameLog } from "./gameLog";

export interface StockTradeResult {
  ok: boolean;
  error?: string;
  record?: StockTradeRecord;
  account?: StockAccount;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function feeFor(amount: number, rate = 0.01): number {
  return Math.max(0, Math.ceil(amount * Math.max(0, rate)));
}

function stockPrice(stock: Stock): number {
  return stock.currentPrice ?? stock.price;
}

function currentStockDate(gameState: GameState): StockOrderDate {
  return {
    year: gameState.gameCalendar.year,
    month: gameState.gameCalendar.month,
    day: gameState.gameCalendar.day
  };
}

function sameCalendarDate(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function dateKey(date: { year: number; month: number; day: number }): number {
  return date.year * 10000 + date.month * 100 + date.day;
}

function nextCalendarDate(date: StockOrderDate): StockOrderDate {
  let day = date.day + 1;
  let month = date.month;
  let year = date.year;
  if (day > getMonthLength(month)) {
    day = 1;
    month += 1;
  }
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return { year, month, day };
}

export function createEmptyStockAccount(): StockAccount {
  return {
    cashFrozen: 0,
    holdings: {},
    realizedProfit: 0,
    totalMarketValue: 0,
    totalUnrealizedProfit: 0,
    totalUnrealizedProfitRate: 0,
    tradeHistory: [],
    pendingOrders: []
  };
}

export function calculateAverageCost(previousShares: number, previousCost: number, buyShares: number, buyAmount: number): number {
  const totalShares = previousShares + buyShares;
  if (totalShares <= 0) {
    return 0;
  }
  return roundMoney((previousCost + buyAmount) / totalShares);
}

function sumLotCost(lots: StockLot[]): number {
  return roundMoney(lots.reduce((sum, lot) => sum + lot.totalCost, 0));
}

function normalizeHoldingLots(holding: StockHolding | undefined, stockId: StockId): StockLot[] {
  if (!holding || holding.shares <= 0) {
    return [];
  }
  const existingLots = (holding.lots ?? []).filter((lot) => lot.shares > 0);
  if (existingLots.length > 0) {
    return existingLots.map((lot) => ({
      ...lot,
      stockId,
      shares: Math.floor(lot.shares),
      totalCost: roundMoney(lot.totalCost),
      costPerShare: lot.shares > 0 ? roundMoney(lot.totalCost / lot.shares) : lot.costPerShare
    }));
  }

  return [{
    id: uid("legacy-lot"),
    stockId,
    shares: holding.shares,
    costPerShare: holding.averageCost,
    totalCost: holding.totalCost,
    acquiredAt: { year: 0, month: 0, day: 0 },
    source: "buy"
  }];
}

function makeStockLot(
  stockId: StockId,
  shares: number,
  totalCost: number,
  acquiredAt: StockOrderDate,
  source: StockLot["source"],
  protectedUntil?: StockOrderDate
): StockLot {
  return {
    id: uid("lot"),
    stockId,
    shares,
    costPerShare: shares > 0 ? roundMoney(totalCost / shares) : 0,
    totalCost: roundMoney(totalCost),
    acquiredAt,
    protectedUntil,
    source
  };
}

function buildHoldingFromLots(stockId: StockId, lots: StockLot[], currentPrice: number, base?: StockHolding): StockHolding {
  const safeLots = lots.filter((lot) => lot.shares > 0);
  const shares = safeLots.reduce((sum, lot) => sum + lot.shares, 0);
  const totalCost = sumLotCost(safeLots);
  return {
    stockId,
    shares,
    averageCost: shares > 0 ? roundMoney(totalCost / shares) : 0,
    totalCost,
    currentPrice,
    marketValue: base?.marketValue ?? 0,
    unrealizedProfit: base?.unrealizedProfit ?? 0,
    unrealizedProfitRate: base?.unrealizedProfitRate ?? 0,
    lots: safeLots
  };
}

function reduceLotsForSale(holding: StockHolding, stockId: StockId, sharesToSell: number): { lots: StockLot[]; soldCost: number } {
  let remainingToSell = sharesToSell;
  let soldCost = 0;
  const remainingLots: StockLot[] = [];

  for (const lot of normalizeHoldingLots(holding, stockId)) {
    if (remainingToSell <= 0) {
      remainingLots.push(lot);
      continue;
    }

    const soldShares = Math.min(lot.shares, remainingToSell);
    const costForSoldShares = soldShares === lot.shares ? lot.totalCost : roundMoney(lot.costPerShare * soldShares);
    soldCost = roundMoney(soldCost + costForSoldShares);
    remainingToSell -= soldShares;

    const lotRemainingShares = lot.shares - soldShares;
    if (lotRemainingShares > 0) {
      const lotRemainingCost = roundMoney(lot.totalCost - costForSoldShares);
      remainingLots.push({
        ...lot,
        shares: lotRemainingShares,
        totalCost: lotRemainingCost,
        costPerShare: roundMoney(lotRemainingCost / lotRemainingShares)
      });
    }
  }

  return { lots: remainingLots, soldCost };
}

function recalcHolding(stock: Stock, holding: StockHolding, pricingDate?: StockOrderDate): StockHolding {
  const currentPrice = stockPrice(stock);
  const lots = normalizeHoldingLots(holding, holding.stockId);
  const hasLots = lots.length > 0;
  const totalCost = hasLots ? sumLotCost(lots) : holding.totalCost;
  const shares = hasLots ? lots.reduce((sum, lot) => sum + lot.shares, 0) : holding.shares;
  const marketValue = hasLots
    ? roundMoney(lots.reduce((sum, lot) => {
      const isAcquiredToday = Boolean(pricingDate) && sameCalendarDate(lot.acquiredAt, pricingDate!);
      const isProtected = Boolean(pricingDate && lot.protectedUntil && dateKey(pricingDate) <= dateKey(lot.protectedUntil));
      return sum + (isAcquiredToday || isProtected ? lot.totalCost : lot.shares * currentPrice);
    }, 0))
    : roundMoney(holding.shares * currentPrice);
  const unrealizedProfit = roundMoney(marketValue - totalCost);
  const unrealizedProfitRate = totalCost > 0 ? roundMoney((unrealizedProfit / totalCost) * 100) : 0;
  return {
    ...holding,
    shares,
    averageCost: shares > 0 ? roundMoney(totalCost / shares) : 0,
    totalCost,
    currentPrice,
    marketValue,
    unrealizedProfit,
    unrealizedProfitRate,
    lots: hasLots ? lots : holding.lots
  };
}

export function calculateStockAccountSummary(
  account: StockAccount,
  stocks: Record<StockId, Stock>,
  pricingDate?: StockOrderDate
): StockAccount {
  const holdings: StockAccount["holdings"] = {};
  let totalMarketValue = 0;
  let totalCost = 0;

  for (const [stockId, holding] of Object.entries(account.holdings) as Array<[StockId, StockHolding | undefined]>) {
    if (!holding || holding.shares <= 0) {
      continue;
    }
    const stock = stocks[stockId];
    if (!stock) {
      continue;
    }
    const nextHolding = recalcHolding(stock, holding, pricingDate);
    holdings[stockId] = nextHolding;
    totalMarketValue += nextHolding.marketValue;
    totalCost += nextHolding.totalCost;
  }

  const totalUnrealizedProfit = roundMoney(totalMarketValue - totalCost);
  return {
    ...account,
    holdings,
    totalMarketValue: roundMoney(totalMarketValue),
    totalUnrealizedProfit,
    totalUnrealizedProfitRate: totalCost > 0 ? roundMoney((totalUnrealizedProfit / totalCost) * 100) : 0,
    tradeHistory: account.tradeHistory.slice(-60),
    pendingOrders: account.pendingOrders ?? [],
    cashFrozen: account.cashFrozen ?? 0
  };
}

export function updatePlayerStockAccounts(gameState: GameState): void {
  for (const player of gameState.players) {
    player.stockAccount.pendingOrders = gameState.pendingStockOrders.filter((order) => order.playerId === player.id);
    player.stockAccount = calculateStockAccountSummary(player.stockAccount, gameState.stocks, currentStockDate(gameState));
    player.stocks = Object.fromEntries(
      Object.entries(player.stockAccount.holdings).map(([stockId, holding]) => [stockId, holding?.shares ?? 0])
    ) as Partial<Record<StockId, number>>;
  }
}

function sameDate(order: StockOrder, gameState: GameState): boolean {
  return order.submittedAt.year === gameState.gameCalendar.year
    && order.submittedAt.month === gameState.gameCalendar.month
    && order.submittedAt.day === gameState.gameCalendar.day;
}

function stockFeeMultiplier(gameState: GameState, playerId: PlayerId, side: "buy" | "sell"): number {
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player) {
    return 1;
  }
  const hasFreeCommission = player.statusEffects.some((item) => item.type === "stockFreeCommission" && item.turns > 0);
  if (hasFreeCommission) {
    return 0;
  }
  const buyCouponIndex = side === "buy"
    ? player.statusEffects.findIndex((item) => item.type === "stockBuyCoupon" && item.turns > 0)
    : -1;
  if (buyCouponIndex >= 0) {
    player.statusEffects.splice(buyCouponIndex, 1);
    return 0.5;
  }
  const sellCouponIndex = side === "sell"
    ? player.statusEffects.findIndex((item) => item.type === "stockSellCoupon" && item.turns > 0)
    : -1;
  if (sellCouponIndex >= 0) {
    player.statusEffects.splice(sellCouponIndex, 1);
    return 0;
  }
  const effect = player.statusEffects.find((item) => item.type === "stockFeeDiscount" && item.turns > 0);
  return effect ? Math.max(0, Math.min(1, effect.value ?? 0.5)) : 1;
}

function tradeFee(gameState: GameState, playerId: PlayerId, amount: number, side: "buy" | "sell"): number {
  return Math.max(
    0,
    Math.ceil(feeFor(amount, gameState.settings.stockTradeFeeRate) * stockFeeMultiplier(gameState, playerId, side))
  );
}

export function submitStockOrder(
  gameState: GameState,
  playerId: PlayerId,
  stockId: StockId,
  type: "buy" | "sell",
  shares: number
): { ok: boolean; error?: string; order?: StockOrder; account?: StockAccount } {
  const player = gameState.players.find((item) => item.id === playerId);
  const stock = gameState.stocks[stockId];
  const safeShares = Math.floor(shares);
  if (!player || player.bankrupt) {
    return { ok: false, error: "玩家不存在或已破产。" };
  }
  if (!stock) {
    return { ok: false, error: "股票不存在。" };
  }
  if (!isStockTradingDay(gameState.gameCalendar)) {
    return { ok: false, error: "今日休市，无法提交股票委托。" };
  }
  if (!Number.isFinite(safeShares) || safeShares <= 0 || safeShares > 999) {
    return { ok: false, error: "股票数量必须是 1 到 999 的正整数。" };
  }

  const price = stockPrice(stock);
  const amount = roundMoney(price * safeShares);
  const fee = feeFor(amount, gameState.settings.stockTradeFeeRate);
  let reservedCash = 0;

  if (type === "buy") {
    reservedCash = amount + fee;
    if (player.cash < reservedCash) {
      return { ok: false, error: "金币不足，无法覆盖买入委托预计金额。" };
    }
    player.cash -= reservedCash;
    player.stockAccount.cashFrozen = roundMoney((player.stockAccount.cashFrozen ?? 0) + reservedCash);
  } else {
    const holdingShares = player.stockAccount.holdings[stockId]?.shares ?? 0;
    const todayOrders = gameState.pendingStockOrders.filter(
      (order) => order.playerId === playerId && order.stockId === stockId && sameDate(order, gameState)
    );
    const projectedNetSell =
      todayOrders.filter((order) => order.type === "sell").reduce((sum, order) => sum + order.shares, 0)
      + safeShares
      - todayOrders.filter((order) => order.type === "buy").reduce((sum, order) => sum + order.shares, 0);
    if (projectedNetSell > holdingShares) {
      return { ok: false, error: "卖出委托超过当前持仓可覆盖数量。" };
    }
  }

  const order: StockOrder = {
    id: uid("order"),
    playerId,
    stockId,
    type,
    shares: safeShares,
    submittedAt: {
      year: gameState.gameCalendar.year,
      month: gameState.gameCalendar.month,
      day: gameState.gameCalendar.day
    },
    estimatedPrice: price,
    reservedCash
  };
  gameState.pendingStockOrders.push(order);
  player.stockAccount.pendingOrders = gameState.pendingStockOrders.filter((item) => item.playerId === playerId);
  player.stockAccount = calculateStockAccountSummary(player.stockAccount, gameState.stocks, currentStockDate(gameState));
  return { ok: true, order, account: player.stockAccount };
}

export function cancelStockOrder(
  gameState: GameState,
  playerId: PlayerId,
  orderId: string
): { ok: boolean; error?: string; orderId?: string; account?: StockAccount } {
  const player = gameState.players.find((item) => item.id === playerId);
  const orderIndex = gameState.pendingStockOrders.findIndex((order) => order.id === orderId && order.playerId === playerId);
  if (!player || player.bankrupt) {
    return { ok: false, error: "玩家不存在或已破产。" };
  }
  if (orderIndex < 0) {
    return { ok: false, error: "没有找到可取消的委托。" };
  }
  const [order] = gameState.pendingStockOrders.splice(orderIndex, 1);
  if (order?.type === "buy" && order.reservedCash) {
    player.cash += order.reservedCash;
    player.stockAccount.cashFrozen = Math.max(0, roundMoney((player.stockAccount.cashFrozen ?? 0) - order.reservedCash));
  }
  updatePlayerStockAccounts(gameState);
  return { ok: true, orderId, account: player.stockAccount };
}

export function aggregateDailyStockOrders(orders: StockOrder[]): Array<{
  playerId: PlayerId;
  stockId: StockId;
  netShares: number;
  buyShares: number;
  sellShares: number;
  reservedCash: number;
}> {
  const groups = new Map<string, { playerId: PlayerId; stockId: StockId; buyShares: number; sellShares: number; reservedCash: number }>();
  for (const order of orders) {
    const key = `${order.playerId}:${order.stockId}`;
    const current = groups.get(key) ?? {
      playerId: order.playerId,
      stockId: order.stockId,
      buyShares: 0,
      sellShares: 0,
      reservedCash: 0
    };
    if (order.type === "buy") {
      current.buyShares += order.shares;
      current.reservedCash += order.reservedCash ?? 0;
    } else {
      current.sellShares += order.shares;
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((item) => ({
    ...item,
    netShares: item.buyShares - item.sellShares,
    reservedCash: roundMoney(item.reservedCash)
  }));
}

export function settleDailyStockOrders(gameState: GameState): { ok: boolean; records: StockTradeRecord[]; message?: string } {
  if (!isStockTradingDay(gameState.gameCalendar)) {
    return { ok: true, records: [], message: "今日休市，股票委托不结算。" };
  }

  const todayOrders = gameState.pendingStockOrders.filter((order) => sameDate(order, gameState));
  const otherOrders = gameState.pendingStockOrders.filter((order) => !sameDate(order, gameState));
  const records: StockTradeRecord[] = [];

  for (const netOrder of aggregateDailyStockOrders(todayOrders)) {
    const player = gameState.players.find((item) => item.id === netOrder.playerId);
    const stock = gameState.stocks[netOrder.stockId];
    if (!player || player.bankrupt || !stock) {
      continue;
    }

    const price = stockPrice(stock);
    if (netOrder.netShares > 0) {
      const amount = roundMoney(price * netOrder.netShares);
      const fee = tradeFee(gameState, player.id, amount, "buy");
      const total = amount + fee;
      const refund = Math.max(0, roundMoney(netOrder.reservedCash - total));
      player.cash += refund;
      player.stockAccount.cashFrozen = Math.max(0, roundMoney((player.stockAccount.cashFrozen ?? 0) - netOrder.reservedCash));

      const holding = player.stockAccount.holdings[netOrder.stockId];
      const previousLots = normalizeHoldingLots(holding, netOrder.stockId);
      const nextLots = [
        ...previousLots,
        makeStockLot(
          netOrder.stockId,
          netOrder.netShares,
          amount + fee,
          currentStockDate(gameState),
          "net_buy"
        )
      ];
      const nextHolding = buildHoldingFromLots(netOrder.stockId, nextLots, price, holding);
      player.stockAccount.holdings[netOrder.stockId] = nextHolding;
      const nextShares = nextHolding.shares;
      player.stocks[netOrder.stockId] = nextShares;
      const record: StockTradeRecord = {
        id: uid("trade"),
        playerId: player.id,
        nickname: player.nickname,
        year: gameState.gameCalendar.year,
        month: gameState.gameCalendar.month,
        day: gameState.gameCalendar.day,
        stockId: netOrder.stockId,
        type: "net_buy",
        shares: netOrder.netShares,
        price,
        amount,
        fee
      };
      records.push(record);
      player.stockAccount.tradeHistory.push(record);
    } else {
      if (netOrder.reservedCash > 0) {
        player.cash += netOrder.reservedCash;
        player.stockAccount.cashFrozen = Math.max(0, roundMoney((player.stockAccount.cashFrozen ?? 0) - netOrder.reservedCash));
      }
      const sellShares = Math.abs(netOrder.netShares);
      if (sellShares > 0) {
        const holding = player.stockAccount.holdings[netOrder.stockId];
        if (!holding || holding.shares < sellShares) {
          continue;
        }
        const amount = roundMoney(price * sellShares);
        const fee = tradeFee(gameState, player.id, amount, "sell");
        const income = amount - fee;
        player.cash += income;
        const sale = reduceLotsForSale(holding, netOrder.stockId, sellShares);
        const soldCost = sale.soldCost;
        const realizedProfit = roundMoney(income - soldCost);
        player.stockAccount.realizedProfit = roundMoney(player.stockAccount.realizedProfit + realizedProfit);
        const remainingShares = holding.shares - sellShares;
        if (remainingShares <= 0) {
          delete player.stockAccount.holdings[netOrder.stockId];
          delete player.stocks[netOrder.stockId];
        } else {
          player.stockAccount.holdings[netOrder.stockId] = buildHoldingFromLots(netOrder.stockId, sale.lots, price, holding);
          player.stocks[netOrder.stockId] = remainingShares;
        }
        const record: StockTradeRecord = {
          id: uid("trade"),
          playerId: player.id,
          nickname: player.nickname,
          year: gameState.gameCalendar.year,
          month: gameState.gameCalendar.month,
          day: gameState.gameCalendar.day,
          stockId: netOrder.stockId,
          type: "net_sell",
          shares: sellShares,
          price,
          amount,
          fee,
          realizedProfit
        };
        records.push(record);
        player.stockAccount.tradeHistory.push(record);
      }
    }
  }

  // One pass covers every net order in this close, then expires before the next trading day.
  for (const player of gameState.players) {
    player.statusEffects = player.statusEffects.filter((effect) => effect.type !== "stockFreeCommission");
  }
  gameState.pendingStockOrders = otherOrders;
  updatePlayerStockAccounts(gameState);
  return { ok: true, records };
}

function signalBias(gameState: GameState, stock: Stock): {
  bias: number;
  volatility: number;
  forcedDirection: "bullish" | "bearish" | null;
  forcedMinChange: number;
} {
  let bias = 0;
  let volatility = 0;
  let forcedDirection: "bullish" | "bearish" | null = null;
  let forcedMinChange = 0;
  let forcedScore = 0;
  for (const signal of gameState.marketSignals) {
    if (signal.used || !sameCalendarDate(signal.targetDate, gameState.gameCalendar)) {
      continue;
    }
    if (signal.stockId && signal.stockId !== stock.id) {
      continue;
    }
    if (signal.sector && signal.sector !== stock.sector) {
      continue;
    }
    const accurate = Math.random() <= signal.accuracy;
    const direction = accurate ? signal.direction : signal.direction === "bullish" ? "bearish" : signal.direction === "bearish" ? "bullish" : signal.direction;
    if (direction === "bullish") {
      bias += signal.strength;
      if (signal.accuracy >= 1) {
        forcedDirection = "bullish";
        forcedScore += signal.strength;
        forcedMinChange = Math.max(forcedMinChange, Math.max(0.018, signal.strength));
      }
    } else if (direction === "bearish") {
      bias -= signal.strength;
      if (signal.accuracy >= 1) {
        forcedDirection = "bearish";
        forcedScore -= signal.strength;
        forcedMinChange = Math.max(forcedMinChange, Math.max(0.018, signal.strength));
      }
    } else if (direction === "volatile") {
      volatility += signal.strength;
    } else if (direction === "stable") {
      volatility -= signal.strength;
    }
  }
  for (const event of gameState.marketEvents) {
    if (event.daysRemaining <= 0) {
      continue;
    }
    if (event.stockId && event.stockId !== stock.id) {
      continue;
    }
    if (event.sector && event.sector !== stock.sector) {
      continue;
    }
    if (event.direction === "bullish") {
      bias += event.strength;
    } else if (event.direction === "bearish") {
      bias -= event.strength;
    } else if (event.direction === "volatile") {
      volatility += event.strength;
    } else if (event.direction === "stable") {
      volatility -= event.strength;
    }
  }
  if (forcedScore > 0) {
    forcedDirection = "bullish";
  } else if (forcedScore < 0) {
    forcedDirection = "bearish";
  } else if (forcedScore === 0) {
    forcedDirection = null;
  }
  if (forcedScore !== 0) {
    forcedMinChange = Math.max(forcedMinChange, Math.min(0.12, Math.abs(forcedScore)));
  }
  return { bias, volatility, forcedDirection, forcedMinChange };
}

export function grantStockShares(gameState: GameState, player: PlayerState, stockId: StockId, shares: number): void {
  const stock = gameState.stocks[stockId];
  if (!stock || shares <= 0) {
    return;
  }
  const account = player.stockAccount;
  const holding = account.holdings[stockId];
  const price = stockPrice(stock);
  const grantCost = price * shares;
  const nextLots = [
    ...normalizeHoldingLots(holding, stockId),
    makeStockLot(stockId, shares, grantCost, currentStockDate(gameState), "grant")
  ];
  const nextHolding = buildHoldingFromLots(stockId, nextLots, price, holding);
  account.holdings[stockId] = nextHolding;
  player.stockAccount = calculateStockAccountSummary(account, gameState.stocks, currentStockDate(gameState));
  player.stocks[stockId] = nextHolding.shares;
}

export function buyStock(gameState: GameState, playerId: PlayerId, stockId: StockId, shares: number): StockTradeResult {
  const player = gameState.players.find((item) => item.id === playerId);
  const stock = gameState.stocks[stockId];
  const safeShares = Math.floor(shares);
  if (!player || player.bankrupt) {
    return { ok: false, error: "Player not found." };
  }
  if (!stock) {
    return { ok: false, error: "Stock not found." };
  }
  if (!Number.isFinite(safeShares) || safeShares <= 0 || safeShares > 999) {
    return { ok: false, error: "Stock shares must be between 1 and 999." };
  }

  const price = stockPrice(stock);
  const amount = roundMoney(price * safeShares);
  const fee = feeFor(amount, gameState.settings.stockTradeFeeRate);
  const total = amount + fee;
  if (player.cash < total) {
    return { ok: false, error: "Not enough cash to buy those shares." };
  }

  player.cash -= total;
  const account = player.stockAccount;
  const holding = account.holdings[stockId];
  const nextLots = [
    ...normalizeHoldingLots(holding, stockId),
    makeStockLot(
      stockId,
      safeShares,
      amount + fee,
      currentStockDate(gameState),
      "buy"
    )
  ];
  const nextHolding = buildHoldingFromLots(stockId, nextLots, price, holding);
  account.holdings[stockId] = nextHolding;

  const record: StockTradeRecord = {
    id: uid("trade"),
    playerId: player.id,
    nickname: player.nickname,
    year: gameState.gameCalendar.year,
    month: gameState.gameCalendar.month,
    day: gameState.gameCalendar.day,
    stockId,
    type: "buy",
    shares: safeShares,
    price,
    amount,
    fee
  };
  account.tradeHistory.push(record);
  player.stockAccount = calculateStockAccountSummary(account, gameState.stocks, currentStockDate(gameState));
  player.stocks[stockId] = nextHolding.shares;
  return { ok: true, record, account: player.stockAccount };
}

export function sellStock(gameState: GameState, playerId: PlayerId, stockId: StockId, shares: number): StockTradeResult {
  const player = gameState.players.find((item) => item.id === playerId);
  const stock = gameState.stocks[stockId];
  const safeShares = Math.floor(shares);
  if (!player || player.bankrupt) {
    return { ok: false, error: "Player not found." };
  }
  if (!stock) {
    return { ok: false, error: "Stock not found." };
  }
  if (!Number.isFinite(safeShares) || safeShares <= 0) {
    return { ok: false, error: "Stock shares must be positive." };
  }
  const account = player.stockAccount;
  const holding = account.holdings[stockId];
  if (!holding || holding.shares < safeShares) {
    return { ok: false, error: "Cannot sell more shares than you hold." };
  }

  const price = stockPrice(stock);
  const amount = roundMoney(price * safeShares);
  const fee = feeFor(amount, gameState.settings.stockTradeFeeRate);
  const income = amount - fee;
  player.cash += income;

  const sale = reduceLotsForSale(holding, stockId, safeShares);
  const soldCost = sale.soldCost;
  account.realizedProfit = roundMoney(account.realizedProfit + income - soldCost);
  const remainingShares = holding.shares - safeShares;
  if (remainingShares <= 0) {
    delete account.holdings[stockId];
    delete player.stocks[stockId];
  } else {
    account.holdings[stockId] = buildHoldingFromLots(stockId, sale.lots, price, holding);
    player.stocks[stockId] = remainingShares;
  }

  const record: StockTradeRecord = {
    id: uid("trade"),
    playerId: player.id,
    nickname: player.nickname,
    year: gameState.gameCalendar.year,
    month: gameState.gameCalendar.month,
    day: gameState.gameCalendar.day,
    stockId,
    type: "sell",
    shares: safeShares,
    price,
    amount,
    fee,
    realizedProfit: roundMoney(income - soldCost)
  };
  account.tradeHistory.push(record);
  player.stockAccount = calculateStockAccountSummary(account, gameState.stocks, currentStockDate(gameState));
  return { ok: true, record, account: player.stockAccount };
}

export function updateStockMarketDaily(gameState: GameState): void {
  if (!isStockTradingDay(gameState.gameCalendar)) {
    return;
  }
  const theme = getCurrentMonthMarketTheme(gameState.gameCalendar);
  for (const stock of Object.values(gameState.stocks)) {
    const signal = signalBias(gameState, stock);
    const sectorBias = theme.sectorBias[stock.sector] ?? 0;
    const extraVolatility = theme.volatilityBoost?.[stock.sector] ?? 0;
    const volatility = Math.max(0.005, stock.volatility + extraVolatility + signal.volatility);
    const randomSwing = (Math.random() * 2 - 1) * volatility;
    const eventSwing = stock.trendBias + sectorBias + signal.bias;
    let boundedSwing = Math.max(-0.2, Math.min(0.3, randomSwing + eventSwing));
    if (signal.forcedDirection === "bullish") {
      boundedSwing = Math.max(signal.forcedMinChange, Math.abs(boundedSwing));
    } else if (signal.forcedDirection === "bearish") {
      boundedSwing = Math.min(-signal.forcedMinChange, -Math.abs(boundedSwing));
    }
    const previousPrice = stock.currentPrice;
    const nextPrice = Math.max(5, roundMoney(previousPrice * (1 + boundedSwing)));

    stock.previousPrice = previousPrice;
    stock.currentPrice = nextPrice;
    stock.price = nextPrice;
    stock.change = roundMoney(nextPrice - previousPrice);
    stock.trend = stock.change;
    stock.changeRate = previousPrice > 0 ? roundMoney((stock.change / previousPrice) * 100) : 0;
    stock.history.push({
      year: gameState.gameCalendar.year,
      month: gameState.gameCalendar.month,
      day: gameState.gameCalendar.day,
      price: nextPrice
    });
    stock.history = stock.history.slice(-90);
  }
  for (const player of gameState.players) {
    const stopLossIndex = player.statusEffects.findIndex((effect) => {
      if (effect.type !== "stockStopLoss" || effect.turns <= 0 || !effect.stockId) {
        return false;
      }
      const stock = gameState.stocks[effect.stockId];
      return Boolean(stock && stock.changeRate <= -8 && (player.stockAccount.holdings[effect.stockId]?.shares ?? 0) > 0);
    });
    if (stopLossIndex >= 0) {
      const effect = player.statusEffects[stopLossIndex];
      const stock = effect?.stockId ? gameState.stocks[effect.stockId] : undefined;
      const holding = effect?.stockId ? player.stockAccount.holdings[effect.stockId] : undefined;
      if (stock && holding) {
        const compensation = roundMoney(Math.abs(stock.change) * holding.shares * 0.5);
        player.cash += compensation;
        appendGameLog(
          gameState,
          `${player.nickname} 的股票止损生效：${stock.name} 大跌，获得 ${compensation} 金币补偿。`
        );
      }
      player.statusEffects.splice(stopLossIndex, 1);
    }
  }
  for (const signal of gameState.marketSignals) {
    if (!signal.used && sameCalendarDate(signal.targetDate, gameState.gameCalendar)) {
      signal.used = true;
    }
  }
  gameState.marketSignals = gameState.marketSignals.filter((signal) => !signal.used);
  gameState.marketEvents = gameState.marketEvents
    .map((event) => ({ ...event, daysRemaining: event.daysRemaining - 1 }))
    .filter((event) => event.daysRemaining > 0);
  updatePlayerStockAccounts(gameState);
}
