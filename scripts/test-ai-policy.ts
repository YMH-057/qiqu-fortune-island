import assert from "node:assert/strict";
import { getTileGraphDistance, type AiDifficulty } from "@monopoly/shared";
import { makeSkillCard, skillCardTemplates } from "../server/src/data/skillCards";
import { getAiTurnCommand } from "../server/src/game/ai";
import { getAiPolicy } from "../server/src/game/aiPolicy";
import { createDirectedStockSignal } from "../server/src/game/stockTileEffects";
import { makeTestGame } from "./test-fixtures";

function makeAiGame(difficulty: AiDifficulty) {
  const game = makeTestGame();
  const bot = game.players.find((player) => player.id === "P2");
  assert.ok(bot);
  bot.isBot = true;
  game.settings.aiDifficulty = difficulty;
  game.turnOrder = [bot.id, "P1"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";
  game.pendingAction = null;
  return { game, bot };
}

function testPolicyProfilesAreOrderedByRisk() {
  const conservative = getAiPolicy("conservative");
  const balanced = getAiPolicy("balanced");
  const aggressive = getAiPolicy("aggressive");

  assert.ok(conservative.cashReserveAfterBuy > balanced.cashReserveAfterBuy);
  assert.ok(balanced.cashReserveAfterBuy > aggressive.cashReserveAfterBuy);
  assert.ok(conservative.stockBudgetRate < balanced.stockBudgetRate);
  assert.ok(balanced.stockBudgetRate < aggressive.stockBudgetRate);
  assert.equal(conservative.useAttackSkills, false);
  assert.equal(aggressive.useAttackSkills, true);
  assert.deepEqual(getAiPolicy(undefined), balanced);
  assert.deepEqual(getAiPolicy("unknown" as AiDifficulty), balanced);
}

function testDifficultyChangesPropertyPurchaseDecision() {
  const conservative = makeAiGame("conservative");
  const aggressive = makeAiGame("aggressive");
  const tile = conservative.game.tiles.find((item) => item.type === "property" && (item.price ?? 0) > 0);
  assert.ok(tile);

  for (const sample of [conservative, aggressive]) {
    sample.game.phase = "tileAction";
    sample.game.pendingAction = { kind: "buyProperty", tileId: tile.id };
    sample.bot.cash = (tile.price ?? 0) + 3000;
  }

  assert.equal(getAiTurnCommand(conservative.game).kind, "endTurn");
  assert.equal(getAiTurnCommand(aggressive.game).kind, "buyProperty");
}

function testConservativeAiDoesNotInitiateAttackSkills() {
  const conservative = makeAiGame("conservative");
  const aggressive = makeAiGame("aggressive");
  const freezeTemplate = skillCardTemplates.find((card) => card.code === "freeze");
  assert.ok(freezeTemplate);

  for (const [index, sample] of [conservative, aggressive].entries()) {
    const rival = sample.game.players.find((player) => player.id === "P1");
    assert.ok(rival);
    rival.currentTileId = sample.bot.currentTileId;
    rival.position = sample.bot.position;
    sample.bot.skillCards = [makeSkillCard(freezeTemplate, `difficulty-freeze-${index}`)];
  }

  assert.equal(getAiTurnCommand(conservative.game).kind, "rollDice");
  assert.equal(getAiTurnCommand(aggressive.game).kind, "useSkillCard");
}

function testConservativeAiDoesNotAttackRivalProperty() {
  const conservative = makeAiGame("conservative");
  const aggressive = makeAiGame("aggressive");
  const demolitionTemplate = skillCardTemplates.find((card) => card.code === "demolishCard");
  assert.ok(demolitionTemplate);

  for (const [index, sample] of [conservative, aggressive].entries()) {
    const rival = sample.game.players.find((player) => player.id === "P1");
    const target = sample.game.tiles.find((tile) =>
      tile.type === "property"
      && getTileGraphDistance(sample.game.tiles, sample.bot.currentTileId, tile.id) <= (demolitionTemplate.range ?? 8)
    );
    assert.ok(rival);
    assert.ok(target);
    rival.properties = [target.id];
    Object.assign(sample.game.properties[target.id]!, { ownerId: rival.id, level: 2, isMortgaged: false });
    sample.bot.skillCards = [makeSkillCard(demolitionTemplate, `difficulty-demolition-${index}`)];
  }

  assert.equal(getAiTurnCommand(conservative.game).kind, "rollDice");
  assert.equal(getAiTurnCommand(aggressive.game).kind, "useSkillCard");
}

function testAggressiveAiUsesLargerExactSignalPosition() {
  const conservative = makeAiGame("conservative");
  const aggressive = makeAiGame("aggressive");
  const stockId = Object.keys(conservative.game.stocks)[0] as keyof typeof conservative.game.stocks;

  for (const sample of [conservative, aggressive]) {
    sample.bot.cash = 30000;
    sample.game.marketSignals.push(createDirectedStockSignal(sample.game, stockId, "bullish", sample.bot.id));
  }

  const conservativeCommand = getAiTurnCommand(conservative.game);
  const aggressiveCommand = getAiTurnCommand(aggressive.game);
  assert.equal(conservativeCommand.kind, "submitStockOrder");
  assert.equal(aggressiveCommand.kind, "submitStockOrder");
  if (conservativeCommand.kind !== "submitStockOrder" || aggressiveCommand.kind !== "submitStockOrder") {
    throw new Error("expected stock order commands");
  }
  assert.ok(aggressiveCommand.shares > conservativeCommand.shares);
}

testPolicyProfilesAreOrderedByRisk();
testDifficultyChangesPropertyPurchaseDecision();
testConservativeAiDoesNotInitiateAttackSkills();
testConservativeAiDoesNotAttackRivalProperty();
testAggressiveAiUsesLargerExactSignalPosition();

console.log("AI policy tests passed.");
