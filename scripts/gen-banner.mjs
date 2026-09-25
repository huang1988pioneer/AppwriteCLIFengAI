// 產生「貓咪騎自行車」點字（braille）圖：以向量圖形點陣化，每個字元 2×4 點。
// 用法：node scripts/gen-banner.mjs > src/banner-art.js

const W = 156;
const H = 100;

// 圖層（後畫的蓋過前面）：每層一張點陣，並記錄顏色
const LAYERS = ['motion', 'bike', 'wheel', 'tail', 'cat', 'scarf'];
const grid = Object.fromEntries(LAYERS.map((k) => [k, new Uint8Array(W * H)]));
const owner = new Int8Array(W * H).fill(-1); // 每點最上層的圖層

function set(layer, x, y, on = true) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (on) {
    grid[layer][i] = 1;
    owner[i] = LAYERS.indexOf(layer);
  } else {
    // 挖空：同一點的所有圖層都清掉（眼睛、條紋等細節）
    for (const k of LAYERS) grid[k][i] = 0;
    owner[i] = -2;
  }
}

function fillWhere(layer, test, on = true, box = [0, 0, W, H]) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x += 1) {
      if (test(x + 0.5, y + 0.5)) set(layer, x, y, on);
    }
  }
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const line = (layer, [ax, ay], [bx, by], w = 1.2, on = true) =>
  fillWhere(layer, (x, y) => distSeg(x, y, ax, ay, bx, by) <= w / 2, on, [Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w + 1, Math.max(ay, by) + w + 1]);

const ring = (layer, [cx, cy], r, w = 1.2, on = true) =>
  fillWhere(layer, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2, on, [cx - r - w, cy - r - w, cx + r + w + 1, cy + r + w + 1]);

const disk = (layer, [cx, cy], r, on = true) =>
  fillWhere(layer, (x, y) => Math.hypot(x - cx, y - cy) <= r, on, [cx - r - 1, cy - r - 1, cx + r + 2, cy + r + 2]);

function ellipse(layer, [cx, cy], rx, ry, deg = 0, on = true) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const m = Math.max(rx, ry) + 1;
  fillWhere(
    layer,
    (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
    },
    on,
    [cx - m, cy - m, cx + m + 1, cy + m + 1],
  );
}

function polygon(layer, pts, on = true) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  fillWhere(
    layer,
    (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    on,
    [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 2, Math.max(...ys) + 2],
  );
}

// 三次貝茲曲線，寬度可由 w0 漸變到 w1
function curve(layer, p0, p1, p2, p3, w0 = 2, w1 = w0, on = true) {
  const steps = 80;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0];
    const y = mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1];
    disk(layer, [x, y], (w0 + (w1 - w0) * t) / 2, on);
  }
}

// ── 自行車 ───────────────────────────────────────────────
const R = [34, 75]; // 後輪
const F = [118, 75]; // 前輪
const RW = 22;
const BB = [72, 77]; // 五通
const SEAT = [62, 44]; // 座管頂
const HEAD_T = [106, 44]; // 頭管上
const HEAD_B = [109, 54]; // 頭管下

for (const c of [R, F]) {
  ring('wheel', c, RW, 2.2); // 外胎
  ring('wheel', c, RW - 2.6, 0.9); // 輪框
  disk('wheel', c, 2.2); // 花鼓
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2 + (c === R ? 0.1 : 0.3);
    line('wheel', [c[0] + Math.cos(a) * 2, c[1] + Math.sin(a) * 2], [c[0] + Math.cos(a) * (RW - 3), c[1] + Math.sin(a) * (RW - 3)], 0.6);
  }
}
// 車架（菱形）
line('bike', SEAT, BB, 2.2); // 座管
line('bike', [SEAT[0] + 1, SEAT[1] + 2], [HEAD_T[0], HEAD_T[1] + 3], 2.2); // 上管
line('bike', BB, HEAD_B, 2.6); // 下管
line('bike', BB, R, 1.8); // 後下叉
line('bike', [SEAT[0] - 1, SEAT[1] + 3], R, 1.6); // 後上叉
line('bike', HEAD_T, HEAD_B, 3); // 頭管
curve('bike', HEAD_B, [111, 62], [115, 68], F, 1.8); // 前叉
// 龍頭與把手（彎把）
line('bike', HEAD_T, [104, 38], 1.8);
curve('bike', [104, 38], [110, 37], [117, 37], [118, 42], 1.8);
curve('bike', [118, 42], [119, 46], [116, 48], [114, 47], 1.6);
// 座墊與座桿
line('bike', SEAT, [60, 39], 1.6);
curve('bike', [50, 38], [56, 35], [64, 35], [69, 38], 2.8);
// 齒盤、曲柄、踏板、鏈條
ring('bike', BB, 6, 1.4);
disk('bike', BB, 2);
line('bike', BB, [79, 87], 1.8);
line('bike', [76, 88], [83, 88], 2); // 前踏板
line('bike', BB, [66, 68], 1.6);
line('bike', [63, 67], [69, 67], 1.6); // 後踏板
line('bike', [BB[0], BB[1] - 6], [R[0], R[1] - 3], 0.7); // 鏈條上
line('bike', [BB[0], BB[1] + 6], [R[0], R[1] + 3], 0.7); // 鏈條下
ring('bike', R, 3.5, 1);
// 擋泥板與車燈
curve('bike', [F[0] - 20, F[1] - 12], [F[0] - 12, F[1] - 26], [F[0] + 12, F[1] - 27], [F[0] + 22, F[1] - 12], 1);
ellipse('bike', [122, 50], 3, 2.2);
line('bike', [118, 50], [119, 50], 1);
for (const [dx, dy] of [[5, -3], [7, 0], [5, 3]]) line('motion', [127, 50 + dy * 0.5], [127 + dx, 50 + dy * 1.4], 0.7); // 燈光
// 置物籃
polygon('bike', [[118, 30], [132, 30], [130, 38], [120, 38]]);
polygon('bike', [[120, 31], [130, 31], [128.6, 37], [121.4, 37]], false);
for (let x = 121; x < 130; x += 2.5) line('bike', [x, 31], [x + 0.3, 37], 0.6);
line('bike', [118, 33.5], [132, 33.5], 0.6);
// 籃子裡的魚
ellipse('bike', [125, 27], 4.2, 2.2, -12);
polygon('bike', [[128.5, 26], [133, 22.5], [132.5, 28.5]]);
disk('bike', [123, 26.4], 0.8, false);

// ── 動態線與地面 ─────────────────────────────────────────
for (const [y, x0, x1] of [[52, 2, 14], [58, 0, 9], [64, 3, 11], [46, 6, 16]]) line('motion', [x0, y], [x1, y], 0.8);
for (let x = 0; x < W; x += 7) line('motion', [x, 98.5], [x + 4, 98.5], 0.8);
for (const [x, y] of [[8, 95], [14, 92], [20, 96], [5, 90]]) disk('motion', [x, y], 0.9); // 揚起的塵土

// ── 貓咪 ─────────────────────────────────────────────────
// 尾巴：從屁股往後翹起捲曲
curve('tail', [56, 40], [38, 44], [26, 32], [30, 20], 4.2, 3.2);
curve('tail', [30, 20], [32, 12], [42, 12], [41, 19], 3.2, 2.2);
// 身體（向前傾）
ellipse('cat', [74, 31], 18, 10.5, -14);
ellipse('cat', [60, 35], 9, 7.5); // 臀部
// 後腿：大腿 → 膝蓋往前彎 → 小腿 → 腳掌踩在前踏板
ellipse('cat', [68, 42], 9, 6.5, 35);
curve('cat', [70, 45], [76, 50], [82, 56], [84, 62], 6, 4.6);
curve('cat', [84, 62], [84, 70], [82, 78], [81, 84], 4.4, 3.4);
ellipse('cat', [82, 86], 3.8, 2.3);
curve('cat', [82, 56], [84.5, 59], [85.5, 62], [85, 65], 0.7, 0.7, false); // 膝蓋線
// 另一隻後腿（遠側，踩後踏板）
curve('cat', [62, 44], [60, 52], [63, 60], [66, 65], 3.4, 2.8);
ellipse('cat', [66.5, 65.5], 3, 1.8);
// 前腳：伸向把手，腳掌握住把手
curve('cat', [84, 30], [94, 34], [104, 38], [112, 39], 4.4, 3.6);
disk('cat', [114, 39.5], 2.7);
curve('cat', [86, 34], [95, 40], [104, 43], [115, 46], 3.4, 2.8);
disk('cat', [116, 46.5], 2.3);
// 頭
disk('cat', [96, 19], 12.5);
ellipse('cat', [101, 25], 8, 5.6); // 口鼻
ellipse('cat', [86, 24], 4, 3, 30); // 腮毛
polygon('cat', [[85, 16], [84.5, 1], [94.5, 9]]); // 左耳
polygon('cat', [[99, 8], [107, -1], [109, 14]]); // 右耳
polygon('cat', [[87, 12.5], [87.2, 5], [92, 9.5]], false); // 耳內
polygon('cat', [[101.5, 8.5], [106, 3.5], [107, 11.5]], false);
line('cat', [89, 8], [89.5, 11], 0.6); // 耳毛
line('cat', [104.5, 6.5], [104.5, 9.5], 0.6);
// 眼睛（挖空）、瞳孔與高光
ellipse('cat', [92.5, 18], 3, 3.6, 0, false);
ellipse('cat', [103, 18], 3, 3.6, 0, false);
ellipse('cat', [93.4, 18.8], 1.6, 2.4);
ellipse('cat', [103.9, 18.8], 1.6, 2.4);
disk('cat', [94.1, 17.6], 0.6, false);
disk('cat', [104.6, 17.6], 0.6, false);
curve('cat', [89, 13.5], [91, 12.5], [94, 12.5], [96, 14], 0.7, 0.7, false); // 眉
curve('cat', [100, 14], [102, 12.5], [105, 12.5], [107, 13.5], 0.7, 0.7, false);
// 鼻子、嘴巴
polygon('cat', [[99.8, 23.2], [104.6, 23.2], [102.2, 26]], false);
curve('cat', [102.2, 26], [102.2, 28.4], [99.8, 29.2], [98.2, 27.8], 0.8, 0.8, false);
curve('cat', [102.2, 26], [102.4, 28.4], [104.8, 29.2], [106.2, 27.8], 0.8, 0.8, false);
ellipse('cat', [102.6, 30.2], 1.4, 0.9, 0, false); // 小舌頭
// 臉頰紅暈（挖小點）
for (const [x, y] of [[95, 25], [96.5, 26], [95.5, 27]]) disk('cat', [x, y], 0.45, false); // 鬍鬚點
// 鬍鬚
for (const [a, b] of [[[109, 24], [124, 20]], [[109, 26], [125, 26]], [[109, 28], [123, 31.5]]]) line('cat', a, b, 0.6);
for (const [a, b] of [[[83, 22], [75, 19.5]], [[83, 25], [74, 25.5]]]) line('cat', a, b, 0.6);
// 虎斑條紋（挖空）
for (const [x, y, d] of [[70, 23, 70], [76, 22, 75], [82, 24, 78], [64, 27, 60], [58, 31, 50]]) ellipse('cat', [x, y], 4.2, 0.6, d, false);
for (const [x, y] of [[93, 8.5], [96.5, 8], [100, 8.5]]) line('cat', [x, y], [x, y + 3.2], 0.8, false); // 額頭
for (const [a, b] of [[[31, 34], [36, 31]], [[28, 26], [34, 25]], [[33, 17], [37, 20]]]) line('tail', a, b, 0.9, false);
// 前腳與身體的分界
curve('cat', [84, 31], [88, 33], [92, 35], [96, 36.5], 0.7, 0.7, false);

// ── 圍巾（隨風飄向後方）──────────────────────────────────
curve('scarf', [86, 27], [89, 31], [95, 32], [100, 31], 3.2);
curve('scarf', [86, 28], [76, 26], [66, 18], [52, 17], 3, 2.2);
curve('scarf', [86, 29], [76, 30], [68, 25], [56, 25], 2.6, 1.8);
for (const x of [60, 70]) line('scarf', [x, 15.5], [x + 1, 20], 0.8, false); // 圍巾條紋
for (const x of [64]) line('scarf', [x, 23], [x + 1, 27], 0.8, false);
for (const dy of [-2, 0, 2]) line('scarf', [52, 17 + dy * 0.6], [48.5, 17 + dy * 1.3], 0.6); // 流蘇
for (const dy of [-1.5, 0, 1.5]) line('scarf', [56, 25 + dy * 0.6], [52.5, 25 + dy * 1.3], 0.6);

// ── 轉成點字 ─────────────────────────────────────────────
const DOT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

const rows = [];
for (let cy = 0; cy < H; cy += 4) {
  const segs = [];
  for (let cx = 0; cx < W; cx += 2) {
    let bits = 0;
    const votes = {};
    for (let dy = 0; dy < 4; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (y >= H) continue;
        const i = y * W + x;
        if (owner[i] >= 0 && grid[LAYERS[owner[i]]][i]) {
          bits |= DOT[dy][dx];
          const k = LAYERS[owner[i]];
          votes[k] = (votes[k] || 0) + 1 + LAYERS.indexOf(k) * 0.01;
        }
      }
    }
    const color = bits ? Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] : '';
    // 空白格也用點字空白（U+2800），在各種字型下寬度才一致
    const ch = String.fromCodePoint(0x2800 + bits);
    const last = segs[segs.length - 1];
    if (last && (last[0] === color || !bits)) last[1] += ch;
    else segs.push([color, ch]);
  }
  // 去掉行尾空白
  const BLANK = /\u2800+$/;
  while (segs.length && /^\u2800*$/.test(segs[segs.length - 1][1])) segs.pop();
  if (segs.length) segs[segs.length - 1][1] = segs[segs.length - 1][1].replace(BLANK, '');
  rows.push(segs);
}
while (rows.length && !rows[0].length) rows.shift();
while (rows.length && !rows[rows.length - 1].length) rows.pop();

if (process.argv.includes('--ppm')) {
  // 除錯用：輸出放大 4 倍的彩色點陣圖（PPM）
  const S = 4;
  const RGB = { motion: [150, 150, 150], bike: [40, 140, 200], wheel: [70, 70, 70], tail: [230, 130, 80], cat: [240, 150, 90], scarf: [210, 50, 60] };
  const out = Buffer.alloc(W * S * H * S * 3, 255);
  for (let y = 0; y < H * S; y += 1) {
    for (let x = 0; x < W * S; x += 1) {
      const i = Math.floor(y / S) * W + Math.floor(x / S);
      if (owner[i] >= 0 && grid[LAYERS[owner[i]]][i]) out.set(RGB[LAYERS[owner[i]]], (y * W * S + x) * 3);
    }
  }
  process.stdout.write(Buffer.concat([Buffer.from(`P6 ${W * S} ${H * S} 255\n`), out]));
} else if (process.argv.includes('--preview')) {
  for (const r of rows) console.log(r.map((s) => s[1]).join(''));
} else {
  console.log('// 由 scripts/gen-banner.mjs 產生，請勿手動修改。');
  console.log('// 每列是 [圖層, 點字文字] 片段；圖層決定顏色。');
  console.log(`export const ART_WIDTH = ${W / 2};`);
  console.log(`export const ART = ${JSON.stringify(rows)};`);
}
