// fengbro：鋒兄AI Appwrite 的 CLI 版本。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from './api.js';
import {
  configPath,
  loadConfig,
  maskSecret,
  parseEnvFile,
  PROFILE_KEYS,
  PROFILE_LABELS,
  resolveConnection,
  saveConfig,
  DEFAULT_BASE_URL,
} from './config.js';
import { printBanner } from './banner.js';
import { computeDashboard } from './dashboard.js';
import { parseCsv, toCsv } from './csv.js';
import { c, convertToTWD, dateOnly, formatMoney, pad, renderTable, strWidth, toYmd } from './format.js';
import { GROUPS, MODULES, findModule, itemId, itemTitle, requireModule } from './modules.js';
import { ask, closePrompt, confirm, isInteractive } from './prompt.js';
import {
  buildCreatePayload,
  buildUpdatePayload,
  cellValue,
  columnLabel,
  formatBytes,
  matchesSearch,
  parseAssignments,
  parseFieldValue,
  resolveItem,
} from './records.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

// ── 參數解析 ─────────────────────────────────────────────

const BOOL_FLAGS = new Set(['json', 'yes', 'full', 'all', 'reveal', 'help', 'version', 'dry-run', 'csv']);
const VALUE_FLAGS = new Set(['search', 'sort', 'limit', 'columns', 'where', 'profile', 'base-url', 'out', 'format', 'data']);
const SHORT = { y: 'yes', h: 'help', v: 'version', s: 'search', n: 'limit', p: 'profile', o: 'out', f: 'format' };

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    let key;
    let value;
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      value = eq > 0 ? a.slice(eq + 1) : undefined;
    } else if (/^-[a-zA-Z]$/.test(a)) {
      key = SHORT[a[1]] ?? a[1];
    } else {
      positionals.push(a);
      continue;
    }
    if (value === undefined) {
      const next = argv[i + 1];
      if (BOOL_FLAGS.has(key)) value = true;
      else if (next !== undefined && (VALUE_FLAGS.has(key) || !next.startsWith('-') || next === '-' || /^-\d/.test(next))) {
        value = next;
        i += 1;
      } else value = true;
    }
    // --where 可重複
    flags[key] = key === 'where' && flags.where !== undefined ? [flags.where, value].flat() : value;
  }
  return { positionals, flags };
}

const OPTION_FLAGS = new Set([
  'json', 'yes', 'full', 'all', 'reveal', 'help', 'version', 'dry-run', 'csv',
  'search', 'sort', 'limit', 'columns', 'where', 'profile', 'base-url', 'out', 'format', 'data',
]);

// add/edit 用：從 --欄位 值 與 欄位=值 取出欄位設定
function collectAssignments(mod, flags, positionals) {
  const raw = {};
  for (const [k, v] of Object.entries(flags)) {
    if (OPTION_FLAGS.has(k) && !mod.fields.some((f) => f.name === k)) continue;
    raw[k] = v === true ? 'true' : String(v);
  }
  for (const p of positionals) {
    const m = p.match(/^([^=\s]+)=(.*)$/s);
    if (!m) throw new Error(`無法理解參數「${p}」，請用 欄位=值 或 --欄位 值`);
    raw[m[1]] = m[2];
  }
  if (flags.data) {
    const src = String(flags.data);
    const text = src.startsWith('@') ? fs.readFileSync(src.slice(1), 'utf8') : src;
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (err) {
      throw new Error(`--data 不是合法 JSON：${err.message}`);
    }
    for (const [k, v] of Object.entries(obj)) raw[k] = v === null || typeof v !== 'object' ? (typeof v === 'string' || v === null ? v : String(v)) : v;
  }
  return parseAssignments(mod, raw);
}

// ── 進入點 ───────────────────────────────────────────────

export async function main(argv) {
  const { positionals, flags } = parseArgs(argv);
  if (flags.version) {
    console.log(`fengbro ${VERSION}`);
    return 0;
  }
  const ctx = makeContext(flags);
  try {
    const [cmd, ...rest] = positionals;
    if (flags.help || cmd === 'help') {
      printBanner(flags);
      printHelp(cmd === 'help' ? rest[0] : cmd);
      return 0;
    }
    if (!cmd) {
      if (isInteractive() && !flags.json) {
        const { runInteractive } = await import('./interactive.js');
        return await runInteractive(ctx);
      }
      return await cmdHome(ctx);
    }
    return await dispatch(ctx, cmd, rest);
  } finally {
    closePrompt();
  }
}

function makeContext(flags) {
  const cfg = loadConfig();
  const conn = resolveConnection(cfg, { profile: flags.profile, baseUrl: flags['base-url'] });
  const client = createClient({ baseUrl: conn.baseUrl, profile: conn.profile });
  return { cfg, conn, client, flags };
}

const VERBS = {
  list: 'list', ls: 'list', 列表: 'list',
  show: 'show', get: 'show', view: 'show', 查看: 'show',
  add: 'add', new: 'add', create: 'add', 新增: 'add',
  edit: 'edit', update: 'edit', set: 'edit', 編輯: 'edit', 修改: 'edit',
  delete: 'delete', rm: 'delete', del: 'delete', remove: 'delete', 刪除: 'delete',
  export: 'export', 匯出: 'export',
  import: 'import', 匯入: 'import',
  fields: 'fields', 欄位: 'fields',
  done: 'done', 完成: 'done',
};

export async function dispatch(ctx, cmd, rest) {
  switch (cmd) {
    case 'home':
    case 'dashboard':
    case 'today':
    case '首頁':
      return cmdHome(ctx);
    case 'modules':
    case 'menu':
    case '模組':
      return cmdModules(ctx);
    case 'search':
    case 'find':
    case '搜尋':
      return cmdSearch(ctx, rest.join(' '));
    case 'finance':
    case '金融':
      return cmdFinance(ctx);
    case 'storage':
      return cmdStorage(ctx);
    case 'status':
    case 'doctor':
      return cmdStatus(ctx);
    case 'config':
    case 'settings':
    case '設定':
      return cmdConfig(ctx, rest);
    case 'interactive':
    case 'ui':
    case 'i': {
      const { runInteractive } = await import('./interactive.js');
      return runInteractive(ctx);
    }
    default:
      break;
  }

  // 動詞在前：fengbro list food
  if (VERBS[cmd]) {
    const [modName, ...args] = rest;
    if (VERBS[cmd] === 'export' && (modName === 'all' || modName === undefined)) return cmdExportAll(ctx);
    return runModuleAction(ctx, requireModule(modName), VERBS[cmd], args);
  }
  // 模組在前：fengbro food list
  const mod = findModule(cmd);
  if (mod) {
    const [verb, ...args] = rest;
    if (verb === undefined) return runModuleAction(ctx, mod, 'list', []);
    if (!VERBS[verb]) {
      // fengbro food <ref> → 查看
      return runModuleAction(ctx, mod, 'show', [verb, ...args]);
    }
    return runModuleAction(ctx, mod, VERBS[verb], args);
  }
  throw new Error(`未知指令「${cmd}」，執行 fengbro help 查看說明`);
}

export async function runModuleAction(ctx, mod, verb, args) {
  switch (verb) {
    case 'list':
      return cmdList(ctx, mod, args);
    case 'show':
      return cmdShow(ctx, mod, args[0]);
    case 'add':
      return cmdAdd(ctx, mod, args);
    case 'edit':
      return cmdEdit(ctx, mod, args[0], args.slice(1));
    case 'delete':
      return cmdDelete(ctx, mod, args);
    case 'export':
      return cmdExport(ctx, mod);
    case 'import':
      return cmdImport(ctx, mod, args[0]);
    case 'fields':
      return cmdFields(ctx, mod);
    case 'done':
      return cmdRoutineDone(ctx, mod, args[0], args[1]);
    default:
      throw new Error(`未知動作「${verb}」`);
  }
}

// ── 讀取 / 排序 ──────────────────────────────────────────

export async function loadSorted(ctx, mod) {
  const items = await ctx.client.list(mod);
  return mod.sort ? [...items].sort(mod.sort) : items;
}

function applyListOptions(mod, items, flags) {
  let out = items.map((item, i) => ({ item, index: i + 1 }));
  if (flags.search) out = out.filter(({ item }) => matchesSearch(item, String(flags.search)));
  for (const cond of [flags.where].flat().filter(Boolean)) {
    const m = String(cond).match(/^([^=!<>]+)(=|!=|>=|<=|>|<|~)(.*)$/);
    if (!m) throw new Error(`--where 格式：欄位=值、欄位!=值、欄位>值、欄位~關鍵字`);
    const [, key, op, rawVal] = m;
    const field = mod.fields.find((f) => f.name === key);
    const target = field && op !== '~' ? parseFieldValue(field, rawVal) : rawVal;
    out = out.filter(({ item }) => {
      let v = item[key];
      if (field?.type === 'date') v = dateOnly(v) || null;
      switch (op) {
        case '=':
          return (v ?? '') === (target ?? '') || String(v ?? '') === String(target ?? '');
        case '!=':
          return String(v ?? '') !== String(target ?? '');
        case '~':
          return String(v ?? '').toLowerCase().includes(rawVal.toLowerCase());
        default: {
          if (v === null || v === undefined || v === '') return false;
          const cmp = typeof v === 'number' ? v - Number(target) : String(v).localeCompare(String(target));
          return op === '>' ? cmp > 0 : op === '<' ? cmp < 0 : op === '>=' ? cmp >= 0 : cmp <= 0;
        }
      }
    });
  }
  if (flags.sort) {
    const desc = String(flags.sort).startsWith('-');
    const key = String(flags.sort).replace(/^-/, '');
    out.sort((a, b) => {
      const x = a.item[key];
      const y = b.item[key];
      if (x == null && y == null) return 0;
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-Hant');
      return desc ? -r : r;
    });
  }
  if (flags.limit) out = out.slice(0, Number(flags.limit));
  return out;
}

// ── 指令：列表 / 查看 ────────────────────────────────────

async function cmdList(ctx, mod, args) {
  const { flags } = ctx;
  if (args[0] && !flags.search) flags.search = args.join(' ');
  const items = await loadSorted(ctx, mod);
  const rows = applyListOptions(mod, items, flags);
  if (flags.json) {
    printJson(rows.map((r) => r.item));
    return 0;
  }
  if (flags.csv) {
    process.stdout.write(toCsv(mod, rows.map((r) => r.item)));
    return 0;
  }
  printModuleTable(mod, rows, flags);
  return 0;
}

export function printModuleTable(mod, rows, flags = {}) {
  const cols = flags.columns ? String(flags.columns).split(',').map((s) => s.trim()) : mod.columns;
  const headers = ['#', ...cols.map((col) => columnLabel(mod, col)), 'ID'];
  const body = rows.map(({ item, index }) => [
    c.gray(String(index)),
    ...cols.map((col) => cellValue(mod, item, col, { reveal: flags.reveal })),
    c.gray(itemId(item)),
  ]);
  console.log(`${c.bold(c.accent(mod.label))} ${c.gray(`· ${mod.description}`)}`);
  console.log(renderTable(headers, body, { align: ['right'] }));
  console.log(c.gray(`共 ${rows.length} 筆`) + moduleSummary(mod, rows.map((r) => r.item)));
}

function moduleSummary(mod, items) {
  if (mod.id === 'subscription') {
    const active = items.filter((s) => !s.archived);
    const total = active.reduce((sum, s) => sum + convertToTWD(s.price || 0, s.currency), 0);
    return c.gray(` · 未封存合計 NT$ ${total.toLocaleString()}`);
  }
  if (mod.id === 'bank') {
    return c.gray(` · 存款合計 NT$ ${items.reduce((s, b) => s + (b.deposit || 0), 0).toLocaleString()}`);
  }
  if (mod.id === 'food') {
    return c.gray(` · 總數量 ${items.reduce((s, x) => s + (x.amount || 0), 0)}`);
  }
  return '';
}

async function cmdShow(ctx, mod, ref) {
  const items = await loadSorted(ctx, mod);
  const item = resolveItem(items, mod, ref);
  if (ctx.flags.json) {
    printJson(item);
    return 0;
  }
  printItem(mod, item, ctx.flags);
  return 0;
}

export function printItem(mod, item, flags = {}) {
  console.log(`${c.bold(c.accent(itemTitle(mod, item)))}  ${c.gray(mod.label)}`);
  const rows = [];
  for (const field of mod.fields) {
    const v = item[field.name];
    if (!flags.all && (v === null || v === undefined || v === '')) continue;
    let shown = cellValue(mod, item, field.name, { reveal: flags.reveal });
    if (field.type === 'date' && mod.dateField === field.name) {
      const extra = cellValue(mod, item, mod.columns.includes('@since') ? '@since' : '@days');
      if (extra) shown += c.gray('  ') + extra;
    }
    rows.push([field.label, shown]);
  }
  for (const key of mod.readonlyFields ?? []) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      rows.push([key, key === 'fileSize' ? formatBytes(item[key]) : String(item[key])]);
    }
  }
  if (mod.id === 'manualprice' && Array.isArray(item.records)) {
    for (const r of [...item.records].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
      rows.push([`價格 ${r.date}`, formatMoney(r.price, item.currency)]);
    }
  }
  rows.push([c.gray('ID'), c.gray(itemId(item))]);
  if (item.$updatedAt) rows.push([c.gray('更新於'), c.gray(new Date(item.$updatedAt).toLocaleString('zh-TW'))]);
  const labelWidth = Math.max(...rows.map(([l]) => strWidth(l)), 4);
  const indent = ' '.repeat(labelWidth + 2);
  for (const [label, value] of rows) {
    console.log(`${pad(c.gray(label), labelWidth + 2)}${String(value).split('\n').join('\n' + indent)}`);
  }
  if (mod.secret?.some((k) => item[k]) && !flags.reveal) console.log(c.gray('（序號等敏感欄位已隱藏，加上 --reveal 顯示）'));
}

// ── 指令：新增 / 編輯 / 刪除 ─────────────────────────────

function assertWritable(mod) {
  if (mod.readonly) throw new Error(`${mod.label} 在 CLI 版為唯讀，請使用網頁版管理`);
}

async function cmdAdd(ctx, mod, args) {
  assertWritable(mod);
  let values = collectAssignments(mod, ctx.flags, args);
  if (!Object.keys(values).length) {
    if (!isInteractive()) throw new Error(`請提供欄位，例如：fengbro ${mod.id} add --${mod.primary} "名稱"`);
    if (mod.media) console.log(c.yellow('提醒：CLI 版不支援上傳檔案，只能建立中繼資料。'));
    values = await promptFields(mod, {});
  }
  const payload = buildCreatePayload(mod, values);
  if (ctx.flags['dry-run']) {
    printJson({ method: 'POST', endpoint: mod.endpoint, body: payload });
    return 0;
  }
  const created = await ctx.client.create(mod, payload);
  if (ctx.flags.json) printJson(created);
  else console.log(`${c.green('✓ 已新增')} ${itemTitle(mod, created ?? payload)} ${c.gray(itemId(created))}`);
  return 0;
}

async function cmdEdit(ctx, mod, ref, args) {
  assertWritable(mod);
  const items = await loadSorted(ctx, mod);
  const current = resolveItem(items, mod, ref);
  let changes = collectAssignments(mod, ctx.flags, args);
  if (!Object.keys(changes).length) {
    if (!isInteractive()) throw new Error(`請提供要修改的欄位，例如：fengbro ${mod.id} edit ${itemId(current)} --note "..."`);
    changes = await promptFields(mod, current);
  }
  const payload = buildUpdatePayload(mod, current, changes);
  if (ctx.flags['dry-run']) {
    printJson({ method: 'PUT', endpoint: `${mod.itemEndpoint || mod.endpoint}/${itemId(current)}`, body: payload });
    return 0;
  }
  const updated = await ctx.client.update(mod, itemId(current), payload);
  if (ctx.flags.json) printJson(updated);
  else {
    const changed = Object.keys(changes)
      .map((k) => `${mod.fields.find((f) => f.name === k)?.label ?? k}`)
      .join('、');
    console.log(`${c.green('✓ 已更新')} ${itemTitle(mod, current)} ${c.gray(`(${changed || '無變更'})`)}`);
  }
  return 0;
}

async function cmdDelete(ctx, mod, refs) {
  assertWritable(mod);
  if (!refs.length) throw new Error('請指定要刪除的 ID、序號或名稱');
  const items = await loadSorted(ctx, mod);
  const targets = refs.map((r) => resolveItem(items, mod, r));
  console.log(c.bold(`即將從 ${mod.label} 刪除 ${targets.length} 筆：`));
  for (const t of targets) console.log(`  ${c.red('✗')} ${itemTitle(mod, t)} ${c.gray(itemId(t))}`);
  if (!ctx.flags.yes) {
    if (!isInteractive()) throw new Error('非互動模式請加上 --yes 確認刪除');
    if (!(await confirm('確定刪除？此動作無法復原'))) {
      console.log('已取消');
      return 1;
    }
  }
  if (ctx.flags['dry-run']) return 0;
  for (const t of targets) {
    await ctx.client.remove(mod, itemId(t));
    console.log(`${c.green('✓ 已刪除')} ${itemTitle(mod, t)}`);
  }
  return 0;
}

// 鋒兄例行：記錄今天（或指定日期）已執行，最近三次日期往後推
async function cmdRoutineDone(ctx, mod, ref, dateArg) {
  if (mod.id !== 'routine') throw new Error('done 只適用於 鋒兄例行（routine）');
  const items = await loadSorted(ctx, mod);
  const current = resolveItem(items, mod, ref);
  const date = parseFieldValue(mod.fields.find((f) => f.name === 'lastdate1'), dateArg ?? 'today');
  const last1 = dateOnly(current.lastdate1) || null;
  const changes =
    last1 === date
      ? {}
      : { lastdate1: date, lastdate2: last1, lastdate3: dateOnly(current.lastdate2) || null };
  if (!Object.keys(changes).length) {
    console.log(c.gray(`${current.name} 已記錄 ${date}，不需更新`));
    return 0;
  }
  const payload = buildUpdatePayload(mod, current, changes);
  if (ctx.flags['dry-run']) {
    printJson(payload);
    return 0;
  }
  await ctx.client.update(mod, itemId(current), payload);
  console.log(`${c.green('✓')} ${current.name} 已記錄 ${date}${last1 ? c.gray(`（上次 ${last1}）`) : ''}`);
  return 0;
}

export async function promptFields(mod, current) {
  const isNew = !itemId(current);
  console.log(c.gray(isNew ? `新增 ${mod.label}（Enter 使用預設值）` : `編輯「${itemTitle(mod, current)}」（Enter 保留原值，輸入 - 清空）`));
  const changes = {};
  const fields = mod.id === 'commonaccount' ? mod.fields.filter((f) => f.name === 'name' || current[f.name] || /01$/.test(f.name)) : mod.fields;
  for (const field of fields) {
    const cur = current[field.name];
    let def;
    if (isNew) def = field.default === undefined ? '' : field.type === 'bool' ? (field.default ? 'yes' : 'no') : field.default;
    else if (field.type === 'bool') def = cur ? 'yes' : 'no';
    else if (field.type === 'date') def = dateOnly(cur);
    else def = cur ?? '';
    let hint = '';
    if (field.type === 'enum') hint = c.gray(` (${field.options.map((o) => `${o.value}=${o.label}`).join(', ')})`);
    if (field.type === 'date') hint = c.gray(' (YYYY-MM-DD / today / +7)');
    if (field.type === 'bool') hint = c.gray(' (yes/no)');
    if (field.suggestions) hint = c.gray(` (${field.suggestions.join('、')})`);
    for (;;) {
      const shownDefault = def === '' || def === undefined ? undefined : String(def);
      const answer = (await ask(`${field.label}${field.required ? c.red('*') : ''}${hint}`, shownDefault)).trim();
      try {
        if (answer === '-') {
          if (field.required) throw new Error(`${field.label} 為必填，不能清空`);
          changes[field.name] = field.type === 'date' ? null : parseFieldValue(field, '');
        } else if (answer === '') {
          if (field.required) throw new Error(`${field.label} 為必填`);
        } else if (isNew || answer !== shownDefault) {
          changes[field.name] = parseFieldValue(field, answer);
        }
        break;
      } catch (err) {
        console.log(c.yellow(`  ${err.message}`));
      }
    }
  }
  return changes;
}

// ── 匯出 / 匯入 ──────────────────────────────────────────

async function cmdExport(ctx, mod) {
  const items = await loadSorted(ctx, mod);
  const format = String(ctx.flags.format || (String(ctx.flags.out || '').endsWith('.json') ? 'json' : 'csv'));
  const text = format === 'json' ? JSON.stringify(items, null, 2) + '\n' : toCsv(mod, items);
  if (ctx.flags.out && ctx.flags.out !== true) {
    fs.writeFileSync(String(ctx.flags.out), text);
    console.error(`${c.green('✓')} 已匯出 ${items.length} 筆 ${mod.label} → ${ctx.flags.out}`);
  } else process.stdout.write(text);
  return 0;
}

async function cmdExportAll(ctx) {
  const dir = String(ctx.flags.out && ctx.flags.out !== true ? ctx.flags.out : `fengbro-backup-${toYmd(new Date())}`);
  fs.mkdirSync(dir, { recursive: true });
  const format = ctx.flags.format === 'json' ? 'json' : 'csv';
  let failed = 0;
  for (const mod of MODULES) {
    try {
      const items = await loadSorted(ctx, mod);
      const file = path.join(dir, `${mod.id}.${format}`);
      fs.writeFileSync(file, format === 'json' ? JSON.stringify(items, null, 2) + '\n' : toCsv(mod, items));
      console.log(`${c.green('✓')} ${mod.label.padEnd(8)} ${String(items.length).padStart(4)} 筆 → ${file}`);
    } catch (err) {
      failed += 1;
      console.log(`${c.yellow('!')} ${mod.label.padEnd(8)} ${c.gray(err.message)}`);
    }
  }
  console.log(c.gray(`備份完成：${dir}${failed ? `（${failed} 個模組失敗）` : ''}`));
  return failed ? 1 : 0;
}

async function cmdImport(ctx, mod, file) {
  assertWritable(mod);
  if (!file) throw new Error(`請指定檔案，例如：fengbro ${mod.id} import ${mod.id}.csv`);
  const text = fs.readFileSync(file, 'utf8');
  const rows = file.endsWith('.json') ? JSON.parse(text) : parseCsv(text);
  if (!Array.isArray(rows)) throw new Error('匯入檔必須是陣列（JSON）或 CSV');
  const existing = await ctx.client.list(mod);
  const plan = [];
  const errors = [];
  rows.forEach((row, i) => {
    try {
      const raw = {};
      for (const f of mod.fields) {
        if (!(f.name in row)) continue;
        const v = row[f.name];
        raw[f.name] = v === null || typeof v === 'string' ? v : String(v);
      }
      const values = parseAssignments(mod, raw);
      const id = row.$id || row.id;
      const match =
        (id && existing.find((x) => itemId(x) === id)) ||
        existing.find((x) => x[mod.primary] && x[mod.primary] === values[mod.primary]);
      if (match) plan.push({ action: 'update', target: match, payload: buildUpdatePayload(mod, match, values) });
      else plan.push({ action: 'create', payload: buildCreatePayload(mod, values) });
    } catch (err) {
      errors.push(`第 ${i + 2} 行：${err.message}`);
    }
  });
  const creates = plan.filter((p) => p.action === 'create').length;
  const updates = plan.length - creates;
  console.log(`${mod.label}：新增 ${c.green(creates)} 筆、更新 ${c.yellow(updates)} 筆${errors.length ? `、錯誤 ${c.red(errors.length)} 筆` : ''}`);
  for (const e of errors.slice(0, 20)) console.log(c.red(`  ${e}`));
  if (ctx.flags['dry-run'] || !plan.length) return errors.length ? 1 : 0;
  if (!ctx.flags.yes) {
    if (!isInteractive()) throw new Error('非互動模式請加上 --yes 確認匯入');
    if (!(await confirm('開始匯入？'))) return 1;
  }
  let ok = 0;
  let fail = 0;
  for (const p of plan) {
    try {
      if (p.action === 'create') await ctx.client.create(mod, p.payload);
      else await ctx.client.update(mod, itemId(p.target), p.payload);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.log(c.red(`  ${p.payload[mod.primary]}：${err.message}`));
    }
  }
  console.log(`${fail ? c.yellow('!') : c.green('✓')} 成功 ${ok}${fail ? `、失敗 ${fail}` : ''}`);
  return fail || errors.length ? 1 : 0;
}

function cmdFields(ctx, mod) {
  if (ctx.flags.json) {
    printJson(mod.fields.map(({ pattern, ...f }) => f));
    return 0;
  }
  console.log(`${c.bold(mod.label)} ${c.gray(`(${mod.id} · ${mod.endpoint})`)}`);
  const fields = mod.id === 'commonaccount' ? mod.fields.filter((f) => !/(0[2-9]|[1-3]\d)$/.test(f.name)) : mod.fields;
  const rows = fields.map((f) => [
    f.name + (f.required ? c.red('*') : ''),
    f.label,
    f.type,
    f.options ? f.options.map((o) => o.value).join('|') : f.default !== undefined ? String(f.default) : '',
  ]);
  console.log(renderTable(['欄位', '名稱', '型別', '選項／預設'], rows));
  if (mod.id === 'commonaccount') console.log(c.gray('（site01–site37、note01–note37 共 37 組）'));
  return 0;
}

// ── 首頁 ─────────────────────────────────────────────────

const DASHBOARD_MODULES = ['food', 'subscription', 'bank', 'trial-purchase', 'quota', 'shopping-list'];
const FULL_ONLY = ['article', 'commonaccount', 'routine'];

export async function loadDashboard(ctx, full = false) {
  const ids = full ? [...DASHBOARD_MODULES, ...FULL_ONLY] : DASHBOARD_MODULES;
  const data = {};
  const errors = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        data[id] = await ctx.client.list(findModule(id));
      } catch (err) {
        data[id] = [];
        errors.push(`${findModule(id).label}：${err.message}`);
      }
    }),
  );
  return { stats: computeDashboard(data), errors };
}

async function cmdHome(ctx) {
  const { stats, errors } = await loadDashboard(ctx, ctx.flags.full);
  if (ctx.flags.json) {
    printJson({ ...stats, errors });
    return errors.length === DASHBOARD_MODULES.length ? 1 : 0;
  }
  printBanner(ctx.flags);
  printDashboard(stats, errors, ctx.flags.full);
  return 0;
}

export function printDashboard(stats, errors = [], full = false) {
  console.log(`${c.gray('CONSOLE VIEW')}\n${c.bold(c.accent('鋒兄首頁'))}  ${c.gray('先處理今天需要注意的事，再前往常用模組。')}\n`);
  console.log(c.bold('今日待處理') + '  ' + (stats.attention ? c.yellow(`目前有 ${stats.attention} 項需要注意。`) : c.green('目前沒有緊急項目。')));
  const cells = stats.cards.map((card) => {
    const n = card.items.length;
    const num = n === 0 ? c.gray('0') : card.tone === 'danger' ? c.red(String(n)) : c.yellow(String(n));
    return [card.label, num];
  });
  const half = Math.ceil(cells.length / 2);
  const left = cells.slice(0, half);
  const right = cells.slice(half);
  const rows = left.map((l, i) => [l[0], l[1], '', right[i]?.[0] ?? '', right[i]?.[1] ?? '']);
  console.log(renderTable(['項目', '數量', '', '項目', '數量'], rows, { align: ['left', 'right', 'left', 'left', 'right'] }).split('\n').slice(2).join('\n'));

  for (const card of stats.cards.filter((x) => x.items.length)) {
    console.log(`\n${card.tone === 'danger' ? c.red('●') : c.yellow('●')} ${c.bold(card.label)} ${c.gray(`→ fengbro ${card.module}`)}`);
    for (const it of card.items.slice(0, 10)) {
      const d = it.daysRemaining;
      const when = d < 0 ? c.red(`逾期 ${-d} 天`) : d === 0 ? c.red('今天') : c.yellow(`${d} 天內`);
      const extra = [it.label, it.account, it.price ? formatMoney(it.price, it.currency || 'TWD') : '', it.category].filter(Boolean).join(' · ');
      console.log(`   ${dateOnly(it.date)}  ${when.padEnd(8)}  ${it.name}${extra ? c.gray(`  ${extra}`) : ''}`);
    }
    if (card.items.length > 10) console.log(c.gray(`   …還有 ${card.items.length - 10} 筆`));
  }

  if (full) {
    const t = stats.totals;
    console.log(`\n${c.bold('完整儀表')}`);
    const rows2 = [
      ['食品', t.foods, '訂閱', t.subscriptions],
      ['試用／首購', t.trialPurchases, '額度帳號', t.quotaAccounts],
      ['購物清單', t.shoppingItems, '銀行', t.banks],
      ['筆記', t.articles, '常用', t.commonAccounts],
      ['例行', t.routines, '', ''],
    ].map((r) => r.map(String));
    console.log(renderTable(['模組', '筆數', '模組', '筆數'], rows2, { align: ['left', 'right', 'left', 'right'] }));
    console.log(`訂閱費用合計 ${c.bold(`NT$ ${t.subscriptionFeeTWD.toLocaleString()}`)}　銀行存款合計 ${c.bold(`NT$ ${t.bankDeposit.toLocaleString()}`)}`);
    const soon = stats.lists.subscriptionsExpiring7Days;
    if (soon.length) console.log(c.gray(`7 天內扣款：${soon.map((s) => s.name).join('、')}`));
    const food30 = stats.lists.foodsExpiring30Days;
    if (food30.length) console.log(c.gray(`30 天內到期食品：${food30.map((s) => s.name).join('、')}`));
  }
  if (errors.length) {
    console.log('');
    for (const e of errors) console.log(c.yellow(`! ${e}`));
  }
  if (!full) console.log(c.gray('\n加上 --full 查看完整儀表；fengbro modules 查看全部模組'));
}

// ── 其他指令 ─────────────────────────────────────────────

function cmdModules(ctx) {
  if (ctx.flags.json) {
    printJson(MODULES.map(({ id, label, endpoint, aliases, group, description, readonly }) => ({ id, label, endpoint, aliases, group, description, readonly: !!readonly })));
    return 0;
  }
  for (const group of ['manage', 'tools']) {
    console.log(c.bold(GROUPS[group]));
    const rows = MODULES.filter((m) => m.group === group).map((m) => [
      c.accent(m.id),
      m.label + (m.readonly ? c.gray(' (唯讀)') : ''),
      m.description,
      c.gray(m.aliases.join(', ')),
    ]);
    console.log(renderTable(['模組', '名稱', '說明', '別名'], rows));
    console.log('');
  }
  console.log(c.gray('用法：fengbro <模組> [list|show|add|edit|delete|export|import|fields]'));
  return 0;
}

async function cmdSearch(ctx, query) {
  if (!query) throw new Error('請輸入搜尋關鍵字，例如：fengbro search netflix');
  const results = await Promise.all(
    MODULES.filter((m) => !m.media || m.id === 'music').map(async (mod) => {
      try {
        const items = await loadSorted(ctx, mod);
        return { mod, hits: items.map((item, i) => ({ item, index: i + 1 })).filter(({ item }) => matchesSearch(item, query)) };
      } catch {
        return { mod, hits: [] };
      }
    }),
  );
  const found = results.filter((r) => r.hits.length);
  if (ctx.flags.json) {
    printJson(Object.fromEntries(found.map((r) => [r.mod.id, r.hits.map((h) => h.item)])));
    return 0;
  }
  if (!found.length) {
    console.log(c.gray(`找不到「${query}」`));
    return 1;
  }
  for (const { mod, hits } of found) {
    printModuleTable(mod, hits.slice(0, 20), ctx.flags);
    console.log('');
  }
  return 0;
}

async function cmdFinance(ctx) {
  const data = await ctx.client.request('/api/fengbro-finance');
  if (ctx.flags.json) {
    printJson(data);
    return 0;
  }
  console.log(`${c.bold(c.accent('鋒兄金融'))} ${c.gray(`${data?.source ?? ''} · ${data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString('zh-TW') : ''}`)}`);
  const quotes = data?.quotes ?? [];
  if (!quotes.length) {
    console.log(c.gray('（目前沒有報價，可用 fengbro instrument 管理追蹤標的）'));
  } else {
    const rows = quotes.map((q) => {
      const chg = Number(q.change ?? q.changePercent ?? 0);
      const color = chg > 0 ? c.red : chg < 0 ? c.green : (x) => x; // 台股慣例：紅漲綠跌
      return [
        q.name ?? q.symbol ?? '',
        q.symbol ?? '',
        q.price !== undefined ? Number(q.price).toLocaleString() : '',
        q.change !== undefined ? color(`${q.change > 0 ? '+' : ''}${q.change}`) : '',
        q.changePercent !== undefined ? color(`${q.changePercent > 0 ? '+' : ''}${Number(q.changePercent).toFixed(2)}%`) : '',
      ];
    });
    console.log(renderTable(['名稱', '代號', '價格', '漲跌', '漲跌幅'], rows, { align: ['left', 'left', 'right', 'right', 'right'] }));
  }
  for (const alert of data?.financeAlerts ?? []) console.log(c.yellow(`! ${typeof alert === 'string' ? alert : alert.message ?? JSON.stringify(alert)}`));
  return 0;
}

async function cmdStorage(ctx) {
  const data = await ctx.client.request('/api/storage-stats');
  if (ctx.flags.json) {
    printJson(data);
    return 0;
  }
  const s = data?.stats ?? {};
  console.log(c.bold(c.accent('Appwrite Storage')));
  console.log(`使用量  ${formatBytes(s.totalSize)} / ${formatBytes(s.storageLimit)}  ${c.gray(`(${Number(s.usagePercentage ?? 0).toFixed(1)}%)`)}`);
  console.log(`檔案數  ${s.totalFiles ?? 0}`);
  const cats = ['images', 'videos', 'music', 'documents', 'other'].filter((k) => s[k] !== undefined);
  if (cats.length) {
    const label = { images: '圖片', videos: '影片', music: '音樂', documents: '文件', other: '其他' };
    const rows = cats.map((k) => {
      const v = s[k];
      return typeof v === 'object' && v ? [label[k], String(v.count ?? ''), formatBytes(v.size ?? 0)] : [label[k], String(v), ''];
    });
    console.log(renderTable(['類型', '檔案數', '大小'], rows, { align: ['left', 'right', 'right'] }));
  }
  return 0;
}

async function cmdStatus(ctx) {
  const { conn } = ctx;
  console.log(`${c.bold('後端')}      ${conn.baseUrl}`);
  console.log(`${c.bold('設定檔')}    ${conn.profileName} ${c.gray(`(${configPath()})`)}`);
  const custom = conn.profile.endpoint || conn.profile.projectId || conn.profile.databaseId;
  console.log(`${c.bold('Appwrite')}  ${custom ? `${conn.profile.endpoint ?? ''} / ${conn.profile.projectId ?? ''} / ${conn.profile.databaseId ?? ''}` : c.gray('使用網站預設帳號')}`);
  const started = Date.now();
  const results = await Promise.all(
    DASHBOARD_MODULES.map(async (id) => {
      const mod = findModule(id);
      try {
        const items = await ctx.client.list(mod);
        return [mod.label, c.green('✓'), `${items.length} 筆`];
      } catch (err) {
        return [mod.label, c.red('✗'), err.message];
      }
    }),
  );
  console.log(renderTable(['模組', '狀態', '結果'], results));
  console.log(c.gray(`耗時 ${Date.now() - started} ms`));
  return results.some((r) => r[1].includes('✗')) ? 1 : 0;
}

// ── 設定（Appwrite 帳號切換）──────────────────────────────

const PROFILE_FIELD_ALIASES = {
  endpoint: 'endpoint',
  project: 'projectId',
  projectid: 'projectId',
  database: 'databaseId',
  databaseid: 'databaseId',
  db: 'databaseId',
  key: 'apiKey',
  apikey: 'apiKey',
  'api-key': 'apiKey',
  bucket: 'bucketId',
  bucketid: 'bucketId',
};

async function cmdConfig(ctx, args) {
  const { cfg } = ctx;
  const [sub = 'show', ...rest] = args;
  const profileName = ctx.flags.profile || cfg.current;
  const profile = (cfg.profiles[profileName] ??= {});
  switch (sub) {
    case 'show':
    case 'list':
    case 'ls': {
      if (ctx.flags.json) {
        const masked = JSON.parse(JSON.stringify(cfg));
        for (const p of Object.values(masked.profiles)) if (p.apiKey) p.apiKey = maskSecret(p.apiKey);
        printJson(masked);
        return 0;
      }
      console.log(`${c.bold('設定檔位置')}  ${configPath()}`);
      console.log(`${c.bold('後端網址')}    ${cfg.baseUrl}${cfg.baseUrl === DEFAULT_BASE_URL ? c.gray(' (預設)') : ''}\n`);
      for (const [name, p] of Object.entries(cfg.profiles)) {
        const mark = name === cfg.current ? c.green('●') : c.gray('○');
        console.log(`${mark} ${c.bold(name)}${name === cfg.current ? c.gray(' (使用中)') : ''}`);
        const keys = Object.keys(PROFILE_KEYS).filter((k) => p[k]);
        if (!keys.length) console.log(c.gray('    使用網站預設 Appwrite 帳號'));
        for (const k of keys) console.log(`    ${PROFILE_LABELS[k].padEnd(18)} ${k === 'apiKey' ? maskSecret(p[k]) : p[k]}`);
      }
      return 0;
    }
    case 'path':
      console.log(configPath());
      return 0;
    case 'use':
    case 'switch': {
      const name = rest[0];
      if (!name || !cfg.profiles[name]) throw new Error(`找不到設定檔「${name ?? ''}」，可用：${Object.keys(cfg.profiles).join(', ')}`);
      cfg.current = name;
      saveConfig(cfg);
      console.log(`${c.green('✓')} 已切換到 ${name}`);
      return 0;
    }
    case 'add':
    case 'create': {
      const name = rest[0];
      if (!name) throw new Error('請指定設定檔名稱，例如：fengbro config add work');
      if (cfg.profiles[name] && Object.keys(cfg.profiles[name]).length) throw new Error(`設定檔「${name}」已存在`);
      const p = {};
      if (isInteractive() && !ctx.flags.yes) {
        for (const k of Object.keys(PROFILE_KEYS)) {
          const v = (await ask(PROFILE_LABELS[k])).trim();
          if (v) p[k] = v;
        }
      }
      cfg.profiles[name] = p;
      if (ctx.flags.use || !Object.keys(cfg.profiles).includes(cfg.current)) cfg.current = name;
      saveConfig(cfg);
      console.log(`${c.green('✓')} 已建立設定檔 ${name}${cfg.current === name ? '（使用中）' : `，用 fengbro config use ${name} 切換`}`);
      return 0;
    }
    case 'remove':
    case 'rm':
    case 'delete': {
      const name = rest[0];
      if (!cfg.profiles[name]) throw new Error(`找不到設定檔「${name ?? ''}」`);
      if (!ctx.flags.yes && isInteractive() && !(await confirm(`刪除設定檔 ${name}？`))) return 1;
      delete cfg.profiles[name];
      if (cfg.current === name) cfg.current = Object.keys(cfg.profiles)[0] ?? 'default';
      if (!cfg.profiles[cfg.current]) cfg.profiles[cfg.current] = {};
      saveConfig(cfg);
      console.log(`${c.green('✓')} 已刪除 ${name}，目前使用 ${cfg.current}`);
      return 0;
    }
    case 'set': {
      const [rawKey, ...valueParts] = rest;
      if (!rawKey) throw new Error('用法：fengbro config set <endpoint|project|database|key|bucket|base-url> <值>');
      let value = valueParts.join(' ');
      if (['base-url', 'baseurl', 'url'].includes(rawKey.toLowerCase())) {
        if (!value) throw new Error('請提供網址');
        new URL(value);
        cfg.baseUrl = value.replace(/\/+$/, '');
        saveConfig(cfg);
        console.log(`${c.green('✓')} 後端網址 → ${cfg.baseUrl}`);
        return 0;
      }
      const key = PROFILE_FIELD_ALIASES[rawKey.toLowerCase()] ?? Object.keys(PROFILE_KEYS).find((k) => PROFILE_KEYS[k] === rawKey);
      if (!key) throw new Error(`未知設定「${rawKey}」，可用：endpoint、project、database、key、bucket、base-url`);
      if (!value && key === 'apiKey' && isInteractive()) value = (await ask('API Key')).trim();
      if (!value) throw new Error('請提供設定值');
      profile[key] = value;
      saveConfig(cfg);
      console.log(`${c.green('✓')} [${profileName}] ${PROFILE_LABELS[key]} → ${key === 'apiKey' ? maskSecret(value) : value}`);
      return 0;
    }
    case 'unset': {
      const rawKey = rest[0] ?? '';
      if (['base-url', 'baseurl', 'url'].includes(rawKey.toLowerCase())) {
        cfg.baseUrl = DEFAULT_BASE_URL;
      } else if (rawKey === 'all') {
        cfg.profiles[profileName] = {};
      } else {
        const key = PROFILE_FIELD_ALIASES[rawKey.toLowerCase()];
        if (!key) throw new Error('用法：fengbro config unset <endpoint|project|database|key|bucket|base-url|all>');
        delete profile[key];
      }
      saveConfig(cfg);
      console.log(`${c.green('✓')} 已清除 ${rawKey}`);
      return 0;
    }
    case 'import-env': {
      const file = rest[0] ?? '.env';
      const values = parseEnvFile(fs.readFileSync(file, 'utf8'));
      if (!Object.keys(values).length) throw new Error(`${file} 裡找不到 ${Object.values(PROFILE_KEYS).join('、')}`);
      Object.assign(profile, values);
      saveConfig(cfg);
      console.log(`${c.green('✓')} 已從 ${file} 匯入到 ${profileName}：${Object.keys(values).map((k) => PROFILE_LABELS[k]).join('、')}`);
      return 0;
    }
    default:
      throw new Error(`未知子指令「${sub}」，可用：show、use、add、remove、set、unset、import-env、path`);
  }
}

// ── 說明 ─────────────────────────────────────────────────

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function printHelp(topic) {
  const mod = topic && findModule(topic);
  if (mod) {
    console.log(`${c.bold(mod.label)}  ${c.gray(mod.description)}

  fengbro ${mod.id}                         列表（預設）
  fengbro ${mod.id} list [關鍵字]           列表／搜尋
  fengbro ${mod.id} show <ID|#序號|名稱>     查看單筆${mod.readonly ? '' : `
  fengbro ${mod.id} add --${mod.primary} "…" [--欄位 值 …]
  fengbro ${mod.id} edit <ID|#序號|名稱> --欄位 值 [欄位=值 …]
  fengbro ${mod.id} delete <ID|#序號|名稱> [--yes]
  fengbro ${mod.id} import <檔案.csv|json> [--dry-run] [--yes]`}
  fengbro ${mod.id} export [--out 檔案] [--format csv|json]
  fengbro ${mod.id} fields                  欄位說明${mod.id === 'routine' ? `
  fengbro routine done <ID|#序號|名稱> [日期]  記錄今天已執行` : ''}

  別名：${mod.aliases.join(', ')}`);
    return;
  }
  console.log(`${c.bold(c.accent('fengbro'))} ${c.gray(`v${VERSION}`)} — 鋒兄AI Appwrite 的 CLI 版本

${c.bold('用法')}
  fengbro                         互動模式（在終端機中）／首頁
  fengbro home [--full]           鋒兄首頁：今日待處理（--full 完整儀表）
  fengbro modules                 列出所有模組
  fengbro <模組> [動作] [參數]     管理模組資料
  fengbro search <關鍵字>          跨模組搜尋
  fengbro finance                 鋒兄金融報價
  fengbro storage                 Appwrite Storage 使用量
  fengbro export all [--out 目錄]  備份全部模組為 CSV（或 --format json）
  fengbro config …                Appwrite 帳號切換與設定
  fengbro status                  檢查連線

${c.bold('模組動作')}
  list | show | add | edit | delete | export | import | fields | done(例行)

${c.bold('常用模組')}
  ${MODULES.filter((m) => m.group === 'manage').map((m) => `${m.id}`).join('  ')}
  ${MODULES.filter((m) => m.group === 'tools').map((m) => `${m.id}`).join('  ')}

${c.bold('範例')}
  fengbro sub                                     訂閱列表
  fengbro sub add --name Netflix --price 390 --nextdate 2026-10-15 --continue yes
  fengbro sub edit Netflix --nextdate +1m
  fengbro food list --where "todate<2026-12-31" --sort todate
  fengbro routine done 倒垃圾
  fengbro bank --json | jq '.[].deposit'
  fengbro config add work && fengbro config use work

${c.bold('通用選項')}
  --json            輸出 JSON          --csv             輸出 CSV（列表）
  --search, -s      關鍵字篩選         --where 條件      欄位=值、!=、>、<、~（包含）
  --sort 欄位       排序（-欄位 反序）  --limit, -n       筆數上限
  --columns a,b     自訂欄位           --reveal          顯示序號等敏感欄位
  --yes, -y         略過確認           --dry-run         只顯示將送出的資料
  --profile, -p     指定設定檔         --base-url        指定後端網址

${c.gray('fengbro help <模組> 查看模組說明；日期可用 YYYY-MM-DD、today、+7、+1m、none')}`);
}
