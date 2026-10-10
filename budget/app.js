/* =========================================================================
 * Overtime Money Budget — UI layer (app.js)
 *
 * Renders the budgeting PWA for anyone with irregular income on top of the
 * pure-logic engine (window.BudgetEngine). Plain scripts only — no modules,
 * no fetch, no CDN; works from file://.
 *
 * Architecture mirrors the sibling Overtime Money debt app:
 *   one render() rebuilds #view, a `view` state var picks the tab,
 *   modals for every form, localStorage persistence, demo/full split
 *   via window.BUDGET_FULL, light/dark theme via html[data-theme].
 * ========================================================================= */
(function () {
'use strict';
if (typeof document === 'undefined' || typeof window === 'undefined' || !window.BudgetEngine) return;

var E = window.BudgetEngine;
var FULL = window.BUDGET_FULL === true;
var DEMO_UPGRADE_URL = '#'; /* TODO: replace with the Etsy listing URL for the full version */
var LS_KEY = FULL ? 'omBudget.v1' : 'omBudget.demo.v1';
var CAP = E.capsFor(FULL);
var DEBT_APP_URL = 'https://overtimemoney.github.io/overtime-money/';

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

/* ---------------- icons (original 24x24 stroke paths) ---------------- */
var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
var ICONS = {
  start: SVG_OPEN + '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z"/></svg>',
  home: SVG_OPEN + '<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 9.8V19.5h11V9.8"/><path d="M10.5 19.5v-4.5h3v4.5"/></svg>',
  budget: SVG_OPEN + '<circle cx="12" cy="12" r="8.5"/><path d="M12 12V4"/><path d="M12 12l6.5 6.5"/></svg>',
  spending: SVG_OPEN + '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10.5h17"/><path d="M7 15.5h4"/></svg>',
  bills: SVG_OPEN + '<path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.8 5.2 1.8 5.2H4.7s1.8-1.2 1.8-5.2"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  goals: SVG_OPEN + '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  debts: SVG_OPEN + '<path d="M9.5 14.5a4 4 0 0 0 5.8 0l2.8-2.8a4 4 0 0 0-5.8-5.8l-1.4 1.4"/><path d="M14.5 9.5a4 4 0 0 0-5.8 0l-2.8 2.8a4 4 0 0 0 5.8 5.8l1.4-1.4"/></svg>',
  networth: SVG_OPEN + '<path d="M3.5 17.5l6-6 3.5 3.5 7.5-7.5"/><path d="M15 7.5h5.5V13"/></svg>'
};
var ARROW_DOWN = SVG_OPEN + '<path d="M12 5v13"/><path d="M6.5 12.5L12 18l5.5-5.5"/></svg>';
var ARROW_UP = SVG_OPEN + '<path d="M12 19V6"/><path d="M6.5 11.5L12 6l5.5 5.5"/></svg>';
var TABS = [
  ['start', ICONS.start, 'Start Here'],
  ['dashboard', ICONS.home, 'Home'],
  ['budget', ICONS.budget, 'Budget'],
  ['transactions', ICONS.spending, 'Spending'],
  ['bills', ICONS.bills, 'Bills'],
  ['goals', ICONS.goals, 'Goals'],
  ['debts', ICONS.debts, 'Debts'],
  ['networth', ICONS.networth, 'Net Worth']
];

/* ---------------- state ---------------- */
function normalize(s) {
  var d = E.defaultState(), out = {};
  if (!s || typeof s !== 'object') s = {};
  Object.keys(d).forEach(function (k) {
    out[k] = Array.isArray(s[k]) ? s[k] : d[k];
  });
  out.version = 1;
  return out;
}
function hasData(s) {
  return ['incomes', 'categories', 'transactions', 'bills', 'goals'].some(function (k) {
    return s[k] && s[k].length;
  });
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) { var s = JSON.parse(raw); if (s && typeof s === 'object') return normalize(s); }
  } catch (e) {}
  var s0 = FULL ? E.defaultState() : E.sampleState();
  state = s0; save();
  return s0;
}
var state = load();
/* First run: sample/demo users land on Home; blank full users land on Start Here. */
var view = hasData(state) ? 'dashboard' : 'start';
var viewMonth = E.monthKeyOf(new Date());
var txMonth = viewMonth, txCat = 'all', txType = 'all';

/* ---------------- helpers ---------------- */
function $(sel, el) { return (el || document).querySelector(sel); }
function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function money(n) { return esc(E.fmtMoney(n)); }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) { /* 'YYYY-MM-DD' -> 'Oct 9' */
  var p = String(s || '').split('-');
  if (p.length < 3) return '';
  return MON[+p[1] - 1] + ' ' + (+p[2]);
}
function todayStr() { return E.ymd(new Date()); }
function daysUntil(ymdStr) {
  var d = E.parseYMD(ymdStr);
  if (!d) return null;
  var now = new Date(), sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - sod.getTime()) / 86400000);
}
function catColorIdx(id) {
  for (var i = 0; i < state.categories.length; i++) {
    if (state.categories[i].id === id) return i % 10;
  }
  return 0;
}
function catName(id) {
  for (var i = 0; i < state.categories.length; i++) {
    if (state.categories[i].id === id) return state.categories[i].name;
  }
  return '';
}
/* shared inline style for date/month/select inputs (the design system only
 * styles text/number inputs; this mirrors them). */
var INPUT_STYLE = 'width:100%;background:var(--input-bg);border:2px solid var(--input-border);' +
  'border-radius:14px;padding:13px 14px;font-size:16px;color:var(--text);min-height:48px;' +
  "font-family:'Nunito',sans-serif;";
function fieldVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function checkVal(id) { var el = document.getElementById(id); return !!(el && el.checked); }
function download(filename, content, mime) {
  var blob = new Blob([content], { type: mime || 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
}
function kh(kicker, helper) {
  return '<div class="kicker">' + esc(kicker) + '</div>' +
    (helper ? '<p class="hint">' + esc(helper) + '</p>' : '');
}
function viewHead(title, sub) {
  return '<div class="view-head"><h2>' + esc(title) + '</h2>' +
    (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
}
function monthNav() {
  return '<div class="month-nav">' +
    '<button class="nav-btn" data-mnav="-1" aria-label="Previous month">&#8249;</button>' +
    '<span class="month-label">' + esc(E.monthLabel(viewMonth)) + '</span>' +
    '<button class="nav-btn" data-mnav="1" aria-label="Next month">&#8250;</button>' +
    '<button class="btn ghost small today-btn" id="m-today">This month</button></div>';
}

/* ---------------- modals ---------------- */
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
/* Demo cap hit: names the actual limit so it reads as information, not a scold. */
function upgradeNudge(limitMsg) {
  openModal(
    '<h3>Demo limit</h3><p>' + esc(limitMsg) + '</p>' +
    '<p>The full version removes every limit \u2014 unlimited categories, transactions, bills, goals, and debts.</p>' +
    '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Not now</button>' +
    '<a class="btn primary" href="' + DEMO_UPGRADE_URL + '">Get the full version</a></div>'
  );
  $('#m-cancel').addEventListener('click', closeModal);
}
function capHit(kind, count, limit, noun) {
  if (count >= limit) {
    upgradeNudge('The demo covers up to ' + limit + ' ' + noun + '.');
    return true;
  }
  return false;
}

/* ---------------- chrome ---------------- */
function tabBtn(t) {
  return '<button class="tab' + (view === t[0] ? ' active' : '') + '" data-view="' + t[0] + '">' +
    '<span class="tab-ico">' + t[1] + '</span><span class="tab-label">' + t[2] + '</span></button>';
}
function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
function footerHtml() {
  var s = E.monthSummary(state, viewMonth);
  if (!state.incomes.length && !state.categories.length)
    return 'Add your income and categories to build your budget <span class="dim">\u00B7 on this device</span>';
  return '<strong>' + money(s.net) + '</strong> left in ' + esc(s.label) + ' \u00B7 <strong>' +
    money(s.totalSpent) + '</strong> spent <span class="dim">\u00B7 on this device</span>';
}
function renderChrome() {
  var root = $('#app-root');
  var main = '';
  if (!FULL) {
    main += '<div class="demo-banner">You\u2019re trying the <strong>demo</strong> ' +
      '(3 categories, 20 transactions max). ' +
      '<a href="' + DEMO_UPGRADE_URL + '">Get the full version \u2192</a></div>';
  }
  main += '<header class="app-header"><div class="brand-row"><div class="brand">' +
    '<span class="brand-mark"><img src="logo.png" alt="Overtime Money logo"></span> ' +
    '<span>OVERTIME MONEY</span>' + (FULL ? '' : ' <span class="demo-pill">DEMO</span>') + '</div>' +
    '<button class="theme-toggle" id="theme-toggle" aria-label="Toggle light and dark mode">' + MOON_SVG + SUN_SVG + '</button></div>' +
    '<div class="brand-sub">Budgeting for real life</div></header>';
  main += '<div class="topbar"><button class="theme-toggle" id="theme-toggle-2" aria-label="Toggle light and dark mode">' +
    MOON_SVG + SUN_SVG + '</button>' +
    '<button class="btn primary topbar-cta" id="topbar-add">+ Add</button></div>';
  main += '<main id="view"></main>';
  var side = '<nav class="tabbar"><div class="side-logo"><img src="logo.png" alt="Overtime Money"></div>' +
    '<div class="side-group"><div class="side-label">Getting started</div>' + tabBtn(TABS[0]) + '</div>' +
    '<div class="side-group"><div class="side-label">Your money</div>' + TABS.slice(1).map(tabBtn).join('') + '</div></nav>';
  root.innerHTML = '<div class="main-col">' + main + '</div>' + side +
    '<div class="stickybar"><div class="stickybar-inner">' + footerHtml() + '</div></div>';
  $all('.tab', root).forEach(function (b) {
    b.addEventListener('click', function () { view = b.getAttribute('data-view'); render(); window.scrollTo(0, 0); });
  });
  var tt = document.getElementById('theme-toggle');
  if (tt) tt.addEventListener('click', toggleTheme);
  var tt2 = document.getElementById('theme-toggle-2');
  if (tt2) tt2.addEventListener('click', toggleTheme);
  var addBtn = document.getElementById('topbar-add');
  if (addBtn) addBtn.addEventListener('click', function () { view = 'transactions'; render(); openTxForm(null); });
}

/* ---------------- views ---------------- */

var FAQS = [
  ['My paycheck is different every month. Will this work?',
   'Yes \u2014 that\u2019s the whole point. Add an income entry for every paycheck: base pay, overtime, side gigs, per-diems. The month\u2019s total is what you budget against, and slow months and busy months each get their own numbers.'],
  ['What does \u201ccarry unspent\u201d do?',
   'Tick it on a category like Groceries and any unspent budget rolls into next month\u2019s available amount \u2014 one month deep, so there\u2019s no snowballing slush fund. Fixed bills like rent don\u2019t need it.'],
  ['Is my data private?',
   'Yes. Everything you enter is stored only in this browser on this device (localStorage). Nothing is uploaded, synced, or sent anywhere \u2014 no account, no server. The only way data leaves is in a backup file you export yourself.'],
  ['Do I have to enter every coffee?',
   'Only the spending you want to see. Big, honest totals beat perfect tiny ones \u2014 log the transactions that matter and let the categories tell the story. No judgment either way.']
];

function vStart() {
  var faqs = FAQS.map(function (f) {
    return '<details class="faq"><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>';
  }).join('');
  return '<div class="start-grid">' +
    '<section class="card">' + kh('Welcome', 'A budget that keeps up with real paychecks.') + '<h3>How it works</h3>' +
    '<ol class="steps">' +
    '<li><strong>Add your income</strong> for the month \u2014 base pay plus every extra dollar. Irregular paychecks welcome.</li>' +
    '<li><strong>Give every dollar a job</strong> in budget categories: rent, groceries, fun money. Your spending gets logged against them.</li>' +
    '<li><strong>Watch the month unfold</strong> on Home: what\u2019s spent, what\u2019s left, which bills are coming due, and how your goals are growing.</li>' +
    '</ol>' +
    '<p class="hint">Ten minutes to set up. After that it\u2019s just logging what you spend.</p>' +
    '<div class="btn-row"><button class="btn primary" id="load-sample">Load sample month</button>' +
    '<button class="btn ghost" id="start-blank">Start blank</button></div></section>' +
    '<section class="card card-questions"><div class="kicker">Questions</div><div class="faqs">' + faqs + '</div></section>' +
    '<section class="card">' + kh('Your data', 'It stays on this device \u2014 back it up any time.') +
    '<div class="btn-row"><button class="btn ghost" id="export-backup">Export backup</button>' +
    '<button class="btn ghost" id="import-backup">Import backup</button></div>' +
    '<input type="file" id="import-file" accept="application/json" hidden>' +
    '<div class="btn-row"><button class="btn ghost" id="export-csv">Export transactions CSV</button>' +
    '<button class="btn danger-ghost" id="reset-data">' + (FULL ? 'Reset all data' : 'Reset demo data') + '</button></div>' +
    '<p class="disclaimer">Everything you enter lives only in this browser on this device. Nothing is uploaded or synced. ' +
    'Overtime Money Budget is a planning tool, not financial advice.</p></section></div>';
}

/* ---- dashboard ---- */
function statCard(label, value, sub, cls, goto) {
  return '<div class="stat-card' + (cls ? ' ' + cls : '') + '"' + (goto ? ' data-goto="' + goto + '" role="link" tabindex="0"' : '') + '><div class="kpi-label">' + esc(label) + '</div>' +
    '<div class="kpi-value">' + value + '</div>' +
    (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
}
/* hand-rolled multi-segment donut: one circle per spending category */
function spendDonut(s) {
  var cats = s.categories.filter(function (c) { return c.spent > 0; });
  var total = s.totalSpent;
  var C = 2 * Math.PI * 54, acc = 0;
  var segs = cats.map(function (c) {
    var f = total > 0 ? c.spent / total : 0;
    var seg = '<circle class="donut-arc ' + c.color + '" cx="60" cy="60" r="54" ' +
      'style="stroke:var(--dc);stroke-linecap:butt" ' +
      'stroke-dasharray="' + (f * C).toFixed(1) + ' ' + C.toFixed(1) + '" ' +
      'stroke-dashoffset="' + (C * (1 - acc)).toFixed(1) + '"/>';
    acc += f;
    return seg;
  }).join('');
  var center =
    '<text class="donut-pct" x="60" y="55" text-anchor="middle" dominant-baseline="central" style="font-size:19px">' +
    esc(E.fmtMoney(total)) + '</text>' +
    '<text x="60" y="76" text-anchor="middle" dominant-baseline="central" style="font-size:11px;fill:var(--muted)">spent</text>';
  var legend = cats.map(function (c) {
    var pct = total > 0 ? Math.round(c.spent / total * 100) : 0;
    return '<div class="legend-row"><span class="cat-dot ' + c.color + '"></span>' +
      '<span class="lg-name" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.name) + '</span>' +
      '<span class="lg-amt">' + money(c.spent) + '</span>' +
      '<span class="lg-pct">' + pct + '%</span></div>';
  }).join('');
  return '<section class="card">' + kh('Where it went', 'Spending by category this month.') +
    (cats.length
      ? '<div class="donut-row"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Spending by category">' +
        '<circle class="donut-track" cx="60" cy="60" r="54"/>' + segs + center + '</svg>' +
        '<div class="donut-side" style="min-width:0"><div class="legend">' + legend + '</div></div></div>'
      : '<p class="dim">No spending logged yet this month. Log your first transaction and the picture fills in here.</p>' +
        '<button class="btn primary" data-goto="transactions">Log spending</button>') +
    '</section>';
}
function billMini(b, st, idx) {
  var due = E.dueDateInMonth(b.dueDay, viewMonth);
  var dueLbl = MON[due.getMonth()] + ' ' + due.getDate();
  var chipCls = st === 'paid' ? 'paid' : st === 'due-soon' ? 'due-soon' : st === 'overdue' ? 'overdue' : '';
  var chipLbl = st === 'paid' ? 'Paid' : st === 'due-soon' ? 'Due soon' : st === 'overdue' ? 'Overdue' : 'Upcoming';
  return '<div class="bill-row' + (st === 'overdue' ? ' is-overdue' : st === 'due-soon' ? ' is-duesoon' : '') + '">' +
    '<div class="bill-main"><div class="bill-name">' + esc(b.name) +
    ' <span class="status-chip ' + chipCls + '">' + chipLbl + '</span>' +
    (b.autopay ? ' <span class="autopay-tag">Autopay</span>' : '') + '</div>' +
    '<div class="bill-sub">Due ' + esc(dueLbl) + '</div></div>' +
    '<div class="bill-amt">' + money(b.amount) + '</div>' +
    '<button class="btn small ghost pay-toggle" data-paybill="' + idx + '">' + (st === 'paid' ? 'Undo' : 'Mark paid') + '</button>' +
    '</div>';
}
function vDashboard() {
  var s = E.monthSummary(state, viewMonth);
  var today = new Date();
  var hero = '<div class="stat-grid">' +
    statCard('Income', money(s.totalIncome),
      s.incomes.length ? s.incomes.length + (s.incomes.length === 1 ? ' source' : ' sources') : 'Add your paychecks',
      '', 'budget') +
    statCard('Spent', money(s.totalSpent),
      s.categories.length ? 'across ' + s.categories.length + (s.categories.length === 1 ? ' category' : ' categories') : 'No categories yet',
      '') +
    statCard('Left', money(s.net),
      s.net >= 0 ? 'Money still working for you.' : 'Over budget \u2014 no shame, just data.',
      s.net >= 0 ? 'good' : 'warn') +
    '</div>';
  var body = monthNav() + hero + spendDonut(s);
  /* bills needing attention */
  var attn = [];
  state.bills.forEach(function (b, i) {
    var st = E.billMonthStatus(b, viewMonth, today);
    if (st === 'due-soon' || st === 'overdue') attn.push({ b: b, st: st, i: i });
  });
  attn.sort(function (a, b) {
    return E.dueDateInMonth(a.b.dueDay, viewMonth) - E.dueDateInMonth(b.b.dueDay, viewMonth);
  });
  if (!state.bills.length) {
    body += '<section class="card">' + kh('Bills', 'Never miss a due date.') +
      '<p class="dim">Add your recurring bills and this spot keeps an eye on what\u2019s coming due.</p>' +
      '<button class="btn primary" data-goto="bills">Add your bills</button></section>';
  } else if (!attn.length) {
    body += '<section class="card">' + kh('Bills', 'Nothing needs you right now.') +
      '<p class="dim">All caught up for ' + esc(s.label) + '. Nice.</p></section>';
  } else {
    body += '<section class="card">' + kh('Bills needing attention', 'Due soon or already past due.') +
      attn.map(function (a) { return billMini(a.b, a.st, a.i); }).join('') + '</section>';
  }
  /* goals mini */
  if (!state.goals.length) {
    body += '<section class="card">' + kh('Goals', 'Give your savings a name.') +
      '<p class="dim">Emergency fund, vacation, a new laptop \u2014 set a target and watch it fill up.</p>' +
      '<button class="btn primary" data-goto="goals">Set a goal</button></section>';
  } else {
    body += '<section class="card">' + kh('Goals', 'Your savings, at a glance.') +
      state.goals.slice(0, 3).map(function (g) {
        var st = E.goalStats(g);
        return '<div class="goal-top"><span class="goal-name">' + esc(g.name) + '</span>' +
          '<span class="goal-amt">' + money(st.saved) + ' / ' + money(st.target) + '</span></div>' +
          '<div class="goal-bar"><div class="goal-fill" style="width:' + Math.min(100, st.pct) + '%"></div></div>';
      }).join('') +
      '<button class="btn ghost" data-goto="goals" style="margin-top:8px">Open Goals</button></section>';
  }
  if (!state.incomes.length && !state.categories.length) {
    body = monthNav() + '<section class="card empty"><p>Your budget is a blank slate. Add your income and a few categories to get started.</p>' +
      '<button class="btn primary" data-goto="budget">Set up your budget</button></section>';
  }
  return body;
}

/* ---- budget tab ---- */
function incomeRows() {
  var list = state.incomes.filter(function (i) { return i.month === viewMonth; });
  if (!list.length) return '<p class="dim">No income added for ' + esc(E.monthLabel(viewMonth)) + ' yet.</p>';
  return list.map(function (inc) {
    var idx = state.incomes.indexOf(inc);
    return '<div class="kv"><span class="k">' + esc(inc.name) + '</span>' +
      '<span class="v">' + money(inc.amount) + '</span>' +
      '<span class="row-actions"><button class="link-btn" data-editinc="' + idx + '">Edit</button>' +
      '<button class="link-btn danger" data-delinc="' + idx + '">Delete</button></span></div>';
  }).join('');
}
function catCard(c) {
  var over = c.spent > c.available;
  var remainTxt = over
    ? '<span class="remain neg">' + money(c.spent - c.available) + ' over</span>'
    : '<span class="remain">' + money(c.remaining) + ' left</span>';
  var left = c.rolloverIn > 0
    ? '<span class="left">+' + money(c.rolloverIn) + ' rolled in</span>'
    : '<span class="left">Budget ' + money(c.budgeted) + '</span>';
  var meta = 'Spent ' + E.fmtMoney(c.spent) + ' of ' + E.fmtMoney(c.available) + ' available' +
    (c.rollover ? ' \u00B7 carries over' : '');
  return '<div class="cat-row ' + c.color + (over ? ' over' : '') + '">' +
    '<div class="cat-top"><span class="cat-name"><span class="cat-dot"></span>' + esc(c.name) + '</span>' +
    '<span class="cat-amt">' + money(c.spent) + ' of ' + money(c.available) + '</span></div>' +
    '<div class="cat-meta">' + esc(meta) + '</div>' +
    '<div class="progress"><div class="progress-fill" style="width:' + c.pct + '%"></div></div>' +
    '<div class="cat-foot">' + left + remainTxt +
    '<span class="row-actions"><button class="link-btn" data-editcat="' + esc(c.id) + '">Edit</button>' +
    '<button class="link-btn danger" data-delcat="' + esc(c.id) + '">Delete</button></span></div></div>';
}
function vBudget() {
  var s = E.monthSummary(state, viewMonth);
  var body = viewHead('Budget', 'Income in, categories out \u2014 one month at a time.') + monthNav();
  body += '<section class="card">' + kh('Income \u2014 ' + s.label, 'Every paycheck counts, base and overtime alike.') +
    incomeRows() +
    '<div class="btn-row"><button class="btn primary" id="add-income">Add income</button>' +
    '<button class="btn ghost" id="copy-income">Copy last month</button></div></section>';
  body += '<div class="sec-title"><h3>Categories</h3></div>';
  if (!s.categories.length) {
    body += '<section class="card empty"><p>No categories yet. Rent, groceries, fun money \u2014 give every dollar a job.</p>' +
      '<button class="btn primary" id="add-category">Add a category</button></section>';
  } else {
    body += s.categories.map(catCard).join('') +
      '<button class="btn primary" id="add-category" style="margin-top:4px">Add a category</button>';
  }
  return body;
}

/* ---- transactions tab ---- */
function vTransactions() {
  var catOpts = '<option value="all">All categories</option>' + state.categories.map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (txCat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
  }).join('');
  var typeOpts = ['all', 'expense', 'income'].map(function (t) {
    var lbl = t === 'all' ? 'All types' : t === 'expense' ? 'Spending' : 'Income';
    return '<option value="' + t + '"' + (txType === t ? ' selected' : '') + '>' + lbl + '</option>';
  }).join('');
  var list = E.filterTx(state.transactions, {
    month: txMonth,
    categoryId: txCat === 'all' ? undefined : txCat,
    type: txType === 'all' ? undefined : txType
  });
  var rows = list.map(function (t) {
    var idx = state.transactions.indexOf(t);
    var isIn = t.type === 'income';
    var ico = isIn
      ? '<span class="tx-ico" style="--dc:#2E9E68;--dc-tint:#DDF2E6">' + ARROW_UP + '</span>'
      : '<span class="tx-ico dc' + catColorIdx(t.categoryId) + '">' + ARROW_DOWN + '</span>';
    var name = t.note || (isIn ? 'Income' : catName(t.categoryId)) || 'Uncategorized';
    var sub = fmtDate(t.date) + (isIn ? '' : ' \u00B7 ' + (catName(t.categoryId) || 'Uncategorized'));
    return '<div class="tx-row">' + ico +
      '<div class="tx-main"><div class="tx-name">' + esc(name) + '</div>' +
      '<div class="tx-sub">' + esc(sub) + '</div></div>' +
      '<div class="tx-amt ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+' : '\u2212') + esc(E.fmtMoney(t.amount)) + '</div>' +
      '<span class="row-actions"><button class="link-btn" data-edittx="' + idx + '">Edit</button>' +
      '<button class="link-btn danger" data-deltx="' + idx + '">Delete</button></span></div>';
  }).join('');
  var net = list.reduce(function (s, t) { return s + (t.type === 'income' ? 1 : -1) * (+t.amount || 0); }, 0);
  return viewHead('Spending', 'Every dollar, logged. No judgment \u2014 just the picture.') +
    '<div class="filter-bar">' +
    '<input type="month" id="f-month" value="' + esc(txMonth) + '" aria-label="Month" style="' + INPUT_STYLE + 'max-width:170px">' +
    '<select id="f-cat" aria-label="Category" style="' + INPUT_STYLE + 'max-width:180px">' + catOpts + '</select>' +
    '<select id="f-type" aria-label="Type" style="' + INPUT_STYLE + 'max-width:140px">' + typeOpts + '</select>' +
    '</div>' +
    '<button class="btn primary" id="add-tx" style="margin-bottom:12px">Add transaction</button>' +
    (list.length
      ? '<section class="card" style="padding-top:4px;padding-bottom:4px">' + rows + '</section>' +
        '<p class="dim" style="margin-top:10px">' + list.length + ' shown \u00B7 ' + money(net) + ' net</p>'
      : '<section class="card empty"><p>Nothing here for ' + esc(E.monthLabel(txMonth)) + ' yet.</p>' +
        '<button class="btn primary" id="add-tx-2">Log your first transaction</button></section>');
}

/* ---- bills tab ---- */
function vBills() {
  var today = new Date();
  var sorted = state.bills.slice().sort(function (a, b) {
    return E.dueDateInMonth(a.dueDay, viewMonth) - E.dueDateInMonth(b.dueDay, viewMonth);
  });
  /* billMini renders the full row; splice in edit/delete actions before its closing tag */
  var rows = sorted.map(function (b) {
    var idx = state.bills.indexOf(b);
    var st = E.billMonthStatus(b, viewMonth, today);
    var h = billMini(b, st, idx);
    return h.slice(0, -6) +
      '<span class="row-actions" style="flex:none"><button class="link-btn" data-editbill="' + idx + '">Edit</button>' +
      '<button class="link-btn danger" data-delbill="' + idx + '">Delete</button></span></div>';
  }).join('');
  return viewHead('Bills', 'Recurring bills, one per line. Paid status is tracked per month.') + monthNav() +
    '<button class="btn primary" id="add-bill" style="margin-bottom:12px">Add a bill</button>' +
    (sorted.length
      ? rows
      : '<section class="card empty"><p>No bills yet. Add rent, electric, phone \u2014 the ones that show up like clockwork.</p>' +
        '<button class="btn primary" id="add-bill-2">Add your first bill</button></section>');
}

/* ---- goals tab ---- */
function goalCard(g) {
  var idx = state.goals.indexOf(g);
  var st = E.goalStats(g);
  var dl = '', pct = Math.min(100, st.pct);
  if (g.deadline) {
    var left = daysUntil(g.deadline);
    var lbl = E.monthLabel(E.monthKeyOf(E.parseYMD(g.deadline)));
    dl = left == null ? '' : left >= 0
      ? 'by ' + lbl + ' \u00B7 ' + left + (left === 1 ? ' day' : ' days') + ' left'
      : 'deadline ' + lbl + ' (passed)';
  }
  var log = (g.log || []).slice(-3).reverse().map(function (e) {
    var amt = +e.amount || 0;
    return '<div class="kv"><span class="k">' + esc(fmtDate(e.date)) + (e.note ? ' \u00B7 ' + esc(e.note) : '') + '</span>' +
      '<span class="v" style="font-size:15px">' + (amt >= 0 ? '+' : '\u2212') + esc(E.fmtMoney(Math.abs(amt))) + '</span></div>';
  }).join('');
  var remain = st.remaining > 0 ? money(st.remaining) + ' to go' : 'Fully funded \u2014 look at you.';
  return '<div class="goal-card">' +
    '<div class="goal-top"><span class="goal-name">' + esc(g.name) + '</span>' +
    '<span class="goal-amt">' + money(st.saved) + ' / ' + money(st.target) + '</span></div>' +
    '<div class="goal-bar"><div class="goal-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="goal-meta"><span><strong>' + esc(remain) + '</strong></span>' +
    (dl ? '<span>' + esc(dl) + '</span>' : '') + '</div>' +
    (log ? '<div style="margin-top:10px">' + log + '</div>' : '') +
    '<div class="btn-row" style="margin-top:12px"><button class="btn small primary" data-contrib="' + esc(g.id) + ':1">Add money</button>' +
    '<button class="btn small ghost" data-contrib="' + esc(g.id) + ':-1">Take out</button></div>' +
    '<div class="row-actions"><button class="link-btn" data-editgoal="' + idx + '">Edit</button>' +
    '<button class="link-btn danger" data-delgoal="' + idx + '">Delete</button></div></div>';
}
function vGoals() {
  return viewHead('Goals', 'Name it, fund it, watch it fill up.') +
    '<button class="btn primary" id="add-goal" style="margin-bottom:12px">Add a goal</button>' +
    (state.goals.length
      ? state.goals.map(goalCard).join('')
      : '<section class="card empty"><p>No goals yet. An emergency fund, a vacation, a new laptop \u2014 give your savings a name and a target.</p>' +
        '<button class="btn primary" id="add-goal-2">Set your first goal</button></section>');
}

/* ---- debts tab (lite snapshot) ---- */
function vDebts() {
  var dt = E.debtTotals(state.debts);
  var rows = state.debts.map(function (d, i) {
    var sub = 'APR ' + (+d.apr || 0) + '% \u00B7 min ' + E.fmtMoney(d.minPay);
    return '<div class="kv"><span class="k">' + esc(d.name) + '<br><span class="dim" style="font-weight:400;font-size:13px">' +
      esc(sub) + '</span></span>' +
      '<span class="v">' + money(d.balance) + '</span>' +
      '<span class="row-actions"><button class="link-btn" data-editdebt="' + i + '">Edit</button>' +
      '<button class="link-btn danger" data-deldebt="' + i + '">Delete</button></span></div>';
  }).join('');
  return viewHead('Debts', 'A light snapshot \u2014 balances, APRs, minimums.') +
    '<section class="card">' + kh('Totals', 'The big picture, in two numbers.') +
    '<div class="kv"><span class="k">Total debt</span><span class="v">' + money(dt.totalBalance) + '</span></div>' +
    '<div class="kv"><span class="k">Total monthly minimums</span><span class="v">' + money(dt.totalMin) + '</span></div></section>' +
    '<section class="card">' + kh('Your debts', 'Keep balances current; minimums feed the plan.') +
    (rows || '<p class="dim">No debts listed.</p>') +
    '<div class="btn-row"><button class="btn primary" id="add-debt">Add a debt</button></div></section>' +
    '<div class="note-card"><strong>Want the full payoff plan?</strong>' +
    'This is just a snapshot. For snowball vs. avalanche, a month-by-month schedule, and your real debt-free date \u2014 ' +
    'use the Overtime Money debt app: <a href="' + DEBT_APP_URL + '">overtimemoney.github.io/overtime-money</a></div>';
}

/* ---- net worth tab ---- */
function alRows(list, kind) {
  if (!list.length) return '<p class="dim">Nothing here yet.</p>';
  return list.map(function (a, i) {
    return '<div class="kv"><span class="k">' + esc(a.name) + '</span>' +
      '<span class="v">' + money(a.value) + '</span>' +
      '<span class="row-actions"><button class="link-btn" data-edit' + kind + '="' + i + '">Edit</button>' +
      '<button class="link-btn danger" data-del' + kind + '="' + i + '">Delete</button></span></div>';
  }).join('');
}
function vNetworth() {
  /* record this month's net worth (idempotent per month) */
  var nw = E.netWorth(state);
  state.snapshots = E.ensureSnapshot(state.snapshots, E.monthKeyOf(new Date()), nw.net);
  save();
  nw = E.netWorth(state);
  var snaps = state.snapshots || [];
  var maxAbs = snaps.reduce(function (m, x) { return Math.max(m, Math.abs(x.netWorth)); }, 0);
  var bars = snaps.map(function (x) {
    var pct = maxAbs > 0 ? Math.abs(x.netWorth) / maxAbs * 100 : 0;
    if (x.netWorth !== 0) pct = Math.max(5, pct);
    return '<div class="hist-bar ' + (x.netWorth >= 0 ? 'pos' : 'neg') + '" style="height:' + pct.toFixed(1) + '%" ' +
      'title="' + esc(E.monthLabel(x.month)) + ': ' + esc(E.fmtMoney(x.netWorth)) + '"></div>';
  }).join('');
  var labels = snaps.map(function (x) {
    return '<span title="' + esc(E.monthLabel(x.month)) + '">' + esc(MON[+x.month.slice(5, 7) - 1]) + '</span>';
  }).join('');
  return viewHead('Net Worth', 'What you own minus what you owe \u2014 tracked monthly.') +
    '<section class="card nw-hero"><div class="kpi-label">Net worth</div>' +
    '<div class="nw-value">' + money(nw.net) + '</div>' +
    '<div class="nw-sub">assets ' + money(nw.assets) + ' \u00B7 owing ' + money(nw.liabilities) + '</div></section>' +
    '<section class="card">' + kh('What you own', 'Checking, savings, investments, the car \u2014 your call.') +
    alRows(state.assets, 'asset') +
    '<div class="kv"><span class="k"><strong>Total assets</strong></span><span class="v">' + money(nw.assets) + '</span></div>' +
    '<div class="btn-row"><button class="btn primary" id="add-asset">Add asset</button></div></section>' +
    '<section class="card">' + kh('What you owe', 'Cards, loans, anything with a balance.') +
    alRows(state.liabilities, 'liab') +
    '<div class="kv"><span class="k"><strong>Total owed</strong></span><span class="v">' + money(nw.liabilities) + '</span></div>' +
    '<div class="btn-row"><button class="btn primary" id="add-liab">Add liability</button></div></section>' +
    '<section class="card">' + kh('History', 'One bar per month, automatically recorded.') +
    (snaps.length
      ? '<div class="hist-row">' + bars + '</div><div class="hist-x">' + labels + '</div>'
      : '<p class="dim">Your first snapshot was recorded just now \u2014 come back next month to see the trend.</p>') +
    '</section>';
}

/* ---------------- forms ---------------- */
function formShell(title, bodyHtml, saveLabel) {
  return '<h3>' + esc(title) + '</h3>' + bodyHtml +
    '<div class="modal-actions"><button class="btn ghost" id="m-cancel">Cancel</button>' +
    '<button class="btn primary" id="m-save">' + esc(saveLabel || 'Save') + '</button></div>';
}
function wireFormCancel() { $('#m-cancel').addEventListener('click', closeModal); }
function infoModal(title, body) {
  openModal('<h3>' + esc(title) + '</h3><p>' + body + '</p>' +
    '<div class="modal-actions"><button class="btn primary" id="m-cancel">OK</button></div>');
  wireFormCancel();
}
function textField(id, label, value, placeholder, numeric) {
  return '<label class="field"><span>' + esc(label) + '</span>' +
    '<input type="text" id="' + id + '" value="' + esc(value == null ? '' : value) + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') +
    (numeric ? ' inputmode="decimal"' : '') + '></label>';
}

function openIncomeForm(idx) {
  var inc = idx == null ? null : state.incomes[idx];
  if (idx == null && capHit('income',
      state.incomes.filter(function (i) { return i.month === viewMonth; }).length,
      CAP.incomes, 'income entries per month')) return;
  openModal(formShell(idx == null ? 'Add income' : 'Edit income',
    '<p class="hint">One entry per paycheck \u2014 base pay, overtime, side gigs, per-diems. It lands in ' +
    esc(E.monthLabel(viewMonth)) + '.</p>' +
    textField('f-name', 'Name', inc && inc.name, 'Base pay') +
    textField('f-amount', 'Amount', inc && inc.amount, '$3,400.00', true)));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var name = fieldVal('f-name').trim() || 'Income';
    var amount = E.parseAmount(fieldVal('f-amount'));
    if (idx == null) {
      state.incomes.push({ id: E.uid('i'), name: name, amount: amount, month: viewMonth });
    } else {
      inc.name = name; inc.amount = amount;
    }
    save(); closeModal(); render();
  });
}

function openCatForm(id) {
  var c = null;
  if (id) { for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) c = state.categories[i]; }
  if (!c && capHit('category', state.categories.length, CAP.categories, 'budget categories')) return;
  openModal(formShell(c ? 'Edit category' : 'Add category',
    textField('f-name', 'Name', c && c.name, 'Groceries') +
    '<div class="form-grid"><div>' + textField('f-budget', 'Monthly budget', c && c.budgeted, '$450.00', true) + '</div>' +
    '<div><label class="check-row" style="margin-top:34px"><input type="checkbox" id="f-rollover"' +
    (c && c.rollover ? ' checked' : '') + '> Carry unspent into next month</label></div></div>' +
    '<p class="hint">Carry-over adds last month\u2019s unspent budget (never below zero) to this month\u2019s available amount \u2014 one month deep.</p>'));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var name = fieldVal('f-name').trim() || 'Category';
    var budgeted = E.parseAmount(fieldVal('f-budget'));
    var rollover = checkVal('f-rollover');
    if (c) { c.name = name; c.budgeted = budgeted; c.rollover = rollover; }
    else {
      state.categories.push({ id: E.uid('c'), name: name, budgeted: budgeted, rollover: rollover });
    }
    save(); closeModal(); render();
  });
}

function openTxForm(idx) {
  var t = idx == null ? null : state.transactions[idx];
  var isIncome = t ? t.type === 'income' : false;
  if (idx == null && capHit('transaction', state.transactions.length, CAP.transactions, 'transactions')) return;
  var catOpts = state.categories.map(function (c) {
    return '<option value="' + esc(c.id) + '"' + (t && t.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
  }).join('');
  openModal(formShell(t ? 'Edit transaction' : 'Add transaction',
    '<div class="form-grid"><div><label class="field"><span>Date</span>' +
    '<input type="date" id="t-date" value="' + esc(t ? t.date : todayStr()) + '" style="' + INPUT_STYLE + '"></label></div>' +
    '<div><label class="field"><span>Type</span><select id="t-type" style="' + INPUT_STYLE + '">' +
    '<option value="expense"' + (!isIncome ? ' selected' : '') + '>Spending</option>' +
    '<option value="income"' + (isIncome ? ' selected' : '') + '>Income</option></select></label></div></div>' +
    '<div id="t-catwrap"><label class="field"><span>Category</span><select id="t-cat" style="' + INPUT_STYLE + '">' +
    catOpts + '</select></label></div>' +
    textField('t-amount', 'Amount', t && t.amount, '$42.00', true) +
    '<label class="field"><span>Note (optional)</span><input type="text" id="t-note" value="' +
    esc(t && t.note) + '" placeholder="Weekly shop"></label>'));
  wireFormCancel();
  var typeSel = document.getElementById('t-type');
  var syncCat = function () {
    var w = document.getElementById('t-catwrap');
    if (w) w.style.display = typeSel.value === 'income' ? 'none' : '';
  };
  typeSel.addEventListener('change', syncCat);
  syncCat();
  $('#m-save').addEventListener('click', function () {
    var type = typeSel.value === 'income' ? 'income' : 'expense';
    var catSel = document.getElementById('t-cat');
    var rec = {
      id: t ? t.id : E.uid('t'),
      date: (document.getElementById('t-date') || {}).value || todayStr(),
      type: type,
      categoryId: type === 'income' ? null : ((catSel && catSel.value) || null),
      amount: E.parseAmount((document.getElementById('t-amount') || {}).value),
      note: ((document.getElementById('t-note') || {}).value || '').trim()
    };
    if (idx == null) {
      state.transactions.push(rec);
      txMonth = String(rec.date).slice(0, 7);
    } else {
      state.transactions[idx] = rec;
    }
    save(); closeModal(); render();
  });
}

function openBillForm(idx) {
  var b = idx == null ? null : state.bills[idx];
  if (idx == null && capHit('bill', state.bills.length, CAP.bills, 'bills')) return;
  openModal(formShell(b ? 'Edit bill' : 'Add bill',
    textField('f-name', 'Name', b && b.name, 'Electric') +
    '<div class="form-grid"><div>' + textField('f-amount', 'Amount', b && b.amount, '$95.00', true) + '</div>' +
    '<div><label class="field"><span>Due day (1\u201331)</span>' +
    '<input type="number" id="f-day" min="1" max="31" value="' + esc(b ? b.dueDay : 1) + '"></label></div></div>' +
    '<label class="check-row"><input type="checkbox" id="f-autopay"' + (b && b.autopay ? ' checked' : '') +
    '> Autopay is on for this one</label>' +
    '<p class="hint">Paid status is tracked per month \u2014 mark it paid and it stays put for that month only.</p>'));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var name = fieldVal('f-name').trim() || 'Bill';
    var amount = E.parseAmount(fieldVal('f-amount'));
    var day = Math.max(1, Math.min(31, Math.round(E.parseAmount(fieldVal('f-day'))) || 1));
    var autopay = checkVal('f-autopay');
    if (b) { b.name = name; b.amount = amount; b.dueDay = day; b.autopay = autopay; }
    else {
      state.bills.push({ id: E.uid('b'), name: name, amount: amount, dueDay: day, autopay: autopay, paidMonths: [] });
    }
    save(); closeModal(); render();
  });
}

function openGoalForm(idx) {
  var g = idx == null ? null : state.goals[idx];
  if (idx == null && capHit('goal', state.goals.length, CAP.goals, 'goals')) return;
  openModal(formShell(g ? 'Edit goal' : 'Add goal',
    textField('f-name', 'Name', g && g.name, 'Emergency fund') +
    '<div class="form-grid"><div>' + textField('f-target', 'Target', g && g.target, '$3,000.00', true) + '</div>' +
    '<div><label class="field"><span>Deadline (optional)</span>' +
    '<input type="date" id="f-deadline" value="' + esc(g && g.deadline) + '" style="' + INPUT_STYLE + '"></label></div></div>'));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var name = fieldVal('f-name').trim() || 'Goal';
    var target = E.parseAmount(fieldVal('f-target'));
    var deadline = fieldVal('f-deadline') || null;
    if (g) { g.name = name; g.target = target; g.deadline = deadline; }
    else {
      state.goals.push({ id: E.uid('g'), name: name, target: target, deadline: deadline, saved: 0, log: [] });
    }
    save(); closeModal(); render();
  });
}

function openContribForm(goalId, dir) {
  var gi = -1;
  for (var i = 0; i < state.goals.length; i++) if (state.goals[i].id === goalId) gi = i;
  if (gi < 0) return;
  var g = state.goals[gi], adding = dir > 0;
  openModal(formShell(adding ? 'Add money' : 'Take out',
    '<p class="hint">' + esc(g.name) + ' \u2014 ' + money(E.goalStats(g).saved) + ' saved so far.</p>' +
    textField('f-amount', 'Amount', '', adding ? '$250.00' : '$50.00', true) +
    '<label class="field"><span>Note (optional)</span><input type="text" id="f-note" placeholder="' +
    esc(adding ? 'Bonus' : 'Covered a bill') + '"></label>',
    adding ? 'Add it' : 'Take it out'));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var amount = E.parseAmount(fieldVal('f-amount'));
    if (!(amount > 0)) { infoModal('Enter an amount', 'Type an amount above zero so the goal knows what changed.'); return; }
    var res = E.addContribution(g, dir * amount, fieldVal('f-note').trim(), todayStr());
    state.goals[gi] = res.goal;
    save(); closeModal(); render();
  });
}

function openDebtForm(idx) {
  var d = idx == null ? null : state.debts[idx];
  if (idx == null && capHit('debt', state.debts.length, CAP.debts, 'debts')) return;
  openModal(formShell(d ? 'Edit debt' : 'Add debt',
    textField('f-name', 'Name', d && d.name, 'Travel card') +
    '<div class="form-grid"><div>' + textField('f-balance', 'Balance', d && d.balance, '$2,400.00', true) + '</div>' +
    '<div>' + textField('f-apr', 'APR %', d && d.apr, '24.99', true) + '</div></div>' +
    textField('f-minpay', 'Minimum payment', d && d.minPay, '$60.00', true) +
    '<p class="hint">A light snapshot \u2014 the full payoff plan lives in the Overtime Money debt app.</p>'));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var rec = {
      id: d ? d.id : E.uid('d'),
      name: fieldVal('f-name').trim() || 'Debt',
      balance: E.parseAmount(fieldVal('f-balance')),
      apr: E.parseAmount(fieldVal('f-apr')),
      minPay: E.parseAmount(fieldVal('f-minpay'))
    };
    if (idx == null) {
      state.debts.push(rec);
    } else {
      state.debts[idx] = rec;
    }
    save(); closeModal(); render();
  });
}

function openAssetForm(kind, idx) { /* kind: 'asset' | 'liab' */
  var list = kind === 'asset' ? state.assets : state.liabilities;
  var a = idx == null ? null : list[idx];
  openModal(formShell((a ? 'Edit ' : 'Add ') + (kind === 'asset' ? 'asset' : 'liability'),
    textField('f-name', 'Name', a && a.name, kind === 'asset' ? 'Checking' : 'Travel card') +
    textField('f-value', 'Value', a && a.value, '$2,350.00', true)));
  wireFormCancel();
  $('#m-save').addEventListener('click', function () {
    var rec = { id: a ? a.id : E.uid(kind === 'asset' ? 'a' : 'l'),
                name: fieldVal('f-name').trim() || (kind === 'asset' ? 'Asset' : 'Liability'),
                value: E.parseAmount(fieldVal('f-value')) };
    if (idx == null) list.push(rec); else list[idx] = rec;
    save(); closeModal(); render();
  });
}

/* ---------------- data actions ---------------- */
function buildExport() {
  return {
    _readme: 'Overtime Money Budget backup \u2014 restore via Start Here \u2192 Import backup.',
    app: 'Overtime Money Budget',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    state: state
  };
}
function stateFromBackup(o) {
  if (!o || typeof o !== 'object') return null;
  var p = (o.state && typeof o.state === 'object') ? o.state : o;
  if (typeof p.version !== 'number') return null;
  var keys = ['incomes', 'categories', 'transactions', 'bills', 'goals', 'debts', 'assets', 'liabilities'];
  for (var i = 0; i < keys.length; i++) { if (!Array.isArray(p[keys[i]])) return null; }
  if (!Array.isArray(p.snapshots)) p.snapshots = [];
  return normalize(p);
}
function loadSample() {
  var go = function () {
    state = E.sampleState(); save();
    view = 'dashboard'; viewMonth = E.monthKeyOf(new Date()); txMonth = viewMonth; render();
  };
  if (hasData(state)) {
    confirmModal('Load sample month?',
      'This replaces everything currently in the app with a sample month so you can explore. Your current data will be gone.',
      'Load sample', go);
  } else go();
}
function startBlank() {
  var go = function () {
    state = E.defaultState(); save();
    view = 'start'; viewMonth = E.monthKeyOf(new Date()); txMonth = viewMonth; render();
  };
  if (hasData(state)) {
    confirmModal('Start blank?',
      'This clears everything currently in the app and starts you from an empty budget.',
      'Start blank', go);
  } else go();
}
function resetData() {
  confirmModal(FULL ? 'Reset all data?' : 'Reset demo data?',
    FULL ? 'This clears your entire budget on this device \u2014 income, categories, transactions, bills, goals, everything.'
         : 'This restores the demo\u2019s sample month, wiping anything you\u2019ve changed.',
    FULL ? 'Clear everything' : 'Reset demo',
    function () {
      state = FULL ? E.defaultState() : E.sampleState(); save();
      view = hasData(state) ? 'dashboard' : 'start';
      viewMonth = E.monthKeyOf(new Date()); txMonth = viewMonth; render();
    });
}

/* ---------------- render + events ---------------- */
function render() {
  renderChrome();
  var el = $('#view');
  var html =
    view === 'dashboard' ? vDashboard() :
    view === 'budget' ? vBudget() :
    view === 'transactions' ? vTransactions() :
    view === 'bills' ? vBills() :
    view === 'goals' ? vGoals() :
    view === 'debts' ? vDebts() :
    view === 'networth' ? vNetworth() :
    vStart();
  el.innerHTML = html;
  wire(el);
  $all('[data-goto]', el).forEach(function (b) {
    b.addEventListener('click', function () { view = b.getAttribute('data-goto'); render(); window.scrollTo(0, 0); });
    if (b.getAttribute('role') === 'link') {
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
      });
    }
  });
}

function wire(el) {
  /* month navigation */
  $all('[data-mnav]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      viewMonth = E.addMK(viewMonth, +b.getAttribute('data-mnav'));
      render();
    });
  });
  var mt = $('#m-today', el);
  if (mt) mt.addEventListener('click', function () { viewMonth = E.monthKeyOf(new Date()); render(); });

  /* budget: income */
  var ai = $('#add-income', el);
  if (ai) ai.addEventListener('click', function () { openIncomeForm(null); });
  var ci = $('#copy-income', el);
  if (ci) ci.addEventListener('click', function () {
    var prev = E.addMK(viewMonth, -1);
    var src = state.incomes.filter(function (i) { return i.month === prev; });
    if (!src.length) {
      infoModal('Nothing to copy', 'There\u2019s no income recorded for ' + E.monthLabel(prev) + ' yet.');
      return;
    }
    src.forEach(function (i) {
      state.incomes.push({ id: E.uid('i'), name: i.name, amount: i.amount, month: viewMonth });
    });
    save(); render();
  });
  $all('[data-editinc]', el).forEach(function (b) {
    b.addEventListener('click', function () { openIncomeForm(+b.getAttribute('data-editinc')); });
  });
  $all('[data-delinc]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-delinc'), inc = state.incomes[i];
      if (!inc) return;
      confirmModal('Delete income?', 'Remove the <strong>' + esc(inc.name) + '</strong> entry (' +
        money(inc.amount) + ')?', 'Delete', function () { state.incomes.splice(i, 1); save(); render(); });
    });
  });

  /* budget: categories */
  $all('#add-category', el).forEach(function (b) {
    b.addEventListener('click', function () { openCatForm(null); });
  });
  $all('[data-editcat]', el).forEach(function (b) {
    b.addEventListener('click', function () { openCatForm(b.getAttribute('data-editcat')); });
  });
  $all('[data-delcat]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-delcat'), ci2 = -1, cn = '';
      for (var i = 0; i < state.categories.length; i++) {
        if (state.categories[i].id === id) { ci2 = i; cn = state.categories[i].name; }
      }
      if (ci2 < 0) return;
      confirmModal('Delete category?', 'Remove <strong>' + esc(cn) + '</strong>? ' +
        'Its past transactions stay, but they\u2019ll show as Uncategorized.', 'Delete',
        function () { state.categories.splice(ci2, 1); save(); render(); });
    });
  });

  /* transactions */
  var fm = $('#f-month', el);
  if (fm) fm.addEventListener('change', function () { txMonth = fm.value || E.monthKeyOf(new Date()); render(); });
  var fc = $('#f-cat', el);
  if (fc) fc.addEventListener('change', function () { txCat = fc.value; render(); });
  var ft = $('#f-type', el);
  if (ft) ft.addEventListener('change', function () { txType = ft.value; render(); });
  $all('#add-tx,#add-tx-2', el).forEach(function (b) {
    b.addEventListener('click', function () { openTxForm(null); });
  });
  $all('[data-edittx]', el).forEach(function (b) {
    b.addEventListener('click', function () { openTxForm(+b.getAttribute('data-edittx')); });
  });
  $all('[data-deltx]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-deltx'), t = state.transactions[i];
      if (!t) return;
      confirmModal('Delete transaction?', 'Remove this ' + money(t.amount) + ' ' + t.type +
        (t.note ? ' (' + esc(t.note) + ')' : '') + '?', 'Delete',
        function () { state.transactions.splice(i, 1); save(); render(); });
    });
  });

  /* bills */
  $all('#add-bill,#add-bill-2', el).forEach(function (b) {
    b.addEventListener('click', function () { openBillForm(null); });
  });
  $all('[data-paybill]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-paybill');
      if (!state.bills[i]) return;
      state.bills[i] = E.toggleBillPaid(state.bills[i], viewMonth);
      save(); render();
    });
  });
  $all('[data-editbill]', el).forEach(function (b) {
    b.addEventListener('click', function () { openBillForm(+b.getAttribute('data-editbill')); });
  });
  $all('[data-delbill]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-delbill'), bl = state.bills[i];
      if (!bl) return;
      confirmModal('Delete bill?', 'Remove <strong>' + esc(bl.name) + '</strong> (' + money(bl.amount) + ')?',
        'Delete', function () { state.bills.splice(i, 1); save(); render(); });
    });
  });

  /* goals */
  $all('#add-goal,#add-goal-2', el).forEach(function (b) {
    b.addEventListener('click', function () { openGoalForm(null); });
  });
  $all('[data-contrib]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var parts = b.getAttribute('data-contrib').split(':');
      openContribForm(parts[0], +parts[1]);
    });
  });
  $all('[data-editgoal]', el).forEach(function (b) {
    b.addEventListener('click', function () { openGoalForm(+b.getAttribute('data-editgoal')); });
  });
  $all('[data-delgoal]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-delgoal'), g = state.goals[i];
      if (!g) return;
      confirmModal('Delete goal?', 'Remove <strong>' + esc(g.name) + '</strong> and its contribution history?',
        'Delete', function () { state.goals.splice(i, 1); save(); render(); });
    });
  });

  /* debts */
  var ad = $('#add-debt', el);
  if (ad) ad.addEventListener('click', function () { openDebtForm(null); });
  $all('[data-editdebt]', el).forEach(function (b) {
    b.addEventListener('click', function () { openDebtForm(+b.getAttribute('data-editdebt')); });
  });
  $all('[data-deldebt]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-deldebt'), d = state.debts[i];
      if (!d) return;
      confirmModal('Delete debt?', 'Remove <strong>' + esc(d.name) + '</strong> (' + money(d.balance) + ')?',
        'Delete', function () { state.debts.splice(i, 1); save(); render(); });
    });
  });

  /* net worth: assets + liabilities */
  var aa = $('#add-asset', el);
  if (aa) aa.addEventListener('click', function () { openAssetForm('asset', null); });
  var al = $('#add-liab', el);
  if (al) al.addEventListener('click', function () { openAssetForm('liab', null); });
  $all('[data-editasset]', el).forEach(function (b) {
    b.addEventListener('click', function () { openAssetForm('asset', +b.getAttribute('data-editasset')); });
  });
  $all('[data-delasset]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-delasset'), a = state.assets[i];
      if (!a) return;
      confirmModal('Delete asset?', 'Remove <strong>' + esc(a.name) + '</strong> (' + money(a.value) + ')?',
        'Delete', function () { state.assets.splice(i, 1); save(); render(); });
    });
  });
  $all('[data-editliab]', el).forEach(function (b) {
    b.addEventListener('click', function () { openAssetForm('liab', +b.getAttribute('data-editliab')); });
  });
  $all('[data-delliab]', el).forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.getAttribute('data-delliab'), l = state.liabilities[i];
      if (!l) return;
      confirmModal('Delete liability?', 'Remove <strong>' + esc(l.name) + '</strong> (' + money(l.value) + ')?',
        'Delete', function () { state.liabilities.splice(i, 1); save(); render(); });
    });
  });

  /* start here: data buttons */
  var ls = $('#load-sample', el);
  if (ls) ls.addEventListener('click', loadSample);
  var sb = $('#start-blank', el);
  if (sb) sb.addEventListener('click', startBlank);
  var ex = $('#export-backup', el);
  if (ex) ex.addEventListener('click', function () {
    var dt = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    download('overtime-money-budget-backup-' + dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate()) + '.json',
      JSON.stringify(buildExport(), null, 2), 'application/json');
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
          var s = stateFromBackup(JSON.parse(rd.result));
          if (!s) throw new Error('bad file');
          state = s; save();
          view = hasData(state) ? 'dashboard' : 'start';
          viewMonth = E.monthKeyOf(new Date()); txMonth = viewMonth; render();
        } catch (e) {
          infoModal('Import failed', 'That file isn\u2019t a valid Overtime Money Budget backup.');
        }
      };
      rd.readAsText(f);
      fi.value = '';
    });
  }
  var ec = $('#export-csv', el);
  if (ec) ec.addEventListener('click', function () {
    download('overtime-money-budget-transactions.csv', E.transactionsCSV(state), 'text/csv');
  });
  var rd2 = $('#reset-data', el);
  if (rd2) rd2.addEventListener('click', resetData);
}

document.addEventListener('DOMContentLoaded', function () {
  applyTheme(currentTheme()); render();
  /* hide the status pill while scrolling down; bring it back on scroll up */
  var lastY = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    var bar = document.querySelector('.stickybar');
    if (bar) {
      if (y > lastY && y > 140) bar.classList.add('hide');
      else if (y < lastY) bar.classList.remove('hide');
    }
    var tabs = document.querySelector('.tabbar');
    if (tabs) tabs.classList.toggle('compact', y > 160 && window.innerWidth < 900);
    lastY = y;
  }, { passive: true });
});

})();
