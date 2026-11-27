/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Settings page in jsdom: edits save, reload shows them, reset and undo work, the activity log lists entries. Needs jsdom. */
var K = require('./jsdom-kit'), ok = K.ok;
function saved(w) { return JSON.parse(w.localStorage.getItem('marinabays_config_v1')); }
(async function () {
  await K.start();
  var dom = await K.open('apps/settings/'), w = dom.window, d = w.document, g;
  ok(dom.errors.length === 0, 'settings loads with no script errors (' + dom.errors.join('|') + ')');
  ok(d.querySelectorAll('#methods input').length === 2 && d.querySelector('#methods input').disabled, 'default methods listed, Cash is locked');
  // methods
  K.click(w, d.getElementById('addM')); var mi = d.querySelectorAll('#methods input'); ok(mi.length === 3, 'add method');
  K.type(w, mi[2], 'GCash'); ok(saved(w).methods[2].name === 'GCash', 'method name saved');
  // discounts
  K.click(w, d.getElementById('addD')); var dn = d.querySelectorAll('[data-k=dn]'), dp = d.querySelectorAll('[data-k=dp]');
  K.type(w, dn[dn.length - 1], 'Staff'); K.type(w, dp[dp.length - 1], '15'); g = saved(w);
  ok(g.discounts[g.discounts.length - 1].name === 'Staff' && g.discounts[g.discounts.length - 1].pct === 15, 'discount name and percent saved');
  K.type(w, dp[0], '150'); ok(saved(w).discounts[0].pct === 100, 'discount percent is capped at 100');
  // units
  K.click(w, d.getElementById('addU')); var ui = d.querySelectorAll('[data-k=u]'); K.type(w, ui[ui.length - 1], 'tray'); ok(saved(w).units.indexOf('tray') > -1, 'unit saved');
  // switches
  var sw = d.getElementById('auto'); sw.checked = false; K.change(w, sw); sw.dispatchEvent(new w.Event('input', { bubbles: true }));
  var vr = d.getElementById('vatReg'); vr.checked = true; vr.dispatchEvent(new w.Event('input', { bubbles: true }));
  var st = d.getElementById('dStack'); st.checked = true; st.dispatchEvent(new w.Event('input', { bubbles: true }));
  K.type(w, d.getElementById('dLimit'), '25'); g = saved(w);
  ok(g.autoPrint === false && g.vatRegistered === true && g.discRules.stack === true && g.discRules.limitPct === 25, 'switches and the manual-discount limit saved');
  // remove
  var before = saved(w).discounts.length; K.click(w, d.querySelector('[data-rm=d1]')); ok(saved(w).discounts.length === before - 1, 'remove a discount');
  // reload shows everything
  var snap = w.localStorage.getItem('marinabays_config_v1'); w.close();
  dom = await K.open('apps/settings/', { seed: { 'marinabays_config_v1': snap } }); w = dom.window; d = w.document; g = saved(w);
  ok(d.getElementById('auto').checked === false && d.getElementById('vatReg').checked && d.getElementById('dStack').checked && d.getElementById('dLimit').value === '25', 'after reload the switches show what was saved');
  ok(/GCash/.test(d.getElementById('methods').innerHTML) && /tray/.test(d.getElementById('units').innerHTML) && /Staff/.test(d.getElementById('discs').innerHTML), 'after reload method, unit and discount are listed');
  // reset and undo
  K.click(w, d.getElementById('reset')); g = saved(w);
  ok(g.methods.length === 2 && g.autoPrint === true && g.vatRegistered === false, 'reset goes back to defaults');
  K.click(w, d.getElementById('undo')); g = saved(w);
  ok(g.methods.length === 3 && g.vatRegistered === true && g.autoPrint === false, 'undo brings the old settings back');
  var asked = dom.asked.length; w.localStorage.removeItem('marinabays_config_v1_backup'); K.click(w, d.getElementById('undo'));
  ok(dom.asked.length === asked + 1 && /Nothing to undo/.test(dom.asked[dom.asked.length - 1]), 'undo with nothing to undo says so');
  // reset must not touch other data
  w.localStorage.setItem('marinabays_sales_v1', '{"sales":[1]}'); K.click(w, d.getElementById('reset'));
  ok(w.localStorage.getItem('marinabays_sales_v1') === '{"sales":[1]}', 'reset leaves sales alone');
  // names with markup are shown as text
  w.close(); dom = await K.open('apps/settings/', { seed: { 'marinabays_config_v1': { methods: [{ id: 'cash', name: 'Cash', cash: true }, { id: 'x', name: '"><img src=x onerror=window.__p=1>', cash: false }] } } });
  ok(!dom.window.__p && dom.window.document.querySelectorAll('#methods img').length === 0, 'a method name with markup stays text');
  // activity log
  w.close(); dom = await K.open('apps/settings/', { seed: { 'marinabays_audit_v1': [{ t: Date.now(), a: 'Refund', d: '#1-1 · ₱120', by: '<b>Ana</b>', pos: 'POS 1', why: 'wrong' }] } });
  ok(/Refund/.test(dom.window.document.getElementById('audit').textContent) && dom.window.document.querySelectorAll('#audit b').length === 1, 'activity log lists entries and escapes the cashier name');
  K.done();
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
