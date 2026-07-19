import assert from "node:assert/strict";
import { RoomManager } from "../server/src/rooms/RoomManager";
import { isCurrentRoomSocketSession } from "../server/src/socket";
import { shouldDiscardReconnectSession } from "../client/src/game/sessionPolicy";

function requireValue<T>(value: T | undefined, message: string): T {
  assert.ok(value, message);
  return value;
}

function testReconnectRequiresPrivateToken() {
  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-host");
  const room = requireValue(created.room, "创建房间后应返回房间");
  const hostId = requireValue(created.playerId, "创建房间后应返回房主 id");
  const reconnectToken = requireValue(created.reconnectToken, "创建房间后应返回私有重连令牌");

  assert.equal((manager.toPublicRoom(room).players[0] as Record<string, unknown>).reconnectToken, undefined);
  assert.equal((manager.toPublicRoom(room).players[0] as Record<string, unknown>).reconnectTokenHash, undefined);

  const missingToken = manager.joinRoom(room.id, "冒充者", "socket-attacker", hostId);
  assert.equal(missingToken.ok, false);

  const wrongToken = manager.joinRoom(room.id, "冒充者", "socket-attacker", hostId, "wrong-token");
  assert.equal(wrongToken.ok, false);

  const reconnected = manager.joinRoom(room.id, "房主", "socket-reconnected", hostId, reconnectToken);
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.playerId, hostId);
  assert.equal(reconnected.reconnectToken, reconnectToken);
  assert.equal(reconnected.previousSocketId, "socket-host");
  assert.equal(isCurrentRoomSocketSession(room, hostId, "socket-host"), false);
  assert.equal(isCurrentRoomSocketSession(room, hostId, "socket-reconnected"), true);
}

function testBotIdentityCannotReconnect() {
  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-host");
  const room = requireValue(created.room, "创建房间后应返回房间");
  const hostId = requireValue(created.playerId, "创建房间后应返回房主 id");
  const added = manager.addAiPlayer(room.id, hostId);
  const botId = requireValue(added.targetPlayerId, "添加 AI 后应返回 AI id");

  const result = manager.joinRoom(room.id, "冒充 AI", "socket-attacker", botId, "anything");
  assert.equal(result.ok, false);
}

function testMonthlySettlementReleasesDisconnectedPlayers() {
  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-host");
  const room = requireValue(created.room, "创建房间后应返回房间");
  const hostId = requireValue(created.playerId, "创建房间后应返回房主 id");
  const joined = manager.joinRoom(room.id, "玩家二", "socket-guest");
  const guestId = requireValue(joined.playerId, "加入房间后应返回玩家 id");

  assert.equal(manager.setReady(room.id, hostId, true).ok, true);
  assert.equal(manager.setReady(room.id, guestId, true).ok, true);
  assert.equal(manager.startGame(room.id, hostId).ok, true);
  const game = requireValue(room.game, "开始游戏后应创建游戏状态");
  game.pendingMonthlySettlement = {
    id: "monthly-test",
    settlements: [],
    waitingPlayerIds: [hostId, guestId],
    createdAt: Date.now()
  };

  manager.markDisconnected("socket-guest");
  assert.deepEqual(game.pendingMonthlySettlement?.waitingPlayerIds, [hostId]);

  const beforeClose = Date.now();
  const disconnected = manager.markDisconnected("socket-host");
  assert.equal(game.pendingMonthlySettlement, undefined);
  assert.ok(game.turnEndsAt > beforeClose);
  assert.equal(disconnected[0]?.resumeTurnTimer, true);
}

function testReconnectCredentialErrorsDiscardSavedSession() {
  assert.equal(shouldDiscardReconnectSession("重连凭证无效，请重新加入房间。"), true);
  assert.equal(shouldDiscardReconnectSession("重连身份无效，请重新加入房间。"), true);
  assert.equal(shouldDiscardReconnectSession("你已被移出该房间。"), true);
  assert.equal(shouldDiscardReconnectSession("Room is full."), false);
}

testReconnectRequiresPrivateToken();
testBotIdentityCannotReconnect();
testMonthlySettlementReleasesDisconnectedPlayers();
testReconnectCredentialErrorsDiscardSavedSession();

console.log("Room security tests passed.");
