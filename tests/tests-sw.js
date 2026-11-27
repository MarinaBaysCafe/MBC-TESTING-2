/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Offline check: every local script and stylesheet that a page loads must be in sw.js FILES, and the cache name must be a version string. Plain node. */
var fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), fails = 0, n = 0;
var list = sw.slice(sw.indexOf('var FILES'), sw.indexOf('];', sw.indexOf('var FILES')));
var files = {}; (list.match(/'\.\/[^']*'/g) || []).forEach(function (x) { files[x.slice(3, -1)] = 1; });
function ok(c, m) { n++; if (c) console.log('PASS ' + m); else { fails++; console.log('FAIL ' + m); } }
ok(/^var CACHE = 'mbc-v\d+';/m.test(sw), 'cache name is a version string (' + (/CACHE = '([^']*)'/.exec(sw) || [])[1] + ')');
var pages = fs.readdirSync(path.join(ROOT, 'apps')).map(function (d) { return path.join('apps', d, 'index.html'); }).filter(function (p) { return fs.existsSync(path.join(ROOT, p)); });
var missing = [], absent = [];
pages.forEach(function (p) {
  var h = fs.readFileSync(path.join(ROOT, p), 'utf8'), re = /<(?:script[^>]*\bsrc|link[^>]*\bhref)="([^"#?]+)"/g, m;
  while ((m = re.exec(h))) {
    if (/^(https?:)?\/\//.test(m[1])) continue;
    var rel = path.posix.normalize(path.posix.join(path.posix.dirname(p.split(path.sep).join('/')), m[1]));
    if (!fs.existsSync(path.join(ROOT, rel))) absent.push(p + ' -> ' + rel); else if (!files[rel] && !files[rel.replace(/index\.html$/, '')]) missing.push(p + ' -> ' + rel);
  }
});
ok(!absent.length, 'every file a page loads exists' + (absent.length ? ': ' + absent.join(', ') : ''));
ok(!missing.length, 'every file a page loads is in sw.js FILES' + (missing.length ? ': ' + Array.from(new Set(missing)).join(', ') : ''));
['shared/js/backup.js', 'shared/js/quota.js', 'shared/js/util.js', 'apps/pos/charge.js'].forEach(function (f) { ok(files[f], f + ' is cached'); });
console.log(fails ? fails + ' failed' : 'all ' + n + ' passed'); process.exit(fails ? 1 : 0);
