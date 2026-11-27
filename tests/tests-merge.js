/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Stale-tab merge in app-data.js (mergeById, markGone, saveMenu, saveInventory). Runs the real file with a fake storage. node tests/tests-merge.js */
var fs = require('fs'), path = require('path');
var store = {}, failKey = null;
global.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { if (k === failKey) throw new Error('QuotaExceededError'); store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
global.sessionStorage = global.localStorage; global.window = global; global.navigator = {}; global.addEventListener = function () {};
global.document = { addEventListener: function () {}, getElementById: function () { return null; }, createElement: function () { return { style: {} }; }, body: {}, readyState: 'complete' };
/* "A tab" = a fresh copy of app-data.js that shares the same storage. */
function tab() {
  delete global.MBData; delete global.MB_DEFAULT_MENU; delete global.MB_DEFAULT_INVENTORY;
  ['menu-default.js', 'inventory-default.js', 'app-data.js'].forEach(function (f) { (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'shared', 'js', f), 'utf8')); });
  return global.MBData;
}
var tests = [], fails = 0;
function test(n, f) { tests.push({ n: n, f: f }); }
function eq(a, b, m) { a = JSON.stringify(a); b = JSON.stringify(b); if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }
function ids(l) { return l.map(function (x) { return x.id; }); }

test('mergeById adds what the other tab has, keeps order, never duplicates', function () {
  var D = tab(), mine = [{ id: 'a' }, { id: 'b' }];
  eq(D.mergeById(mine, [{ id: 'b' }, { id: 'c' }, { id: 'c' }, null, {}], {}), true); eq(ids(mine), ['a', 'b', 'c']);
  eq(D.mergeById(mine, [{ id: 'a' }, { id: 'c' }], {}), false, 'nothing new');
});
test('mergeById keeps this tab\'s own copy when both have the id (edit is last-write-wins)', function () {
  var D = tab(), mine = [{ id: 'a', n: 'mine' }]; D.mergeById(mine, [{ id: 'a', n: 'theirs' }], {}); eq(mine[0].n, 'mine');
});
test('mergeById skips ids in the skip list and survives bad input', function () {
  var D = tab(), mine = [{ id: 'a' }]; D.mergeById(mine, [{ id: 'x' }, { id: 'y' }], { x: 1 }); eq(ids(mine), ['a', 'y']);
  D.mergeById(mine, null, {}); D.mergeById(null, [{ id: 'q' }], {}); eq(ids(mine), ['a', 'y']);
});
test('menu: an item added in another tab is kept when this tab saves', function () {
  store = {}; var A = tab(); A.saveMenu(); var B = tab();
  B.getMenu().items.push({ id: 'new-b', cat: A.getMenu().categories[0].id, name: 'From B', options: [{ label: 'R', price: 10 }] }); B.saveMenu();
  A.getMenu().categories[0].note = 'edited in A'; A.saveMenu();
  var saved = JSON.parse(store.marinabays_menu_v1);
  eq(ids(saved.items).indexOf('new-b') > -1, true, 'B\'s item survived'); eq(saved.categories[0].note, 'edited in A');
});
test('menu: an item deleted in THIS tab is not brought back from the older copy in storage', function () {
  store = {}; var A = tab(); A.saveMenu(); var victim = A.getMenu().items[0].id;
  A.markGone(victim); A.getMenu().items = A.getMenu().items.filter(function (i) { return i.id !== victim; }); A.saveMenu();
  eq(ids(JSON.parse(store.marinabays_menu_v1).items).indexOf(victim), -1);
});
test('menu: deleting a whole section keeps its items out too', function () {
  store = {}; var A = tab(); A.saveMenu(); var m = A.getMenu(), c = m.categories[0].id, gone = m.items.filter(function (i) { return i.cat === c; });
  A.markGone(c); gone.forEach(function (i) { A.markGone(i.id); });
  m.categories = m.categories.filter(function (x) { return x.id !== c; }); m.items = m.items.filter(function (i) { return i.cat !== c; }); A.saveMenu();
  var s = JSON.parse(store.marinabays_menu_v1); eq(s.categories.some(function (x) { return x.id === c; }), false); eq(s.items.some(function (i) { return i.cat === c; }), false);
});
test('menu: a delete in one tab is NOT undone when another tab that still has the item saves later', function () {
  store = {}; var A = tab(); A.saveMenu(); var B = tab(), victim = A.getMenu().items[0].id;       // B opened while the item still existed
  A.markGone(victim); A.getMenu().items = A.getMenu().items.filter(function (i) { return i.id !== victim; }); A.saveMenu();
  B.getMenu().categories[0].note = 'edited in B'; B.saveMenu();                                    // B is stale and saves
  var s = JSON.parse(store.marinabays_menu_v1); eq(ids(s.items).indexOf(victim), -1, 'item came back'); eq(s.categories[0].note, 'edited in B');
});
test('inventory: a stale tab does not bring back an item another tab deleted, and keeps new ones', function () {
  store = {}; var A = tab(); A.saveInventory(); var B = tab(), victim = A.getInventory().items[0].id;
  A.markGone(victim); A.getInventory().items = A.getInventory().items.filter(function (i) { return i.id !== victim; }); A.saveInventory();
  var fresh = tab(); fresh.getInventory().items.push({ id: 'inv-new', name: 'New thing', unit: 'pcs', qty: 3, updated: '2026-01-01' }); fresh.saveInventory();
  B.getInventory().items[1].qty = 77; B.saveInventory();
  var s = JSON.parse(store.marinabays_inventory_v1); eq(ids(s.items).indexOf(victim), -1, 'deleted item came back'); eq(ids(s.items).indexOf('inv-new') > -1, true, 'new item lost');
});
test('a restored or reset menu may use the same ids again (old deletes do not hide them)', function () {
  store = {}; var A = tab(); A.saveMenu(); var victim = A.getMenu().items[0];
  A.markGone(victim.id); A.getMenu().items = A.getMenu().items.filter(function (i) { return i.id !== victim.id; }); A.saveMenu();
  A.resetMenu(); A.saveMenu(); eq(ids(JSON.parse(store.marinabays_menu_v1).items).indexOf(victim.id) > -1, true, 'reset menu');
  A.markGone(victim.id); A.setMenu({ categories: A.getMenu().categories, items: [victim], addonGroups: [] }); A.saveMenu(); eq(ids(JSON.parse(store.marinabays_menu_v1).items), [victim.id], 'setMenu');
});
test('a full storage returns false from saveMenu and saveInventory instead of throwing', function () {
  store = {}; var A = tab(); failKey = 'marinabays_menu_v1'; eq(A.saveMenu(), false); failKey = 'marinabays_inventory_v1'; eq(A.saveInventory(), false); failKey = null;
});
tests.forEach(function (t) { try { t.f(); console.log('PASS ' + t.n); } catch (e) { fails++; console.log('FAIL ' + t.n + '\n     ' + e.message); } });
console.log(fails ? fails + ' failed' : 'all ' + tests.length + ' passed'); process.exit(fails ? 1 : 0);
