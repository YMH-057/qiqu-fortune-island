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

export function createConfiguredAiDecisionProvider(): AiDecisionProvider {
  const endpoint = process.env.AI_DECISION_API_URL?.trim();
  if (!endpoint) {
    return new RuleBasedAiDecisionProvider();
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
