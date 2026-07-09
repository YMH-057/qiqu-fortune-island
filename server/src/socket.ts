import type {
  ClientToServerEvents,
  DebugCommandAck,
  GameState,
  ServerToClientEvents,
  SocketAck,
  StockId
} from "@monopoly/shared";
import type { Server, Socket } from "socket.io";
import {
  type ActionOutcome,
  autoPlayTimedOutTurn,
  buySkillCard,
  buyProperty,
  buyStock,
  cancelPendingAction,
  cancelPortalChoice,
  cancelStockOrderAction,
  choosePathDirection,
  choosePortalDestination,
  closeMonthlySettlement,
  closeSkillShop,
  declareBankruptcy,
  endTurn,
  recycleSkillCard,
  rollDice,
  sellStock,
  skipLottery,
  submitStockOrderAction,
  upgradeProperty,
  useSkillCard
} from "./game/actions";
import { executeDebugCommand, getDebugCatalog } from "./game/debug";
import { exchangeMoneyToTickets, exchangeTicketsToMoney } from "./game/exchange";
import { borrowCredit, depositMoney, leaveDetention, repayCredit, withdrawMoney } from "./game/bank";
import { buyLotteryTicket as buyLotteryTickets } from "./game/lottery";
import { mortgageProperty, redeemMortgage } from "./game/mortgage";
import { RoomManager } from "./rooms/RoomManager";
import type { RoomRecord } from "./rooms/RoomStore";

interface InterServerEvents {}

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

type BroadcastOutcome = ActionOutcome;

const turnTimers = new Map<string, NodeJS.Timeout>();

function emitError(socket: GameSocket, message: string): void {
  socket.emit("errorMessage", { message });
}

function ackError(ack: ((response: SocketAck) => void) | undefined, message: string): void {
  ack?.({ ok: false, error: message });
}

function attachSocketToRoom(socket: GameSocket, room: RoomRecord, playerId: string): void {
  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.playerId = playerId;
}

function syncRoomStatus(room: RoomRecord): void {
  if (room.game?.status === "ended") {
    room.status = "ended";
  }
}

function emitRoom(io: GameServer, manager: RoomManager, room: RoomRecord): void {
  syncRoomStatus(room);
  io.to(room.id).emit("roomUpdated", manager.toPublicRoom(room));
}

function gameForPlayer(game: GameState, playerId: string): GameState {
  return {
    ...game,
    marketSignals: (game.marketSignals ?? []).filter(
      (signal) => signal.isPublic || signal.ownerPlayerId === playerId
    )
  };
}

function emitGame(io: GameServer, room: RoomRecord): void {
  if (room.game) {
    for (const player of room.players) {
      io.to(player.socketId).emit("gameStateUpdated", gameForPlayer(room.game, player.id));
    }
  }
}

function emitGameStarted(io: GameServer, room: RoomRecord): void {
  if (!room.game) {
    return;
  }
  for (const player of room.players) {
    const game = gameForPlayer(room.game, player.id);
    io.to(player.socketId).emit("gameStarted", game);
    io.to(player.socketId).emit("gameStateUpdated", game);
  }
}

function clearTurnTimer(roomId: string): void {
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomId);
  }
}

function scheduleTurnTimer(io: GameServer, manager: RoomManager, room: RoomRecord): void {
  clearTurnTimer(room.id);
  const game = room.game;
  if (!game || game.status !== "playing" || game.phase === "gameOver" || game.pendingMonthlySettlement) {
    return;
  }
  const delay = Math.max(250, game.turnEndsAt - Date.now());
  const timer = setTimeout(() => {
    const freshRoom = manager.getRoom(room.id);
    const freshGame = freshRoom?.game;
    if (!freshRoom || !freshGame || freshGame.status !== "playing") {
      clearTurnTimer(room.id);
      return;
    }
    const timedOutPlayerId = freshGame.turnOrder[freshGame.currentTurnIndex];
    const outcome = autoPlayTimedOutTurn(freshGame);
    if (!outcome.ok) {
      scheduleTurnTimer(io, manager, freshRoom);
      return;
    }
    broadcastOutcome(io, manager, freshRoom, outcome, timedOutPlayerId);
  }, delay);
  turnTimers.set(room.id, timer);
}

function broadcastOutcome(
  io: GameServer,
  manager: RoomManager,
  room: RoomRecord,
  outcome: BroadcastOutcome,
  dicePlayerId?: string
): void {
  if (!outcome.ok) {
    return;
  }

  if (outcome.dice && dicePlayerId) {
    io.to(room.id).emit("diceRolled", { playerId: dicePlayerId, value: outcome.dice });
  }

  for (const movement of outcome.movements) {
    io.to(room.id).emit("playerMoved", movement);
  }

  if (outcome.tileEvent) {
    io.to(room.id).emit("tileEventTriggered", outcome.tileEvent);
  }

  if (outcome.pathChoice) {
    io.to(room.id).emit("pathChoiceRequired", outcome.pathChoice);
  }

  for (const decision of outcome.junctionDirections ?? []) {
    io.to(room.id).emit("junctionDirectionDecided", decision);
  }

  if (outcome.portalChoice) {
    io.to(room.id).emit("portalChoiceRequired", outcome.portalChoice);
  }

  if (outcome.portalCanceled) {
    io.to(room.id).emit("portalChoiceCanceled", outcome.portalCanceled);
  }

  if (outcome.lotteryPanel) {
    io.to(room.id).emit("tileEventTriggered", {
      id: `lottery-panel-${Date.now()}`,
      playerId: outcome.lotteryPanel.playerId,
      tileId: outcome.lotteryPanel.tileId,
      title: "彩票店",
      message: "彩票面板已打开。",
      tone: "neutral"
    });
  }

  if (outcome.luckCard) {
    io.to(room.id).emit("luckCardDrawn", outcome.luckCard);
  }

  if (outcome.skillShop) {
    io.to(room.id).emit("skillShopUpdated", outcome.skillShop);
  }

  if (outcome.skillBought) {
    io.to(room.id).emit("skillCardBought", outcome.skillBought);
  }

  if (outcome.skillRecycled) {
    io.to(room.id).emit("skillCardRecycled", outcome.skillRecycled);
  }

  if (outcome.skillUsed) {
    io.to(room.id).emit("skillCardUsed", outcome.skillUsed);
  }

  if (outcome.skillMessage) {
    io.to(room.id).emit("skillEffectResolved", outcome.skillMessage);
  }

  for (const notice of outcome.ticketsUpdated ?? []) {
    io.to(room.id).emit("playerTicketsUpdated", notice);
  }

  for (const movement of outcome.teleports ?? []) {
    io.to(room.id).emit("playerTeleported", movement);
  }

  if (outcome.stockTrade) {
    io.to(room.id).emit("stockTradeExecuted", outcome.stockTrade);
  }

  if (outcome.stockAccount) {
    io.to(room.id).emit("stockAccountUpdated", outcome.stockAccount);
  }

  if (outcome.stockTradeFailed) {
    io.to(room.id).emit("stockTradeFailed", outcome.stockTradeFailed);
  }

  if (outcome.stockOrder) {
    const target = room.players.find((player) => player.id === outcome.stockOrder?.playerId);
    const message = {
      playerId: outcome.stockOrder.playerId,
      order: outcome.stockOrder.order
    };
    const ordersMessage = {
      playerId: outcome.stockOrder.playerId,
      orders: outcome.stockOrder.account.pendingOrders
    };
    if (target) {
      io.to(target.socketId).emit("stockOrderSubmitted", message);
      io.to(target.socketId).emit("pendingStockOrdersUpdated", ordersMessage);
    }
  }

  if (outcome.stockOrderCanceled) {
    io.to(room.id).emit("stockOrderCanceled", {
      playerId: outcome.stockOrderCanceled.playerId,
      orderId: outcome.stockOrderCanceled.orderId
    });
    io.to(room.id).emit("pendingStockOrdersUpdated", {
      playerId: outcome.stockOrderCanceled.playerId,
      orders: outcome.stockOrderCanceled.account.pendingOrders
    });
  }

  if (outcome.stockSettlement) {
    io.to(room.id).emit("stockSettlementCompleted", { records: outcome.stockSettlement.records });
  }

  if (outcome.bankSettlements && outcome.bankSettlements.length > 0) {
    io.to(room.id).emit("monthlyBankSettlement", { settlements: outcome.bankSettlements });
  }

  if (outcome.stockUpdated && room.game) {
    io.to(room.id).emit("stockMarketUpdated", room.game.stocks);
  }

  for (const announcement of outcome.marketAnnouncements ?? []) {
    io.to(room.id).emit("marketAnnouncementCreated", announcement);
  }

  for (const privateSignal of outcome.privateSignals ?? []) {
    const target = room.players.find((player) => player.id === privateSignal.playerId);
    if (target) {
      io.to(target.socketId).emit("privateMarketSignal", privateSignal);
    }
  }

  const seenBankrupt = new Set<string>();
  for (const notice of outcome.bankrupted) {
    if (seenBankrupt.has(notice.playerId)) {
      continue;
    }
    seenBankrupt.add(notice.playerId);
    io.to(room.id).emit("playerBankrupted", notice);
  }

  if (outcome.gameEnded && room.game) {
    syncRoomStatus(room);
    io.to(room.id).emit("gameEnded", {
      rankings: room.game.rankings,
      winnerId: room.game.winnerId
    });
    emitRoom(io, manager, room);
  }

  emitGame(io, room);
  scheduleTurnTimer(io, manager, room);
}

function getSessionRoom(
  socket: GameSocket,
  manager: RoomManager
): { room: RoomRecord; playerId: string } | { error: string } {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  if (!roomId || !playerId) {
    return { error: "Join a room first." };
  }
  const room = manager.getRoom(roomId);
  if (!room) {
    return { error: "Room not found." };
  }
  return { room, playerId };
}

function buildOtherPlayersHoldings(game: GameState, playerId: string): Parameters<ServerToClientEvents["otherPlayersHoldingsUpdated"]>[0] {
  return game.players
    .filter((player) => player.id !== playerId)
    .map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      holdings: Object.values(player.stockAccount.holdings).filter((holding): holding is NonNullable<typeof holding> => Boolean(holding)),
      totalMarketValue: player.stockAccount.totalMarketValue,
      totalUnrealizedProfit: player.stockAccount.totalUnrealizedProfit
    }));
}

export function registerSocketHandlers(io: GameServer): void {
  const manager = new RoomManager();

  io.on("connection", (socket) => {
    socket.on("createRoom", (payload, ack) => {
      const result = manager.createRoom(payload.nickname, socket.id);
      if (!result.ok || !result.room || !result.playerId) {
        ackError(ack, result.error ?? "Could not create room.");
        return;
      }

      attachSocketToRoom(socket, result.room, result.playerId);
      const roomPublic = manager.toPublicRoom(result.room);
      ack?.({ ok: true, room: roomPublic, playerId: result.playerId });
      socket.emit("roomUpdated", roomPublic);
    });

    socket.on("joinRoom", (payload, ack) => {
      const result = manager.joinRoom(payload.roomId, payload.nickname, socket.id, payload.playerId);
      if (!result.ok || !result.room || !result.playerId) {
        ackError(ack, result.error ?? "Could not join room.");
        return;
      }

      attachSocketToRoom(socket, result.room, result.playerId);
      const roomPublic = manager.toPublicRoom(result.room);
      const response: SocketAck = {
        ok: true,
        room: roomPublic,
        playerId: result.playerId
      };
      if (result.room.game) {
        response.game = gameForPlayer(result.room.game, result.playerId);
      }
      ack?.(response);
      emitRoom(io, manager, result.room);
      if (result.room.game) {
        socket.emit("gameStateUpdated", gameForPlayer(result.room.game, result.playerId));
      }
    });

    socket.on("kickPlayer", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.kickPlayer(payload.roomId || session.room.id, session.playerId, payload.targetPlayerId);
      if (!result.ok || !result.room || !result.targetPlayerId) {
        emitError(socket, result.error ?? "无法踢出该玩家。");
        return;
      }

      const message = "你已被房主移出房间。";
      if (result.targetSocketId) {
        const targetSocket = io.sockets.sockets.get(result.targetSocketId);
        targetSocket?.emit("playerKicked", {
          roomId: result.room.id,
          playerId: result.targetPlayerId,
          message
        });
        targetSocket?.leave(result.room.id);
        if (targetSocket) {
          delete targetSocket.data.roomId;
          delete targetSocket.data.playerId;
        }
      }

      emitRoom(io, manager, result.room);
      io.to(result.room.id).emit("roomSettingsUpdated", result.room.settings);
    });

    socket.on("selectAvatar", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.selectAvatar(session.room.id, session.playerId, payload.avatarId);
      if (!result.ok || !result.room) {
        const message = result.error ?? "无法选择该角色。";
        socket.emit("avatarSelectionFailed", { message });
        emitError(socket, message);
        return;
      }
      const roomPublic = manager.toPublicRoom(result.room);
      io.to(result.room.id).emit("roomUpdated", roomPublic);
      io.to(result.room.id).emit("avatarSelectionUpdated", { room: roomPublic });
    });

    socket.on("selectStartTile", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.selectStartTile(session.room.id, session.playerId, payload.tileId);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "无法选择该出生点。");
        return;
      }
      emitRoom(io, manager, result.room);
    });

    socket.on("updateRoomSettings", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.updateSettings(session.room.id, session.playerId, payload);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "Could not update settings.");
        return;
      }
      emitRoom(io, manager, result.room);
      io.to(result.room.id).emit("roomSettingsUpdated", result.room.settings);
    });

    socket.on("setReady", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.setReady(session.room.id, session.playerId, payload.ready);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "Could not update readiness.");
        return;
      }
      emitRoom(io, manager, result.room);
    });

    socket.on("updateSettings", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.updateSettings(session.room.id, session.playerId, payload);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "Could not update settings.");
        return;
      }
      emitRoom(io, manager, result.room);
    });

    socket.on("startGame", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.startGame(session.room.id, session.playerId);
      if (!result.ok || !result.room?.game) {
        emitError(socket, result.error ?? "Could not start game.");
        return;
      }
      emitRoom(io, manager, result.room);
      emitGameStarted(io, result.room);
      scheduleTurnTimer(io, manager, result.room);
    });

    socket.on("restartGame", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.restartGame(session.room.id, session.playerId);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "Could not restart the room.");
        return;
      }
      clearTurnTimer(result.room.id);
      emitRoom(io, manager, result.room);
    });

    socket.on("debugCommand", (payload, ack) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        const message = session.error;
        ack?.({ ok: false, error: message });
        emitError(socket, message);
        return;
      }
      if (session.room.hostId !== session.playerId) {
        const message = "只有房主可以使用管理员模式。";
        ack?.({ ok: false, error: message });
        emitError(socket, message);
        return;
      }
      if (payload.kind === "getCatalog") {
        const response: DebugCommandAck = {
          ok: true,
          message: "管理员目录已准备好。",
          catalog: getDebugCatalog()
        };
        ack?.(response);
        return;
      }

      const game = session.room.game;
      if (!game) {
        const message = "游戏尚未开始。";
        ack?.({ ok: false, error: message });
        emitError(socket, message);
        return;
      }

      const result = executeDebugCommand(game, payload);
      if (!result.ok) {
        const message = result.error ?? "管理员操作执行失败。";
        ack?.({ ok: false, error: message });
        emitError(socket, message);
        return;
      }

      ack?.({ ok: true, message: result.message ?? "管理员操作已执行。" });
      if (result.outcome) {
        broadcastOutcome(io, manager, session.room, result.outcome);
        return;
      }

      if (result.stockUpdated && session.room.game) {
        io.to(session.room.id).emit("stockMarketUpdated", session.room.game.stocks);
      }
      emitGame(io, session.room);
      scheduleTurnTimer(io, manager, session.room);
    });

    socket.on("rollDice", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = rollDice(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not roll dice.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome, session.playerId);
    });

    socket.on("choosePathDirection", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = choosePathDirection(game, session.playerId, payload.tileId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not choose path.");
        return;
      }
      io.to(session.room.id).emit("pathChosen", { playerId: session.playerId, tileId: payload.tileId });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("choosePortalDestination", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = choosePortalDestination(game, session.playerId, payload.targetTileId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法选择传送目的地。");
        return;
      }
      io.to(session.room.id).emit("portalDestinationChosen", { playerId: session.playerId, targetTileId: payload.targetTileId });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("cancelPortalChoice", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = cancelPortalChoice(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法取消传送。");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("cancelPendingAction", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = cancelPendingAction(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法取消当前操作。");
        return;
      }
      io.to(session.room.id).emit("pendingActionCanceled", { playerId: session.playerId });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("buyProperty", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = buyProperty(game, session.playerId, payload.tileId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not buy property.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("upgradeProperty", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = upgradeProperty(game, session.playerId, payload.tileId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not upgrade property.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("mortgageProperty", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = mortgageProperty(game, session.playerId, payload.tileId);
      if (!result.ok) {
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("propertyMortgaged", { playerId: session.playerId, tileId: payload.tileId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("redeemMortgage", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = redeemMortgage(game, session.playerId, payload.tileId);
      if (!result.ok) {
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("propertyRedeemed", { playerId: session.playerId, tileId: payload.tileId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("exchangeMoneyToTickets", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = exchangeMoneyToTickets(game, session.playerId, payload.ticketAmount);
      if (!result.ok) {
        socket.emit("ticketExchangeFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("ticketExchangeCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("exchangeTicketsToMoney", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = exchangeTicketsToMoney(game, session.playerId, payload.ticketAmount);
      if (!result.ok) {
        socket.emit("ticketExchangeFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("ticketExchangeCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("openExchangePanel", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      io.to(session.room.id).emit("exchangePanelOpened", { playerId: session.playerId });
    });

    socket.on("closeExchangePanel", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      io.to(session.room.id).emit("exchangePanelClosed", { playerId: session.playerId });
    });

    socket.on("depositMoney", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = depositMoney(game, session.playerId, payload.amount);
      if (!result.ok) {
        socket.emit("bankActionFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("bankActionCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("withdrawMoney", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = withdrawMoney(game, session.playerId, payload.amount);
      if (!result.ok) {
        socket.emit("bankActionFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("bankActionCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("borrowCredit", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = borrowCredit(game, session.playerId, payload.amount);
      if (!result.ok) {
        socket.emit("bankActionFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("bankActionCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("repayCredit", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = repayCredit(game, session.playerId, payload.amount);
      if (!result.ok) {
        socket.emit("bankActionFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("bankActionCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("leaveDetention", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const result = leaveDetention(game, session.playerId);
      if (!result.ok) {
        socket.emit("bankActionFailed", { playerId: session.playerId, message: result.message });
        emitError(socket, result.message);
        return;
      }
      io.to(session.room.id).emit("bankActionCompleted", { playerId: session.playerId, message: result.message });
      emitGame(io, session.room);
    });

    socket.on("closeModal", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      io.to(session.room.id).emit("modalClosed", { playerId: session.playerId, modalType: payload?.modalType ?? null });
    });

    socket.on("closeMonthlySettlement", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        return;
      }
      const closed = closeMonthlySettlement(game, session.playerId);
      if (!closed) {
        return;
      }
      emitGame(io, session.room);
      if (!game.pendingMonthlySettlement) {
        scheduleTurnTimer(io, manager, session.room);
      }
    });

    socket.on("buyStock", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const stockId = (payload.stockId ?? payload.symbol) as StockId | undefined;
      if (!stockId) {
        emitError(socket, "Stock not found.");
        return;
      }
      const outcome = buyStock(game, session.playerId, stockId, payload.quantity);
      if (!outcome.ok) {
        socket.emit("stockTradeFailed", { playerId: session.playerId, message: outcome.error ?? "Could not buy stock." });
        emitError(socket, outcome.error ?? "Could not buy stock.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("sellStock", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const stockId = (payload.stockId ?? payload.symbol) as StockId | undefined;
      if (!stockId) {
        emitError(socket, "Stock not found.");
        return;
      }
      const outcome = sellStock(game, session.playerId, stockId, payload.quantity);
      if (!outcome.ok) {
        socket.emit("stockTradeFailed", { playerId: session.playerId, message: outcome.error ?? "Could not sell stock." });
        emitError(socket, outcome.error ?? "Could not sell stock.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("submitStockOrder", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = submitStockOrderAction(game, session.playerId, payload.stockId, payload.type, payload.shares);
      if (!outcome.ok) {
        socket.emit("stockTradeFailed", { playerId: session.playerId, message: outcome.error ?? "无法提交股票委托。" });
        emitError(socket, outcome.error ?? "无法提交股票委托。");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("cancelStockOrder", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = cancelStockOrderAction(game, session.playerId, payload.orderId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法取消股票委托。");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("requestPendingStockOrders", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const orders = game.pendingStockOrders.filter((order) => order.playerId === session.playerId);
      socket.emit("pendingStockOrdersUpdated", { playerId: session.playerId, orders });
    });

    socket.on("requestStockMarket", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      if (!session.room.game) {
        emitError(socket, "Game has not started.");
        return;
      }
      socket.emit("stockMarketUpdated", session.room.game.stocks);
    });

    socket.on("requestPlayerStockAccount", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const targetPlayerId = payload.playerId ?? session.playerId;
      const player = game.players.find((item) => item.id === targetPlayerId);
      if (!player) {
        emitError(socket, "Player not found.");
        return;
      }
      socket.emit("stockAccountUpdated", { playerId: player.id, account: player.stockAccount });
    });

    socket.on("requestOtherPlayersHoldings", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      socket.emit("otherPlayersHoldingsUpdated", buildOtherPlayersHoldings(game, session.playerId));
    });

    socket.on("buyLotteryTicket", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      if (game.pendingAction?.kind !== "lottery" || game.pendingAction.playerId !== session.playerId) {
        emitError(socket, "当前没有打开的彩票面板。");
        return;
      }
      const pending = game.pendingAction;
      const remaining = Math.max(0, pending.maxTickets - (pending.purchasedCount ?? 0));
      const drawCount = Math.min(remaining, payload.count ?? 1);
      if (drawCount <= 0) {
        emitError(socket, "本次到达彩市已购买彩票达到上限。");
        return;
      }
      const result = buyLotteryTickets(game, session.playerId, drawCount);
      pending.purchasedCount = (pending.purchasedCount ?? 0) + result.results.filter((item) => item.cost > 0).length;
      for (const lotteryResult of result.results) {
        io.to(session.room.id).emit("lotteryResult", lotteryResult);
      }
      emitGame(io, session.room);
      if (!result.ok) {
        emitError(socket, result.message);
      }
    });

    socket.on("drawLottery", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      if (game.pendingAction?.kind !== "lottery" || game.pendingAction.playerId !== session.playerId) {
        emitError(socket, "当前没有打开的彩票面板。");
        return;
      }
      const pending = game.pendingAction;
      const remaining = Math.max(0, pending.maxTickets - (pending.purchasedCount ?? 0));
      const drawCount = Math.min(remaining, payload?.count ?? 1);
      if (drawCount <= 0) {
        emitError(socket, "本次到达彩市已购买彩票达到上限。");
        return;
      }
      const result = buyLotteryTickets(game, session.playerId, drawCount);
      pending.purchasedCount = (pending.purchasedCount ?? 0) + result.results.filter((item) => item.cost > 0).length;
      for (const lotteryResult of result.results) {
        io.to(session.room.id).emit("lotteryResult", lotteryResult);
      }
      emitGame(io, session.room);
      if (!result.ok) {
        emitError(socket, result.message);
      }
    });

    socket.on("skipLottery", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      if (game.pendingAction?.kind !== "lottery" || game.pendingAction.playerId !== session.playerId) {
        socket.emit("lotteryPanelClosed", { playerId: session.playerId });
        emitGame(io, session.room);
        return;
      }
      const outcome = skipLottery(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法跳过彩票。");
        return;
      }
      io.to(session.room.id).emit("lotterySkipped", { playerId: session.playerId });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("closeLotteryPanel", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      if (game.pendingAction?.kind !== "lottery" || game.pendingAction.playerId !== session.playerId) {
        socket.emit("lotteryPanelClosed", { playerId: session.playerId });
        emitGame(io, session.room);
        return;
      }
      const outcome = skipLottery(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法关闭彩票面板。");
        return;
      }
      io.to(session.room.id).emit("lotteryPanelClosed", { playerId: session.playerId });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("closeSkillShop", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = closeSkillShop(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法关闭技能小铺。");
        return;
      }
      io.to(session.room.id).emit("modalClosed", { playerId: session.playerId, modalType: "skillShop" });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("skipSkillShop", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = closeSkillShop(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "无法跳过技能小铺。");
        return;
      }
      io.to(session.room.id).emit("modalClosed", { playerId: session.playerId, modalType: "skillShop" });
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("buySkillCard", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = buySkillCard(game, session.playerId, payload.skillId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not buy skill card.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("recycleSkillCard", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = recycleSkillCard(game, session.playerId, payload.skillId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not recycle skill card.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("useSkillCard", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = useSkillCard(game, session.playerId, payload);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not use skill card.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("declareBankruptcy", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = declareBankruptcy(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not declare bankruptcy.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("endTurn", () => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const game = session.room.game;
      if (!game) {
        emitError(socket, "Game has not started.");
        return;
      }
      const outcome = endTurn(game, session.playerId);
      if (!outcome.ok) {
        emitError(socket, outcome.error ?? "Could not end turn.");
        return;
      }
      broadcastOutcome(io, manager, session.room, outcome);
    });

    socket.on("chatMessage", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      const result = manager.appendChat(session.room.id, session.playerId, payload.message);
      if (!result.ok || !result.room) {
        emitError(socket, result.error ?? "Could not send message.");
        return;
      }
      emitRoom(io, manager, result.room);
    });

    socket.on("voiceParticipantUpdated", (payload) => {
      const session = getSessionRoom(socket, manager);
      if ("error" in session) {
        emitError(socket, session.error);
        return;
      }
      io.to(session.room.id).emit("voiceParticipantUpdated", {
        playerId: session.playerId,
        listening: Boolean(payload.listening),
        speaking: Boolean(payload.speaking)
      });
    });

    socket.on("voiceChunk", (payload) => {
      const session = getSessionRoom(socket, manager);
      const byteLength = payload.chunk?.byteLength ?? 0;
      const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "audio/webm";
      if (
        "error" in session ||
        !payload.chunk ||
        byteLength === 0 ||
        byteLength > 256 * 1024 ||
        !mimeType.startsWith("audio/")
      ) {
        return;
      }
      socket.to(session.room.id).emit("voiceChunk", {
        playerId: session.playerId,
        mimeType,
        chunk: payload.chunk
      });
    });

    socket.on("disconnect", () => {
      if (socket.data.roomId && socket.data.playerId) {
        socket.to(socket.data.roomId).emit("voiceParticipantUpdated", {
          playerId: socket.data.playerId,
          listening: false,
          speaking: false
        });
      }
      const changedRooms = manager.markDisconnected(socket.id);
      for (const room of changedRooms) {
        emitRoom(io, manager, room);
        emitGame(io, room);
      }
    });
  });
}
