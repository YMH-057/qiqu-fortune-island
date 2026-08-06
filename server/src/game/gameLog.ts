import type { GameState } from "@monopoly/shared";

function logId(): string {
  return `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function appendGameLog(state: GameState, message: string): void {
  state.logs.unshift({
    id: logId(),
    turn: state.completedTurns,
    message,
    createdAt: Date.now()
  });
  state.logs = state.logs.slice(0, 100);
}
