import assert from "node:assert/strict";
import { submitStockOrderAction } from "../server/src/game/actions";
import { projectGameForPlayer } from "../server/src/game/playerView";
import { createDirectedStockSignal } from "../server/src/game/stockTileEffects";
import {
  grantStockShares,
  settleDailyStockOrders,
  updatePlayerStockAccounts,
  updateStockMarketDaily
} from "../server/src/game/stocks";
import { advanceGameDay } from "../server/src/game/calendar";
import { makeTestGame } from "./test-fixtures";

function testEndedGameRejectsNewStockOrder() {
  const game = makeTestGame();
  const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
  assert.ok(stockId);

  const control = makeTestGame();
  assert.equal(submitStockOrderAction(control, "P1", stockId, "buy", 1).ok, true);
  game.status = "ended";

  const result = submitStockOrderAction(game, "P1", stockId, "buy", 1);

  assert.equal(result.ok, false);
  assert.equal(game.pendingStockOrders.length, 0);
}

function testStopLossCompensationIsWrittenToThePublicLog() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
  const stock = game.stocks[stockId];
  assert.ok(player);
  assert.ok(stock);
  grantStockShares(game, player, stockId, 10);
  player.statusEffects.push({ id: "stop-loss-test", type: "stockStopLoss", turns: 5, stockId });
  stock.volatility = 0;
  stock.trendBias = -0.2;

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    updateStockMarketDaily(game);
  } finally {
    Math.random = originalRandom;
  }

  assert.ok(game.logs.some((entry) => entry.message.includes("止损")));
  assert.equal(player.statusEffects.some((effect) => effect.type === "stockStopLoss"), false);
}

function testPlayerViewHidesOtherPlayersPendingOrders() {
  const game = makeTestGame();
  const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
  assert.equal(submitStockOrderAction(game, "P1", stockId, "buy", 1).ok, true);
  assert.equal(submitStockOrderAction(game, "P2", stockId, "buy", 1).ok, true);

  const view = projectGameForPlayer(game, "P1");
  const ownView = view.players.find((player) => player.id === "P1");
  const rivalView = view.players.find((player) => player.id === "P2");

  assert.deepEqual(view.pendingStockOrders.map((order) => order.playerId), ["P1"]);
  assert.deepEqual(ownView?.stockAccount.pendingOrders.map((order) => order.playerId), ["P1"]);
  assert.deepEqual(rivalView?.stockAccount.pendingOrders, []);
  assert.equal(game.pendingStockOrders.length, 2, "projection must not mutate the authoritative state");
}

function testGuaranteedSignalsNeverContradictForSameStockAndDate() {
  const game = makeTestGame();
  const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
  const first = createDirectedStockSignal(game, stockId, "bullish", "P1");
  game.marketSignals.push(first);

  const second = createDirectedStockSignal(game, stockId, "bearish", "P2");

  assert.equal(first.accuracy, 1);
  assert.equal(second.accuracy, 1);
  assert.equal(second.direction, first.direction);
  assert.match(second.message, /上涨/);
}

function testFreeCommissionCoversEverySettlementOnTheTradingDay() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  const stockIds = Object.keys(game.stocks).slice(0, 2) as Array<keyof typeof game.stocks>;
  assert.ok(player);
  assert.equal(stockIds.length, 2);
  player.cash = 100000;
  player.statusEffects.push({
    id: "free-commission-test",
    type: "stockFreeCommission",
    turns: 1
  });

  for (const stockId of stockIds) {
    assert.equal(submitStockOrderAction(game, player.id, stockId, "buy", 1).ok, true);
  }
  const settlement = settleDailyStockOrders(game);

  assert.equal(settlement.records.length, 2);
  assert.deepEqual(settlement.records.map((record) => record.fee), [0, 0]);
  assert.equal(player.statusEffects.some((effect) => effect.type === "stockFreeCommission"), false);
}

function testGuaranteedSignalControlsTheTargetTradingDayDirection() {
  for (const direction of ["bullish", "bearish"] as const) {
    const game = makeTestGame();
    const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
    const stock = game.stocks[stockId];
    assert.ok(stock);
    const signal = createDirectedStockSignal(game, stockId, direction, "P1");
    game.marketSignals.push(signal);
    game.gameCalendar = advanceGameDay(game.gameCalendar);
    stock.volatility = 0.2;
    stock.trendBias = direction === "bullish" ? -0.2 : 0.2;

    const originalRandom = Math.random;
    Math.random = () => (direction === "bullish" ? 0 : 1);
    try {
      updateStockMarketDaily(game);
    } finally {
      Math.random = originalRandom;
    }

    assert.ok(direction === "bullish" ? stock.changeRate > 0 : stock.changeRate < 0);
    assert.equal(game.marketSignals.length, 0, "a target-day guaranteed signal should be consumed");
  }
}

function testNewlyBoughtSharesHaveNoSameDayProfitOrLoss() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  const stockId = Object.keys(game.stocks)[0] as keyof typeof game.stocks;
  const stock = game.stocks[stockId];
  assert.ok(player);
  assert.ok(stock);
  player.cash = 100000;
  assert.equal(submitStockOrderAction(game, player.id, stockId, "buy", 10).ok, true);
  assert.equal(settleDailyStockOrders(game).records.length, 1);
  stock.volatility = 0;
  stock.trendBias = 0.2;

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    updateStockMarketDaily(game);
  } finally {
    Math.random = originalRandom;
  }

  const sameDayHolding = player.stockAccount.holdings[stockId];
  assert.ok(sameDayHolding);
  assert.equal(sameDayHolding.unrealizedProfit, 0);
  assert.equal(sameDayHolding.marketValue, sameDayHolding.totalCost);

  game.gameCalendar = advanceGameDay(game.gameCalendar);
  updatePlayerStockAccounts(game);
  assert.notEqual(player.stockAccount.holdings[stockId]?.unrealizedProfit, 0);
}

function testWeekendDoesNotChangePricesOrHistory() {
  const game = makeTestGame();
  game.gameCalendar.weekday = 6;
  const before = Object.values(game.stocks).map((stock) => ({
    id: stock.id,
    price: stock.currentPrice,
    historyLength: stock.history.length
  }));

  updateStockMarketDaily(game);

  assert.deepEqual(
    Object.values(game.stocks).map((stock) => ({ id: stock.id, price: stock.currentPrice, historyLength: stock.history.length })),
    before
  );
}

testEndedGameRejectsNewStockOrder();
testPlayerViewHidesOtherPlayersPendingOrders();
testGuaranteedSignalsNeverContradictForSameStockAndDate();
testFreeCommissionCoversEverySettlementOnTheTradingDay();
testGuaranteedSignalControlsTheTargetTradingDayDirection();
testNewlyBoughtSharesHaveNoSameDayProfitOrLoss();
testWeekendDoesNotChangePricesOrHistory();
testStopLossCompensationIsWrittenToThePublicLog();

console.log("Stock rule tests passed.");
