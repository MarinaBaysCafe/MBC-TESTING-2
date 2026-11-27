/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Small helper for the page tests: serves the app folder and opens a page in jsdom. Test tool only. */
var jsdomLib = require('jsdom'), http = require('http'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..'), BASE = '', server = null;
var types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
var kit = {
  pass: 0, fail: 0,
  ok: function (c, m) { if (c) { kit.pass++; console.log('PASS ' + m); } else { kit.fail++; console.log('FAIL ' + m); } },
  sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
  start: function () {
    server = http.createServer(function (req, res) {
      var f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      fs.readFile(f, function (e, b) { if (e) { res.statusCode = 404; res.end(); } else { res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(b); } });
    });
    return new Promise(function (r) { server.listen(0, '127.0.0.1', function () { BASE = 'http://127.0.0.1:' + server.address().port + '/'; r(); }); });
  },
  /* page: 'apps/settings/'. opts.seed = localStorage values set before the page runs; opts.confirm = answer for confirm() */
  open: async function (page, opts) {
    opts = opts || {}; var errors = [], vc = new jsdomLib.VirtualConsole(), asked = [];
    vc.on('jsdomError', function (e) { errors.push(String(e.message).slice(0, 200)); });
    var dom = await jsdomLib.JSDOM.fromURL(BASE + page, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse: function (w) {
      w.print = function () {}; w.matchMedia = function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; };
      w.fetch = function () { return Promise.reject(new Error('no network')); };
      w.confirm = function (m) { asked.push(m); return opts.confirm !== false; }; w.alert = function (m) { asked.push('ALERT ' + m); };
      w.URL.createObjectURL = function (b) { w.__blob = b; return 'blob:test'; }; w.URL.revokeObjectURL = function () {};
      w.HTMLAnchorElement.prototype.click = function () { w.__downloaded = this.getAttribute('download'); };
      if (opts.pre) opts.pre(w);
      Object.keys(opts.seed || {}).forEach(function (k) { w.localStorage.setItem(k, typeof opts.seed[k] === 'string' ? opts.seed[k] : JSON.stringify(opts.seed[k])); });
    } });
    await kit.sleep(opts.wait || 500); dom.errors = errors; dom.asked = asked; return dom;
  },
  click: function (w, el) { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); },
  type: function (w, el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); },
  change: function (w, el) { el.dispatchEvent(new w.Event('change', { bubbles: true })); },
  stop: function () { try { server.close(); } catch (e) {} },
  done: function () { kit.stop(); console.log(kit.fail ? kit.fail + ' failed' : 'all ' + kit.pass + ' passed'); process.exit(kit.fail ? 1 : 0); }
};
module.exports = kit;
