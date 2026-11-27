/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved.
   Small helpers that several pages had their own identical copy of. Load it in the <head> before the page script.
   (Pages keep their own copy where theirs behaves differently.) */
(function () {
  var timer;
  window.MBUtil = {
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); },
    peso: function (n) { return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    pesoShort: function (n) { return '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 }); },
    toast: function (msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(timer); timer = setTimeout(function () { t.classList.remove('on'); }, 1800); }
  };
})();
