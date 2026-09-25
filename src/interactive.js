// 互動模式：對應網頁版的導覽列（鋒兄首頁／鋒兄管理／鋒兄工具／設定）。

import { dispatch, loadDashboard, loadSorted, printDashboard, printItem, printModuleTable, promptFields } from './cli.js';
import { printBanner } from './banner.js';
import { c } from './format.js';
import { GROUPS, MODULES, findModule, itemId, itemTitle } from './modules.js';
import { ask, choose, confirm } from './prompt.js';
import { buildCreatePayload, buildUpdatePayload, matchesSearch } from './records.js';

export async function runInteractive(ctx) {
  const base = { ...ctx, flags: { ...ctx.flags } };
  // 進入前清空畫面，游標回到左上角
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
  printBanner();
  console.log(`${c.accent('⌘')} ${c.bold('FENGBRO')} ${c.gray(`鋒兄AI Appwrite CLI · ${ctx.conn.profileName} · ${ctx.conn.baseUrl}`)}`);
  await guard(() => showHome(base));
  for (;;) {
    const choice = await choose(
      '主選單',
      [
        { label: GROUPS.home, value: 'home', hint: '今日待處理' },
        { label: GROUPS.manage, value: 'manage', hint: '訂閱、食品、額度、銀行…' },
        { label: GROUPS.tools, value: 'tools', hint: '金融、Tube、比價' },
        { label: '搜尋', value: 'search', hint: '跨模組關鍵字' },
        { label: GROUPS.settings, value: 'settings', hint: 'Appwrite 帳號切換、備份' },
        { label: '離開', value: 'quit' },
      ],
      { allowBack: false },
    );
    if (choice === 'quit') return 0;
    if (choice === 'home') await guard(() => showHome(base, true));
    if (choice === 'manage') await moduleMenu(base, 'manage');
    if (choice === 'tools') await toolsMenu(base);
    if (choice === 'search') {
      const q = (await ask('關鍵字')).trim();
      if (q) await guard(() => dispatch(base, 'search', [q]));
    }
    if (choice === 'settings') await settingsMenu(base);
  }
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    console.log(c.red(`錯誤：${err.message}`));
    return null;
  }
}

async function showHome(ctx, offerJump = false) {
  const { stats, errors } = await loadDashboard(ctx, false);
  console.log('');
  printDashboard(stats, errors, false);
  if (!offerJump) return;
  const pending = stats.cards.filter((card) => card.items.length);
  if (!pending.length) return;
  const target = await choose(
    '前往模組',
    pending.map((card) => ({ label: card.label, value: card.module, hint: `${card.items.length} 筆` })),
  );
  if (target) await moduleScreen(ctx, findModule(target));
}

async function moduleMenu(ctx, group) {
  for (;;) {
    const id = await choose(
      GROUPS[group],
      MODULES.filter((m) => m.group === group).map((m) => ({ label: m.label, value: m.id, hint: m.description })),
    );
    if (!id) return;
    await moduleScreen(ctx, findModule(id));
  }
}

async function toolsMenu(ctx) {
  for (;;) {
    const choice = await choose(GROUPS.tools, [
      { label: '鋒兄金融', value: 'finance', hint: '報價與提醒' },
      ...MODULES.filter((m) => m.group === 'tools').map((m) => ({ label: m.label, value: m.id, hint: m.description })),
    ]);
    if (!choice) return;
    if (choice === 'finance') await guard(() => dispatch(ctx, 'finance', []));
    else await moduleScreen(ctx, findModule(choice));
  }
}

async function settingsMenu(ctx) {
  for (;;) {
    const choice = await choose(GROUPS.settings, [
      { label: 'Appwrite 帳號', value: 'show', hint: '目前設定檔與連線資訊' },
      { label: '切換帳號', value: 'use' },
      { label: '新增帳號', value: 'add' },
      { label: '連線檢查', value: 'status' },
      { label: 'Storage 使用量', value: 'storage' },
      { label: '備份全部選單', value: 'backup', hint: 'CSV' },
    ]);
    if (!choice) return;
    if (choice === 'show') await guard(() => dispatch(ctx, 'config', ['show']));
    if (choice === 'status') await guard(() => dispatch(ctx, 'status', []));
    if (choice === 'storage') await guard(() => dispatch(ctx, 'storage', []));
    if (choice === 'backup') await guard(() => dispatch(ctx, 'export', ['all']));
    if (choice === 'add') {
      const name = (await ask('設定檔名稱')).trim();
      if (name) await guard(() => dispatch(ctx, 'config', ['add', name]));
    }
    if (choice === 'use') {
      const name = await choose(
        '選擇設定檔',
        Object.keys(ctx.cfg.profiles).map((n) => ({ label: n, value: n, hint: n === ctx.cfg.current ? '使用中' : '' })),
      );
      if (name) {
        await guard(() => dispatch(ctx, 'config', ['use', name]));
        console.log(c.gray('重新啟動 fengbro 後生效'));
      }
    }
  }
}

const MODULE_HELP = c.gray('輸入 序號 查看 · a 新增 · e 序號 編輯 · d 序號 刪除 · / 關鍵字 搜尋 · r 重新整理 · q 返回');

async function moduleScreen(ctx, mod) {
  let items = [];
  let search = '';
  const reload = async () => {
    items = await loadSorted(ctx, mod);
  };
  if ((await guard(reload)) === null && !items.length) return;
  for (;;) {
    const rows = items.map((item, i) => ({ item, index: i + 1 })).filter(({ item }) => matchesSearch(item, search));
    console.log('');
    printModuleTable(mod, rows);
    if (search) console.log(c.gray(`搜尋：「${search}」（輸入 / 清除）`));
    console.log(mod.readonly ? c.gray('輸入 序號 查看 · / 關鍵字 搜尋 · r 重新整理 · q 返回') : MODULE_HELP);
    const input = (await ask(mod.label.replace(/^鋒兄/, ''))).trim();
    if (input === '' ) continue;
    if (['q', '0', 'b'].includes(input.toLowerCase())) return;
    if (input.startsWith('/')) {
      search = input.slice(1).trim();
      continue;
    }
    if (input.toLowerCase() === 'r') {
      await guard(reload);
      continue;
    }
    const [cmd, arg] = input.split(/\s+/, 2);
    const pick = (ref) => {
      const n = Number(String(ref ?? '').replace('#', ''));
      const item = items[n - 1];
      if (!item) console.log(c.yellow('找不到這個序號'));
      return item;
    };
    if (/^#?\d+$/.test(cmd)) {
      const item = pick(cmd);
      if (item) {
        console.log('');
        printItem(mod, item, {});
        if (mod.id === 'routine' && (await confirm('記錄今天已執行？'))) {
          await guard(() => dispatch({ ...ctx, flags: {} }, 'routine', ['done', itemId(item)]));
          await guard(reload);
        } else await ask(c.gray('按 Enter 返回列表'));
      }
      continue;
    }
    if (mod.readonly) {
      console.log(c.yellow('此模組在 CLI 版為唯讀'));
      continue;
    }
    if (cmd.toLowerCase() === 'a') {
      await guard(async () => {
        const values = await promptFields(mod, {});
        const created = await ctx.client.create(mod, buildCreatePayload(mod, values));
        console.log(`${c.green('✓ 已新增')} ${itemTitle(mod, created ?? values)}`);
        await reload();
      });
      continue;
    }
    if (cmd.toLowerCase() === 'e') {
      const item = pick(arg);
      if (!item) continue;
      await guard(async () => {
        const changes = await promptFields(mod, item);
        if (!Object.keys(changes).length) {
          console.log(c.gray('沒有變更'));
          return;
        }
        await ctx.client.update(mod, itemId(item), buildUpdatePayload(mod, item, changes));
        console.log(`${c.green('✓ 已更新')} ${itemTitle(mod, item)}`);
        await reload();
      });
      continue;
    }
    if (cmd.toLowerCase() === 'd') {
      const item = pick(arg);
      if (!item) continue;
      if (await confirm(`刪除「${itemTitle(mod, item)}」？此動作無法復原`)) {
        await guard(async () => {
          await ctx.client.remove(mod, itemId(item));
          console.log(`${c.green('✓ 已刪除')} ${itemTitle(mod, item)}`);
          await reload();
        });
      }
      continue;
    }
    console.log(c.yellow('看不懂這個指令'));
  }
}
