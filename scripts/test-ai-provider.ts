import assert from "node:assert/strict";
import type { AiTurnCommand } from "../server/src/game/ai";
import {
  type AiDecisionContext,
  type AiDecisionProvider,
  runAiTurnStepWithProvider
} from "../server/src/game/aiDecisionProvider";
import { makeTestGame } from "./test-fixtures";

async function testProviderReceivesPlayerSafeContextAndExecutesServerCommand() {
  const game = makeTestGame();
  const bot = game.players.find((player) => player.id === "P2");
  assert.ok(bot);
  bot.isBot = true;
  game.turnOrder = [bot.id, "P1"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";

  let received: AiDecisionContext | null = null;
  const provider: AiDecisionProvider = {
    id: "test-provider",
    async decide(context): Promise<AiTurnCommand> {
      received = context;
      return { kind: "rollDice", playerId: context.playerId };
    }
  };

  const result = await runAiTurnStepWithProvider(game, provider);

  assert.equal(received?.playerId, bot.id);
  assert.equal(result.outcome?.ok, true);
  assert.equal(result.dicePlayerId, bot.id);
}

async function testRejectedApiActionFallsBackToRuleBasedDecision() {
  const game = makeTestGame();
  const bot = game.players.find((player) => player.id === "P2");
  assert.ok(bot);
  bot.isBot = true;
  game.turnOrder = [bot.id, "P1"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";

  const provider: AiDecisionProvider = {
    id: "invalid-action-provider",
    async decide(context): Promise<AiTurnCommand> {
      return { kind: "buyProperty", playerId: context.playerId, tileId: "tile-00" };
    }
  };

  const result = await runAiTurnStepWithProvider(game, provider);

  assert.equal(result.command.kind, "rollDice");
  assert.equal(result.outcome?.ok, true);
  assert.equal(result.dicePlayerId, bot.id);
}

async function main() {
  await testProviderReceivesPlayerSafeContextAndExecutesServerCommand();
  await testRejectedApiActionFallsBackToRuleBasedDecision();
  console.log("AI provider tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
