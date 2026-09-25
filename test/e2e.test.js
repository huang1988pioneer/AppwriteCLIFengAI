// 端對端測試：以本機假後端模擬網頁版 /api/*，實際執行 bin/fengbro.js。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/fengbro.js', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fengbro-test-'));
const db = { subscription: [], food: [], routine: [] };
const log = [];
let server;
let baseUrl;
let seq = 0;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const [, , table, id] = url.pathname.split('/');
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : null });
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      if (!db[table]) return send(404, { error: `Table ${table} 不存在，請至「鋒兄設定」中初始化。` });
      const rows = db[table];
      if (req.method === 'GET') return send(200, rows);
      if (req.method === 'POST') {
        const doc = { ...JSON.parse(body), $id: `id${++seq}`, $createdAt: new Date().toISOString() };
        rows.push(doc);
        return send(201, doc);
      }
      const idx = rows.findIndex((r) => r.$id === id);
      if (idx < 0) return send(404, { error: 'Document not found' });
      if (req.method === 'PUT') {
        rows[idx] = { ...rows[idx], ...JSON.parse(body) };
        return send(200, rows[idx]);
      }
      if (req.method === 'DELETE') {
        rows.splice(idx, 1);
        return send(200, { success: true });
      }
      return send(405, { error: 'no' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, '--base-url', baseUrl, ...args],
      { env: { ...process.env, NO_COLOR: '1', FENGBRO_CONFIG: path.join(tmp, 'config.json'), ...env }, cwd: tmp },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }),
    );
  });
}

test('新增 → 列表 → 編輯 → 刪除', async () => {
  let r = await run(['sub', 'add', '--name', 'Netflix', '--price', '390', '--nextdate', '2026-10-15', '--continue']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /已新增 Netflix/);
  const post = log.findLast((x) => x.method === 'POST');
  assert.equal(post.path, '/api/subscription');
  assert.equal(post.body.price, 390);
  assert.equal(post.body.currency, 'TWD');
  assert.equal(post.body.continue, true);
  assert.equal(post.body.nextdate, '2026-10-15');

  r = await run(['sub', '--json']);
  assert.equal(JSON.parse(r.stdout).length, 1);

  r = await run(['sub', 'edit', 'Netflix', '--price', '420', 'note=家庭方案']);
  assert.equal(r.code, 0, r.stderr);
  const put = log.findLast((x) => x.method === 'PUT');
  assert.equal(put.path, `/api/subscription/${db.subscription[0].$id}`);
  assert.equal(put.body.price, 420);
  assert.equal(put.body.name, 'Netflix'); // 送出完整表單
  assert.equal(put.body.note, '家庭方案');
  assert.equal('$id' in put.body, false);

  r = await run(['sub', 'delete', 'Netflix']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /--yes/);
  assert.equal(db.subscription.length, 1);

  r = await run(['sub', 'rm', 'Netflix', '-y']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(db.subscription.length, 0);
});

test('例行 done：日期往後推', async () => {
  db.routine.push({ $id: 'r1', name: '理髮', note: '', lastdate1: '2026-09-15T00:00:00.000+00:00', lastdate2: '2026-05-18T00:00:00.000+00:00', lastdate3: null, link: null, photo: null });
  const r = await run(['routine', 'done', '理髮', '2026-09-25']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(db.routine[0].lastdate1, '2026-09-25');
  assert.equal(db.routine[0].lastdate2, '2026-09-15');
  assert.equal(db.routine[0].lastdate3, '2026-05-18');
});

test('CSV 匯出 → 匯入（相同名稱更新、其餘新增）', async () => {
  db.food.push({ $id: 'f1', name: '肉鬆', amount: 1, price: 0, shop: null, todate: '2027-03-10T00:00:00.000+00:00', photo: null, photohash: null });
  const file = path.join(tmp, 'food.csv');
  let r = await run(['food', 'export', '--out', file]);
  assert.equal(r.code, 0, r.stderr);
  const csv = fs.readFileSync(file, 'utf8');
  assert.match(csv, /肉鬆/);

  fs.writeFileSync(file, 'name,amount,todate\n肉鬆,3,2027-04-01\n鐵蛋,2,+30\n');
  r = await run(['food', 'import', file, '--dry-run']);
  assert.match(r.stdout, /新增 1 筆、更新 1 筆/);
  assert.equal(db.food.length, 1);

  r = await run(['food', 'import', file, '--yes']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.equal(db.food.length, 2);
  assert.equal(db.food.find((x) => x.name === '肉鬆').amount, 3);
  assert.equal(db.food.find((x) => x.name === '肉鬆').todate, '2027-04-01');
});

test('首頁 --json 與缺少的表', async () => {
  const r = await run(['home', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.cards.length, 8);
  assert.ok(data.errors.some((e) => e.includes('鋒兄銀行')));
});

test('設定：自訂 Appwrite 帳號會帶上 _endpoint 等參數，API Key 會遮罩', async () => {
  let r = await run(['config', 'add', 'work', '--yes']);
  assert.equal(r.code, 0, r.stderr);
  await run(['config', 'set', 'endpoint', 'https://aw.test/v1', '-p', 'work']);
  await run(['config', 'set', 'project', 'proj1', '-p', 'work']);
  await run(['config', 'set', 'database', 'db1', '-p', 'work']);
  await run(['config', 'set', 'key', 'sk_1234567890abcdef', '-p', 'work']);
  r = await run(['config', 'use', 'work']);
  assert.equal(r.code, 0, r.stderr);

  r = await run(['config']);
  assert.match(r.stdout, /work \(使用中\)/);
  assert.doesNotMatch(r.stdout, /sk_1234567890abcdef/);
  const mode = fs.statSync(path.join(tmp, 'config.json')).mode & 0o777;
  assert.equal(mode, 0o600);

  await run(['food']);
  const get = log.findLast((x) => x.method === 'GET');
  assert.deepEqual(get.query, { _endpoint: 'https://aw.test/v1', _project: 'proj1', _database: 'db1', _key: 'sk_1234567890abcdef' });

  r = await run(['config', 'use', 'default']);
  assert.equal(r.code, 0);
});

test('錯誤處理：未知指令、唯讀模組、未知欄位', async () => {
  let r = await run(['nope']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /未知指令/);
  r = await run(['price', 'add', '--name', 'x']);
  assert.match(r.stderr, /唯讀/);
  r = await run(['food', 'add', '--name', 'x', '--color', 'red']);
  assert.match(r.stderr, /沒有欄位「color」/);
});
