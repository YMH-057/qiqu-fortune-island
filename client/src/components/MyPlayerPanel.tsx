import type { GameState, StatusEffectType } from "@monopoly/shared";
import { useEffect, useState } from "react";
import { computeAsset, money } from "../game/economy";
import { useI18n } from "../i18n";
import { AvatarPortrait } from "./AvatarPortrait";

interface MyPlayerPanelProps {
  game: GameState;
  playerId: string | null;
}

const statusLabels: Record<StatusEffectType, { icon: string; name: string; description: string; stack: string }> = {
  remoteDice: { icon: "🎲", name: "遥控骰子", description: "下一次骰子使用预设点数。", stack: "移动类唯一" },
  remoteTrade: { icon: "📨", name: "远程委托", description: "可远程提交一次股票委托。", stack: "股票类" },
  doubleDice: { icon: "🎲", name: "双倍骰子", description: "下一次骰子移动步数翻倍。", stack: "移动类唯一" },
  reverseWalk: { icon: "↺", name: "反向行走", description: "后续移动按反方向行走。", stack: "方向类唯一" },
  routeChoice: { icon: "🧭", name: "选路机会", description: "下次路口可手动选择方向。", stack: "不可叠加" },
  shopDiscount: { icon: "🏷", name: "商店折扣", description: "下次技能商店前 3 张卡各便宜 1 张彩券，最低 1 张。", stack: "次数型" },
  rentShield: { icon: "🛡", name: "租金护盾", description: "抵挡一次租金支付。", stack: "防御类" },
  taxShield: { icon: "🧾", name: "税收券", description: "抵挡下一次税费。", stack: "防御类" },
  luckyCharm: { icon: "🍀", name: "幸运护符", description: "提高下一次随机事件的有利结果。", stack: "运气类" },
  lotteryBoost: { icon: "🎟", name: "彩票翻倍", description: "下一次彩票金币奖励翻倍。", stack: "彩票类" },
  repairKit: { icon: "🏠", name: "安居维修包", description: "持续期间每次支付地租减半。", stack: "租金减免" },
  repairDiscount: { icon: "🏷", name: "房租折扣券", description: "持续期间每次支付地租七折。", stack: "租金减免" },
  stockFreeCommission: { icon: "📈", name: "股票免佣", description: "下一交易日手续费为 0。", stack: "股票类" },
  stockSellCoupon: { icon: "📉", name: "做空护目镜", description: "下一次卖出股票结算手续费为 0。", stack: "股票类" },
  stockBuyCoupon: { icon: "📈", name: "股票加仓券", description: "下一次买入股票手续费减半。", stack: "股票类" },
  stockFeeDiscount: { icon: "💹", name: "交易所优惠", description: "下一次股票结算手续费减半。", stack: "股票类" },
  stockStopLoss: { icon: "🛟", name: "股票止损", description: "目标股票大跌时自动补偿一半浮亏。", stack: "股票类" },
  sprint: { icon: "🛹", name: "冲刺", description: "立即执行额外移动。", stack: "一次性" },
  slowWalk: { icon: "🐢", name: "小步慢行", description: "下一次最多移动 3 格。", stack: "移动类唯一" },
  preciseStep: { icon: "👣", name: "精准一步", description: "下一次固定移动 1 格。", stack: "移动类唯一" },
  reverseDice: { icon: "↩", name: "反向骰子", description: "下一次骰子按反方向移动。", stack: "移动类唯一" },
  extraSteps: { icon: "👟", name: "小飞鞋", description: "下一次移动额外前进 2 格。", stack: "移动类" },
  forceOuterRoute: { icon: "🛣", name: "绕路牌", description: "下一次岔路优先走外圈。", stack: "路线类" },
  forceInnerRoute: { icon: "🧭", name: "钻巷牌", description: "下一次岔路优先进入内圈。", stack: "路线类" },
  rentHoliday: { icon: "🏖", name: "假日券", description: "持续期间经过对手地产不付地租。", stack: "租金减免" },
  ownerRentBlock: { icon: "🛌", name: "房东假期", description: "持续期间自己的地产不能收租。", stack: "负面状态" },
  debtExtension: { icon: "🏦", name: "债务展期", description: "下一次月度强制还款为 0。", stack: "银行类" },
  lotteryPack: { icon: "🎟", name: "抽奖券包", description: "接下来的彩票购买可免费使用次数。", stack: "彩票类" },
  luckyNumber: { icon: "🍀", name: "幸运号码", description: "下一次彩票中奖判定提高。", stack: "彩票类" },
  medicalInsurance: { icon: "🏥", name: "医疗保险", description: "下一次进医院停留回合 -1。", stack: "拘留减免" },
  bailPermit: { icon: "🔑", name: "保释券", description: "下一次进监狱停留回合 -1。", stack: "拘留减免" },
  lotteryCombo: { icon: "🎫", name: "彩票连抽", description: "下次进入彩票店可额外购买彩票。", stack: "彩票类" },
  lotteryGuarantee: { icon: "✅", name: "保底彩票", description: "下次彩票未中奖返还部分成本。", stack: "彩票类" },
  vacantGuide: { icon: "🗺", name: "空地指南", description: "提示附近最近的无主地产。", stack: "辅助类" },
  rentDiscountTicket: { icon: "🎫", name: "躲租小票", description: "下一次支付租金减半。", stack: "租金减免" },
  taxDelay: { icon: "📄", name: "税务缓缴", description: "下一次税收延迟支付。", stack: "经济类" },
  counterShield: { icon: "🛡", name: "反击护盾", description: "抵消一次攻击技能并反击。", stack: "防御类" },
  smallLoan: { icon: "💰", name: "小额贷款", description: "临时贷款，几天后需要归还。", stack: "银行类" },
  interestFreeRedeem: { icon: "🏠", name: "免息赎回", description: "下一次赎回抵押地产免息。", stack: "地产类" },
  setAccelerator: { icon: "🏘", name: "套装加速", description: "满足条件时下次购买套装补齐地块打折。", stack: "地产类" },
  mortgageFreeze: { icon: "❄", name: "抵押冻结", description: "目标地产短时间不能赎回。", stack: "攻击类" },
  junctionBlessing: { icon: "🌟", name: "路口祝福", description: "下一次普通路口更容易走向好地块。", stack: "路线类" },
  junctionInterference: { icon: "🌀", name: "路口干扰", description: "下一次普通路口更容易走向坏地块。", stack: "路线类" },
  roadblock: { icon: "🚧", name: "路障", description: "下次移动被限制。", stack: "移动负面" },
  jail: { icon: "🚧", name: "监狱停留", description: "停留期间跳过回合，可支付保释金。", stack: "拘留状态" },
  hospital: { icon: "💊", name: "医院治疗", description: "停留期间跳过回合，可支付治疗费。", stack: "拘留状态" },
  skillBlock: { icon: "⛔", name: "技能封锁", description: "暂时不能使用主动技能。", stack: "负面状态" },
  skillRecyclePenalty: { icon: "♻", name: "回收惩罚", description: "下一次回收技能卡只能获得半价彩券。", stack: "负面状态" },
  shopVipDiscount: { icon: "🛍", name: "商店贵宾", description: "技能商店购买价格享受额外优惠。", stack: "商店类" },
  slowTrap: { icon: "⏬", name: "减速", description: "下次移动受限。", stack: "移动负面" },
  portalDiscount: { icon: "🌀", name: "传送优惠", description: "旧版传送费用减免状态。", stack: "停用状态" },
  bomb: { icon: "💥", name: "惊吓炸弹", description: "受到炸弹影响。", stack: "攻击状态" },
  rentLimit: { icon: "📉", name: "租金限价", description: "地产租金受到临时上限限制。", stack: "地产负面" },
  bankVoucher: { icon: "🏦", name: "银行礼券", description: "银行礼券奖励状态。", stack: "一次性" }
};

export function MyPlayerPanel({ game, playerId }: MyPlayerPanelProps) {
  const { tileName } = useI18n();
  const [now, setNow] = useState(Date.now());
  const currentPlayerId = game.turnOrder[game.currentTurnIndex] ?? null;
  const me = game.players.find((player) => player.id === playerId) ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  if (!me) {
    return (
      <aside className="my-player-panel">
        <div className="panelHeader">
          <span className="eyebrow">我的数据</span>
          <strong>观战</strong>
        </div>
        <p className="modalHint">加入房间后会显示你的资产、位置和持仓。</p>
      </aside>
    );
  }

  const tile = game.tiles.find((item) => item.id === me.currentTileId) ?? game.tiles[me.position];
  const holdings = Object.values(me.stockAccount.holdings).filter((holding): holding is NonNullable<typeof holding> => Boolean(holding));
  const insolvencySeconds = me.cash < 0 && me.insolventUntil
    ? Math.max(0, Math.ceil((me.insolventUntil - now) / 1000))
    : null;

  return (
    <aside className={`my-player-panel ${me.id === currentPlayerId ? "activeTurn" : ""} ${me.bankrupt ? "bankrupt" : ""}`}>
      <div className="myHero">
        <span className="avatarDot big" style={{ backgroundColor: me.color }}>
          <AvatarPortrait avatarId={me.selectedAvatarId} fallbackColor={me.color} size="large" />
        </span>
        <div>
          <span className="eyebrow">我的数据</span>
          <strong>{me.nickname}</strong>
          <small>{me.id === currentPlayerId ? "轮到你行动" : me.bankrupt ? "已破产观战" : "等待回合"}</small>
        </div>
      </div>
      <dl className="myStatsGrid">
        <div>
          <dt>现金</dt>
          <dd>{money(me.cash)}</dd>
        </div>
        <div>
          <dt>总资产</dt>
          <dd>{money(computeAsset(game, me))}</dd>
        </div>
        <div>
          <dt>彩券</dt>
          <dd>🎟 {me.tickets}</dd>
        </div>
        <div>
          <dt>地产</dt>
          <dd>{me.properties.length}</dd>
        </div>
        <div>
          <dt>技能</dt>
          <dd>{me.skillCards.length}/{me.maxSkillCards}</dd>
        </div>
        <div>
          <dt>位置</dt>
          <dd>{tile ? tileName(tile) : "-"}</dd>
        </div>
        <div>
          <dt>存款</dt>
          <dd>{money(me.bankAccount.deposit)}</dd>
        </div>
        <div>
          <dt>借款</dt>
          <dd>{money((me.bankAccount.debtPrincipal ?? me.bankAccount.debt) + (me.bankAccount.unpaidInterest ?? 0))}</dd>
        </div>
      </dl>
      {insolvencySeconds !== null && (
        <div className="insolvencyWarning">
          <strong>现金为负，筹款中</strong>
          <span>剩余 {insolvencySeconds}s，请抵押地产、借款或兑换资金。</span>
        </div>
      )}
      <div className="buffPanel">
        <strong>当前状态</strong>
        {me.statusEffects.length === 0 ? (
          <span>暂无 Buff / Debuff</span>
        ) : (
          me.statusEffects.map((effect) => {
            const meta = statusLabels[effect.type] ?? {
              icon: "•",
              name: effect.label ?? effect.type,
              description: effect.description ?? "临时状态效果。",
              stack: "按规则处理"
            };
            return (
              <article key={effect.id} className="buffItem">
                <b>{meta.icon}</b>
                <span>
                  <strong>{statusLabels[effect.type] ? meta.name : effect.label ?? meta.name}</strong>
                  <small>
                    剩余 {effect.turns} 回合
                    {effect.amount ? ` · 剩余次数 ${effect.amount}` : ""} · {meta.stack}
                  </small>
                  <em>{effect.description ?? meta.description}</em>
                </span>
              </article>
            );
          })
        )}
      </div>
      <div className="myHoldingStrip">
        <strong>股票账户</strong>
        {holdings.length === 0 ? (
          <span>暂无持仓</span>
        ) : (
          holdings.slice(0, 4).map((holding) => (
            <span key={holding.stockId}>
              {game.stocks[holding.stockId]?.name ?? game.stocks[holding.stockId]?.code ?? holding.stockId} {holding.shares} 股
            </span>
          ))
        )}
      </div>
    </aside>
  );
}
