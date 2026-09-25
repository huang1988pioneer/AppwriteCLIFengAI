// 互動輸入工具（readline）。

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { c, pad, strWidth } from './format.js';

let rl = null;

function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
    rl.on('SIGINT', () => {
      output.write('\n');
      closePrompt();
      process.exit(130);
    });
  }
  return rl;
}

export function closePrompt() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

export function isInteractive() {
  return Boolean(input.isTTY && output.isTTY);
}

export async function ask(question, defaultValue) {
  const hint = defaultValue !== undefined && defaultValue !== '' ? c.gray(` [${defaultValue}]`) : '';
  const answer = await getRl().question(`${question}${hint}${c.gray('：')}`);
  return answer === '' && defaultValue !== undefined ? String(defaultValue) : answer;
}

export async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = (await getRl().question(`${question} ${c.gray(`(${hint})`)} `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return ['y', 'yes', '是', '好'].includes(answer);
}

export async function choose(title, options, { allowBack = true } = {}) {
  // options: [{ label, value, hint? }]
  console.log(`\n${c.bold(title)}`);
  const width = Math.max(...options.map((o) => strWidth(o.label)));
  options.forEach((o, i) => {
    const label = o.hint ? pad(o.label, width) : o.label;
    console.log(`  ${c.accent(String(i + 1).padStart(2))}  ${label}${o.hint ? c.gray(`  ${o.hint}`) : ''}`);
  });
  if (allowBack) console.log(`  ${c.accent(' 0')}  ${c.gray('返回')}`);
  for (;;) {
    const raw = (await ask('請選擇')).trim();
    if (allowBack && (raw === '0' || raw.toLowerCase() === 'q' || raw === '')) return null;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
    const byLabel = options.find((o) => o.label === raw || String(o.value) === raw);
    if (byLabel) return byLabel.value;
    console.log(c.yellow('  請輸入列表中的數字'));
  }
}
