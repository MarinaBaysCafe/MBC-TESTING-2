/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
/* Runs every tests/tests-*.js, one after another, and prints one summary. Test tool only, the apps do not need it.
     node tests/run.js            run all
     node tests/run.js merge      run only files whose name contains "merge"
     node tests/run.js --no-dom   run only the tests that need no jsdom
   The page tests need jsdom (a simulated browser):  npm install   (once, from the cafe folder), then  npm test.
   Exit code is 0 only when every test file ran and passed. A skipped file counts as a failure, so nothing is passed by accident. */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var args = process.argv.slice(2), noDom = args.indexOf('--no-dom') > -1, only = args.filter(function (a) { return a.indexOf('--') !== 0; })[0] || '';
var files = fs.readdirSync(__dirname).filter(function (f) { return /^tests-.*\.js$/.test(f) && f.indexOf(only) > -1; }).sort();
function needsDom(f) { return /require\(['"]jsdom['"]\)|jsdom-kit/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
var env = Object.assign({}, process.env), haveDom = true;
env.NODE_PATH = [path.join(__dirname, '..', 'node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(path.delimiter);
try { require.resolve('jsdom', { paths: env.NODE_PATH.split(path.delimiter).concat([__dirname]) }); } catch (e) { haveDom = false; }
var rows = [], bad = 0, skipped = 0, t0 = Date.now();
files.forEach(function (f) {
  var dom = needsDom(f);
  if (dom && noDom) { rows.push([f, 'skip', 'needs jsdom (--no-dom)']); skipped++; return; }
  if (dom && !haveDom) { rows.push([f, 'SKIPPED', 'needs jsdom: run "npm install" once']); bad++; return; }
  var t = Date.now(), r = cp.spawnSync(process.execPath, [path.join(__dirname, f)], { env: env, encoding: 'utf8', timeout: 240000, cwd: path.join(__dirname, '..') });
  var out = (r.stdout || '') + (r.stderr || ''), lines = out.split('\n').filter(Boolean), last = lines[lines.length - 1] || '';
  var failed = lines.filter(function (l) { return /^FAIL|^CRASH|^\s*\u2717|^FAIL:/.test(l); });
  var ok = r.status === 0 && !failed.length;
  if (!ok) { bad++; console.log('--- ' + f + ' (exit ' + r.status + ')\n' + (failed.length ? failed.slice(0, 12).join('\n') : lines.slice(-12).join('\n'))); }
  rows.push([f, ok ? 'ok' : 'FAILED', last.slice(0, 60) + '  ' + ((Date.now() - t) / 1000).toFixed(1) + 's']);
});
console.log('');
rows.forEach(function (r) { console.log((r[1] === 'ok' ? 'ok     ' : r[1] === 'skip' ? 'skip   ' : r[1] + ' ').slice(0, 8) + r[0] + '   ' + r[2]); });
console.log('\n' + (bad ? bad + ' of ' + rows.length + ' test files did not pass' : skipped ? (rows.length - skipped) + ' test files passed, ' + skipped + ' skipped (--no-dom), so this is NOT a full run' : 'all ' + rows.length + ' test files passed') + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
process.exit(bad ? 1 : 0);
