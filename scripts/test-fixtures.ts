import type { GameSettings, RoomPlayer } from "@monopoly/shared";
import { createGameState } from "../server/src/game/createGameState";

export const testSettings: GameSettings = {
  endCondition: "rounds",
  maxRounds: 25,
  allowVoluntaryBankruptcy: true,
  durationMode: "short_3_months",
  initialMoney: 10000,
  initialTickets: 3,
  initialSkillCardLimit: 8,
  lapRewardMoney: 1500,
  lapRewardTickets: 1,
  bankVisitMoney: 400,
  bankVisitTickets: 1,
  stockTradeFeeRate: 0.01,
  depositMonthlyRate: 0.1,
  loanMonthlyRate: 0.1,
  creditLimit: 20000,
  forcedRepaymentRate: 0.2,
  moneyToTicketCost: 1000,
  ticketToMoneyValue: 600,
  bankInitialMoney: 0,
  bankInitialTickets: 0,
  jailTurns: 3,
  hospitalTurns: 3,
  bailCost: 2000,
  treatmentCost: 2000,
  rentMultipliers: [1, 2.3, 5, 10],
  enableSpecialCards: true,
  enableRandomAnnouncements: true,
  lotteryMaxTickets: 3,
  skillShopOfferCount: 8,
  allowFreeSkillCards: false,
  startTileId: "tile-00",
  useSharedStartTile: false,
  lapRewardMode: "go",
  turnDurationSeconds: 60,
  aiDifficulty: "balanced"
};

export function makeTestRoomPlayer(id: string, isBot = false): RoomPlayer {
  return {
    id,
    nickname: isBot ? `AI ${id}` : `玩家 ${id}`,
    color: isBot ? "#f59e0b" : "#3b82f6",
    avatar: isBot ? "AI" : "Player",
    selectedAvatarId: isBot ? "leo-captain" : "aries-dash",
    selectedStartTileId: isBot ? "tile-05" : "tile-00",
    ready: true,
    connected: true,
    isHost: id === "P1",
    isBot
  };
}

export function makeTestGame() {
  return createGameState(
    "TEST",
    [makeTestRoomPlayer("P1"), makeTestRoomPlayer("P2")],
    testSettings
  );
}
