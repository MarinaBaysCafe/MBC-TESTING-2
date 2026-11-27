/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Opens every page in a simulated browser and checks that all its files load (no 404) and no script fails.
   Test tool only, needs jsdom. Run all tests with:  node tests/run.js  (after npm install). */
const { JSDOM, VirtualConsole } = require('jsdom'), http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
let missing = [];
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); let f = path.join(ROOT, u);
  if (u.endsWith('/') || (fs.existsSync(f) && fs.statSync(f).isDirectory())) f = path.join(f, 'index.html');
  fs.readFile(f, (e, b) => { if (e) { missing.push(u); res.statusCode = 404; res.end(); } else { res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.end(b); } });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async function () {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const BASE = 'http://127.0.0.1:' + server.address().port + '/';
  const pages = fs.readdirSync(path.join(ROOT, 'apps')).map(d => 'apps/' + d + '/').concat(['tests/', '']);
  let fail = 0;
  for (const p of pages) {
    missing = []; const errors = [], vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push(String(e.message).slice(0, 140))); vc.on('error', e => errors.push(String(e).slice(0, 140)));
    const dom = await JSDOM.fromURL(BASE + p, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) { w.print = () => {}; w.fetch = () => Promise.reject(new Error('no network in test')); w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} })); w.navigator.serviceWorker = undefined; } });
    await sleep(900);
    const body = dom.window.document.body ? dom.window.document.body.textContent.trim().length : 0;
    const bad = missing.filter(m => !/favicon/.test(m)).concat(errors.filter(e => !/Not implemented|navigation/.test(e)));
    if (bad.length || (!body && p !== '')) { fail++; console.log('FAIL ' + (p || '(root redirect)') + '  ' + bad.join(' | ')); } else console.log('PASS ' + (p || '(root redirect)'));
    dom.window.close();
  }
  console.log(fail ? fail + ' pages failed' : 'all ' + pages.length + ' pages load'); process.exit(fail ? 1 : 0);
})();
