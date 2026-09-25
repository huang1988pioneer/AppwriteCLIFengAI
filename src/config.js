// 設定檔：對應網頁版「鋒兄設定 → Appwrite 帳號切換」。
// 網頁版把連線資訊存在瀏覽器 localStorage；CLI 版存在 ~/.config/fengbro/config.json（權限 600）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'https://fengbroaiappwrite.vercel.app';

// profile 欄位 ↔ 網頁版 localStorage / .env 鍵名
export const PROFILE_KEYS = {
  endpoint: 'NEXT_PUBLIC_APPWRITE_ENDPOINT',
  projectId: 'NEXT_PUBLIC_APPWRITE_PROJECT_ID',
  databaseId: 'APPWRITE_DATABASE_ID',
  apiKey: 'APPWRITE_API_KEY',
  bucketId: 'APPWRITE_BUCKET_ID',
};

export const PROFILE_LABELS = {
  endpoint: 'Appwrite Endpoint',
  projectId: 'Project ID',
  databaseId: 'Database ID',
  apiKey: 'API Key',
  bucketId: 'Bucket ID',
};

export function configPath() {
  if (process.env.FENGBRO_CONFIG) return process.env.FENGBRO_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'fengbro', 'config.json');
}

function emptyConfig() {
  return { baseUrl: DEFAULT_BASE_URL, current: 'default', profiles: { default: {} } };
}

export function loadConfig() {
  const file = configPath();
  let cfg = emptyConfig();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    cfg = { ...cfg, ...raw, profiles: { ...cfg.profiles, ...(raw.profiles || {}) } };
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`無法讀取設定檔 ${file}：${err.message}`);
  }
  if (!cfg.profiles[cfg.current]) cfg.profiles[cfg.current] = {};
  return cfg;
}

export function saveConfig(cfg) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

// 實際生效的連線設定：CLI 參數 > 環境變數 > 設定檔
export function resolveConnection(cfg, overrides = {}) {
  const profileName = overrides.profile || process.env.FENGBRO_PROFILE || cfg.current;
  if (overrides.profile && !cfg.profiles[profileName]) {
    throw new Error(`找不到設定檔「${profileName}」，可用：${Object.keys(cfg.profiles).join(', ')}`);
  }
  const profile = { ...(cfg.profiles[profileName] || {}) };
  for (const [key, envKey] of Object.entries(PROFILE_KEYS)) {
    const alt = envKey.replace(/^NEXT_PUBLIC_/, '');
    const v = process.env[envKey] ?? process.env[alt];
    if (v) profile[key] = v;
  }
  const baseUrl = (overrides.baseUrl || process.env.FENGBRO_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { profileName, profile, baseUrl };
}

export function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 8) return '•'.repeat(s.length);
  return `${s.slice(0, 4)}${'•'.repeat(8)}${s.slice(-4)}`;
}

// 讀取 .env 檔（KEY=VALUE），轉為 profile
export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const quoted = m[2].match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
    env[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '');
  }
  const profile = {};
  for (const [key, envKey] of Object.entries(PROFILE_KEYS)) {
    const v = env[envKey] ?? env[envKey.replace(/^NEXT_PUBLIC_/, '')];
    if (v) profile[key] = v;
  }
  return profile;
}
