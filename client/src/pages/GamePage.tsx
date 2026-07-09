import { useEffect, useRef, useState } from "react";
import type { GameState, ModalType, MonthlyBankSettlement, MovementEvent, RoomPublicState, TileEvent } from "@monopoly/shared";
import { audioManager } from "../audio/AudioManager";
import { BottomActionBar } from "../components/BottomActionBar";
import { ConfirmBankruptcyModal } from "../components/ConfirmBankruptcyModal";
import { EventPopup } from "../components/EventPopup";
import { GameLayout } from "../components/GameLayout";
import { GraphBoard } from "../components/GraphBoard";
import { AdminDebugPanel } from "../components/AdminDebugPanel";
import { LotteryPanel } from "../components/LotteryPanel";
import { LuckCardModal } from "../components/LuckCardModal";
import { MonthlySettlementModal } from "../components/MonthlySettlementModal";
import { MyPlayerPanel } from "../components/MyPlayerPanel";
import { PathChoiceModal } from "../components/PathChoiceModal";
import { PortalChoiceModal } from "../components/PortalChoiceModal";
import { RankingModal } from "../components/RankingModal";
import { RightSidebar, type SidebarTab } from "../components/RightSidebar";
import { SkillShopModal } from "../components/SkillShopModal";
import { TopStatusBar } from "../components/TopStatusBar";
import { saveGameResult } from "../game/localResults";
import { socket } from "../socket/socket";

type MobilePanel = "me" | "info" | "actions" | null;
const compactViewportQuery = "(max-width: 860px), (max-height: 560px)";

interface GamePageProps {
  game: GameState;
  room: RoomPublicState | null;
  playerId: string | null;
}

export function GamePage({ game, room, playerId }: GamePageProps) {
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>({});
  const [visibleEvent, setVisibleEvent] = useState<TileEvent | null>(null);
  const [visibleLuckEvent, setVisibleLuckEvent] = useState<TileEvent | null>(null);
  const [diceValue, setDiceValue] = useState<number | null>(game.dice);
  const [rolling, setRolling] = useState(false);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [junctionTip, setJunctionTip] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("players");
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [monthlySettlements, setMonthlySettlements] = useState<MonthlyBankSettlement[] | null>(null);
  const [hasShownGameEndModal, setHasShownGameEndModal] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const timers = useRef<number[]>([]);
  const monthlySettlementsRef = useRef<MonthlyBankSettlement[] | null>(null);
  const monthlySettlementQueue = useRef<MonthlyBankSettlement[][]>([]);
  const closedMonthlySettlementIds = useRef<Set<string>>(new Set());
  const playerReadyAt = useRef<Record<string, number>>({});
  const savedResultId = useRef<string | null>(null);
  const canRestart = game.status === "ended" && Boolean(room?.hostId && room.hostId === playerId);
  const isHost = Boolean(room?.hostId && room.hostId === playerId);

  useEffect(() => {
    monthlySettlementsRef.current = monthlySettlements;
  }, [monthlySettlements]);

  useEffect(() => {
    const pending = game.pendingMonthlySettlement;
    if (!pending || closedMonthlySettlementIds.current.has(pending.id)) {
      return;
    }
    if (!monthlySettlementsRef.current) {
      setMonthlySettlements(pending.settlements);
    }
  }, [game.pendingMonthlySettlement]);

  useEffect(() => {
    setAnimatedPositions((previous) => {
      const next = { ...previous };
      for (const player of game.players) {
        if (next[player.id] === undefined || player.bankrupt) {
          next[player.id] = player.position;
        }
      }
      return next;
    });
  }, [game.players]);

  useEffect(() => {
    if (game.status !== "ended") {
      setHasShownGameEndModal(false);
      if (activeModal === "gameEnd") {
        setActiveModal(null);
      }
      return;
    }
    if (!hasShownGameEndModal) {
      setActiveModal("gameEnd");
      setHasShownGameEndModal(true);
    }
  }, [activeModal, game.status, hasShownGameEndModal]);

  useEffect(() => {
    if (game.status !== "ended" || !game.endedAt) {
      return;
    }
    const resultId = `${game.roomId}-${game.endedAt}`;
    if (savedResultId.current === resultId) {
      return;
    }
    saveGameResult(game);
    savedResultId.current = resultId;
  }, [game]);

  useEffect(() => {
    if (!mobilePanel) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobilePanel(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobilePanel]);

  useEffect(() => {
    if (!isHost && adminPanelOpen) {
      setAdminPanelOpen(false);
    }
  }, [adminPanelOpen, isHost]);

  useEffect(() => {
    function schedule(callback: () => void, delay: number) {
      const timer = window.setTimeout(callback, delay);
      timers.current.push(timer);
    }

    function onDiceRolled(payload: { playerId: string; value: number }) {
      audioManager.playSfx("dice");
      setRolling(true);
      setDiceValue(null);
      schedule(() => {
        setDiceValue(payload.value);
        setRolling(false);
      }, 700);
    }

    function onPlayerMoved(payload: MovementEvent) {
      audioManager.playSfx("move");
      const now = Date.now();
      const readyAt = playerReadyAt.current[payload.playerId] ?? now;
      const baseDelay = Math.max(0, readyAt - now);
      const positions = payload.path.length > 0 ? payload.path : [payload.to];

      schedule(() => {
        setAnimatedPositions((previous) => ({ ...previous, [payload.playerId]: payload.from }));
      }, baseDelay);

      positions.forEach((position, index) => {
        schedule(() => {
          setAnimatedPositions((previous) => ({ ...previous, [payload.playerId]: position }));
        }, baseDelay + (index + 1) * 230);
      });

      playerReadyAt.current = {
        ...playerReadyAt.current,
        [payload.playerId]: now + baseDelay + (positions.length + 1) * 230
      };
    }

    function onTileEvent(event: TileEvent) {
      if (event.playerId !== playerId || event.card) {
        return;
      }
      schedule(() => {
        audioManager.playSfx(event.tone === "good" ? "lucky" : event.tone === "bad" ? "bad" : "notice");
        setVisibleEvent(event);
      }, 350);
      schedule(() => {
        setVisibleEvent(null);
      }, 4600);
    }

    function onLuckCard(payload: { playerId: string; tileEvent: TileEvent }) {
      if (payload.playerId !== playerId) {
        return;
      }
      schedule(() => {
        audioManager.playSfx(payload.tileEvent.tone === "bad" ? "bad" : "lucky");
        audioManager.speak(payload.tileEvent.title);
        setVisibleLuckEvent(payload.tileEvent);
      }, 350);
      schedule(() => {
        setVisibleLuckEvent(null);
      }, 5600);
    }

    function onJunctionDirection(payload: { playerId: string; directionLabel: string }) {
      if (payload.playerId !== playerId) {
        return;
      }
      setJunctionTip(`系统决定方向：${payload.directionLabel}`);
      schedule(() => setJunctionTip(null), 3000);
    }

    const onTeleported = () => audioManager.playSfx("portal");
    const onStockUpdated = () => audioManager.playSfx("stock");
    const onMarketAnnouncement = () => audioManager.playSfx("notice");
    const onSkillBought = () => audioManager.playSfx("buy");
    const onSkillRecycled = () => audioManager.playSfx("buy");
    const onBankrupted = () => audioManager.playSfx("bankrupt");
    const onGameEnded = () => audioManager.playSfx("victory");
    const onMonthlySettlement = (payload: { settlements: MonthlyBankSettlement[] }) => {
      if (payload.settlements.length > 0) {
        audioManager.playSfx("notice");
        if (monthlySettlementsRef.current) {
          monthlySettlementQueue.current.push(payload.settlements);
        } else {
          setMonthlySettlements(payload.settlements);
        }
      }
    };

    socket.on("diceRolled", onDiceRolled);
    socket.on("playerMoved", onPlayerMoved);
    socket.on("tileEventTriggered", onTileEvent);
    socket.on("luckCardDrawn", onLuckCard);
    socket.on("junctionDirectionDecided", onJunctionDirection);
    socket.on("playerTeleported", onTeleported);
    socket.on("stockMarketUpdated", onStockUpdated);
    socket.on("stockSettlementCompleted", onStockUpdated);
    socket.on("marketAnnouncementCreated", onMarketAnnouncement);
    socket.on("skillCardBought", onSkillBought);
    socket.on("skillCardRecycled", onSkillRecycled);
    socket.on("playerBankrupted", onBankrupted);
    socket.on("gameEnded", onGameEnded);
    socket.on("monthlyBankSettlement", onMonthlySettlement);

    return () => {
      socket.off("diceRolled", onDiceRolled);
      socket.off("playerMoved", onPlayerMoved);
      socket.off("tileEventTriggered", onTileEvent);
      socket.off("luckCardDrawn", onLuckCard);
      socket.off("junctionDirectionDecided", onJunctionDirection);
      socket.off("playerTeleported", onTeleported);
      socket.off("stockMarketUpdated", onStockUpdated);
      socket.off("stockSettlementCompleted", onStockUpdated);
      socket.off("marketAnnouncementCreated", onMarketAnnouncement);
      socket.off("skillCardBought", onSkillBought);
      socket.off("skillCardRecycled", onSkillRecycled);
      socket.off("playerBankrupted", onBankrupted);
      socket.off("gameEnded", onGameEnded);
      socket.off("monthlyBankSettlement", onMonthlySettlement);
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
      timers.current = [];
    };
  }, [playerId]);

  function selectTile(tileId: string) {
    setSelectedTileId(tileId);
    setSidebarTab("players");
    openMobilePanel("info");
  }

  function confirmBankruptcy() {
    setActiveModal(null);
    socket.emit("declareBankruptcy");
  }

  function restartGame() {
    setActiveModal(null);
    socket.emit("restartGame");
  }

  function closeMonthlySettlement() {
    const pendingId = game.pendingMonthlySettlement?.id;
    if (pendingId) {
      closedMonthlySettlementIds.current.add(pendingId);
      socket.emit("closeMonthlySettlement", { settlementId: pendingId });
    }
    const next = monthlySettlementQueue.current.shift() ?? null;
    setMonthlySettlements(next);
  }

  function openMobilePanel(panel: Exclude<MobilePanel, null>) {
    if (window.matchMedia(compactViewportQuery).matches) {
      setMobilePanel(panel);
    }
  }

  function openStocks() {
    setSidebarTab("stocks");
    openMobilePanel("info");
  }

  function openLog() {
    setSidebarTab("log");
    openMobilePanel("info");
  }

  function openAdminPanel() {
    setMobilePanel(null);
    setAdminPanelOpen(true);
  }

  function renderMyPanel() {
    return <MyPlayerPanel game={game} playerId={playerId} />;
  }

  function renderSidebar() {
    return (
      <RightSidebar
        game={game}
        room={room}
        playerId={playerId}
        selectedTileId={selectedTileId}
        activeTab={sidebarTab}
        onChangeTab={setSidebarTab}
      />
    );
  }

  function renderBottomActions() {
    return (
      <BottomActionBar
        game={game}
        playerId={playerId}
        diceValue={diceValue}
        rolling={rolling}
        onOpenStocks={openStocks}
        onOpenLog={openLog}
        onRequestBankruptcy={() => setActiveModal("confirmBankruptcy")}
      />
    );
  }

  const mobilePanelTitle =
    mobilePanel === "me"
      ? "我的信息"
      : mobilePanel === "info"
        ? "公共信息"
        : mobilePanel === "actions"
          ? "本回合操作"
          : "";

  return (
    <main className="gamePage">
      <GameLayout
        top={
          <TopStatusBar
            game={game}
            onOpenRanking={() => setActiveModal("gameEnd")}
            canRestart={canRestart}
            onRestart={restartGame}
          />
        }
        board={
          <>
            <GraphBoard
              game={game}
              animatedPositions={animatedPositions}
              localPlayerId={playerId}
              selectedTileId={selectedTileId}
              onSelectTile={selectTile}
            />
            {junctionTip && <div className="junctionTip">{junctionTip}</div>}
          </>
        }
        left={<MyPlayerPanel game={game} playerId={playerId} />}
        sidebar={renderSidebar()}
        bottom={renderBottomActions()}
      >
        <nav className="mobileGameDock" aria-label="手机游戏面板">
          <button type="button" onClick={() => setMobilePanel("me")}>
            我的
          </button>
          <button type="button" onClick={() => setMobilePanel("info")}>
            信息
          </button>
          <button type="button" onClick={() => setMobilePanel("actions")}>
            操作
          </button>
          <button type="button" onClick={() => setMobilePanel(null)}>
            地图
          </button>
        </nav>
        {mobilePanel && (
          <div className="mobilePanelOverlay" onClick={() => setMobilePanel(null)}>
            <section
              className={`mobilePanelSheet mobilePanel-${mobilePanel}`}
              role="dialog"
              aria-modal="true"
              aria-label={mobilePanelTitle}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="mobilePanelHeader">
                <strong>{mobilePanelTitle}</strong>
                <button type="button" onClick={() => setMobilePanel(null)} aria-label="关闭手机面板">
                  ×
                </button>
              </header>
              <div className="mobilePanelContent">
                {mobilePanel === "me" && renderMyPanel()}
                {mobilePanel === "info" && renderSidebar()}
                {mobilePanel === "actions" && renderBottomActions()}
              </div>
            </section>
          </div>
        )}
        <EventPopup event={visibleEvent} onClose={() => setVisibleEvent(null)} />
        <LuckCardModal event={visibleLuckEvent} onClose={() => setVisibleLuckEvent(null)} />
        <PathChoiceModal game={game} playerId={playerId} />
        <PortalChoiceModal game={game} playerId={playerId} />
        <LotteryPanel game={game} playerId={playerId} />
        <SkillShopModal game={game} playerId={playerId} />
        <MonthlySettlementModal
          game={game}
          settlements={monthlySettlements}
          onClose={closeMonthlySettlement}
        />
        <RankingModal
          game={game}
          isOpen={activeModal === "gameEnd"}
          onClose={() => setActiveModal(null)}
          canRestart={canRestart}
          onRestart={restartGame}
        />
        <ConfirmBankruptcyModal
          isOpen={activeModal === "confirmBankruptcy"}
          onCancel={() => setActiveModal(null)}
          onConfirm={confirmBankruptcy}
        />
      </GameLayout>
      {isHost && (
        <button className="adminDebugTrigger" type="button" onClick={openAdminPanel}>
          管理员模式
        </button>
      )}
      {adminPanelOpen && (
        <AdminDebugPanel
          game={game}
          room={room}
          playerId={playerId}
          isOpen={adminPanelOpen}
          onClose={() => setAdminPanelOpen(false)}
        />
      )}
    </main>
  );
}
