import assert from "node:assert/strict";
import { createGameState } from "../server/src/game/createGameState";
import { getAiTurnCommand, isAiControlledPlayer, runAiTurnStep } from "../server/src/game/ai";
import { skillCardTemplates } from "../server/src/data/skillCards";
import { START_TILE_OPTIONS, type GameSettings, type RoomPlayer } from "@monopoly/shared";

const baseSettings: GameSettings = {
  endCondition: "rounds",
  maxRounds: 25,
  allowVoluntaryBankruptcy: true,
  durationMode: "short_3_months",
  initialMoney: 10000,
  initialTickets: 3,
  initialSkillCardLimit: 5,
  lapRewardMoney: 1500,
  lapRewardTickets: 1,
  bankVisitMoney: 400,
  bankVisitTickets: 1,
  stockTradeFeeRate: 0.01,
  depositMonthlyRate: 0.1,
  loanMonthlyRate: 0.1,
  creditLimit: 20000,
  forcedRepaymentRate: 0.2,
  moneyToTicketCost: 1000,
  ticketToMoneyValue: 600,
  bankInitialMoney: 0,
  bankInitialTickets: 0,
  jailTurns: 3,
  hospitalTurns: 3,
  bailCost: 2000,
  treatmentCost: 2000,
  rentMultipliers: [1, 2.3, 5, 10],
  enableSpecialCards: true,
  enableRandomAnnouncements: true,
  lotteryMaxTickets: 3,
  skillShopOfferCount: 8,
  allowFreeSkillCards: false,
  startTileId: "tile-00",
  useSharedStartTile: false,
  lapRewardMode: "go",
  turnDurationSeconds: 60
};

function makeRoomPlayer(id: string, isBot: boolean): RoomPlayer {
  return {
    id,
    nickname: isBot ? "AI 豆豆" : "真人玩家",
    color: isBot ? "#f59e0b" : "#3b82f6",
    avatar: isBot ? "AI" : "Player",
    selectedAvatarId: isBot ? "leo-captain" : "aries-dash",
    selectedStartTileId: isBot ? "tile-05" : "tile-00",
    ready: true,
    connected: true,
    isHost: !isBot,
    isBot
  };
}

function testBotFlagDetection() {
  assert.equal(isAiControlledPlayer({ isBot: true, bankrupt: false }), true);
  assert.equal(isAiControlledPlayer({ isBot: false, bankrupt: false }), false);
  assert.equal(isAiControlledPlayer({ isBot: true, bankrupt: true }), false);
}

function testWaitingRollCommand() {
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
  game.turnOrder = ["AI-001", "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";
  const command = getAiTurnCommand(game);
  assert.deepEqual(command, { kind: "rollDice", playerId: "AI-001" });
}

function testBuyPropertyCommandKeepsReserve() {
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
  const bot = game.players.find((player) => player.id === "AI-001");
  assert.ok(bot);
  const propertyTile = game.tiles.find((tile) => tile.type === "property" && (tile.price ?? 0) > 0);
  assert.ok(propertyTile);
  game.turnOrder = ["AI-001", "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "tileAction";
  game.pendingAction = { kind: "buyProperty", tileId: propertyTile.id };
  bot.cash = (propertyTile.price ?? 0) + 3000;
  assert.deepEqual(getAiTurnCommand(game), { kind: "buyProperty", playerId: "AI-001", tileId: propertyTile.id });

  bot.cash = propertyTile.price ?? 0;
  assert.deepEqual(getAiTurnCommand(game), { kind: "endTurn", playerId: "AI-001" });
}

function testAiMortgagesPropertyWhenCreditIsExhausted() {
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
  const bot = game.players.find((player) => player.id === "AI-001");
  const propertyTile = game.tiles.find((tile) => tile.type === "property" && (tile.price ?? 0) > 0);
  assert.ok(bot);
  assert.ok(propertyTile);
  game.turnOrder = [bot.id, "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "tileAction";
  game.pendingAction = { kind: "stockMarket", tileId: propertyTile.id };
  bot.cash = -500;
  bot.bankAccount.debtPrincipal = bot.bankAccount.creditLimit;
  bot.properties = [propertyTile.id];
  game.properties[propertyTile.id] = { tileId: propertyTile.id, ownerId: bot.id, level: 0 };

  assert.deepEqual(getAiTurnCommand(game), {
    kind: "mortgageProperty",
    playerId: bot.id,
    tileId: propertyTile.id
  });
  const step = runAiTurnStep(game);
  assert.equal(step.outcome?.ok, true);
  assert.equal(game.properties[propertyTile.id]?.isMortgaged, true);
  assert.ok(bot.cash > -500);
}

function testExpiredAiInsolvencyCannotStallWhenVoluntaryBankruptcyIsDisabled() {
  const settings = { ...baseSettings, allowVoluntaryBankruptcy: false };
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], settings);
  const bot = game.players.find((player) => player.id === "AI-001");
  assert.ok(bot);
  game.turnOrder = [bot.id, "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "tileAction";
  game.pendingAction = { kind: "bank", playerId: bot.id, tileId: bot.currentTileId };
  bot.cash = -500;
  bot.bankAccount.debtPrincipal = bot.bankAccount.creditLimit;
  bot.properties = [];
  bot.insolventUntil = Date.now() - 1;

  const step = runAiTurnStep(game);
  assert.equal(step.outcome?.ok, true);
  assert.equal(bot.bankrupt, true);
  assert.ok(game.status === "ended" || game.turnOrder[game.currentTurnIndex] !== bot.id);
}

function testAiWaitsForActiveInsolvencyGraceBeforeBankruptcy() {
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
  const bot = game.players.find((player) => player.id === "AI-001");
  assert.ok(bot);
  game.turnOrder = [bot.id, "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "tileAction";
  game.pendingAction = { kind: "bank", playerId: bot.id, tileId: bot.currentTileId };
  bot.cash = -500;
  bot.bankAccount.debtPrincipal = bot.bankAccount.creditLimit;
  bot.properties = [];
  bot.insolventUntil = Date.now() + 60_000;

  assert.equal(getAiTurnCommand(game).kind, "none");
  const waitingStep = runAiTurnStep(game);
  assert.equal(waitingStep.outcome, undefined);
  assert.equal(bot.bankrupt, false);

  bot.insolventUntil = Date.now() - 1;
  const expiredStep = runAiTurnStep(game);
  assert.equal(expiredStep.outcome?.ok, true);
  assert.equal(bot.bankrupt, true);
}

function testAiDecisionCoverageForPendingActions() {
  const makeGame = () => {
    const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
    game.turnOrder = ["AI-001", "P-HUMAN"];
    game.currentTurnIndex = 0;
    game.phase = "tileAction";
    return game;
  };

  const pathGame = makeGame();
  pathGame.pendingAction = {
    kind: "choosePath",
    playerId: "AI-001",
    fromTileId: "tile-00",
    options: [{ tileId: "tile-01", label: "沿内圈" }],
    remainingSteps: 1
  };
  assert.equal(getAiTurnCommand(pathGame).kind, "choosePath");

  const portalGame = makeGame();
  portalGame.pendingAction = {
    kind: "portalChoice",
    playerId: "AI-001",
    tileId: "tile-48",
    options: [{ targetTileId: "tile-61", label: "传送门 B", costTickets: 0 }],
    canCancel: true
  };
  assert.equal(getAiTurnCommand(portalGame).kind, "choosePortal");

  const shopGame = makeGame();
  const offer = skillCardTemplates.find((card) => card.costTickets <= 2);
  assert.ok(offer);
  shopGame.pendingAction = {
    kind: "skillShop",
    playerId: "AI-001",
    tileId: "tile-11",
    offers: [{ ...offer, id: "skill-test" }]
  };
  assert.equal(getAiTurnCommand(shopGame).kind, "buySkillCard");

  const lotteryGame = makeGame();
  lotteryGame.pendingAction = {
    kind: "lottery",
    playerId: "AI-001",
    tileId: "tile-20",
    maxTickets: 3,
    ticketPrice: 300
  };
  assert.equal(getAiTurnCommand(lotteryGame).kind, "skipLottery");

  for (const pendingAction of [
    { kind: "bank" as const, playerId: "AI-001", tileId: "tile-07" },
    { kind: "stockMarket" as const, tileId: "tile-02" }
  ]) {
    const game = makeGame();
    game.pendingAction = pendingAction;
    assert.equal(getAiTurnCommand(game).kind, "endTurn");
  }
}

function testInvalidAiPathCannotStallTurn() {
  const game = createGameState("ROOMAI", [makeRoomPlayer("P-HUMAN", false), makeRoomPlayer("AI-001", true)], baseSettings);
  game.turnOrder = ["AI-001", "P-HUMAN"];
  game.currentTurnIndex = 0;
  game.phase = "tileAction";
  game.pendingAction = {
    kind: "choosePath",
    playerId: "AI-001",
    fromTileId: "tile-00",
    options: [],
    remainingSteps: 1
  };

  const step = runAiTurnStep(game);
  assert.equal(step.outcome?.ok, true);
  assert.notEqual(game.turnOrder[game.currentTurnIndex], "AI-001");
}

function testEightAiPlayersCompleteTwoTurnCycles() {
  const players = Array.from({ length: 8 }, (_, index) => ({
    ...makeRoomPlayer(`AI-${index + 1}`, true),
    nickname: `AI ${index + 1}`,
    selectedStartTileId: START_TILE_OPTIONS[index]?.tileId ?? "tile-00"
  }));
  const game = createGameState("ROOMAI8", players, { ...baseSettings, initialMoney: 100000 });
  game.turnOrder = players.map((player) => player.id);
  game.currentTurnIndex = 0;

  const targetCompletedTurns = 16;
  let steps = 0;
  while (game.status === "playing" && game.completedTurns < targetCompletedTurns && steps < 500) {
    const step = runAiTurnStep(game);
    assert.ok(step.outcome, `AI 步骤 ${steps + 1} 必须产生服务端结果，命令：${step.command.kind}`);
    assert.equal(step.outcome.ok, true, `AI 步骤 ${steps + 1} 执行失败，命令：${step.command.kind}`);
    steps += 1;
  }

  assert.ok(game.status === "ended" || game.completedTurns >= targetCompletedTurns);
  assert.ok(steps < 500, "8 个 AI 不应在单个状态无限循环");
}

testBotFlagDetection();
testWaitingRollCommand();
testBuyPropertyCommandKeepsReserve();
testAiMortgagesPropertyWhenCreditIsExhausted();
testExpiredAiInsolvencyCannotStallWhenVoluntaryBankruptcyIsDisabled();
testAiWaitsForActiveInsolvencyGraceBeforeBankruptcy();
testAiDecisionCoverageForPendingActions();
testInvalidAiPathCannotStallTurn();
testEightAiPlayersCompleteTwoTurnCycles();

console.log("AI decision tests passed.");
