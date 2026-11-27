/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved.
   Makes a full storage impossible to miss. Any write that the browser refuses shows one clear red message on the page
   (the error is still thrown, so the app code behaves as before). Load it in the <head>, after security.js. */
(function () {
  if (typeof Storage === 'undefined' || !Storage.prototype || Storage.prototype.__mbQuota) return;
  var orig = Storage.prototype.setItem, shown = 0;
  function isQuota(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || ''))); }
  function show() {
    var now = Date.now(); if (now - shown < 20000) return; shown = now;
    function put() {
      if (!document.body) return;
      var old = document.getElementById('mb-quota'); if (old) old.remove();
      var d = document.createElement('div'); d.id = 'mb-quota'; d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99990;background:#b3261e;color:#fff;border-radius:10px;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)';
      d.innerHTML = '<b>This phone is out of storage. The last change was NOT saved.</b><div style="margin:4px 0 8px">Save a backup in Data, then free space (for example by clearing old shifts), before you take more orders.</div>' +
        '<a href="' + (location.pathname.replace(/apps\/[^/]*\/.*$/, '') || '/') + 'apps/data/" style="color:#fff;font-weight:700;margin-right:16px">Open Data</a><button type="button" style="background:none;border:1px solid #fff;color:#fff;border-radius:6px;padding:6px 12px;font:inherit">Close</button>';
      d.querySelector('button').onclick = function () { d.remove(); };
      document.body.appendChild(d);
    }
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  Storage.prototype.setItem = function (k, v) {
    try { return orig.call(this, k, v); } catch (e) { if (isQuota(e)) show(); throw e; }
  };
  Storage.prototype.__mbQuota = 1;
})();
