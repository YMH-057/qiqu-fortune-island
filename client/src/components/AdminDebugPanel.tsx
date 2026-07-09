import { useEffect, useState } from "react";
import type {
  DebugCatalog,
  DebugCommand,
  GamePhase,
  GameState,
  RoomPublicState,
  SkillCardCode,
  StockId,
  TileId
} from "@monopoly/shared";
import { socket } from "../socket/socket";

interface AdminDebugPanelProps {
  game: GameState;
  room: RoomPublicState | null;
  playerId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type FeedbackTone = "success" | "error";

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

const deckLabels: Record<"chance" | "misfortune" | "lottery" | "arcade", string> = {
  chance: "好运",
  misfortune: "厄运",
  lottery: "彩票",
  arcade: "游乐"
};

const phaseLabels: Record<GamePhase, string> = {
  waitingRoll: "等待掷骰",
  tileAction: "格子行动",
  gameOver: "结算结束"
};

const rarityLabels: Record<string, string> = {
  common: "普通",
  rare: "稀有",
  epic: "史诗"
};

function parseIntegerInput(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function parseDecimalInput(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.round(parsed * 100) / 100;
}

export function AdminDebugPanel({
  game,
  room,
  playerId,
  isOpen,
  onClose
}: AdminDebugPanelProps) {
  const isHost = Boolean(room?.hostId && room.hostId === playerId);
  const [catalog, setCatalog] = useState<DebugCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submittingKind, setSubmittingKind] = useState<DebugCommand["kind"] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState(playerId ?? game.turnOrder[game.currentTurnIndex] ?? game.players[0]?.id ?? "");
  const [selectedSkillCode, setSelectedSkillCode] = useState<SkillCardCode | "">("");
  const [selectedLuckCardId, setSelectedLuckCardId] = useState("");
  const [teleportTileId, setTeleportTileId] = useState<TileId | "">(game.tiles[0]?.id ?? "");
  const [resolveTeleport, setResolveTeleport] = useState(false);
  const [resourceCash, setResourceCash] = useState("");
  const [resourceTickets, setResourceTickets] = useState("");
  const [resourceDeposit, setResourceDeposit] = useState("");
  const [resourceDebtPrincipal, setResourceDebtPrincipal] = useState("");
  const [resourceUnpaidInterest, setResourceUnpaidInterest] = useState("");
  const [propertyTileId, setPropertyTileId] = useState<TileId | "">(
    game.tiles.find((tile) => tile.type === "property")?.id ?? ""
  );
  const [propertyOwnerId, setPropertyOwnerId] = useState<string>("none");
  const [propertyLevel, setPropertyLevel] = useState("0");
  const [propertyMortgaged, setPropertyMortgaged] = useState(false);
  const [holdingStockId, setHoldingStockId] = useState<StockId | "">(
    Object.values(game.stocks)[0]?.id ?? ""
  );
  const [holdingShares, setHoldingShares] = useState("0");
  const [priceStockId, setPriceStockId] = useState<StockId | "">(
    Object.values(game.stocks)[0]?.id ?? ""
  );
  const [stockPrice, setStockPrice] = useState("");
  const [detentionMode, setDetentionMode] = useState<"none" | "jail" | "hospital">("none");
  const [detentionTurns, setDetentionTurns] = useState("3");
  const [turnPlayerId, setTurnPlayerId] = useState(game.turnOrder[game.currentTurnIndex] ?? game.players[0]?.id ?? "");
  const [turnPhase, setTurnPhase] = useState<GamePhase>(game.phase);
  const [turnRound, setTurnRound] = useState(String(game.round));
  const [turnCompletedTurns, setTurnCompletedTurns] = useState(String(game.completedTurns));
  const [clearPendingAction, setClearPendingAction] = useState(false);

  useEffect(() => {
    if (!isOpen || isHost) {
      return;
    }
    onClose();
  }, [isHost, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !isHost || catalog || catalogLoading) {
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    socket.emit("debugCommand", { kind: "getCatalog" }, (response) => {
      if (cancelled) {
        return;
      }
      setCatalogLoading(false);
      if (!response.ok || !response.catalog) {
        setFeedback({ tone: "error", message: response.error ?? "无法读取管理员目录。" });
        return;
      }
      setCatalog(response.catalog);
      setFeedback({ tone: "success", message: response.message ?? "管理员目录已更新。" });
    });
    return () => {
      cancelled = true;
    };
  }, [catalog, catalogLoading, isHost, isOpen]);

  useEffect(() => {
    const fallbackPlayerId = playerId ?? game.turnOrder[game.currentTurnIndex] ?? game.players[0]?.id ?? "";
    if (!targetPlayerId || !game.players.some((player) => player.id === targetPlayerId)) {
      setTargetPlayerId(fallbackPlayerId);
    }
    if (!turnPlayerId || !game.players.some((player) => player.id === turnPlayerId)) {
      setTurnPlayerId(game.turnOrder[game.currentTurnIndex] ?? fallbackPlayerId);
    }
  }, [game.currentTurnIndex, game.players, game.turnOrder, playerId, targetPlayerId, turnPlayerId]);

  useEffect(() => {
    const propertyTileIds = game.tiles.filter((tile) => tile.type === "property").map((tile) => tile.id);
    if (!propertyTileId || !propertyTileIds.includes(propertyTileId)) {
      setPropertyTileId(propertyTileIds[0] ?? "");
    }
    const tileIds = game.tiles.map((tile) => tile.id);
    if (!teleportTileId || !tileIds.includes(teleportTileId)) {
      setTeleportTileId(game.tiles[0]?.id ?? "");
    }
  }, [game.tiles, propertyTileId, teleportTileId]);

  useEffect(() => {
    const stockIds = Object.values(game.stocks).map((stock) => stock.id);
    if (!holdingStockId || !stockIds.includes(holdingStockId)) {
      setHoldingStockId(stockIds[0] ?? "");
    }
    if (!priceStockId || !stockIds.includes(priceStockId)) {
      setPriceStockId(stockIds[0] ?? "");
    }
  }, [game.stocks, holdingStockId, priceStockId]);

  useEffect(() => {
    if (!catalog) {
      return;
    }
    if (!selectedSkillCode || !catalog.skillCards.some((card) => card.code === selectedSkillCode)) {
      setSelectedSkillCode(catalog.skillCards[0]?.code ?? "");
    }
    if (!selectedLuckCardId || !catalog.luckCards.some((card) => card.id === selectedLuckCardId)) {
      setSelectedLuckCardId(catalog.luckCards[0]?.id ?? "");
    }
  }, [catalog, selectedLuckCardId, selectedSkillCode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const targetPlayer = game.players.find((player) => player.id === targetPlayerId);
    if (!targetPlayer) {
      return;
    }
    setResourceCash(String(targetPlayer.cash));
    setResourceTickets(String(targetPlayer.tickets));
    setResourceDeposit(String(targetPlayer.bankAccount.deposit));
    setResourceDebtPrincipal(String(targetPlayer.bankAccount.debtPrincipal));
    setResourceUnpaidInterest(String(targetPlayer.bankAccount.unpaidInterest));
    setDetentionMode(
      targetPlayer.statusEffects.some((effect) => effect.type === "jail")
        ? "jail"
        : targetPlayer.statusEffects.some((effect) => effect.type === "hospital")
          ? "hospital"
          : "none"
    );
    setDetentionTurns(
      String(
        targetPlayer.statusEffects.find((effect) => effect.type === "jail" || effect.type === "hospital")?.turns ??
          Math.max(0, targetPlayer.skipTurns)
      )
    );
  }, [game.players, isOpen, targetPlayerId]);

  useEffect(() => {
    if (!isOpen || !propertyTileId) {
      return;
    }
    const property = game.properties[propertyTileId];
    if (!property) {
      setPropertyOwnerId("none");
      setPropertyLevel("0");
      setPropertyMortgaged(false);
      return;
    }
    setPropertyOwnerId(property.ownerId ?? "none");
    setPropertyLevel(String(property.level));
    setPropertyMortgaged(Boolean(property.isMortgaged));
  }, [game.properties, isOpen, propertyTileId]);

  useEffect(() => {
    if (!isOpen || !holdingStockId) {
      return;
    }
    const targetPlayer = game.players.find((player) => player.id === targetPlayerId);
    const nextShares = targetPlayer?.stocks[holdingStockId] ?? 0;
    setHoldingShares(String(nextShares));
  }, [game.players, holdingStockId, isOpen, targetPlayerId]);

  useEffect(() => {
    if (!isOpen || !priceStockId) {
      return;
    }
    const stock = game.stocks[priceStockId];
    if (stock) {
      setStockPrice(String(stock.currentPrice));
    }
  }, [game.stocks, isOpen, priceStockId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTurnPlayerId(game.turnOrder[game.currentTurnIndex] ?? game.players[0]?.id ?? "");
    setTurnPhase(game.phase);
    setTurnRound(String(game.round));
    setTurnCompletedTurns(String(game.completedTurns));
    setClearPendingAction(false);
  }, [game.completedTurns, game.currentTurnIndex, game.phase, game.players, game.round, game.turnOrder, isOpen]);

  if (!isOpen || !isHost) {
    return null;
  }

  const propertyTiles = game.tiles.filter((tile) => tile.type === "property");
  const stocks = Object.values(game.stocks);
  const targetPlayer = game.players.find((player) => player.id === targetPlayerId) ?? null;
  const targetTile = targetPlayer ? game.tiles.find((tile) => tile.id === targetPlayer.currentTileId) ?? null : null;
  const selectedProperty = propertyTileId ? game.tiles.find((tile) => tile.id === propertyTileId) ?? null : null;
  const selectedPropertyState = propertyTileId ? game.properties[propertyTileId] : undefined;
  const selectedHoldingStock = holdingStockId ? game.stocks[holdingStockId] : undefined;
  const selectedPriceStock = priceStockId ? game.stocks[priceStockId] : undefined;
  const currentTurnPlayerId = game.turnOrder[game.currentTurnIndex] ?? "";
  const currentTurnPlayer = game.players.find((player) => player.id === currentTurnPlayerId) ?? null;
  const pendingActionLabel = game.pendingAction?.kind ?? "无";
  const isBusy = catalogLoading || submittingKind !== null;

  function showFeedback(tone: FeedbackTone, message: string): void {
    setFeedback({ tone, message });
  }

  function submitCommand(command: DebugCommand): void {
    setSubmittingKind(command.kind);
    socket.emit("debugCommand", command, (response) => {
      setSubmittingKind(null);
      if (!response.ok) {
        showFeedback("error", response.error ?? "管理员操作失败。");
        return;
      }
      showFeedback("success", response.message ?? "管理员操作已执行。");
      if (command.kind === "getCatalog" && response.catalog) {
        setCatalog(response.catalog);
      }
    });
  }

  function refreshCatalog(): void {
    setSubmittingKind("getCatalog");
    socket.emit("debugCommand", { kind: "getCatalog" }, (response) => {
      setSubmittingKind(null);
      if (!response.ok || !response.catalog) {
        showFeedback("error", response.error ?? "无法刷新管理员目录。");
        return;
      }
      setCatalog(response.catalog);
      showFeedback("success", response.message ?? "管理员目录已刷新。");
    });
  }

  function handleGrantSkillCard(): void {
    if (!targetPlayerId || !selectedSkillCode) {
      showFeedback("error", "请选择目标玩家和技能卡。");
      return;
    }
    submitCommand({ kind: "grantSkillCard", targetPlayerId, skillCode: selectedSkillCode });
  }

  function handleTriggerLuckCard(): void {
    if (!targetPlayerId || !selectedLuckCardId) {
      showFeedback("error", "请选择目标玩家和事件卡。");
      return;
    }
    submitCommand({ kind: "triggerLuckCard", targetPlayerId, cardId: selectedLuckCardId });
  }

  function handleTeleportPlayer(): void {
    if (!targetPlayerId || !teleportTileId) {
      showFeedback("error", "请选择目标玩家和目标格子。");
      return;
    }
    submitCommand({
      kind: "teleportPlayer",
      targetPlayerId,
      tileId: teleportTileId,
      resolveTile: resolveTeleport
    });
  }

  function handleSetPlayerResources(): void {
    if (!targetPlayerId) {
      showFeedback("error", "请选择目标玩家。");
      return;
    }
    const cash = parseIntegerInput(resourceCash);
    const tickets = parseIntegerInput(resourceTickets);
    const deposit = parseIntegerInput(resourceDeposit);
    const debtPrincipal = parseIntegerInput(resourceDebtPrincipal);
    const unpaidInterest = parseIntegerInput(resourceUnpaidInterest);
    if (
      cash === undefined &&
      tickets === undefined &&
      deposit === undefined &&
      debtPrincipal === undefined &&
      unpaidInterest === undefined
    ) {
      showFeedback("error", "请至少填写一项资源数值。");
      return;
    }
    submitCommand({
      kind: "setPlayerResources",
      targetPlayerId,
      cash,
      tickets,
      deposit,
      debtPrincipal,
      unpaidInterest
    });
  }

  function handleSetPropertyState(): void {
    if (!propertyTileId) {
      showFeedback("error", "请选择地产格。");
      return;
    }
    const level = parseIntegerInput(propertyLevel);
    submitCommand({
      kind: "setPropertyState",
      tileId: propertyTileId,
      ownerPlayerId: propertyOwnerId === "none" ? null : propertyOwnerId,
      level,
      isMortgaged: propertyMortgaged
    });
  }

  function handleSetPlayerHolding(): void {
    if (!targetPlayerId || !holdingStockId) {
      showFeedback("error", "请选择目标玩家和股票。");
      return;
    }
    const shares = parseIntegerInput(holdingShares);
    if (shares === undefined) {
      showFeedback("error", "请填写有效的持股数量。");
      return;
    }
    submitCommand({
      kind: "setPlayerStockHolding",
      targetPlayerId,
      stockId: holdingStockId,
      shares
    });
  }

  function handleSetStockPrice(): void {
    if (!priceStockId) {
      showFeedback("error", "请选择股票。");
      return;
    }
    const price = parseDecimalInput(stockPrice);
    if (price === undefined) {
      showFeedback("error", "请填写有效的股价。");
      return;
    }
    submitCommand({ kind: "setStockPrice", stockId: priceStockId, price });
  }

  function handleSetDetention(): void {
    if (!targetPlayerId) {
      showFeedback("error", "请选择目标玩家。");
      return;
    }
    const turns = detentionMode === "none" ? undefined : parseIntegerInput(detentionTurns);
    if (detentionMode !== "none" && turns === undefined) {
      showFeedback("error", "请填写有效的拘留回合数。");
      return;
    }
    submitCommand({
      kind: "setPlayerDetention",
      targetPlayerId,
      detention: detentionMode,
      turns
    });
  }

  function handleSetTurnState(): void {
    const round = parseIntegerInput(turnRound);
    const completedTurns = parseIntegerInput(turnCompletedTurns);
    submitCommand({
      kind: "setTurnState",
      currentPlayerId: turnPlayerId || undefined,
      phase: turnPhase,
      round,
      completedTurns,
      clearPendingAction
    });
  }

  return (
    <div className="adminDebugOverlay" onClick={onClose}>
      <article
        className="adminDebugModal"
        role="dialog"
        aria-modal="true"
        aria-label="管理员测试面板"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="adminDebugHeader">
          <div>
            <span className="adminDebugEyebrow">管理员模式</span>
            <h2>高效手测控制台</h2>
            <p>房主可直接构造玩家、地产、股票与回合状态，不用再跑长流程喵。</p>
          </div>
          <div className="adminDebugHeaderActions">
            <button className="secondaryButton" type="button" onClick={refreshCatalog} disabled={isBusy}>
              刷新目录
            </button>
            <button className="secondaryButton" type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <section className="adminDebugSummary">
          <label className="modalField adminDebugPlayerField">
            <span>目标玩家</span>
            <select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value)}>
              {game.players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.nickname}
                  {player.id === currentTurnPlayerId ? " · 当前回合" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="adminDebugFacts">
            <span>当前位置：{targetTile?.name ?? "未知"}</span>
            <span>现金：{targetPlayer?.cash ?? "--"}</span>
            <span>彩券：{targetPlayer?.tickets ?? "--"}</span>
            <span>当前回合：{currentTurnPlayer?.nickname ?? "未知"}</span>
            <span>阶段：{phaseLabels[game.phase]}</span>
            <span>待处理动作：{pendingActionLabel}</span>
          </div>
        </section>

        {feedback && (
          <p className={`adminDebugFeedback ${feedback.tone === "error" ? "error" : "success"}`}>
            {feedback.message}
          </p>
        )}

        <div className="adminDebugBody">
          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>玩家资源</h3>
              <p>直接设置现金、彩券、存款、贷款本金和未付利息。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField">
                <span>现金</span>
                <input type="number" value={resourceCash} onChange={(event) => setResourceCash(event.target.value)} />
              </label>
              <label className="modalField">
                <span>彩券</span>
                <input type="number" value={resourceTickets} onChange={(event) => setResourceTickets(event.target.value)} />
              </label>
              <label className="modalField">
                <span>存款</span>
                <input type="number" value={resourceDeposit} onChange={(event) => setResourceDeposit(event.target.value)} />
              </label>
              <label className="modalField">
                <span>贷款本金</span>
                <input
                  type="number"
                  value={resourceDebtPrincipal}
                  onChange={(event) => setResourceDebtPrincipal(event.target.value)}
                />
              </label>
              <label className="modalField">
                <span>未付利息</span>
                <input
                  type="number"
                  value={resourceUnpaidInterest}
                  onChange={(event) => setResourceUnpaidInterest(event.target.value)}
                />
              </label>
            </div>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetPlayerResources} disabled={isBusy || !targetPlayerId}>
                应用玩家资源
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>技能卡发放</h3>
              <p>同类型新技能会自动出现在目录里，不需要再单独加入口。</p>
            </div>
            <label className="modalField">
              <span>技能卡</span>
              <select value={selectedSkillCode} onChange={(event) => setSelectedSkillCode(event.target.value as SkillCardCode)}>
                {catalog?.skillCards.map((card) => (
                  <option key={card.code} value={card.code}>
                    [{rarityLabels[card.rarity] ?? card.rarity}] {card.name} · {card.target} · {card.costTickets} 券
                  </option>
                ))}
              </select>
            </label>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleGrantSkillCard} disabled={isBusy || !catalog?.skillCards.length}>
                发放技能卡
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>事件卡触发</h3>
              <p>好运、厄运、彩票、游乐事件都从公共牌堆直接触发，不放入手牌。</p>
            </div>
            <label className="modalField">
              <span>事件卡</span>
              <select value={selectedLuckCardId} onChange={(event) => setSelectedLuckCardId(event.target.value)}>
                {catalog?.luckCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    [{deckLabels[card.deck]}] {card.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="adminDebugInlineHint">
              {catalog?.luckCards.find((card) => card.id === selectedLuckCardId)?.description ?? "请选择一张事件卡。"}
            </p>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleTriggerLuckCard} disabled={isBusy || !catalog?.luckCards.length}>
                立即触发事件
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>传送到格子</h3>
              <p>可以只移动位置，也可以顺手把格子效果一起结算。</p>
            </div>
            <label className="modalField">
              <span>目标格子</span>
              <select value={teleportTileId} onChange={(event) => setTeleportTileId(event.target.value as TileId)}>
                {game.tiles.map((tile) => (
                  <option key={tile.id} value={tile.id}>
                    #{tile.index} {tile.name} · {tile.type}
                  </option>
                ))}
              </select>
            </label>
            <label className="adminDebugCheckbox">
              <input
                type="checkbox"
                checked={resolveTeleport}
                onChange={(event) => setResolveTeleport(event.target.checked)}
              />
              <span>传送后立即结算该格子的效果</span>
            </label>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleTeleportPlayer} disabled={isBusy || !teleportTileId}>
                执行传送
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>地产状态</h3>
              <p>直接调整地产归属、等级和抵押状态，方便测试租金链路。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField adminDebugFieldWide">
                <span>地产格</span>
                <select value={propertyTileId} onChange={(event) => setPropertyTileId(event.target.value as TileId)}>
                  {propertyTiles.map((tile) => {
                    const property = game.properties[tile.id];
                    const ownerName = property?.ownerId
                      ? game.players.find((player) => player.id === property.ownerId)?.nickname ?? property.ownerId
                      : "无主";
                    return (
                      <option key={tile.id} value={tile.id}>
                        {tile.name} · {ownerName} · {property?.level ?? 0} 级
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="modalField">
                <span>归属玩家</span>
                <select value={propertyOwnerId} onChange={(event) => setPropertyOwnerId(event.target.value)}>
                  <option value="none">设为空地</option>
                  {game.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modalField">
                <span>地产等级</span>
                <input type="number" value={propertyLevel} onChange={(event) => setPropertyLevel(event.target.value)} />
              </label>
            </div>
            <label className="adminDebugCheckbox">
              <input
                type="checkbox"
                checked={propertyMortgaged}
                onChange={(event) => setPropertyMortgaged(event.target.checked)}
                disabled={propertyOwnerId === "none"}
              />
              <span>
                标记为抵押中
                {selectedPropertyState?.ownerId ? `（当前持有人：${selectedProperty?.name ?? propertyTileId}）` : ""}
              </span>
            </label>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetPropertyState} disabled={isBusy || !propertyTileId}>
                应用地产状态
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>玩家持股</h3>
              <p>直接指定股票持仓，未完成的同股票委托会自动清掉。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField adminDebugFieldWide">
                <span>股票</span>
                <select value={holdingStockId} onChange={(event) => setHoldingStockId(event.target.value as StockId)}>
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.name} · 当前价 {stock.currentPrice}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modalField">
                <span>持股数量</span>
                <input type="number" value={holdingShares} onChange={(event) => setHoldingShares(event.target.value)} />
              </label>
            </div>
            <p className="adminDebugInlineHint">
              当前选择：{selectedHoldingStock?.name ?? "未知股票"}，{targetPlayer?.nickname ?? "该玩家"} 现有{" "}
              {selectedHoldingStock && targetPlayer ? targetPlayer.stocks[selectedHoldingStock.id] ?? 0 : 0} 股。
            </p>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetPlayerHolding} disabled={isBusy || !holdingStockId}>
                应用持股
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>股票价格</h3>
              <p>房主可直接控盘，便于验证涨跌、持仓收益和结算显示。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField adminDebugFieldWide">
                <span>股票</span>
                <select value={priceStockId} onChange={(event) => setPriceStockId(event.target.value as StockId)}>
                  {stocks.map((stock) => (
                    <option key={stock.id} value={stock.id}>
                      {stock.name} · 当前价 {stock.currentPrice}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modalField">
                <span>新价格</span>
                <input type="number" step="0.01" value={stockPrice} onChange={(event) => setStockPrice(event.target.value)} />
              </label>
            </div>
            <p className="adminDebugInlineHint">
              当前价格：{selectedPriceStock?.currentPrice ?? "--"}，涨跌额：{selectedPriceStock?.change ?? "--"}。
            </p>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetStockPrice} disabled={isBusy || !priceStockId}>
                应用股价
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>拘留状态</h3>
              <p>快速送进监狱或医院，也能一键解除拘留状态。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField">
                <span>状态</span>
                <select value={detentionMode} onChange={(event) => setDetentionMode(event.target.value as "none" | "jail" | "hospital")}>
                  <option value="none">无拘留</option>
                  <option value="jail">监狱</option>
                  <option value="hospital">医院</option>
                </select>
              </label>
              <label className="modalField">
                <span>回合数</span>
                <input
                  type="number"
                  value={detentionTurns}
                  onChange={(event) => setDetentionTurns(event.target.value)}
                  disabled={detentionMode === "none"}
                />
              </label>
            </div>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetDetention} disabled={isBusy || !targetPlayerId}>
                应用拘留状态
              </button>
            </div>
          </section>

          <section className="adminDebugSection">
            <div className="adminDebugSectionHeader">
              <h3>回合与阶段</h3>
              <p>切换当前行动玩家、阶段与回合计数，也能顺手清掉待处理动作。</p>
            </div>
            <div className="adminDebugGrid">
              <label className="modalField">
                <span>当前玩家</span>
                <select value={turnPlayerId} onChange={(event) => setTurnPlayerId(event.target.value)}>
                  {game.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modalField">
                <span>阶段</span>
                <select value={turnPhase} onChange={(event) => setTurnPhase(event.target.value as GamePhase)}>
                  {Object.entries(phaseLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modalField">
                <span>第几回合</span>
                <input type="number" value={turnRound} onChange={(event) => setTurnRound(event.target.value)} />
              </label>
              <label className="modalField">
                <span>已完成行动数</span>
                <input
                  type="number"
                  value={turnCompletedTurns}
                  onChange={(event) => setTurnCompletedTurns(event.target.value)}
                />
              </label>
            </div>
            <label className="adminDebugCheckbox">
              <input
                type="checkbox"
                checked={clearPendingAction}
                onChange={(event) => setClearPendingAction(event.target.checked)}
              />
              <span>同时清空当前待处理动作</span>
            </label>
            <div className="modalActions adminDebugActions">
              <button type="button" onClick={handleSetTurnState} disabled={isBusy}>
                应用回合状态
              </button>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
