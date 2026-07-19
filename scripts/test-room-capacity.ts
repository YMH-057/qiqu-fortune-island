import assert from "node:assert/strict";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS, START_TILE_OPTIONS } from "@monopoly/shared";
import { getPlayerTokenOffset, MAX_STACKED_PLAYER_TOKENS } from "../client/src/game/playerTokenLayout";
import { RoomManager } from "../server/src/rooms/RoomManager";

function requireValue<T>(value: T | undefined, message: string): T {
  assert.ok(value, message);
  return value;
}

function testEightPlayerRoomWithAiFill() {
  assert.equal(MIN_ROOM_PLAYERS, 2);
  assert.equal(MAX_ROOM_PLAYERS, 8);
  assert.ok(START_TILE_OPTIONS.length >= MAX_ROOM_PLAYERS);

  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-host");
  assert.equal(created.ok, true);
  const room = requireValue(created.room, "创建房间后应返回房间");
  const hostId = requireValue(created.playerId, "创建房间后应返回房主 id");

  for (let index = 1; index < MAX_ROOM_PLAYERS; index += 1) {
    const result = manager.addAiPlayer(room.id, hostId, `AI ${index}`);
    assert.equal(result.ok, true, `第 ${index} 个 AI 应能加入房间`);
  }

  assert.equal(room.players.length, MAX_ROOM_PLAYERS);
  assert.equal(new Set(room.players.map((player) => player.selectedAvatarId)).size, MAX_ROOM_PLAYERS);
  assert.equal(new Set(room.players.map((player) => player.selectedStartTileId)).size, MAX_ROOM_PLAYERS);

  const overflow = manager.addAiPlayer(room.id, hostId, "超额 AI");
  assert.equal(overflow.ok, false);
  assert.match(overflow.error ?? "", /房间已满/);

  assert.equal(manager.setReady(room.id, hostId, true).ok, true);
  const started = manager.startGame(room.id, hostId);
  assert.equal(started.ok, true);
  assert.equal(started.room?.game?.players.length, MAX_ROOM_PLAYERS);
  assert.equal(started.room?.game?.players.filter((player) => player.isBot).length, MAX_ROOM_PLAYERS - 1);
}

function testHumanJoinRespectsSharedCapacity() {
  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-0");
  const room = requireValue(created.room, "创建房间后应返回房间");

  for (let index = 1; index < MAX_ROOM_PLAYERS; index += 1) {
    const joined = manager.joinRoom(room.id, `玩家 ${index}`, `socket-${index}`);
    assert.equal(joined.ok, true);
  }

  assert.equal(room.players.length, MAX_ROOM_PLAYERS);
  const overflow = manager.joinRoom(room.id, "第九人", "socket-9");
  assert.equal(overflow.ok, false);
  assert.match(overflow.error ?? "", /Room is full/);
}

function testEightPlayersHaveDistinctTokenOffsets() {
  assert.equal(MAX_STACKED_PLAYER_TOKENS, MAX_ROOM_PLAYERS);
  const offsets = Array.from({ length: MAX_ROOM_PLAYERS }, (_, index) => getPlayerTokenOffset(index));
  assert.equal(new Set(offsets.map((offset) => `${offset.x},${offset.y}`)).size, MAX_ROOM_PLAYERS);
}

function testReplacementPlayerKeepsColorUnique() {
  const manager = new RoomManager();
  const created = manager.createRoom("房主", "socket-host");
  const room = requireValue(created.room, "创建房间后应返回房间");
  const hostId = requireValue(created.playerId, "创建房间后应返回房主 id");

  const first = manager.addAiPlayer(room.id, hostId);
  const middle = manager.addAiPlayer(room.id, hostId);
  manager.addAiPlayer(room.id, hostId);
  assert.equal(first.ok, true);
  assert.equal(middle.ok, true);
  assert.equal(manager.removeAiPlayer(room.id, hostId, requireValue(middle.targetPlayerId, "应返回中间 AI id")).ok, true);
  assert.equal(manager.addAiPlayer(room.id, hostId).ok, true);

  assert.equal(new Set(room.players.map((player) => player.color)).size, room.players.length);
}

testEightPlayerRoomWithAiFill();
testHumanJoinRespectsSharedCapacity();
testEightPlayersHaveDistinctTokenOffsets();
testReplacementPlayerKeepsColorUnique();

console.log("Room capacity tests passed.");
