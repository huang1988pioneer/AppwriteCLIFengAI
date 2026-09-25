// 資料處理：輸入值轉型、組出送給 API 的 payload、列表欄位、搜尋。

import { fieldOf, itemId } from './modules.js';
import { c, dateOnly, daysUntil, formatDays, formatFieldValue, formatSince, toYmd } from './format.js';

const TRUE = new Set(['true', 'yes', 'y', '1', 'on', '是', '有', '續訂']);
const FALSE = new Set(['false', 'no', 'n', '0', 'off', '否', '無', '']);
const EMPTY = new Set(['', 'none', 'null', '-', '無']);

// 把使用者輸入的文字轉成欄位型別；錯誤時丟出例外
export function parseFieldValue(field, raw, now = new Date()) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = String(raw).trim();
  switch (field.type) {
    case 'number': {
      if (s === '') return 0;
      const n = Number(s.replace(/,/g, ''));
      if (!Number.isFinite(n)) throw new Error(`${field.label}（${field.name}）必須是數字，收到「${raw}」`);
      return n;
    }
    case 'int': {
      if (s === '') return 0;
      const n = Number(s.replace(/,/g, ''));
      if (!Number.isInteger(n)) throw new Error(`${field.label}（${field.name}）必須是整數，收到「${raw}」`);
      return n;
    }
    case 'bool': {
      const k = s.toLowerCase();
      if (TRUE.has(k)) return true;
      if (FALSE.has(k)) return false;
      throw new Error(`${field.label}（${field.name}）必須是 yes/no，收到「${raw}」`);
    }
    case 'date':
      return parseDate(s, now, field);
    case 'enum': {
      if (s === '' && field.default !== undefined) return field.default;
      const opt = field.options.find((o) => o.value.toLowerCase() === s.toLowerCase() || o.label === s);
      if (!opt) {
        throw new Error(
          `${field.label}（${field.name}）只能是：${field.options.map((o) => `${o.value}(${o.label})`).join('、')}`,
        );
      }
      return opt.value;
    }
    default:
      if (field.pattern && s && !field.pattern.test(s)) {
        throw new Error(`${field.label}（${field.name}）格式不正確：「${raw}」`);
      }
      return field.type === 'text' ? String(raw).replace(/\\n/g, '\n') : s;
  }
}

// 支援：2026-10-01、2026/10/1、today／今天、tomorrow／明天、+7、-3、none
export function parseDate(s, now = new Date(), field = { label: '日期', name: 'date' }) {
  const k = s.toLowerCase();
  if (EMPTY.has(k)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (k === 'today' || s === '今天') return toYmd(today);
  if (k === 'tomorrow' || s === '明天') return toYmd(new Date(today.getTime() + 86400000));
  if (k === 'yesterday' || s === '昨天') return toYmd(new Date(today.getTime() - 86400000));
  const rel = k.match(/^([+-]\d+)([dwmy]?)$/);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date(today);
    const unit = rel[2] || 'd';
    if (unit === 'd') d.setDate(d.getDate() + n);
    if (unit === 'w') d.setDate(d.getDate() + n * 7);
    if (unit === 'm') d.setMonth(d.getMonth() + n);
    if (unit === 'y') d.setFullYear(d.getFullYear() + n);
    return toYmd(d);
  }
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() === Number(m[2]) - 1) return toYmd(d);
  }
  throw new Error(`${field.label}（${field.name}）日期格式不正確：「${s}」，請用 YYYY-MM-DD、today、+7 等`);
}

// 依模組欄位把 {欄位: 原始字串} 轉成 payload；未知欄位會報錯
export function parseAssignments(mod, raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = fieldOf(mod, key) || mod.fields.find((x) => x.name.toLowerCase() === key.toLowerCase() || x.label === key);
    if (!field) {
      throw new Error(`${mod.label} 沒有欄位「${key}」。可用欄位：${mod.fields.map((x) => x.name).join(', ')}`);
    }
    out[field.name] = typeof value === 'string' || value === null ? parseFieldValue(field, value) : value;
  }
  return out;
}

export function defaultsFor(mod) {
  const out = {};
  for (const field of mod.fields) {
    if (field.default !== undefined) out[field.name] = field.default;
    else if (field.type === 'date') out[field.name] = null;
    else out[field.name] = '';
  }
  return out;
}

// 新增：以網頁版表單預設值為底
export function buildCreatePayload(mod, values) {
  const payload = { ...defaultsFor(mod), ...values };
  const missing = mod.fields.filter((x) => x.required && (payload[x.name] === '' || payload[x.name] == null));
  if (missing.length) throw new Error(`缺少必填欄位：${missing.map((x) => `${x.name}（${x.label}）`).join('、')}`);
  return payload;
}

// 更新：與網頁版一樣送出完整表單（現有值 + 修改），去掉系統欄位
export function buildUpdatePayload(mod, current, changes) {
  const payload = {};
  for (const field of mod.fields) {
    if (field.name in changes) payload[field.name] = changes[field.name];
    else if (current[field.name] !== undefined) payload[field.name] = normalizeExisting(field, current[field.name]);
  }
  return payload;
}

function normalizeExisting(field, value) {
  if (field.type === 'date' && value) return dateOnly(value);
  return value;
}

// ── 列表欄位 ─────────────────────────────────────────────

const VIRTUAL = {
  '@days': {
    label: '剩餘',
    value: (mod, item, now) => formatDays(daysUntil(item[mod.dateField], now)),
  },
  '@since': {
    label: '距今',
    value: (mod, item, now) => formatSince(daysUntil(item[mod.dateField], now)),
  },
  '@sites': {
    label: '網站數',
    value: (mod, item) => String(Object.keys(item).filter((k) => /^site\d{2}$/.test(k) && item[k]).length),
  },
  '@records': {
    label: '紀錄數',
    value: (mod, item) => String(item.records?.length ?? 0),
  },
  '@latestPrice': {
    label: '最新價格',
    value: (mod, item) => {
      const r = latestRecord(item);
      return r ? Number(r.price).toLocaleString() : '';
    },
  },
  '@latestDate': {
    label: '最新日期',
    value: (mod, item) => latestRecord(item)?.date ?? '',
  },
};

function latestRecord(item) {
  const recs = Array.isArray(item.records) ? [...item.records] : [];
  recs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return recs[0];
}

export function columnLabel(mod, col) {
  if (VIRTUAL[col]) return VIRTUAL[col].label;
  if (col === '$createdAt') return '建立時間';
  if (col === 'fileSize') return '大小';
  return fieldOf(mod, col)?.label ?? col;
}

export function cellValue(mod, item, col, { now = new Date(), reveal = false } = {}) {
  if (VIRTUAL[col]) return VIRTUAL[col].value(mod, item, now);
  if (col === '$createdAt') return dateOnly(item.$createdAt);
  if (col === 'fileSize') return item.fileSize ? formatBytes(item.fileSize) : '';
  if (!reveal && mod.secret?.includes(col) && item[col]) return c.gray('••••••');
  return formatFieldValue(fieldOf(mod, col), item[col], item);
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// 關鍵字搜尋所有字串欄位（不分大小寫）
export function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return Object.entries(item).some(
    ([k, v]) => !k.startsWith('$') && v !== null && typeof v !== 'object' && String(v).toLowerCase().includes(q),
  );
}

export function resolveItem(items, mod, ref) {
  if (ref === undefined || ref === null || ref === '') throw new Error('請指定 ID、序號或名稱');
  const s = String(ref);
  const byId = items.find((x) => itemId(x) === s);
  if (byId) return byId;
  if (/^#?\d+$/.test(s)) {
    const idx = Number(s.replace('#', '')) - 1;
    if (items[idx]) return items[idx];
  }
  const exact = items.filter((x) => String(x[mod.primary] ?? '') === s);
  if (exact.length === 1) return exact[0];
  const partial = items.filter((x) => String(x[mod.primary] ?? '').toLowerCase().includes(s.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (exact.length > 1 || partial.length > 1) {
    const list = (exact.length > 1 ? exact : partial).slice(0, 10).map((x) => `  ${itemId(x)}  ${x[mod.primary]}`);
    throw new Error(`「${s}」符合多筆資料，請改用 ID：\n${list.join('\n')}`);
  }
  throw new Error(`${mod.label} 找不到「${s}」`);
}
