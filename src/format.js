// 終端機輸出工具：顏色、中日韓字寬、表格、日期與金額。

import { itemId } from './modules.js';

const useColor = () => !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const wrap = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
  accent: wrap('38;5;209'), // 網頁版的珊瑚橘主色
};

const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s) {
  return String(s).replace(ANSI, '');
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

export function strWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0);
    if (cp < 32 || (cp >= 0x300 && cp <= 0x36f) || cp === 0x200b || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

export function truncate(s, max) {
  const plain = stripAnsi(s).replace(/\s+/g, ' ');
  if (strWidth(plain) <= max) return strWidth(stripAnsi(s)) === strWidth(plain) ? s : plain;
  let out = '';
  let w = 0;
  for (const ch of plain) {
    const cw = strWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

export function pad(s, width, align = 'left') {
  const gap = Math.max(0, width - strWidth(s));
  return align === 'right' ? ' '.repeat(gap) + s : s + ' '.repeat(gap);
}

// rows: 字串二維陣列；第一欄通常是序號
export function renderTable(headers, rows, { maxWidth = process.stdout.columns || 120, align = [] } = {}) {
  if (!rows.length) return c.gray('（沒有資料）');
  const widths = headers.map((h, i) => Math.max(strWidth(h), ...rows.map((r) => strWidth(r[i] ?? ''))));
  const sep = 2;
  const total = () => widths.reduce((a, b) => a + b, 0) + sep * (widths.length - 1);
  // 超出終端寬度時，從最寬的欄位開始縮
  while (total() > maxWidth) {
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i] <= 8) break;
    widths[i] -= 1;
  }
  const line = (cells, fmt = (x) => x) =>
    cells
      .map((cell, i) => pad(fmt(truncate(cell ?? '', widths[i])), widths[i], align[i]))
      .join(' '.repeat(sep))
      .trimEnd();
  const out = [line(headers, c.bold), c.gray(widths.map((w) => '─'.repeat(w)).join(' '.repeat(sep)))];
  for (const r of rows) out.push(line(r));
  return out.join('\n');
}

// ── 日期 ────────────────────────────────────────────────

export function dateOnly(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : toYmd(d);
}

export function toYmd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 以「日曆日」計算距今天數（今天 = 0）
export function daysUntil(value, now = new Date()) {
  const ymd = dateOnly(value);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export function formatDays(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return c.red(`逾期 ${-days} 天`);
  if (days === 0) return c.red('今天');
  if (days <= 7) return c.yellow(`${days} 天後`);
  return `${days} 天後`;
}

export function formatSince(days) {
  if (days === null || days === undefined) return '';
  if (days > 0) return `${days} 天後`;
  if (days === 0) return '今天';
  return `${-days} 天前`;
}

// ── 金額（與網頁版 convertToTWD 相同的固定匯率）────────────────

export const EXCHANGE_RATES = { TWD: 1, USD: 35, EUR: 40, JPY: 0.35, CNY: 4.5, HKD: 4, GBP: 44, KRW: 0.025, SGD: 26, AUD: 23 };
const SYMBOLS = { TWD: 'NT$', USD: '$', EUR: '€', JPY: '¥', CNY: '¥', HKD: 'HK$', GBP: '£', KRW: '₩', SGD: 'S$', AUD: 'A$' };

export function convertToTWD(amount, currency = 'TWD') {
  if (amount === null || amount === undefined) return 0;
  return Math.round(amount * (EXCHANGE_RATES[currency] || 1));
}

export function formatMoney(amount, currency = 'TWD') {
  const n = Number(amount || 0);
  const sym = SYMBOLS[currency] || currency;
  if (!currency || currency === 'TWD') return `NT$ ${n.toLocaleString()}`;
  return `${sym} ${n.toLocaleString()} ${c.gray(`(≈NT$ ${convertToTWD(n, currency).toLocaleString()})`)}`;
}

// ── 欄位值顯示 ───────────────────────────────────────────

export function formatFieldValue(field, value, item = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (!field) return typeof value === 'object' ? JSON.stringify(value) : String(value);
  switch (field.type) {
    case 'bool':
      return value ? c.green('是') : c.gray('否');
    case 'date':
      return dateOnly(value);
    case 'enum': {
      const opt = field.options.find((o) => o.value === value);
      return opt ? opt.label : String(value);
    }
    case 'number':
    case 'int':
      if (field.name === 'price' && item.currency) return formatMoney(value, item.currency);
      if (field.name === 'subscriptionPrice' && item.subscriptionCurrency) return formatMoney(value, item.subscriptionCurrency);
      if (field.name === 'deposit') return formatMoney(value, 'TWD');
      return Number(value).toLocaleString();
    default:
      return String(value);
  }
}

export function shortId(item) {
  return itemId(item);
}
