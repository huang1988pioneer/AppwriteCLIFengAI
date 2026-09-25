// CSV 匯出／匯入：對應網頁版「選單備份／還原」。
// 匯入規則與網頁版相同：相同鍵（$id 或名稱）更新、其餘新增，不會刪除備份裡沒有的紀錄。

import { dateOnly } from './format.js';

export function toCsv(mod, items) {
  const headers = ['$id', ...mod.fields.map((f) => f.name)];
  const lines = [headers.map(escapeCell).join(',')];
  for (const item of items) {
    lines.push(
      headers
        .map((h) => {
          const field = mod.fields.find((f) => f.name === h);
          let v = h === '$id' ? item.$id ?? item.id : item[h];
          if (field?.type === 'date') v = dateOnly(v);
          return escapeCell(v);
        })
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180 解析；回傳物件陣列（以第一列為標題）
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV 格式錯誤：引號未閉合');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((x) => x !== ''));
  if (!nonEmpty.length) return [];
  const [headers, ...body] = nonEmpty;
  return body.map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), r[i] ?? ''])));
}
