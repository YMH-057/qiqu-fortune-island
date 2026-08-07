import type { GameState, PlayerId } from "@monopoly/shared";
import {
  type AiTurnCommand,
  type AiTurnStepResult,
  executeAiTurnCommand,
  getAiTurnCommand,
  isAiControlledPlayer
} from "./ai";
import { autoPlayTimedOutTurn } from "./actions";
import { projectGameForPlayer } from "./playerView";
import {
  defaultAiDecisionAuditStore,
  type AiDecisionAuditStore
} from "./aiDecisionAudit";
import {
  createAiDecisionRequest,
  isAiTurnCommand,
  parseAiDecisionResponse
} from "./aiProtocol";

export interface AiDecisionContext {
  playerId: PlayerId;
  game: GameState;
  requestedAt: number;
}

export interface AiDecisionProvider {
  readonly id: string;
  readonly auditStore?: AiDecisionAuditStore | undefined;
  decide(context: AiDecisionContext): Promise<AiTurnCommand>;
}

export class RuleBasedAiDecisionProvider implements AiDecisionProvider {
  readonly id = "rule-based-v1";

  constructor(readonly auditStore: AiDecisionAuditStore = defaultAiDecisionAuditStore) {}

  async decide(context: AiDecisionContext): Promise<AiTurnCommand> {
    const startedAt = Date.now();
    const command = getAiTurnCommand(context.game);
    this.auditStore.record({
      roomId: context.game.roomId,
      playerId: context.playerId,
      providerId: this.id,
      commandKind: command.kind,
      status: "decision_success",
      durationMs: Date.now() - startedAt
    });
    return command;
  }
}

export interface ApiAiDecisionProviderOptions {
  endpoint: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  fallback?: AiDecisionProvider | undefined;
  auditStore?: AiDecisionAuditStore | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface OpenAiResponsesAiDecisionProviderOptions extends ApiAiDecisionProviderOptions {
  model: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function extractResponsesText(value: unknown): string {
  if (!isRecord(value)) {
    throw new Error("AI Responses API returned an invalid body");
  }
  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text;
  }
  if (Array.isArray(value.output)) {
    const parts: string[] = [];
    for (const item of value.output) {
      if (!isRecord(item) || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (!isRecord(content)) continue;
        if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
          parts.push(content.text);
        }
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  throw new Error("AI Responses API did not return output text");
}

function extractResponsesSseText(rawBody: string): string {
  const deltas: string[] = [];
  let completedText = "";

  for (const block of rawBody.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;

    let event: unknown;
    try {
      event = JSON.parse(data) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(event)) continue;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      deltas.push(event.delta);
    }
    if (event.type === "response.output_text.done" && typeof event.text === "string") {
      completedText = event.text;
    }
  }

  const text = completedText || deltas.join("");
  if (!text.trim()) {
    throw new Error("AI Responses API stream did not return output text");
  }
  return text;
}

function extractResponsesBodyText(rawBody: string): string {
  if (/^\s*(?:event|data):/m.test(rawBody)) {
    return extractResponsesSseText(rawBody);
  }
  return extractResponsesText(JSON.parse(rawBody) as unknown);
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("AI Responses API output is not JSON");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

function buildResponsesPrompt(context: AiDecisionContext, request: ReturnType<typeof createAiDecisionRequest>): string {
  const fallbackCommand = getAiTurnCommand(context.game);
  return [
    "You are the server-side decision engine for a turn-based Monopoly-style game.",
    "Return exactly one JSON object. Do not use Markdown or explanatory text.",
    `The object must use version ${request.version}, repeat the supplied requestId, and contain one command.`,
    "Allowed command kinds are: none, rollDice, cancelPortal, closeSkillShop, skipLottery, declareBankruptcy, endTurn, buyProperty, upgradeProperty, choosePath, mortgageProperty, choosePortal, buySkillCard, borrowCredit, useSkillCard, submitStockOrder.",
    "Never invent a playerId, tileId, skillId, stockId, amount, or target. Use only identifiers present in the supplied player-safe game state.",
    "The game server will reject illegal commands. Prefer the rule suggestion when the state is ambiguous.",
    `Rule suggestion: ${JSON.stringify(fallbackCommand)}`,
    `Decision request: ${JSON.stringify(request)}`
  ].join("\n");
}

export class ApiAiDecisionProvider implements AiDecisionProvider {
  readonly id = "api-v1";
  readonly auditStore: AiDecisionAuditStore;
  private readonly fallback: AiDecisionProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiAiDecisionProviderOptions) {
    this.auditStore = options.auditStore ?? defaultAiDecisionAuditStore;
    this.fallback = options.fallback ?? new RuleBasedAiDecisionProvider(this.auditStore);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(context: AiDecisionContext): Promise<AiTurnCommand> {
    const startedAt = Date.now();
    const request = createAiDecisionRequest(context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, this.options.timeoutMs ?? 5000));
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.options.apiKey) {
        headers.authorization = `Bearer ${this.options.apiKey}`;
      }
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`AI API returned ${response.status}`);
      }
      const body: unknown = await response.json();
      const command = parseAiDecisionResponse(body, request.requestId);
      if (command.kind !== "none" && command.playerId !== context.playerId) {
        throw new Error("AI API returned an invalid command");
      }
      this.auditStore.record({
        requestId: request.requestId,
        roomId: context.game.roomId,
        playerId: context.playerId,
        providerId: this.id,
        commandKind: command.kind,
        status: "decision_success",
        durationMs: Date.now() - startedAt
      });
      return command;
    } catch (error) {
      this.auditStore.record({
        requestId: request.requestId,
        roomId: context.game.roomId,
        playerId: context.playerId,
        providerId: this.id,
        commandKind: "none",
        status: "decision_fallback",
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : "Unknown AI provider error"
      });
      return this.fallback.decide(context);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenAiResponsesAiDecisionProvider implements AiDecisionProvider {
  readonly id = "openai-responses-v1";
  readonly auditStore: AiDecisionAuditStore;
  private readonly fallback: AiDecisionProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiResponsesAiDecisionProviderOptions) {
    this.auditStore = options.auditStore ?? defaultAiDecisionAuditStore;
    this.fallback = options.fallback ?? new RuleBasedAiDecisionProvider(this.auditStore);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(context: AiDecisionContext): Promise<AiTurnCommand> {
    const startedAt = Date.now();
    const request = createAiDecisionRequest(context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, this.options.timeoutMs ?? 60_000));
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.options.model,
          input: [{
            role: "user",
            content: [{
              type: "input_text",
              text: buildResponsesPrompt(context, request)
            }]
          }],
          store: false,
          stream: true
        }),
        signal: controller.signal
      });
      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(`AI Responses API returned ${response.status}`);
      }
      const command = parseAiDecisionResponse(parseJsonText(extractResponsesBodyText(rawBody)), request.requestId);
      if (command.kind !== "none" && command.playerId !== context.playerId) {
        throw new Error("AI Responses API returned a command for another player");
      }
      this.auditStore.record({
        requestId: request.requestId,
        roomId: context.game.roomId,
        playerId: context.playerId,
        providerId: this.id,
        commandKind: command.kind,
        status: "decision_success",
        durationMs: Date.now() - startedAt
      });
      return command;
    } catch (error) {
      this.auditStore.record({
        requestId: request.requestId,
        roomId: context.game.roomId,
        playerId: context.playerId,
        providerId: this.id,
        commandKind: "none",
        status: "decision_fallback",
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : "Unknown AI Responses provider error"
      });
      return this.fallback.decide(context);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createConfiguredAiDecisionProvider(): AiDecisionProvider {
  const endpoint = process.env.AI_DECISION_API_URL?.trim();
  if (!endpoint) {
    return new RuleBasedAiDecisionProvider();
  }
  if (process.env.AI_DECISION_API_MODE?.trim().toLowerCase() === "responses") {
    const model = process.env.AI_DECISION_MODEL?.trim();
    if (!model) return new RuleBasedAiDecisionProvider();
    return new OpenAiResponsesAiDecisionProvider({
      endpoint,
      model,
      apiKey: process.env.AI_DECISION_API_KEY?.trim() || undefined,
      timeoutMs: Number(process.env.AI_DECISION_API_TIMEOUT_MS) || 60_000
    });
  }
  return new ApiAiDecisionProvider({
    endpoint,
    apiKey: process.env.AI_DECISION_API_KEY?.trim() || undefined,
    timeoutMs: Number(process.env.AI_DECISION_API_TIMEOUT_MS) || 5000
  });
}

export async function runAiTurnStepWithProvider(
  state: GameState,
  provider: AiDecisionProvider
): Promise<AiTurnStepResult> {
  const playerId = state.turnOrder[state.currentTurnIndex];
  const player = playerId ? state.players.find((item) => item.id === playerId) : undefined;
  if (!playerId || !isAiControlledPlayer(player)) {
    return { command: { kind: "none", reason: "当前玩家不是 AI。" } };
  }

  const context: AiDecisionContext = {
    playerId,
    game: structuredClone(projectGameForPlayer(state, playerId)),
    requestedAt: Date.now()
  };
  let command: AiTurnCommand;
  try {
    command = await provider.decide(context);
  } catch {
    command = getAiTurnCommand(context.game);
  }
  if (!isAiTurnCommand(command) || (command.kind !== "none" && command.playerId !== playerId)) {
    command = getAiTurnCommand(context.game);
  }

  const currentPlayerId = state.turnOrder[state.currentTurnIndex];
  if (state.status !== "playing" || currentPlayerId !== playerId) {
    return { command: { kind: "none", reason: "AI 决策返回时回合已经变化。" } };
  }

  const step = executeAiTurnCommand(state, command);
  if (step.outcome?.ok !== false) {
    provider.auditStore?.record({
      roomId: state.roomId,
      playerId,
      providerId: provider.id,
      commandKind: command.kind,
      status: "action_accepted",
      durationMs: Date.now() - context.requestedAt
    });
    return step;
  }

  provider.auditStore?.record({
    roomId: state.roomId,
    playerId,
    providerId: provider.id,
    commandKind: command.kind,
    status: "action_rejected",
    durationMs: Date.now() - context.requestedAt,
    reason: step.outcome.error
  });

  const fallbackCommand = getAiTurnCommand(state);
  const fallbackStep = executeAiTurnCommand(state, fallbackCommand);
  if (fallbackStep.outcome?.ok !== false) {
    return fallbackStep;
  }
  return {
    command: fallbackCommand,
    outcome: autoPlayTimedOutTurn(state)
  };
}
