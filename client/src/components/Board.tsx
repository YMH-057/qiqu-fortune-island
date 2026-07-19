import type { GameState, PlayerState, Tile } from "@monopoly/shared";
import { BOARD_SIZE, getBoardCell } from "../game/boardLayout";
import { getPlayerTokenOffset } from "../game/playerTokenLayout";
import { useI18n } from "../i18n";
import { PlayerToken } from "./PlayerToken";
import { TileIcon } from "./TileIcons";

interface BoardProps {
  game: GameState;
  animatedPositions: Record<string, number>;
  localPlayerId: string | null;
}

function TileCell({
  game,
  tile,
  players,
  currentPlayerId,
  localPlayerId
}: {
  game: GameState;
  tile: Tile;
  players: PlayerState[];
  currentPlayerId: string | null;
  localPlayerId: string | null;
}) {
  const cell = getBoardCell(tile.index);
  const { tileName, tileType } = useI18n();
  const property = game.properties[tile.id];
  const owner = property?.ownerId
    ? game.players.find((player) => player.id === property.ownerId) ?? null
    : null;

  return (
    <div
      className={`boardTile tile-${tile.type} ${owner ? "ownedTile" : ""}`}
      style={{
        gridRow: cell.row,
        gridColumn: cell.col,
        borderColor: owner?.color ?? "rgba(15, 23, 42, 0.16)"
      }}
    >
      <div className="tileTopline">
        <span>{tile.index}</span>
        <span>{tileType(tile.type)}</span>
      </div>
      <span className="tileIcon" aria-hidden="true">
        <TileIcon type={tile.type} />
      </span>
      <strong title={tileName(tile)}>{tileName(tile)}</strong>
      {tile.type === "property" && (
        <div className="tileMeta">
          <span>{tile.price}</span>
          <span className="levelDots">
            {Array.from({ length: property?.level ?? 0 }).map((_, index) => (
              <i key={index} style={{ backgroundColor: owner?.color ?? "#94a3b8" }} />
            ))}
          </span>
        </div>
      )}
      <div className="pieceLayer">
        {players.map((player, index) => {
          const offset = getPlayerTokenOffset(index);
          return (
            <PlayerToken
              key={player.id}
              player={player}
              index={index}
              isCurrent={player.id === currentPlayerId}
              isLocal={player.id === localPlayerId}
              offset={offset}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Board({ game, animatedPositions, localPlayerId }: BoardProps) {
  const currentPlayerId = game.turnOrder[game.currentTurnIndex] ?? null;

  return (
    <div className="boardWrap">
      <div
        className="boardGrid"
        style={{
          gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(56px, 1fr))`,
          gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(56px, 1fr))`
        }}
      >
        {game.tiles.map((tile) => {
          const tilePlayers = game.players.filter((player) => {
            const visualPosition = animatedPositions[player.id] ?? player.position;
            return visualPosition === tile.index && !player.bankrupt;
          });
          return (
            <TileCell
              key={tile.id}
              game={game}
              tile={tile}
              players={tilePlayers}
              currentPlayerId={currentPlayerId}
              localPlayerId={localPlayerId}
            />
          );
        })}
        <div className="boardCenter">
          <div className="centerDecor decorCloudA" />
          <div className="centerDecor decorCloudB" />
          <div className="centerDecor decorCoinA" />
          <div className="centerDecor decorCoinB" />
          <div className="centerDecor decorHouse" />
          <div className="centerDecor decorRainbow" />
        </div>
      </div>
    </div>
  );
}
