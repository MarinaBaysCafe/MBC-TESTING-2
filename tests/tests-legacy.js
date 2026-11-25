/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Old page addresses (pos.html and so on) must still reach their new place: through the service worker and through 404.html. Run with:  node tests/tests-legacy.js */
var fs = require('fs'), path = require('path'), vm = require('vm'), ROOT = path.join(__dirname, '..');
function eq(a, b) { var x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error('expected ' + y + ' but got ' + x); }
var tests = [];
function test(n, f) { tests.push({ n: n, f: f }); }

function loadSw() {
  var handlers = {}, SCOPE = 'https://cafe.github.io/shop/';
  var sb = { self: { addEventListener: function (t, f) { handlers[t] = f; }, location: { origin: 'https://cafe.github.io' }, registration: { scope: SCOPE }, skipWaiting: function () {}, clients: { claim: function () {} } },
    URL: URL, Promise: Promise, caches: { match: function () { return Promise.resolve(undefined); }, open: function () { return Promise.resolve({ addAll: function () {}, put: function () {} }); }, keys: function () { return Promise.resolve([]); } },
    fetch: function () { return Promise.reject(new Error('offline')); }, Response: { redirect: function (u, s) { return { redirect: u, status: s }; }, error: function () { return { error: true }; } } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), sb);
  return function nav(url, mode) { var out = { handled: false, value: null }; handlers.fetch({ request: { method: 'GET', url: url, mode: mode || 'navigate' }, respondWith: function (v) { out.handled = true; out.value = v; }, waitUntil: function () {} }); return out; };
}
test('service worker sends an old page address to its new folder and keeps the query', async function () {
  var nav = loadSw(), r = nav('https://cafe.github.io/shop/pos.html'); eq(r.handled, true); eq((await r.value).redirect, 'https://cafe.github.io/shop/apps/pos/');
  eq((await nav('https://cafe.github.io/shop/shift.html?no=3').value).redirect, 'https://cafe.github.io/shop/apps/shift/?no=3');
  eq((await nav('https://cafe.github.io/shop/menu-public.html').value).redirect, 'https://cafe.github.io/shop/apps/public-menu/');
  eq((await nav('https://cafe.github.io/shop/expenses.html?date=2026-11-24').value).redirect, 'https://cafe.github.io/shop/apps/expenses/?date=2026-11-24');
});
test('service worker leaves new addresses alone and only redirects page visits', async function () {
  var nav = loadSw(); var a = nav('https://cafe.github.io/shop/apps/pos/'), b = nav('https://cafe.github.io/shop/pos.html', 'no-cors');
  if (a.handled) { var v = await a.value; if (v && v.redirect) throw new Error('redirected a new address'); }
  if (b.handled) { var w = await b.value; if (w && w.redirect) throw new Error('redirected a file request'); }
});
test('404.html sends old addresses to the new place and shows a way home for anything else', function () {
  var html = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8'), code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  function run(pathname, search) {
    var res = { to: null, home: null }, loc = { pathname: pathname, search: search || '', hash: '', replace: function (u) { res.to = u; } };
    var cb; vm.runInNewContext(code, { location: loc, Object: Object, document: { addEventListener: function (t, f) { cb = f; }, getElementById: function () { return { set href(v) { res.home = v; } }; } } });
    if (cb) cb(); return res;
  }
  eq(run('/shop/pos.html').to, 'apps/pos/'); eq(run('/shop/calendar.html', '?date=2026-11-01').to, 'apps/calendar/?date=2026-11-01');
  var other = run('/shop/nothing.html'); eq(other.to, null); eq(other.home, '/shop/apps/home/');
  eq(run('/shop/apps/xyz').home, '/shop/apps/home/');
});
test('every old page name has a new folder with a page in it', function () {
  var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), m = /var LEGACY = (\{[\s\S]*?\});/.exec(sw), L = JSON.parse(m[1]);
  Object.keys(L).forEach(function (k) { if (!fs.existsSync(path.join(ROOT, L[k], 'index.html'))) throw new Error(k + ' -> ' + L[k] + ' has no page'); });
  eq(Object.keys(L).length >= 19, true);
});
test('the root page and the installed app addresses still point somewhere real', function () {
  var idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'); if (idx.indexOf('apps/home/') < 0) throw new Error('root page does not lead home');
  ['home', 'expenses', 'money-counter'].forEach(function (a) { var m = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', a, 'manifest.webmanifest'), 'utf8')); if (!m.id || !m.start_url || !m.scope) throw new Error(a + ' manifest incomplete'); });
});
(async function () {
  var fail = 0;
  for (var i = 0; i < tests.length; i++) { try { await tests[i].f(); console.log('PASS ' + tests[i].n); } catch (e) { fail++; console.log('FAIL ' + tests[i].n + '\n     ' + e.message); } }
  console.log(fail ? fail + ' failed' : 'all ' + tests.length + ' passed'); process.exit(fail ? 1 : 0);
})();
