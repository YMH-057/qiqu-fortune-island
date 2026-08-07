import type { AvatarId, ChatMessage, GameSettings, GameState, RoomId, RoomStatus } from "@monopoly/shared";

export interface RoomMember {
  id: string;
  nickname: string;
  color: string;
  avatar: string;
  selectedAvatarId?: AvatarId | undefined;
  selectedStartTileId?: string | undefined;
  isBot?: boolean | undefined;
  reconnectTokenHash?: string | undefined;
  ready: boolean;
  connected: boolean;
  socketId: string;
}

export interface RoomRecord {
  id: RoomId;
  hostId: string;
  status: RoomStatus;
  players: RoomMember[];
  kickedPlayerIds?: string[];
  settings: GameSettings;
  chat: ChatMessage[];
  createdAt: number;
  game?: GameState;
}

export interface RoomStore {
  get(roomId: RoomId): RoomRecord | undefined;
  set(room: RoomRecord): void;
  delete(roomId: RoomId): void;
  list(): RoomRecord[];
}

export class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<RoomId, RoomRecord>();

  get(roomId: RoomId): RoomRecord | undefined {
    return this.rooms.get(roomId);
  }

  set(room: RoomRecord): void {
    this.rooms.set(room.id, room);
  }

  delete(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }

  list(): RoomRecord[] {
    return [...this.rooms.values()];
  }
}
