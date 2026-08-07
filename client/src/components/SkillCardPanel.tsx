import { useMemo, useState } from "react";
import { getSkillConflictReason, getTileGraphDistance, type GameState, type SkillCard, type StockId, type Tile, type UseSkillPayload } from "@monopoly/shared";
import { socket } from "../socket/socket";

interface SkillCardPanelProps {
  game: GameState;
  playerId: string | null;
}

const targetTileTypes = new Set(["start", "bank", "stock", "skillShop", "safe_landing", "plaza"]);
const targetLabels: Record<string, string> = {
  self: "自己",
  player: "对手",
  tile: "地点",
  property: "地产",
  stock: "股票",
  propertyGroup: "套装",
  none: "无需目标"
};

function actionLabel(card: SkillCard): string {
  if (card.code === "remoteDice") {
    return "设定";
  }
  if (card.target === "player") {
    return "使用";
  }
  if (card.target === "tile") {
    return "跳跃";
  }
  if (card.target === "property") {
    return "强化";
  }
  return "使用";
}

export function SkillCardPanel({ game, playerId }: SkillCardPanelProps) {
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [targetTileId, setTargetTileId] = useState("");
  const [stockId, setStockId] = useState("");
  const [diceValue, setDiceValue] = useState(6);
  const me = game.players.find((player) => player.id === playerId) ?? null;
  const rivals = game.players.filter((player) => player.id !== playerId && !player.bankrupt);
  const currentPlayerId = game.turnOrder[game.currentTurnIndex] ?? null;
  const isMyTurn = Boolean(playerId && currentPlayerId === playerId && game.status === "playing");

  const teleportTiles = useMemo(
    () => game.tiles.filter((tile) => targetTileTypes.has(tile.type)),
    [game.tiles]
  );
  const ownedTiles = useMemo<Tile[]>(
    () => (me ? me.properties.map((tileId) => game.tiles.find((tile) => tile.id === tileId)).filter((tile): tile is Tile => Boolean(tile)) : []),
    [game.tiles, me]
  );
  const rivalPropertyTiles = useMemo<Tile[]>(
    () =>
      game.tiles.filter((tile) => {
        const property = game.properties[tile.id];
        return tile.type === "property" && property?.ownerId && property.ownerId !== playerId;
      }),
    [game.properties, game.tiles, playerId]
  );
  const stockIds = Object.keys(game.stocks);

  if (!me) {
    return null;
  }
  const localPlayer = me;

  const isDetained = localPlayer.skipTurns > 0 || localPlayer.statusEffects.some(
    (effect) => (effect.type === "jail" || effect.type === "hospital") && effect.turns > 0
  );

  function eligibleRivals(card: SkillCard) {
    return rivals.filter((player) =>
      card.range === undefined || getTileGraphDistance(game.tiles, localPlayer.currentTileId, player.currentTileId) <= card.range
    );
  }

  function propertyPool(card: SkillCard) {
    const pool = card.type === "attack" ? rivalPropertyTiles : ownedTiles;
    if (card.type !== "attack" || card.range === undefined) return pool;
    return pool.filter((tile) => getTileGraphDistance(game.tiles, localPlayer.currentTileId, tile.id) <= card.range!);
  }

  function unavailableReason(card: SkillCard): string | null {
    if (game.status !== "playing" || game.phase === "gameOver") return "游戏已结束";
    if (game.pendingMonthlySettlement) return "请先完成月度结算";
    if (localPlayer.bankrupt) return "已破产，不能使用技能卡";
    const mayReleaseNow = card.code === "releasePermit" && isDetained;
    if (!isMyTurn && !mayReleaseNow) return "当前不是你的回合";
    const conflict = getSkillConflictReason(localPlayer, card);
    if (conflict) return conflict;
    if (card.code === "releasePermit" && !isDetained) return "当前没有住院或入狱状态";
    if (card.target === "player" && eligibleRivals(card).length === 0) return "范围内没有可用对手";
    if (card.target === "property" && propertyPool(card).length === 0) return "没有符合条件的目标地产";
    return null;
  }

  function useCard(card: SkillCard) {
    const payload: UseSkillPayload = {
      skillId: card.id
    };
    if (card.code === "remoteDice") {
      payload.value = diceValue;
    }
    if (card.target === "player") {
      const available = eligibleRivals(card);
      const nextTargetPlayerId = available.some((player) => player.id === targetPlayerId)
        ? targetPlayerId
        : available[0]?.id;
      if (nextTargetPlayerId) {
        payload.targetPlayerId = nextTargetPlayerId;
      }
    }
    if (card.target === "tile") {
      const nextTargetTileId = teleportTiles.some((tile) => tile.id === targetTileId)
        ? targetTileId
        : teleportTiles[0]?.id;
      if (nextTargetTileId) {
        payload.targetTileId = nextTargetTileId;
      }
    }
    if (card.target === "property") {
      const available = propertyPool(card);
      const nextTargetTileId = available.some((tile) => tile.id === targetTileId)
        ? targetTileId
        : available[0]?.id;
      if (nextTargetTileId) {
        payload.targetTileId = nextTargetTileId;
      }
    }
    if ((card.targetMode ?? card.target) === "stock") {
      payload.stockId = (stockId || stockIds[0]) as StockId;
    }
    socket.emit("useSkillCard", payload);
  }

  function recycleCard(card: SkillCard) {
    if (!window.confirm(`确定回收【${card.displayName ?? card.name}】并获得 ${card.costTickets} 彩券吗？`)) {
      return;
    }
    socket.emit("recycleSkillCard", { skillId: card.id });
  }

  return (
    <section className="skillPanel">
      <div className="panelHeader">
        <span className="eyebrow">技能卡</span>
        <strong>{me.skillCards.length}/{me.maxSkillCards}</strong>
      </div>
      <div className="ticketBadge">🎟 {me.tickets} 彩券</div>
      <div className="skillControls">
        <label>
          骰子
          <select value={diceValue} onChange={(event) => setDiceValue(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          对手
          <select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value)}>
            <option value="">自动</option>
            {rivals.map((player) => (
              <option key={player.id} value={player.id}>{player.nickname}</option>
            ))}
          </select>
        </label>
        <label>
          地点
          <select value={targetTileId} onChange={(event) => setTargetTileId(event.target.value)}>
            <option value="">自动</option>
            {teleportTiles.map((tile) => (
              <option key={tile.id} value={tile.id}>{tile.name}</option>
            ))}
            {ownedTiles.map((tile) => (
              <option key={`owned-${tile.id}`} value={tile.id}>地产：{tile.name}</option>
            ))}
            {rivalPropertyTiles.map((tile) => (
              <option key={`rival-${tile.id}`} value={tile.id}>对手地产：{tile.name}</option>
            ))}
          </select>
        </label>
        <label>
          股票
          <select value={stockId} onChange={(event) => setStockId(event.target.value)}>
            <option value="">自动</option>
            {stockIds.map((id) => (
              <option key={id} value={id}>{game.stocks[id as keyof typeof game.stocks]?.name ?? id}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="skillCardList">
        {me.skillCards.length === 0 && <p className="emptySkill">还没有技能卡，路过技能小铺可用彩券购买。</p>}
        {me.skillCards.map((card) => {
          const reason = unavailableReason(card);
          return (
          <article key={card.id} className={`skillCard skill-${card.code} rarity-${card.rarity ?? "common"} ${reason ? "unavailable" : ""}`}>
            <strong>{card.displayName ?? card.name}</strong>
            <p>{card.description}</p>
            <small>
              {card.costTickets} 彩券 · 目标：{targetLabels[card.targetMode ?? card.target] ?? "自己"}
              {card.range ? ` · 范围 ${card.range} 格` : ""}
            </small>
            <div className="skillCardActions">
              <button disabled={Boolean(reason)} title={reason ?? undefined} onClick={() => useCard(card)}>
                {actionLabel(card)}
              </button>
              <button
                className="secondaryButton recycleSkillButton"
                disabled={game.status !== "playing" || me.bankrupt}
                onClick={() => recycleCard(card)}
              >
                回收 +{card.costTickets}
              </button>
            </div>
            {reason && <span className="skillUnavailableReason">{reason}</span>}
          </article>
          );
        })}
      </div>
    </section>
  );
}
