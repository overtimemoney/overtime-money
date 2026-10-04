/* =========================================================================
 * OVERTIME MONEY — debt payoff calculator for nurses / shift workers
 * Client-side only. No build step, no frameworks, no external requests.
 *
 * PART 1: payoff engine (pure functions, no DOM).
 * Semantics replicate the verified Google Sheets engine EXACTLY, including
 * its per-month ROUND-to-cents (required to reproduce the verified totals):
 *   Each month, per debt (S = start balance):
 *     I = 0 if S<=0 else ROUND(S * apr/12, 2)
 *     focus = unpaid debt with smallest rank (see below); ties in rank are
 *             broken deterministically by input order  <-- FIXES a known
 *             sheet bug where tied ranks split the extra across debts.
 *     power = month's extra + SUM(minPay of debts with S<=0)
 *             (freed minimums of already-paid-off debts roll down)
 *     payment = 0 if S<=0 else MIN(S+I, minPay + (power if focus else 0))
 *             (no cascade: unused power is not passed to the next debt)
 *     end = MAX(0, ROUND(S+I-payment, 2))
 *   Avalanche rank = RANK(apr, descending); Snowball rank = RANK(balance,
 *   ascending). Ranks are fixed from initial inputs; ties share a rank.
 *   Extra: month's override (months 1-12, blank -> default); months 13+
 *   always use the default. 120-month cap. Start = first day of next month.
 * Verified outputs (sample: 8400@24.99/min180, 3200@19.99/min75,
 * 12000@6.9/min210):
 *   flat $200 extra      -> avalanche 46 mo / $6,657.03 ; snowball 48 mo / $7,278.45
 *   overrides 450/100/300-> avalanche 46 mo / $6,394.97 ; snowball 46 mo / $6,835.38
 * ========================================================================= */
(function (root) {
'use strict';

var MAX_MONTHS = 120;
var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];

function toNum(v, fallback) {
  var n = parseFloat(v);
  return (typeof n === 'number' && isFinite(n)) ? n : (fallback || 0);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/* "Aug 2030" style label for payoff month m (1-indexed) given start date. */
function monthLabel(start, m) {
  var idx = start.getMonth() + (m - 1);
  return MONTH_NAMES[idx % 12] + ' ' + (start.getFullYear() + Math.floor(idx / 12));
}

function firstOfNextMonth(today) {
  return new Date(today.getFullYear(), today.getMonth() + 1, 1);
}

function emptyResult(initialTotal) {
  return {
    months: null, debtFreeMonth: null, debtFreeLabel: null,
    totalInterest: 0, totalPaid: 0, initialTotal: initialTotal || 0,
    perDebt: [], schedule: []
  };
}

/* RANK() semantics: 1 + number of strictly-better values (ties share a rank). */
function computeRanks(debts, strategy) {
  var vals = debts.map(function (d) { return strategy === 'avalanche' ? d.apr : d.balance; });
  return vals.map(function (v, i) {
    var r = 1;
    for (var j = 0; j < vals.length; j++) {
      if (j === i) continue;
      if (strategy === 'avalanche') { if (vals[j] > v) r++; }
      else { if (vals[j] < v) r++; }
    }
    return r;
  });
}

function runStrategy(debts, defaultExtra, overrides, strategy, start) {
  var n = debts.length;
  var ranks = computeRanks(debts, strategy);

  var prevEnd = debts.map(function (d) { return d.balance; });
  var payoffMonth = {}; /* debt idx -> month when end balance hit 0 */
  var totalInterest = 0;
  var totalPaid = 0;
  var schedule = [];
  var debtFreeMonth = null;
  var initialTotal = debts.reduce(function (s, d) { return s + d.balance; }, 0);

  /* Display order: strategy order, ties by input order (stable, deterministic). */
  var dispOrder = debts.map(function (d, i) { return i; }).sort(function (a, b) {
    if (ranks[a] !== ranks[b]) return ranks[a] - ranks[b];
    return a - b;
  });

  for (var m = 1; m <= MAX_MONTHS; m++) {
    var hasOverride = !!(overrides && m <= 12 &&
      overrides[m] !== undefined && overrides[m] !== null && overrides[m] !== '');
    var extra = Math.max(0, hasOverride ? toNum(overrides[m]) : toNum(defaultExtra));

    var S = new Array(n), I = new Array(n), P = new Array(n), E = new Array(n);
    var i, d;

    for (i = 0; i < n; i++) {
      d = debts[i];
      S[i] = (m === 1) ? d.balance : prevEnd[i];
      I[i] = (S[i] <= 0) ? 0 : round2(S[i] * (d.apr / 100) / 12);
      totalInterest += I[i];
    }

    /* Focus: smallest rank among unpaid; ties -> smallest input index (the fix). */
    var focusRank = Infinity, focusIdx = -1;
    for (i = 0; i < n; i++) {
      if (S[i] > 0 && ranks[i] < focusRank) { focusRank = ranks[i]; focusIdx = i; }
    }
    for (i = 0; i < n; i++) {
      if (S[i] > 0 && ranks[i] === focusRank && i < focusIdx) focusIdx = i;
    }

    /* Power: extra + freed minimums of debts already at zero this month. */
    var power = extra;
    for (i = 0; i < n; i++) if (S[i] <= 0) power += debts[i].minPay;
    var extraPlanned = power;

    var payments = [];
    var allPaid = true;
    for (i = 0; i < n; i++) {
      d = debts[i];
      var rec = { idx: i, name: d.name, minPaid: 0, extraPaid: 0, endBalance: S[i] };
      if (S[i] > 0) {
        var add = (i === focusIdx) ? power : 0;
        var pay = Math.min(S[i] + I[i], d.minPay + add);
        var minPaid = Math.min(d.minPay, S[i] + I[i]);
        rec.minPaid = minPaid;
        rec.extraPaid = pay - minPaid;
        E[i] = Math.max(0, round2(S[i] + I[i] - pay));
        rec.endBalance = E[i];
        totalPaid += pay;
        if (E[i] === 0 && !(i in payoffMonth)) payoffMonth[i] = m;
      } else {
        E[i] = 0;
      }
      if (E[i] > 0) allPaid = false;
      prevEnd[i] = E[i];
      payments.push(rec);
    }
    /* Reorder payments into deterministic display order for the UI. */
    var orderedPayments = dispOrder.map(function (k) { return payments[k]; });

    var totalLeft = 0, monthInterest = 0;
    for (i = 0; i < n; i++) { totalLeft += E[i]; monthInterest += I[i]; }

    schedule.push({
      month: m,
      label: monthLabel(start, m),
      payments: orderedPayments,
      focusName: focusIdx >= 0 ? debts[focusIdx].name : null,
      extraTarget: (focusIdx >= 0 && power > 0) ? debts[focusIdx].name : null,
      extraPlanned: extraPlanned,
      extraApplied: orderedPayments.reduce(function (s, p) { return s + p.extraPaid; }, 0),
      interest: monthInterest,
      totalLeft: totalLeft
    });

    if (allPaid) { debtFreeMonth = m; break; }
  }

  var perDebt = dispOrder.map(function (k) {
    var pm = (k in payoffMonth) ? payoffMonth[k] : null;
    return { name: debts[k].name, payoffMonth: pm,
             payoffLabel: pm ? monthLabel(start, pm) : null };
  });

  return {
    months: debtFreeMonth,              /* null => beyond 10 years */
    debtFreeMonth: debtFreeMonth,
    debtFreeLabel: debtFreeMonth ? monthLabel(start, debtFreeMonth) : null,
    totalInterest: totalInterest,
    totalPaid: totalPaid,
    initialTotal: initialTotal,
    perDebt: perDebt,
    schedule: schedule
  };
}

/* debts: [{name, balance, apr (annual %), minPay}]
   overrides: {1: n, ..., 12: n}; blank/missing -> defaultExtra. Months 13+ -> default.
   today: Date (default now); start date = first day of next month.            */
function simulate(debts, defaultExtra, overrides, today) {
  var clean = [];
  (debts || []).forEach(function (dd, i) {
    var balance = toNum(dd.balance);
    if (balance > 0) {
      clean.push({
        idx: i,
        name: String(dd.name || ('Debt ' + (i + 1))),
        balance: balance,
        apr: toNum(dd.apr),
        minPay: Math.max(0, toNum(dd.minPay))
      });
    }
  });
  var t = (today instanceof Date) ? today : new Date();
  var start = firstOfNextMonth(t);
  if (!clean.length) {
    var e = emptyResult(0);
    return { avalanche: e, snowball: e, start: start };
  }
  return {
    avalanche: runStrategy(clean, defaultExtra, overrides, 'avalanche', start),
    snowball: runStrategy(clean, defaultExtra, overrides, 'snowball', start),
    start: start
  };
}

var api = { simulate: simulate, MAX_MONTHS: MAX_MONTHS };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  root.OvertimeEngine = api;
}

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* =========================================================================
 * PART 2: UI (browser only).
 * Two shells share this file: index.html sets window.OVERTIME_FULL=false
 * (demo), app-<unguessable>.html sets it true (full/paid version).
 * ========================================================================= */
(function () {
'use strict';
if (typeof document === 'undefined' || typeof window === 'undefined' || !window.OvertimeEngine) return;

var FULL = window.OVERTIME_FULL === true;
var DEMO_UPGRADE_URL = '#'; /* TODO: replace with the Etsy listing URL for the full version */
var LS_KEY = FULL ? 'overtimeMoney.v1' : 'overtimeMoney.demo.v1';
var MAX_DEBTS = FULL ? 10 : 3;

/* ---------------- theme (light default, "Midnight Spectrum" dark) ---------------- */
var THEME_KEY = 'om_theme';
var MOON_SVG = '<svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
var SUN_SVG = '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
function currentTheme() {
  try { var t = localStorage.getItem(THEME_KEY); if (t === 'dark' || t === 'light') return t; } catch (e) {}
  return 'light';
}
function applyTheme(t) {
  if (t !== 'dark') t = 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
}

var SAMPLE = {
  debts: [
    { name: 'Travel card', balance: 8400, apr: 24.99, minPay: 180 },
    { name: 'Scrubs card', balance: 3200, apr: 19.99, minPay: 75 },
    { name: 'Nursing school loan', balance: 12000, apr: 6.9, minPay: 210 }
  ],
  defaultExtra: 200,
  overrides: { 1: 450, 2: 100, 3: 300 }
};

var FAQS = [
  ['What if my paycheck changes month to month?',
   'That\u2019s exactly what this is built for. On the Paychecks tab, set a different extra payment for any of the next 12 months \u2014 overtime month? Enter more. Slow month? Enter less, or leave it blank to use your default. The whole plan recalculates instantly. Months 13 and beyond always use your default.'],
  ['What if I can only pay the minimums?',
   'Set your extra payment to 0. The plan still works \u2014 the Dashboard shows exactly how much longer it takes and how much interest minimums-only costs you versus throwing extra at it.'],
  ['Is my data private?',
   'Yes. Everything you enter is stored only in this browser on this device (localStorage). Nothing is uploaded, synced, or sent anywhere. There is no account and no server.'],
  ['Which strategy tab should I follow?',
   'Pick one and stick with it. Avalanche (highest APR first) usually saves the most interest; Snowball (smallest balance first) gives faster early wins. The Dashboard shows both side by side so you can decide with your own numbers.'],
  ['How is this different from free calculators?',
   'Free calculators assume one fixed extra payment forever and hand you a date. This is a living, month-by-month plan: variable extra payments for irregular income, both strategies compared, and a concrete \u201cput $X toward Y\u201d instruction for every single month.'],
  ['What does \u201cfirepower\u201d mean?',
   'Your extra payment for the month plus the minimum payments freed up from debts you\u2019ve already killed. That combined amount gets aimed at one focus debt each month \u2014 that\u2019s how payoff accelerates over time.'],
  ['What if I have more than ten debts?',
   'Combine your smallest debts into a single entry, or list your ten largest \u2014 the plan barely changes, because the smallest ones are the first to fall anyway.'],
  ['What if my minimum payments change?',
   'Update them on the Debts tab any time. Every schedule, date, and total recalculates immediately.'],
  ['Does it connect to my bank?',
   'No \u2014 and that\u2019s on purpose. No logins, no account aggregation, no bank credentials anywhere near this tool. You type four numbers per debt; it does the math.'],
  ['Is my data sent anywhere, ever?',
   'No. The only way data leaves this browser is if YOU tap \u201cExport backup,\u201d which downloads a file you control. Importing reads a file you choose. Nothing else transmits anything.']
];

var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
var ICONS = {
  dashboard: SVG_OPEN + '<path d="M4.5 14.5a7.5 7.5 0 1 1 15 0"/><path d="M12 14.5l3.5-3.5"/></svg>',
  debts: SVG_OPEN + '<rect x="3.5" y="7.5" width="12.5" height="9.5" rx="2"/><path d="M6.5 5h10.5a2 2 0 0 1 2 2v8.5"/></svg>',
  paychecks: SVG_OPEN + '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  avalanche: SVG_OPEN + '<path d="M3.5 19.5L9.5 9l3.2 4.8 2.6-3.4 5.2 9.1z"/></svg>',
  snowball: SVG_OPEN + '<path d="M12 4v16M5 8l14 8M19 8L5 16"/></svg>',
  start: SVG_OPEN + '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.6 2c-.8.6-1.2 1-1.2 1.9"/><circle cx="12" cy="16.9" r="0.7" fill="currentColor" stroke="none"/></svg>'
};
var BRAND_SVG = '<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.6 9.4c-.6-.9-1.5-1.4-2.6-1.4-1.4 0-2.5.9-2.5 2.1 0 2.8 5 1.4 5 4.3 0 1.2-1.1 2.1-2.5 2.1-1.1 0-2-.5-2.6-1.4"/></svg></span>';
var TABS = [
  ['start', ICONS.start, 'Start Here'],
  ['dashboard', ICONS.dashboard, 'Home'],
  ['debts', ICONS.debts, 'Debts'],
  ['paychecks', ICONS.paychecks, 'Paychecks'],
  ['avalanche', ICONS.avalanche, 'Avalanche'],
  ['snowball', ICONS.snowball, 'Snowball']
];

/* ---------------- state ---------------- */
function blankState() {
  return { debts: [], defaultExtra: '', overrides: {}, strategy: 'avalanche', currentMonth: 1 };
}
function sampleState() {
  return {
    debts: JSON.parse(JSON.stringify(SAMPLE.debts)),
    defaultExtra: SAMPLE.defaultExtra,
    overrides: { 1: 450, 2: 100, 3: 300 },
    strategy: 'avalanche', currentMonth: 1
  };
}
function normalize(s) {
  s.debts = (s.debts || []).filter(function (d) { return d && +d.balance > 0; }).slice(0, MAX_DEBTS);
  s.debts.forEach(function (d) {
    d.name = String(d.name || 'Debt'); d.balance = +d.balance || 0;
    d.apr = Math.max(0, +d.apr || 0); d.minPay = Math.max(0, +d.minPay || 0);
  });
  s.strategy = (s.strategy === 'snowball') ? 'snowball' : 'avalanche';
  s.currentMonth = Math.max(1, parseInt(s.currentMonth, 10) || 1);
  s.overrides = s.overrides || {};
  return s;
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) { var s = JSON.parse(raw); if (s && Array.isArray(s.debts)) return normalize(s); }
  } catch (e) {}
  var s0 = FULL ? blankState() : sampleState();
  state = s0; save();
  return s0;
}
var state = load();
/* First-run lands on Start Here (setup); returning users land on their dashboard. */
var view = (state.debts && state.debts.length) ? 'dashboard' : 'start';
var whatIf = 0; /* hypothetical extra $/mo — playground only, never saved to the plan */

function sim() { return window.OvertimeEngine.simulate(state.debts, state.defaultExtra, state.overrides); }
function primary() { var s = sim(); return state.strategy === 'snowball' ? s.snowball : s.avalanche; }
function extraFor(m) {
  var o = state.overrides;
  var has = o && m <= 12 && o[m] !== undefined && o[m] !== null && o[m] !== '';
  var v = has ? parseFloat(o[m]) : parseFloat(state.defaultExtra);
  return (isFinite(v) && v > 0) ? v : 0;
}
function cappedMonth(r) {
  if (!r.schedule.length) return 1;
  var maxM = r.debtFreeMonth || r.schedule.length;
  return Math.min(Math.max(1, state.currentMonth), maxM);
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function money(n) {
  n = +n || 0;
  var parts = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
  return '<span class="serif-money"><span class="m-cur">$</span>' + parts[0] +
    '<span class="m-cents">.' + parts[1] + '</span></span>';
}
/* pastel debt identity spectrum: deterministic color class by debt index */
function debtColorClass(i) { return 'dc' + (((i % 10) + 10) % 10); }
function debtIdxByName(name) {
  for (var k = 0; k < state.debts.length; k++) if (state.debts[k].name === name) return k;
  return -1;
}
/* kicker label + helper microcopy block */
function kh(kicker, helper) {
  return '<div class="kicker">' + esc(kicker) + '</div>' +
    (helper ? '<p class="tab-helper">' + helper + '</p>' : '');
}
/* thin-track donut progress ring with serif % centered */
function donut(pct) {
  var r = 54, c = 2 * Math.PI * r;
  var p = Math.min(100, Math.max(0, +pct || 0));
  var off = c * (1 - p / 100);
  return '<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="' + p.toFixed(0) +
    ' percent paid off"><circle class="donut-track" cx="60" cy="60" r="' + r + '"/>' +
    '<circle class="donut-arc" cx="60" cy="60" r="' + r + '" stroke-dasharray="' + c.toFixed(1) +
    '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
    '<text class="donut-pct" x="60" y="60" text-anchor="middle" dominant-baseline="central">' +
    p.toFixed(0) + '%</text></svg>';
}
/* sticky footer bar content: orientation at a glance */
function footerHtml() {
  if (!state.debts.length)
    return 'Add your debts to build your plan <span class="dim">\u00B7 on this device</span>';
  var s = sim();
  var av = s.avalanche, sn = s.snowball;
  var saved = Math.max(0, sn.totalInterest - av.totalInterest);
  var df = av.debtFreeLabel || '10+ yrs';
  return '<strong>' + esc(df) + '</strong> \u00B7 debt-free \u00B7 <strong>' + money(saved) +
    '</strong> saved with avalanche <span class="dim">\u00B7 on this device</span>';
}
function $(sel, el) { return (el || document).querySelector(sel); }
function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

function openModal(html) {
  closeModal();
  var root = document.createElement('div');
  root.className = 'modal-root';
  root.innerHTML = '<div class="modal-backdrop"></div><div class="modal" role="dialog">' + html + '</div>';
  root.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.body.appendChild(root);
  var f = root.querySelector('input,button');
  if (f) f.focus();
}
function closeModal() {
  var r = $('.modal-root');
  if (r) r.parentNode.removeChild(r);
}
function confirmModal(title, body, okLabel, onOk) {
  openModal(
    '<h3>' + esc(title) + '</h3><p>' + body + '</p>' +
    '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Cancel</button>' +
    '<button class="btn danger" id="m-ok">' + esc(okLabel) + '</button></div>'
  );
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-ok').addEventListener('click', function () { closeModal(); onOk(); });
}
function upgradeNudge() {
  openModal(
    '<h3>Demo limit</h3><p>The demo covers up to 3 debts. The full version handles up to 10, with no other limits.</p>' +
    '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Not now</button>' +
    '<a class="btn primary" href="' + DEMO_UPGRADE_URL + '">Get the full version</a></div>'
  );
  $('#m-cancel').addEventListener('click', closeModal);
}

/* ---------------- chrome ---------------- */
function renderChrome() {
  var root = $('#app-root');
  var html = '';
  if (!FULL) {
    html += '<div class="demo-banner">You\u2019re trying the <strong>demo</strong> (3 debts max). ' +
      '<a href="' + DEMO_UPGRADE_URL + '">Get the full version \u2192</a></div>';
  }
  html += '<header class="app-header"><div class="brand-row"><div class="brand">' + BRAND_SVG + ' ' +
    '<span>OVERTIME MONEY</span>' + (FULL ? '' : ' <span class="demo-pill">DEMO</span>') + '</div>' +
    '<button class="theme-toggle" id="theme-toggle" aria-label="Toggle light and dark mode">' + MOON_SVG + SUN_SVG + '</button></div>' +
    '<div class="brand-sub">Debt payoff for shift workers</div></header>';
  html += '<main id="view"></main>';
  html += '<nav class="tabbar">' + TABS.map(function (t) {
    return '<button class="tab' + (view === t[0] ? ' active' : '') + '" data-view="' + t[0] + '">' +
      '<span class="tab-ico">' + t[1] + '</span><span class="tab-label">' + t[2] + '</span></button>';
  }).join('') + '</nav>';
  html += '<div class="stickybar"><div class="stickybar-inner">' + footerHtml() + '</div></div>';
  root.innerHTML = html;
  $all('.tab', root).forEach(function (b) {
    b.addEventListener('click', function () { view = b.getAttribute('data-view'); render(); window.scrollTo(0, 0); });
  });
  var tt = document.getElementById('theme-toggle');
  if (tt) tt.addEventListener('click', function () {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
}

/* ---------------- views ---------------- */
function emptyDebtsHtml(msg) {
  return '<section class="card empty"><p>' + esc(msg) + '</p>' +
    '<button class="btn primary" data-goto="debts">Add your debts</button></section>';
}

function whatIfSim() {
  var base = parseFloat(state.defaultExtra) || 0;
  var s = window.OvertimeEngine.simulate(state.debts, base + whatIf, state.overrides);
  return state.strategy === 'snowball' ? s.snowball : s.avalanche;
}
function whatIfResultHtml(r) {
  if (!(whatIf > 0)) return '<p class="dim whatif-hint">Drag the slider \u2014 watch your debt-free date move.</p>';
  var w = whatIfSim();
  var monthsSooner = (r.months != null && w.months != null) ? (r.months - w.months) : null;
  var interestSaved = Math.max(0, r.totalInterest - w.totalInterest);
  var soonerTxt = (monthsSooner != null && monthsSooner > 0)
    ? '<strong>' + monthsSooner + (monthsSooner === 1 ? ' month sooner' : ' months sooner') + '</strong> \u00B7 ' : '';
  return '<p class="whatif-line">Debt-free by <strong>' + esc(w.debtFreeLabel || '10+ years') + '</strong></p>' +
    '<p class="whatif-sub">' + soonerTxt + money(interestSaved) + ' less interest</p>';
}
function vDashboard() {
  var s = sim();
  if (!state.debts.length) return emptyDebtsHtml('Add your debts to see your payoff plan.');
  var r = primary();
  var av = s.avalanche, sn = s.snowball;
  var cm = cappedMonth(r);
  var sched = r.schedule[cm - 1];
  var ex = extraFor(cm);

  var initial = r.initialTotal;
  var remainingBefore = cm === 1 ? initial : r.schedule[cm - 2].totalLeft;
  var paid = Math.max(0, initial - remainingBefore);
  var pct = initial > 0 ? Math.min(100, (paid / initial) * 100) : 0;

  var saved = sn.totalInterest - av.totalInterest;
  var monthsFaster = (sn.months != null && av.months != null) ? (sn.months - av.months) : null;
  var fasterTxt = monthsFaster == null ? 'timeline varies'
    : monthsFaster > 0 ? monthsFaster + (monthsFaster === 1 ? ' month faster' : ' months faster')
    : monthsFaster === 0 ? 'same timeline' : 'snowball is faster here';

  var dfLabel = r.debtFreeLabel || 'Beyond 10 years';
  var maxM = r.debtFreeMonth || r.schedule.length;

  var oneThing;
  if (sched && sched.extraTarget && ex > 0) {
    oneThing =
    '<section class="card onething">' +
      '<div class="kicker">Your next move</div>' +
      '<p class="onething-line">Put your ' + money(ex) + ' extra toward ' + esc(sched.extraTarget) + '.</p>' +
      '<p class="onething-sub">Month ' + cm + ' \u00B7 ' + esc(sched.label) +
        ' \u2014 then tap \u2713 Payments made.</p>' +
      '<div class="month-nav">' +
        '<button class="btn small onething-ghost" id="m-back" ' + (cm <= 1 ? 'disabled' : '') + '>\u2190 Back</button>' +
        '<span class="month-ind">Month ' + cm + (maxM ? ' of ' + maxM : '') + '</span>' +
        '<button class="btn small onething-solid" id="m-fwd" ' + (cm >= maxM ? 'disabled' : '') + '>\u2713 Payments made</button>' +
      '</div>' +
    '</section>';
  } else {
    oneThing =
    '<section class="card onething">' +
      '<div class="kicker">Your next move</div>' +
      '<p class="onething-line">Add an extra payment to accelerate.</p>' +
      '<p class="onething-sub">Even a little extra each month moves your debt-free date closer.</p>' +
      '<button class="btn small onething-solid" data-goto="paychecks">Set it on Paychecks</button>' +
    '</section>';
  }

  return oneThing +
  '<section class="card herowash">' +
    kh('Total debt', 'Your whole payoff at a glance \u2014 toggle strategies to compare.') +
    '<div class="hero-total">' + money(initial) + '</div>' +
    '<div class="seg" role="tablist">' +
      '<button class="' + (state.strategy === 'avalanche' ? 'on' : '') + '" data-strategy="avalanche">Avalanche</button>' +
      '<button class="' + (state.strategy === 'snowball' ? 'on' : '') + '" data-strategy="snowball">Snowball</button>' +
    '</div>' +
    '<div class="donut-row">' + donut(pct) +
      '<div class="donut-side">' +
        '<div><span class="kpi-label">Debt-free</span><span class="kpi-value">' + esc(dfLabel) + '</span></div>' +
        '<div><span class="kpi-label">Total interest</span><span class="kpi-value">' + money(r.totalInterest) + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="progress"><div class="progress-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
    '<div class="progress-label">' + money(paid) + ' of ' + money(initial) + ' paid off (projected) \u00B7 ' + pct.toFixed(0) + '%</div>' +
  '</section>' +
  '<section class="card whatif">' +
    '<div class="kicker">Play with it</div>' +
    '<h3>What if you found extra each month?</h3>' +
    '<div class="whatif-row">' +
      '<input type="range" id="whatif-slider" min="0" max="500" step="10" value="' + whatIf + '" aria-label="Hypothetical extra dollars per month"' +
      ' style="background:linear-gradient(90deg, var(--accent) ' + (whatIf / 5) + '%, var(--accent-soft) ' + (whatIf / 5) + '%);">' +
      '<div class="whatif-amt" id="whatif-amt">+$' + whatIf + '/mo</div>' +
    '</div>' +
    '<div id="whatif-result">' + whatIfResultHtml(r) + '</div>' +
  '</section>' +
  '<section class="card">' +
    '<div class="kicker">Strategy showdown</div>' +
    '<h3>Avalanche vs Snowball</h3>' +
    '<div class="compare">' +
      '<div><span>Avalanche</span><strong>' + money(av.totalInterest) + '</strong><em>' + esc(av.debtFreeLabel || '10+ yrs') + '</em></div>' +
      '<div><span>Snowball</span><strong>' + money(sn.totalInterest) + '</strong><em>' + esc(sn.debtFreeLabel || '10+ yrs') + '</em></div>' +
    '</div>' +
    '<p class="compare-note">Avalanche saves <strong class="coral">' + money(Math.max(0, saved)) +
    '</strong> in interest \u00B7 <strong>' + esc(fasterTxt) + '</strong></p>' +
    '<button class="btn ghost" id="switch-strategy">Follow the ' +
      (state.strategy === 'avalanche' ? 'snowball' : 'avalanche') + ' plan instead</button>' +
  '</section>';
}

function vDebts() {
  var cards = state.debts.map(function (d, i) {
    return '<div class="debt-card"><span class="debt-dot ' + debtColorClass(i) + '"></span><div class="debt-main">' +
      '<strong>' + esc(d.name) + '</strong>' +
      '<span class="debt-nums">' + money(d.balance) + ' \u00B7 ' + (+d.apr).toFixed(2) + '% APR \u00B7 ' +
      money(d.minPay) + '/mo min</span></div>' +
      '<div class="debt-actions"><button class="btn small ghost" data-edit="' + i + '">Edit</button>' +
      '<button class="btn small danger-ghost" data-del="' + i + '">Delete</button></div></div>';
  }).join('');
  return '<section class="card">' + kh('Your debts', 'List what you owe. No judgment \u2014 this is the starting line, not a report card.') +
    '<div class="card-head"><h3>My Debts (' + state.debts.length + '/' + MAX_DEBTS + ')</h3></div>' +
    (cards || '<p class="dim">No debts yet. Add your first one below.</p>') +
    '<button class="btn primary block" id="add-debt">+ Add debt</button>' +
    '<p class="hint">List every debt: nickname, balance, APR, minimum payment. The light fields are yours to edit.</p></section>';
}

function debtFormHtml(d, idx) {
  d = d || { name: '', balance: '', apr: '', minPay: '' };
  return '<h3>' + (idx == null ? 'Add debt' : 'Edit debt') + '</h3>' +
    '<label class="field"><span>Nickname</span><input id="f-name" maxlength="40" value="' + esc(d.name) + '" placeholder="e.g. Travel card"></label>' +
    '<label class="field"><span>Balance ($)</span><input id="f-balance" type="number" inputmode="decimal" min="0" step="any" value="' + esc(d.balance) + '"></label>' +
    '<label class="field"><span>APR (% per year)</span><input id="f-apr" type="number" inputmode="decimal" min="0" step="any" value="' + esc(d.apr) + '"></label>' +
    '<label class="field"><span>Minimum payment ($/mo)</span><input id="f-minpay" type="number" inputmode="decimal" min="0" step="any" value="' + esc(d.minPay) + '"></label>' +
    '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Cancel</button>' +
    '<button class="btn primary" id="m-save">Save</button></div>';
}
function openDebtForm(idx) {
  if (idx == null && state.debts.length >= MAX_DEBTS) { upgradeNudge(); return; }
  openModal(debtFormHtml(idx == null ? null : state.debts[idx], idx));
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-save').addEventListener('click', function () {
    var d = {
      name: $('#f-name').value.trim() || ('Debt ' + (state.debts.length + 1)),
      balance: parseFloat($('#f-balance').value),
      apr: parseFloat($('#f-apr').value),
      minPay: parseFloat($('#f-minpay').value)
    };
    if (!(d.balance > 0)) { $('#f-balance').focus(); return; }
    if (!(d.apr >= 0)) d.apr = 0;
    if (!(d.minPay >= 0)) d.minPay = 0;
    if (idx == null) state.debts.push(d); else state.debts[idx] = d;
    save(); closeModal(); render();
  });
}

var PAY_HINTS = { 1: 'overtime month?', 2: 'slow month?' };
function vPaychecks() {
  var rows = '';
  for (var m = 1; m <= 12; m++) {
    var v = state.overrides[m];
    rows += '<div class="pay-row"><span class="pay-month">Month ' + m + '</span>' +
      '<input type="number" inputmode="decimal" min="0" step="any" data-override="' + m + '"' +
      ' value="' + esc(v == null ? '' : v) + '" placeholder="default">' +
      '<span class="pay-hint">' + esc(PAY_HINTS[m] || '') + '</span></div>';
  }
  return '<section class="card">' + kh('Your paychecks', 'Paychecks change. Your plan keeps up \u2014 set each month as it comes.') + '<h3>My Paychecks</h3>' +
    '<label class="field"><span>Default extra payment per month ($)</span>' +
    '<input id="default-extra" type="number" inputmode="decimal" min="0" step="any" value="' +
    esc(state.defaultExtra) + '" placeholder="e.g. 200"></label>' +
    '<h4>Monthly overrides</h4>' + rows +
    '<p class="hint">Leave a month blank to use the default. <strong>Months 13 and beyond always use the default.</strong> ' +
    'Overtime month? Enter a bigger number. Slow month? Enter less.</p></section>';
}

function vSchedule(strategy) {
  var s = sim();
  var r = strategy === 'snowball' ? s.snowball : s.avalanche;
  var title = strategy === 'snowball' ? 'Snowball Plan' : 'Avalanche Plan';
  var sub = strategy === 'snowball' ? 'Smallest balance first' : 'Highest APR first';
  if (!state.debts.length) return emptyDebtsHtml('Add your debts to see the ' + title.toLowerCase() + '.');

  var usedIdx = {};
  var chips = r.perDebt.map(function (p) {
    var di = debtIdxByName(p.name);
    var cls = di >= 0 ? debtColorClass(di) : '';
    if (di >= 0) usedIdx[di] = 1;
    return '<div class="chip ' + cls + '">' +
      (cls ? '<span class="debt-dot ' + cls + '"></span>' : '') +
      '<strong>' + esc(p.name) + '</strong><span>' +
      (p.payoffLabel ? 'debt-free ' + esc(p.payoffLabel) : 'beyond 10 years') + '</span></div>';
  }).join('');

  var months = r.schedule.map(function (sc, i) {
    var rows = sc.payments.map(function (p) {
      var tot = p.minPaid + p.extraPaid;
      if (tot <= 0 && p.endBalance <= 0) return '';
      var pcls = debtColorClass(p.idx);
      return '<div class="sched-row"><span class="sched-name"><span class="debt-dot ' + pcls + '"></span>' + esc(p.name) + '</span>' +
        '<span class="sched-vals">paid ' + money(tot) + ' \u00B7 left ' + money(p.endBalance) + '</span></div>';
    }).join('');
    var tgt = sc.extraTarget && sc.extraApplied > 0
      ? '<div class="sched-foot">\uD83C\uDFAF Extra \u2192 <strong>' + esc(sc.extraTarget) + '</strong> (' + money(sc.extraApplied) + ')</div>'
      : '';
    return '<details class="sched-month"' + (i === 0 ? ' open' : '') + '>' +
      '<summary><strong>Month ' + sc.month + ' \u00B7 ' + esc(sc.label) + '</strong>' +
      '<span>' + money(sc.totalLeft) + ' left</span></summary>' +
      '<div class="sched-body">' + rows + tgt +
      '<div class="sched-foot dim">Interest this month: ' + money(sc.interest) + '</div></div></details>';
  }).join('');

  var kick = strategy === 'snowball'
    ? kh('Snowball plan', 'Smallest balance first. Quick wins that build momentum.')
    : kh('Avalanche plan', 'Highest APR first. Mathematically the cheapest way out.');
  return '<section class="card">' + kick + '<h3>' + title + '</h3><p class="dim">' + sub + ' \u00B7 ' +
    (r.debtFreeLabel ? 'debt-free ' + esc(r.debtFreeLabel) : 'beyond 10 years') + ' \u00B7 ' +
    money(r.totalInterest) + ' total interest</p><div class="chips">' + chips + '</div></section>' +
    '<section class="card"><div class="kicker">Month by month</div>' + months + '</section>';
}

function vStart() {
  var faqs = FAQS.map(function (f) {
    return '<details class="faq"><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>';
  }).join('');
  return '<section class="card">' + kh('Start here', 'Three steps, ten minutes, one plan.') + '<h3>3 steps</h3>' +
    '<ol class="steps">' +
    '<li><strong>List your debts</strong> on the Debts tab: nickname, balance, APR, minimum payment.</li>' +
    '<li><strong>Tell it about your paychecks</strong> on the Paychecks tab: your default extra payment, plus a different number for overtime or slow months.</li>' +
    '<li><strong>Follow the plan</strong> on the Dashboard, Avalanche, or Snowball tab \u2014 it tells you exactly what to pay each debt, every month.</li>' +
    '</ol>' +
    '<p class="hint">The light fields are yours to edit. Everything else calculates itself.</p></section>' +
    '<section class="card"><div class="kicker">Questions</div>' + faqs + '</section>' +
    '<section class="card">' + kh('Your data', 'It lives on this device \u2014 back it up any time.') +
    '<div class="btn-row"><button class="btn ghost" id="export-backup">Export backup</button>' +
    '<button class="btn ghost" id="import-backup">Import backup</button></div>' +
    '<input type="file" id="import-file" accept="application/json" hidden>' +
    '<div class="btn-row"><button class="btn ghost" id="start-over">Start over</button>' +
    (FULL ? '<button class="btn ghost" id="load-sample">Load sample data</button>'
          : '<button class="btn ghost" id="reset-demo">Reset demo data</button>') + '</div>' +
    '<p class="disclaimer">Overtime Money is a planning tool, not financial advice. ' +
    'Your data never leaves this device except in a backup file you export yourself.</p></section>';
}

/* ---------------- render + events ---------------- */
function render() {
  renderChrome();
  var el = $('#view');
  var html =
    view === 'dashboard' ? vDashboard() :
    view === 'debts' ? vDebts() :
    view === 'paychecks' ? vPaychecks() :
    view === 'avalanche' ? vSchedule('avalanche') :
    view === 'snowball' ? vSchedule('snowball') :
    vStart();
  el.innerHTML = html;
  wire(el);
  $all('[data-goto]', el).forEach(function (b) {
    b.addEventListener('click', function () { view = b.getAttribute('data-goto'); render(); window.scrollTo(0, 0); });
  });
}

function wire(el) {
  /* dashboard */
  $all('[data-strategy]', el).forEach(function (b) {
    b.addEventListener('click', function () { state.strategy = b.getAttribute('data-strategy'); save(); render(); });
  });
  var sw = $('#switch-strategy', el);
  if (sw) sw.addEventListener('click', function () {
    state.strategy = state.strategy === 'avalanche' ? 'snowball' : 'avalanche'; save(); render();
  });
  /* what-if slider: live readout, no full re-render while dragging */
  var wi = $('#whatif-slider', el);
  if (wi) wi.addEventListener('input', function () {
    whatIf = parseInt(wi.value, 10) || 0;
    var pct = whatIf / 5;
    wi.style.background = 'linear-gradient(90deg, var(--accent) ' + pct + '%, var(--accent-soft) ' + pct + '%)';
    var amt = $('#whatif-amt'); if (amt) amt.textContent = '+$' + whatIf + '/mo';
    var res = $('#whatif-result'); if (res) res.innerHTML = whatIfResultHtml(primary());
  });
  var back = $('#m-back', el), fwd = $('#m-fwd', el);
  if (back) back.addEventListener('click', function () {
    state.currentMonth = Math.max(1, state.currentMonth - 1); save(); render();
  });
  if (fwd) fwd.addEventListener('click', function () {
    var r = primary(), maxM = r.debtFreeMonth || r.schedule.length;
    state.currentMonth = Math.min(maxM, state.currentMonth + 1); save(); render();
  });
  /* debts */
  var add = $('#add-debt', el);
  if (add) add.addEventListener('click', function () { openDebtForm(null); });
  $all('[data-edit]', el).forEach(function (b) {
    b.addEventListener('click', function () { openDebtForm(+b.getAttribute('data-edit')); });
  });
  $all('[data-del]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-del');
      confirmModal('Delete debt?', 'Remove <strong>' + esc(state.debts[i].name) + '</strong>? The whole plan recalculates.', 'Delete', function () {
        state.debts.splice(i, 1); save(); render();
      });
    });
  });
  /* paychecks */
  var de = $('#default-extra', el);
  if (de) de.addEventListener('change', function () {
    var v = parseFloat(de.value);
    state.defaultExtra = (isFinite(v) && v >= 0) ? v : '';
    save(); render();
  });
  $all('[data-override]', el).forEach(function (inp) {
    inp.addEventListener('change', function () {
      var m = inp.getAttribute('data-override');
      var v = parseFloat(inp.value);
      if (inp.value.trim() === '' || !isFinite(v) || v < 0) delete state.overrides[m];
      else state.overrides[m] = v;
      save(); render();
    });
  });
  /* start here: data buttons */
  var ex = $('#export-backup', el);
  if (ex) ex.addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'overtime-money-backup.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 500);
  });
  var im = $('#import-backup', el), fi = $('#import-file', el);
  if (im && fi) {
    im.addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function () {
      var f = fi.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var s = JSON.parse(rd.result);
          if (!s || !Array.isArray(s.debts)) throw new Error('bad file');
          state = normalize(s); save(); render();
        } catch (e) { confirmModal('Import failed', 'That file isn\u2019t a valid Overtime Money backup.', 'OK', function () {}); }
      };
      rd.readAsText(f);
      fi.value = '';
    });
  }
  var so = $('#start-over', el);
  if (so) so.addEventListener('click', function () {
    confirmModal('Start over?', 'This clears all debts, paychecks, and progress on this device. ' +
      (FULL ? '' : 'Use \u201cReset demo data\u201d to restore the sample instead.'), 'Clear everything', function () {
      state = FULL ? blankState() : sampleState(); save(); render();
    });
  });
  var ls = $('#load-sample', el);
  if (ls) ls.addEventListener('click', function () {
    state = sampleState(); save(); render();
  });
  var rd2 = $('#reset-demo', el);
  if (rd2) rd2.addEventListener('click', function () {
    state = sampleState(); save(); render();
  });
}

document.addEventListener('DOMContentLoaded', function () { applyTheme(currentTheme()); render(); });

})();

