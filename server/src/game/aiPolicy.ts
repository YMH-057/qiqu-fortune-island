import type { AiDifficulty } from "@monopoly/shared";

export interface AiPolicy {
  cashReserveAfterBuy: number;
  cashReserveAfterUpgrade: number;
  stockCashReserve: number;
  stockBudgetRate: number;
  useAttackSkills: boolean;
}

const AI_POLICIES: Record<AiDifficulty, AiPolicy> = {
  conservative: {
    cashReserveAfterBuy: 5000,
    cashReserveAfterUpgrade: 7000,
    stockCashReserve: 7000,
    stockBudgetRate: 0.1,
    useAttackSkills: false
  },
  balanced: {
    cashReserveAfterBuy: 2500,
    cashReserveAfterUpgrade: 3500,
    stockCashReserve: 5000,
    stockBudgetRate: 0.25,
    useAttackSkills: true
  },
  aggressive: {
    cashReserveAfterBuy: 1000,
    cashReserveAfterUpgrade: 1500,
    stockCashReserve: 2500,
    stockBudgetRate: 0.4,
    useAttackSkills: true
  }
};

export function getAiPolicy(difficulty: AiDifficulty | undefined): AiPolicy {
  if (difficulty && difficulty in AI_POLICIES) {
    return AI_POLICIES[difficulty];
  }
  return AI_POLICIES.balanced;
}
