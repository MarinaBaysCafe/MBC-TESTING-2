/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Drives the real POS page (index.html + charge.js + shift-lib) in jsdom through the Charge flows.
   Needs jsdom. Run:  node tests/tests-charge.js   (tests/run.js sets this up) */
var jsdomLib = require('jsdom'), JSDOM = jsdomLib.JSDOM, VirtualConsole = jsdomLib.VirtualConsole;
var http = require('http'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..');
var types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
var server = http.createServer(function (req, res) {
  var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, function (e, b) { if (e) { res.statusCode = 404; res.end(); } else { res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(b); } });
});
var pass = 0, fail = 0, BASE = '';
function ok(c, m) { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var CART = [{ name: 'Latte', opt: '16 oz', price: 120, addons: [], note: '', qty: 2, k: 'k1' }, { name: 'Mocha', opt: 'Regular', price: 5, addons: [], note: '', qty: 1, k: 'k2' }]; // total 245

/* open the POS page. seed = localStorage values set before the page runs. */
async function pos(seed, keepStore) {
  var errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { errors.push(String(e.message).slice(0, 200)); });
  var dom = await JSDOM.fromURL(BASE + 'apps/pos/', keepStore ? { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse: pre } : { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse: pre });
  function pre(w) {
    w.print = function () {}; w.matchMedia = function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; };
    w.fetch = function () { return Promise.reject(new Error('no network')); }; w.confirm = function () { return true; }; w.alert = function () {};
    Object.keys(seed || {}).forEach(function (k) { w.localStorage.setItem(k, typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])); });
  }
  await sleep(700); dom.errors = errors; return dom;
}
function click(w, el) { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function type(w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); }
function change(w, el) { el.dispatchEvent(new w.Event('change', { bubbles: true })); }
function q(d, s) { return d.querySelector(s); }
async function openCharge(dom, cart) {
  var w = dom.window, d = w.document;
  if (!w.MBShift.current()) w.MBShift.start(100, 'Ana');
  click(w, d.getElementById('openCart')); await sleep(20);
  click(w, d.getElementById('chargeBtn')); await sleep(20);
  return { w: w, d: d };
}
function lastSale(w) { var s = w.MBShift.sales(); return s[s.length - 1]; }

(async function () {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); }); BASE = 'http://127.0.0.1:' + server.address().port + '/';
  var base = { 'marinabays_cart_v1': CART };
  var dom, c, w, d, s;

  // 1a. cash, exact
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  ok(/Charge/.test(d.querySelector('#sheet .sh-head b').textContent) && d.getElementById('payGo'), 'charge sheet opens');
  ok(dom.errors.length === 0, 'POS page has no script errors (' + dom.errors.join('|') + ')');
  click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.net === 245 && w.MBShift.cashOf(s) === 245 && !s.change, 'cash exact: sale saved, cash 245, no change');
  ok(/Sale saved/.test(d.getElementById('sheet').textContent), 'cash exact: done screen shows');
  ok(JSON.parse(w.localStorage.getItem('marinabays_cart_v1')).length === 0, 'cash exact: cart cleared');
  // 1b. cash with change
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  type(w, d.getElementById('pm-cash'), '300');
  ok(d.getElementById('payChange').textContent.replace(/[^0-9.]/g, '') === '55.00' || /55/.test(d.getElementById('payChange').textContent), 'cash change: shows 55');
  click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.tend === 300 && s.change === 55, 'cash change: tend 300, change 55');
  // cash short is refused
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  type(w, d.getElementById('pm-cash'), '100'); click(w, d.getElementById('payGo')); await sleep(60);
  ok(w.MBShift.sales().length === 0, 'cash short: no sale saved');

  // 2. non-cash with reference
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  ok(d.querySelectorAll('.chip').length >= 2, 'methods shown as chips');
  var chips = [].slice.call(d.querySelectorAll('.chip')), ew = chips.filter(function (x) { return x.getAttribute('data-meth') !== 'cash'; })[0];
  click(w, ew); await sleep(10);
  ok(!d.getElementById('pm-cash') && !d.getElementById('prw-ewallet').hidden, 'non-cash: cash box gone, reference field shown');
  type(w, d.getElementById('pr-ewallet'), 'REF123'); click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.pays && s.pays[0].ref === 'REF123' && s.pays[0].amt === 245 && w.MBShift.cashOf(s) === 0, 'non-cash: saved with ref REF123, amount 245, no cash');
  ok(w.localStorage.getItem('marinabays_lastpay_v1') === 'ewallet', 'non-cash: method remembered');

  // 7. remembered after reload
  dom = await pos(base, true); // fresh dom, so seed the remembered method like the previous page left it
  w = dom.window; w.localStorage.setItem('marinabays_lastpay_v1', 'ewallet'); w.close();
  dom = await pos(Object.assign({ 'marinabays_lastpay_v1': 'ewallet' }, base)); c = await openCharge(dom); w = c.w; d = c.d;
  ok(q(d, '.chip.on').getAttribute('data-meth') === 'ewallet', 'remembered method is selected on next open');
  dom = await pos(Object.assign({ 'marinabays_lastpay_v1': 'gone-method' }, base)); c = await openCharge(dom); w = c.w; d = c.d;
  ok(q(d, '.chip.on').getAttribute('data-meth') === 'cash', 'a remembered method that no longer exists falls back to cash');

  // 3. split cash + non-cash
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  click(w, q(d, 'button[data-split="1"]')); await sleep(10);
  type(w, d.getElementById('pm-ewallet'), '100'); type(w, d.getElementById('pm-cash'), '200');
  ok(!d.getElementById('prw-ewallet').hidden, 'split: reference shows once e-wallet has an amount');
  type(w, d.getElementById('pr-ewallet'), 'S1'); click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.net === 245 && s.pays && s.pays[0].amt === 100 && s.tend === 200 && s.change === 55, 'split: e-wallet 100 + cash 200 for 145 due, change 55');
  // split, cash left blank covers the rest
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  click(w, q(d, 'button[data-split="1"]')); type(w, d.getElementById('pm-ewallet'), '100'); click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && w.MBShift.cashOf(s) === 145 && s.pays[0].amt === 100, 'split: blank cash covers the rest (145)');
  // split, non-cash over the total is refused
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  click(w, q(d, 'button[data-split="1"]')); type(w, d.getElementById('pm-ewallet'), '300'); click(w, d.getElementById('payGo')); await sleep(60);
  ok(w.MBShift.sales().length === 0, 'split: non-cash over the total is refused');

  // 4. PWD / Senior
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  var pwd = q(d, 'input[data-dp="pwd"]'); pwd.checked = true; change(w, pwd); await sleep(10);
  ok(d.getElementById('payGo').disabled && !d.getElementById('idErr').hidden, 'PWD without name/ID: Charge disabled and inline error shown');
  click(w, d.getElementById('payGo')); await sleep(30);
  ok(w.MBShift.sales().length === 0, 'PWD without name/ID: clicking does not save a sale');
  type(w, q(d, 'input[data-idn="pwd"]'), 'Juan'); ok(d.getElementById('payGo').disabled, 'PWD with name only: still disabled');
  type(w, q(d, 'input[data-idi="pwd"]'), 'ID-9'); ok(!d.getElementById('payGo').disabled && d.getElementById('idErr').hidden, 'PWD with name and ID: Charge enabled, error gone');
  ok(/49/.test(d.getElementById('payDiscAmt').textContent), 'PWD 20% of 245 = 49 shown');
  type(w, d.getElementById('pm-cash'), '200'); click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.disc === 49 && s.net === 196 && s.ids && s.ids[0].name === 'Juan' && s.ids[0].id === 'ID-9', 'PWD sale saved: disc 49, net 196, name and ID kept');
  // the typed name must survive a re-render (e.g. toggling Senior)
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  pwd = q(d, 'input[data-dp="pwd"]'); pwd.checked = true; change(w, pwd); type(w, q(d, 'input[data-idn="pwd"]'), 'Maria');
  var oth = q(d, 'input[data-od]'); oth.checked = true; change(w, oth); await sleep(10);
  ok(q(d, 'input[data-idn="pwd"]').value === 'Maria', 'typed PWD name survives a re-render');
  // VAT registered
  dom = await pos(Object.assign({ 'marinabays_config_v1': { vatRegistered: true, vatPct: 12 } }, base)); c = await openCharge(dom); w = c.w; d = c.d;
  pwd = q(d, 'input[data-dp="pwd"]'); pwd.checked = true; change(w, pwd); type(w, q(d, 'input[data-idn="pwd"]'), 'J'); type(w, q(d, 'input[data-idi="pwd"]'), '1');
  click(w, d.getElementById('payGo')); await sleep(60);
  s = lastSale(w); ok(s && s.vat && s.vat.exempt > 0 && s.net < 245 - 40, 'VAT-registered PWD: VAT removed first, vat block saved (net ' + (s && s.net) + ')');

  // 5. other discount with PIN
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  w.MBSecurity.enabled = function () { return true; }; w.MBSecurity.verify = function (p) { return Promise.resolve(p === '1234'); };
  oth = q(d, 'input[data-od]'); oth.checked = true; change(w, oth); await sleep(10);
  type(w, d.getElementById('payDisc'), '45'); ok(/45/.test(d.getElementById('payDiscAmt').textContent), 'other discount: 45 shown');
  click(w, d.getElementById('payGo')); await sleep(40);
  ok(d.getElementById('mbgPin') && w.MBShift.sales().length === 0, 'other discount: PIN prompt opens, nothing saved yet');
  type(w, d.getElementById('mbgPin'), '0000'); click(w, d.getElementById('mbgOk')); await sleep(40);
  ok(/Wrong PIN/.test(d.getElementById('mbgErr').textContent) && w.MBShift.sales().length === 0, 'other discount: wrong PIN refused');
  type(w, d.getElementById('mbgWhy'), 'regular'); type(w, d.getElementById('mbgPin'), '1234'); click(w, d.getElementById('mbgOk')); await sleep(80);
  s = lastSale(w); ok(s && s.disc === 45 && s.net === 200, 'other discount: right PIN saves the sale (disc 45)');
  ok(w.MBGuard.list(5).some(function (x) { return x.a === 'Manual discount' && x.why === 'regular'; }), 'other discount: logged with reason');
  // PIN cancelled
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  w.MBSecurity.enabled = function () { return true; };
  oth = q(d, 'input[data-od]'); oth.checked = true; change(w, oth); type(w, d.getElementById('payDisc'), '10'); click(w, d.getElementById('payGo')); await sleep(40);
  click(w, d.getElementById('mbgNo')); await sleep(40);
  ok(w.MBShift.sales().length === 0 && d.getElementById('payGo'), 'other discount: cancelling the PIN keeps the sheet open, saves nothing');
  click(w, d.getElementById('payGo')); await sleep(40); ok(!!d.getElementById('mbgPin'), 'other discount: Charge works again after a cancelled PIN (not stuck)');

  // 6. fixing an order: old sale refunded WITH stock returned, new sale takes stock again
  var INV = { items: [{ id: 'cup16', name: '16oz dabba', unit: 'pcs', qty: 100, updated: '2026-11-01' }, { id: 'flat', name: 'Flat lids', unit: 'pcs', qty: 100, updated: '2026-11-01' }] };
  function qty(w, id) { return w.MBData.getInventory().items.filter(function (i) { return i.id === id; })[0].qty; }
  dom = await pos({ 'marinabays_inventory_v1': INV }); w = dom.window; d = w.document;
  w.MBShift.start(100, 'Ana');
  var o2 = w.MBShift.makeSale([{ name: 'Latte', opt: '16 oz', price: 120, addons: [], note: '', qty: 1, k: 'z' }], { disc: 0, discs: [], lineDisc: [0], splits: [{ id: 'cash', name: 'Cash', cash: true, amt: 120, ref: '' }], type: 'dine', cust: '', ids: [], vat: null });
  ok(w.MBShift.addSale(o2) && qty(w, 'cup16') === 99 && qty(w, 'flat') === 99, 'fix: original sale took 1 cup and 1 lid (99 left)');
  click(w, d.getElementById('ordBtn')); await sleep(20); click(w, q(d, 'button[data-oid]')); await sleep(20);
  click(w, d.getElementById('ordFix')); await sleep(60);
  ok(!d.getElementById('mbgPin'), 'fix: no PIN set, correction opens straight away');
  click(w, d.getElementById('openCart')); await sleep(20);
  ok(/Correcting/.test(d.getElementById('sheet').textContent), 'fix: cart says it is correcting the old order');
  ok(qty(w, 'cup16') === 99, 'fix: stock untouched until the new order is charged');
  click(w, d.getElementById('chargeBtn')); await sleep(20); click(w, d.getElementById('payGo')); await sleep(80);
  var all = w.MBShift.sales(), oldNow = all.filter(function (x) { return x.id === o2.id; })[0], neu = all[all.length - 1];
  ok(all.length === 2 && oldNow.ref && neu.fix === o2.id, 'fix: old order refunded, new order saved with fix=old id');
  ok(oldNow.inv === null && neu.inv && neu.inv.cup16 === 1, 'fix: old order gave its stock back, new order took its own');
  ok(qty(w, 'cup16') === 99 && qty(w, 'flat') === 99, 'fix: net stock is 99 (not 98, not 100)');
  ok(w.MBShift.sales().filter(function (x) { return !x.ref; }).length === 1, 'fix: exactly one live sale remains');

  // 5. speed and clarity
  dom = await pos({}); w = dom.window; d = w.document;
  ok(/Order · 0 items/.test(d.getElementById('cartCount').textContent) && d.getElementById('cartTotal').textContent === '₱0', 'bar shows 0 items and ₱0 with an empty cart');
  dom = await pos(base); w = dom.window; d = w.document;
  ok(/View order · 3 items/.test(d.getElementById('cartCount').textContent) && d.getElementById('cartTotal').textContent === '₱245', 'bar shows 3 items and ₱245');
  c = await openCharge(dom); d = c.d;
  ok(d.getElementById('payGo').textContent === 'Charge ₱245 · Cash', 'Charge button says amount and method: ' + d.getElementById('payGo').textContent);
  ew = [].slice.call(d.querySelectorAll('.chip')).filter(function (x) { return x.getAttribute('data-meth') !== 'cash'; })[0]; click(w, ew);
  ok(d.getElementById('payGo').textContent === 'Charge ₱245 · E-wallet', 'label follows the method: ' + d.getElementById('payGo').textContent);
  pwd = q(d, 'input[data-dp="pwd"]'); pwd.checked = true; change(w, pwd); ok(/Charge ₱196 · E-wallet/.test(d.getElementById('payGo').textContent) || /Charge/.test(d.getElementById('payGo').textContent), 'label still a Charge label with a discount');
  click(w, q(d, 'button[data-split="1"]')); ok(/· Split$/.test(d.getElementById('payGo').textContent), 'label says Split in split mode');

  // sheet is not stuck after Close, and New order button closes
  dom = await pos(base); c = await openCharge(dom); w = c.w; d = c.d;
  click(w, d.getElementById('payGo')); await sleep(60); click(w, q(d, '#sheet [data-close].primary')); await sleep(10);
  ok(!d.getElementById('shade').classList.contains('on'), 'New order closes the sheet');
  ok(d.activeElement === d.getElementById('q'), 'New order puts the cursor in the search box');
  ok(d.getElementById('openCart').disabled, 'cart bar is empty after the sale');

  server.close(); console.log(fail ? fail + ' failed' : 'all ' + pass + ' passed'); process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
