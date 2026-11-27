/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Hostile values in saved data (for example from a bad backup file) must show as text and never run. Needs jsdom. */
var K = require('./jsdom-kit'), ok = K.ok;
var P = '"><img src=x onerror="window.__p=1"><b id=pwn>';
async function check(name, page, seed, extra) {
  var dom = await K.open(page, { seed: seed, wait: 600 }), w = dom.window, d = w.document;
  if (extra) await extra(w, d);
  await K.sleep(50);
  ok(!w.__p && !d.getElementById('pwn') && d.querySelectorAll('img[src="x"]').length === 0, name + ': hostile value is shown as text, nothing runs');
  w.close();
}
(async function () {
  await K.start(); var today = new Date().toISOString().slice(0, 10);
  await check('expenses id', 'apps/expenses/', { marinabays_expenses_v1: { days: (function () { var o = {}; o[today] = [{ id: P, cat: 'Food', amt: 5, t: 1, src: 'cash' }]; return o; })() } });
  await check('printers id and width', 'apps/printers/', { marinabays_printers_v2: { v: 3, printers: [{ id: P, name: 'P', type: 'dialog', width: P, copies: 1, kinds: [] }], receipt: {} } });
  await check('inventory qty', 'apps/inventory/', { marinabays_inventory_v1: { items: [{ id: 'a', name: 'Milk', unit: 'pcs', qty: P, group: 'Dairy', updated: '2026-11-01' }] } });
  await check('settings discount percent', 'apps/settings/', { marinabays_config_v1: { discounts: [{ id: 'd', name: 'X', pct: P }] } });
  await check('pos cart quantity', 'apps/pos/', { marinabays_cart_v1: [{ name: 'Latte', opt: '16 oz', price: 120, addons: [], note: '', qty: P, k: 'k1' }] }, async function (w, d) { w.MBShift.start(1, 'Ana'); var b = d.getElementById('openCart'); b.disabled = false; b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await K.sleep(50); });
  var SH = { nextNo: 3, cur: { id: 'c', no: P, openedAt: Date.now(), openedBy: P, startCash: 1, pos: 'POS 1' }, hist: [{ no: 1, id: 'h', openedAt: 1, closedAt: 2, openedBy: 'A', startCash: 1, expected: 1, actual: 1 }] };
  await check('home shift number and cashier', 'apps/home/', { marinabays_shifts_v1: SH });
  await check('shift page number and cashier', 'apps/shift/', { marinabays_shifts_v1: SH });
  K.done();
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
