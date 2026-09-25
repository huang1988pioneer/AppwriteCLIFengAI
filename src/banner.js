// 最上方的橫幅：貓米騎自行車。

import { c } from './format.js';

const ART = [
  '         /\\_/\\',
  '        ( o.o )  ~',
  '         > ^ <\\___',
  '        /|   |    \\',
  '  ___  / |___|  ___\\',
  ' / _ \\/_______\\/ _ \\',
  '| (_) |       | (_) |',
  ' \\___/         \\___/',
];

export function banner() {
  return [...ART.map((line) => c.accent(line)), `   ${c.bold('貓米騎自行車')}`, ''].join('\n');
}

// 只在終端機中顯示，避免影響 --json 或 pipe 給其他程式的輸出
export function printBanner(flags = {}) {
  if (process.stdout.isTTY && !flags.json && !flags.csv) console.log(banner());
}
