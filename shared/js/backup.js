/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved.
   Backup and restore of everything saved on this device (every marinabays_* key) in ONE json file.
   - save(): downloads the file and remembers when.   - check(text): looks at a file and says if it can be restored, before anything is changed.
   - restore(parsed): writes it; if a write fails halfway, the old data is put back.   - undoRestore(): puts back the data from before the last restore.
   Not part of a backup: the PIN (hashes in a file could be guessed offline), cloud sync memory (a stale copy confuses sync), and this file's own notes. */
(function () {
  var PREFIX = 'marinabays_', META = 'marinabays_backup_v1', UNDO = 'marinabays_restore_undo_v1';
  var SKIP = { 'marinabays_security_v1': 1, 'marinabays_sync_v1': 1, 'marinabays_sync_v2': 1, 'marinabays_cloud_on': 1, 'marinabays_gone_v1': 1,
               'marinabays_config_v1_backup': 1 };
  SKIP[META] = 1; SKIP[UNDO] = 1;
  var PLAIN = { 'marinabays_lastpay_v1': 1, 'marinabays_posname_v1': 1, 'marinabays_lastuser_v1': 1, 'marinabays_cust_v1': 1, 'marinabays_ordertype_v1': 1 };   // saved as plain text, not json
  // backups made before this file existed (version 1) used short names
  var LEGACY = { menu: 'marinabays_menu_v1', inventory: 'marinabays_inventory_v1', recipes: 'marinabays_recipes_v1', counter: 'marinabays_money_v1', expenses: 'marinabays_expenses_v1',
                 sales: 'marinabays_sales_v1', shifts: 'marinabays_shifts_v1', config: 'marinabays_config_v1', invlog: 'marinabays_invlog_v2' };
  // what the important keys must look like. A file that breaks one of these is refused as a whole.
  var SHAPE = {
    'marinabays_sales_v1': function (v) { return isObj(v) && isArr(v.sales) && v.sales.every(function (s) { return isObj(s) && typeof s.id === 'string' && typeof s.net === 'number' && isArr(s.lines); }); },
    'marinabays_shifts_v1': function (v) { return isObj(v) && isArr(v.hist) && v.hist.every(function (h) { return isObj(h) && typeof h.no === 'number'; }) && (v.cur === null || v.cur === undefined || isObj(v.cur)); },
    'marinabays_menu_v1': function (v) { return isObj(v) && isArr(v.categories) && isArr(v.items); },
    'marinabays_inventory_v1': function (v) { return isObj(v) && isArr(v.items); },
    'marinabays_recipes_v1': function (v) { return isObj(v) && isArr(v.recipes); },
    'marinabays_expenses_v1': function (v) { return isObj(v) && isObj(v.days); },
    'marinabays_money_v1': isObj, 'marinabays_config_v1': isObj
  };
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isArr(v) { return Array.isArray(v); }

  function keepKey(k) { return typeof k === 'string' && k.indexOf(PREFIX) === 0 && !SKIP[k]; }
  function ownKeys() { var out = [], i, k; for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (keepKey(k)) out.push(k); } return out.sort(); }
  function snapshot() { var m = {}; ownKeys().forEach(function (k) { m[k] = localStorage.getItem(k); }); return m; }
  function meta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } }

  /* ---------- save ---------- */
  function build() { return { app: 'marinabays', version: 2, savedAt: new Date().toISOString(), keys: snapshot() }; }
  function stamp() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function save(name) {
    var text = JSON.stringify(build());
    window.MBData.download(name || ('marina-bays-backup-' + (window.MBData.todayPH ? window.MBData.todayPH() : stamp()) + '.json'), text);
    try { localStorage.setItem(META, JSON.stringify({ t: Date.now(), size: text.length })); } catch (e) {}
    return text.length;
  }
  function lastAt() { var m = meta(); return m.t || 0; }
  // whole days since the last saved backup, or null if there never was one
  function daysSince() { var t = lastAt(); return t ? Math.floor((Date.now() - t) / 86400000) : null; }
  // is there anything worth backing up (so a new, empty phone is not nagged)
  function hasData() { try { var s = JSON.parse(localStorage.getItem('marinabays_sales_v1')); return !!(s && s.sales && s.sales.length); } catch (e) { return false; } }
  // null when fine, else a short sentence for the Home page
  function reminder(maxDays) {
    var d = daysSince(), lim = maxDays || 7;
    if (!hasData()) return null;
    if (d === null) return 'No backup has been saved yet.';
    return d >= lim ? 'The last backup was ' + d + ' days ago.' : null;
  }

  /* ---------- check a file (nothing is changed) ---------- */
  // returns { ok, error, map: {key: text}, legacy, savedAt, keys, sales }
  function check(text) {
    var b, map = {}, legacy = false, bad = null;
    try { b = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'The file is not readable (it is not JSON).' }; }
    if (!isObj(b) || b.app !== 'marinabays') return { ok: false, error: 'That file is not a Marina Bay\'s backup.' };
    if (isObj(b.keys)) {
      Object.keys(b.keys).forEach(function (k) {
        if (bad || SKIP[k]) return;
        if (!keepKey(k)) { bad = 'The file has a key that does not belong to this app (' + String(k).slice(0, 40) + ').'; return; }
        if (typeof b.keys[k] !== 'string') { bad = 'The file is damaged (' + k + ' is not text).'; return; }
        map[k] = b.keys[k];
      });
    } else if (isObj(b.data)) {
      legacy = true;
      Object.keys(b.data).forEach(function (n) { if (LEGACY[n] && b.data[n] != null) map[LEGACY[n]] = JSON.stringify(b.data[n]); });
    } else return { ok: false, error: 'The file has no data in it.' };
    if (bad) return { ok: false, error: bad };
    var keys = Object.keys(map); if (!keys.length) return { ok: false, error: 'The file has no data in it.' };
    keys.forEach(function (k) {
      if (bad || PLAIN[k]) return;
      var v; try { v = JSON.parse(map[k]); } catch (e) { bad = 'The file is damaged (' + k.replace(PREFIX, '') + ' cannot be read).'; return; }
      if (SHAPE[k] && !SHAPE[k](v)) bad = 'The file is damaged (' + k.replace(PREFIX, '').replace(/_v\d+$/, '') + ' does not look right). Nothing was changed.';
    });
    if (bad) return { ok: false, error: bad };
    var sales = 0; try { sales = JSON.parse(map['marinabays_sales_v1']).sales.length; } catch (e) {}
    return { ok: true, map: map, legacy: legacy, savedAt: b.savedAt || '', keys: keys.length, sales: sales };
  }

  /* ---------- restore (all or nothing) ---------- */
  // write 'next' over what is stored. replaceAll: keys that are stored but not in 'next' are removed. On any failure the old values go back.
  function apply(next, replaceAll) {
    var before = snapshot(), touched = [];
    try {
      Object.keys(next).forEach(function (k) { localStorage.setItem(k, next[k]); touched.push(k); });
      if (replaceAll) Object.keys(before).forEach(function (k) { if (!(k in next)) { localStorage.removeItem(k); touched.push(k); } });
      return { ok: true };
    } catch (e) {
      try { touched.forEach(function (k) { if (k in before) localStorage.setItem(k, before[k]); else localStorage.removeItem(k); }); } catch (e2) {}
      return { ok: false, error: 'Not enough room on this device. Nothing was changed.' };
    }
  }
  function hasUndo() { try { return !!localStorage.getItem(UNDO); } catch (e) { return false; } }
  function undoInfo() { try { var u = JSON.parse(localStorage.getItem(UNDO)); return u ? { t: u.t, legacy: !!u.replaceAll } : null; } catch (e) { return null; } }
  /* c = result of check(). Keeps a copy of the current data first. If that copy does not fit in storage,
     the copy is downloaded as a file instead (and the restore goes on only when that worked). Returns { ok, error, undo: 'stored'|'file' } */
  function restore(c) {
    if (!c || !c.ok) return { ok: false, error: (c && c.error) || 'Nothing to restore.' };
    var before = snapshot(), undo = 'stored', rec = { t: Date.now(), keys: before, replaceAll: !c.legacy };
    try { localStorage.setItem(UNDO, JSON.stringify(rec)); }
    catch (e) {
      try { window.MBData.download('marina-bays-before-restore-' + stamp() + '.json', JSON.stringify({ app: 'marinabays', version: 2, savedAt: new Date().toISOString(), keys: before })); undo = 'file'; }
      catch (e2) { return { ok: false, error: 'Could not keep a copy of the current data, so nothing was changed.' }; }
    }
    var r = apply(c.map, !c.legacy);
    if (!r.ok) { try { localStorage.removeItem(UNDO); } catch (e) {} return r; }
    try { localStorage.removeItem('marinabays_gone_v1'); } catch (e) {}
    return { ok: true, undo: undo };
  }
  // the safety copy is as big as the data, so it is not kept for ever
  function dropOldUndo(days) { var u = undoInfo(); if (u && Date.now() - u.t > (days || 7) * 86400000) { try { localStorage.removeItem(UNDO); } catch (e) {} return true; } return false; }
  function undoRestore() {
    var u; try { u = JSON.parse(localStorage.getItem(UNDO)); } catch (e) { u = null; }
    if (!u || !isObj(u.keys)) return { ok: false, error: 'There is nothing to undo.' };
    var r = apply(u.keys, true);
    if (r.ok) { try { localStorage.removeItem(UNDO); localStorage.removeItem('marinabays_gone_v1'); } catch (e) {} }
    return r;
  }
  window.MBBackup = { save: save, build: build, check: check, restore: restore, undoRestore: undoRestore, hasUndo: hasUndo, undoInfo: undoInfo, dropOldUndo: dropOldUndo,
    lastAt: lastAt, daysSince: daysSince, reminder: reminder, hasData: hasData, keys: ownKeys };
})();
