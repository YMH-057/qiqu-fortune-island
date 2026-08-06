import assert from "node:assert/strict";
import dotenv from "dotenv";
import { createConfiguredAiDecisionProvider } from "../server/src/game/aiDecisionProvider";
import { defaultAiDecisionAuditStore } from "../server/src/game/aiDecisionAudit";
import { makeTestGame } from "./test-fixtures";

dotenv.config({ path: "server/.env" });

async function main(): Promise<void> {
  const game = makeTestGame();
  const bot = game.players.find((player) => player.id === "P2");
  assert.ok(bot);
  bot.isBot = true;
  game.turnOrder = [bot.id, "P1"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";

  const provider = createConfiguredAiDecisionProvider();
  assert.equal(provider.id, "openai-responses-v1", "server/.env has not enabled the Responses provider");

  const command = await provider.decide({
    playerId: bot.id,
    game,
    requestedAt: Date.now()
  });
  const decisionAudit = defaultAiDecisionAuditStore.list().find((entry) =>
    entry.providerId === provider.id
    && (entry.status === "decision_success" || entry.status === "decision_fallback")
  );

  assert.ok(decisionAudit, "AI decision did not produce an audit entry");
  assert.equal(decisionAudit.status, "decision_success", decisionAudit.reason ?? "AI decision fell back");
  console.log(JSON.stringify({
    provider: provider.id,
    command: command.kind,
    durationMs: decisionAudit.durationMs,
    status: decisionAudit.status
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
