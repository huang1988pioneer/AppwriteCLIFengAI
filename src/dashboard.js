// 鋒兄首頁「今日待處理」：邏輯移植自網頁版 useDashboardStats，門檻與計算方式保持一致。

import { convertToTWD } from './format.js';

const DAY = 864e5;

const validDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const byDays = (a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);

function daysFrom(date, now, floor = false) {
  const diff = new Date(date).getTime() - now.getTime();
  return floor ? Math.floor(diff / DAY) : Math.ceil(diff / DAY);
}

export function computeDashboard(data, now = new Date()) {
  const foods = data.food ?? [];
  const subs = data.subscription ?? [];
  const banks = data.bank ?? [];
  const trials = data['trial-purchase'] ?? [];
  const quotas = data.quota ?? [];
  const shopping = data['shopping-list'] ?? [];

  const in7 = new Date(now.getTime() + 7 * DAY);
  const in30 = new Date(now.getTime() + 30 * DAY);
  const in3 = new Date(now.getTime() + 3 * DAY);
  const within = (d, end) => d && d <= end && d >= now;

  const foodRow = (e, floor) => ({ id: e.$id, name: e.name, daysRemaining: daysFrom(e.todate, now, floor), date: e.todate });
  const subRow = (e, floor) => ({
    id: e.$id,
    name: e.name,
    site: e.site,
    daysRemaining: daysFrom(e.nextdate, now, floor),
    date: e.nextdate,
    price: e.price,
    currency: e.currency,
  });

  const foodsExpiring7 = foods.filter((e) => within(validDate(e.todate), in7)).map((e) => foodRow(e)).sort(byDays);
  const foodsExpiring30 = foods.filter((e) => within(validDate(e.todate), in30)).map((e) => foodRow(e)).sort(byDays);
  const expiredFoods = foods
    .filter((e) => {
      const d = validDate(e.todate);
      return d && d < now;
    })
    .map((e) => foodRow(e, true))
    .sort(byDays);

  const subsExpiring3 = subs.filter((e) => e.nextdate && within(new Date(e.nextdate), in3)).map((e) => subRow(e)).sort(byDays);
  const subsExpiring7 = subs.filter((e) => e.nextdate && within(new Date(e.nextdate), in7)).map((e) => subRow(e)).sort(byDays);
  const overdueSubs = subs
    .filter((e) => !!e.nextdate && new Date(e.nextdate) < now)
    .map((e) => subRow(e, true))
    .sort(byDays);

  const trialsExpiring3 = trials
    .filter((e) => within(validDate(e.eventDate), in3))
    .map((e) => ({
      id: e.$id,
      name: e.name,
      daysRemaining: daysFrom(e.eventDate, now),
      date: e.eventDate,
      trialStatus: e.trialStatus || 'untried',
      purchaseStatus: e.purchaseStatus || 'not_purchased',
    }))
    .sort(byDays);

  const quotaAlerts = [];
  for (const e of quotas) {
    const isAi = e.serviceType === 'ai';
    const push = (kind, value, label) => {
      const d = validDate(value);
      if (!d) return;
      const days = daysFrom(d, now);
      const hit = kind === 'quotaExpiry' ? !isAi && days >= 0 && days <= 3 : isAi && days >= 0 && days <= 1;
      if (hit) {
        quotaAlerts.push({
          id: e.$id,
          name: e.name,
          account: e.account || '',
          serviceType: isAi ? 'ai' : 'general',
          daysRemaining: days,
          date: value,
          kind,
          label,
        });
      }
    };
    if (isAi) {
      push('expiryWeek', e.expiryWeek, '一週到期');
      push('expiryMonth', e.expiryMonth, '一月到期');
    } else {
      push('quotaExpiry', e.quotaExpiry, '額度到期');
    }
  }
  quotaAlerts.sort(byDays);
  const quotaGeneral3 = quotaAlerts.filter((e) => e.kind === 'quotaExpiry');
  const quotaAiSoon = quotaAlerts.filter((e) => e.kind !== 'quotaExpiry');

  const shoppingDue3 = shopping
    .filter((e) => within(validDate(e.plannedDate), in3))
    .map((e) => ({
      id: e.$id,
      name: e.name,
      daysRemaining: daysFrom(e.plannedDate, now),
      date: e.plannedDate,
      price: e.price,
      currency: e.currency,
    }))
    .sort(byDays);

  const banksExpiring7 = banks
    .filter((e) => within(validDate(e.expiry), in7))
    .map((e) => ({ id: e.$id, name: e.name, daysRemaining: daysFrom(e.expiry, now), date: e.expiry, category: e.category || '' }))
    .sort(byDays);

  const totalFee = subs.reduce((sum, s) => sum + convertToTWD(s.price, s.currency), 0);
  const totalDeposit = banks.reduce((sum, b) => sum + (b.deposit || 0), 0);

  // 對應首頁八張卡片的順序與名稱
  const cards = [
    { key: 'expiredFoods', label: '已過期食品', module: 'food', items: expiredFoods, tone: 'danger' },
    { key: 'foodsExpiring7Days', label: '7 天內食品', module: 'food', items: foodsExpiring7, tone: 'warn' },
    { key: 'overdueSubscriptions', label: '逾期訂閱', module: 'subscription', items: overdueSubs, tone: 'danger' },
    { key: 'subscriptionsExpiring3Days', label: '3 天內扣款', module: 'subscription', items: subsExpiring3, tone: 'warn' },
    { key: 'trialPurchasesExpiring3Days', label: '試用/首購 3 天內', module: 'trial-purchase', items: trialsExpiring3, tone: 'warn' },
    { key: 'quotaExpiringSoon', label: '額度接近到期', module: 'quota', items: [...quotaGeneral3, ...quotaAiSoon].sort(byDays), tone: 'warn' },
    { key: 'shoppingItemsExpiring3Days', label: '3 天內要買', module: 'shopping-list', items: shoppingDue3, tone: 'warn' },
    { key: 'banksExpiring7Days', label: '票證/點數 7 天內到期', module: 'bank', items: banksExpiring7, tone: 'warn' },
  ];

  return {
    cards,
    attention: cards.reduce((n, card) => n + card.items.length, 0),
    totals: {
      foods: foods.length,
      subscriptions: subs.length,
      trialPurchases: trials.length,
      quotaAccounts: quotas.length,
      shoppingItems: shopping.length,
      banks: banks.length,
      bankDeposit: totalDeposit,
      subscriptionFeeTWD: totalFee,
      articles: data.article?.length ?? 0,
      commonAccounts: data.commonaccount?.length ?? 0,
      routines: data.routine?.length ?? 0,
    },
    lists: {
      foodsExpiring30Days: foodsExpiring30,
      subscriptionsExpiring7Days: subsExpiring7,
    },
  };
}
