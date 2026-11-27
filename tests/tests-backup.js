/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* backup.js: what goes in the file, how a file is checked, restore is all-or-nothing, undo. Runs the real file with a fake storage. node tests/tests-backup.js */
var fs = require('fs'), path = require('path');
var store = {}, failOn = null, downloads = [];
global.localStorage = { get length() { return Object.keys(store).length; }, key: function (i) { return Object.keys(store)[i] || null; },
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { if (failOn && failOn(k, String(v))) { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
  removeItem: function (k) { delete store[k]; } };
global.window = global; global.MBData = { download: function (n, t) { downloads.push({ n: n, t: t }); }, todayPH: function () { return '2026-11-26'; } };
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'shared', 'js', 'backup.js'), 'utf8'));
var B = global.MBBackup, tests = [], fails = 0;
function test(n, f) { tests.push({ n: n, f: f }); }
function eq(a, b, m) { a = JSON.stringify(a); b = JSON.stringify(b); if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }
var SALE = { id: 's1', net: 100, lines: [{ name: 'x', qty: 1 }], t: 1 };
function seed() {
  store = { marinabays_sales_v1: JSON.stringify({ sales: [SALE] }), marinabays_shifts_v1: JSON.stringify({ nextNo: 2, cur: null, hist: [{ no: 1 }] }),
    marinabays_menu_v1: JSON.stringify({ categories: [], items: [] }), marinabays_held_v1: '[1]', marinabays_lastpay_v1: 'ewallet', marinabays_audit_v1: '[]',
    marinabays_security_v1: '{"pin":{"hash":"SECRET"}}', marinabays_sync_v2: '{"x":1}', marinabays_cloud_on: '1', other_app_key: 'x' };
  failOn = null; downloads = [];
}

test('a backup holds every marinabays_ key, and leaves out the PIN, sync memory and other apps', function () {
  seed(); var k = Object.keys(B.build().keys); eq(k.indexOf('marinabays_held_v1') > -1 && k.indexOf('marinabays_audit_v1') > -1 && k.indexOf('marinabays_lastpay_v1') > -1, true, 'kept');
  eq(k.indexOf('marinabays_security_v1'), -1, 'PIN'); eq(k.indexOf('marinabays_sync_v2'), -1, 'sync'); eq(k.indexOf('marinabays_cloud_on'), -1); eq(k.indexOf('other_app_key'), -1);
  eq(JSON.stringify(B.build()).indexOf('SECRET'), -1, 'no PIN hash anywhere in the file');
});
test('save downloads one json file, remembers the time, and reminds after 7 days', function () {
  seed(); eq(B.reminder(7), 'No backup has been saved yet.'); B.save(); eq(downloads.length, 1); eq(/^marina-bays-backup-2026-11-26\.json$/.test(downloads[0].n), true);
  eq(B.daysSince(), 0); eq(B.reminder(7), null);
  store.marinabays_backup_v1 = JSON.stringify({ t: Date.now() - 8 * 86400000 }); eq(/8 days ago/.test(B.reminder(7)), true); eq(B.daysSince(), 8);
  store.marinabays_backup_v1 = JSON.stringify({ t: Date.now() - 6 * 86400000 }); eq(B.reminder(7), null);
  seed(); delete store.marinabays_sales_v1; eq(B.reminder(7), null, 'a new empty phone is not nagged');
});
test('a saved file checks out and counts what is in it', function () {
  seed(); B.save(); var c = B.check(downloads[0].t); eq(c.ok, true); eq(c.sales, 1); eq(c.keys >= 5, true);
});
test('files that are not backups are refused, and nothing is touched', function () {
  seed(); var before = JSON.stringify(store);
  ['', 'not json', '[]', 'null', '{"app":"other","keys":{}}', '{"app":"marinabays"}', '{"app":"marinabays","keys":{}}',
   JSON.stringify({ app: 'marinabays', keys: { other_app_key: '1' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_sales_v1: 5 } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_sales_v1: '{bad' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_sales_v1: '{"sales":"x"}' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_sales_v1: '{"sales":[{"id":"a"}]}' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_shifts_v1: '{"hist":[{"no":"1"}]}' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_menu_v1: '{"categories":{}}' } }),
   JSON.stringify({ app: 'marinabays', keys: { marinabays_expenses_v1: '[]' } })
  ].forEach(function (t, i) { var c = B.check(t); if (c.ok) throw new Error('case ' + i + ' was accepted: ' + t.slice(0, 60)); if (!c.error) throw new Error('no message for case ' + i); });
  eq(JSON.stringify(store), before);
});
test('a file may not carry a PIN into this device', function () {
  seed(); var c = B.check(JSON.stringify({ app: 'marinabays', keys: { marinabays_security_v1: '{"pin":{"hash":"EVIL"}}', marinabays_menu_v1: '{"categories":[],"items":[]}' } }));
  eq(c.ok, true); eq(Object.keys(c.map), ['marinabays_menu_v1']); B.restore(c); eq(/SECRET/.test(store.marinabays_security_v1), true, 'own PIN kept');
});
test('restore replaces everything, keeps the PIN, and the undo copy brings it all back', function () {
  seed(); B.save(); var c = B.check(downloads[0].t);
  store.marinabays_sales_v1 = JSON.stringify({ sales: [SALE, { id: 's2', net: 5, lines: [] }] }); store.marinabays_extra_v1 = '"new thing"';
  var r = B.restore(c); eq(r.ok, true); eq(r.undo, 'stored');
  eq(JSON.parse(store.marinabays_sales_v1).sales.length, 1, 'sales replaced'); eq('marinabays_extra_v1' in store, false, 'key not in the backup is removed'); eq(/SECRET/.test(store.marinabays_security_v1), true);
  eq(B.hasUndo(), true); var u = B.undoRestore(); eq(u.ok, true);
  eq(JSON.parse(store.marinabays_sales_v1).sales.length, 2, 'undo: 2 sales again'); eq(store.marinabays_extra_v1, '"new thing"'); eq(B.hasUndo(), false);
  eq(B.undoRestore().ok, false, 'a second undo says nothing to undo');
});
test('a backup made by the older app (short names) still restores, and only touches what it lists', function () {
  seed(); var old = JSON.stringify({ app: 'marinabays', version: 1, savedAt: '2025-01-01', data: { sales: { sales: [SALE, SALE2()] }, menu: null, counter: { a: 1 } } });
  function SALE2() { return { id: 's9', net: 1, lines: [] }; }
  var c = B.check(old); eq(c.ok, true); eq(c.legacy, true); var r = B.restore(c); eq(r.ok, true);
  eq(JSON.parse(store.marinabays_sales_v1).sales.length, 2); eq(store.marinabays_held_v1, '[1]', 'held orders untouched'); eq(JSON.parse(store.marinabays_money_v1).a, 1);
  B.undoRestore(); eq(JSON.parse(store.marinabays_sales_v1).sales.length, 1); eq('marinabays_money_v1' in store, false, 'undo removes what the restore added');
});
test('storage full during a restore: everything goes back as it was', function () {
  seed(); B.save(); var c = B.check(downloads[0].t); store.marinabays_sales_v1 = JSON.stringify({ sales: [SALE, { id: 's2', net: 5, lines: [] }] });
  var before = JSON.stringify(store), n = 0; failOn = function (k) { return k !== 'marinabays_restore_undo_v1' && ++n > 2; };
  var r = B.restore(c); failOn = null; eq(r.ok, false); eq(/Not enough room/.test(r.error), true); eq(JSON.stringify(store), before, 'every key exactly as before');
  eq(B.hasUndo(), false, 'no stale undo copy');
});
test('no room for the undo copy: the old data is downloaded as a file first, then the restore goes on', function () {
  seed(); B.save(); var c = B.check(downloads[0].t); downloads = []; failOn = function (k) { return k === 'marinabays_restore_undo_v1'; };
  var r = B.restore(c); failOn = null; eq(r.ok, true); eq(r.undo, 'file'); eq(downloads.length, 1); eq(/before-restore/.test(downloads[0].n), true); eq(B.check(downloads[0].t).ok, true, 'that file can be restored');
});
test('a restore that cannot keep any copy at all changes nothing', function () {
  seed(); B.save(); var c = B.check(downloads[0].t); store.marinabays_extra_v1 = '1'; failOn = function (k) { return k === 'marinabays_restore_undo_v1'; };
  global.MBData.download = function () { throw new Error('blocked'); }; var r = B.restore(c); failOn = null; global.MBData.download = function (n, t) { downloads.push({ n: n, t: t }); };
  eq(r.ok, false); eq(store.marinabays_extra_v1, '1');
});
test('an old undo copy is dropped after 7 days', function () {
  seed(); store.marinabays_restore_undo_v1 = JSON.stringify({ t: Date.now() - 8 * 86400000, keys: {} }); eq(B.dropOldUndo(7), true); eq(B.hasUndo(), false);
  store.marinabays_restore_undo_v1 = JSON.stringify({ t: Date.now() - 86400000, keys: {} }); eq(B.dropOldUndo(7), false); eq(B.hasUndo(), true);
});
tests.forEach(function (t) { try { t.f(); console.log('PASS ' + t.n); } catch (e) { fails++; console.log('FAIL ' + t.n + '\n     ' + e.message); } });
console.log(fails ? fails + ' failed' : 'all ' + tests.length + ' passed'); process.exit(fails ? 1 : 0);
