/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved.
   The Charge sheet of the point of sale: discounts, how it is paid, and saving the sale.
   index.html calls MBCharge.init(ctx) once; ctx gives this file the order and the sheet. */
(function () {
  window.MBCharge = { init: init };
  function init(ctx) {
    var D = window.MBData, esc = D.esc, S = window.MBShift, MM = window.MBMoney, $ = ctx.$, money = ctx.money, CFG = ctx.CFG;
    var PAY_KEY = 'marinabays_lastpay_v1';
    var pay = null, lastSale = null, charging = false;
    function lastMethod() { try { return localStorage.getItem(PAY_KEY) || 'cash'; } catch (e) { return 'cash'; } }
    function rememberMethod(id) { try { localStorage.setItem(PAY_KEY, id); } catch (e) {} }
    function isIdDisc(id) { return id === 'pwd' || id === 'senior'; }
    /* VAT-registered: PWD and Senior come off the VAT-free price (MBMoney.exemptDiscount), one per item (they never stack).
       Returns the other presets, the discount and the VAT taken off (centavos), what is due on the exempt items, and the records to save. */
    function vatExempt(cfg, presets) {
      var cart = ctx.cart(), out = { presets: presets, discC: 0, vatC: 0, dueC: 0, recs: [] };
      if (!cfg.vatRegistered) return out;
      var rate = Number(cfg.vatPct) || 12, seen = {};
      out.presets = [];
      presets.forEach(function (p) {
        if (!isIdDisc(p.id)) { out.presets.push(p); return; }
        var idx = p.scope === 'all' ? cart.map(function (l, i) { return i; }) : [p.scope], dc = 0;
        idx.forEach(function (i) {
          if (seen[i] || !cart[i]) return; seen[i] = 1;
          var remC = MM.toC(ctx.lineTotal(cart[i])) - ctx.lineDiscC(cart[i]); if (remC <= 0) return;
          var x = MM.exemptDiscount(remC, { vatRegistered: true, discPct: p.pct, vatPct: rate });
          dc += x.discount; out.vatC += x.vatRemoved; out.dueC += x.due;
        });
        out.discC += dc;
        if (dc > 0) out.recs.push({ id: p.id, name: p.name, pct: p.pct, item: p.scope === 'all' ? '' : cart[p.scope].name, amt: MM.fromC(dc), kind: 'preset' });
      });
      if (out.vatC > 0) out.recs.push({ id: 'vatx', name: 'VAT exempt', pct: 0, item: '', amt: MM.fromC(out.vatC), kind: 'vatx' });
      return out;
    }
    function payNums() {
      var cart = ctx.cart(), cfg = CFG(), gross = S.r2(ctx.cartTotal()), presets = [];
      Object.keys(pay.dsel).forEach(function (id) {
        var pr = cfg.discounts.filter(function (x) { return x.id === id; })[0], sc = pay.dsel[id]; if (!pr) return;
        presets.push({ id: id, name: pr.name, pct: pr.pct, scope: (sc === 'all' || !cart[sc]) ? 'all' : +sc });
      });
      var ex = vatExempt(cfg, presets); presets = ex.presets;
      var v = pay.od ? (parseFloat(pay.disc) || 0) : 0;
      // line discounts first, then the toggles and the "Other discount" on what is left (see MBMoney.orderDiscount)
      var od = MM.orderDiscount({ lines: cart.map(function (l) { return { totalC: MM.toC(ctx.lineTotal(l)), ld: l.ld || null }; }), presets: presets,
        manual: v > 0 ? { kind: pay.dt === 'pct' ? 'pct' : 'peso', value: v } : null, rules: { stack: !(cfg.discRules && cfg.discRules.stack === false) } });
      var dC = Math.min(MM.toC(gross), od.totalC + ex.discC + ex.vatC), d = MM.fromC(dC), lineDisc = od.lineC.map(MM.fromC);
      var recs = od.recs.map(function (r) { return { id: r.id, name: r.name, pct: r.pct, item: (typeof r.line === 'number' && cart[r.line]) ? cart[r.line].name : '', amt: MM.fromC(r.amtC), kind: r.kind }; });
      recs = recs.concat(ex.recs);
      var vat = null;
      if (cfg.vatRegistered) {
        var vr = Number(cfg.vatPct) || 12, vi = MM.vatSplit(Math.max(0, MM.toC(gross) - dC - ex.dueC), vr);
        vat = { pct: vr, sales: MM.fromC(vi.net), amt: MM.fromC(vi.vat), exempt: MM.fromC(ex.dueC) };
      }
      var net = S.r2(gross - d), nonCash = 0, cashIn = null, amts = {};
      cfg.methods.forEach(function (m) {
        var raw = pay.amt[m.id], a = parseFloat(raw) || 0;
        if (!pay.split) {          // one method takes the whole amount
          if (m.id === 'cash') cashIn = (pay.method === 'cash' && raw !== undefined && raw !== '') ? a : null;
          else if (m.id === pay.method) { amts[m.id] = net; nonCash += net; }
          return;
        }
        if (m.id === 'cash') cashIn = (raw === undefined || raw === '') ? null : a; else { amts[m.id] = a; nonCash += a; }
      });
      nonCash = S.r2(nonCash);
      var cashDue = S.r2(Math.max(0, net - nonCash)), tend = cashIn === null ? cashDue : cashIn;
      return { gross: gross, d: d, net: net, vat: vat, recs: recs, lineDisc: lineDisc, nonCash: nonCash, amts: amts, cashDue: cashDue, tend: tend, change: S.r2(tend - cashDue), over: nonCash > net + 0.004 };
    }
    // names of the PWD / Senior discounts that still miss the name or ID number on the ID
    function idMissing() {
      var cfg = CFG(), miss = [];
      Object.keys(pay.dsel).forEach(function (id) {
        if (!isIdDisc(id)) return;
        var x = pay.ids[id] || {}, pr = cfg.discounts.filter(function (z) { return z.id === id; })[0];
        if (!String(x.name || '').trim() || !String(x.id || '').trim()) miss.push(pr ? pr.name : id);
      });
      return miss;
    }
    function openCharge() {
      if (!ctx.cart().length) return;
      if (!S.current()) { openStart(); return; }
      var cfg = CFG(), m = lastMethod();
      if (!cfg.methods.some(function (x) { return x.id === m; })) m = 'cash';
      pay = { dt: 'peso', od: false, disc: '', dsel: {}, amt: {}, ids: {}, ref: {}, method: m, split: false };
      ctx.setMode('pay'); renderPay(); ctx.openSheet();
    }
    function renderPay() {
      var cart = ctx.cart(), cfg = CFG(), n = payNums(), cur = S.current(), cash = pay.split || pay.method === 'cash';
      var h = '<div class="sh-head"><div class="t"><b>Charge</b><span>Shift ' + esc(cur.no) + ' · ' + ctx.cartCount() + (ctx.cartCount() === 1 ? ' item' : ' items') + ' · ' + S.typeText(ctx.orderType()) +
        '</span></div><button class="icon-btn" data-close aria-label="Close">&times;</button></div><div class="sh-body">';
      h += '<div class="totalrow"><span>Total</span><span class="num">' + money(n.gross) + '</span></div>';
      cfg.discounts.forEach(function (pr) {
        var on = pay.dsel[pr.id] !== undefined;
        h += '<label class="check"><input type="checkbox" data-dp="' + esc(pr.id) + '"' + (on ? ' checked' : '') + '> ' + esc(pr.name) + ' ' + pr.pct + '%</label>';
        if (on) {
          h += '<div class="frow"><label>Apply ' + esc(pr.name) + ' to</label><select class="field" data-ds="' + esc(pr.id) + '"><option value="all">Whole order</option>' +
            cart.map(function (l, i) { return '<option value="' + i + '"' + (String(pay.dsel[pr.id]) === String(i) ? ' selected' : '') + '>' + esc(l.name) + (l.opt ? ' (' + esc(l.opt) + ')' : '') + '</option>'; }).join('') + '</select></div>';
          if (isIdDisc(pr.id)) {
            var ix = pay.ids[pr.id] || {};
            h += '<div class="frow"><label>' + esc(pr.name) + ' name</label><input class="field" data-idn="' + esc(pr.id) + '" type="text" maxlength="60" placeholder="Name on the ID" value="' + esc(ix.name || '') + '" autocomplete="off"></div>' +
              '<div class="frow"><label>' + esc(pr.name) + ' ID number</label><input class="field" data-idi="' + esc(pr.id) + '" type="text" maxlength="40" placeholder="ID number" value="' + esc(ix.id || '') + '" autocomplete="off"></div>';
          }
        }
      });
      h += '<div class="err" id="idErr" role="alert" hidden></div>';
      h += '<div class="help2" id="stackNote" hidden>Several discounts on the same part: only the biggest counts. To add them up, allow it in Settings.</div>';
      h += '<label class="check"><input type="checkbox" data-od' + (pay.od ? ' checked' : '') + '> Other discount</label>';
      if (pay.od) h += '<div class="frow"><label for="payDisc">Amount</label><div class="seg2"><button data-dt="peso" class="' + (pay.dt === 'peso' ? 'on' : '') + '">₱</button>' +
        '<button data-dt="pct" class="' + (pay.dt === 'pct' ? 'on' : '') + '">%</button></div>' +
        '<input class="field num" id="payDisc" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" value="' + esc(pay.disc) + '"></div>';
      h += '<div class="totalrow"><span>Discount</span><span class="num" id="payDiscAmt"></span></div>';
      h += '<div class="totalrow"><span>To pay</span><span class="num" id="payNet"></span></div>';
      if (!pay.split) {
        h += '<div class="chips" role="group" aria-label="Payment method">' + cfg.methods.map(function (m) {
          return '<button class="chip' + (m.id === pay.method ? ' on' : '') + '" data-meth="' + esc(m.id) + '" aria-pressed="' + (m.id === pay.method) + '">' + esc(m.name) + '</button>'; }).join('') + '</div>';
        if (cfg.methods.length > 1) h += '<div class="pad"><button class="text-btn" data-split="1">Split payment</button></div>';
      } else {
        h += '<div class="help2">Fill in an amount for each method. Cash can be left blank to cover the rest.</div>';
      }
      cfg.methods.forEach(function (m) {
        var isCash = m.id === 'cash';
        if (pay.split || (isCash && pay.method === 'cash')) h += '<div class="frow"><label for="pm-' + esc(m.id) + '">' + esc(m.name) + (isCash ? ' received' : '') + '</label>' +
          '<input class="field num" id="pm-' + esc(m.id) + '" data-pm="' + esc(m.id) + '" type="number" inputmode="decimal" min="0" step="0.01" placeholder="' + (isCash ? (pay.split ? 'Rest' : 'Exact') : '0') + '" value="' + esc(pay.amt[m.id] === undefined ? '' : pay.amt[m.id]) + '">' +
          (isCash ? '' : '<button class="text-btn" data-rest="' + esc(m.id) + '">Rest</button>') + '</div>';
        if (!isCash) h += refRow(m);
      });
      if (pay.split) h += '<div class="pad"><button class="text-btn" data-split="0">Single payment</button></div>';
      if (cash) h += '<div class="quick"><button data-qc="exact">Exact</button><button data-qc="100">100</button><button data-qc="200">200</button><button data-qc="500">500</button><button data-qc="1000">1,000</button></div>';
      if (cash) h += '<div class="totalrow"><span id="chgLabel">Change</span><span class="num" id="payChange"></span></div>';
      h += '</div><div class="sh-foot"><button class="text-btn" data-close>Cancel</button><button class="primary" id="payGo"></button></div>';
      $('sheet').innerHTML = h; refreshPay();
      var f = $('pm-cash') || $('sheet').querySelector('input[type=text], input[type=number]'); if (f) f.focus();
    }
    // the reference number only shows for a method that has an amount (hidden until then)
    function refRow(m) {
      return '<div class="frow" id="prw-' + esc(m.id) + '" hidden><label for="pr-' + esc(m.id) + '">' + esc(m.name) + ' reference no.</label><input class="field" id="pr-' + esc(m.id) + '" data-pr="' + esc(m.id) + '" type="text" maxlength="40" placeholder="Optional" value="' + esc(pay.ref[m.id] || '') + '" autocomplete="off"></div>';
    }
    // the method named on the Charge button: the chosen one, or "Split"
    function methodLabel() {
      if (pay.split) return 'Split';
      var m = CFG().methods.filter(function (x) { return x.id === pay.method; })[0]; return m ? m.name : 'Cash';
    }
    function refreshPay() {
      var cart = ctx.cart(), n = payNums(), sn = $('stackNote'), cfg = CFG();
      if (sn) {          // stacking is switched off in Settings and two toggles cover the same part
        var grp = {}, many = false, off = !!(cfg.discRules && cfg.discRules.stack === false);
        Object.keys(pay.dsel).forEach(function (id) { var sc = pay.dsel[id], key = (sc === 'all' || !cart[sc]) ? 'all' : String(sc); grp[key] = (grp[key] || 0) + 1; if (grp[key] > 1) many = true; });
        sn.hidden = !(many && off);
      }
      cfg.methods.forEach(function (m) { var r = $('prw-' + m.id); if (r) r.hidden = !(n.amts[m.id] > 0); });
      var miss = idMissing(), er = $('idErr');
      er.hidden = !miss.length; er.textContent = miss.length ? 'Enter the name and ID number for ' + miss.join(' and ') + '.' : '';
      $('payNet').textContent = money(n.net); $('payDiscAmt').textContent = n.d ? '-' + money(n.d) : '₱0.00';
      $('payGo').textContent = 'Charge ' + D.pesoShort(n.net) + ' · ' + methodLabel(); $('payGo').disabled = miss.length > 0;
      var short = n.tend < n.cashDue, cl = $('chgLabel');
      if (cl) {
        cl.textContent = n.over ? 'Over by' : short ? 'Still needed' : 'Change';
        $('payChange').textContent = money(n.over ? n.nonCash - n.net : Math.abs(n.change));
        $('payChange').style.color = (short || n.over) ? 'var(--bad)' : '';
      }
    }
    function payText(s) {
      var parts = [];
      if (s.pays && s.pays.length) s.pays.forEach(function (x) { parts.push(x.name + ' ' + money(x.amt)); });
      else if (s.pay === 'ewallet') parts.push('E-wallet');
      var c = S.cashOf(s);
      if (c > 0 || !parts.length) parts.unshift('Cash ' + money(s.tend) + (s.change ? ' (change ' + money(s.change) + ')' : ''));
      return parts.join(' + ');
    }
    async function completeSale() {
      if (charging) return;
      var cfg = CFG(), n = payNums(), cart = ctx.cart();
      if (idMissing().length) return;        // the error under the discounts says what is missing
      if (n.over) { D.toast('Non-cash amounts are more than the total'); return; }
      if (n.tend < n.cashDue) { D.toast('Cash received is less than the amount due'); return; }
      var ids = [];
      Object.keys(pay.dsel).forEach(function (id) {
        if (!isIdDisc(id)) return;
        var x = pay.ids[id] || {};
        ids.push({ type: id, name: String(x.name || '').trim(), id: String(x.id || '').trim() });
      });
      charging = true;
      try {
        var manual = n.recs.some(function (r) { return r.id === 'manual'; }), why = '';
        if (manual) {
          var g = await MBGuard.ask({ title: 'Manual discount', detail: 'This order has an "Other discount". Total discount ' + money(n.d) + '.' });
          if (!g.ok) return;
          why = g.reason;
        }
        var splits = cfg.methods.map(function (m) {
          var amt = n.amts[m.id] || 0;
          return { id: m.id, name: m.name, cash: m.id === 'cash', amt: m.id === 'cash' ? n.tend : amt, ref: (m.id === 'cash' || !(amt > 0)) ? '' : String(pay.ref[m.id] || '').trim() };
        });
        var fixing = ctx.fixing(), removed = ctx.removed();
        var sale = S.makeSale(cart, { disc: n.d, discs: n.recs, lineDisc: n.lineDisc, splits: splits, type: ctx.orderType(), cust: ctx.cust(), ids: ids, vat: n.vat });
        if (fixing) sale.fix = fixing.id;
        if (removed.length) sale.removed = removed.slice(0, 30);     // items taken out of the order before it was paid
        if (!S.addSale(sale)) { D.toast('Could not save the sale. Storage may be full.'); return; }
        if (manual) MBGuard.log('Manual discount', (sale.rno || 'Order ' + sale.n) + ' · discount ' + money(n.d) + ' of ' + money(n.gross), why);
        sale.lines.forEach(function (l) { if (l.disc && !l.di) MBGuard.log('Manual discount', (sale.rno || 'Order ' + sale.n) + ' · ' + l.name + ' · -' + money(l.disc), l.dr || ''); });
        if (fixing && !S.refund(fixing.id, true)) D.toast('New order saved, but the old one could not be refunded. Refund it in Orders.');
        lastSale = sale; ctx.finishOrder();
        ctx.setMode('done'); renderDone();
        var cash = S.cashOf(sale) > 0;
        if (cfg.autoPrint) {
          MBPrinter.print('pos', function (p) { S.saleReceipt(p, sale); }, { sale: true, cash: cash }).then(function (m) { if (m) D.toast(m); }).catch(function () {});
        }
        // drawer printers that are not printing this receipt still open the drawer
        if (MBPrinter.hasDrawer()) MBPrinter.openDrawer({ cash: cash, skipReceiptPrinters: cfg.autoPrint }).then(function (m) { if (m) D.toast(m); }).catch(function () {});
      } finally { charging = false; }
    }
    function renderDone() {
      var s = lastSale;
      var h = '<div class="sh-head"><div class="t"><b>Sale saved</b><span>Order ' + esc(s.n) + ' · Shift ' + s.shift + ' · ' + S.typeText(s.type) + '</span></div><button class="icon-btn" data-close aria-label="Close">&times;</button></div><div class="sh-body">' +
        '<div class="big num">' + money(s.net) + '</div><div class="bigsub">' + esc(payText(s)) + (s.disc ? ' · Discount ' + money(s.disc) : '') + '</div></div>' +
        '<div class="sh-foot"><button class="secondary" id="printSale">Print again</button><button class="primary" data-close>New order</button></div>';
      $('sheet').innerHTML = h;
    }
    async function printSale(btn) {
      var old = btn.textContent; btn.disabled = true; btn.textContent = 'Printing...';
      try { var m = await MBPrinter.print('pos', function (p) { S.saleReceipt(p, lastSale); }); if (m) D.toast(m); }
      finally { btn.disabled = false; btn.textContent = old; }
    }
    function openStart() {
      ctx.setMode('start');
      var last = S.lastStart();
      $('sheet').innerHTML = '<div class="sh-head"><div class="t"><b>Start a shift</b><span>Needed before a sale can be saved</span></div><button class="icon-btn" data-close aria-label="Close">&times;</button></div><div class="sh-body">' +
        '<div class="help2">Sales, cash, and expenses are totaled for each shift. The starting cash is the same as last time. Change it only if the drawer starts with a different amount. Cash sales are the extra cash on top of it.</div>' +
        '<div class="frow"><label for="stCash">Starting cash</label><input class="field num" id="stCash" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" value="' + esc(last) + '"></div>' +
        '<div class="frow"><label for="stBy">Opened by</label><input class="field" id="stBy" type="text" maxlength="30" placeholder="Name" value="' + esc(S.lastUser()) + '" autocomplete="off"></div>' +
        '</div><div class="sh-foot"><button class="text-btn" data-close>Cancel</button><button class="primary" id="startGo">Start shift and charge</button></div>';
      ctx.openSheet();
    }
    async function doStart() {
      var v = $('stCash').value.trim();
      if (v === '' || isNaN(parseFloat(v)) || parseFloat(v) < 0) { D.toast('Enter the starting cash'); $('stCash').focus(); return; }
      var w = S.syncWarning('start'); if (w && !(await S.ask(w, 'Start anyway', 'Start the shift?'))) return;
      S.start(parseFloat(v), $('stBy').value);
      openCharge();
    }
    $('sheet').addEventListener('click', function (e) {
      var t = e.target, mode = ctx.mode();
      if (mode === 'pay') {
        var dt = t.closest('button[data-dt]'); if (dt) { pay.dt = dt.getAttribute('data-dt'); renderPay(); return; }
        var mt = t.closest('button[data-meth]'); if (mt) { pay.method = mt.getAttribute('data-meth'); pay.amt = {}; rememberMethod(pay.method); renderPay(); return; }
        var sp = t.closest('button[data-split]');
        if (sp) {
          if (sp.getAttribute('data-split') === '1') { var cur = payNums(); pay.amt = {}; if (pay.method !== 'cash') pay.amt[pay.method] = String(cur.net); pay.split = true; }
          else { pay.amt = {}; pay.split = false; }
          renderPay(); return;
        }
        var rs = t.closest('button[data-rest]');
        if (rs) { var o = 0, nn = payNums(); CFG().methods.forEach(function (m) { if (m.id !== rs.getAttribute('data-rest')) o += parseFloat(pay.amt[m.id]) || 0; }); pay.amt[rs.getAttribute('data-rest')] = String(Math.max(0, S.r2(nn.net - o))); renderPay(); return; }
        var qc = t.closest('button[data-qc]'); if (qc) { var v = qc.getAttribute('data-qc'); pay.amt.cash = v === 'exact' ? '' : v; renderPay(); return; }
        if (t.id === 'payGo') completeSale();
      } else if (mode === 'start') { if (t.id === 'startGo') doStart(); }
      else if (mode === 'done') { if (t.id === 'printSale') printSale(t); }
    });
    $('sheet').addEventListener('keydown', function (e) {      // Enter saves the sale or starts the shift
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
      var mode = ctx.mode();
      if (mode === 'pay') { e.preventDefault(); if (!$('payGo').disabled) completeSale(); }
      else if (mode === 'start') { e.preventDefault(); doStart(); }
    });
    $('sheet').addEventListener('input', function (e) {
      if (ctx.mode() !== 'pay') return;
      if (e.target.id === 'payDisc') { pay.disc = e.target.value; refreshPay(); }
      else if (e.target.getAttribute('data-pm')) { pay.amt[e.target.getAttribute('data-pm')] = e.target.value; refreshPay(); }
      else if (e.target.getAttribute('data-idn') || e.target.getAttribute('data-idi')) {
        var ik = e.target.getAttribute('data-idn') || e.target.getAttribute('data-idi');
        pay.ids[ik] = pay.ids[ik] || {}; pay.ids[ik][e.target.getAttribute('data-idn') ? 'name' : 'id'] = e.target.value;
        refreshPay();
      }
      else if (e.target.getAttribute('data-pr')) pay.ref[e.target.getAttribute('data-pr')] = e.target.value;
    });
    $('sheet').addEventListener('change', function (e) {
      if (ctx.mode() !== 'pay') return;
      var dp = e.target.getAttribute('data-dp'), ds = e.target.getAttribute('data-ds');
      if (dp) { if (e.target.checked) pay.dsel[dp] = 'all'; else delete pay.dsel[dp]; renderPay(); }
      else if (ds) { pay.dsel[ds] = e.target.value; renderPay(); }
      else if (e.target.hasAttribute('data-od')) { pay.od = e.target.checked; renderPay(); }
    });
    return { open: openCharge, payText: payText };
  }
})();
