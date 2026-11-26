/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved.

   Sales and shifts for the point of sale, and the end-of-shift report.

   A shift is opened with a starting cash amount. Every sale made while it is open belongs to it.
   When the shift ends, the report is worked out and saved, like the shift report on a POS receipt:
     Cash drawer    starting cash + cash payments - cash refunds - cash paid out (cash expenses) = expected cash
                    actual cash (counted) and the difference
     Sales summary  gross sales, refunds, discounts, net sales, cash, e-wallet
     Expenses       every expense recorded during the shift
     Cups and lids  how many of each were used by the drinks sold

   Lids: a drink in a hot size uses a black lid. Otherwise the menu section decides: "dome" (round, frappe),
   "flat", or "none". Cups are named from the size: 16 oz iced -> 16oz dabba, 12 oz hot -> 12oz double wall. */
(function () {
  var D = window.MBData;
  var SALES_KEY = 'marinabays_sales_v1', SHIFTS_KEY = 'marinabays_shifts_v1', POS_KEY = 'marinabays_posname_v1', USER_KEY = 'marinabays_lastuser_v1', DEV_KEY = 'marinabays_device_v1';
  var EXP_KEY = 'marinabays_expenses_v1', MONEY_KEY = 'marinabays_money_v1';
  var TZ = 'Asia/Manila', STORE = "Marina Bay's Cafe";
  // details printed on order and sale receipts
  var CAFE = {
    address: 'B28 L2 Ph1 Bagong Nayon 2, Barangay San Isidro, Antipolo City, Rizal 1870',
    tin: '204-229-455-00000',
    phone: '0922 962 5660',
    email: 'marinabayscafe@gmail.com',
    lines: ['Calm in every cup...', 'Thanks for sailing by!']
  };
  // The details printed on POS receipts. They come from Printers > Receipt on this device;
  // anything not set there falls back to the CAFE values above.
  function cafe() {
    var r = (window.MBPrinter && window.MBPrinter.state.receipt) || {};
    function pick(k, d) { return typeof r[k] === 'string' ? r[k] : d; }
    return {
      address: pick('address', CAFE.address), tin: pick('tin', CAFE.tin),
      phone: pick('phone', CAFE.phone), email: pick('email', CAFE.email),
      thanks: pick('thanks', CAFE.lines.join('\n'))
    };
  }
  function lines(t) { return String(t || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function typeText(t) { return t === 'take' ? 'Take out' : 'Dine in'; }
  var DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

  function load(key, dflt) { try { var v = JSON.parse(localStorage.getItem(key)); if (v) return v; } catch (e) {} return dflt; }
  var sales = load(SALES_KEY, { sales: [] });
  if (!Array.isArray(sales.sales)) sales.sales = [];
  var shifts = load(SHIFTS_KEY, { nextNo: 1, cur: null, hist: [] });
  shifts.hist = shifts.hist || []; if (!shifts.nextNo) shifts.nextNo = 1;
  var goneSales = {}, goneShifts = {};      // ids / numbers deleted in this tab, so a merge never brings them back
  // keep orders another tab saved that this tab does not have, then write
  function mergeSales() {
    var st = load(SALES_KEY, null), have = {}, added = false;
    if (!st || !Array.isArray(st.sales)) return;
    sales.sales.forEach(function (s) { have[s.id] = s; });
    st.sales.forEach(function (s) {
      var m = have[s.id];
      if (!m) { if (!goneSales[s.id]) { sales.sales.push(s); added = true; } }
      else if (s.ref && !m.ref) { m.ref = s.ref; m.refT = s.refT; if (s.refShift != null) m.refShift = s.refShift; m.inv = s.inv; }
    });
    if (added) sales.sales.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
  }
  function mergeShifts() {
    var st = load(SHIFTS_KEY, null), have = {}, mx = 0;
    if (!st) return;
    shifts.hist.forEach(function (h) { have[h.no] = 1; });
    (st.hist || []).forEach(function (h) {
      if (!have[h.no] && !goneShifts[h.no]) { shifts.hist.push(h); have[h.no] = 1; }
      if (shifts.cur && h.no === shifts.cur.no && h.openedAt === shifts.cur.openedAt) shifts.cur = null;   // closed in another tab
    });
    shifts.hist.sort(function (a, b) { return a.no - b.no; });
    if (!shifts.cur && st.cur && !have[st.cur.no]) shifts.cur = st.cur;
    shifts.hist.forEach(function (h) { if (h.no > mx) mx = h.no; });
    shifts.nextNo = Math.max(shifts.nextNo || 1, Number(st.nextNo) || 1, mx + 1, shifts.cur ? shifts.cur.no + 1 : 1);
  }
  var rev = 0;      // goes up whenever the sales or shifts change, so the analytics index below knows when to rebuild
  function saveSales() { rev++; try { mergeSales(); localStorage.setItem(SALES_KEY, JSON.stringify(sales)); return true; } catch (e) { return false; } }
  function saveShifts() { rev++; try { mergeShifts(); localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts)); return true; } catch (e) { return false; } }
  // another tab changed the saved orders or shifts: load them here too
  window.addEventListener('storage', function (e) {
    rev++;
    if (e.key === SALES_KEY || e.key === null) {
      var vs = load(SALES_KEY, { sales: [] }); sales.sales = Array.isArray(vs.sales) ? vs.sales : [];
    }
    if (e.key === SHIFTS_KEY || e.key === null) {
      var vh = load(SHIFTS_KEY, { nextNo: 1, cur: null, hist: [] });
      shifts.hist = vh.hist || []; shifts.cur = vh.cur || null; shifts.nextNo = vh.nextNo || 1;
    }
  });

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(n) { return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function sg(n) { n = Number(n) || 0; return (n < 0 ? '-' : n > 0 ? '+' : '') + '₱' + num(Math.abs(n)); }
  function phDate(ts) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
  function fmtDT(ts) {
    if (!ts) return '-';
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: '2-digit', day: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
      .format(new Date(ts)).replace(',', '').replace(/[\u202f\u00a0]/g, ' ');
  }
  function fmtTime(ts) {
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ts)).replace(/[\u202f\u00a0]/g, ' ');
  }
  function nextDate(d) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

  /* ---------- cups and lids ---------- */
  function cupName(label) {
    var m = /(\d+)\s*oz/i.exec(label || ''); if (!m) return null;
    return m[1] + 'oz ' + (/hot/i.test(label) ? 'double wall' : 'dabba');
  }
  function lidName(cat, label) {
    if (!cupName(label)) return null;
    if (cat && cat.lid === 'none') return null;
    if (/hot/i.test(label)) return 'Black lids';
    var dome = cat && (cat.lid === 'dome' || (cat.lid === undefined && /blend|frappe/i.test((cat.name || '') + ' ' + (cat.note || ''))));
    return dome ? 'Dome lids' : 'Flat lids';
  }

  /* ---------- sales ---------- */
  // cartLines come from the POS cart; pay = { disc, method, tend }
  function makeSale(cartLines, pay) {
    var gross = 0, lines = cartLines.map(function (l, li) {
      var unit = Number(l.price) || 0; (l.addons || []).forEach(function (a) { unit += Number(a.p) || 0; });
      gross += unit * l.qty;
      var kp = String(l.k || '').split('|'), itemId = l.itemId || (kp[0] && kp[0] !== 'ex' && kp[0] !== 'fix' ? kp[0] : '');
      var optIdx = l.optIdx != null ? l.optIdx : (itemId && kp[1] !== undefined && kp[1] !== '' && !isNaN(+kp[1]) ? +kp[1] : null);
      var catId = l.cat || ((itemId && D.item(itemId)) || {}).cat, cat = catId ? D.cat(catId) : null;
      var o = { name: l.name, opt: l.opt || '', price: Number(l.price) || 0,
               addons: (l.addons || []).map(function (a) { return a.q ? { n: a.n, p: Number(a.p) || 0, q: a.q, u: Number(a.u) || 0 } : { n: a.n, p: Number(a.p) || 0 }; }),
               note: l.note || '', qty: l.qty, cup: cupName(l.opt), lid: lidName(cat, l.opt), cat: catId || '', itemId: itemId, optIdx: optIdx };
      var da = pay.lineDisc ? Number(pay.lineDisc[li]) || 0 : 0;      // the discount chosen on this line (pesos)
      if (da > 0 && l.ld) { o.disc = da; o.dk = l.ld.kind; o.dv = Number(l.ld.value) || 0; o.dn = l.ld.name || ''; if (l.ld.id) o.di = l.ld.id; if (l.ld.reason) o.dr = l.ld.reason; }
      return o;
    });
    gross = r2(gross);
    var disc = r2(Math.min(pay.disc || 0, gross)), net = r2(gross - disc);
    var pays = [], nonCash = 0, cashTend = 0;
    if (pay.splits) {
      pay.splits.forEach(function (x) { var a = r2(x.amt); if (a <= 0) return; if (x.cash) cashTend += a; else { pays.push(x.ref ? { id: x.id, name: x.name, amt: a, ref: String(x.ref) } : { id: x.id, name: x.name, amt: a }); nonCash += a; } });
      if (nonCash > net) { var left = net; pays.forEach(function (x) { x.amt = r2(Math.min(x.amt, left)); left = r2(left - x.amt); }); pays = pays.filter(function (x) { return x.amt > 0; }); nonCash = net; }
    } else if (pay.method === 'ewallet') { pays.push({ id: 'ewallet', name: 'E-wallet', amt: net }); nonCash = net; }
    else cashTend = pay.tend || net;
    var ca = r2(net - nonCash);
    var cur = shifts.cur, mine = cur ? sales.sales.filter(function (s) { return s.shift === cur.no; }) : [], count = mine.length;
    mine.forEach(function (s) { if ((s.n || 0) > count) count = s.n; });   // highest order number so far, so a deleted order never makes two orders share a number
    var posNo = /(\d+)/.exec(cur && cur.pos ? cur.pos : posName()), prefix = '#' + (posNo ? posNo[1] : '1') + '-';
    var sale = { id: D.uid('sale'), type: pay.type === 'take' ? 'take' : 'dine', emp: cur ? cur.openedBy || '' : '', pos: cur && cur.pos ? cur.pos : posName(),
             rno: prefix + seqPeek(prefix), t: Date.now(), shift: cur ? cur.no : null, n: count + 1, lines: lines, gross: gross, disc: disc, net: net,
             pay: nonCash === 0 ? 'cash' : (ca === 0 ? 'ewallet' : 'split'), ca: ca, pays: pays, discs: pay.discs || [],
             tend: r2(cashTend), change: r2(Math.max(0, cashTend - ca)), ref: 0 };
    if (cur && cur.id) sale.sid = cur.id;
    sale.q = nextQ();                                                         // queue number, starts at 1 in each shift
    if (pay.cust) sale.cust = String(pay.cust).trim().slice(0, 40);
    if (pay.ids && pay.ids.length) sale.ids = pay.ids;                        // PWD / Senior: [{ type, name, id }]
    if (pay.vat) sale.vat = pay.vat;     // which shift (not just which number), to spot two shifts that used the same number
    return sale;
  }
  /* Receipt numbers: '#<pos>-<n>'. The last number used is kept on this phone (not synced, not in backups), so a number is never
     used twice, not after a delete, not after a reset, not after a restore. It also continues from the highest number in the saved orders. */
  function seqPeek(prefix) {
    var dev = load(DEV_KEY, {}), top = Number((dev.seq || {})[prefix]) || 0;
    sales.sales.forEach(function (s) {
      if (String(s.rno || '').indexOf(prefix) !== 0) return;
      var m = /(\d+)$/.exec(s.rno); if (m && +m[1] > top) top = +m[1];
    });
    return top + 1;
  }
  function seqCommit(rno) {
    var m = /^(.*-)(\d+)$/.exec(String(rno || '')); if (!m) return;
    var dev = load(DEV_KEY, {}); dev.seq = dev.seq || {};
    if ((+dev.seq[m[1]] || 0) >= +m[2]) return;
    dev.seq[m[1]] = +m[2]; try { localStorage.setItem(DEV_KEY, JSON.stringify(dev)); } catch (e) {}
  }
  // orders that share one receipt number: the earliest keeps it, the others get new numbers
  function renumber(rno) {
    var same = sales.sales.filter(function (s) { return s.rno === rno; }).sort(function (a, b) { return a.t - b.t; });
    var m = /^(.*-)(\d+)$/.exec(String(rno || '')); if (same.length < 2 || !m) return 0;
    same.slice(1).forEach(function (s) { s.rno = m[1] + seqPeek(m[1]); seqCommit(s.rno); });
    saveSales(); return same.length - 1;
  }
  // text for a "are you sure" box when this phone has changes the others have not seen (or is offline), '' when all is well
  function syncWarning(kind) {
    var C = window.MBCloud; if (!C || !C.configured) return '';
    var st = C.status(); if (!st || !st.user) return '';
    var p = C.pending(), n = (p.sales || 0) + (p.shifts || 0) + (p.expenses || 0) + (p.counter || 0), bad = st.state === 'offline' || st.state === 'error';
    if (!n && !bad) return '';
    var why = n ? n + (n === 1 ? ' change on this phone is' : ' changes on this phone are') + ' not synced yet' : 'This phone is offline';
    if (kind === 'close') return why + '. Sales or expenses from another phone may be missing from this shift report. End the shift anyway?';
    return why + '. If another phone already opened a shift, wait until it syncs, or two shifts can end up with the same number. Start a shift anyway?';
  }
  function cashOf(s) { return s.ca != null ? s.ca : (s.pay === 'cash' ? s.net : 0); }
  // the queue number the next order of the open shift will get
  function nextQ() {
    var cur = shifts.cur, top = 0;
    if (cur) sales.sales.forEach(function (s) { if (s.shift === cur.no) { var v = s.q || s.n || 0; if (v > top) top = v; } });
    return top + 1;
  }
  /* Cups and lids come off the stock the moment an order is saved (s.inv remembers what was taken) and go back on a refund or delete. */
  function freshStock() { if (D.reloadInventory) D.reloadInventory(); if (window.MBInvLog && window.MBInvLog.reload) window.MBInvLog.reload(); }
  function stockOut(s) {
    freshStock();
    var items = D.getInventory().items || [], need = {}, took = {}, short = {}, unc = [];
    (s.lines || []).forEach(function (l) { [l.cup, l.lid].forEach(function (k) { if (k) need[k] = (need[k] || 0) + l.qty; }); });
    Object.keys(need).forEach(function (k) {
      var it = items.filter(function (i) { return String(i.name).toLowerCase() === k.toLowerCase(); })[0]; if (!it) return;
      if (it.qty == null || (it.qty === 0 && !it.updated)) { unc.push(it.name); return; }      // never counted: nothing to take off
      if (!(need[k] > 0)) return;
      var before = it.qty, after = before - need[k];
      if (need[k] > before) short[it.name] = need[k] - Math.max(0, before);
      it.qty = after; it.updated = phDate(Date.now()); took[it.id] = need[k];
      if (window.MBInvLog) window.MBInvLog.logAuto(it.id, before, after);
    });
    s.inv = took; if (Object.keys(short).length) s.short = short; else delete s.short;
    if (unc.length) s.unc = unc; else delete s.unc;
    if (Object.keys(took).length) D.saveInventory();
  }
  // today's cups and lids that were used with less in stock than needed: [{name, missing}]
  function shortages() {
    var today = phDate(Date.now()), sum = {}, out = [];
    sales.sales.forEach(function (s) {
      if (!s.short || (s.ref && !s.inv) || phDate(s.t) !== today) return;
      Object.keys(s.short).forEach(function (k) { sum[k] = (sum[k] || 0) + s.short[k]; });
    });
    Object.keys(sum).sort().forEach(function (k) { out.push({ name: k, missing: sum[k] }); });
    return out;
  }
  // names of today's cups and lids that are still not counted in the inventory, so nothing was taken off for them
  function uncounted() {
    var today = phDate(Date.now()), seen = {}, out = [], items = D.getInventory().items || [];
    sales.sales.forEach(function (s) {
      if (!s.unc || phDate(s.t) !== today) return;
      s.unc.forEach(function (k) {
        if (seen[k]) return; seen[k] = 1;
        var it = items.filter(function (i) { return String(i.name).toLowerCase() === String(k).toLowerCase(); })[0];
        if (!it || it.qty == null || (it.qty === 0 && !it.updated)) out.push(k);
      });
    });
    return out.sort();
  }
  function stockBack(s) {
    if (!s || !s.inv) return; freshStock(); var items = D.getInventory().items || [], back = false;
    Object.keys(s.inv).forEach(function (id) {
      var it = items.filter(function (i) { return i.id === id; })[0]; if (!it || it.qty == null) return;
      var before = it.qty; it.qty = before + s.inv[id]; it.updated = phDate(Date.now()); back = true;
      if (window.MBInvLog) window.MBInvLog.restoreAuto(id, before, it.qty);
    });
    s.inv = null; if (back) D.saveInventory();
  }
  /* orders of a shift saved before this existed, or on another phone, are taken off when the shift closes */
  function settleShift(no) { sales.sales.forEach(function (s) { if (s.shift === no && !s.ref && s.inv === undefined) stockOut(s); }); saveSales(); }
  function addSale(s) { stockOut(s); sales.sales.push(s); if (saveSales()) { seqCommit(s.rno); return true; } sales.sales = sales.sales.filter(function (x) { return x.id !== s.id; }); stockBack(s); return false; }
  // returnStock (true) puts the cup and lid back in stock. Default false: a made drink already used its cup.
  // A sale of an earlier shift is booked in the shift that is open now (s.refShift).
  function refund(id, returnStock) {
    mergeSales();
    var s = sales.sales.filter(function (x) { return x.id === id; })[0], cur = shifts.cur;
    if (!s || s.ref) return false;
    s.ref = 1; s.refT = Date.now();
    if (cur && s.shift !== cur.no) s.refShift = cur.no;
    if (returnStock === true) stockBack(s);
    if (saveSales()) return true;
    s.ref = 0; delete s.refT; delete s.refShift; return false;
  }
  /* Delete an order. Only orders of the shift that is still open (a closed shift's report is already fixed). */
  function deleteSale(id) {
    var s = sales.sales.filter(function (x) { return x.id === id; })[0], cur = shifts.cur;
    if (!s || !cur || s.shift !== cur.no) return false;
    if (!s.ref || s.inv) stockBack(s);
    goneSales[id] = 1;
    sales.sales = sales.sales.filter(function (x) { return x.id !== id; }); return saveSales();
  }
  /* Delete a closed shift and all of its orders. Expenses and the money counter are left alone. */
  function deleteShift(no) {
    var h = shifts.hist.filter(function (x) { return x.no === no; })[0]; if (!h) return false;
    sales.sales.forEach(function (x) { if (x.shift === no) { if (!x.ref || x.inv) stockBack(x); goneSales[x.id] = 1; } });
    goneShifts[no] = 1;
    sales.sales = sales.sales.filter(function (x) { return x.shift !== no; });
    shifts.hist = shifts.hist.filter(function (x) { return x.no !== no; });
    return saveSales() && saveShifts();
  }
  function salesOf(no) { return sales.sales.filter(function (s) { return s.shift === no; }); }

  /* ---------- shifts ---------- */
  function posName() { try { return localStorage.getItem(POS_KEY) || 'POS 1'; } catch (e) { return 'POS 1'; } }
  function setPosName(n) { try { localStorage.setItem(POS_KEY, String(n || 'POS 1').trim() || 'POS 1'); } catch (e) {} }
  function lastUser() { try { return localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; } }
  function rememberUser(n) { try { localStorage.setItem(USER_KEY, n || ''); } catch (e) {} }
  function current() { return shifts.cur; }
  function lastActual() { var h = shifts.hist[shifts.hist.length - 1]; return h && h.actual != null ? h.actual : ''; }
  // the starting cash entered on the last shift (open or closed). Next shift starts with the same amount.
  function lastStart() {
    var c = shifts.cur, h = shifts.hist[shifts.hist.length - 1], v = c ? c.startCash : (h ? h.startCash : null);
    return v == null ? '' : v;
  }
  function start(cash, by) {
    if (shifts.cur) return shifts.cur;
    var maxNo = shifts.hist.reduce(function (m, h) { return Math.max(m, h.no); }, 0);
    shifts.cur = { id: D.uid('shift'), no: Math.max(shifts.nextNo, maxNo + 1), openedAt: Date.now(), openedBy: String(by || '').trim(), startCash: r2(cash), pos: posName() };
    shifts.nextNo = shifts.cur.no + 1; rememberUser(shifts.cur.openedBy); saveShifts(); return shifts.cur;
  }

  /* ---------- expenses and counted cash (kept by the other apps) ---------- */
  function expensesBetween(from, to) {
    var store = load(EXP_KEY, { days: {} }), out = [], d = phDate(from), last = phDate(to), guard = 0;
    while (d <= last && guard++ < 40) {
      (store.days && store.days[d] || []).forEach(function (e) {
        if (e.t ? (e.t >= from && e.t <= to) : true) out.push({ cat: e.cat, note: e.note || '', amt: Number(e.amt) || 0, src: e.src === 'online' ? 'online' : 'cash', t: e.t || 0 });
      });
      d = nextDate(d);
    }
    return out;
  }
  function countedCash(date) {
    var r = load(MONEY_KEY, {})[date], t = 0; if (!r) return 0;
    DENOMS.forEach(function (d) { t += d * ((r.counts || {})[d] || 0); });
    return t;
  }

  /* ---------- everything by calendar day ---------- */
  function emptyDay(date) {
    return { date: date, orders: 0, gross: 0, refunds: 0, discounts: 0, net: 0, cash: 0, ewallet: 0, drinks: 0, cups: {}, lids: {},
             expenses: [], expCash: 0, expOnline: 0, counted: 0, online: 0, shifts: [], after: 0 };
  }
  function buildIndex() {
    var idx = {};
    function d(date) { return idx[date] || (idx[date] = emptyDay(date)); }
    sales.sales.forEach(function (s) {
      var x = d(phDate(s.t)); x.orders++; x.gross += s.gross;
      x.discounts += s.disc; x.cash += cashOf(s); x.ewallet += s.net - cashOf(s);
      if (s.ref) {      // the refund is booked on the day it was made
        var y = d(phDate(s.refT || s.t));
        y.refunds += s.gross; y.discounts -= s.disc; y.cash -= cashOf(s); y.ewallet -= s.net - cashOf(s);
      }
      s.lines.forEach(function (l) {
        if (l.cup) { x.cups[l.cup] = (x.cups[l.cup] || 0) + l.qty; x.drinks += l.qty; }
        if (l.lid) x.lids[l.lid] = (x.lids[l.lid] || 0) + l.qty;
      });
    });
    var ex = load(EXP_KEY, { days: {} }).days || {};
    Object.keys(ex).forEach(function (date) {
      (ex[date] || []).forEach(function (e) {
        var x = d(date), a = Number(e.amt) || 0;
        x.expenses.push({ cat: e.cat, note: e.note || '', amt: a, src: e.src === 'online' ? 'online' : 'cash', t: e.t || 0 });
        if (e.src === 'online') x.expOnline += a; else x.expCash += a;
      });
    });
    var money = load(MONEY_KEY, {});
    Object.keys(money).forEach(function (date) {
      var c = countedCash(date), o = Number(money[date] && money[date].online) || 0;
      if (c > 0 || o > 0) { var x = d(date); x.counted = c; x.online = o; }
    });
    shifts.hist.forEach(function (r) { d(phDate(r.closedAt || r.openedAt)).shifts.push({ no: r.no, open: false, openedAt: r.openedAt, closedAt: r.closedAt, net: r.net, diff: r.diff, pos: r.pos }); });
    if (shifts.cur) d(phDate(shifts.cur.openedAt)).shifts.push({ no: shifts.cur.no, open: true, openedAt: shifts.cur.openedAt, closedAt: null, net: null, diff: null, pos: shifts.cur.pos });
    Object.keys(idx).forEach(function (k) {
      var x = idx[k];
      x.gross = r2(x.gross); x.refunds = r2(x.refunds); x.discounts = r2(x.discounts); x.cash = r2(x.cash); x.ewallet = r2(x.ewallet);
      x.net = r2(x.gross - x.refunds - x.discounts); x.expCash = r2(x.expCash); x.expOnline = r2(x.expOnline);
      x.after = r2(x.net - x.expCash - x.expOnline);
    });
    return idx;
  }
  // the analytics page asks for the index on every paint: keep it until sales, shifts, expenses or counted cash change
  var idxMemo = null;
  function cachedIndex() {
    var e = null, m = null; try { e = localStorage.getItem(EXP_KEY); m = localStorage.getItem(MONEY_KEY); } catch (x) {}
    if (!idxMemo || idxMemo.rev !== rev || idxMemo.e !== e || idxMemo.m !== m) idxMemo = { rev: rev, e: e, m: m, idx: buildIndex() };
    return idxMemo.idx;
  }
  function day(date) { return buildIndex()[date] || emptyDay(date); }
  // totals for each day of a month, and the month's total
  function month(y, m) {
    var idx = buildIndex(), days = {}, tot = emptyDay(y + '-' + (m < 9 ? '0' : '') + (m + 1)), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (var i = 1; i <= n; i++) {
      var key = y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-' + (i < 10 ? '0' : '') + i, x = idx[key];
      if (!x) continue;
      days[key] = x;
      tot.orders += x.orders; tot.net += x.net; tot.gross += x.gross; tot.drinks += x.drinks; tot.expCash += x.expCash; tot.expOnline += x.expOnline;
    }
    tot.net = r2(tot.net); tot.expCash = r2(tot.expCash); tot.expOnline = r2(tot.expOnline); tot.after = r2(tot.net - tot.expCash - tot.expOnline);
    return { days: days, total: tot };
  }

  /* ---------- the report ---------- */
  function report(sh, opts) {
    opts = opts || {};
    var upto = opts.closedAt || Date.now(), ss = salesOf(sh.no);
    var gross = 0, refunds = 0, disc = 0, cashPay = 0, cashRef = 0, salesCash = 0, ewallet = 0, drinks = 0, cups = {}, lids = {};
    var useById = {}, stockUsed = [], stockItems = D.getInventory().items || [];
    ss.forEach(function (s) {
      gross += s.gross;
      cashPay += cashOf(s);
      // refunded in this shift (or before refShift existed) counts here; one refunded in a later shift stays a normal sale here
      if (s.ref && (s.refShift == null || s.refShift === sh.no)) { refunds += s.gross; cashRef += cashOf(s); }
      else { disc += s.disc; salesCash += cashOf(s); ewallet += s.net - cashOf(s); }
      s.lines.forEach(function (l) {
        if (l.cup) { cups[l.cup] = (cups[l.cup] || 0) + l.qty; drinks += l.qty; }
        if (l.lid) lids[l.lid] = (lids[l.lid] || 0) + l.qty;
      });
      Object.keys(s.inv || {}).forEach(function (id) { useById[id] = (useById[id] || 0) + s.inv[id]; });
    });
    // orders of an earlier shift that were refunded during this one: the money goes out of this shift's drawer
    sales.sales.forEach(function (s) {
      if (!s.ref || s.shift === sh.no || s.refShift !== sh.no) return;
      refunds += s.gross; cashRef += cashOf(s); disc -= s.disc; salesCash -= cashOf(s); ewallet -= s.net - cashOf(s);
    });
    Object.keys(useById).forEach(function (id) {
      var it = stockItems.filter(function (i) { return i.id === id; })[0];
      stockUsed.push({ name: it ? it.name : id, used: useById[id] });
    });
    stockUsed.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    var byM = {}, byOrder = [];
    function addM(s, sg) {
      function bump(id, name, a) {
        if (Math.abs(a) < 0.005) return;
        if (!byM[id]) { byM[id] = { id: id, name: name, amt: 0 }; byOrder.push(id); }
        byM[id].amt += sg * a;
      }
      var c = cashOf(s); bump('cash', 'Cash', c);
      if (s.pays && s.pays.length) s.pays.forEach(function (x) { bump(x.id, x.name, x.amt); });
      else bump('ewallet', 'E-wallet', s.net - c);
    }
    ss.forEach(function (s) { if (!(s.ref && (s.refShift == null || s.refShift === sh.no))) addM(s, 1); });
    sales.sales.forEach(function (s) { if (s.ref && s.shift !== sh.no && s.refShift === sh.no) addM(s, -1); });
    var byMethod = byOrder.map(function (id) { return { id: id, name: byM[id].name, amt: r2(byM[id].amt) }; });
    var ex = expensesBetween(sh.openedAt, upto), paidOut = 0, expCash = 0, expOnline = 0;
    ex.forEach(function (e) { if (e.src === 'cash') { expCash += e.amt; paidOut += e.amt; } else expOnline += e.amt; });
    var expected = r2(sh.startCash + cashPay - cashRef - paidOut);
    var actual = opts.actual === undefined || opts.actual === null || opts.actual === '' ? null : r2(opts.actual);
    return {
      no: sh.no, store: STORE, pos: sh.pos || posName(), openedAt: sh.openedAt, openedBy: sh.openedBy || '',
      closedAt: opts.closedAt || null, closedBy: opts.closedBy || '', startCash: r2(sh.startCash),
      cashPayments: r2(cashPay), cashRefunds: r2(cashRef), paidOut: r2(paidOut), expected: expected, actual: actual,
      diff: actual === null ? null : r2(actual - expected),
      excess: actual === null ? null : r2(actual - sh.startCash), cashSales: r2(cashPay - cashRef),
      gross: r2(gross), refunds: r2(refunds), discounts: r2(disc), net: r2(gross - refunds - disc), cash: r2(salesCash), ewallet: r2(ewallet), orders: ss.length,
      expenses: ex, expCash: r2(expCash), expOnline: r2(expOnline), byMethod: byMethod, drinks: drinks, cups: cups, lids: lids, stockUsed: stockUsed
    };
  }
  function close(closedBy, actual, at) {
    var cur = shifts.cur; if (!cur) return null;
    var r = report(cur, { closedAt: at || Date.now(), closedBy: String(closedBy || '').trim(), actual: actual });
    shifts.hist.push(r); shifts.cur = null; rememberUser(r.closedBy); saveShifts(); return r;
  }

  /* One modal for confirms and the refund box (styles: .mdl in app.css). Resolves { ok, stock, reason }.
     o: title, detail, reasons (drop-down list), check (label of a tick box), ok, cancel, danger */
  function modal(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var d = document.createElement('div'), r = o.reasons;
      d.className = 'mdl'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = '<div class="mdl-box"><b class="mdl-t">' + D.esc(o.title || 'Please confirm') + '</b>' +
        (o.detail ? '<p class="mdl-d">' + D.esc(o.detail) + '</p>' : '') +
        (r ? '<label class="mdl-l" for="mdlWhy">Reason</label><select class="field full" id="mdlWhy">' + r.map(function (w) { return '<option>' + D.esc(w) + '</option>'; }).join('') + '</select>' : '') +
        (o.check ? '<label class="mdl-chk"><input id="mdlChk" type="checkbox"> ' + D.esc(o.check) + '</label>' : '') +
        '<div class="mdl-btns"><button id="mdlNo" type="button" class="secondary">' + D.esc(o.cancel || 'Cancel') + '</button>' +
        '<button id="mdlOk" type="button" class="primary' + (o.danger ? ' danger' : '') + '">' + D.esc(o.ok || 'OK') + '</button></div></div>';
      document.body.appendChild(d);
      function done(v) { d.removeEventListener('keydown', key); d.remove(); resolve(v); }
      function yes() { done({ ok: true, stock: !!(o.check && d.querySelector('#mdlChk').checked), reason: r ? d.querySelector('#mdlWhy').value : '' }); }
      function key(e) { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); yes(); } else if (e.key === 'Escape') done({ ok: false, stock: false, reason: '' }); }
      d.querySelector('#mdlOk').onclick = yes;
      d.querySelector('#mdlNo').onclick = function () { done({ ok: false, stock: false, reason: '' }); };
      d.addEventListener('keydown', key);
      (d.querySelector('#mdlWhy') || d.querySelector('#mdlOk')).focus();
    });
  }
  // yes / no question: resolves true or false
  function ask(msg, okLabel, title) { return modal({ title: title || 'Please confirm', detail: msg, ok: okLabel || 'OK', danger: /^Delete/.test(okLabel || '') }).then(function (r) { return r.ok; }); }
  /* Refund box: why, and whether the cups and lids go back in stock. Resolves { ok, stock, reason }. */
  var REFUND_WHY = ['Wrong order', 'Customer changed mind', 'Drink not right', 'Cashier mistake', 'Other'];
  function refundPrompt(o) {
    o = o || {};
    return modal({ title: o.title || 'Refund', detail: o.detail, reasons: REFUND_WHY, check: 'Return cups/lids to stock?', ok: 'Refund', danger: true });
  }

  /* ---------- receipts (p is the printer's line builder) ---------- */
  function sortedKeys(o) { return Object.keys(o).sort(); }
  function reportReceipt(p, r) {
    p.header(r.closedAt ? 'Shift report' : 'Shift report (still open)');
    p.text('Shift number: ' + r.no);
    p.text('Store: ' + r.store);
    p.text('POS: ' + r.pos);
    p.rule();
    p.row('Shift opened', fmtDT(r.openedAt));
    if (r.openedBy) p.text('  By: ' + r.openedBy, { indent: '      ' });
    p.row('Shift closed', r.closedAt ? fmtDT(r.closedAt) : 'not yet');
    if (r.closedAt && r.closedBy) p.text('  By: ' + r.closedBy, { indent: '      ' });
    p.rule(); p.center('Cash drawer'); p.rule();
    p.row('Starting cash', num(r.startCash));
    p.row('Cash payments', num(r.cashPayments));
    p.row('Cash refunds', num(r.cashRefunds));
    p.row('Paid out (expenses)', num(r.paidOut));
    p.row('Expected cash amount', num(r.expected));
    p.row('Actual cash amount', r.actual === null ? '-' : num(r.actual));
    p.row('Difference', r.diff === null ? '-' : (r.diff > 0 ? '+' : '') + num(r.diff), { b: true });
    p.rule(); p.center('Sales summary'); p.rule();
    p.row('Orders', String(r.orders));
    p.row('Gross sales', num(r.gross), { b: true });
    p.row('Refunds', num(r.refunds));
    p.row('Discounts', num(r.discounts));
    p.row('Net sales', num(r.net), { b: true });
    p.row('Cash', num(r.cash));
    p.row('E-wallet', num(r.ewallet));
    if (r.byMethod && r.byMethod.length) {
      p.rule(); p.center('By payment method'); p.rule();
      r.byMethod.forEach(function (m) { p.row(m.name, num(m.amt)); });
    }
    p.rule(); p.center('Expenses'); p.rule();
    if (!r.expenses.length) p.text('No expenses');
    r.expenses.forEach(function (e) {
      p.row(e.cat, num(e.amt));
      p.text('  ' + (e.src === 'online' ? 'Online' : 'Cash') + (e.note ? ' - ' + e.note : ''), { indent: '    ' });
    });
    p.row('Paid in cash', num(r.expCash));
    p.row('Paid online', num(r.expOnline));
    p.row('Total expenses', num(r.expCash + r.expOnline), { b: true });
    p.rule(); p.center('Cups used'); p.rule();
    if (!r.drinks) p.text('No drinks sold');
    sortedKeys(r.cups).forEach(function (k) { p.row(k, String(r.cups[k])); });
    if (r.drinks) p.row('Total cups', String(r.drinks), { b: true });
    p.rule(); p.center('Lids used'); p.rule();
    if (!sortedKeys(r.lids).length) p.text('No lids used');
    sortedKeys(r.lids).forEach(function (k) { p.row(k, String(r.lids[k])); });
    p.rule();
    p.center(fmtDT(r.closedAt || Date.now()));
    p.footer();
  }
  // top part shared by order and sale receipts: logo, shop, address, TIN, employee, POS, order type
  function slipHead(p, o) {
    var r = (window.MBPrinter && window.MBPrinter.state.receipt) || {};
    p.logo();
    p.center(r.shop || STORE, { b: true });
    var c = cafe();
    if (lines(c.address).length) { lines(c.address).forEach(function (l) { p.center(l); }); p.feed(1); }
    if (String(c.tin).trim()) { p.center('TIN #' + String(c.tin).trim()); p.feed(1); }
    if (o.emp) p.text('Employee: ' + o.emp);
    p.text('POS: ' + (o.pos || posName()));
    p.rule('.');
    if (o.q) { p.center('Queue no.'); p.center(String(o.q), { b: true, big: true }); }
    if (o.cust) p.text('Customer: ' + o.cust);
    p.text(typeText(o.type));
    p.rule('.');
  }
  // items: name and line total, then qty x price, then size, add-ons and note
  function slipLines(p, lines) {
    lines.forEach(function (l) {
      var unit = Number(l.price) || 0; (l.addons || []).forEach(function (a) { unit += Number(a.p) || 0; });
      p.row(l.name, num(unit * l.qty));
      p.text(l.qty + ' x \u20b1' + num(unit), { indent: '' });
      if (l.disc) p.row('  ' + (l.dn || 'Discount') + (l.dk === 'pct' && l.dn && !/%/.test(l.dn) ? ' ' + l.dv + '%' : ''), '-' + num(l.disc));
      var extra = []; if (l.opt) extra.push(l.opt); (l.addons || []).forEach(function (a) { extra.push('+ ' + a.n); });
      extra.forEach(function (x) { p.text('  ' + x, { indent: '    ' }); });
      if (l.note) p.text('  Note: ' + l.note, { indent: '    ' });
    });
  }
  // bottom part: contact, thank you lines, date and receipt number
  function slipFoot(p, when, no) {
    p.rule('.');
    var c = cafe();
    if (String(c.phone).trim()) p.center(String(c.phone).trim());
    if (String(c.email).trim()) p.center(String(c.email).trim());
    lines(c.thanks).forEach(function (ln) { p.feed(1); p.center(ln); });
    p.feed(1);
    p.row(when, no || '');
  }
  function saleReceipt(p, s) {
    slipHead(p, { type: s.type, emp: s.emp, pos: s.pos, q: s.q, cust: s.cust });
    slipLines(p, s.lines);
    p.rule('.');
    if (s.disc) { p.row('Subtotal', num(s.gross)); p.row('Discount', '-' + num(s.disc)); }
    p.row('Total', num(s.net), { b: true });
    (s.discs || []).forEach(function (d) { p.text('  ' + d.name + (d.pct ? ' ' + d.pct + '%' : '') + (d.item ? ' (' + d.item + ')' : ''), { indent: '    ' }); });
    (s.ids || []).forEach(function (x) {
      p.text('  ' + (x.type === 'senior' ? 'Senior' : 'PWD') + ': ' + x.name, { indent: '    ' });
      p.text('  ID no: ' + x.id, { indent: '    ' });
    });
    if (s.vat) {
      p.row('VATable sales', num(s.vat.sales));
      p.row('VAT ' + s.vat.pct + '%', num(s.vat.amt));
      if (s.vat.exempt) p.row('VAT-exempt sales', num(s.vat.exempt));
    }
    if (s.pays && s.pays.length) s.pays.forEach(function (x) { p.row(x.name, num(x.amt)); if (x.ref) p.text('  Ref: ' + x.ref, { indent: '    ' }); });
    else if (s.pay === 'ewallet') p.row('E-wallet', num(s.tend));
    if (cashOf(s) > 0 || (!s.pays && s.pay === 'cash')) { p.row('Cash', num(s.tend)); p.row('Change', num(s.change)); }
    if (s.ref) p.center('REFUNDED', { b: true });
    slipFoot(p, fmtDT(s.t), s.rno || '#' + (sales.sales.indexOf(s) + 1));
  }
  // order slip printed before payment, from the POS cart
  function orderReceipt(p, cartLines, o) {
    var cur = shifts.cur, total = 0;
    cartLines.forEach(function (l) { var u = Number(l.price) || 0; (l.addons || []).forEach(function (a) { u += Number(a.p) || 0; }); total += u * l.qty; });
    slipHead(p, { type: o.type, emp: cur ? cur.openedBy : '', pos: cur && cur.pos ? cur.pos : posName(), q: o.q, cust: o.cust });
    slipLines(p, cartLines);
    p.rule('.');
    p.row('Total', num(total), { b: true });
    p.center('Not yet paid');
    slipFoot(p, fmtDT(Date.now()), '');
  }

  window.MBShift = {
    num: num, sg: sg, fmtDT: fmtDT, fmtTime: fmtTime, phDate: phDate, r2: r2, cupName: cupName, lidName: lidName,
    sales: function () { return sales.sales; }, salesOf: salesOf, makeSale: makeSale, cashOf: cashOf, addSale: addSale, refund: refund, deleteSale: deleteSale, deleteShift: deleteShift, renumber: renumber, syncWarning: syncWarning, shortages: shortages, uncounted: uncounted,
    shifts: function () { return shifts; }, saveShifts: saveShifts, index: cachedIndex, day: day, month: month, settleShift: settleShift, current: current, start: start, close: close, report: report, lastActual: lastActual,
    lastStart: lastStart, saveSales: saveSales, posName: posName, setPosName: setPosName, lastUser: lastUser, countedCash: countedCash, expensesBetween: expensesBetween,
    reportReceipt: reportReceipt, saleReceipt: saleReceipt, orderReceipt: orderReceipt, typeText: typeText, cafe: cafe, nextQ: nextQ, refundPrompt: refundPrompt, modal: modal, ask: ask
  };
})();
