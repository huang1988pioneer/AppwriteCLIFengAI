// 模組定義：對應網頁版「鋒兄管理」與「鋒兄工具」的各個選單。
// 欄位型別：string | text | number | int | bool | date | enum
// 欄位預設值取自網頁版表單的 empty*Form。

export const CURRENCIES = ['TWD', 'USD', 'EUR', 'JPY', 'CNY', 'HKD', 'GBP', 'KRW', 'SGD', 'AUD'];

const f = (name, label, type = 'string', extra = {}) => ({ name, label, type, ...extra });
const currency = (name = 'currency', label = '幣別') =>
  f(name, label, 'enum', { options: CURRENCIES.map((v) => ({ value: v, label: v })), default: 'TWD' });

const numbered = (prefix, label, count) =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return f(`${prefix}${n}`, `${label}${n}`);
  });

export const MODULES = [
  {
    id: 'subscription',
    endpoint: '/api/subscription',
    label: '鋒兄訂閱',
    group: 'manage',
    description: '管理扣款與到期日',
    aliases: ['sub', 'subs', '訂閱'],
    primary: 'name',
    dateField: 'nextdate',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('site', '網站'),
      f('price', '價格', 'number', { default: 0 }),
      currency(),
      f('nextdate', '下次扣款日', 'date'),
      f('account', '帳號'),
      f('continue', '續訂', 'bool', { default: false }),
      f('category', '分類'),
      f('purpose', '用途'),
      f('usageFrequency', '使用頻率'),
      f('friendliness', '友善度'),
      f('alternative', '替代方案'),
      f('retentionRecommendation', '保留建議'),
      f('archived', '封存', 'bool', { default: false }),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'price', 'nextdate', '@days', 'continue', 'account'],
    sort: (a, b) => cmpDate(a.nextdate, b.nextdate),
  },
  {
    id: 'trial-purchase',
    endpoint: '/api/trial-purchase',
    label: '鋒兄試用／首購',
    group: 'manage',
    description: '依服務展開帳號、狀態與 CSV',
    aliases: ['trial', 'trials', 'tp', '試用', '首購', '試用首購'],
    primary: 'name',
    dateField: 'eventDate',
    fields: [
      f('name', '服務名稱', 'string', { required: true }),
      f('eventDate', '到期／活動日', 'date'),
      f('firstPurchasePrice', '首購價', 'number', { default: 0 }),
      f('regularPrice', '原價', 'number', { default: 0 }),
      f('account', '帳號'),
      f('trialStatus', '試用狀態', 'enum', {
        default: 'untried',
        options: [
          { value: 'untried', label: '未試用' },
          { value: 'trialing', label: '試用中' },
          { value: 'tried', label: '已試用' },
          { value: 'no_trial', label: '無試用' },
        ],
      }),
      f('purchaseStatus', '首購狀態', 'enum', {
        default: 'not_purchased',
        options: [
          { value: 'not_purchased', label: '無首購' },
          { value: 'purchasing', label: '首購中' },
          { value: 'purchased', label: '已首購' },
          { value: 'unavailable', label: '無提供首購' },
        ],
      }),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'account', 'eventDate', '@days', 'trialStatus', 'purchaseStatus'],
    sort: (a, b) => cmpStr(a.name, b.name) || cmpDate(a.eventDate, b.eventDate),
  },
  {
    id: 'reinstall',
    endpoint: '/api/reinstall',
    label: '鋒兄重灌',
    group: 'manage',
    description: 'Win／Mac 軟體、序號、訂閱與 CSV',
    aliases: ['re', 'software', '重灌'],
    primary: 'name',
    secret: ['serial', 'viewPassword'],
    fields: [
      f('name', '軟體名稱', 'string', { required: true }),
      f('category', '分類'),
      f('system', '系統', 'enum', {
        default: 'win',
        options: [
          { value: 'win', label: 'Windows' },
          { value: 'mac', label: 'Mac' },
        ],
      }),
      f('softwareType', '軟體類型', 'enum', {
        default: 'free',
        options: [
          { value: 'trial', label: '試用軟體' },
          { value: 'free', label: '免費軟體' },
          { value: 'paid', label: '付費軟體' },
        ],
      }),
      f('licenseType', '授權', 'enum', {
        default: 'none',
        options: [
          { value: 'none', label: '無序號' },
          { value: 'paid_serial', label: '付費序號' },
        ],
      }),
      f('serial', '序號', 'text'),
      f('viewPassword', '檢視密碼'),
      f('subscriptionSoftware', '訂閱制', 'bool', { default: false }),
      f('subscriptionPeriod', '訂閱週期（如 1月、1年）', 'string', { pattern: /^([1-9]\d{0,3})(年|月)$/ }),
      f('subscriptionPrice', '訂閱價格', 'number', { default: 0 }),
      currency('subscriptionCurrency', '訂閱幣別'),
      f('site', '網站'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'system', 'softwareType', 'licenseType', 'subscriptionSoftware', 'category'],
    sort: (a, b) => cmpStr(a.system, b.system) || cmpStr(a.name, b.name),
  },
  {
    id: 'quota',
    endpoint: '/api/quota',
    label: '鋒兄額度',
    group: 'manage',
    description: '剩餘額度、比例與到期日',
    aliases: ['q', 'quotas', '額度'],
    primary: 'name',
    readonlyFields: ['hasAccessToken', 'accessTokenHint', 'accessTokenProvider', 'pointsSyncedAt', 'usageSyncedAt'],
    fields: [
      f('name', '服務名稱', 'string', { required: true }),
      f('serviceType', '服務類型', 'enum', {
        default: 'general',
        options: [
          { value: 'general', label: '一般' },
          { value: 'ai', label: 'AI 服務' },
        ],
      }),
      f('account', '帳號'),
      f('quotaRemaining', '剩餘額度', 'number', { default: 0 }),
      f('quotaPoints', '點數', 'number', { default: 0 }),
      f('litmediaAccount', 'LitMedia 帳號'),
      f('quotaRatio', '額度比例 %', 'number', { default: 0 }),
      f('quotaExpiry', '額度到期日', 'date'),
      f('ratio5h', '5 小時比例 %', 'number', { default: 0 }),
      f('expiry5h', '5 小時重置時間'),
      f('ratioWeek', '一週比例 %', 'number', { default: 0 }),
      f('expiryWeek', '一週到期日', 'string'),
      f('ratioMonth', '一月比例 %', 'number', { default: 0 }),
      f('expiryMonth', '一月到期日', 'string'),
      f('resetCreditsBalance', '重置點數餘額', 'number', { default: 0 }),
      f('resetCreditsExpiry', '重置點數到期', 'string'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'serviceType', 'account', 'quotaRemaining', 'ratio5h', 'ratioWeek', 'expiryWeek', 'quotaExpiry'],
    sort: (a, b) => cmpStr(a.serviceType, b.serviceType) || cmpStr(a.name, b.name),
  },
  {
    id: 'food',
    endpoint: '/api/food',
    label: '鋒兄食品',
    group: 'manage',
    description: '查看庫存與保存期限',
    aliases: ['foods', 'goods', '食品', '商品', '食品商品'],
    primary: 'name',
    dateField: 'todate',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('amount', '數量', 'int', { default: 1 }),
      f('price', '價格', 'number', { default: 0 }),
      f('shop', '商店'),
      f('todate', '到期日', 'date'),
      f('photo', '照片網址'),
      f('photohash', '照片雜湊'),
    ],
    columns: ['name', 'amount', 'price', 'shop', 'todate', '@days'],
    sort: (a, b) => cmpDate(a.todate, b.todate),
  },
  {
    id: 'shopping-list',
    endpoint: '/api/shopping-list',
    label: '鋒兄購物清單',
    group: 'manage',
    description: '想買清單與預定購買日',
    aliases: ['shop', 'shopping', 'buy', '購物', '購物清單'],
    primary: 'name',
    dateField: 'plannedDate',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('plannedDate', '預定購買日', 'date'),
      f('price', '價格', 'number', { default: 0 }),
      currency(),
      f('quantity', '數量', 'int', { default: 1 }),
      f('shop', '商店'),
      f('pickupMethod', '取貨方式', 'string', {
        suggestions: ['門市購買', '超商取貨付款', '蝦皮取貨付款', '宅配/郵寄', '超商取貨', '蝦皮取貨', '門市取貨'],
      }),
      f('imageUrl', '圖片網址'),
      f('account', '帳號'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'plannedDate', '@days', 'price', 'quantity', 'shop', 'pickupMethod'],
    sort: (a, b) => cmpDate(a.plannedDate, b.plannedDate),
  },
  {
    id: 'commonaccount',
    endpoint: '/api/commonaccount',
    label: '鋒兄常用',
    group: 'manage',
    description: '常用網站與帳號（每筆最多 37 組）',
    aliases: ['common', 'account', 'accounts', 'ca', '常用'],
    primary: 'name',
    fields: [f('name', '名稱', 'string', { required: true }), ...numbered('site', '網站', 37), ...numbered('note', '備註', 37)],
    columns: ['name', '@sites', 'site01', 'note01'],
    sort: (a, b) => cmpStr(a.name, b.name),
  },
  {
    id: 'bank',
    endpoint: '/api/bank',
    label: '鋒兄銀行',
    group: 'manage',
    description: '查看餘額與帳戶總覽（含票證／點數到期）',
    aliases: ['banks', '銀行'],
    primary: 'name',
    dateField: 'expiry',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('deposit', '存款', 'number', { default: 0 }),
      f('site', '網站'),
      f('address', '地址'),
      f('withdrawals', '免費跨提次數', 'int', { default: 0 }),
      f('transfer', '免費跨轉次數', 'int', { default: 0 }),
      f('activity', '活動網址'),
      f('card', '卡片'),
      f('account', '帳號'),
      f('category', '分類'),
      f('expiry', '到期日', 'date'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'deposit', 'withdrawals', 'transfer', 'card', 'account', 'expiry'],
    sort: (a, b) => (b.deposit || 0) - (a.deposit || 0),
  },
  {
    id: 'article',
    endpoint: '/api/article',
    label: '鋒兄筆記',
    group: 'manage',
    description: '文字筆記與附件連結',
    aliases: ['note', 'notes', 'articles', '筆記'],
    primary: 'title',
    dateField: 'newDate',
    fields: [
      f('title', '標題', 'string', { required: true }),
      f('content', '內容', 'text'),
      f('category', '分類'),
      f('ref', '參考'),
      f('newDate', '日期', 'date'),
      f('url1', '連結 1'),
      f('url2', '連結 2'),
      f('url3', '連結 3'),
      f('file1', '附件 1'),
      f('file1name', '附件 1 名稱'),
      f('file1type', '附件 1 類型'),
      f('file2', '附件 2'),
      f('file2name', '附件 2 名稱'),
      f('file2type', '附件 2 類型'),
      f('file3', '附件 3'),
      f('file3name', '附件 3 名稱'),
      f('file3type', '附件 3 類型'),
    ],
    columns: ['title', 'category', 'newDate', 'content'],
    sort: (a, b) => cmpDate(b.newDate, a.newDate),
  },
  {
    id: 'music',
    endpoint: '/api/music',
    label: '鋒兄音樂',
    group: 'manage',
    description: '音樂檔與歌詞（上傳請用網頁版）',
    aliases: ['songs', '音樂'],
    primary: 'name',
    media: true,
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('file', '檔案網址'),
      f('filetype', '檔案類型'),
      f('lyrics', '歌詞', 'text'),
      f('language', '語言'),
      f('category', '分類'),
      f('ref', '參考'),
      f('cover', '封面'),
      f('hash', '雜湊'),
      f('note', '備註', 'text'),
    ],
    readonlyFields: ['fileSize'],
    columns: ['name', 'language', 'category', 'filetype', 'fileSize'],
    sort: (a, b) => cmpStr(a.category, b.category) || cmpStr(a.name, b.name),
  },
  {
    id: 'images',
    endpoint: '/api/images',
    itemEndpoint: '/api/image',
    label: '鋒兄圖片',
    group: 'manage',
    description: '圖片檔（上傳請用網頁版）',
    aliases: ['image', 'img', 'photos', '圖片'],
    primary: 'name',
    media: true,
    readonly: true,
    unwrap: 'images',
    fields: [f('name', '名稱')],
    columns: ['name', '$createdAt'],
  },
  {
    id: 'videos',
    endpoint: '/api/videos',
    itemEndpoint: '/api/video',
    label: '鋒兄影片',
    group: 'manage',
    description: '影片檔（上傳請用網頁版）',
    aliases: ['video', '影片'],
    primary: 'name',
    media: true,
    readonly: true,
    unwrap: 'videos',
    fields: [f('name', '名稱')],
    columns: ['name', '$createdAt'],
  },
  {
    id: 'commondocument',
    endpoint: '/api/commondocument',
    label: '鋒兄文件',
    group: 'manage',
    description: '文件檔（上傳請用網頁版）',
    aliases: ['doc', 'docs', 'document', 'documents', '文件'],
    primary: 'name',
    media: true,
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('file', '檔案網址'),
      f('filetype', '檔案類型'),
      f('category', '分類'),
      f('ref', '參考'),
      f('cover', '封面'),
      f('hash', '雜湊'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'category', 'filetype', 'note'],
    sort: (a, b) => cmpStr(a.name, b.name),
  },
  {
    id: 'podcast',
    endpoint: '/api/podcast',
    label: '鋒兄播客',
    group: 'manage',
    description: '播客檔（上傳請用網頁版）',
    aliases: ['podcasts', 'pod', '播客'],
    primary: 'name',
    media: true,
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('file', '檔案網址'),
      f('filetype', '檔案類型'),
      f('category', '分類'),
      f('ref', '參考'),
      f('cover', '封面'),
      f('hash', '雜湊'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'category', 'filetype', 'note'],
    sort: (a, b) => cmpStr(a.name, b.name),
  },
  {
    id: 'routine',
    endpoint: '/api/routine',
    label: '鋒兄例行',
    group: 'manage',
    description: '記錄最近執行日期',
    aliases: ['routines', 'r', '例行'],
    primary: 'name',
    dateField: 'lastdate1',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('lastdate1', '最近一次', 'date'),
      f('lastdate2', '前一次', 'date'),
      f('lastdate3', '前兩次', 'date'),
      f('link', '連結'),
      f('photo', '照片'),
      f('note', '備註', 'text'),
    ],
    columns: ['name', 'lastdate1', '@since', 'lastdate2', 'lastdate3'],
    sort: (a, b) => cmpDate(a.lastdate1, b.lastdate1),
  },
  {
    id: 'financeinstrument2',
    endpoint: '/api/financeinstrument2',
    label: '鋒兄金融標的',
    group: 'tools',
    description: '金融頁追蹤的股票／指數',
    aliases: ['finance-instrument', 'instrument', 'instruments', 'fi', '金融標的'],
    primary: 'name',
    fields: [
      f('name', '名稱', 'string', { required: true }),
      f('symbol', '代號', 'string', { required: true }),
      f('provider', '資料來源'),
      f('group', '群組'),
      f('featured', '精選', 'bool', { default: false }),
      f('linkUrl1', '連結 1'),
      f('linkUrl2', '連結 2'),
      f('linkUrl3', '連結 3'),
      f('youtubeUrl', 'YouTube'),
      f('bilibiliUrl', 'Bilibili'),
      f('imageUrl1', '圖片 1'),
      f('imageUrl2', '圖片 2'),
      f('imageUrl3', '圖片 3'),
    ],
    columns: ['name', 'symbol', 'provider', 'group', 'featured'],
    sort: (a, b) => cmpStr(a.group, b.group) || cmpStr(a.name, b.name),
  },
  {
    id: 'tubechannel',
    endpoint: '/api/tubechannel',
    label: '鋒兄 Tube 頻道',
    group: 'tools',
    description: 'Tube 頁追蹤的 YouTube／Bilibili 頻道',
    aliases: ['tube', 'channel', 'channels', 'Tube'],
    primary: 'alias',
    fields: [f('alias', '別名'), f('sourceUrl', '頻道網址', 'string', { required: true })],
    columns: ['alias', 'sourceUrl'],
  },
  {
    id: 'manualprice',
    endpoint: '/api/manualprice',
    label: '鋒兄比價',
    group: 'tools',
    description: '手動記錄的商品價格歷史（唯讀）',
    aliases: ['price', 'prices', '比價'],
    primary: 'name',
    readonly: true,
    fields: [f('name', '名稱'), currency()],
    columns: ['name', 'currency', '@latestPrice', '@latestDate', '@records'],
  },
];

export const GROUPS = {
  home: '鋒兄首頁',
  manage: '鋒兄管理',
  tools: '鋒兄工具',
  settings: '設定',
};

function cmpStr(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-Hant');
}

// 無日期者排在最後
function cmpDate(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a) - new Date(b);
}

export function findModule(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return (
    MODULES.find((m) => m.id === key) ||
    MODULES.find((m) => m.aliases.some((a) => a.toLowerCase() === key)) ||
    MODULES.find((m) => m.label === name || m.label.replace(/^鋒兄\s*/, '') === name) ||
    null
  );
}

export function requireModule(name) {
  const mod = findModule(name);
  if (!mod) {
    throw new Error(`找不到模組「${name ?? ''}」。可用模組：${MODULES.map((m) => m.id).join(', ')}`);
  }
  return mod;
}

export function itemId(item) {
  return item?.$id ?? item?.id ?? '';
}

export function itemTitle(mod, item) {
  return item?.[mod.primary] || item?.name || item?.title || itemId(item);
}

export function fieldOf(mod, name) {
  return mod.fields.find((x) => x.name === name);
}
