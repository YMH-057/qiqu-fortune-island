import {
  AVATAR_DEFINITIONS,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  START_TILE_OPTIONS,
  type AvatarId,
  type ChatMessage,
  type GameSettings,
  type GameState,
  type RoomPlayer,
  type RoomPublicState,
  type TileId
} from "@monopoly/shared";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createGameState } from "../game/createGameState";
import { closeMonthlySettlement } from "../game/actions";
import { MemoryRoomStore, type RoomMember, type RoomRecord, type RoomStore } from "./RoomStore";

interface RoomResult {
  ok: boolean;
  error?: string;
  room?: RoomRecord;
  playerId?: string;
  reconnectToken?: string;
  previousSocketId?: string;
  targetPlayerId?: string;
  targetSocketId?: string;
}

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const PLAYER_AVATARS = ["Pilot", "Bot", "Ranger", "Maker", "Captain", "Scholar", "Guardian", "Explorer"];
const AI_NICKNAMES = ["AI 豆豆", "AI 果果", "AI 星仔", "AI 泡泡", "AI 糖糖", "AI 云宝", "AI 乐乐"];
const DEFAULT_AVATAR_IDS = AVATAR_DEFINITIONS.map((avatar) => avatar.id);
const START_TILE_IDS: TileId[] = START_TILE_OPTIONS.map((option) => option.tileId);
const DEFAULT_SETTINGS: GameSettings = {
  endCondition: "rounds",
  maxRounds: 25,
  allowVoluntaryBankruptcy: true,
  durationMode: "standard_1_year",
  initialMoney: 10000,
  initialTickets: 3,
  initialSkillCardLimit: 5,
  lapRewardMoney: 1500,
  lapRewardTickets: 1,
  bankVisitMoney: 400,
  bankVisitTickets: 1,
  stockTradeFeeRate: 0.01,
  depositMonthlyRate: 0.1,
  loanMonthlyRate: 0.1,
  creditLimit: 20000,
  forcedRepaymentRate: 0.2,
  moneyToTicketCost: 1000,
  ticketToMoneyValue: 600,
  bankInitialMoney: 0,
  bankInitialTickets: 0,
  jailTurns: 3,
  hospitalTurns: 3,
  bailCost: 2000,
  treatmentCost: 2000,
  rentMultipliers: [1, 2.3, 5, 10],
  enableSpecialCards: true,
  enableRandomAnnouncements: true,
  lotteryMaxTickets: 3,
  skillShopOfferCount: 8,
  allowFreeSkillCards: false,
  startTileId: "tile-00",
  useSharedStartTile: false,
  lapRewardMode: "go",
  turnDurationSeconds: 60
};

function makeId(prefix: string, length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "A";
  }
  return `${prefix}${value}`;
}

function sanitizeNickname(nickname: string): string {
  const clean = nickname.trim().slice(0, 18);
  return clean.length > 0 ? clean : "Player";
}

function firstAvailablePlayerColor(players: RoomMember[]): string {
  const occupied = new Set(players.map((player) => player.color));
  return PLAYER_COLORS.find((color) => !occupied.has(color)) ?? PLAYER_COLORS[players.length % PLAYER_COLORS.length] ?? "#64748b";
}

function createReconnectCredential(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashReconnectToken(token) };
}

function hashReconnectToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function reconnectTokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashReconnectToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class RoomManager {
  constructor(private readonly store: RoomStore = new MemoryRoomStore()) {}

  createRoom(nickname: string, socketId: string): RoomResult {
    let roomId = makeId("", 6);
    while (this.store.get(roomId)) {
      roomId = makeId("", 6);
    }

    const playerId = makeId("P", 8);
    const reconnectCredential = createReconnectCredential();
    const player: RoomMember = {
      id: playerId,
      nickname: sanitizeNickname(nickname),
      color: PLAYER_COLORS[0] ?? "#ef4444",
      avatar: PLAYER_AVATARS[0] ?? "Pilot",
      selectedAvatarId: DEFAULT_AVATAR_IDS[0],
      selectedStartTileId: START_TILE_IDS[0],
      isBot: false,
      reconnectTokenHash: reconnectCredential.hash,
      ready: false,
      connected: true,
      socketId
    };

    const room: RoomRecord = {
      id: roomId,
      hostId: playerId,
      status: "lobby",
      players: [player],
      kickedPlayerIds: [],
      settings: { ...DEFAULT_SETTINGS },
      chat: [],
      createdAt: Date.now()
    };

    this.store.set(room);
    return { ok: true, room, playerId, reconnectToken: reconnectCredential.token };
  }

  updateSettings(roomId: string, playerId: string, patch: Partial<GameSettings>): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== playerId) {
      return { ok: false, error: "Only the host can update game settings." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "Settings can only change in the lobby." };
    }

    if (patch.endCondition === "rounds" || patch.endCondition === "bankruptcy") {
      room.settings.endCondition = patch.endCondition;
    }
    if (typeof patch.maxRounds === "number" && Number.isFinite(patch.maxRounds)) {
      room.settings.maxRounds = Math.max(5, Math.min(60, Math.floor(patch.maxRounds)));
    }
    if (typeof patch.allowVoluntaryBankruptcy === "boolean") {
      room.settings.allowVoluntaryBankruptcy = patch.allowVoluntaryBankruptcy;
    }
    if (typeof patch.initialMoney === "number" && Number.isFinite(patch.initialMoney)) {
      room.settings.initialMoney = Math.max(0, Math.min(999999, Math.floor(patch.initialMoney)));
    }
    if (typeof patch.initialTickets === "number" && Number.isFinite(patch.initialTickets)) {
      room.settings.initialTickets = Math.max(0, Math.min(999, Math.floor(patch.initialTickets)));
    }
    if (typeof patch.initialSkillCardLimit === "number" && Number.isFinite(patch.initialSkillCardLimit)) {
      room.settings.initialSkillCardLimit = Math.max(1, Math.min(99, Math.floor(patch.initialSkillCardLimit)));
    }
    if (typeof patch.lapRewardMoney === "number" && Number.isFinite(patch.lapRewardMoney)) {
      room.settings.lapRewardMoney = Math.max(0, Math.min(999999, Math.floor(patch.lapRewardMoney)));
    }
    if (typeof patch.lapRewardTickets === "number" && Number.isFinite(patch.lapRewardTickets)) {
      room.settings.lapRewardTickets = Math.max(0, Math.min(20, Math.floor(patch.lapRewardTickets)));
    }
    if (typeof patch.bankVisitMoney === "number" && Number.isFinite(patch.bankVisitMoney)) {
      room.settings.bankVisitMoney = Math.max(0, Math.min(999999, Math.floor(patch.bankVisitMoney)));
    }
    if (typeof patch.bankVisitTickets === "number" && Number.isFinite(patch.bankVisitTickets)) {
      room.settings.bankVisitTickets = Math.max(0, Math.min(20, Math.floor(patch.bankVisitTickets)));
    }
    if (typeof patch.stockTradeFeeRate === "number" && Number.isFinite(patch.stockTradeFeeRate)) {
      room.settings.stockTradeFeeRate = Math.max(0, Math.min(0.2, patch.stockTradeFeeRate));
    }
    if (typeof patch.depositMonthlyRate === "number" && Number.isFinite(patch.depositMonthlyRate)) {
      room.settings.depositMonthlyRate = Math.max(0, Math.min(0.5, patch.depositMonthlyRate));
    }
    if (typeof patch.loanMonthlyRate === "number" && Number.isFinite(patch.loanMonthlyRate)) {
      room.settings.loanMonthlyRate = Math.max(0, Math.min(0.5, patch.loanMonthlyRate));
    }
    if (typeof patch.creditLimit === "number" && Number.isFinite(patch.creditLimit)) {
      room.settings.creditLimit = Math.max(0, Math.min(999999, Math.floor(patch.creditLimit)));
    }
    if (typeof patch.forcedRepaymentRate === "number" && Number.isFinite(patch.forcedRepaymentRate)) {
      room.settings.forcedRepaymentRate = Math.max(0, Math.min(1, patch.forcedRepaymentRate));
    }
    if (typeof patch.moneyToTicketCost === "number" && Number.isFinite(patch.moneyToTicketCost)) {
      room.settings.moneyToTicketCost = Math.max(1, Math.min(50000, Math.floor(patch.moneyToTicketCost)));
    }
    if (typeof patch.ticketToMoneyValue === "number" && Number.isFinite(patch.ticketToMoneyValue)) {
      room.settings.ticketToMoneyValue = Math.max(1, Math.min(50000, Math.floor(patch.ticketToMoneyValue)));
    }
    if (typeof patch.bankInitialMoney === "number" && Number.isFinite(patch.bankInitialMoney)) {
      room.settings.bankInitialMoney = Math.max(0, Math.min(999999, Math.floor(patch.bankInitialMoney)));
    }
    if (typeof patch.bankInitialTickets === "number" && Number.isFinite(patch.bankInitialTickets)) {
      room.settings.bankInitialTickets = Math.max(0, Math.min(999, Math.floor(patch.bankInitialTickets)));
    }
    if (typeof patch.jailTurns === "number" && Number.isFinite(patch.jailTurns)) {
      room.settings.jailTurns = Math.max(1, Math.min(10, Math.floor(patch.jailTurns)));
    }
    if (typeof patch.hospitalTurns === "number" && Number.isFinite(patch.hospitalTurns)) {
      room.settings.hospitalTurns = Math.max(1, Math.min(10, Math.floor(patch.hospitalTurns)));
    }
    if (typeof patch.bailCost === "number" && Number.isFinite(patch.bailCost)) {
      room.settings.bailCost = Math.max(0, Math.min(50000, Math.floor(patch.bailCost)));
    }
    if (typeof patch.treatmentCost === "number" && Number.isFinite(patch.treatmentCost)) {
      room.settings.treatmentCost = Math.max(0, Math.min(50000, Math.floor(patch.treatmentCost)));
    }
    if (Array.isArray(patch.rentMultipliers) && patch.rentMultipliers.length > 0) {
      room.settings.rentMultipliers = patch.rentMultipliers
        .slice(0, 4)
        .map((value) => Math.max(0.1, Math.min(50, Number(value) || 1)));
    }
    if (typeof patch.enableSpecialCards === "boolean") {
      room.settings.enableSpecialCards = patch.enableSpecialCards;
    }
    if (typeof patch.enableRandomAnnouncements === "boolean") {
      room.settings.enableRandomAnnouncements = patch.enableRandomAnnouncements;
    }
    if (typeof patch.lotteryMaxTickets === "number" && Number.isFinite(patch.lotteryMaxTickets)) {
      room.settings.lotteryMaxTickets = Math.max(1, Math.min(99, Math.floor(patch.lotteryMaxTickets)));
    }
    if (typeof patch.skillShopOfferCount === "number" && Number.isFinite(patch.skillShopOfferCount)) {
      room.settings.skillShopOfferCount = Math.max(1, Math.min(20, Math.floor(patch.skillShopOfferCount)));
    }
    if (typeof patch.allowFreeSkillCards === "boolean") {
      room.settings.allowFreeSkillCards = patch.allowFreeSkillCards;
    }
    if (typeof patch.startTileId === "string" && START_TILE_IDS.includes(patch.startTileId as TileId)) {
      room.settings.startTileId = patch.startTileId as TileId;
    }
    if (typeof patch.useSharedStartTile === "boolean") {
      room.settings.useSharedStartTile = patch.useSharedStartTile;
    }
    if (patch.lapRewardMode === "go" || patch.lapRewardMode === "home") {
      room.settings.lapRewardMode = patch.lapRewardMode;
    }
    if (typeof patch.turnDurationSeconds === "number" && Number.isFinite(patch.turnDurationSeconds)) {
      room.settings.turnDurationSeconds = Math.max(15, Math.min(300, Math.floor(patch.turnDurationSeconds)));
    }
    if (
      patch.durationMode === "short_3_months" ||
      patch.durationMode === "standard_1_year" ||
      patch.durationMode === "long_2_years"
    ) {
      room.settings.durationMode = patch.durationMode;
      room.settings.endCondition = "rounds";
    }

    this.resetLobbyReadiness(room);
    return { ok: true, room, playerId };
  }

  addAiPlayer(roomId: string, hostPlayerId: string, nickname?: string): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== hostPlayerId) {
      return { ok: false, error: "只有房主可以添加 AI 补位。" };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "游戏开始后不能添加 AI 补位。" };
    }
    if (room.players.length >= MAX_ROOM_PLAYERS) {
      return { ok: false, error: "房间已满，不能继续添加 AI。" };
    }

    const botId = makeId("AI", 8);
    const nextIndex = room.players.length;
    const occupiedAvatarIds = new Set(room.players.map((player) => player.selectedAvatarId).filter(Boolean));
    const occupiedNames = new Set(room.players.map((player) => player.nickname));
    const selectedAvatarId =
      DEFAULT_AVATAR_IDS.find((avatarId) => !occupiedAvatarIds.has(avatarId)) ??
      DEFAULT_AVATAR_IDS[nextIndex % DEFAULT_AVATAR_IDS.length];
    const defaultName =
      AI_NICKNAMES.find((candidate) => !occupiedNames.has(candidate)) ??
      `AI 补位 ${room.players.filter((player) => player.isBot).length + 1}`;
    const bot: RoomMember = {
      id: botId,
      nickname: sanitizeNickname(nickname || defaultName),
      color: firstAvailablePlayerColor(room.players),
      avatar: "AI",
      selectedAvatarId,
      selectedStartTileId:
        this.firstAvailableStartTile(room.players) ??
        START_TILE_IDS[nextIndex % START_TILE_IDS.length] ??
        START_TILE_IDS[0],
      isBot: true,
      ready: true,
      connected: true,
      socketId: `bot:${botId}`
    };

    room.players.push(bot);
    this.resetLobbyReadiness(room);
    return { ok: true, room, playerId: hostPlayerId, targetPlayerId: bot.id };
  }

  removeAiPlayer(roomId: string, hostPlayerId: string, targetPlayerId: string): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== hostPlayerId) {
      return { ok: false, error: "只有房主可以移除 AI 补位。" };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "游戏开始后不能移除 AI 补位。" };
    }
    const targetIndex = room.players.findIndex((player) => player.id === targetPlayerId);
    const target = room.players[targetIndex];
    if (!target || !target.isBot) {
      return { ok: false, error: "只能移除 AI 补位玩家。" };
    }

    room.players.splice(targetIndex, 1);
    this.resetLobbyReadiness(room);
    return { ok: true, room, playerId: hostPlayerId, targetPlayerId };
  }

  joinRoom(
    roomId: string,
    nickname: string,
    socketId: string,
    playerId?: string,
    reconnectToken?: string
  ): RoomResult {
    const room = this.store.get(roomId.trim().toUpperCase());
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (playerId && room.kickedPlayerIds?.includes(playerId)) {
      return { ok: false, error: "你已被移出该房间。" };
    }

    if (playerId) {
      const existing = room.players.find((player) => player.id === playerId);
      if (!existing || existing.isBot) {
        return { ok: false, error: "重连身份无效，请重新加入房间。" };
      }
      if (
        typeof reconnectToken !== "string" ||
        !existing.reconnectTokenHash ||
        !reconnectTokenMatches(reconnectToken, existing.reconnectTokenHash)
      ) {
        return { ok: false, error: "重连凭证无效，请重新加入房间。" };
      }
      const previousSocketId = existing.socketId !== socketId ? existing.socketId : null;
      existing.connected = true;
      existing.socketId = socketId;
      existing.nickname = sanitizeNickname(nickname || existing.nickname);
      this.syncGamePlayer(room, existing.id, { connected: true, nickname: existing.nickname });
      const result: RoomResult = { ok: true, room, playerId: existing.id, reconnectToken };
      return previousSocketId ? { ...result, previousSocketId } : result;
    }

    if (room.status !== "lobby") {
      return { ok: false, error: "Game already started. Reconnect with the original player id." };
    }
    if (room.players.length >= MAX_ROOM_PLAYERS) {
      return { ok: false, error: "Room is full." };
    }

    const nextIndex = room.players.length;
    const newPlayerId = makeId("P", 8);
    const reconnectCredential = createReconnectCredential();
    const occupiedAvatarIds = new Set(room.players.map((player) => player.selectedAvatarId).filter(Boolean));
    const selectedAvatarId =
      DEFAULT_AVATAR_IDS.find((avatarId) => !occupiedAvatarIds.has(avatarId)) ??
      DEFAULT_AVATAR_IDS[nextIndex % DEFAULT_AVATAR_IDS.length];
    room.players.push({
      id: newPlayerId,
      nickname: sanitizeNickname(nickname),
      color: firstAvailablePlayerColor(room.players),
      avatar: PLAYER_AVATARS[nextIndex % PLAYER_AVATARS.length] ?? "Pilot",
      selectedAvatarId,
      selectedStartTileId: this.firstAvailableStartTile(room.players) ?? START_TILE_IDS[nextIndex % START_TILE_IDS.length] ?? START_TILE_IDS[0],
      isBot: false,
      reconnectTokenHash: reconnectCredential.hash,
      ready: false,
      connected: true,
      socketId
    });

    return { ok: true, room, playerId: newPlayerId, reconnectToken: reconnectCredential.token };
  }

  selectAvatar(roomId: string, playerId: string, avatarId: AvatarId): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "游戏开始后不能更换角色。" };
    }
    if (!DEFAULT_AVATAR_IDS.includes(avatarId)) {
      return { ok: false, error: "角色不存在。" };
    }
    const player = room.players.find((item) => item.id === playerId);
    if (!player) {
      return { ok: false, error: "Player not found." };
    }
    const occupiedBy = room.players.find((item) => item.id !== playerId && item.selectedAvatarId === avatarId);
    if (occupiedBy) {
      return { ok: false, error: `该角色已被 ${occupiedBy.nickname} 选择，请重新选择。` };
    }

    player.selectedAvatarId = avatarId;
    player.ready = false;
    this.syncGamePlayer(room, player.id, { selectedAvatarId: avatarId });
    return { ok: true, room, playerId };
  }

  selectStartTile(roomId: string, playerId: string, tileId: TileId): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "游戏开始后不能更换出生点。" };
    }
    if (!START_TILE_IDS.includes(tileId)) {
      return { ok: false, error: "出生点不存在。" };
    }
    const player = room.players.find((item) => item.id === playerId);
    if (!player) {
      return { ok: false, error: "Player not found." };
    }
    const occupiedBy = room.players.find((item) => item.id !== playerId && item.selectedStartTileId === tileId);
    if (occupiedBy) {
      return { ok: false, error: `该出生点已被 ${occupiedBy.nickname} 选择。` };
    }

    player.selectedStartTileId = tileId;
    player.ready = false;
    return { ok: true, room, playerId };
  }

  kickPlayer(roomId: string, hostPlayerId: string, targetPlayerId: string): RoomResult {
    const room = this.store.get(roomId.trim().toUpperCase());
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== hostPlayerId) {
      return { ok: false, error: "只有房主可以踢出成员。" };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "游戏已开始，不能踢出玩家。" };
    }
    if (targetPlayerId === hostPlayerId) {
      return { ok: false, error: "房主不能踢出自己。" };
    }

    const targetIndex = room.players.findIndex((player) => player.id === targetPlayerId);
    if (targetIndex < 0) {
      return { ok: false, error: "目标玩家不在房间中。" };
    }

    const [target] = room.players.splice(targetIndex, 1);
    if (!target) {
      return { ok: false, error: "目标玩家不在房间中。" };
    }

    room.kickedPlayerIds = [...new Set([...(room.kickedPlayerIds ?? []), target.id])];
    this.resetLobbyReadiness(room);

    return {
      ok: true,
      room,
      playerId: hostPlayerId,
      targetPlayerId: target.id,
      targetSocketId: target.socketId
    };
  }

  setReady(roomId: string, playerId: string, ready: boolean): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "Readiness can only change in the lobby." };
    }
    const player = room.players.find((item) => item.id === playerId);
    if (!player) {
      return { ok: false, error: "Player not found." };
    }
    player.ready = ready;
    return { ok: true, room, playerId };
  }

  startGame(roomId: string, playerId: string): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== playerId) {
      return { ok: false, error: "Only the host can start the game." };
    }
    if (room.status !== "lobby") {
      return { ok: false, error: "The game has already started." };
    }
    if (room.players.length < MIN_ROOM_PLAYERS || room.players.length > MAX_ROOM_PLAYERS) {
      return { ok: false, error: `The game needs ${MIN_ROOM_PLAYERS} to ${MAX_ROOM_PLAYERS} players.` };
    }
    if (!room.players.every((player) => player.ready)) {
      return { ok: false, error: "All players must be ready first." };
    }

    this.ensureUniqueStartTiles(room);
    room.status = "playing";
    room.game = createGameState(room.id, this.toRoomPlayers(room), room.settings);
    return { ok: true, room, playerId };
  }

  restartGame(roomId: string, playerId: string): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    if (room.hostId !== playerId) {
      return { ok: false, error: "Only the host can restart the room." };
    }
    if (room.status !== "ended" && room.game?.status !== "ended") {
      return { ok: false, error: "The game has not ended yet." };
    }

    room.status = "lobby";
    delete room.game;
    this.resetLobbyReadiness(room);
    return { ok: true, room, playerId };
  }

  appendChat(roomId: string, playerId: string, message: string): RoomResult {
    const room = this.store.get(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }
    const player = room.players.find((item) => item.id === playerId);
    if (!player) {
      return { ok: false, error: "Player not found." };
    }
    const cleanMessage = message.trim().slice(0, 180);
    if (!cleanMessage) {
      return { ok: false, error: "Message is empty." };
    }
    const chat: ChatMessage = {
      id: makeId("C", 10),
      playerId,
      nickname: player.nickname,
      message: cleanMessage,
      createdAt: Date.now()
    };
    room.chat.push(chat);
    room.chat = room.chat.slice(-80);
    return { ok: true, room, playerId };
  }

  markDisconnected(socketId: string): Array<{ room: RoomRecord; resumeTurnTimer: boolean }> {
    const changedRooms: Array<{ room: RoomRecord; resumeTurnTimer: boolean }> = [];
    for (const room of this.store.list()) {
      const player = room.players.find((item) => item.socketId === socketId);
      if (!player) {
        continue;
      }
      player.connected = false;
      this.syncGamePlayer(room, player.id, { connected: false });
      const wasWaitingForMonthlySettlement = Boolean(
        room.game?.pendingMonthlySettlement?.waitingPlayerIds.includes(player.id)
      );
      if (room.game && wasWaitingForMonthlySettlement) {
        closeMonthlySettlement(room.game, player.id);
      }
      changedRooms.push({
        room,
        resumeTurnTimer: wasWaitingForMonthlySettlement && !room.game?.pendingMonthlySettlement
      });
    }
    return changedRooms;
  }

  getRoom(roomId: string): RoomRecord | undefined {
    return this.store.get(roomId);
  }

  toPublicRoom(room: RoomRecord): RoomPublicState {
    return {
      id: room.id,
      hostId: room.hostId,
      status: room.status,
      players: this.toRoomPlayers(room),
      avatarLocks: this.avatarLocks(room),
      settings: room.settings,
      chat: room.chat,
      createdAt: room.createdAt
    };
  }

  getGame(roomId: string): GameState | null {
    return this.store.get(roomId)?.game ?? null;
  }

  private syncGamePlayer(
    room: RoomRecord,
    playerId: string,
    patch: Partial<Pick<RoomMember, "connected" | "nickname" | "selectedAvatarId">>
  ): void {
    const gamePlayer = room.game?.players.find((player) => player.id === playerId);
    if (!gamePlayer) {
      return;
    }
    if (patch.connected !== undefined) {
      gamePlayer.connected = patch.connected;
    }
    if (patch.nickname !== undefined) {
      gamePlayer.nickname = patch.nickname;
    }
    if (patch.selectedAvatarId !== undefined) {
      gamePlayer.selectedAvatarId = patch.selectedAvatarId;
    }
  }

  private avatarLocks(room: RoomRecord): RoomPublicState["avatarLocks"] {
    return room.players.reduce<RoomPublicState["avatarLocks"]>((locks, player) => {
      if (player.selectedAvatarId) {
        locks[player.selectedAvatarId] = player.id;
      }
      return locks;
    }, {});
  }

  private firstAvailableStartTile(players: Array<{ selectedStartTileId?: string | undefined }>): TileId | undefined {
    const occupied = new Set(players.map((player) => player.selectedStartTileId).filter(Boolean));
    return START_TILE_IDS.find((tileId) => !occupied.has(tileId));
  }

  private ensureUniqueStartTiles(room: RoomRecord): void {
    const occupied = new Set<string>();
    for (const player of room.players) {
      const selected = player.selectedStartTileId;
      if (selected && START_TILE_IDS.includes(selected) && !occupied.has(selected)) {
        occupied.add(selected);
        continue;
      }
      const fallback = START_TILE_IDS.find((tileId) => !occupied.has(tileId)) ?? START_TILE_IDS[0] ?? "tile-00";
      player.selectedStartTileId = fallback;
      occupied.add(fallback);
    }
  }

  private toRoomPlayers(room: RoomRecord): RoomPlayer[] {
    return room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      color: player.color,
      avatar: player.avatar,
      selectedAvatarId: player.selectedAvatarId,
      selectedStartTileId: player.selectedStartTileId,
      isBot: player.isBot,
      ready: player.ready,
      connected: player.connected,
      isHost: player.id === room.hostId
    }));
  }

  private resetLobbyReadiness(room: RoomRecord): void {
    for (const player of room.players) {
      player.ready = Boolean(player.isBot);
    }
  }
}
