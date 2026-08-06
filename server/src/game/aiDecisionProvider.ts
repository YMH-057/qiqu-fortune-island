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

export interface AiDecisionContext {
  playerId: PlayerId;
  game: GameState;
  requestedAt: number;
}

export interface AiDecisionProvider {
  readonly id: string;
  decide(context: AiDecisionContext): Promise<AiTurnCommand>;
}

export class RuleBasedAiDecisionProvider implements AiDecisionProvider {
  readonly id = "rule-based-v1";

  async decide(context: AiDecisionContext): Promise<AiTurnCommand> {
    return getAiTurnCommand(context.game);
  }
}

export interface ApiAiDecisionProviderOptions {
  endpoint: string;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  fallback?: AiDecisionProvider | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isAiTurnCommand(value: unknown): value is AiTurnCommand {
  if (!isRecord(value) || !isString(value.kind)) return false;
  if (value.kind === "none") return typeof value.reason === "string";
  if (!isString(value.playerId)) return false;

  switch (value.kind) {
    case "rollDice":
    case "cancelPortal":
    case "closeSkillShop":
    case "skipLottery":
    case "declareBankruptcy":
    case "endTurn":
      return true;
    case "buyProperty":
    case "upgradeProperty":
    case "choosePath":
    case "mortgageProperty":
      return isString(value.tileId);
    case "choosePortal":
      return isString(value.targetTileId);
    case "buySkillCard":
      return isString(value.skillId);
    case "borrowCredit":
      return typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount > 0;
    case "useSkillCard":
      return isRecord(value.payload) && isString(value.payload.skillId);
    case "submitStockOrder":
      return isString(value.stockId)
        && (value.type === "buy" || value.type === "sell")
        && typeof value.shares === "number"
        && Number.isFinite(value.shares)
        && value.shares > 0;
    default:
      return false;
  }
}

export class ApiAiDecisionProvider implements AiDecisionProvider {
  readonly id = "api-v1";
  private readonly fallback: AiDecisionProvider;

  constructor(private readonly options: ApiAiDecisionProviderOptions) {
    this.fallback = options.fallback ?? new RuleBasedAiDecisionProvider();
  }

  async decide(context: AiDecisionContext): Promise<AiTurnCommand> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, this.options.timeoutMs ?? 5000));
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.options.apiKey) {
        headers.authorization = `Bearer ${this.options.apiKey}`;
      }
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(context),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`AI API returned ${response.status}`);
      }
      const body: unknown = await response.json();
      const command = isRecord(body) && "command" in body ? body.command : body;
      if (!isAiTurnCommand(command) || (command.kind !== "none" && command.playerId !== context.playerId)) {
        throw new Error("AI API returned an invalid command");
      }
      return command;
    } catch {
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
    return step;
  }

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
