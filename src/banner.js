// 最上方的橫幅：貓咪騎自行車。
// 大圖為點字（braille）圖，由 scripts/gen-banner.mjs 產生；框線仿 STEPcode README 的 **** 標題區塊。

import { createRequire } from 'node:module';
import { ART, ART_WIDTH } from './banner-art.js';
import { c } from './format.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
const REPO = 'github.com/huang1988pioneer/AppwriteCLIFengAI';

// 各部位的顏色
const PALETTE = {
  cat: (s) => c.accent(s),
  tail: (s) => c.accent(s),
  scarf: (s) => c.red(s),
  bike: (s) => c.cyan(s),
  wheel: (s) => c.gray(s),
  motion: (s) => c.gray(s),
  '': (s) => s,
};

// 窄終端機用的小圖
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

export function banner(columns = process.stdout.columns || 80) {
  if (columns < ART_WIDTH + 2) {
    return [...SMALL.map((line) => c.accent(line)), `   ${c.bold('貓咪騎自行車')}`, ''].join('\n');
  }
  const rule = c.gray('*'.repeat(ART_WIDTH));
  const art = ART.map((row) => row.map(([layer, text]) => (PALETTE[layer] ?? PALETTE[''])(text)).join(''));
  return [
    rule,
    `${c.bold('貓咪騎自行車')} ${c.gray('--')} fengbro v${VERSION}`,
    c.gray(REPO),
    rule,
    ...art,
    rule,
    '',
  ].join('\n');
}

// 只在終端機中顯示，避免影響 --json 或 pipe 給其他程式的輸出
export function printBanner(flags = {}) {
  if (process.stdout.isTTY && !flags.json && !flags.csv) console.log(banner());
}
