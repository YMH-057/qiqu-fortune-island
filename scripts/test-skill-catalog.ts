import assert from "node:assert/strict";
import { getTileGraphDistance, type SkillCard, type StockId, type Tile } from "@monopoly/shared";
import { makeSkillCard, skillCardTemplates } from "../server/src/data/skillCards";
import { useSkillCard } from "../server/src/game/actions";
import { makeTestGame } from "./test-fixtures";

const rivalPropertyCodes = new Set([
  "temporaryRentCut",
  "mortgageFreeze",
  "rentLimitOrder",
  "demolishCard",
  "devilCard"
]);

function nearestProperties(game: ReturnType<typeof makeTestGame>, originTileId: string): Tile[] {
  return game.tiles
    .filter((tile) => tile.type === "property")
    .sort(
      (left, right) =>
        getTileGraphDistance(game.tiles, originTileId, left.id) -
        getTileGraphDistance(game.tiles, originTileId, right.id)
    );
}

function buildPayload(card: SkillCard, ownProperty: Tile, rivalProperty: Tile, stockId: StockId) {
  const payload: {
    skillId: string;
    targetPlayerId?: string;
    targetTileId?: string;
    stockId?: StockId;
    value?: number;
  } = { skillId: card.id };

  if (card.target === "player") payload.targetPlayerId = "P2";
  if (card.target === "property") {
    payload.targetTileId = rivalPropertyCodes.has(card.code) ? rivalProperty.id : ownProperty.id;
  }
  if (card.target === "tile") payload.targetTileId = "tile-00";
  if (card.target === "stock" || ["stockStopLoss", "bullFlag", "bearAlert"].includes(card.code)) {
    payload.stockId = stockId;
  }
  if (card.code === "remoteDice") payload.value = 6;
  return payload;
}

function runSkillCatalogSweep() {
  const failures: string[] = [];

  for (const template of skillCardTemplates) {
    const game = makeTestGame();
    game.turnOrder = ["P1", "P2"];
    game.currentTurnIndex = 0;
    game.phase = "waitingRoll";
    game.pendingAction = null;

    const current = game.players.find((player) => player.id === "P1");
    const rival = game.players.find((player) => player.id === "P2");
    assert.ok(current);
    assert.ok(rival);
    current.cash = 1000;
    rival.cash = 5000;
    current.maxSkillCards = 99;

    const [ownProperty, rivalProperty] = nearestProperties(game, current.currentTileId);
    assert.ok(ownProperty);
    assert.ok(rivalProperty);
    current.properties = [ownProperty.id];
    rival.properties = [rivalProperty.id];
    Object.assign(game.properties[ownProperty.id]!, {
      ownerId: current.id,
      level: 2,
      isMortgaged: false
    });
    Object.assign(game.properties[rivalProperty.id]!, {
      ownerId: rival.id,
      level: 2,
      isMortgaged: false
    });

    const stockId = Object.keys(game.stocks)[0] as StockId;
    const stock = game.stocks[stockId];
    assert.ok(stock);
    current.stocks[stockId] = 10;
    current.stockAccount.holdings[stockId] = {
      stockId,
      shares: 10,
      averageCost: stock.price,
      totalCost: stock.price * 10,
      currentPrice: stock.price,
      marketValue: stock.price * 10,
      unrealizedProfit: 0,
      unrealizedProfitRate: 0
    };

    if (template.code === "releasePermit") {
      current.skipTurns = 2;
      current.statusEffects.push({ id: "catalog-hospital", type: "hospital", turns: 2 });
    }

    const card = makeSkillCard(template, `catalog-${template.code}`);
    current.skillCards = [card];
    const logCount = game.logs.length;
    const outcome = useSkillCard(game, current.id, buildPayload(card, ownProperty, rivalProperty, stockId));

    if (!outcome.ok) {
      failures.push(`${template.code}: ${outcome.error ?? "unknown failure"}`);
      continue;
    }
    if (current.skillCards.some((entry) => entry.id === card.id)) {
      failures.push(`${template.code}: successful use did not consume the card`);
    }
    if (game.logs.length <= logCount || !outcome.skillMessage?.message) {
      failures.push(`${template.code}: successful use did not publish an effect log`);
    }
  }

  assert.deepEqual(failures, [], `skill catalog failures:\n${failures.join("\n")}`);
  assert.equal(new Set(skillCardTemplates.map((card) => card.code)).size, skillCardTemplates.length);
}

runSkillCatalogSweep();
console.log(`Skill catalog sweep passed (${skillCardTemplates.length} cards).`);
