import type { PlayerId, RoomId } from "@monopoly/shared";
import type { AiTurnCommand } from "./ai";

export type AiDecisionAuditStatus =
  | "decision_success"
  | "decision_fallback"
  | "action_accepted"
  | "action_rejected";

export interface AiDecisionAuditEntry {
  id: string;
  requestId?: string | undefined;
  roomId: RoomId;
  playerId: PlayerId;
  providerId: string;
  commandKind: AiTurnCommand["kind"];
  status: AiDecisionAuditStatus;
  durationMs: number;
  reason?: string | undefined;
  createdAt: number;
}

export type AiDecisionAuditInput = Omit<AiDecisionAuditEntry, "id" | "createdAt">;

export interface AiDecisionAuditStore {
  record(input: AiDecisionAuditInput): AiDecisionAuditEntry;
  list(limit?: number): AiDecisionAuditEntry[];
}

function cleanReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  return reason.replace(/[\r\n\t]+/g, " ").slice(0, 180);
}

export class InMemoryAiDecisionAuditStore implements AiDecisionAuditStore {
  private readonly entries: AiDecisionAuditEntry[] = [];
  private readonly limit: number;

  constructor(limit = 500) {
    this.limit = Math.max(1, Math.min(5000, Math.floor(limit) || 500));
  }

  record(input: AiDecisionAuditInput): AiDecisionAuditEntry {
    const entry: AiDecisionAuditEntry = {
      ...input,
      id: `ai-audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      reason: cleanReason(input.reason),
      createdAt: Date.now()
    };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, this.limit);
    return entry;
  }

  list(limit = this.limit): AiDecisionAuditEntry[] {
    return this.entries.slice(0, Math.max(0, Math.min(this.limit, Math.floor(limit)))).map((entry) => ({ ...entry }));
  }
}

export const defaultAiDecisionAuditStore = new InMemoryAiDecisionAuditStore(500);
