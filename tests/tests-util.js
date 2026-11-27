/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* shared/js/util.js and the pages that use it (Expenses, Money-counter, Printers, Settings). Needs jsdom. */
var K = require('./jsdom-kit'), ok = K.ok;
(async function () {
  await K.start();
  var dom = await K.open('apps/settings/'), w = dom.window, U = w.MBUtil;
  ok(U.esc('<a href="x">&') === '&lt;a href=&quot;x&quot;&gt;&amp;' && U.esc(null) === '' && U.esc(undefined) === '' && U.esc(5) === '5', 'esc escapes markup and is null-safe');
  ok(U.peso(1234.5) === '₱1,234.50' && U.pesoShort(1234.5) === '₱1,235' && U.pesoShort(0) === '₱0', 'peso and pesoShort format like before');
  ok(U.$('methods') === w.document.getElementById('methods'), '$ finds by id');
  var t = w.document.createElement('div'); t.id = 'toast'; w.document.body.appendChild(t); U.toast('hi'); ok(t.textContent === 'hi' && t.classList.contains('on'), 'toast shows text');
  ok(!w.MBData || w.MBData.peso(1234.5) === U.peso(1234.5), 'util peso equals app-data peso');
  w.close();
  var pages = [['apps/expenses/', 'Expenses'], ['apps/money-counter/', 'Money'], ['apps/printers/', 'Printers']];
  for (var i = 0; i < pages.length; i++) {
    dom = await K.open(pages[i][0]); ok(dom.errors.length === 0 && !!dom.window.MBUtil, pages[i][1] + ' page loads with util.js, no script errors (' + dom.errors.join('|') + ')');
    dom.window.close();
  }
  K.done();
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
