import { createContext, type ReactNode, useContext } from "react";
import type { Tile, TileType } from "@monopoly/shared";

export type Language = "zh" | "en";

type DictionaryKey =
  | "appName"
  | "tagline"
  | "homeSubtitle"
  | "nickname"
  | "createRoom"
  | "join"
  | "roomId"
  | "room"
  | "status"
  | "host"
  | "guest"
  | "online"
  | "offline"
  | "ready"
  | "waiting"
  | "setReady"
  | "startGame"
  | "players"
  | "gameSettings"
  | "settlement"
  | "roundMode"
  | "bankruptcyMode"
  | "rounds"
  | "voluntaryBankruptcy"
  | "voluntaryBankruptcyHint"
  | "roll"
  | "buy"
  | "upgrade"
  | "endTurn"
  | "declareBankruptcy"
  | "buyStock"
  | "sellStock"
  | "cash"
  | "asset"
  | "tile"
  | "lots"
  | "active"
  | "log"
  | "chat"
  | "message"
  | "sendMessage"
  | "tileEvent"
  | "ok"
  | "finalRanking"
  | "gameOver"
  | "round"
  | "turn"
  | "done"
  | "stockMarket"
  | "cameraFollow"
  | "cameraOverview"
  | "cameraZoomIn"
  | "cameraZoomOut"
  | "language"
  | "zh"
  | "en";

const dictionaries: Record<Language, Record<DictionaryKey, string>> = {
  zh: {
    appName: "奇趣财富岛",
    tagline: "实时联网大富翁",
    homeSubtitle: "买地造楼、交易股票、碰运气事件，最后用资产说话。",
    nickname: "昵称",
    createRoom: "创建房间",
    join: "加入",
    roomId: "房间号",
    room: "房间",
    status: "状态",
    host: "房主",
    guest: "玩家",
    online: "在线",
    offline: "离线",
    ready: "已准备",
    waiting: "等待中",
    setReady: "准备",
    startGame: "开始游戏",
    players: "玩家",
    gameSettings: "游戏设置",
    settlement: "结算方式",
    roundMode: "固定轮数",
    bankruptcyMode: "破产决胜",
    rounds: "轮数",
    voluntaryBankruptcy: "允许主动破产",
    voluntaryBankruptcyHint: "开启后，玩家可主动认输并进入观战。",
    roll: "掷骰子",
    buy: "购买",
    upgrade: "升级",
    endTurn: "结束回合",
    declareBankruptcy: "主动破产",
    buyStock: "买入",
    sellStock: "卖出",
    cash: "现金",
    asset: "资产",
    tile: "位置",
    lots: "地产",
    active: "存活",
    log: "日志",
    chat: "聊天",
    message: "消息",
    sendMessage: "发送消息",
    tileEvent: "格子事件",
    ok: "好的",
    finalRanking: "最终排行",
    gameOver: "游戏结束",
    round: "第 {round} 轮",
    turn: "当前回合",
    done: "已结束",
    stockMarket: "股票市场",
    cameraFollow: "跟随自己",
    cameraOverview: "完整地图",
    cameraZoomIn: "放大地图",
    cameraZoomOut: "缩小地图",
    language: "语言",
    zh: "中文",
    en: "English"
  },
  en: {
    appName: "Wonder Wealth Isle",
    tagline: "Realtime Board Game",
    homeSubtitle: "Build streets, trade stocks, take chances, and finish with the highest asset value.",
    nickname: "Nickname",
    createRoom: "Create Room",
    join: "Join",
    roomId: "Room ID",
    room: "Room",
    status: "Status",
    host: "Host",
    guest: "Guest",
    online: "Online",
    offline: "Offline",
    ready: "Ready",
    waiting: "Waiting",
    setReady: "Set Ready",
    startGame: "Start Game",
    players: "Players",
    gameSettings: "Game Settings",
    settlement: "Settlement",
    roundMode: "Round Limit",
    bankruptcyMode: "Bankruptcy",
    rounds: "Rounds",
    voluntaryBankruptcy: "Voluntary Bankruptcy",
    voluntaryBankruptcyHint: "Players can concede and keep watching.",
    roll: "Roll",
    buy: "Buy",
    upgrade: "Upgrade",
    endTurn: "End Turn",
    declareBankruptcy: "Bankrupt",
    buyStock: "Buy",
    sellStock: "Sell",
    cash: "Cash",
    asset: "Asset",
    tile: "Tile",
    lots: "Lots",
    active: "Active",
    log: "Log",
    chat: "Chat",
    message: "Message",
    sendMessage: "Send message",
    tileEvent: "Tile Event",
    ok: "OK",
    finalRanking: "Final Ranking",
    gameOver: "Game Over",
    round: "Round {round}",
    turn: "Turn",
    done: "Done",
    stockMarket: "Stock Market",
    cameraFollow: "Follow Me",
    cameraOverview: "Full Map",
    cameraZoomIn: "Zoom in",
    cameraZoomOut: "Zoom out",
    language: "Language",
    zh: "中文",
    en: "English"
  }
};

const tileTypeLabels: Record<Language, Record<TileType, string>> = {
  zh: {
    start: "起点",
    property: "地产",
    bank: "银行",
    stock: "股票",
    lottery: "彩票",
    arcade: "游乐",
    chance: "好运",
    misfortune: "厄运",
    tax: "税收",
    teleport: "传送",
    portal: "传送",
    junction: "路口",
    choice_junction: "岔路",
    skillShop: "技能",
    plaza: "广场",
    safe_landing: "安全落点",
    empty: "空地",
    jail: "监狱",
    hospital: "医院",
    go_jail: "入狱",
    hospital_entry: "医院入口",
    reward: "奖励",
    draw_card: "抽卡"
  },
  en: {
    start: "Start",
    property: "Lot",
    bank: "Bank",
    stock: "Stock",
    lottery: "Prize",
    arcade: "Fun",
    chance: "Luck",
    misfortune: "Risk",
    tax: "Tax",
    teleport: "Gate",
    portal: "Gate",
    junction: "Junction",
    choice_junction: "Fork",
    skillShop: "Skill",
    plaza: "Plaza",
    safe_landing: "Safe",
    empty: "Empty",
    jail: "Jail",
    hospital: "Hospital",
    go_jail: "Go Jail",
    hospital_entry: "Hospital",
    reward: "Reward",
    draw_card: "Card"
  }
};

const zhTileNames: Record<string, string> = {
  "tile-00": "启航广场",
  "tile-01": "薄荷小院",
  "tile-02": "好运亭",
  "tile-03": "莓果街",
  "tile-04": "口袋银行",
  "tile-05": "云朵转角",
  "tile-06": "城市税",
  "tile-07": "奖券帐篷",
  "tile-08": "火箭街",
  "tile-09": "交易码头",
  "tile-10": "拼图公园",
  "tile-11": "风暴牌",
  "tile-12": "糖果庭院",
  "tile-13": "储蓄银行",
  "tile-14": "齿轮花园",
  "tile-15": "天空缆车",
  "tile-16": "星光小筑",
  "tile-17": "加分彩门",
  "tile-18": "欢乐游乐场",
  "tile-19": "大理石市场",
  "tile-20": "股票穹顶",
  "tile-21": "像素港",
  "tile-22": "豪华税",
  "tile-23": "断桥",
  "tile-24": "皇冠广场",
  "tile-25": "幸运转盘",
  "tile-26": "水晶步道",
  "tile-27": "信托银行",
  "tile-28": "闪亮机会",
  "tile-29": "海港中心",
  "tile-30": "市场大厅",
  "tile-31": "隧道门"
};

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: DictionaryKey, vars?: Record<string, string | number>) => string;
  tileName: (tile: Tile) => string;
  tileType: (type: TileType) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  language,
  setLanguage
}: {
  children: ReactNode;
  language: Language;
  setLanguage: (language: Language) => void;
}) {
  function t(key: DictionaryKey, vars: Record<string, string | number> = {}) {
    let template = dictionaries[language][key] ?? dictionaries.zh[key];
    for (const [name, value] of Object.entries(vars)) {
      template = template.replace(`{${name}}`, String(value));
    }
    return template;
  }

  function tileName(tile: Tile) {
    return tile.name;
  }

  function tileType(type: TileType) {
    return tileTypeLabels[language][type];
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, tileName, tileType }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.");
  }
  return context;
}
