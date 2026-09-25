// 產生「貓咪騎自行車」像素圖。
// 以向量圖形在 4×4 超取樣下點陣化成 W×H 像素，每個像素是一個調色盤字元；
// 終端機用半格方塊「▀」顯示（每字元上下兩個像素、各自上色）。
//
//   node scripts/gen-banner.mjs            產生 src/banner-art.js
//   node scripts/gen-banner.mjs --png FILE 另存放大的 PNG（README 用）
//   node scripts/gen-banner.mjs --preview  在終端機預覽

import fs from 'node:fs';
import zlib from 'node:zlib';

const W = 78;
const H = 47;
const OY = 5; // 整張圖往下移，耳朵才不會被切掉

// 調色盤：字元 → xterm 256 色
const PALETTE = {
  o: 52, // 輪廓（深棕紅）
  f: 215, // 毛（橘）
  s: 166, // 虎斑條紋（深橘）
  c: 223, // 奶油色（口鼻、胸口、腳掌）
  w: 231, // 白（眼睛高光）
  k: 16, // 黑（瞳孔）
  n: 211, // 粉紅（鼻子、耳內）
  r: 160, // 圍巾
  R: 124, // 圍巾暗部
  b: 33, // 車架
  B: 25, // 車架暗部
  d: 237, // 座墊、把手
  t: 238, // 輪胎
  m: 247, // 輪框
  p: 251, // 輪輻
  h: 244, // 花鼓、齒盤
  y: 179, // 置物籃
  Y: 94, // 籃子編織
  x: 117, // 魚
  l: 229, // 車燈
  g: 248, // 地面
  v: 252, // 速度線
};

const grid = Array.from({ length: H }, () => Array(W).fill('.'));

// 依覆蓋率上色：每像素 4×4 取樣，覆蓋率達門檻就塗上
function paint(color, inside, box = [0, 0, W, H], threshold = 0.45) {
  const [x0, y0, x1, y1] = box;
  for (let y = Math.max(0, Math.floor(y0 + OY)); y < Math.min(H, Math.ceil(y1 + OY)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x += 1) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy += 1) for (let sx = 0; sx < 4; sx += 1) if (inside(x + (sx + 0.5) / 4, y - OY + (sy + 0.5) / 4)) hit += 1;
      if (hit / 16 >= threshold) grid[y][x] = color;
    }
  }
}

const px = (color, x, y) => {
  y += OY;
  if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = color;
};

function distSeg(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

const box = (pts, pad) => [
  Math.min(...pts.map((p) => p[0])) - pad,
  Math.min(...pts.map((p) => p[1])) - pad,
  Math.max(...pts.map((p) => p[0])) + pad + 1,
  Math.max(...pts.map((p) => p[1])) + pad + 1,
];

const line = (color, a, b, w = 1) => paint(color, (x, y) => distSeg(x, y, a, b) <= w / 2, box([a, b], w), 0.4);
const disk = (color, [cx, cy], r) => paint(color, (x, y) => Math.hypot(x - cx, y - cy) <= r, box([[cx, cy]], r));
const ring = (color, [cx, cy], r, w = 1) =>
  paint(color, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2, box([[cx, cy]], r + w), 0.4);

function ellipse(color, [cx, cy], rx, ry, deg = 0) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  paint(
    color,
    (x, y) => {
      const u = (x - cx) * cos + (y - cy) * sin;
      const v = -(x - cx) * sin + (y - cy) * cos;
      return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
    },
    box([[cx, cy]], Math.max(rx, ry)),
  );
}

function polygon(color, pts) {
  paint(
    color,
    (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    box(pts, 0),
  );
}

// 三次貝茲曲線（粗細可漸變）
function curve(color, p0, p1, p2, p3, w0 = 2, w1 = w0) {
  const pts = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const m = 1 - t;
    pts.push([
      m ** 3 * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t ** 3 * p3[0],
      m ** 3 * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t ** 3 * p3[1],
      (w0 + (w1 - w0) * t) / 2,
    ]);
  }
  paint(color, (x, y) => pts.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r), box(pts, Math.max(w0, w1)));
}

// 在指定顏色的像素外圍描一圈輪廓
function outline(targets, color = 'o') {
  const isTarget = (x, y) => x >= 0 && y >= 0 && x < W && y < H && targets.includes(grid[y][x]);
  const marks = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (isTarget(x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isTarget(x + dx, y + dy))) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) grid[y][x] = color;
}

// ── 自行車 ───────────────────────────────────────────────
const RW = [15, 31]; // 後輪
const FW = [60, 31]; // 前輪
const R = 9.5;
const BB = [36, 32]; // 五通
const SEAT = [29, 20];
const HT = [52, 19];
const HB = [53.5, 24];

for (const w of [RW, FW]) {
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    line('p', w, [w[0] + Math.cos(a) * (R - 1.5), w[1] + Math.sin(a) * (R - 1.5)], 0.7);
  }
  ring('m', w, R - 1.6, 0.9);
  ring('t', w, R, 1.9);
  disk('h', w, 1.3);
}
// 車架
line('b', SEAT, BB, 1.5);
line('b', [29.5, 21], [52, 20.5], 1.5);
line('b', BB, HB, 1.7);
line('B', BB, RW, 1.2);
line('B', [29, 21.5], RW, 1.1);
line('b', HT, HB, 2);
line('b', HB, FW, 1.3);
// 齒盤、曲柄、踏板
ring('h', BB, 2.6, 1);
line('d', BB, [39, 37], 1.2);
line('d', [37.5, 37.5], [41.5, 37.5], 1.2);
// 座墊、龍頭、把手
line('d', [29, 20], [28.5, 18], 1);
curve('d', [24, 17.6], [27, 16.4], [31, 16.6], [33, 17.8], 1.8);
line('d', HT, [51, 15], 1.2);
curve('d', [51, 15], [54, 14.4], [57, 14.6], [58, 16.8], 1.3);
// 車燈
ellipse('l', [59.8, 20.2], 1.4, 1.1);
for (const [dx, dy] of [[3, -1.2], [3.6, 0], [3, 1.2]]) line('v', [62.4, 20.2 + dy * 0.4], [62.4 + dx, 20.2 + dy * 1.4], 0.7);
// 置物籃與魚
polygon('y', [[56, 9.5], [65, 9.5], [64, 14.5], [57, 14.5]]);
for (const x of [58, 60.3, 62.6]) line('Y', [x, 10], [x - 0.2, 14.4], 0.6);
line('Y', [56.3, 12], [64.7, 12], 0.6);
ellipse('x', [60.5, 8.2], 3, 1.5, -10);
polygon('x', [[63, 7.6], [65.6, 5.2], [65.4, 9.4]]);
px('k', 59, 8);

// ── 動態線與地面 ─────────────────────────────────────────
for (const [y, a, b] of [[17, 1, 7], [21, 0, 5], [25, 2, 6]]) line('v', [a, y], [b, y], 0.8);
for (let x = 0; x < W; x += 5) line('g', [x, 41.4], [x + 2.6, 41.4], 0.9);
for (const [x, y] of [[4, 38], [7, 36], [2, 35]]) px('g', x, y);

// ── 貓咪（Q 版大頭）──────────────────────────────────────
// 尾巴：從屁股往後上方翹起、尾端捲一圈
curve('f', [27, 17], [19, 18], [15, 12], [17, 6], 3.2, 2.6);
curve('f', [17, 6], [18, 2.5], [23, 2.5], [22.5, 6], 2.6, 2);
// 身體（前傾）、臀部
ellipse('f', [35, 14.5], 9, 5.6, -14);
ellipse('f', [28.8, 16], 4.6, 3.8);
// 遠側後腿（踩後方踏板）
curve('f', [30, 19], [30, 22], [31, 25], [32.5, 27], 2.4, 2);
ellipse('c', [33, 27.5], 1.6, 1);
// 近側後腿：大腿 → 膝蓋 → 小腿 → 腳掌踩在前踏板
ellipse('f', [33, 19.5], 4.2, 3.2, 30);
curve('f', [34, 21], [37, 23.5], [39.5, 26], [40, 29], 3.2, 2.6);
curve('f', [40, 29], [40.2, 31.5], [39.8, 34], [39.5, 35.5], 2.4, 2);
ellipse('c', [40, 36.2], 1.9, 1.1);
// 前腳：伸向把手
curve('f', [40, 14.5], [45, 16], [50, 16.5], [54.5, 16], 2.8, 2.4);
disk('c', [55.6, 16], 1.5);
// 頭
disk('f', [46, 9], 7.2);
ellipse('f', [40.6, 11.5], 2.2, 1.8, 20); // 腮毛
polygon('f', [[39, 6.5], [39.2, -3.6], [44.8, 2.6]]); // 左耳
polygon('f', [[47.6, 2.4], [53.4, -3.6], [53.4, 6.4]]); // 右耳
polygon('n', [[40.6, 4], [40.8, -0.8], [43.4, 2.6]]); // 耳內
polygon('n', [[49.2, 2.6], [52, -0.8], [52, 4.4]]);
// 胸口與口鼻（奶油色）
ellipse('c', [41.6, 15.2], 2.6, 2, -20);
ellipse('c', [47.6, 11.6], 3.4, 2.1);
// 虎斑條紋
for (const [x, y] of [[44, 3.4], [46, 3], [48, 3.4]]) line('s', [x, y], [x, y + 1.6], 0.9);
for (const [a, b] of [[[32, 10], [33.5, 12.5]], [[35.5, 9.4], [36.8, 12]], [[29, 12.4], [30.4, 14.8]]]) line('s', a, b, 1);
for (const [a, b] of [[[16, 9.5], [18.8, 10.5]], [[15.4, 13], [18.2, 13.6]], [[19.5, 4], [21.2, 5.6]]]) line('s', a, b, 1);
line('s', [38.5, 29], [41, 28.6], 0.9);
// 圍巾：繞在脖子上，尾端隨風飄向後方
curve('r', [38.8, 12.6], [41, 14.4], [45, 14.8], [48, 14], 2.2);
curve('r', [39.5, 13.2], [35, 11.5], [31, 8], [26, 8.5], 2.1, 1.7);
curve('R', [38.6, 13.8], [35, 14], [32, 12], [28.5, 12.6], 1.6, 1.3);

// 輪廓：貓、尾巴、圍巾外圍描深色邊
outline(['f', 's', 'c', 'n', 'r', 'R']);

// 眼睛（2×2 黑眼珠 + 白色高光）、鼻子、嘴巴、鬍鬚：畫在輪廓之後
for (const ex of [43, 48]) {
  px('k', ex, 8);
  px('k', ex + 1, 8);
  px('k', ex, 9);
  px('k', ex + 1, 9);
  px('w', ex, 8);
}
px('n', 46, 11);
px('n', 47, 11);
px('o', 46, 12);
px('o', 47, 12);
px('o', 45, 13);
px('o', 48, 13);
// 鬍鬚（逐點畫，左右各兩根）
for (const [x, y] of [[55, 10], [56, 10], [57, 9], [58, 9], [55, 12], [56, 12], [57, 13], [58, 13]]) px('o', x, y);
for (const [x, y] of [[36, 10], [35, 10], [34, 9], [36, 12], [35, 12], [34, 13]]) px('o', x, y);

// ── 輸出 ─────────────────────────────────────────────────
const rows = grid.map((r) => r.join('').replace(/\.+$/, ''));
while (rows.length && rows[rows.length - 1] === '') rows.pop();
while (rows.length && rows[0] === '') rows.shift();

function xtermRgb(n) {
  const base = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
  if (n < 16) return base[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return [v, v, v];
  }
  const i = n - 16;
  const lv = [0, 95, 135, 175, 215, 255];
  return [lv[Math.floor(i / 36)], lv[Math.floor(i / 6) % 6], lv[i % 6]];
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

// 透明背景 PNG，每個像素放大 scale 倍
function png(scale = 8) {
  const w = W * scale;
  const h = rows.length * scale;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = rows[Math.floor(y / scale)][Math.floor(x / scale)] ?? '.';
      if (!(ch in PALETTE)) continue;
      const o = y * stride + 1 + x * 4;
      raw.set([...xtermRgb(PALETTE[ch]), 255], o);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const args = process.argv.slice(2);
if (args[0] === '--png') {
  fs.writeFileSync(args[1], png(Number(args[2]) || 8));
} else if (args[0] === '--preview') {
  const { renderPixels } = await import('../src/banner.js');
  console.log(renderPixels(rows, PALETTE).join('\n'));
} else {
  const out = [
    '// 由 scripts/gen-banner.mjs 產生，請勿手動修改。',
    '// 每個字元是一個像素，對應 PALETTE 的 xterm 256 色；「.」為透明。',
    `export const ART_WIDTH = ${W};`,
    `export const PALETTE = ${JSON.stringify(PALETTE)};`,
    'export const PIXELS = [',
    ...rows.map((r) => `  ${JSON.stringify(r)},`),
    '];',
    '',
  ];
  fs.writeFileSync(new URL('../src/banner-art.js', import.meta.url), out.join('\n'));
}
