import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AiTurnCommand } from "../server/src/game/ai";
import {
  ApiAiDecisionProvider,
  createConfiguredAiDecisionProvider,
  OpenAiResponsesAiDecisionProvider,
  type AiDecisionContext,
  type AiDecisionProvider,
  runAiTurnStepWithProvider
} from "../server/src/game/aiDecisionProvider";
import { InMemoryAiDecisionAuditStore } from "../server/src/game/aiDecisionAudit";
import {
  AI_DECISION_PROTOCOL_VERSION,
  createAiDecisionRequest,
  parseAiDecisionResponse
} from "../server/src/game/aiProtocol";
import { makeTestGame } from "./test-fixtures";

function makeAiContext(): AiDecisionContext {
  const game = makeTestGame();
  const bot = game.players.find((player) => player.id === "P2");
  assert.ok(bot);
  bot.isBot = true;
  game.turnOrder = [bot.id, "P1"];
  game.currentTurnIndex = 0;
  game.phase = "waitingRoll";
  return { playerId: bot.id, game, requestedAt: 123456 };
}

function testVersionedProtocolRequiresMatchingVersionAndRequestId() {
  const context = makeAiContext();
  const request = createAiDecisionRequest(context, "request-1");
  assert.equal(request.version, AI_DECISION_PROTOCOL_VERSION);
  assert.equal(request.requestId, "request-1");
  assert.equal(request.context.playerId, context.playerId);

  const command = { kind: "rollDice" as const, playerId: context.playerId };
  assert.deepEqual(
    parseAiDecisionResponse(
      { version: AI_DECISION_PROTOCOL_VERSION, requestId: request.requestId, command },
      request.requestId
    ),
    command
  );
  assert.throws(
    () => parseAiDecisionResponse({ version: "qiqu-ai/0", requestId: request.requestId, command }, request.requestId),
    /version/i
  );
  assert.throws(
    () => parseAiDecisionResponse({ version: AI_DECISION_PROTOCOL_VERSION, requestId: "wrong", command }, request.requestId),
    /requestId/i
  );
}

function testPublishedJsonSchemaMatchesProtocolVersion() {
  const schema = JSON.parse(
    readFileSync("server/src/game/aiDecisionProtocol.v1.schema.json", "utf8")
  ) as {
    $id?: string;
    oneOf?: Array<{ properties?: { version?: { const?: string } } }>;
  };
  assert.equal(schema.$id, "https://qiqu-fortune-island.local/schemas/ai-decision-v1.json");
  assert.ok(schema.oneOf?.every((item) => item.properties?.version?.const === AI_DECISION_PROTOCOL_VERSION));
}

function testAuditStoreIsBoundedAndContainsOnlyMetadata() {
  const store = new InMemoryAiDecisionAuditStore(2);
  for (const index of [1, 2, 3]) {
    store.record({
      requestId: `request-${index}`,
      roomId: "ROOM",
      playerId: "P2",
      providerId: "api-v1",
      commandKind: "rollDice",
      status: "decision_success",
      durationMs: index,
      reason: index === 3 ? "ok" : undefined
    });
  }

  const entries = store.list();
  assert.deepEqual(entries.map((entry) => entry.requestId), ["request-3", "request-2"]);
  assert.equal("game" in entries[0]!, false);
  assert.equal("apiKey" in entries[0]!, false);
}

function testConfiguredProviderReadsEnvironmentAtCreationTime() {
  const previousUrl = process.env.AI_DECISION_API_URL;
  const previousMode = process.env.AI_DECISION_API_MODE;
  const previousModel = process.env.AI_DECISION_MODEL;
  const previousTimeout = process.env.AI_DECISION_API_TIMEOUT_MS;
  try {
    delete process.env.AI_DECISION_API_URL;
    assert.equal(createConfiguredAiDecisionProvider().id, "rule-based-v1");

    process.env.AI_DECISION_API_URL = "https://ai.invalid/decision";
    process.env.AI_DECISION_API_TIMEOUT_MS = "1500";
    assert.equal(createConfiguredAiDecisionProvider().id, "api-v1");

    process.env.AI_DECISION_API_MODE = "responses";
    process.env.AI_DECISION_MODEL = "test-model";
    assert.equal(createConfiguredAiDecisionProvider().id, "openai-responses-v1");
  } finally {
    if (previousUrl === undefined) delete process.env.AI_DECISION_API_URL;
    else process.env.AI_DECISION_API_URL = previousUrl;
    if (previousMode === undefined) delete process.env.AI_DECISION_API_MODE;
    else process.env.AI_DECISION_API_MODE = previousMode;
    if (previousModel === undefined) delete process.env.AI_DECISION_MODEL;
    else process.env.AI_DECISION_MODEL = previousModel;
    if (previousTimeout === undefined) delete process.env.AI_DECISION_API_TIMEOUT_MS;
    else process.env.AI_DECISION_API_TIMEOUT_MS = previousTimeout;
  }
}

async function testResponsesProviderExtractsProtocolEnvelope() {
  const context = makeAiContext();
  const auditStore = new InMemoryAiDecisionAuditStore();
  let sentBody: Record<string, unknown> | null = null;
  const provider = new OpenAiResponsesAiDecisionProvider({
    endpoint: "http://localhost:1455/v1/responses",
    apiKey: "test-key",
    model: "test-model",
    auditStore,
    fetchImpl: async (_input, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const input = JSON.stringify(sentBody.input);
      const requestId = /\"requestId\":\"([^\"]+)\"/.exec(input)?.[1];
      const output = JSON.stringify({
        version: AI_DECISION_PROTOCOL_VERSION,
        requestId,
        command: { kind: "rollDice", playerId: context.playerId }
      });
      const splitAt = Math.floor(output.length / 2);
      const events = [
        `event: response.output_text.delta\ndata: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: output.slice(0, splitAt)
        })}`,
        `event: response.output_text.delta\ndata: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: output.slice(splitAt)
        })}`,
        `event: response.output_text.done\ndata: ${JSON.stringify({
          type: "response.output_text.done",
          text: output
        })}`,
        `event: response.completed\ndata: ${JSON.stringify({
          type: "response.completed",
          response: { status: "completed" }
        })}`
      ].join("\n\n");
      return new Response(events, { status: 200, headers: { "content-type": "text/plain" } });
    }
  });

  const command = await provider.decide(context);

  assert.equal(sentBody?.model, "test-model");
  assert.equal(sentBody?.store, false);
  assert.equal(sentBody?.stream, true);
  assert.ok(Array.isArray(sentBody?.input));
  assert.equal((sentBody.input[0] as { role?: string }).role, "user");
  assert.match(JSON.stringify(sentBody.input), /qiqu-ai\/1/);
  assert.equal(command.kind, "rollDice");
  assert.equal(auditStore.list()[0]?.status, "decision_success");
}

async function testResponsesProviderFallsBackOnNonJsonOutput() {
  const context = makeAiContext();
  const auditStore = new InMemoryAiDecisionAuditStore();
  const fallback: AiDecisionProvider = {
    id: "test-fallback",
    async decide(innerContext) {
      return { kind: "rollDice", playerId: innerContext.playerId };
    }
  };
  const provider = new OpenAiResponsesAiDecisionProvider({
    endpoint: "http://localhost:1455/v1/responses",
    apiKey: "test-key",
    model: "test-model",
    fallback,
    auditStore,
    fetchImpl: async () => new Response([
      "event: response.output_text.delta",
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "not json" })}`,
      "",
      "event: response.output_text.done",
      `data: ${JSON.stringify({ type: "response.output_text.done", text: "not json" })}`
    ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } })
  });

  const command = await provider.decide(context);

  assert.equal(command.kind, "rollDice");
  assert.equal(auditStore.list()[0]?.status, "decision_fallback");
}

async function testResponsesProviderDoesNotAuditRemoteErrorBody() {
  const context = makeAiContext();
  const auditStore = new InMemoryAiDecisionAuditStore();
  const provider = new OpenAiResponsesAiDecisionProvider({
    endpoint: "http://localhost:1455/v1/responses",
    apiKey: "test-key",
    model: "test-model",
    auditStore,
    fetchImpl: async () => new Response("sensitive-upstream-request-body", { status: 500 })
  });

  await provider.decide(context);

  const audit = auditStore.list().find((entry) => entry.providerId === "openai-responses-v1");
  assert.equal(audit?.status, "decision_fallback");
  assert.doesNotMatch(audit?.reason ?? "", /sensitive-upstream-request-body/);
  assert.match(audit?.reason ?? "", /500/);
}

async function testApiProviderUsesVersionedEnvelopeAndWritesAudit() {
  const context = makeAiContext();
  const auditStore = new InMemoryAiDecisionAuditStore();
  let sentBody: Record<string, unknown> | null = null;
  const provider = new ApiAiDecisionProvider({
    endpoint: "https://ai.invalid/decision",
    auditStore,
    fetchImpl: async (_input, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        version: AI_DECISION_PROTOCOL_VERSION,
        requestId: sentBody.requestId,
        command: { kind: "rollDice", playerId: context.playerId }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const command = await provider.decide(context);

  assert.equal(sentBody?.version, AI_DECISION_PROTOCOL_VERSION);
  assert.equal(command.kind, "rollDice");
  assert.equal(auditStore.list()[0]?.status, "decision_success");
}

async function testApiProtocolMismatchFallsBackAndAuditsReason() {
  const context = makeAiContext();
  const auditStore = new InMemoryAiDecisionAuditStore();
  const fallback: AiDecisionProvider = {
    id: "test-fallback",
    async decide(innerContext) {
      return { kind: "rollDice", playerId: innerContext.playerId };
    }
  };
  const provider = new ApiAiDecisionProvider({
    endpoint: "https://ai.invalid/decision",
    auditStore,
    fallback,
    fetchImpl: async () => new Response(JSON.stringify({
      version: "qiqu-ai/0",
      requestId: "wrong",
      command: { kind: "endTurn", playerId: context.playerId }
    }), { status: 200 })
  });

  const command = await provider.decide(context);

  assert.equal(command.kind, "rollDice");
  assert.equal(auditStore.list()[0]?.status, "decision_fallback");
  assert.match(auditStore.list()[0]?.reason ?? "", /version/i);
}

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
  testVersionedProtocolRequiresMatchingVersionAndRequestId();
  testPublishedJsonSchemaMatchesProtocolVersion();
  testAuditStoreIsBoundedAndContainsOnlyMetadata();
  testConfiguredProviderReadsEnvironmentAtCreationTime();
  await testResponsesProviderExtractsProtocolEnvelope();
  await testResponsesProviderFallsBackOnNonJsonOutput();
  await testResponsesProviderDoesNotAuditRemoteErrorBody();
  await testApiProviderUsesVersionedEnvelopeAndWritesAudit();
  await testApiProtocolMismatchFallsBackAndAuditsReason();
  await testProviderReceivesPlayerSafeContextAndExecutesServerCommand();
  await testRejectedApiActionFallsBackToRuleBasedDecision();
  console.log("AI provider tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
