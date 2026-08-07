import { MAX_ROOM_PLAYERS } from "@monopoly/shared";

export const MAX_STACKED_PLAYER_TOKENS = MAX_ROOM_PLAYERS;

const PLAYER_TOKEN_OFFSETS = [
  { x: -15, y: -12 },
  { x: 0, y: -14 },
  { x: 15, y: -12 },
  { x: -16, y: 5 },
  { x: 0, y: 4 },
  { x: 16, y: 5 },
  { x: -9, y: 20 },
  { x: 9, y: 20 }
] as const;

export function getPlayerTokenOffset(index: number): { x: number; y: number } {
  return PLAYER_TOKEN_OFFSETS[index % PLAYER_TOKEN_OFFSETS.length] ?? { x: 0, y: 0 };
}
