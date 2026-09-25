#!/usr/bin/env node
import { main } from '../src/cli.js';
import { c } from '../src/format.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (err) => {
    console.error(`${c.red('錯誤：')}${err?.message ?? err}`);
    if (process.env.FENGBRO_DEBUG) console.error(err);
    process.exitCode = 1;
  },
);
