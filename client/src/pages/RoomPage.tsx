import { Bot, Check, Crown, Play, Radio, Save, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS, START_TILE_OPTIONS, type EndCondition, type GameDurationMode, type GameSettings, type RoomPublicState, type TileId } from "@monopoly/shared";
import { AvatarPortrait } from "../components/AvatarPortrait";
import { AvatarSelectPanel } from "../components/AvatarSelectPanel";
import { ConnectionHint } from "../components/ConnectionHint";
import { useI18n } from "../i18n";
import { socket } from "../socket/socket";

interface RoomPageProps {
  room: RoomPublicState;
  playerId: string | null;
}

export function RoomPage({ room, playerId }: RoomPageProps) {
  const me = room.players.find((player) => player.id === playerId) ?? null;
  const isHost = me?.isHost ?? false;
  const canEditSettings = isHost && room.status === "lobby";
  const allReady = room.players.length >= MIN_ROOM_PLAYERS && room.players.every((player) => player.ready);
  const aiPlayerCount = room.players.filter((player) => player.isBot).length;
  const { t } = useI18n();
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const selectedStart = START_TILE_OPTIONS.find((option) => option.tileId === me?.selectedStartTileId);
  const sharedStart = START_TILE_OPTIONS.find((option) => option.tileId === room.settings.startTileId) ?? START_TILE_OPTIONS[0];

  function updateEndCondition(endCondition: EndCondition) {
    if (!canEditSettings) return;
    socket.emit("updateSettings", { endCondition });
  }

  function updateDuration(durationMode: GameDurationMode) {
    if (!canEditSettings) return;
    socket.emit("updateSettings", { durationMode, endCondition: "rounds" });
  }

  function updateDraft(key: string, value: string) {
    setSettingDrafts((drafts) => ({ ...drafts, [key]: value }));
  }

  function saveAdvancedSettings() {
    if (!canEditSettings) return;
    const patch: Partial<GameSettings> = {};
    const numberFields: Array<{ key: keyof GameSettings; scale?: number }> = [
      { key: "initialMoney" },
      { key: "initialTickets" },
      { key: "initialSkillCardLimit" },
      { key: "lapRewardMoney" },
      { key: "lapRewardTickets" },
      { key: "bankVisitMoney" },
      { key: "bankVisitTickets" },
      { key: "stockTradeFeeRate", scale: 100 },
      { key: "depositMonthlyRate", scale: 100 },
      { key: "loanMonthlyRate", scale: 100 },
      { key: "creditLimit" },
      { key: "forcedRepaymentRate", scale: 100 },
      { key: "moneyToTicketCost" },
      { key: "ticketToMoneyValue" },
      { key: "bankInitialMoney" },
      { key: "bankInitialTickets" },
      { key: "jailTurns" },
      { key: "hospitalTurns" },
      { key: "bailCost" },
      { key: "treatmentCost" },
      { key: "lotteryMaxTickets" },
      { key: "skillShopOfferCount" },
      { key: "turnDurationSeconds" }
    ];

    for (const field of numberFields) {
      const raw = settingDrafts[field.key];
      if (raw === undefined || raw.trim() === "") {
        continue;
      }
      const value = Number(raw);
      if (Number.isFinite(value)) {
        (patch as Record<string, number>)[field.key] = field.scale ? value / field.scale : value;
      }
    }

    const rentRaw = settingDrafts.rentMultipliers;
    if (rentRaw && rentRaw.trim()) {
      const values = rentRaw.split(/[,，/ ]+/).map(Number).filter(Number.isFinite);
      if (values.length > 0) {
        patch.rentMultipliers = values;
      }
    }

    if (Object.keys(patch).length > 0) {
      socket.emit("updateRoomSettings", patch);
      setSettingDrafts({});
    }
  }

  function kickPlayer(targetPlayerId: string, nickname: string) {
    if (!window.confirm(`确定要将 ${nickname} 移出房间吗？`)) {
      return;
    }
    socket.emit("kickPlayer", { roomId: room.id, targetPlayerId });
  }

  function addAiPlayer() {
    if (!canEditSettings || room.players.length >= MAX_ROOM_PLAYERS) return;
    socket.emit("addAiPlayer");
  }

  function removeAiPlayer(targetPlayerId: string) {
    if (!canEditSettings) return;
    socket.emit("removeAiPlayer", { playerId: targetPlayerId });
  }

  function selectStartTile(tileId: TileId) {
    socket.emit("selectStartTile", { tileId });
  }

  function updateSharedStart(enabled: boolean) {
    if (!canEditSettings) return;
    socket.emit("updateSettings", { useSharedStartTile: enabled });
  }

  function updateSharedStartTile(tileId: TileId) {
    if (!canEditSettings) return;
    socket.emit("updateSettings", { startTileId: tileId });
  }

  return (
    <main className="roomPage">
      <section className="roomPanel">
        <div className="roomHeader">
          <div>
            <span className="eyebrow">{t("room")}</span>
            <h1>{room.id}</h1>
          </div>
          <span className="statusPill">
            <Radio size={16} />
            {room.status}
          </span>
        </div>
        <div className="roomStats">
          <span>
            <Users size={16} />
            {room.players.length} / {MAX_ROOM_PLAYERS}
          </span>
          <span>
            <Bot size={16} />
            AI {aiPlayerCount}
          </span>
          <span>
            <Crown size={16} />
            {room.players.find((player) => player.isHost)?.nickname ?? t("host")}
          </span>
        </div>
        <AvatarSelectPanel room={room} playerId={playerId} />
        <section className="startSelectPanel">
          <div className="panelHeader">
            <span className="eyebrow">出生点</span>
            <strong>选择开局角落</strong>
          </div>
          <p>
            当前选择：<strong>{selectedStart?.nameZh ?? "未选择"}</strong>
            <small>
              {room.settings.lapRewardMode === "home"
                ? "奖励点为每位玩家自己的出生点。"
                : "奖励点统一为左上 GO，经过 GO 才获得一圈奖励。"}
            </small>
          </p>
          <div className="startRuleSummary">
            <span>
              出发方式：<strong>{room.settings.useSharedStartTile ? `统一从 ${sharedStart?.nameZh ?? "GO"} 出发` : "玩家各自选择出生点"}</strong>
            </span>
            <span>
              领奖方式：<strong>{room.settings.lapRewardMode === "home" ? "经过各自出生点领奖" : "统一经过左上角 GO 领奖"}</strong>
            </span>
          </div>
          <div className="startChoiceGrid">
            {START_TILE_OPTIONS.map((option) => {
              const occupiedBy = room.players.find(
                (player) => player.id !== playerId && player.selectedStartTileId === option.tileId
              );
              const isSelected = me?.selectedStartTileId === option.tileId;
              return (
                <button
                  key={option.tileId}
                  type="button"
                  className={`startChoice ${isSelected ? "selected" : ""} ${occupiedBy ? "occupied" : ""}`}
                  disabled={room.settings.useSharedStartTile || Boolean(occupiedBy) || room.status !== "lobby"}
                  onClick={() => selectStartTile(option.tileId)}
                >
                  <strong>{option.nameZh}</strong>
                  <small>
                    {room.settings.useSharedStartTile ? "统一出发中" : isSelected ? "我的出生点" : occupiedBy ? `${occupiedBy.nickname} 已选择` : "可选择"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
        <section className="settingsPanel">
          <div className="panelHeader">
            <span className="eyebrow">{t("gameSettings")}</span>
            <strong>{t("settlement")}</strong>
          </div>
          <div className="segmentedControl" aria-label={t("settlement")}>
            <button
              className={room.settings.endCondition === "rounds" ? "active" : ""}
              disabled={!canEditSettings}
              onClick={() => updateEndCondition("rounds")}
              type="button"
            >
              {t("roundMode")}
            </button>
            <button
              className={room.settings.endCondition === "bankruptcy" ? "active" : ""}
              disabled={!canEditSettings}
              onClick={() => updateEndCondition("bankruptcy")}
              type="button"
            >
              {t("bankruptcyMode")}
            </button>
          </div>
          <div className="settingsGrid">
            <label>
              游戏时长
              <select
                value={room.settings.durationMode}
                disabled={!canEditSettings || room.settings.endCondition !== "rounds"}
                onChange={(event) => updateDuration(event.target.value as GameDurationMode)}
              >
                <option value="short_3_months">短局：3 个月</option>
                <option value="standard_1_year">标准局：1 年</option>
                <option value="long_2_years">长局：2 年</option>
              </select>
            </label>
            <label>
              初始金币
              <input
                type="number"
                step={500}
                placeholder={`${room.settings.initialMoney}`}
                value={settingDrafts.initialMoney ?? ""}
                disabled={!canEditSettings}
                onChange={(event) => updateDraft("initialMoney", event.target.value)}
              />
            </label>
            <label>
              初始彩券
              <input
                type="number"
                step={1}
                placeholder={`${room.settings.initialTickets}`}
                value={settingDrafts.initialTickets ?? ""}
                disabled={!canEditSettings}
                onChange={(event) => updateDraft("initialTickets", event.target.value)}
              />
            </label>
            {[
              ["initialSkillCardLimit", "手牌上限", room.settings.initialSkillCardLimit],
              ["lapRewardMoney", "一圈金币", room.settings.lapRewardMoney],
              ["lapRewardTickets", "一圈彩券", room.settings.lapRewardTickets],
              ["bankVisitMoney", "银行赠金", room.settings.bankVisitMoney],
              ["bankVisitTickets", "银行赠券", room.settings.bankVisitTickets],
              ["stockTradeFeeRate", "股票费率%", Math.round(room.settings.stockTradeFeeRate * 10000) / 100],
              ["depositMonthlyRate", "存款月息%", Math.round(room.settings.depositMonthlyRate * 10000) / 100],
              ["loanMonthlyRate", "借款月息%", Math.round(room.settings.loanMonthlyRate * 10000) / 100],
              ["creditLimit", "信用额度", room.settings.creditLimit],
              ["forcedRepaymentRate", "强制还款%", Math.round((room.settings.forcedRepaymentRate ?? 0.2) * 10000) / 100],
              ["moneyToTicketCost", "金币换券", room.settings.moneyToTicketCost],
              ["ticketToMoneyValue", "彩券换金", room.settings.ticketToMoneyValue],
              ["bankInitialMoney", "银行初始金币", room.settings.bankInitialMoney],
              ["bankInitialTickets", "银行初始彩券", room.settings.bankInitialTickets],
              ["jailTurns", "监狱回合", room.settings.jailTurns],
              ["hospitalTurns", "医院回合", room.settings.hospitalTurns],
              ["bailCost", "保释金", room.settings.bailCost],
              ["treatmentCost", "治疗费", room.settings.treatmentCost],
              ["lotteryMaxTickets", "彩票上限", room.settings.lotteryMaxTickets],
              ["skillShopOfferCount", "商店展示", room.settings.skillShopOfferCount],
              ["turnDurationSeconds", "回合秒数", room.settings.turnDurationSeconds]
            ].map(([key, label, value]) => (
              <label key={String(key)}>
                {label}
                <input
                  type="number"
                  placeholder={`${value}`}
                  value={settingDrafts[String(key)] ?? ""}
                  disabled={!canEditSettings}
                  onChange={(event) => updateDraft(String(key), event.target.value)}
                />
              </label>
            ))}
            <label>
              地租倍率
              <input
                type="text"
                placeholder={room.settings.rentMultipliers.join(",")}
                value={settingDrafts.rentMultipliers ?? ""}
                disabled={!canEditSettings}
                onChange={(event) => updateDraft("rentMultipliers", event.target.value)}
              />
            </label>
            <label className="checkSetting">
              <input
                type="checkbox"
                checked={room.settings.useSharedStartTile}
                disabled={!canEditSettings}
                onChange={(event) => updateSharedStart(event.target.checked)}
              />
              <span>
                <strong>统一出生点</strong>
                <small>开启后所有玩家从房主指定的同一个角落出发。</small>
              </span>
            </label>
            <label>
              统一出生位置
              <select
                value={room.settings.startTileId}
                disabled={!canEditSettings || !room.settings.useSharedStartTile}
                onChange={(event) => updateSharedStartTile(event.target.value as TileId)}
              >
                {START_TILE_OPTIONS.map((option) => (
                  <option key={option.tileId} value={option.tileId}>
                    {option.nameZh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              一圈奖励领取点
              <select
                value={room.settings.lapRewardMode}
                disabled={!canEditSettings}
                onChange={(event) => socket.emit("updateSettings", { lapRewardMode: event.target.value as GameSettings["lapRewardMode"] })}
              >
                <option value="go">统一左上 GO</option>
                <option value="home">各自出生点</option>
              </select>
            </label>
            <label className="checkSetting">
              <input
                type="checkbox"
                checked={room.settings.allowVoluntaryBankruptcy}
                disabled={!canEditSettings}
                onChange={(event) =>
                  socket.emit("updateSettings", { allowVoluntaryBankruptcy: event.target.checked })
                }
              />
              <span>
                <strong>{t("voluntaryBankruptcy")}</strong>
                <small>{t("voluntaryBankruptcyHint")}</small>
              </span>
            </label>
            <label className="checkSetting">
              <input
                type="checkbox"
                checked={room.settings.enableRandomAnnouncements}
                disabled={!canEditSettings}
                onChange={(event) => socket.emit("updateSettings", { enableRandomAnnouncements: event.target.checked })}
              />
              <span>
                <strong>启用随机公告</strong>
                <small>关闭后股市只受月度主题、事件和玩家情报影响。</small>
              </span>
            </label>
            <label className="checkSetting">
              <input
                type="checkbox"
                checked={room.settings.allowFreeSkillCards}
                disabled={!canEditSettings}
                onChange={(event) => socket.emit("updateSettings", { allowFreeSkillCards: event.target.checked })}
              />
              <span>
                <strong>允许免费卡</strong>
                <small>商店折扣始终最低 1 彩券；该开关仅保留给后续免费卡规则。</small>
              </span>
            </label>
            <label className="checkSetting">
              <input
                type="checkbox"
                checked={room.settings.enableSpecialCards}
                disabled={!canEditSettings}
                onChange={(event) => socket.emit("updateSettings", { enableSpecialCards: event.target.checked })}
              />
              <span>
                <strong>启用特殊卡</strong>
                <small>关闭后后续强力技能卡不会进入商店池。</small>
              </span>
            </label>
          </div>
          {isHost && (
            <button className="primaryButton saveSettingsButton" type="button" disabled={!canEditSettings} onClick={saveAdvancedSettings}>
              <Save size={16} />
              保存数值设置
            </button>
          )}
        </section>
        <div className="lobbyPlayers">
          {room.players.map((player) => (
            <article key={player.id} className={`lobbyPlayer ${player.id === playerId ? "mine" : ""}`}>
              <span className="avatarDot" style={{ backgroundColor: player.color }}>
                <AvatarPortrait avatarId={player.selectedAvatarId} fallbackColor={player.color} size="small" />
              </span>
              <div>
                <strong>{player.nickname}</strong>
                <small>
                  {player.isBot ? "AI 补位" : player.isHost ? t("host") : t("guest")} · {player.isBot ? "自动行动" : player.connected ? t("online") : t("offline")}
                </small>
                <small>
                  出生点：{room.settings.useSharedStartTile ? `统一 ${sharedStart?.nameZh ?? "GO"}` : START_TILE_OPTIONS.find((option) => option.tileId === player.selectedStartTileId)?.nameZh ?? "未选择"}
                </small>
              </div>
              <em className={player.ready ? "ready" : ""}>
                <Check size={14} />
                {player.ready ? t("ready") : t("waiting")}
              </em>
              {isHost && room.status === "lobby" && !player.isHost && (
                player.isBot ? (
                  <button
                    className="kickButton aiRemoveButton"
                    type="button"
                    onClick={() => removeAiPlayer(player.id)}
                    title="移除 AI 补位"
                  >
                    <UserMinus size={14} />
                    移除 AI
                  </button>
                ) : (
                  <button
                    className="kickButton"
                    type="button"
                    onClick={() => kickPlayer(player.id, player.nickname)}
                    title="踢出成员"
                  >
                    <UserMinus size={14} />
                    踢出
                  </button>
                )
              )}
            </article>
          ))}
        </div>
        {room.players.length < MIN_ROOM_PLAYERS && <p className="modalHint">至少需要 {MIN_ROOM_PLAYERS} 名玩家才能开始游戏。</p>}
        <div className="roomButtons">
          {isHost && (
            <button
              type="button"
              className="aiFillButton"
              disabled={!canEditSettings || room.players.length >= MAX_ROOM_PLAYERS}
              onClick={addAiPlayer}
              title={room.players.length >= MAX_ROOM_PLAYERS ? "房间已满" : "添加一个服务端自动行动的 AI 玩家"}
            >
              <Bot size={18} />
              添加 AI 补位
            </button>
          )}
          <button
            className={me?.ready ? "primaryButton" : ""}
            onClick={() => socket.emit("setReady", { ready: !(me?.ready ?? false) })}
          >
            <Check size={18} />
            {me?.ready ? t("ready") : t("setReady")}
          </button>
          <button className="primaryButton" disabled={!isHost || !allReady} onClick={() => socket.emit("startGame")}>
            <Play size={18} />
            {t("startGame")}
          </button>
        </div>
        <ConnectionHint roomId={room.id} />
      </section>
    </main>
  );
}
