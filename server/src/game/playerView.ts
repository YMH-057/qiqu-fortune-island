import type { GameState, PlayerId } from "@monopoly/shared";

/** Builds a client-safe state view without mutating the authoritative room state. */
export function projectGameForPlayer(game: GameState, playerId: PlayerId): GameState {
  const ownPendingOrders = game.pendingStockOrders.filter((order) => order.playerId === playerId);

  return {
    ...game,
    pendingStockOrders: ownPendingOrders,
    marketSignals: (game.marketSignals ?? []).filter(
      (signal) => signal.isPublic || signal.ownerPlayerId === playerId
    ),
    players: game.players.map((player) => ({
      ...player,
      stockAccount: {
        ...player.stockAccount,
        pendingOrders: player.id === playerId ? ownPendingOrders : []
      }
    }))
  };
}
