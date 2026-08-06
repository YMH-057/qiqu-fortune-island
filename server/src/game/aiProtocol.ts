import { randomUUID } from "node:crypto";
import type { GameState, PlayerId } from "@monopoly/shared";
import type { AiTurnCommand } from "./ai";

export const AI_DECISION_PROTOCOL_VERSION = "qiqu-ai/1" as const;

export interface AiDecisionProtocolContext {
  playerId: PlayerId;
  game: GameState;
  requestedAt: number;
}

export interface AiDecisionRequest {
  version: typeof AI_DECISION_PROTOCOL_VERSION;
  requestId: string;
  context: AiDecisionProtocolContext;
}

export interface AiDecisionResponse {
  version: typeof AI_DECISION_PROTOCOL_VERSION;
  requestId: string;
  command: AiTurnCommand;
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

export function createAiDecisionRequest(
  context: AiDecisionProtocolContext,
  requestId = randomUUID()
): AiDecisionRequest {
  return {
    version: AI_DECISION_PROTOCOL_VERSION,
    requestId,
    context
  };
}

export function parseAiDecisionResponse(value: unknown, expectedRequestId: string): AiTurnCommand {
  if (!isRecord(value) || value.version !== AI_DECISION_PROTOCOL_VERSION) {
    throw new Error(`AI response version must be ${AI_DECISION_PROTOCOL_VERSION}`);
  }
  if (value.requestId !== expectedRequestId) {
    throw new Error("AI response requestId does not match the request");
  }
  if (!isAiTurnCommand(value.command)) {
    throw new Error("AI response command is invalid");
  }
  return value.command;
}
