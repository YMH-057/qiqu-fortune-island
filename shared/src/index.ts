export type PlayerId = string;
export type RoomId = string;
export type TileId = string;

export type RoomStatus = "lobby" | "playing" | "ended";
export type GameStatus = "waiting" | "playing" | "ended";
export type GamePhase = "waitingRoll" | "tileAction" | "gameOver";
export type EndCondition = "rounds" | "bankruptcy";
export type GameDurationMode = "short_3_months" | "standard_1_year" | "long_2_years";
export type LapRewardMode = "go" | "home";

export const GO_TILE_ID = "tile-00" as const;

export const START_TILE_OPTIONS = [
  { tileId: "tile-00", nameZh: "左上 GO", nameEn: "Upper-left GO" },
  { tileId: "tile-05", nameZh: "右上角", nameEn: "Upper-right" },
  { tileId: "tile-09", nameZh: "右下角", nameEn: "Lower-right" },
  { tileId: "tile-14", nameZh: "左下角", nameEn: "Lower-left" }
] as const;

export interface AvatarDefinition {
  id: string;
  nameZh: string;
  nameEn: string;
  zodiac: string;
  thumbUrl: string;
  tokenUrl: string;
  portraitUrl: string;
  themeColor: string;
  accentColor: string;
  symbol: string;
}

export const AVATAR_DEFINITIONS = [
  {
    id: "aries-dash",
    nameZh: "白羊小子",
    nameEn: "Aries Dash",
    zodiac: "白羊",
    thumbUrl: "/avatars/thumbs/aries-dash.png",
    tokenUrl: "/avatars/tokens/aries-dash.png",
    portraitUrl: "/avatars/portraits/aries-dash.png",
    themeColor: "#ef4444",
    accentColor: "#f97316",
    symbol: "♈"
  },
  {
    id: "taurus-tank",
    nameZh: "金牛壮壮",
    nameEn: "Taurus Tank",
    zodiac: "金牛",
    thumbUrl: "/avatars/thumbs/taurus-tank.png",
    tokenUrl: "/avatars/tokens/taurus-tank.png",
    portraitUrl: "/avatars/portraits/taurus-tank.png",
    themeColor: "#65a30d",
    accentColor: "#ca8a04",
    symbol: "♉"
  },
  {
    id: "gemini-pop",
    nameZh: "双子灵灵",
    nameEn: "Gemini Pop",
    zodiac: "双子",
    thumbUrl: "/avatars/thumbs/gemini-pop.png",
    tokenUrl: "/avatars/tokens/gemini-pop.png",
    portraitUrl: "/avatars/portraits/gemini-pop.png",
    themeColor: "#06b6d4",
    accentColor: "#f59e0b",
    symbol: "♊"
  },
  {
    id: "cancer-shell",
    nameZh: "巨蟹小卫",
    nameEn: "Cancer Shell",
    zodiac: "巨蟹",
    thumbUrl: "/avatars/thumbs/cancer-shell.png",
    tokenUrl: "/avatars/tokens/cancer-shell.png",
    portraitUrl: "/avatars/portraits/cancer-shell.png",
    themeColor: "#2563eb",
    accentColor: "#ef4444",
    symbol: "♋"
  },
  {
    id: "leo-captain",
    nameZh: "狮子队长",
    nameEn: "Leo Captain",
    zodiac: "狮子",
    thumbUrl: "/avatars/thumbs/leo-captain.png",
    tokenUrl: "/avatars/tokens/leo-captain.png",
    portraitUrl: "/avatars/portraits/leo-captain.png",
    themeColor: "#f59e0b",
    accentColor: "#eab308",
    symbol: "♌"
  },
  {
    id: "virgo-vera",
    nameZh: "处女星语",
    nameEn: "Virgo Vera",
    zodiac: "处女",
    thumbUrl: "/avatars/thumbs/virgo-vera.png",
    tokenUrl: "/avatars/tokens/virgo-vera.png",
    portraitUrl: "/avatars/portraits/virgo-vera.png",
    themeColor: "#84cc16",
    accentColor: "#22c55e",
    symbol: "♍"
  },
  {
    id: "libra-balance",
    nameZh: "天秤小衡",
    nameEn: "Libra Balance",
    zodiac: "天秤",
    thumbUrl: "/avatars/thumbs/libra-balance.png",
    tokenUrl: "/avatars/tokens/libra-balance.png",
    portraitUrl: "/avatars/portraits/libra-balance.png",
    themeColor: "#ec4899",
    accentColor: "#38bdf8",
    symbol: "♎"
  },
  {
    id: "scorpio-sting",
    nameZh: "天蝎影刃",
    nameEn: "Scorpio Sting",
    zodiac: "天蝎",
    thumbUrl: "/avatars/thumbs/scorpio-sting.png",
    tokenUrl: "/avatars/tokens/scorpio-sting.png",
    portraitUrl: "/avatars/portraits/scorpio-sting.png",
    themeColor: "#7c3aed",
    accentColor: "#ef4444",
    symbol: "♏"
  },
  {
    id: "sagittarius-arrow",
    nameZh: "射手飞羽",
    nameEn: "Sagittarius Arrow",
    zodiac: "射手",
    thumbUrl: "/avatars/thumbs/sagittarius-arrow.png",
    tokenUrl: "/avatars/tokens/sagittarius-arrow.png",
    portraitUrl: "/avatars/portraits/sagittarius-arrow.png",
    themeColor: "#0ea5e9",
    accentColor: "#f97316",
    symbol: "♐"
  },
  {
    id: "capricorn-cliff",
    nameZh: "摩羯岩岩",
    nameEn: "Capricorn Cliff",
    zodiac: "摩羯",
    thumbUrl: "/avatars/thumbs/capricorn-cliff.png",
    tokenUrl: "/avatars/tokens/capricorn-cliff.png",
    portraitUrl: "/avatars/portraits/capricorn-cliff.png",
    themeColor: "#0f766e",
    accentColor: "#a16207",
    symbol: "♑"
  },
  {
    id: "aquarius-aqua",
    nameZh: "水瓶泡泡",
    nameEn: "Aquarius Aqua",
    zodiac: "水瓶",
    thumbUrl: "/avatars/thumbs/aquarius-aqua.png",
    tokenUrl: "/avatars/tokens/aquarius-aqua.png",
    portraitUrl: "/avatars/portraits/aquarius-aqua.png",
    themeColor: "#06b6d4",
    accentColor: "#67e8f9",
    symbol: "♒"
  },
  {
    id: "pisces-marina",
    nameZh: "双鱼女孩",
    nameEn: "Pisces Marina",
    zodiac: "双鱼",
    thumbUrl: "/avatars/thumbs/pisces-marina.png",
    tokenUrl: "/avatars/tokens/pisces-marina.png",
    portraitUrl: "/avatars/portraits/pisces-marina.png",
    themeColor: "#8b5cf6",
    accentColor: "#fb7185",
    symbol: "♓"
  }
] as const satisfies AvatarDefinition[];

export type AvatarId = (typeof AVATAR_DEFINITIONS)[number]["id"];

export type TileType =
  | "start"
  | "property"
  | "bank"
  | "stock"
  | "lottery"
  | "arcade"
  | "chance"
  | "misfortune"
  | "tax"
  | "teleport"
  | "portal"
  | "junction"
  | "choice_junction"
  | "skillShop"
  | "plaza"
  | "safe_landing"
  | "empty"
  | "jail"
  | "hospital"
  | "go_jail"
  | "hospital_entry"
  | "reward"
  | "draw_card";

export type StockId =
  | "STAR_TECH"
  | "PUMPKIN_FOOD"
  | "EAST_PORT"
  | "RAINBOW_ENERGY"
  | "FUN_PARK"
  | "GOLD_BANK"
  | "CLOUD_ESTATE"
  | "WIND_FACTORY"
  | "CANDY_MALL"
  | "BLUE_COM";

export type StockSymbol = StockId;

export type StockSector =
  | "tech"
  | "food"
  | "transport"
  | "energy"
  | "entertainment"
  | "finance"
  | "estate"
  | "industry"
  | "retail"
  | "communication";

export interface StockPricePoint {
  day: number;
  month: number;
  year: number;
  price: number;
}

export interface StockOrderDate {
  year: number;
  month: number;
  day: number;
}

export interface Stock {
  id: StockId;
  symbol: StockId;
  name: string;
  code: string;
  sector: StockSector;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changeRate: number;
  history: StockPricePoint[];
  volatility: number;
  trendBias: number;
  price: number;
  trend: number;
}

export type StockInfo = Stock;

export interface StockHolding {
  stockId: StockId;
  shares: number;
  averageCost: number;
  totalCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedProfit: number;
  unrealizedProfitRate: number;
  lots?: StockLot[] | undefined;
}

export interface StockTradeRecord {
  id: string;
  playerId?: PlayerId | undefined;
  nickname?: string | undefined;
  day: number;
  month: number;
  year: number;
  stockId: StockId;
  type: "buy" | "sell" | "net_buy" | "net_sell" | "grant";
  shares: number;
  price: number;
  amount: number;
  fee: number;
  realizedProfit?: number | undefined;
}

export interface StockLot {
  id: string;
  stockId: StockId;
  shares: number;
  costPerShare: number;
  totalCost: number;
  acquiredAt: StockOrderDate;
  protectedUntil?: StockOrderDate | undefined;
  source: "buy" | "net_buy" | "grant";
}

export interface StockOrder {
  id: string;
  playerId: PlayerId;
  stockId: StockId;
  type: "buy" | "sell";
  shares: number;
  submittedAt: StockOrderDate;
  estimatedPrice: number;
  reservedCash?: number | undefined;
}

export interface DailyStockNetOrder {
  playerId: PlayerId;
  stockId: StockId;
  netShares: number;
  buyShares: number;
  sellShares: number;
}

export interface StockAccount {
  cashFrozen?: number | undefined;
  holdings: Partial<Record<StockId, StockHolding>>;
  realizedProfit: number;
  totalMarketValue: number;
  totalUnrealizedProfit: number;
  totalUnrealizedProfitRate: number;
  tradeHistory: StockTradeRecord[];
  pendingOrders: StockOrder[];
}

export interface GameCalendar {
  year: number;
  month: number;
  day: number;
  weekday: number;
  actedPlayerIdsToday: PlayerId[];
  daysElapsed: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface PortalOption {
  targetTileId: TileId;
  label: string;
  costTickets: number;
}

export interface Tile {
  id: TileId;
  index: number;
  name: string;
  shortName?: string | undefined;
  type: TileType;
  price?: number | undefined;
  baseRent?: number | undefined;
  rentBase?: number | undefined;
  colorGroup?: string | undefined;
  groupId?: string | undefined;
  salary?: number | undefined;
  taxAmount?: number | undefined;
  targetIndex?: number | undefined;
  portalTargetId?: TileId | undefined;
  portalOptions?: PortalOption[] | undefined;
  portalCostTickets?: number | undefined;
  isMortgaged?: boolean | undefined;
  mortgageValue?: number | undefined;
  mortgageRedeemCost?: number | undefined;
  position?: BoardPoint | undefined;
  next?: TileId[] | undefined;
  directionLabels?: Record<TileId, string> | undefined;
  region?: string | undefined;
  description?: string | undefined;
  routeType?: "main" | "outer" | "inner" | "branch" | "detention" | undefined;
  visualGroup?: string | undefined;
  orientation?: "north" | "east" | "south" | "west" | "center" | undefined;
}

export interface PropertyState {
  tileId: TileId;
  ownerId?: PlayerId | undefined;
  level: number;
  rentBoostTurns?: number | undefined;
  rentCutTurns?: number | undefined;
  rentHornBonus?: number | undefined;
  rentLimitTurns?: number | undefined;
  rentLimitAmount?: number | undefined;
  insuranceTurns?: number | undefined;
  mortgageFreezeTurns?: number | undefined;
  isMortgaged?: boolean | undefined;
  mortgageValue?: number | undefined;
  mortgageRedeemCost?: number | undefined;
}

export interface PropertyGroup {
  id: string;
  name: string;
  tileIds: TileId[];
  rentMultiplierWhenComplete: number;
  bonusDescription: string;
}

export type SkillTargetMode = "self" | "player" | "tile" | "property" | "stock" | "propertyGroup" | "none";
export type SkillRarity = "common" | "rare" | "epic";
export type SkillType =
  | "active"
  | "passive"
  | "attack"
  | "defense"
  | "movement"
  | "economy"
  | "stock"
  | "lottery"
  | "chance"
  | "utility";

export type SkillCardCode =
  | "remoteDice"
  | "remoteTrade"
  | "doubleDice"
  | "shield"
  | "freeze"
  | "steal"
  | "swap"
  | "teleport"
  | "rentBoost"
  | "stockHint"
  | "luckyCharm"
  | "lotteryBoost"
  | "taxRelief"
  | "repairKit"
  | "sprint"
  | "slowTrap"
  | "slowWalk"
  | "preciseStep"
  | "reverseDice"
  | "junctionInterference"
  | "junctionBlessing"
  | "smallLoan"
  | "interestFreeRedeem"
  | "propertyInsurance"
  | "temporaryRentRaise"
  | "temporaryRentCut"
  | "setAccelerator"
  | "mortgageFreeze"
  | "ticketRedPacket"
  | "coinRedPacket"
  | "lotteryCombo"
  | "lotteryGuarantee"
  | "stockFreeCommission"
  | "stockStopLoss"
  | "stockBuyCoupon"
  | "shortGoggles"
  | "marketMagnifier"
  | "luckyWheel"
  | "vacantGuide"
  | "rentDiscountTicket"
  | "rentHorn"
  | "secretBuild"
  | "repairDiscount"
  | "taxDelay"
  | "shopDiscount"
  | "portalDiscount"
  | "counterShield"
  | "skillBlock"
  | "skillRecyclePenalty"
  | "equalizePoor"
  | "equalizeRich"
  | "missile"
  | "reverseCompass"
  | "routeToken"
  | "cardSupply"
  | "roadblock"
  | "bomb"
  | "angelCard"
  | "demolishCard"
  | "valueBoostCard"
  | "devilCard"
  | "releasePermit"
  | "quickShoes"
  | "stayPermit"
  | "returnTicket"
  | "outerRoutePass"
  | "innerRoutePass"
  | "rideShare"
  | "junctionCompass"
  | "holidayVoucher"
  | "landlordHoliday"
  | "popUpBooth"
  | "renovationTeam"
  | "rentLimitOrder"
  | "auditBill"
  | "bankVoucher"
  | "debtExtension"
  | "coinRain"
  | "lotteryPack"
  | "luckyNumber"
  | "marketFlash"
  | "bullFlag"
  | "bearAlert"
  | "medicalInsurance"
  | "bailPermit";

export interface SkillCard {
  id: string;
  code: SkillCardCode;
  name: string;
  displayName?: string | undefined;
  description: string;
  costTickets: number;
  target: SkillTargetMode;
  rarity?: SkillRarity | undefined;
  type?: SkillType | undefined;
  effectType?: string | undefined;
  targetMode?: SkillTargetMode | undefined;
  range?: number | undefined;
  durationDays?: number | undefined;
  maxUses?: number | undefined;
}

export type StatusEffectType =
  | "remoteDice"
  | "remoteTrade"
  | "doubleDice"
  | "rentShield"
  | "taxShield"
  | "luckyCharm"
  | "lotteryBoost"
  | "repairKit"
  | "sprint"
  | "slowTrap"
  | "stockFeeDiscount"
  | "slowWalk"
  | "preciseStep"
  | "reverseDice"
  | "junctionInterference"
  | "junctionBlessing"
  | "smallLoan"
  | "interestFreeRedeem"
  | "setAccelerator"
  | "mortgageFreeze"
  | "lotteryCombo"
  | "lotteryGuarantee"
  | "stockFreeCommission"
  | "stockStopLoss"
  | "stockBuyCoupon"
  | "stockSellCoupon"
  | "vacantGuide"
  | "rentDiscountTicket"
  | "repairDiscount"
  | "taxDelay"
  | "shopDiscount"
  | "portalDiscount"
  | "counterShield"
  | "skillBlock"
  | "skillRecyclePenalty"
  | "jail"
  | "hospital"
  | "reverseWalk"
  | "routeChoice"
  | "shopVipDiscount"
  | "roadblock"
  | "bomb"
  | "extraSteps"
  | "forceOuterRoute"
  | "forceInnerRoute"
  | "rentHoliday"
  | "ownerRentBlock"
  | "rentLimit"
  | "bankVoucher"
  | "debtExtension"
  | "lotteryPack"
  | "luckyNumber"
  | "medicalInsurance"
  | "bailPermit";

export interface StatusEffect {
  id: string;
  type: StatusEffectType;
  turns: number;
  value?: number | undefined;
  sourcePlayerId?: PlayerId | undefined;
  stockId?: StockId | undefined;
  tileId?: TileId | undefined;
  dueDay?: number | undefined;
  amount?: number | undefined;
  label?: string | undefined;
  description?: string | undefined;
}

export interface PlayerBankAccount {
  deposit: number;
  debtPrincipal: number;
  unpaidInterest: number;
  monthlyInterestAccrued: number;
  debt: number;
  creditLimit: number;
  lastSettlementDay: number;
}

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  color: string;
  avatar: string;
  selectedAvatarId?: AvatarId | undefined;
  cash: number;
  position: number;
  currentTileId: TileId;
  lastTileId?: TileId | undefined;
  homeStartTileId: TileId;
  tickets: number;
  skillCards: SkillCard[];
  maxSkillCards: number;
  statusEffects: StatusEffect[];
  usedActiveSkillThisTurn: boolean;
  properties: TileId[];
  stocks: Partial<Record<StockId, number>>;
  stockAccount: StockAccount;
  bankAccount: PlayerBankAccount;
  moveDirection: 1 | -1;
  bankrupt: boolean;
  insolventUntil?: number | undefined;
  skipTurns: number;
  connected: boolean;
}

export interface RoomPlayer {
  id: PlayerId;
  nickname: string;
  color: string;
  avatar: string;
  selectedAvatarId?: AvatarId | undefined;
  selectedStartTileId?: TileId | undefined;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface GameSettings {
  endCondition: EndCondition;
  maxRounds: number;
  allowVoluntaryBankruptcy: boolean;
  durationMode: GameDurationMode;
  initialMoney: number;
  initialTickets: number;
  initialSkillCardLimit: number;
  lapRewardMoney: number;
  lapRewardTickets: number;
  bankVisitMoney: number;
  bankVisitTickets: number;
  stockTradeFeeRate: number;
  depositMonthlyRate: number;
  loanMonthlyRate: number;
  creditLimit: number;
  forcedRepaymentRate: number;
  moneyToTicketCost: number;
  ticketToMoneyValue: number;
  bankInitialMoney: number;
  bankInitialTickets: number;
  jailTurns: number;
  hospitalTurns: number;
  bailCost: number;
  treatmentCost: number;
  rentMultipliers: number[];
  enableSpecialCards: boolean;
  enableRandomAnnouncements: boolean;
  lotteryMaxTickets: number;
  skillShopOfferCount: number;
  allowFreeSkillCards: boolean;
  startTileId: TileId;
  useSharedStartTile: boolean;
  lapRewardMode: LapRewardMode;
  turnDurationSeconds: number;
}

export interface ChatMessage {
  id: string;
  playerId: PlayerId;
  nickname: string;
  message: string;
  createdAt: number;
}

export interface RoomPublicState {
  id: RoomId;
  hostId: PlayerId;
  status: RoomStatus;
  players: RoomPlayer[];
  avatarLocks: Partial<Record<AvatarId, PlayerId>>;
  settings: GameSettings;
  chat: ChatMessage[];
  createdAt: number;
}

export interface GameLogEntry {
  id: string;
  turn: number;
  message: string;
  createdAt: number;
}

export interface PathOption {
  tileId: TileId;
  label: string;
}

export type PendingAction =
  | { kind: "buyProperty"; tileId: TileId }
  | { kind: "upgradeProperty"; tileId: TileId }
  | { kind: "stockMarket"; tileId?: TileId | undefined }
  | { kind: "choosePath"; playerId: PlayerId; fromTileId: TileId; options: PathOption[]; remainingSteps: number }
  | { kind: "portalChoice"; playerId: PlayerId; tileId: TileId; options: PortalOption[]; canCancel: boolean }
  | { kind: "lottery"; playerId: PlayerId; tileId: TileId; maxTickets: number; ticketPrice: number; purchasedCount?: number | undefined }
  | { kind: "skillShop"; playerId: PlayerId; tileId: TileId; offers: SkillCard[] }
  | { kind: "bank"; playerId: PlayerId; tileId: TileId };

export type ModalType =
  | "skillShop"
  | "luckCard"
  | "portalChoice"
  | "pathChoice"
  | "stockMarket"
  | "stockAccount"
  | "stockTileEffect"
  | "tileDetail"
  | "propertyGroup"
  | "skillTarget"
  | "bank"
  | "exchange"
  | "lottery"
  | "confirmBankruptcy"
  | "gameEnd"
  | null;

export type LuckCardEffectKind =
  | "cash"
  | "tickets"
  | "moveSteps"
  | "skipTurn"
  | "stockGrant"
  | "stockShift"
  | "freeUpgrade"
  | "repairFee"
  | "taxRelief"
  | "rentShield"
  | "remoteTrade"
  | "skillGrant"
  | "skillLose"
  | "skillShopDiscount"
  | "skillHandLimit"
  | "skillRecyclePenalty"
  | "skillBlock";

export interface LuckCardEffect {
  type: LuckCardEffectKind;
  amount?: number | undefined;
  steps?: number | undefined;
  turns?: number | undefined;
  symbol?: StockId | undefined;
  quantity?: number | undefined;
  percent?: number | undefined;
  rarity?: SkillRarity | undefined;
}

export interface LuckCard {
  id: string;
  deck: "chance" | "misfortune" | "lottery" | "arcade";
  title: string;
  description: string;
  tone: "good" | "bad" | "neutral";
  weight: number;
  effect: LuckCardEffect;
}

export interface TileEvent {
  id: string;
  playerId: PlayerId;
  tileId: TileId;
  title: string;
  message: string;
  tone: "good" | "bad" | "neutral";
  card?: LuckCard | undefined;
}

export interface MovementEvent {
  playerId: PlayerId;
  from: number;
  to: number;
  path: number[];
  fromTileId?: TileId | undefined;
  toTileId?: TileId | undefined;
  tilePath?: TileId[] | undefined;
}

export interface RankingEntry {
  playerId: PlayerId;
  nickname: string;
  asset: number;
  cash: number;
  bankrupt: boolean;
}

export interface TicketExchangeRate {
  moneyToTicketCost: number;
  ticketToMoneyValue: number;
}

export interface MarketSignal {
  id: string;
  sector?: StockSector | undefined;
  stockId?: StockId | undefined;
  direction: "bullish" | "bearish" | "volatile" | "stable";
  strength: number;
  accuracy: number;
  targetDate: StockOrderDate;
  source: "stock_tile" | "luck_card" | "monthly_theme" | "system" | "random_announcement";
  message: string;
  isPublic: boolean;
  ownerPlayerId?: PlayerId | undefined;
  used?: boolean | undefined;
}

export interface MarketEvent {
  id: string;
  title: string;
  message: string;
  sector?: StockSector | undefined;
  stockId?: StockId | undefined;
  direction: "bullish" | "bearish" | "volatile" | "stable";
  strength: number;
  startDate: StockOrderDate;
  daysRemaining: number;
  isPublic: boolean;
}

export interface MarketAnnouncement {
  id: string;
  title: string;
  message: string;
  sector?: StockSector | undefined;
  stockId?: StockId | undefined;
  direction: "bullish" | "bearish" | "volatile" | "stable";
  strength: number;
  date: StockOrderDate;
}

export interface LotteryResult {
  id: string;
  playerId: PlayerId;
  ticketNumber?: number | undefined;
  cost: number;
  rewardMoney: number;
  rewardTickets: number;
  rewardSkillCard?: SkillCard | undefined;
  resultType: "none" | "small" | "medium" | "big" | "tickets" | "skill";
  message: string;
}

export interface MonthlyBankSettlement {
  id: string;
  playerId: PlayerId;
  nickname: string;
  year: number;
  month: number;
  depositInterest: number;
  debtInterest: number;
  forcedRepayment: number;
  principalPaid: number;
  interestPaid: number;
  deposit: number;
  debtPrincipal: number;
  unpaidInterest: number;
  debt: number;
  creditRemaining: number;
}

export interface PendingMonthlySettlement {
  id: string;
  settlements: MonthlyBankSettlement[];
  waitingPlayerIds: PlayerId[];
  createdAt: number;
}

export interface GameState {
  roomId: RoomId;
  status: GameStatus;
  phase: GamePhase;
  settings: GameSettings;
  tiles: Tile[];
  players: PlayerState[];
  turnOrder: PlayerId[];
  currentTurnIndex: number;
  round: number;
  completedTurns: number;
  maxRounds: number;
  dice: number | null;
  properties: Record<TileId, PropertyState>;
  propertyGroups: Record<string, PropertyGroup>;
  stocks: Record<StockId, Stock>;
  pendingStockOrders: StockOrder[];
  marketSignals: MarketSignal[];
  marketEvents: MarketEvent[];
  marketAnnouncements: MarketAnnouncement[];
  bankSettlements: MonthlyBankSettlement[];
  pendingMonthlySettlement?: PendingMonthlySettlement | undefined;
  ticketExchangeRate: TicketExchangeRate;
  gameCalendar: GameCalendar;
  pendingAction: PendingAction | null;
  lastEvent: TileEvent | null;
  logs: GameLogEntry[];
  rankings: RankingEntry[];
  winnerId: PlayerId | null;
  startedAt: number;
  endedAt: number | null;
  turnStartedAt: number;
  turnEndsAt: number;
  turnDurationSeconds: number;
  latestLotteryResults: LotteryResult[];
}

export interface UseSkillPayload {
  skillId: string;
  targetPlayerId?: PlayerId | undefined;
  targetTileId?: TileId | undefined;
  stockId?: StockId | undefined;
  value?: number | undefined;
}

export interface DebugSkillCatalogItem {
  code: SkillCardCode;
  name: string;
  rarity: SkillRarity;
  type?: SkillType | undefined;
  target: SkillTargetMode;
  costTickets: number;
}

export interface DebugLuckCardCatalogItem {
  id: string;
  deck: LuckCard["deck"];
  title: string;
  description: string;
  tone: LuckCard["tone"];
}

export interface DebugCatalog {
  skillCards: DebugSkillCatalogItem[];
  luckCards: DebugLuckCardCatalogItem[];
}

export type DebugDetentionMode = "none" | "jail" | "hospital";

export type DebugCommand =
  | { kind: "getCatalog" }
  | { kind: "grantSkillCard"; targetPlayerId: PlayerId; skillCode: SkillCardCode }
  | { kind: "triggerLuckCard"; targetPlayerId: PlayerId; cardId: string }
  | { kind: "teleportPlayer"; targetPlayerId: PlayerId; tileId: TileId; resolveTile?: boolean | undefined }
  | {
    kind: "setPlayerResources";
    targetPlayerId: PlayerId;
    cash?: number | undefined;
    tickets?: number | undefined;
    deposit?: number | undefined;
    debtPrincipal?: number | undefined;
    unpaidInterest?: number | undefined;
  }
  | {
    kind: "setPropertyState";
    tileId: TileId;
    ownerPlayerId?: PlayerId | null | undefined;
    level?: number | undefined;
    isMortgaged?: boolean | undefined;
  }
  | { kind: "setPlayerStockHolding"; targetPlayerId: PlayerId; stockId: StockId; shares: number }
  | { kind: "setStockPrice"; stockId: StockId; price: number }
  | { kind: "setPlayerDetention"; targetPlayerId: PlayerId; detention: DebugDetentionMode; turns?: number | undefined }
  | {
    kind: "setTurnState";
    currentPlayerId?: PlayerId | undefined;
    phase?: GamePhase | undefined;
    round?: number | undefined;
    completedTurns?: number | undefined;
    clearPendingAction?: boolean | undefined;
  };

export interface DebugCommandAck {
  ok: boolean;
  error?: string | undefined;
  message?: string | undefined;
  catalog?: DebugCatalog | undefined;
}

export interface ClientToServerEvents {
  createRoom: (
    payload: { nickname: string },
    ack?: (response: SocketAck) => void
  ) => void;
  joinRoom: (
    payload: { roomId: string; nickname: string; playerId?: string | undefined },
    ack?: (response: SocketAck) => void
  ) => void;
  kickPlayer: (payload: { roomId: string; targetPlayerId: PlayerId }) => void;
  selectAvatar: (payload: { avatarId: AvatarId }) => void;
  selectStartTile: (payload: { tileId: TileId }) => void;
  setReady: (payload: { ready: boolean }) => void;
  updateSettings: (payload: Partial<GameSettings>) => void;
  updateRoomSettings: (payload: Partial<GameSettings>) => void;
  startGame: () => void;
  restartGame: () => void;
  rollDice: () => void;
  choosePathDirection: (payload: { tileId: TileId }) => void;
  choosePortalDestination: (payload: { targetTileId: TileId }) => void;
  cancelPortalChoice: () => void;
  closeSkillShop: () => void;
  skipSkillShop: () => void;
  cancelPendingAction: () => void;
  buyProperty: (payload: { tileId: string }) => void;
  upgradeProperty: (payload: { tileId: string }) => void;
  mortgageProperty: (payload: { tileId: string }) => void;
  redeemMortgage: (payload: { tileId: string }) => void;
  exchangeMoneyToTickets: (payload: { ticketAmount: number }) => void;
  exchangeTicketsToMoney: (payload: { ticketAmount: number }) => void;
  openExchangePanel: () => void;
  closeExchangePanel: () => void;
  depositMoney: (payload: { amount: number }) => void;
  withdrawMoney: (payload: { amount: number }) => void;
  borrowCredit: (payload: { amount: number }) => void;
  repayCredit: (payload: { amount: number }) => void;
  leaveDetention: () => void;
  closeModal: (payload?: { modalType?: ModalType | undefined }) => void;
  buyStock: (payload: { stockId?: StockId | undefined; symbol?: StockId | undefined; quantity: number }) => void;
  sellStock: (payload: { stockId?: StockId | undefined; symbol?: StockId | undefined; quantity: number }) => void;
  submitStockOrder: (payload: { stockId: StockId; type: "buy" | "sell"; shares: number }) => void;
  cancelStockOrder: (payload: { orderId: string }) => void;
  requestPendingStockOrders: () => void;
  requestStockMarket: () => void;
  requestPlayerStockAccount: (payload: { playerId?: PlayerId | undefined }) => void;
  requestOtherPlayersHoldings: () => void;
  buyLotteryTicket: (payload: { count?: number | undefined }) => void;
  drawLottery: (payload?: { count?: number | undefined }) => void;
  skipLottery: () => void;
  closeLotteryPanel: () => void;
  closeMonthlySettlement: (payload?: { settlementId?: string | undefined }) => void;
  buySkillCard: (payload: { skillId: string }) => void;
  recycleSkillCard: (payload: { skillId: string }) => void;
  useSkillCard: (payload: UseSkillPayload) => void;
  declareBankruptcy: () => void;
  endTurn: () => void;
  chatMessage: (payload: { message: string }) => void;
  debugCommand: (payload: DebugCommand, ack?: (response: DebugCommandAck) => void) => void;
  voiceParticipantUpdated: (payload: { listening: boolean; speaking: boolean }) => void;
  voiceChunk: (payload: { mimeType: string; chunk: ArrayBuffer }) => void;
}

export interface ServerToClientEvents {
  roomUpdated: (room: RoomPublicState) => void;
  avatarSelectionUpdated: (payload: { room: RoomPublicState }) => void;
  avatarSelectionFailed: (payload: { message: string }) => void;
  roomSettingsUpdated: (settings: GameSettings) => void;
  playerKicked: (payload: { roomId: RoomId; playerId: PlayerId; message: string }) => void;
  gameStarted: (game: GameState) => void;
  gameStateUpdated: (game: GameState) => void;
  diceRolled: (payload: { playerId: string; value: number }) => void;
  playerMoved: (payload: MovementEvent) => void;
  pathChoiceRequired: (payload: Extract<PendingAction, { kind: "choosePath" }>) => void;
  pathChosen: (payload: { playerId: PlayerId; tileId: TileId }) => void;
  junctionDirectionDecided: (payload: {
    playerId: PlayerId;
    junctionTileId: TileId;
    nextTileId: TileId;
    directionLabel: string;
    remainingSteps: number;
  }) => void;
  portalChoiceRequired: (payload: Extract<PendingAction, { kind: "portalChoice" }>) => void;
  portalDestinationChosen: (payload: { playerId: PlayerId; targetTileId: TileId }) => void;
  portalChoiceCanceled: (payload: { playerId: PlayerId; tileId: TileId }) => void;
  tileEventTriggered: (payload: TileEvent) => void;
  luckCardDrawn: (payload: { playerId: PlayerId; card: LuckCard; tileEvent: TileEvent }) => void;
  stockMarketUpdated: (payload: Record<StockId, Stock>) => void;
  stockOrderSubmitted: (payload: { playerId: PlayerId; order: StockOrder }) => void;
  stockOrderCanceled: (payload: { playerId: PlayerId; orderId: string }) => void;
  pendingStockOrdersUpdated: (payload: { playerId: PlayerId; orders: StockOrder[] }) => void;
  stockSettlementCompleted: (payload: { records: StockTradeRecord[] }) => void;
  stockSettlementFailed: (payload: { message: string }) => void;
  stockTradeExecuted: (payload: { playerId: PlayerId; record: StockTradeRecord; account: StockAccount }) => void;
  stockAccountUpdated: (payload: { playerId: PlayerId; account: StockAccount }) => void;
  stockTradeFailed: (payload: { playerId: PlayerId; message: string }) => void;
  marketAnnouncementCreated: (payload: MarketAnnouncement) => void;
  privateMarketSignal: (payload: { playerId: PlayerId; signal: MarketSignal }) => void;
  otherPlayersHoldingsUpdated: (
    payload: Array<{
      playerId: PlayerId;
      nickname: string;
      holdings: StockHolding[];
      totalMarketValue: number;
      totalUnrealizedProfit: number;
    }>
  ) => void;
  skillShopUpdated: (payload: { playerId: PlayerId; offers: SkillCard[] }) => void;
  skillCardBought: (payload: { playerId: PlayerId; card: SkillCard }) => void;
  skillCardRecycled: (payload: { playerId: PlayerId; cardId: string; tickets: number }) => void;
  skillCardUsed: (payload: { playerId: PlayerId; card: SkillCard }) => void;
  skillEffectResolved: (payload: { playerId: PlayerId; message: string }) => void;
  playerTicketsUpdated: (payload: { playerId: PlayerId; tickets: number }) => void;
  ticketExchangeCompleted: (payload: { playerId: PlayerId; message: string }) => void;
  ticketExchangeFailed: (payload: { playerId: PlayerId; message: string }) => void;
  bankActionCompleted: (payload: { playerId: PlayerId; message: string }) => void;
  bankActionFailed: (payload: { playerId: PlayerId; message: string }) => void;
  monthlyBankSettlement: (payload: { settlements: MonthlyBankSettlement[] }) => void;
  exchangePanelOpened: (payload: { playerId: PlayerId }) => void;
  exchangePanelClosed: (payload: { playerId: PlayerId }) => void;
  propertyMortgaged: (payload: { playerId: PlayerId; tileId: TileId; message: string }) => void;
  propertyRedeemed: (payload: { playerId: PlayerId; tileId: TileId; message: string }) => void;
  lotteryResult: (payload: LotteryResult) => void;
  lotterySkipped: (payload: { playerId: PlayerId }) => void;
  lotteryPanelClosed: (payload: { playerId: PlayerId }) => void;
  modalClosed: (payload: { playerId: PlayerId; modalType: ModalType }) => void;
  pendingActionCanceled: (payload: { playerId: PlayerId }) => void;
  playerTeleported: (payload: MovementEvent) => void;
  playerBankrupted: (payload: { playerId: string; nickname: string }) => void;
  gameEnded: (payload: { rankings: RankingEntry[]; winnerId: string | null }) => void;
  voiceParticipantUpdated: (payload: { playerId: PlayerId; listening: boolean; speaking: boolean }) => void;
  voiceChunk: (payload: { playerId: PlayerId; mimeType: string; chunk: ArrayBuffer }) => void;
  errorMessage: (payload: { message: string }) => void;
}

export interface SocketAck {
  ok: boolean;
  error?: string | undefined;
  room?: RoomPublicState | undefined;
  game?: GameState | undefined;
  playerId?: PlayerId | undefined;
}
