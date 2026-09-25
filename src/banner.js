// 最上方的橫幅：貓咪騎自行車。
// 大圖為像素圖（scripts/gen-banner.mjs 產生），用半格方塊「▀」顯示：每個字元上下兩個像素，
// 上像素用前景色、下像素用背景色（xterm 256 色），在任何等寬字型下都是實心方塊。
// 框線仿 STEPcode README 的 **** 標題區塊。

import { createRequire } from 'node:module';
import { ART_WIDTH, PALETTE, PIXELS } from './banner-art.js';
import { c } from './format.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
const REPO = 'github.com/huang1988pioneer/AppwriteCLIFengAI';

// 窄終端機或關閉顏色時用的小圖
const SMALL = [
  '         /\\_/\\',
  '        ( o.o )  ~',
  '         > ^ <\\___',
  '        /|   |    \\',
  '  ___  / |___|  ___\\',
  ' / _ \\/_______\\/ _ \\',
  '| (_) |       | (_) |',
  ' \\___/         \\___/',
];

const colorEnabled = () => !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

// 把像素列（每兩列一組）轉成半格方塊字串
export function renderPixels(rows, palette) {
  const fg = (ch) => `\x1b[38;5;${palette[ch]}m`;
  const bg = (ch) => `\x1b[48;5;${palette[ch]}m`;
  const lines = [];
  for (let y = 0; y < rows.length; y += 2) {
    const width = Math.max(rows[y].length, rows[y + 1]?.length ?? 0);
    let out = '';
    let open = false;
    for (let x = 0; x < width; x += 1) {
      const top = palette[rows[y][x]] !== undefined ? rows[y][x] : null;
      const bot = palette[rows[y + 1]?.[x]] !== undefined ? rows[y + 1][x] : null;
      if (!top && !bot) {
        out += open ? '\x1b[0m ' : ' ';
        open = false;
        continue;
      }
      if (top && bot) out += `${fg(top)}${bg(bot)}▀`;
      else if (top) out += `\x1b[49m${fg(top)}▀`;
      else out += `\x1b[49m${fg(bot)}▄`;
      open = true;
    }
    lines.push(out + (open ? '\x1b[0m' : ''));
  }
  return lines;
}

export function banner(columns = process.stdout.columns || 80) {
  if (columns < ART_WIDTH + 2 || !colorEnabled()) {
    return [...SMALL.map((line) => c.accent(line)), `   ${c.bold('貓咪騎自行車')}`, ''].join('\n');
  }
  const rule = c.gray('*'.repeat(ART_WIDTH));
  return [
    rule,
    `${c.bold('貓咪騎自行車')} ${c.gray('--')} fengbro v${VERSION}`,
    c.gray(REPO),
    rule,
    ...renderPixels(PIXELS, PALETTE),
    rule,
    '',
  ].join('\n');
}

// 只在終端機中顯示，避免影響 --json 或 pipe 給其他程式的輸出
export function printBanner(flags = {}) {
  if (process.stdout.isTTY && !flags.json && !flags.csv) console.log(banner());
}
