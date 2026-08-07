import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, MarketSignal, RoomPublicState, SocketAck } from "@monopoly/shared";
import { audioManager } from "./audio/AudioManager";
import { AudioSettingsPanel } from "./components/AudioSettingsPanel";
import { I18nProvider, type Language, useI18n } from "./i18n";
import { GamePage } from "./pages/GamePage";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { shouldDiscardReconnectSession } from "./game/sessionPolicy";
import { socket } from "./socket/socket";

type View = "home" | "room" | "game";

interface StoredSession {
  roomId: string;
  playerId: string;
  nickname: string;
  reconnectToken: string;
}

const sessionKey = "monopoly-online-session";
const languageKey = "monopoly-online-language";

function loadSession(): StoredSession | null {
  const raw = window.localStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.roomId === "string" &&
      typeof parsed.playerId === "string" &&
      typeof parsed.nickname === "string" &&
      typeof parsed.reconnectToken === "string"
    ) {
      return parsed as StoredSession;
    }
    window.localStorage.removeItem(sessionKey);
    return null;
  } catch {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
}

function saveSession(session: StoredSession): void {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

function loadLanguage(): Language {
  const saved = window.localStorage.getItem(languageKey);
  return saved === "en" ? "en" : "zh";
}

function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="languageSwitch" aria-label={t("language")}>
      <button
        className={language === "zh" ? "active" : ""}
        onClick={() => setLanguage("zh")}
        type="button"
      >
        {t("zh")}
      </button>
      <button
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}

export function App() {
  const savedSession = useMemo(loadSession, []);
  const [language, setLanguageState] = useState<Language>(loadLanguage);
  const [view, setView] = useState<View>("home");
  const [room, setRoom] = useState<RoomPublicState | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(savedSession?.playerId ?? null);
  const [nickname, setNickname] = useState(savedSession?.nickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [marketSignalPopup, setMarketSignalPopup] = useState<MarketSignal | null>(null);
  const triedReconnect = useRef(false);

  function setLanguage(language: Language) {
    setLanguageState(language);
    window.localStorage.setItem(languageKey, language);
  }

  useEffect(() => {
    if (view === "game") {
      audioManager.setScene(game?.status === "ended" ? "ended" : "game");
      return;
    }
    audioManager.setScene(view === "home" || view === "room" ? "lobby" : "silent");
  }, [game?.status, view]);

  useEffect(() => {
    function showError(message: string) {
      setError(message);
      audioManager.playSfx("bad");
      window.setTimeout(() => setError(null), 3500);
    }

    function onRoomUpdated(nextRoom: RoomPublicState) {
      setRoom(nextRoom);
      if (nextRoom.status === "lobby") {
        setGame(null);
        setView("room");
      }
    }

    function onGameStarted(nextGame: GameState) {
      setGame(nextGame);
      setView("game");
    }

    function onGameStateUpdated(nextGame: GameState) {
      setGame(nextGame);
      setView("game");
    }

    function onPlayerKicked(payload: { playerId: string; message: string }) {
      if (payload.playerId !== playerId) {
        return;
      }
      window.localStorage.removeItem(sessionKey);
      setRoom(null);
      setGame(null);
      setPlayerId(null);
      setView("home");
      showError(payload.message);
    }

    socket.on("roomUpdated", onRoomUpdated);
    socket.on("gameStarted", onGameStarted);
    socket.on("gameStateUpdated", onGameStateUpdated);
    socket.on("playerKicked", onPlayerKicked);
    socket.on("privateMarketSignal", (payload) => {
      setMarketSignalPopup(payload.signal);
      audioManager.playSfx("stock");
    });
    socket.on("errorMessage", (payload) => showError(payload.message));
    socket.on("connect_error", () => showError("暂时连接不到游戏服务器。"));

    return () => {
      socket.off("roomUpdated", onRoomUpdated);
      socket.off("gameStarted", onGameStarted);
      socket.off("gameStateUpdated", onGameStateUpdated);
      socket.off("playerKicked", onPlayerKicked);
      socket.off("privateMarketSignal");
      socket.off("errorMessage");
      socket.off("connect_error");
    };
  }, [playerId]);

  useEffect(() => {
    if (triedReconnect.current || !savedSession) {
      return;
    }
    triedReconnect.current = true;
    socket.emit(
      "joinRoom",
      {
        roomId: savedSession.roomId,
        nickname: savedSession.nickname,
        playerId: savedSession.playerId,
        reconnectToken: savedSession.reconnectToken
      },
      (response: SocketAck) => {
        if (!response.ok || !response.room || !response.playerId || !response.reconnectToken) {
          window.localStorage.removeItem(sessionKey);
          setPlayerId(null);
          return;
        }
        setRoom(response.room);
        setPlayerId(response.playerId);
        saveSession({
          roomId: response.room.id,
          playerId: response.playerId,
          nickname: savedSession.nickname,
          reconnectToken: response.reconnectToken
        });
        setNickname(savedSession.nickname);
        if (response.game) {
          setGame(response.game);
          setView("game");
        } else {
          setView("room");
        }
      }
    );
  }, [savedSession]);

  function handleCreateRoom(nextNickname: string) {
    const cleanNickname = nextNickname.trim() || "玩家";
    socket.emit("createRoom", { nickname: cleanNickname }, (response: SocketAck) => {
      if (!response.ok || !response.room || !response.playerId || !response.reconnectToken) {
        setError(response.error ?? "无法创建房间。");
        return;
      }
      setNickname(cleanNickname);
      setRoom(response.room);
      setPlayerId(response.playerId);
      saveSession({
        roomId: response.room.id,
        playerId: response.playerId,
        nickname: cleanNickname,
        reconnectToken: response.reconnectToken
      });
      setView("room");
    });
  }

  function handleJoinRoom(roomId: string, nextNickname: string) {
    const cleanRoomId = roomId.trim().toUpperCase();
    const cleanNickname = nextNickname.trim() || "玩家";
    const saved = loadSession();
    const reconnectPlayerId = saved?.roomId === cleanRoomId ? saved.playerId : undefined;
    const reconnectToken = saved?.roomId === cleanRoomId ? saved.reconnectToken : undefined;

    const joinPayload: { roomId: string; nickname: string; playerId?: string; reconnectToken?: string } = {
      roomId: cleanRoomId,
      nickname: cleanNickname
    };
    if (reconnectPlayerId && reconnectToken) {
      joinPayload.playerId = reconnectPlayerId;
      joinPayload.reconnectToken = reconnectToken;
    }

    socket.emit(
      "joinRoom",
      joinPayload,
      (response: SocketAck) => {
        if (!response.ok || !response.room || !response.playerId || !response.reconnectToken) {
          if (shouldDiscardReconnectSession(response.error)) {
            window.localStorage.removeItem(sessionKey);
            setPlayerId(null);
          }
          setError(response.error ?? "无法加入房间。");
          return;
        }
        setNickname(cleanNickname);
        setRoom(response.room);
        setPlayerId(response.playerId);
        saveSession({
          roomId: response.room.id,
          playerId: response.playerId,
          nickname: cleanNickname,
          reconnectToken: response.reconnectToken
        });
        if (response.game) {
          setGame(response.game);
          setView("game");
        } else {
          setView("room");
        }
      }
    );
  }

  return (
    <I18nProvider language={language} setLanguage={setLanguage}>
      <LanguageSwitch />
      <AudioSettingsPanel roomId={room?.id ?? null} playerId={playerId} players={room?.players ?? game?.players ?? []} />
      {view === "home" && (
        <HomePage initialNickname={nickname} onCreate={handleCreateRoom} onJoin={handleJoinRoom} />
      )}
      {view === "room" && room && <RoomPage room={room} playerId={playerId} />}
      {view === "game" && game && <GamePage game={game} room={room} playerId={playerId} />}
      {marketSignalPopup && (
        <div className="eventOverlay" onClick={() => setMarketSignalPopup(null)}>
          <article className="eventPopup neutral marketSignalPopup" onClick={(event) => event.stopPropagation()}>
            <button className="modalCloseButton" type="button" onClick={() => setMarketSignalPopup(null)} aria-label="关闭">
              ×
            </button>
            <span className="eventSticker" aria-hidden="true">股</span>
            <span className="eventHeadline">股市情报</span>
            <h3>下一交易日提示</h3>
            <p>{marketSignalPopup.message}</p>
            <p className="modalHint">
              目标日期：{marketSignalPopup.targetDate.year} 年 {marketSignalPopup.targetDate.month} 月 {marketSignalPopup.targetDate.day} 日
              {" · "}准确率 {Math.round(marketSignalPopup.accuracy * 100)}%
            </p>
            <button className="primaryButton" type="button" onClick={() => setMarketSignalPopup(null)}>
              知道了
            </button>
          </article>
        </div>
      )}
      {error && <div className="toast">{error}</div>}
    </I18nProvider>
  );
}
