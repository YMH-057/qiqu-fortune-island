import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { GameState, PlayerState, Tile, TileId, TileType } from "@monopoly/shared";
import { getPlayerTokenOffset } from "../game/playerTokenLayout";
import { useI18n } from "../i18n";
import { PlayerToken } from "./PlayerToken";

interface GraphBoardProps {
  game: GameState;
  animatedPositions: Record<string, number>;
  localPlayerId: string | null;
  selectedTileId: TileId | null;
  onSelectTile: (tileId: TileId) => void;
}

type BoardPoint = { x: number; y: number };

export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 720;
export const TILE_WIDTH = 44;
export const TILE_HEIGHT = 34;
export const MIN_TILE_CENTER_DISTANCE = 48;

const tileEmoji: Record<TileType, string> = {
  start: "GO",
  property: "铺",
  bank: "银",
  stock: "股",
  lottery: "彩",
  arcade: "玩",
  chance: "幸",
  misfortune: "厄",
  tax: "税",
  teleport: "门",
  portal: "门",
  junction: "路",
  choice_junction: "岔",
  skillShop: "卡",
  plaza: "场",
  safe_landing: "安",
  empty: "路",
  jail: "牢",
  hospital: "医",
  go_jail: "警",
  hospital_entry: "救",
  reward: "奖",
  draw_card: "抽"
};

function pointFor(tile: Tile): BoardPoint {
  return tile.position ?? { x: 50, y: 50 };
}

function axisRoadPath(from: BoardPoint, to: BoardPoint): string {
  if (Math.abs(from.x - to.x) < 1) {
    return `M${from.x} ${from.y}V${to.y}`;
  }
  if (Math.abs(from.y - to.y) < 1) {
    return `M${from.x} ${from.y}H${to.x}`;
  }
  return `M${from.x} ${from.y}H${to.x}V${to.y}`;
}

function routeClass(tile: Tile, next: Tile): string {
  if (tile.routeType === "detention" || next.routeType === "detention") return "detention";
  if (tile.routeType === "inner" && next.routeType === "inner") return "inner";
  if (tile.visualGroup?.startsWith("upper") || next.visualGroup?.startsWith("upper")) return "upper";
  if (tile.visualGroup?.startsWith("lower") || next.visualGroup?.startsWith("lower")) return "lower";
  if (tile.visualGroup?.startsWith("left") || next.visualGroup?.startsWith("left")) return "left";
  if (tile.visualGroup?.startsWith("right") || next.visualGroup?.startsWith("right")) return "right";
  return "outer";
}

export function validateBoardLayout(tiles: Tile[]) {
  const issues: string[] = [];
  const positioned = tiles.map((tile) => ({ tile, point: pointFor(tile) }));

  for (const { tile, point } of positioned) {
    if (!tile.position) {
      issues.push(`${tile.id} 缺少 position，当前使用临时回退坐标 (${point.x},${point.y})`);
    }
    if (point.x < TILE_WIDTH / 2 || point.x > BOARD_WIDTH - TILE_WIDTH / 2 || point.y < TILE_HEIGHT / 2 || point.y > BOARD_HEIGHT - TILE_HEIGHT / 2) {
      issues.push(`${tile.id}(${point.x},${point.y}) 超出棋盘安全边界`);
    }
  }

  for (let i = 0; i < positioned.length; i += 1) {
    for (let j = i + 1; j < positioned.length; j += 1) {
      const a = positioned[i];
      const b = positioned[j];
      if (!a || !b) continue;
      const dx = Math.abs(a.point.x - b.point.x);
      const dy = Math.abs(a.point.y - b.point.y);
      const distance = Math.hypot(dx, dy);
      const rectOverlap = dx < TILE_WIDTH && dy < TILE_HEIGHT;
      if (rectOverlap || distance < MIN_TILE_CENTER_DISTANCE) {
        issues.push(`${a.tile.id}(${a.point.x},${a.point.y}) 与 ${b.tile.id}(${b.point.x},${b.point.y}) 距离 ${Math.round(distance)}，存在重叠风险`);
      }
    }
  }

  if (issues.length > 0) {
    console.warn("[validateBoardLayout] 棋盘布局检查发现问题：", issues);
  }
  return issues;
}

function TileNode({
  game,
  tile,
  isChoice,
  isCurrentTile,
  isSelected,
  isHovered,
  zoomLevel,
  onSelect,
  onHover
}: {
  game: GameState;
  tile: Tile;
  isChoice: boolean;
  isCurrentTile: boolean;
  isSelected: boolean;
  isHovered: boolean;
  zoomLevel: number;
  onSelect: (tileId: TileId) => void;
  onHover: (tileId: TileId | null) => void;
}) {
  const { tileName, tileType } = useI18n();
  const point = pointFor(tile);
  const property = game.properties[tile.id];
  const owner = property?.ownerId ? game.players.find((player) => player.id === property.ownerId) : null;
  const displayName = (tile.shortName ?? tileName(tile)).slice(0, zoomLevel < 0.8 ? 2 : 4);
  const tileIcon = tile.type === "property" ? displayName.slice(0, 1) : tileEmoji[tile.type];

  return (
    <g
      className={`graphTile graph-${tile.type} group-${tile.colorGroup ?? "none"} visual-${tile.visualGroup ?? "none"} ${owner ? "owned" : ""} ${
        property?.isMortgaged ? "mortgaged" : ""
      } ${isChoice ? "choice" : ""} ${isCurrentTile ? "turnTile" : ""} ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
      data-tile-id={tile.id}
      transform={`translate(${point.x} ${point.y})`}
      onClick={() => onSelect(tile.id)}
      onMouseEnter={() => onHover(tile.id)}
      onMouseLeave={() => onHover(null)}
      role="button"
      aria-label={`${tile.index} ${tileType(tile.type)} ${tileName(tile)}`}
      tabIndex={0}
    >
      <rect
        x={-TILE_WIDTH / 2}
        y={-TILE_HEIGHT / 2}
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        rx="10"
        style={{ stroke: owner?.color ?? undefined }}
      />
      {owner && (
        <rect
          className="ownerStrip"
          x={-TILE_WIDTH / 2}
          y={TILE_HEIGHT / 2 - 9}
          width={TILE_WIDTH}
          height="9"
          rx="4"
          style={{ fill: owner.color }}
        />
      )}
      <text className="graphTileIcon" x="0" y="2" textAnchor="middle">
        {tileIcon}
      </text>
      <text className="graphTileName" x="0" y="14" textAnchor="middle">
        {displayName}
      </text>
      <title>
        {tile.index} | {tileType(tile.type)} | {tileName(tile)}
        {tile.type === "property" ? ` | ${tile.price ?? 0}` : ""}
      </title>
      {property && property.level > 0 && (
        <text className="graphTileLevel" x="27" y="-20" textAnchor="middle">
          {property.isMortgaged ? "押" : zoomLevel < 0.8 ? property.level : `Lv${property.level}`}
        </text>
      )}
    </g>
  );
}

function GraphToken({
  player,
  index,
  currentPlayerId,
  localPlayerId,
  tile
}: {
  player: PlayerState;
  index: number;
  currentPlayerId: string | null;
  localPlayerId: string | null;
  tile: Tile;
}) {
  const point = pointFor(tile);
  const offset = getPlayerTokenOffset(index);
  return (
    <div
      className="graphToken"
      style={{
        left: `${(point.x / BOARD_WIDTH) * 100}%`,
        top: `${(point.y / BOARD_HEIGHT) * 100}%`
      }}
    >
      <PlayerToken
        player={player}
        index={index}
        isCurrent={player.id === currentPlayerId}
        isLocal={player.id === localPlayerId}
        offset={offset}
      />
    </div>
  );
}

export function GraphBoard({
  game,
  animatedPositions,
  localPlayerId,
  selectedTileId,
  onSelectTile
}: GraphBoardProps) {
  const { t } = useI18n();
  const [zoomLevel, setZoomLevel] = useState(0.94);
  const [hoveredTileId, setHoveredTileId] = useState<TileId | null>(null);
  const currentPlayerId = game.turnOrder[game.currentTurnIndex] ?? null;
  const currentPlayer = game.players.find((player) => player.id === currentPlayerId) ?? null;
  const localPendingChoice =
    game.pendingAction?.kind === "choosePath" && game.pendingAction.playerId === localPlayerId
      ? game.pendingAction
      : null;
  const choiceIds = useMemo(() => new Set(localPendingChoice?.options.map((option) => option.tileId) ?? []), [localPendingChoice]);
  const tileById = useMemo(() => new Map(game.tiles.map((tile) => [tile.id, tile])), [game.tiles]);
  const hoveredTile = hoveredTileId ? tileById.get(hoveredTileId) ?? null : null;
  const zoomClass = zoomLevel < 0.8 ? "zoomSmall" : zoomLevel < 1.2 ? "zoomMedium" : "zoomLarge";

  useEffect(() => {
    validateBoardLayout(game.tiles);
  }, [game.tiles]);

  return (
    <div className="graphBoardWrap">
      <div className="mapToolbar">
        <button onClick={() => setZoomLevel((value) => Math.max(0.75, Math.round((value - 0.1) * 100) / 100))}>
          -
        </button>
        <span>{Math.round(zoomLevel * 100)}%</span>
        <button onClick={() => setZoomLevel((value) => Math.min(1.25, Math.round((value + 0.1) * 100) / 100))}>
          +
        </button>
      </div>
      <div className={`graphBoard ${zoomClass}`} style={{ "--map-zoom": zoomLevel } as CSSProperties}>
        <svg className="graphMap" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-label={t("appName")}>
          <defs>
            <filter id="puffyShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#3d3560" floodOpacity="0.26" />
            </filter>
            <marker id="roadArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" className="roadArrowHead" />
            </marker>
          </defs>

          <rect className="seaBase" x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} rx="32" />
          <image
            className="boardBackgroundImage"
            href="/board-background.png"
            x="0"
            y="0"
            width={BOARD_WIDTH}
            height={BOARD_HEIGHT}
            preserveAspectRatio="xMidYMid slice"
          />
          <rect className="boardOverlayWash" x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} rx="32" />

          <g className="graphRoadLayer" aria-hidden="true">
            {game.tiles.flatMap((tile) => {
              const from = pointFor(tile);
              return (tile.next ?? []).map((nextId) => {
                const next = tileById.get(nextId);
                if (!next) return null;
                const to = pointFor(next);
                const isChoiceRoad = tile.next && tile.next.length > 1;
                return (
                  <path
                    key={`${tile.id}-${nextId}`}
                    className={`graphRoad road-${routeClass(tile, next)} ${isChoiceRoad ? "junctionRoad" : ""} ${
                      choiceIds.has(tile.id) || choiceIds.has(next.id) ? "choiceRoad" : ""
                    }`}
                    d={axisRoadPath(from, to)}
                    markerEnd="url(#roadArrow)"
                  />
                );
              });
            })}
          </g>

          {game.tiles.map((tile) => (
            <TileNode
              key={tile.id}
              game={game}
              tile={tile}
              isChoice={choiceIds.has(tile.id)}
              isCurrentTile={tile.id === currentPlayer?.currentTileId}
              isSelected={tile.id === selectedTileId}
              isHovered={tile.id === hoveredTileId}
              zoomLevel={zoomLevel}
              onSelect={onSelectTile}
              onHover={setHoveredTileId}
            />
          ))}
        </svg>

        {hoveredTile && (
          <div
            className="mapHoverLabel"
            style={{
              left: `${(pointFor(hoveredTile).x / BOARD_WIDTH) * 100}%`,
              top: `${(pointFor(hoveredTile).y / BOARD_HEIGHT) * 100}%`
            }}
          >
            {hoveredTile.shortName ?? hoveredTile.name}
          </div>
        )}

        <div className="graphTokenLayer">
          {game.players.map((player, index) => {
            const animatedIndex = animatedPositions[player.id] ?? player.position;
            const tile =
              game.tiles.find((item) => item.index === animatedIndex) ??
              game.tiles.find((item) => item.id === player.currentTileId);
            if (!tile) return null;
            return (
              <GraphToken
                key={player.id}
                player={player}
                index={index}
                currentPlayerId={currentPlayerId}
                localPlayerId={localPlayerId}
                tile={tile}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
