/* Overtime Money Budget — engine (pure logic, no DOM).
 * UMD: module.exports for node tests, window.BudgetEngine in the browser.
 * All money math rounds to cents with r2(). Dates are local-time.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.BudgetEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* ---------------- tiny utils ---------------- */
function r2(n) { return Math.round((+n || 0) * 100) / 100; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
var _uid = 0;
function uid(prefix) {
  _uid++;
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + _uid.toString(36) +
    Math.floor(Math.random() * 1296).toString(36);
}
/* Accepts "1,234.56", "$1,234.56", " 45 " -> 1234.56 / 45. NaN-safe -> 0. */
function parseAmount(str) {
  if (typeof str === 'number') return r2(str);
  var s = String(str == null ? '' : str).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : r2(n);
}
function fmtMoney(n) {
  var v = r2(n);
  var neg = v < 0;
  var parts = Math.abs(v).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + parts[0] + '.' + parts[1];
}

/* ---------------- dates / months ---------------- */
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function mk(y, m) { return y + '-' + pad2(m); }                 /* m: 1-12 */
function parseMK(key) { var p = String(key).split('-'); return { y: +p[0], m: +p[1] }; }
function monthKeyOf(d) { return mk(d.getFullYear(), d.getMonth() + 1); }
function monthLabel(key) { var p = parseMK(key); return MONTHS[p.m - 1] + ' ' + p.y; }
function addMK(key, n) {
  var p = parseMK(key);
  var t = (p.y * 12 + (p.m - 1)) + n;
  return mk(Math.floor(t / 12), (t % 12) + 1);
}
function dimOf(y, m) { return new Date(y, m, 0).getDate(); }    /* m: 1-12 */
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseYMD(s) {
  var p = String(s || '').split('-');
  if (p.length !== 3) return null;
  var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
  return isNaN(d.getTime()) ? null : d;
}

/* Next occurrence of a monthly due-day on/after `from` (a Date).
 * dueDay 31 in February -> last day of February. Never invents a date. */
function nextDueDate(dueDay, from) {
  var dd = Math.max(1, Math.min(31, Math.round(+dueDay || 1)));
  var sod = startOfDay(from);
  var y = sod.getFullYear(), m = sod.getMonth() + 1;
  var cand = new Date(y, m - 1, Math.min(dd, dimOf(y, m)));
  if (cand < sod) {
    m++; if (m > 12) { m = 1; y++; }
    cand = new Date(y, m - 1, Math.min(dd, dimOf(y, m)));
  }
  return cand;
}
/* Due date of a bill inside a specific month key (clamped to month length). */
function dueDateInMonth(dueDay, mkey) {
  var p = parseMK(mkey);
  var dd = Math.max(1, Math.min(31, Math.round(+dueDay || 1)));
  return new Date(p.y, p.m - 1, Math.min(dd, dimOf(p.y, p.m)));
}

/* ---------------- state ---------------- */
function defaultState() {
  return {
    version: 1,
    userName: '',     /* what we call you in greetings */
    incomes: [],       /* {id, name, amount, month:'YYYY-MM'} */
    categories: [],    /* {id, name, budgeted, rollover:bool} */
    transactions: [],  /* {id, date:'YYYY-MM-DD', type:'income'|'expense', categoryId|null, amount, note} */
    bills: [],         /* {id, name, amount, dueDay:1-31, autopay:bool, paidMonths:['YYYY-MM']} */
    goals: [],         /* {id, name, target, deadline:'YYYY-MM-DD'|null, saved, log:[{id,date,amount,note}]} */
    debts: [],         /* lite snapshot {id, name, balance, apr, minPay} */
    assets: [],        /* {id, name, value} */
    liabilities: [],   /* {id, name, value} */
    snapshots: []      /* {month:'YYYY-MM', netWorth} auto-stored */
  };
}

/* Realistic first-run sample so the app never opens as a wall of emptiness.
 * Built around the current month so dates always make sense. */
function sampleState() {
  var now = new Date();
  var cur = monthKeyOf(now);
  var d1 = cur + '-03', d2 = cur + '-09', d3 = cur + '-14', d4 = cur + '-18';
  var cats = [
    { id: 'c-rent', name: 'Rent', budgeted: 1650, rollover: false },
    { id: 'c-groc', name: 'Groceries', budgeted: 450, rollover: true },
    { id: 'c-trans', name: 'Transport', budgeted: 220, rollover: true },
    { id: 'c-fun', name: 'Fun money', budgeted: 180, rollover: true }
  ];
  return {
    version: 1,
    incomes: [
      { id: 'i-base', name: 'Base pay', amount: 3400, month: cur },
      { id: 'i-ot', name: 'Overtime', amount: 810, month: cur }
    ],
    categories: cats,
    transactions: [
      { id: 't-1', date: d1, type: 'expense', categoryId: 'c-rent', amount: 1650, note: 'Rent' },
      { id: 't-2', date: d2, type: 'expense', categoryId: 'c-groc', amount: 132.40, note: 'Weekly shop' },
      { id: 't-3', date: d3, type: 'expense', categoryId: 'c-trans', amount: 60, note: 'Gas' },
      { id: 't-4', date: d4, type: 'expense', categoryId: 'c-groc', amount: 88.15, note: 'Weekly shop' },
      { id: 't-5', date: d2, type: 'expense', categoryId: 'c-fun', amount: 42, note: 'Takeout with friends' }
    ],
    bills: [
      { id: 'b-rent', name: 'Rent', amount: 1650, dueDay: 1, autopay: false, paidMonths: [cur] },
      { id: 'b-elec', name: 'Electric', amount: 95, dueDay: 15, autopay: true, paidMonths: [] },
      { id: 'b-phone', name: 'Phone', amount: 65, dueDay: 22, autopay: true, paidMonths: [] }
    ],
    goals: [
      { id: 'g-em', name: 'Emergency fund', target: 3000, deadline: null, saved: 750,
        log: [{ id: 'gl-1', date: d2, amount: 250, note: 'Extra income' }] }
    ],
    debts: [
      { id: 'd-1', name: 'Travel card', balance: 2400, apr: 24.99, minPay: 60 }
    ],
    assets: [
      { id: 'a-1', name: 'Checking', value: 2350 },
      { id: 'a-2', name: 'Emergency fund', value: 750 }
    ],
    liabilities: [
      { id: 'l-1', name: 'Travel card', value: 2400 }
    ],
    snapshots: []
  };
}

/* ---------------- caps (demo vs full) ---------------- */
var CAPS = {
  demo: { categories: 3, transactions: 20, goals: 2, bills: 3, debts: 3, incomes: 6 },
  full: { categories: 30, transactions: Infinity, goals: 20, bills: 40, debts: 10, incomes: 60 }
};
function capsFor(isFull) { return isFull ? CAPS.full : CAPS.demo; }

/* ---------------- budget math ---------------- */
function categorySpent(transactions, categoryId, mkey) {
  var total = 0;
  (transactions || []).forEach(function (t) {
    if (t.type === 'expense' && t.categoryId === categoryId &&
        String(t.date || '').slice(0, 7) === mkey) {
      total += +t.amount || 0;
    }
  });
  return r2(total);
}
/* One month, fully computed. Rollover: when a category has rollover on, any
 * unspent budget (never negative) from the immediately previous month is
 * added to this month's available amount. Only one level deep by design. */
function monthSummary(state, mkey) {
  var prev = addMK(mkey, -1);
  var incomes = (state.incomes || []).filter(function (i) { return i.month === mkey; });
  var totalIncome = r2(incomes.reduce(function (s, i) { return s + (+i.amount || 0); }, 0));
  var cats = (state.categories || []).map(function (c, idx) {
    var budgeted = r2(+c.budgeted || 0);
    var spent = categorySpent(state.transactions, c.id, mkey);
    var rolloverIn = 0;
    if (c.rollover) {
      var prevSpent = categorySpent(state.transactions, c.id, prev);
      rolloverIn = Math.max(0, r2(budgeted - prevSpent));
    }
    var available = r2(budgeted + rolloverIn);
    var remaining = r2(available - spent);
    return {
      id: c.id, name: c.name, color: 'dc' + (idx % 10),
      budgeted: budgeted, rollover: !!c.rollover, rolloverIn: rolloverIn,
      available: available, spent: spent, remaining: remaining,
      pct: available > 0 ? Math.min(100, Math.round(spent / available * 100)) : (spent > 0 ? 100 : 0)
    };
  });
  var totalBudgeted = r2(cats.reduce(function (s, c) { return s + c.budgeted; }, 0));
  var totalSpent = r2(cats.reduce(function (s, c) { return s + c.spent; }, 0));
  var totalRemaining = r2(cats.reduce(function (s, c) { return s + c.remaining; }, 0));
  return {
    month: mkey, label: monthLabel(mkey),
    incomes: incomes, totalIncome: totalIncome,
    categories: cats,
    totalBudgeted: totalBudgeted, totalSpent: totalSpent,
    totalRemaining: totalRemaining,
    net: r2(totalIncome - totalSpent)   /* net savings for the month */
  };
}

/* ---------------- transactions ---------------- */
function filterTx(transactions, f) {
  f = f || {};
  return (transactions || []).filter(function (t) {
    if (f.month && String(t.date || '').slice(0, 7) !== f.month) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    return true;
  }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
}
function escCSV(v) {
  var s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function transactionsCSV(state) {
  var catName = {};
  (state.categories || []).forEach(function (c) { catName[c.id] = c.name; });
  var lines = ['date,type,category,amount,note'];
  filterTx(state.transactions, {}).forEach(function (t) {
    lines.push([t.date, t.type, escCSV(t.type === 'expense' ? (catName[t.categoryId] || '') : ''),
      r2(+t.amount || 0).toFixed(2), escCSV(t.note)].join(','));
  });
  return lines.join('\n');
}

/* ---------------- bills ---------------- */
function billMonthStatus(bill, mkey, today) {
  if ((bill.paidMonths || []).indexOf(mkey) >= 0) return 'paid';
  var due = dueDateInMonth(bill.dueDay, mkey);
  var tk = monthKeyOf(today);
  if (mkey < tk) return 'overdue';
  if (mkey > tk) return 'upcoming';
  var sod = startOfDay(today);
  if (due < sod) return 'overdue';
  var diffDays = Math.round((due.getTime() - sod.getTime()) / 86400000);
  return diffDays <= 7 ? 'due-soon' : 'upcoming';
}
function toggleBillPaid(bill, mkey) {
  var paid = (bill.paidMonths || []).slice();
  var i = paid.indexOf(mkey);
  if (i >= 0) paid.splice(i, 1); else paid.push(mkey);
  paid.sort();
  var out = {}; for (var k in bill) out[k] = bill[k];
  out.paidMonths = paid;
  return out;
}

/* ---------------- goals ---------------- */
function goalStats(goal) {
  var saved = r2(+goal.saved || 0), target = r2(+goal.target || 0);
  var pct = target > 0 ? Math.min(999, Math.round(saved / target * 100)) : 0;
  return { saved: saved, target: target, pct: pct, remaining: r2(target - saved) };
}
function addContribution(goal, amount, note, dateStr) {
  var out = {}; for (var k in goal) out[k] = goal[k];
  out.log = (goal.log || []).slice();
  var entry = { id: uid('gl'), date: dateStr || ymd(new Date()), amount: r2(amount), note: String(note || '') };
  out.log.push(entry);
  out.saved = r2((+goal.saved || 0) + r2(amount));
  return { goal: out, entry: entry };
}

/* ---------------- debts (lite snapshot) ---------------- */
function debtTotals(debts) {
  var d = debts || [];
  return {
    count: d.length,
    totalBalance: r2(d.reduce(function (s, x) { return s + (+x.balance || 0); }, 0)),
    totalMin: r2(d.reduce(function (s, x) { return s + (+x.minPay || 0); }, 0))
  };
}

/* ---------------- net worth ---------------- */
function netWorth(state) {
  var assets = r2((state.assets || []).reduce(function (s, a) { return s + (+a.value || 0); }, 0));
  var liabs = r2((state.liabilities || []).reduce(function (s, l) { return s + (+l.value || 0); }, 0));
  return { assets: assets, liabilities: liabs, net: r2(assets - liabs) };
}
/* Returns a NEW snapshots array with the current month stored (idempotent). */
function ensureSnapshot(snapshots, mkey, net) {
  var snaps = (snapshots || []).slice();
  var found = false;
  for (var i = 0; i < snaps.length; i++) {
    if (snaps[i].month === mkey) { snaps[i] = { month: mkey, netWorth: r2(net) }; found = true; }
  }
  if (!found) snaps.push({ month: mkey, netWorth: r2(net) });
  snaps.sort(function (a, b) { return a.month < b.month ? -1 : 1; });
  return snaps.slice(-24); /* keep two years */
}

return {
  r2: r2, uid: uid, parseAmount: parseAmount, fmtMoney: fmtMoney,
  mk: mk, parseMK: parseMK, monthKeyOf: monthKeyOf, monthLabel: monthLabel,
  addMK: addMK, dimOf: dimOf, ymd: ymd, parseYMD: parseYMD,
  nextDueDate: nextDueDate, dueDateInMonth: dueDateInMonth,
  defaultState: defaultState, sampleState: sampleState,
  CAPS: CAPS, capsFor: capsFor,
  categorySpent: categorySpent, monthSummary: monthSummary,
  filterTx: filterTx, transactionsCSV: transactionsCSV,
  billMonthStatus: billMonthStatus, toggleBillPaid: toggleBillPaid,
  goalStats: goalStats, addContribution: addContribution,
  debtTotals: debtTotals, netWorth: netWorth, ensureSnapshot: ensureSnapshot
};
});
