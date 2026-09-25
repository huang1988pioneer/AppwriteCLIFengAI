// API 客戶端：與網頁版 fetchApi / useCrud 行為一致。
//   GET    /api/<module>        列表
//   POST   /api/<module>        新增
//   PUT    /api/<module>/<id>   更新
//   DELETE /api/<module>/<id>   刪除
// 若設定了自訂 Appwrite 帳號，會和網頁版一樣以 _endpoint/_project/_database/_key/_bucket 參數帶給後端。

import { itemId } from './modules.js';

const OVERRIDE_PARAMS = {
  endpoint: '_endpoint',
  projectId: '_project',
  databaseId: '_database',
  apiKey: '_key',
  bucketId: '_bucket',
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createClient({ baseUrl, profile = {}, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  function buildUrl(pathname) {
    const url = new URL(pathname, baseUrl + '/');
    if (profile.endpoint || profile.projectId || profile.databaseId) {
      for (const [key, param] of Object.entries(OVERRIDE_PARAMS)) {
        if (profile[key]) url.searchParams.set(param, profile[key]);
      }
    }
    return url;
  }

  async function request(pathname, { method = 'GET', body, headers } = {}) {
    const url = buildUrl(pathname);
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? `逾時（${timeoutMs / 1000} 秒）` : err?.cause?.message || err.message;
      throw new ApiError(`無法連線到 ${url.origin}：${reason}`, 0);
    }
    const text = await res.text();
    if (!res.ok) {
      let message = `HTTP error! status: ${res.status}`;
      try {
        const data = JSON.parse(text);
        message = data.error || data.message || message;
      } catch {
        if (text && !/^\s*</.test(text)) message = text.slice(0, 300);
      }
      if (res.status === 404 && !/bandwidth|exceeded/i.test(message)) {
        const table = pathname.split('/api/')[1]?.split(/[/?]/)[0] || 'table';
        if (message === 'HTTP error! status: 404' || /^\s*</.test(text)) {
          message = `Table ${table} 不存在，請至「鋒兄設定」中初始化。`;
        }
      }
      throw new ApiError(message, res.status);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    baseUrl,
    request,
    async list(mod) {
      const data = await request(mod.endpoint);
      return unwrapList(mod, data);
    },
    async get(mod, id) {
      const items = await this.list(mod);
      const found = items.find((x) => itemId(x) === id);
      if (!found) throw new ApiError(`${mod.label} 找不到 ID ${id}`, 404);
      return found;
    },
    create(mod, data) {
      return request(mod.endpoint, { method: 'POST', body: data });
    },
    update(mod, id, data) {
      return request(`${mod.itemEndpoint || mod.endpoint}/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
    },
    remove(mod, id) {
      return request(`${mod.itemEndpoint || mod.endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export function unwrapList(mod, data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (mod?.unwrap && Array.isArray(data[mod.unwrap])) return data[mod.unwrap];
    for (const key of ['items', 'documents', 'rows', 'data']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}
