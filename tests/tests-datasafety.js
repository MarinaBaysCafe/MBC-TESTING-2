/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Data page, Home banner, shift-close offer and the full-storage message, in jsdom on the real pages. Needs jsdom. */
var K = require('./jsdom-kit'), ok = K.ok;
var SALES = { sales: [{ id: 's1', net: 100, lines: [{ name: 'x', qty: 1 }], t: Date.now(), shift: 1 }] };
(async function () {
  await K.start();
  var dom, w, d;
  // ---- Home banner
  dom = await K.open('apps/home/', { seed: { marinabays_sales_v1: SALES } }); w = dom.window; d = w.document;
  ok(dom.errors.length === 0, 'home loads with no script errors (' + dom.errors.join('|') + ')');
  ok(!d.getElementById('bkBar').hidden && /No backup has been saved yet/.test(d.getElementById('bkBar').textContent) && d.querySelector('#bkBar a').getAttribute('href') === '../data/', 'home warns when sales exist and no backup was ever saved');
  dom = await K.open('apps/home/', { seed: { marinabays_sales_v1: SALES, marinabays_backup_v1: { t: Date.now() - 8 * 86400000 } } });
  ok(!dom.window.document.getElementById('bkBar').hidden && /8 days ago/.test(dom.window.document.getElementById('bkBar').textContent), 'home warns after 8 days');
  dom = await K.open('apps/home/', { seed: { marinabays_sales_v1: SALES, marinabays_backup_v1: { t: Date.now() - 2 * 86400000 } } });
  ok(dom.window.document.getElementById('bkBar').hidden, 'no warning after 2 days');
  dom = await K.open('apps/home/'); ok(dom.window.document.getElementById('bkBar').hidden, 'no warning on an empty phone');

  // ---- Data page: stats, backup, restore, undo
  dom = await K.open('apps/data/', { seed: { marinabays_sales_v1: SALES, marinabays_held_v1: [1] } }); w = dom.window; d = w.document;
  ok(dom.errors.length === 0, 'data loads with no script errors (' + dom.errors.join('|') + ')');
  ok(/Last backup file saved[\s\S]*Never/.test(d.getElementById('stats').textContent), 'data page shows "never" for the last backup');
  ok(/Storage used[\s\S]*%/.test(d.getElementById('stats').textContent), 'data page shows the storage used');
  K.click(w, d.getElementById('backup')); await K.sleep(50);
  ok(/^marina-bays-backup-\d{4}-\d\d-\d\d\.json$/.test(w.__downloaded || ''), 'backup downloads one json file (' + w.__downloaded + ')');
  var text = await w.__blob.text ? await w.__blob.text() : null;
  if (text === null) text = await new Promise(function (res) { var r = new w.FileReader(); r.onload = function () { res(r.result); }; r.readAsText(w.__blob); });
  var file = JSON.parse(text); ok(file.version === 2 && file.keys.marinabays_sales_v1 && file.keys.marinabays_held_v1 && !file.keys.marinabays_security_v1, 'the file holds all marinabays keys (held orders too) and no PIN');
  ok(/Last backup file saved[\s\S]*today/.test(d.getElementById('stats').textContent), 'last backup date shows "today" after saving');
  // restore a bad file: message, nothing changed
  function pick(w, d, content) {
    var inp = d.getElementById('file'); var f = new w.File([content], 'b.json', { type: 'application/json' });
    Object.defineProperty(inp, 'files', { value: [f], configurable: true }); inp.dispatchEvent(new w.Event('change'));
  }
  var salesBefore = w.localStorage.getItem('marinabays_sales_v1');
  pick(w, d, '{"app":"marinabays","keys":{"marinabays_sales_v1":"{\\"sales\\":[{\\"id\\":1}]}"}}'); await K.sleep(150);
  ok(!d.getElementById('restoreMsg').hidden && /damaged/.test(d.getElementById('restoreMsg').textContent) && w.localStorage.getItem('marinabays_sales_v1') === salesBefore, 'a damaged file shows a message and changes nothing');
  pick(w, d, 'hello'); await K.sleep(150); ok(/not readable/.test(d.getElementById('restoreMsg').textContent), 'a non-json file shows a message');
  // restore a good file: confirm box (not native confirm), restore, then undo
  w.localStorage.setItem('marinabays_sales_v1', JSON.stringify({ sales: [] }));
  pick(w, d, JSON.stringify(file)); await K.sleep(150);
  ok(/Restore this backup/.test(d.body.textContent) && dom.asked.length === 0, 'restore asks in the shared box before changing anything');
  ok(JSON.parse(w.localStorage.getItem('marinabays_sales_v1')).sales.length === 0, 'nothing is written before the person confirms');
  var okBtn = [].slice.call(d.querySelectorAll('.mdl button, .mdl-bg button, [class*=mdl] button')).filter(function (b) { return /^Restore$/.test(b.textContent.trim()); })[0];
  ok(!!okBtn, 'the confirm box has a Restore button'); if (okBtn) { K.click(w, okBtn); await K.sleep(120); }
  ok(JSON.parse(w.localStorage.getItem('marinabays_sales_v1')).sales.length === 1, 'restore wrote the sales back');
  ok(!!w.localStorage.getItem('marinabays_restore_undo_v1'), 'an undo copy was kept');
  w.close();
  // fresh page: the undo button shows when an undo copy exists
  dom = await K.open('apps/data/', { seed: { marinabays_sales_v1: SALES, marinabays_restore_undo_v1: { t: Date.now(), keys: { marinabays_sales_v1: JSON.stringify({ sales: [] }) }, replaceAll: true } } }); w = dom.window; d = w.document;
  ok(!d.getElementById('undoRestore').hidden, 'undo button shows after a restore');
  K.click(w, d.getElementById('undoRestore')); await K.sleep(100);
  okBtn = [].slice.call(d.querySelectorAll('button')).filter(function (b) { return /^Undo restore$/.test(b.textContent.trim()); })[0]; if (okBtn) { K.click(w, okBtn); await K.sleep(100); }
  ok(JSON.parse(w.localStorage.getItem('marinabays_sales_v1')).sales.length === 0 && !w.localStorage.getItem('marinabays_restore_undo_v1'), 'undo put the old data back and removed the copy');
  w.close();

  // ---- after a closed shift: one tap saves a backup file
  var CUR = { id: 'shift-a', no: 1, openedAt: Date.now() - 3600000, openedBy: 'Ana', startCash: 100, pos: 'POS 1' };
  dom = await K.open('apps/shift/', { seed: { marinabays_shifts_v1: { nextNo: 2, cur: CUR, hist: [] } } }); w = dom.window; d = w.document;
  ok(dom.errors.length === 0, 'shift page loads with no script errors (' + dom.errors.join('|') + ')');
  K.click(w, d.getElementById('endBtn')); await K.sleep(30); K.type(w, d.getElementById('enActual'), '100'); K.click(w, d.getElementById('enOnly')); await K.sleep(120);
  ok(w.MBShift.current() === null && w.MBShift.shifts().hist.length === 1, 'the shift was closed');
  var save = [].slice.call(d.querySelectorAll('button')).filter(function (b) { return /^Save backup$/.test(b.textContent.trim()); })[0];
  ok(!!save && /Shift 1 ended/.test(d.body.textContent), 'after closing, a one-tap "Save backup" offer shows');
  ok(!w.__downloaded, 'nothing is downloaded until the person taps it');
  if (save) { K.click(w, save); await K.sleep(80); }
  ok(/^marina-bays-backup-/.test(w.__downloaded || '') && w.MBBackup.daysSince() === 0, 'tapping it downloads the file and records the date');
  w.close();
  dom = await K.open('apps/shift/', { seed: { marinabays_shifts_v1: { nextNo: 2, cur: CUR, hist: [] } } }); w = dom.window; d = w.document;
  K.click(w, d.getElementById('endBtn')); await K.sleep(30); K.type(w, d.getElementById('enActual'), '100'); K.click(w, d.getElementById('enOnly')); await K.sleep(120);
  var no = [].slice.call(d.querySelectorAll('button')).filter(function (b) { return /^Cancel$/.test(b.textContent.trim()); })[0]; if (no) { K.click(w, no); await K.sleep(60); }
  ok(!w.__downloaded && w.MBShift.shifts().hist.length === 1, 'declining the offer downloads nothing and the shift stays closed');
  w.close();

  // ---- storage full: one clear message on a real page, the sale is not lost silently
  function fullOn(key) { return function (w) { var o = w.Storage.prototype.setItem; w.Storage.prototype.setItem = function (k, v) { if (k === key) { var e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, k, v); }; }; }
  dom = await K.open('apps/pos/', { seed: { marinabays_cart_v1: [{ name: 'Latte', opt: '16 oz', price: 120, addons: [], note: '', qty: 1, k: 'k1' }] }, pre: fullOn('marinabays_sales_v1') }); w = dom.window; d = w.document;
  ok(!d.getElementById('mb-quota'), 'no storage message while storage works');
  w.MBShift.start(100, 'Ana'); K.click(w, d.getElementById('openCart')); await K.sleep(20); K.click(w, d.getElementById('chargeBtn')); await K.sleep(20);
  K.click(w, d.getElementById('payGo')); await K.sleep(80);
  ok(!!d.getElementById('mb-quota') && /NOT saved/.test(d.getElementById('mb-quota').textContent), 'full storage shows a red message on the page');
  ok(/Could not save the sale/.test(d.getElementById('toast').textContent), 'and the sale screen says the sale was not saved');
  ok(w.MBShift.sales().length === 0 && /Charge/.test(d.querySelector('#sheet .sh-head b').textContent), 'no sale was recorded and the Charge sheet stays open');
  ok(d.querySelector('#mb-quota a').getAttribute('href').replace(/^.*\/apps\//, 'apps/') === 'apps/data/', 'the message links to the Data page');
  var n = d.querySelectorAll('#mb-quota').length; try { w.localStorage.setItem('marinabays_sales_v1', '1'); } catch (e) {}
  ok(d.querySelectorAll('#mb-quota').length === n, 'repeated failures do not stack messages');
  var threw = false; try { w.localStorage.setItem('marinabays_sales_v1', '1'); } catch (e) { threw = e.name === 'QuotaExceededError'; } ok(threw, 'the error is still thrown, so the app code behaves as before');
  w.close();
  K.done();
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
