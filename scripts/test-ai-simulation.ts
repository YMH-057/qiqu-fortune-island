import assert from "node:assert/strict";
import {
  AVATAR_DEFINITIONS,
  START_TILE_OPTIONS,
  type AiDifficulty,
  type GameState,
  type RoomPlayer
} from "@monopoly/shared";
import { runAiTurnStep } from "../server/src/game/ai";
import { createGameState } from "../server/src/game/createGameState";
import { testSettings } from "./test-fixtures";

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBots(count: number): RoomPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `SIM-AI-${index + 1}`,
    nickname: `模拟 AI ${index + 1}`,
    color: ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"][index]!,
    avatar: "AI",
    selectedAvatarId: AVATAR_DEFINITIONS[index]?.id ?? AVATAR_DEFINITIONS[0]!.id,
    selectedStartTileId: START_TILE_OPTIONS[index]?.tileId ?? START_TILE_OPTIONS[0]!.tileId,
    isBot: true,
    ready: true,
    connected: true,
    isHost: index === 0
  }));
}

function assertFinite(value: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label} must be finite, received ${value}`);
}

function assertGameInvariants(game: GameState, step: number): void {
  const playersById = new Map(game.players.map((player) => [player.id, player]));
  if (game.status === "playing") {
    const currentPlayerId = game.turnOrder[game.currentTurnIndex];
    assert.ok(currentPlayerId && playersById.has(currentPlayerId), `step ${step}: current turn player must exist`);
  }

  for (const player of game.players) {
    assertFinite(player.cash, `step ${step} ${player.id} cash`);
    assertFinite(player.tickets, `step ${step} ${player.id} tickets`);
    assertFinite(player.bankAccount.deposit, `step ${step} ${player.id} deposit`);
    assertFinite(player.bankAccount.debtPrincipal, `step ${step} ${player.id} debt principal`);
    assertFinite(player.bankAccount.unpaidInterest, `step ${step} ${player.id} unpaid interest`);
    assert.ok(player.tickets >= 0, `step ${step}: tickets cannot be negative`);
    for (const tileId of player.properties) {
      assert.equal(game.properties[tileId]?.ownerId, player.id, `step ${step}: property owner mismatch for ${tileId}`);
    }
    for (const holding of Object.values(player.stockAccount.holdings)) {
      if (!holding) continue;
      assertFinite(holding.shares, `step ${step} ${player.id} ${holding.stockId} shares`);
      assertFinite(holding.marketValue, `step ${step} ${player.id} ${holding.stockId} market value`);
      assert.ok(holding.shares >= 0, `step ${step}: stock shares cannot be negative`);
    }
  }

  for (const property of Object.values(game.properties)) {
    if (!property.ownerId) continue;
    const owner = playersById.get(property.ownerId);
    assert.ok(owner, `step ${step}: property owner ${property.ownerId} must exist`);
    assert.ok(owner.properties.includes(property.tileId), `step ${step}: owner list missing ${property.tileId}`);
  }

  for (const stock of Object.values(game.stocks)) {
    assertFinite(stock.currentPrice, `step ${step} ${stock.id} price`);
    assert.ok(stock.currentPrice > 0, `step ${step}: stock price must stay positive`);
  }
}

function runSimulation(seed: number, playerCount: number, difficulty: AiDifficulty): void {
  const originalRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    const game = createGameState(`SIM-${seed}`, makeBots(playerCount), {
      ...testSettings,
      aiDifficulty: difficulty,
      durationMode: "short_3_months",
      initialMoney: 30000,
      initialTickets: 8,
      initialSkillCardLimit: 8
    });
    const maxSteps = 16000;
    let steps = 0;

    while (game.status === "playing" && steps < maxSteps) {
      assertGameInvariants(game, steps);
      const currentPlayerId = game.turnOrder[game.currentTurnIndex];
      const currentPlayer = game.players.find((player) => player.id === currentPlayerId);
      const result = runAiTurnStep(game);
      if (!result.outcome) {
        if (currentPlayer?.insolventUntil && currentPlayer.insolventUntil > Date.now()) {
          currentPlayer.insolventUntil = Date.now() - 1;
        } else {
          assert.fail(`seed ${seed} step ${steps}: AI stalled on ${result.command.kind}`);
        }
      } else {
        assert.equal(result.outcome.ok, true, `seed ${seed} step ${steps}: ${result.command.kind} failed`);
      }
      steps += 1;
    }

    assertGameInvariants(game, steps);
    assert.equal(game.status, "ended", `seed ${seed} (${playerCount} ${difficulty}) did not finish in ${maxSteps} steps`);
    assert.ok(game.rankings.length > 0, `seed ${seed}: finished game must have rankings`);
  } finally {
    Math.random = originalRandom;
  }
}

for (const [seed, difficulty] of [
  [101, "conservative"],
  [202, "balanced"],
  [303, "aggressive"]
] as const) {
  runSimulation(seed, 4, difficulty);
}
runSimulation(808, 8, "balanced");

console.log("AI full-game simulation tests passed.");
