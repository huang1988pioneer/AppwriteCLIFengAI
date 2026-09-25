import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.js';
import { parseCsv, toCsv } from '../src/csv.js';
import { computeDashboard } from '../src/dashboard.js';
import { parseEnvFile } from '../src/config.js';
import { strWidth, truncate, daysUntil, convertToTWD } from '../src/format.js';
import { findModule, requireModule } from '../src/modules.js';
import { buildCreatePayload, buildUpdatePayload, parseAssignments, parseDate, resolveItem } from '../src/records.js';
import { createClient } from '../src/api.js';

const NOW = new Date(2026, 8, 25, 14, 0, 0); // 2026-09-25 14:00 本地時間

test('parseArgs：旗標、布林、負數、可重複 --where', () => {
  const { positionals, flags } = parseArgs([
    'sub', 'add', '--name', 'Netflix', '--price=-5', '--continue', '--json', '--sort', '-price',
    '--where', 'a=1', '--where', 'b=2', 'note=hi', '-y',
  ]);
  assert.deepEqual(positionals, ['sub', 'add', 'note=hi']);
  assert.equal(flags.name, 'Netflix');
  assert.equal(flags.price, '-5');
  assert.equal(flags.continue, true);
  assert.equal(flags.json, true);
  assert.equal(flags.sort, '-price');
  assert.deepEqual(flags.where, ['a=1', 'b=2']);
  assert.equal(flags.yes, true);
});

test('模組別名（中英文）', () => {
  assert.equal(findModule('sub').id, 'subscription');
  assert.equal(findModule('訂閱').id, 'subscription');
  assert.equal(findModule('試用').id, 'trial-purchase');
  assert.equal(findModule('鋒兄食品').id, 'food');
  assert.equal(findModule('購物清單').id, 'shopping-list');
  assert.equal(findModule('nope'), null);
  assert.throws(() => requireModule('nope'), /找不到模組/);
});

test('日期解析', () => {
  assert.equal(parseDate('2026-10-01', NOW), '2026-10-01');
  assert.equal(parseDate('2026/1/5', NOW), '2026-01-05');
  assert.equal(parseDate('today', NOW), '2026-09-25');
  assert.equal(parseDate('明天', NOW), '2026-09-26');
  assert.equal(parseDate('+7', NOW), '2026-10-02');
  assert.equal(parseDate('+1m', NOW), '2026-10-25');
  assert.equal(parseDate('-1y', NOW), '2025-09-25');
  assert.equal(parseDate('none', NOW), null);
  assert.throws(() => parseDate('2026-02-30', NOW), /日期格式不正確/);
  assert.throws(() => parseDate('soon', NOW), /日期格式不正確/);
});

test('欄位轉型與驗證', () => {
  const sub = findModule('subscription');
  assert.deepEqual(parseAssignments(sub, { price: '1,290', continue: '是', currency: 'usd', archived: 'no' }), {
    price: 1290,
    continue: true,
    currency: 'USD',
    archived: false,
  });
  assert.throws(() => parseAssignments(sub, { price: 'abc' }), /必須是數字/);
  assert.throws(() => parseAssignments(sub, { foo: '1' }), /沒有欄位/);
  const food = findModule('food');
  assert.throws(() => parseAssignments(food, { amount: '1.5' }), /整數/);
  const trial = findModule('trial');
  assert.equal(parseAssignments(trial, { trialStatus: '試用中' }).trialStatus, 'trialing');
  const re = findModule('reinstall');
  assert.equal(parseAssignments(re, { subscriptionPeriod: '1年' }).subscriptionPeriod, '1年');
  assert.throws(() => parseAssignments(re, { subscriptionPeriod: 'yearly' }), /格式不正確/);
});

test('新增 payload 帶入網頁版表單預設值；更新 payload 送完整表單', () => {
  const shop = findModule('shopping-list');
  const created = buildCreatePayload(shop, { name: '牙膏' });
  assert.equal(created.currency, 'TWD');
  assert.equal(created.quantity, 1);
  assert.equal(created.plannedDate, null);
  assert.throws(() => buildCreatePayload(shop, { price: 1 }), /缺少必填欄位/);

  const sub = findModule('subscription');
  const current = { $id: 'x1', $createdAt: 'z', name: 'A', price: 1, currency: 'TWD', nextdate: '2026-10-01T00:00:00.000+00:00', continue: true };
  const updated = buildUpdatePayload(sub, current, { price: 2 });
  assert.equal(updated.price, 2);
  assert.equal(updated.nextdate, '2026-10-01');
  assert.equal(updated.name, 'A');
  assert.equal('$id' in updated, false);
  assert.equal('$createdAt' in updated, false);
});

test('resolveItem：ID、序號、名稱、模糊比對', () => {
  const mod = findModule('food');
  const items = [
    { $id: 'a1', name: '蘋果汁' },
    { $id: 'b2', name: '香蕉' },
    { $id: 'c3', name: '蘋果' },
  ];
  assert.equal(resolveItem(items, mod, 'b2').name, '香蕉');
  assert.equal(resolveItem(items, mod, '#3').$id, 'c3');
  assert.equal(resolveItem(items, mod, '蘋果').$id, 'c3');
  assert.equal(resolveItem(items, mod, '香').$id, 'b2');
  assert.throws(() => resolveItem(items, mod, '果'), /符合多筆/);
  assert.throws(() => resolveItem(items, mod, '西瓜'), /找不到/);
});

test('首頁今日待處理：與網頁版門檻一致', () => {
  const iso = (d) => new Date(NOW.getTime() + d * 864e5).toISOString();
  const stats = computeDashboard(
    {
      food: [
        { $id: 'f1', name: '過期', todate: iso(-2) },
        { $id: 'f2', name: '五天', todate: iso(5) },
        { $id: 'f3', name: '二十天', todate: iso(20) },
        { $id: 'f4', name: '無日期', todate: null },
      ],
      subscription: [
        { $id: 's1', name: '逾期', nextdate: iso(-1), price: 10, currency: 'USD' },
        { $id: 's2', name: '兩天', nextdate: iso(2), price: 100, currency: 'TWD' },
        { $id: 's3', name: '六天', nextdate: iso(6), price: 0, currency: 'TWD' },
      ],
      'trial-purchase': [{ $id: 't1', name: '試用', eventDate: iso(1) }],
      quota: [
        { $id: 'q1', name: '一般', serviceType: 'general', quotaExpiry: iso(2) },
        { $id: 'q2', name: '一般遠', serviceType: 'general', quotaExpiry: iso(10) },
        { $id: 'q3', name: 'AI', serviceType: 'ai', expiryWeek: iso(0.5), expiryMonth: iso(5) },
      ],
      'shopping-list': [{ $id: 'p1', name: '買', plannedDate: iso(2) }],
      bank: [{ $id: 'b1', name: '點數', expiry: iso(6), deposit: 500 }, { $id: 'b2', name: '銀行', deposit: 100 }],
    },
    NOW,
  );
  const count = Object.fromEntries(stats.cards.map((card) => [card.key, card.items.length]));
  assert.deepEqual(count, {
    expiredFoods: 1,
    foodsExpiring7Days: 1,
    overdueSubscriptions: 1,
    subscriptionsExpiring3Days: 1,
    trialPurchasesExpiring3Days: 1,
    quotaExpiringSoon: 2, // q1 一般 3 天內 + q3 AI 一週到期；q2 太遠、q3 月到期超過 1 天
    shoppingItemsExpiring3Days: 1,
    banksExpiring7Days: 1,
  });
  assert.equal(stats.attention, 9);
  assert.equal(stats.totals.subscriptionFeeTWD, 350 + 100);
  assert.equal(stats.totals.bankDeposit, 600);
  assert.equal(stats.lists.foodsExpiring30Days.length, 2);
  assert.equal(stats.lists.subscriptionsExpiring7Days.length, 2);
});

test('CSV 往返（含逗號、引號、換行、中文）', () => {
  const mod = findModule('food');
  const items = [{ $id: 'a', name: '肉鬆, "特級"', amount: 2, price: 0, shop: '全聯\n台北', todate: '2027-03-10T00:00:00.000+00:00' }];
  const csv = toCsv(mod, items);
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].$id, 'a');
  assert.equal(rows[0].name, '肉鬆, "特級"');
  assert.equal(rows[0].shop, '全聯\n台北');
  assert.equal(rows[0].todate, '2027-03-10');
});

test('.env 匯入對應網頁版鍵名', () => {
  const p = parseEnvFile(`
# comment
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID="proj"
APPWRITE_DATABASE_ID='db' # inline
export APPWRITE_API_KEY=secret
OTHER=1
`);
  assert.deepEqual(p, { endpoint: 'https://fra.cloud.appwrite.io/v1', projectId: 'proj', databaseId: 'db', apiKey: 'secret' });
});

test('字寬與截斷（中日韓字元算 2 格）', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('鋒兄'), 4);
  assert.equal(strWidth('\x1b[31m紅\x1b[0m'), 2);
  assert.equal(strWidth(truncate('鋒兄AI Appwrite', 8)), 8);
});

test('天數與匯率', () => {
  assert.equal(daysUntil('2026-09-25T00:00:00.000+00:00', NOW), 0);
  assert.equal(daysUntil('2026-10-01', NOW), 6);
  assert.equal(daysUntil('2026-09-20', NOW), -5);
  assert.equal(convertToTWD(10, 'USD'), 350);
  assert.equal(convertToTWD(1000, 'JPY'), 350);
});

test('API：自訂 Appwrite 帳號時帶上 _endpoint 等參數', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const plain = createClient({ baseUrl: 'https://x.test', fetchImpl });
  await plain.list(findModule('food'));
  assert.equal(calls[0].url, 'https://x.test/api/food');

  const custom = createClient({
    baseUrl: 'https://x.test',
    profile: { endpoint: 'https://aw.test/v1', projectId: 'p', databaseId: 'd', apiKey: 'k' },
    fetchImpl,
  });
  await custom.update(findModule('food'), 'id 1', { a: 1 });
  const u = new URL(calls[1].url);
  assert.equal(u.pathname, '/api/food/id%201');
  assert.equal(u.searchParams.get('_endpoint'), 'https://aw.test/v1');
  assert.equal(u.searchParams.get('_project'), 'p');
  assert.equal(u.searchParams.get('_database'), 'd');
  assert.equal(u.searchParams.get('_key'), 'k');
  assert.equal(calls[1].init.method, 'PUT');
});

test('API：錯誤訊息與網頁版相同', async () => {
  const client = createClient({
    baseUrl: 'https://x.test',
    fetchImpl: async (url) =>
      String(url).includes('videos')
        ? new Response('<html>404</html>', { status: 404 })
        : new Response(JSON.stringify({ error: 'Bad input' }), { status: 400 }),
  });
  await assert.rejects(client.list(findModule('videos')), /Table videos 不存在/);
  await assert.rejects(client.create(findModule('food'), {}), /Bad input/);
});
