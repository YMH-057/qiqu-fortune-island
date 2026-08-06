import type { GameState, Tile, TileId, TileType } from "@monopoly/shared";
import { useEffect, useState } from "react";
import { money } from "../game/economy";
import { useI18n } from "../i18n";
import { socket } from "../socket/socket";

interface TileDetailPanelProps {
  game: GameState;
  selectedTileId: TileId | null;
  playerId: string | null;
}

const tileEffectText: Record<TileType, string> = {
  start: "经过或到达时获得工资奖励，是恢复现金流的重要节点。",
  property: "无主时可以购买；自己到达可以升级；其他玩家到达需要支付租金。",
  bank: "可以进行银行相关操作，当前版本支持彩券与金币兑换等简化机制。",
  stock: "进入股票大厅，查看行情并提交买入或卖出委托。",
  lottery: "可以花费金币购买彩票，可能获得金币、彩券、技能卡或空奖。",
  arcade: "触发游乐场随机奖励或小游戏风格事件。",
  chance: "抽取好运卡，可能获得奖金、股票、移动或地产增益。",
  misfortune: "抽取厄运卡，可能缴纳罚款、后退、停回合或遭遇资产损失。",
  tax: "缴纳固定税费或资产相关费用。",
  teleport: "触发传送效果，移动到指定或可选的远处地块。",
  portal: "打开传送门选择，消耗彩券后前往目标地点。",
  junction: "路口地块，系统会按规则决定下一段方向。",
  choice_junction: "岔路地块，当前玩家可能需要选择下一段路线。",
  skillShop: "技能小铺，玩家可以用彩券购买原创技能卡。",
  plaza: "普通广场，通常没有收费或惩罚。",
  safe_landing: "安全落点，适合作为传送目的地，不会触发租金或惩罚。",
  empty: "空地，暂时没有特殊事件。",
  jail: "监狱处罚区，停留期间不能掷骰，可等待或支付保释金。",
  hospital: "医院处罚区，停留期间不能掷骰，可等待或支付治疗费。",
  go_jail: "入狱入口，踩到后会被送入监狱支路。",
  hospital_entry: "医院入口，踩到后会被送入医院支路。",
  reward: "奖励格，可能获得金币、彩券或其他补给。",
  draw_card: "抽卡格，可能获得事件卡或技能卡奖励。"
};

function rentPreview(game: GameState, tileId: TileId, overrideLevel?: number): number {
  const tile = game.tiles.find((item) => item.id === tileId);
  const property = game.properties[tileId];
  if (!tile || !property || property.isMortgaged) {
    return 0;
  }
  const level = overrideLevel ?? property.level;
  const baseRent = tile.baseRent ?? tile.rentBase ?? Math.round((tile.price ?? 1000) * 0.12);
  const configuredMultipliers = game.settings.rentMultipliers?.length ? game.settings.rentMultipliers : [1, 2.3, 5, 10];
  const levelMultiplier = configuredMultipliers[Math.max(0, level - 1)] ?? configuredMultipliers[configuredMultipliers.length - 1] ?? 1;
  const group = tile.groupId ? game.propertyGroups[tile.groupId] : null;
  const groupComplete =
    group && property.ownerId
      ? group.tileIds.every((item) => {
          const groupProperty = game.properties[item];
          return groupProperty?.ownerId === property.ownerId && !groupProperty?.isMortgaged;
        })
      : false;
  const groupMultiplier = groupComplete ? group?.rentMultiplierWhenComplete ?? 1 : 1;
  const boostMultiplier = property.rentBoostTurns && property.rentBoostTurns > 0 ? 1.5 : 1;
  const cutMultiplier = property.rentCutTurns && property.rentCutTurns > 0 ? 0.5 : 1;
  const totalMultiplier = Math.min(50, levelMultiplier * groupMultiplier * boostMultiplier * cutMultiplier);
  return Math.max(0, Math.round(baseRent * totalMultiplier + (property.rentHornBonus ?? 0)));
}

function mortgageValue(price: number | undefined): number {
  return Math.round((price ?? 0) * 0.5);
}

function redeemCost(price: number | undefined): number {
  return Math.ceil(mortgageValue(price) * 1.1);
}

function upgradeCost(price: number | undefined, level: number): number {
  return Math.round((price ?? 0) * (0.45 + level * 0.15));
}

function tileLabel(game: GameState, tileId: TileId): string {
  const tile = game.tiles.find((item) => item.id === tileId);
  return tile?.shortName ?? tile?.name ?? tileId;
}

export function TileDetailPanel({ game, selectedTileId, playerId }: TileDetailPanelProps) {
  const { tileName, tileType } = useI18n();
  const [confirmAction, setConfirmAction] = useState<null | {
    type: "mortgage" | "redeem";
    tileId: TileId;
    tileName: string;
    amount: number;
  }>(null);
  const tile = selectedTileId ? game.tiles.find((item) => item.id === selectedTileId) : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmAction(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!tile) {
    return (
      <section className="tileDetailPanel">
        <div className="panelHeader">
          <span className="eyebrow">地块详情</span>
          <strong>点击地图</strong>
        </div>
        <p>点击任意地块，可以查看价格、租金、套装、路线、触发效果和当前停留玩家。</p>
      </section>
    );
  }

  const property = game.properties[tile.id];
  const owner = property?.ownerId ? game.players.find((player) => player.id === property.ownerId) : null;
  const me = game.players.find((player) => player.id === playerId) ?? null;
  const isMine = Boolean(property?.ownerId && property.ownerId === playerId);
  const group = tile.groupId ? game.propertyGroups[tile.groupId] : null;
  const groupOwned = group && owner
    ? group.tileIds.filter((id) => {
        const groupProperty = game.properties[id];
        return groupProperty?.ownerId === owner.id && !groupProperty.isMortgaged;
      }).length
    : 0;
  const currentMortgageValue = property?.mortgageValue ?? mortgageValue(tile.price);
  const currentRedeemCost = property?.mortgageRedeemCost ?? redeemCost(tile.price);
  const playersHere = game.players.filter((player) => !player.bankrupt && player.currentTileId === tile.id);
  const nextTiles = (tile.next ?? []).map((nextId) => tile.directionLabels?.[nextId] ?? tileLabel(game, nextId));
  const targetTile = tile.targetIndex !== undefined ? game.tiles[tile.targetIndex] : null;
  const portalTargets = tile.portalOptions?.map((option) => `${option.label}（${option.costTickets} 彩券）`) ?? [];
  const rentMultipliers = game.settings.rentMultipliers?.length ? game.settings.rentMultipliers : [1, 2.3, 5, 10];
  const groupMembers = group?.tileIds.map((id) => {
    const memberTile = game.tiles.find((item) => item.id === id);
    const memberProperty = game.properties[id];
    return {
      id,
      name: memberTile?.name ?? id,
      mortgaged: Boolean(memberProperty?.isMortgaged)
    };
  }) ?? [];

  function confirmFinanceAction() {
    if (!confirmAction) {
      return;
    }
    socket.emit(confirmAction.type === "mortgage" ? "mortgageProperty" : "redeemMortgage", { tileId: confirmAction.tileId });
    setConfirmAction(null);
  }

  return (
    <section className="tileDetailPanel detailedTilePanel">
      <div className="panelHeader">
        <span className="eyebrow">地块详情 #{tile.index}</span>
        <strong>{tile.shortName ?? tileType(tile.type)}</strong>
      </div>
      <h3>{tileName(tile)}</h3>
      <p className="tileDetailIntro">{tile.description ?? tileEffectText[tile.type]}</p>

      <dl>
        <div>
          <dt>类型</dt>
          <dd>{tileType(tile.type)}</dd>
        </div>
        <div>
          <dt>区域</dt>
          <dd>{tile.region ?? "-"}</dd>
        </div>
        <div>
          <dt>当前位置</dt>
          <dd>{playersHere.length > 0 ? playersHere.map((player) => player.nickname).join("、") : "暂无玩家"}</dd>
        </div>
        <div>
          <dt>下一步路线</dt>
          <dd>{nextTiles.length > 0 ? nextTiles.join(" / ") : "无"}</dd>
        </div>
        {(targetTile || tile.portalTargetId || portalTargets.length > 0) && (
          <div className="wideDetail">
            <dt>传送目标</dt>
            <dd>
              {targetTile ? tileName(targetTile) : null}
              {tile.portalTargetId ? tileLabel(game, tile.portalTargetId) : null}
              {portalTargets.length > 0 ? portalTargets.join("、") : null}
            </dd>
          </div>
        )}

        {property && (
          <>
            <div>
              <dt>拥有者</dt>
              <dd>{owner?.nickname ?? "无主"}</dd>
            </div>
            <div>
              <dt>地价</dt>
              <dd>{money(tile.price ?? 0)}</dd>
            </div>
            <div>
              <dt>等级</dt>
              <dd>Lv.{property.level} / 4</dd>
            </div>
            <div>
              <dt>基础租金 / 倍率</dt>
              <dd>
                {money(tile.baseRent ?? tile.rentBase ?? Math.round((tile.price ?? 1000) * 0.12))}
                {" × "}{rentMultipliers[Math.max(0, property.level - 1)] ?? 1}
              </dd>
            </div>
            <div>
              <dt>当前租金</dt>
              <dd>{property.isMortgaged ? "0（已抵押）" : money(rentPreview(game, tile.id))}</dd>
            </div>
            <div>
              <dt>下次升级</dt>
              <dd>{property.level >= 4 ? "已满级" : money(upgradeCost(tile.price, property.level))}</dd>
            </div>
            <div>
              <dt>抵押状态</dt>
              <dd>{property.isMortgaged ? "已抵押" : "未抵押"}</dd>
            </div>
            <div>
              <dt>抵押/赎回</dt>
              <dd>{money(currentMortgageValue)} / {money(currentRedeemCost)}</dd>
            </div>
          </>
        )}

        {group && (
          <div className="wideDetail">
            <dt>地产套装</dt>
            <dd>
              {group.name}：{groupOwned} / {group.tileIds.length}
              {property?.isMortgaged ? "（抵押中，套装不生效）" : ""}
              <small>{group.bonusDescription}</small>
              <small>成员：{groupMembers.map((item) => `${item.name}${item.mortgaged ? "（抵押）" : ""}`).join("、")}</small>
              <small>完整拥有：{groupOwned === group.tileIds.length ? "是" : "否"}；套装租金加成 ×{group.rentMultiplierWhenComplete}</small>
            </dd>
          </div>
        )}
      </dl>

      {property && (
        <div className="rentPreviewGrid">
          {[1, 2, 3, 4].map((level) => (
            <span key={level} className={property.level === level ? "active" : ""}>
              Lv.{level} {money(rentPreview(game, tile.id, level))}
            </span>
          ))}
        </div>
      )}

      {property && isMine && (
        <div className="tileActionRow">
          {!property.isMortgaged ? (
            <button onClick={() => setConfirmAction({ type: "mortgage", tileId: tile.id, tileName: tileName(tile), amount: currentMortgageValue })}>
              抵押地产
            </button>
          ) : (
            <button
              disabled={!me || me.cash < currentRedeemCost}
              onClick={() => setConfirmAction({ type: "redeem", tileId: tile.id, tileName: tileName(tile), amount: currentRedeemCost })}
            >
              {me && me.cash < currentRedeemCost ? "现金不足" : "赎回地产"}
            </button>
          )}
        </div>
      )}
      {confirmAction && (
        <div className="eventOverlay confirmOverlay" onClick={() => setConfirmAction(null)}>
          <article className="eventPopup neutral confirmFinanceModal" onClick={(event) => event.stopPropagation()}>
            <button className="modalCloseButton" type="button" aria-label="关闭" onClick={() => setConfirmAction(null)}>
              X
            </button>
            <span className="eventHeadline">{confirmAction.type === "mortgage" ? "确认抵押" : "确认赎回"}</span>
            <h3>
              {confirmAction.type === "mortgage"
                ? `确认抵押【${confirmAction.tileName}】？`
                : `确认赎回【${confirmAction.tileName}】？`}
            </h3>
            <p>
              {confirmAction.type === "mortgage"
                ? `抵押后获得 ${money(confirmAction.amount)} 金币，该地产停止收租，并使所属套装暂时失效。`
                : `赎回需要支付 ${money(confirmAction.amount)} 金币，成功后地产和套装效果恢复。`}
            </p>
            <div className="modalActions">
              <button className="secondaryButton" type="button" onClick={() => setConfirmAction(null)}>
                取消
              </button>
              <button className="dangerButton" type="button" onClick={confirmFinanceAction}>
                确认
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
