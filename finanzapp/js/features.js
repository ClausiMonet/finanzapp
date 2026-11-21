'use strict';
/* Erweiterte Funktionen: Prognosen, Notgroschen, Rückblick, Hinweise, Steuer/Freibetrag,
   Rebalancing, Depot-Verlauf mit Benchmark, gemeinsame Ausgaben */

const endOfMonth = (iso = todayISO()) => { const d = new Date(iso.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoDate(d); };
const addMonthsISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return isoDate(d); };

/* ================= Monatsend-Prognose ================= */
const Forecast = {
  accounts() { return S().accounts.filter(a => a.type === 'giro' && !a.hidden); },
  occurrences(c, from, to) {
    const out = []; if (!c.nextDate) return out; const iv = Analysis.intervalById(c.interval);
    let d = c.nextDate; let guard = 0;
    while (d <= to && guard++ < 60) { if (d > from) out.push(d); d = iv.days < 28 ? addDays(d, iv.days) : addMonthsISO(d, Math.round(iv.days / 30.4)); }
    // überfällig, aber diesen Monat noch nicht gebucht → als offen zählen
    if (!out.length && c.nextDate <= from && c.nextDate >= from.slice(0, 7) + '-01' && !c.manual) {
      const paid = S().transactions.some(t => t.date >= c.nextDate.slice(0, 7) + '-01' && Analysis.payeeKey(t) === (c.key || '').split('|')[1] && Math.abs(Math.abs(t.amount) - c.amount) < c.amount * 0.25 + 1);
      if (!paid && daysBetween(c.nextDate, from) <= 5) out.push(from);
    }
    return out;
  },
  monthEnd() {
    const accs = this.accounts(); if (!accs.length) return null;
    const ids = new Set(accs.map(a => a.id)); const today = todayISO(); const end = endOfMonth(today);
    const balance = accs.reduce((s, a) => s + accountBalance(a), 0);
    const fixed = [], income = [];
    for (const c of Analysis.contracts()) {
      if (!c.active || c.status === 'cancelled') continue;
      if (c.accountId && !ids.has(c.accountId)) continue;
      for (const d of this.occurrences(c, today, end)) fixed.push({ name: c.customName || c.name, date: d, amount: -c.amount });
    }
    for (const c of Analysis.detectContracts(true)) {
      if (!c.active || !ids.has(c.accountId)) continue;
      for (const d of this.occurrences(c, today, end)) income.push({ name: c.name, date: d, amount: c.amount });
    }
    // variable Ausgaben: Durchschnitt der letzten 90 Tage ohne erkannte Verträge und Umbuchungen
    const keys = new Set(Analysis.detectContracts().map(c => c.key)); const from = addDays(today, -90);
    let varSum = 0;
    for (const t of S().transactions) {
      if (!ids.has(t.accountId) || t.date < from || t.date > today || t.amount >= 0) continue;
      if (Analysis.isTransfer(t) || keys.has(t.accountId + '|' + Analysis.payeeKey(t))) continue;
      varSum += -t.amount;
    }
    const firstTx = S().transactions.filter(t => ids.has(t.accountId)).map(t => t.date).sort()[0];
    const span = firstTx ? Math.min(90, Math.max(1, daysBetween(firstTx > from ? firstTx : from, today))) : 90;
    const perDay = varSum / span; const daysLeft = daysBetween(today, end);
    const variable = -perDay * daysLeft;
    const fixSum = fixed.reduce((s, x) => s + x.amount, 0), incSum = income.reduce((s, x) => s + x.amount, 0);
    return { balance, fixed: fixed.sort((a, b) => a.date.localeCompare(b.date)), income, fixSum, incSum, variable, perDay, daysLeft, end, endBalance: balance + fixSum + incSum + variable };
  },
};

/* ================= Notgroschen ================= */
const Emergency = {
  calc() {
    const liquid = S().accounts.filter(a => ['giro', 'tagesgeld', 'bar'].includes(a.type) && !a.hidden).reduce((s, a) => s + Math.max(0, accountBalance(a)), 0);
    const cur = monthKey(todayISO()); const ms = Analysis.lastMonths(6, addMonths(cur, -1)).map(k => Analysis.monthTotals(k).exp).filter(v => v > 0);
    const avgExp = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 0;
    const months = avgExp ? liquid / avgExp : null;
    return { liquid, avgExp, months, target3: avgExp * 3, target6: avgExp * 6, level: months == null ? 'none' : months < 3 ? 'bad' : months <= 6 ? 'ok' : months > 12 ? 'much' : 'good' };
  },
};

/* ================= Vermögensprognose ================= */
const Projection = {
  defaults() {
    const cur = monthKey(todayISO()); const ms = Analysis.lastMonths(3, addMonths(cur, -1)).map(k => Analysis.monthTotals(k));
    const saved = ms.reduce((s, t) => s + Math.max(0, t.saved), 0) / 3; const surplus = ms.reduce((s, t) => s + Math.max(0, t.net), 0) / 3;
    return { start: Math.max(0, Math.round(netWorth())), monthly: Math.round(saved || surplus || 100), ret: 7, years: 30, infl: 2, increase: 0 };
  },
  settings() { const st = S(); if (!st.settings.projection) st.settings.projection = this.defaults(); return st.settings.projection; },
  run(p) {
    const r = p.ret / 100 / 12; let v = +p.start || 0, paid = +p.start || 0, monthly = +p.monthly || 0; const rows = [{ y: 0, v, paid, real: v }];
    for (let y = 1; y <= p.years; y++) {
      for (let m = 0; m < 12; m++) { v = v * (1 + r) + monthly; paid += monthly; }
      monthly *= 1 + (+p.increase || 0) / 100;
      rows.push({ y, v, paid, real: v / Math.pow(1 + p.infl / 100, y) });
    }
    return rows;
  },
  fire(p) {
    const cur = monthKey(todayISO()); const ms = Analysis.lastMonths(6, addMonths(cur, -1)).map(k => Analysis.monthTotals(k).exp).filter(v => v > 0);
    const yearly = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length * 12 : 0; if (!yearly) return null;
    const target = yearly * 25; const rows = this.run({ ...p, years: 60 }); const hit = rows.find(r => r.real >= target);
    return { yearly, target, years: hit ? hit.y : null };
  },
};

/* ================= Monatsrückblick ================= */
const Recap = {
  build(key) {
    const t = Analysis.monthTotals(key); const prev = Analysis.lastMonths(3, addMonths(key, -1)).map(k => Analysis.monthTotals(k)).filter(x => x.inc || x.exp);
    const avgExp = prev.length ? prev.reduce((s, x) => s + x.exp, 0) / prev.length : 0;
    const avgInc = prev.length ? prev.reduce((s, x) => s + x.inc, 0) / prev.length : 0;
    const cats = Analysis.byCategory(key, key); const pc = {}; for (const r of Analysis.byCategory(addMonths(key, -3), addMonths(key, -1))) pc[r.cat.id] = r.value / 3;
    const changes = cats.map(c => ({ cat: c.cat, value: c.value, avg: pc[c.cat.id] || 0, diff: c.value - (pc[c.cat.id] || 0) })).filter(c => prev.length);
    changes.sort((a, b) => b.diff - a.diff);
    const up = changes.filter(c => c.diff > 15).slice(0, 2), down = changes.filter(c => c.diff < -15).sort((a, b) => a.diff - b.diff).slice(0, 2);
    for (const [id, v] of Object.entries(pc)) if (!cats.find(c => c.cat.id === id) && v > 15 && down.length < 2) down.push({ cat: catById(id), value: 0, avg: v, diff: -v });
    const snaps = S().snapshots; const s0 = [...snaps].reverse().find(s => s.date < key + '-01') || snaps.find(s => s.date.startsWith(key)); const s1 = [...snaps].reverse().find(s => s.date <= endOfMonth(key + '-01'));
    const budgets = Object.entries(S().budgets).filter(([, v]) => v > 0).map(([id, lim]) => ({ cat: catById(id), lim, spent: (cats.find(c => c.cat.id === id) || {}).value || 0 }));
    const contracts = Analysis.contracts();
    return {
      key, ...t, avgExp, avgInc, expDiff: avgExp ? (t.exp - avgExp) / avgExp * 100 : null, rate: t.inc ? (t.inc - t.exp) / t.inc * 100 : null,
      top: cats[0], up, down, netChange: s0 && s1 && s0 !== s1 ? s1.net - s0.net : null, netChangePct: s0 && s1 && s0.net ? (s1.net - s0.net) / Math.abs(s0.net) * 100 : null,
      budgetsOk: budgets.filter(b => b.spent <= b.lim), budgetsOver: budgets.filter(b => b.spent > b.lim),
      newContracts: contracts.filter(c => c.firstDate && c.firstDate.startsWith(key) && c.count >= 2), priceUps: contracts.filter(c => c.changeDate && c.changeDate.startsWith(key) && c.priceChange > 0),
      hasData: t.inc > 0 || t.exp > 0,
    };
  },
  lastKey() { return addMonths(monthKey(todayISO()), -1); },
};

/* ================= Kündigungsfristen ================= */
const Notice = {
  /* Aktuelles Vertragsende (verlängert sich automatisch um renewMonths) und Kündigungsdeadline */
  info(c) {
    if (!c.contractEnd) return null;
    let end = c.contractEnd; const renew = +c.renewMonths || 12; const today = todayISO(); let guard = 0;
    while (end < today && guard++ < 50) end = addMonthsISO(end, renew);
    let deadline = addMonthsISO(end, -(+c.noticeMonths || 0)); let missed = false;
    if (deadline < today) { missed = true; end = addMonthsISO(end, renew); deadline = addMonthsISO(end, -(+c.noticeMonths || 0)); } // Frist verpasst → nächste Periode
    return { end, deadline, daysLeft: daysBetween(today, deadline), missed };
  },
};

/* ================= Kapitalerträge & Freistellungsaufträge ================= */
const CapitalIncome = {
  PAUSCHBETRAG: () => +(S().settings.pauschbetrag || 1000),
  /* Erträge eines Jahres je Konto: Zinsen, Dividenden, realisierte Gewinne */
  byAccount(year) {
    const out = {}; const st = S(); const e = id => out[id] || (out[id] = { interest: 0, div: 0, gains: 0 });
    for (const t of st.transactions) {
      if (!t.date.startsWith(year) || t.amount <= 0) continue;
      if (t.categoryId === 'kapitalertrag' || txParts(t).some(p => p.categoryId === 'kapitalertrag')) e(t.accountId).interest += txParts(t).filter(p => p.categoryId === 'kapitalertrag').reduce((s, p) => s + p.amount, 0);
    }
    const byAcc = {}; for (const t of st.trades) (byAcc[t.accountId] || (byAcc[t.accountId] = [])).push(t);
    for (const [acc, list] of Object.entries(byAcc)) {
      list.sort((a, b) => a.date.localeCompare(b.date)); const pos = {};
      for (const t of list) {
        const p = pos[t.ident] || (pos[t.ident] = { sh: 0, cost: 0 });
        if (t.type === 'buy' || t.type === 'in') { p.cost += t.shares * t.price + (t.type === 'buy' ? t.fee || 0 : 0); p.sh += t.shares; }
        else if (t.type === 'sell' || t.type === 'sell_nocash') {
          const avg = p.sh ? p.cost / p.sh : 0;
          if (t.type === 'sell' && t.date.startsWith(year)) e(acc).gains += t.shares * t.price - (t.fee || 0) - avg * t.shares;
          p.sh = Math.max(0, p.sh - t.shares); p.cost = avg * p.sh;
        } else if (t.type === 'div' && t.date.startsWith(year)) e(acc).div += t.amount || 0;
      }
    }
    return out;
  },
  summary(year = String(new Date().getFullYear())) {
    const by = this.byAccount(year); const rows = [];
    for (const a of S().accounts) {
      const x = by[a.id] || { interest: 0, div: 0, gains: 0 }; const total = x.interest + x.div + x.gains;
      if (!total && !a.fsa) continue;
      rows.push({ acc: a, ...x, total, fsa: +a.fsa || 0, over: Math.max(0, total - (+a.fsa || 0)) });
    }
    const fsaSum = rows.reduce((s, r) => s + r.fsa, 0) + S().accounts.filter(a => a.fsa && !rows.find(r => r.acc.id === a.id)).reduce((s, a) => s + +a.fsa, 0);
    const total = rows.reduce((s, r) => s + r.total, 0);
    return { year, rows, total, fsaSum, pausch: this.PAUSCHBETRAG(), overAllocated: fsaSum > this.PAUSCHBETRAG() };
  },
};

/* ================= Steuer ================= */
const Tax = {
  years() { const s = new Set(S().transactions.filter(t => t.tax).map(t => t.date.slice(0, 4))); s.add(String(new Date().getFullYear())); return [...s].sort().reverse(); },
  list(year) { return S().transactions.filter(t => t.tax && t.date.startsWith(year)); },
  csv(year) {
    const rows = [['Datum', 'Empfänger', 'Verwendungszweck', 'Betrag', 'Art', 'Beleg vorhanden', 'Notiz']];
    for (const t of this.list(year)) rows.push([fmtDate(t.date), t.payee, t.purpose, fmtNum(t.amount), TAX_TYPES[t.taxType] || '', t.receipts && t.receipts.length ? 'ja' : 'nein', t.note || '']);
    return '﻿' + rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  },
};

/* ================= Rebalancing ================= */
const Rebalance = {
  rows() {
    const st = S(); const ps = st.positions.filter(p => p.shares > 0); const tg = st.targets || {};
    const total = ps.reduce((s, p) => s + p.shares * (p.lastPrice ?? p.buyPrice ?? 0), 0);
    return { total, rows: ps.map(p => { const v = p.shares * (p.lastPrice ?? p.buyPrice ?? 0); return { p, v, cur: total ? v / total * 100 : 0, target: +tg[p.id] || 0 }; }).sort((a, b) => b.v - a.v) };
  },
  /* Neues Geld so verteilen, dass die Zielgewichte möglichst erreicht werden (ohne Verkäufe) */
  plan(amount, allowSell = false) {
    const { total, rows } = this.rows(); const T = total + amount; const sumT = rows.reduce((s, r) => s + r.target, 0); if (!sumT) return [];
    const res = rows.map(r => ({ ...r, want: T * r.target / sumT, delta: T * r.target / sumT - r.v }));
    if (allowSell) return res.map(r => ({ ...r, trade: r.delta }));
    const need = res.filter(r => r.delta > 0); const needSum = need.reduce((s, r) => s + r.delta, 0); const f = needSum > amount ? amount / needSum : 1;
    return res.map(r => ({ ...r, trade: r.delta > 0 ? r.delta * f : 0 }));
  },
};

/* ================= Depot-Verlauf & Benchmark ================= */
const DepotHistory = {
  cache: {},
  async build(range = '1y') {
    const st = S(); const bm = (st.settings.benchmark || 'EUNL.DE').toUpperCase();
    const ps = st.positions.filter(p => p.symbol && p.shares > 0);
    if (!ps.length) throw new Error('Keine Positionen mit Kurs-Symbol');
    const syms = [...new Set([...ps.map(p => p.symbol), bm])];
    const hist = {}; const ccy = {};
    for (const s of syms) { const k = s + '|' + range; if (!this.cache[k]) { const j = await Prices.call('/history?symbol=' + encodeURIComponent(s) + '&range=' + range); this.cache[k] = j; } hist[s] = this.cache[k].points || []; ccy[s] = this.cache[k].currency || 'EUR'; }
    for (const c of new Set(Object.values(ccy).filter(c => c && c !== 'EUR'))) { const fx = (c === 'GBp' || c === 'GBX' ? 'GBP' : c) + 'EUR=X'; const k = fx + '|' + range; if (!this.cache[k]) this.cache[k] = await Prices.call('/history?symbol=' + fx + '&range=' + range); hist['FX_' + c] = this.cache[k].points || []; }
    const toMap = pts => { const m = new Map(); for (const p of pts) m.set(isoDate(new Date(p.t)), p.c); return m; };
    const maps = {}; for (const [k, v] of Object.entries(hist)) maps[k] = toMap(v);
    const dates = [...maps[bm].keys()].sort(); if (!dates.length) throw new Error('Keine Kursdaten für ' + bm);
    const last = {}; const priceAt = (s, d) => { const v = maps[s].get(d); if (v != null) last[s] = v; return last[s]; };
    const fxAt = (s, d) => { const c = ccy[s]; if (!c || c === 'EUR') return 1; const k = 'FX_' + c; const v = maps[k] && maps[k].get(d); if (v != null) last[k] = v * (c === 'GBp' || c === 'GBX' ? 0.01 : 1); return last[k]; };
    // Ereignisse je Position: importierte Trades, sonst "seit Anfang gehalten"
    const events = []; const start = dates[0];
    for (const p of ps) {
      const tr = st.trades.filter(t => t.accountId === p.accountId && (t.ident === p.ident || t.ident === p.isin) && ['buy', 'sell', 'in', 'sell_nocash'].includes(t.type));
      if (tr.length) {
        let pre = 0; let preCost = 0;
        for (const t of tr) {
          const sg = t.type === 'buy' || t.type === 'in' ? 1 : -1; const cash = t.type === 'buy' ? t.shares * t.price + (t.fee || 0) : t.type === 'sell' ? -(t.shares * t.price - (t.fee || 0)) : 0;
          if (t.date < start) { pre += sg * t.shares; preCost += cash; } else events.push({ d: t.date, s: p.symbol, sh: sg * t.shares, cash });
        }
        if (pre > 0) events.push({ d: start, s: p.symbol, sh: pre, cash: preCost, pre: true });
      } else events.push({ d: start, s: p.symbol, sh: p.shares, cash: p.shares * (p.buyPrice || 0), pre: true });
    }
    events.sort((a, b) => a.d.localeCompare(b.d));
    const held = {}; let invested = 0, bmUnits = 0; let ei = 0; const out = [];
    for (const d of dates) {
      for (const s of syms) priceAt(s, d);
      for (const k of Object.keys(maps).filter(k => k.startsWith('FX_'))) { const v = maps[k].get(d); if (v != null) last[k] = v * (/GBp|GBX/.test(k) ? 0.01 : 1); }
      while (ei < events.length && events[ei].d <= d) {
        const e = events[ei++]; held[e.s] = (held[e.s] || 0) + e.sh; invested += e.cash;
        const bp = last[bm]; if (bp) bmUnits += e.cash / bp;
      }
      let val = 0; let ok = true;
      for (const [s, sh] of Object.entries(held)) { const pr = last[s]; const fx = fxAt(s, d); if (pr == null || fx == null) { ok = false; continue; } val += sh * pr * fx; }
      if (!ok && !out.length) continue;
      out.push({ d, value: val, invested, bench: bmUnits * (last[bm] || 0) });
    }
    return { bm, points: out };
  },
};

/* ================= Gemeinsame Ausgaben ================= */
const Shared = {
  data() { const st = S(); if (!st.shared) st.shared = { people: [], entries: [] }; return st.shared; },
  person(id) { return this.data().people.find(p => p.id === id); },
  balances() {
    const b = {}; for (const p of this.data().people) b[p.id] = 0;
    for (const e of this.data().entries) {
      if (e.type === 'settle') { if (b[e.person] == null) continue; b[e.person] += e.dir === 'toMe' ? -e.amount : e.amount; continue; }
      const n = this.count(e); if (!n) continue; const share = e.amount / n;
      if (e.paidBy === 'me') { for (const p of e.with) if (b[p] != null) b[p] += share; }
      else if (e.includeMe && b[e.paidBy] != null) b[e.paidBy] -= share;
    }
    return b; // > 0: Person schuldet mir, < 0: ich schulde der Person
  },
  count(e) { return e.with.length + (e.includeMe ? 1 : 0) + (e.paidBy !== 'me' ? 1 : 0); }, // Zahler (andere Person) ist immer beteiligt
  myShare(e) { const n = this.count(e); return e.includeMe && n ? e.amount / n : 0; },
};

/* ================= Hinweise ================= */
const Alerts = {
  list() {
    const out = []; const st = S(); const today = todayISO();
    if (!st.accounts.length) return out;
    const fc = Forecast.monthEnd();
    if (fc && fc.endBalance < 0) out.push({ lvl: 'bad', icon: '⚠️', text: `Monatsende-Prognose: Girokonto rutscht voraussichtlich ins Minus (${fmtEUR(fc.endBalance, true)}).`, go: 'planen', key: 'fc-neg' });
    else if (fc && fc.endBalance < 100 && fc.balance > 0) out.push({ lvl: 'warn', icon: '📉', text: `Monatsende wird knapp: voraussichtlich ${fmtEUR(fc.endBalance, true)} übrig.`, go: 'planen', key: 'fc-low' });
    for (const b of Analysis.budgetStatus(monthKey(today))) {
      if (b.spent > b.limit) out.push({ lvl: 'bad', icon: b.cat.icon, text: `Budget „${b.cat.name}“ überschritten (${fmtNum(b.spent / b.limit * 100, 0)} %).`, go: 'planen', key: 'b-' + b.cat.id });
      else if (b.spent > b.limit * 0.85) out.push({ lvl: 'warn', icon: b.cat.icon, text: `Budget „${b.cat.name}“ zu ${fmtNum(b.spent / b.limit * 100, 0)} % verbraucht.`, go: 'planen', key: 'b-' + b.cat.id });
    }
    for (const c of Analysis.contracts()) {
      if (c.status === 'cancelled') continue;
      if (c.priceChange > 0 && c.changeDate && daysBetween(c.changeDate, today) <= 60) out.push({ lvl: 'warn', icon: '💸', text: `Preiserhöhung bei ${c.customName || c.name}: ${fmtSigned(c.priceChange)} pro Zahlung.`, contract: c.key || c.id, key: 'pc-' + (c.key || c.id) });
      const n = Notice.info(c);
      if (n && n.daysLeft >= 0 && n.daysLeft <= 30) out.push({ lvl: n.daysLeft <= 7 ? 'bad' : 'warn', icon: '⏰', text: `Kündigungsfrist ${c.customName || c.name}: noch ${n.daysLeft} Tage (bis ${fmtDate(n.deadline)}), sonst Verlängerung bis ${fmtDate(addMonthsISO(n.end, +c.renewMonths || 12))}.`, contract: c.key || c.id, key: 'nt-' + (c.key || c.id) + n.deadline });
    }
    const em = Emergency.calc();
    if (em.level === 'bad' && em.avgExp > 0) out.push({ lvl: 'warn', icon: '🛟', text: `Notgroschen reicht nur ${fmtNum(em.months, 1)} Monate (empfohlen: 3–6).`, go: 'planen', key: 'em' });
    const ci = CapitalIncome.summary();
    for (const r of ci.rows) if (r.over > 0 && r.fsa >= 0 && r.total > 0) out.push({ lvl: 'warn', icon: '🧾', text: `${r.acc.name}: Kapitalerträge ${PRIV() ? 'über' : fmtEUR(r.total, true) + ' über'} dem Freistellungsauftrag – dort wird Steuer abgezogen.`, go: 'steuer', key: 'fsa-' + r.acc.id });
    if (ci.overAllocated) out.push({ lvl: 'bad', icon: '🧾', text: `Freistellungsaufträge zusammen höher als der Sparerpauschbetrag (${fmtEUR(ci.pausch, true)}).`, go: 'steuer', key: 'fsa-over' });
    const sb = Shared.balances(); for (const [pid, v] of Object.entries(sb)) if (v > 50) out.push({ lvl: 'info', icon: '👥', text: `${Shared.person(pid).name} schuldet dir ${fmtEUR(v)}.`, go: 'teilen', key: 'sh-' + pid });
    const rk = Recap.lastKey(); if (new Date().getDate() <= 10 && st.settings.recapSeen !== rk && Recap.build(rk).hasData) out.push({ lvl: 'good', icon: '📊', text: `Dein Monatsrückblick für ${monthLabel(rk)} ist da.`, go: 'rueckblick', key: 'recap-' + rk });
    return out;
  },
  html(list) {
    return list.map(a => `<div class="alert ${a.lvl === 'info' ? '' : a.lvl}" ${a.go ? `data-go="${a.go}"` : ''}${a.contract ? `data-contract="${esc(a.contract)}"` : ''} style="cursor:pointer"><span>${a.icon}</span><span>${esc(a.text)}</span></div>`).join('');
  },
  /* System-Benachrichtigung (nur wenn die App geöffnet wird – ohne Server gibt es keine Push-Nachrichten) */
  async notify() {
    const st = S(); if (!st.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const today = todayISO(); const sent = st.settings.notified || {}; let n = 0;
    for (const a of this.list().filter(a => a.lvl === 'bad' || a.lvl === 'warn')) {
      if (sent[a.key] && daysBetween(sent[a.key], today) < 3) continue;
      sent[a.key] = today; n++;
      const text = PRIV() ? 'Es gibt einen neuen Hinweis in deiner Finanzapp.' : a.text;
      try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) reg.showNotification('Finanzapp', { body: text, icon: 'icons/icon-192.png', tag: a.key }); else new Notification('Finanzapp', { body: text }); } catch {}
      if (n >= 3) break;
    }
    for (const k of Object.keys(sent)) if (daysBetween(sent[k], today) > 60) delete sent[k];
    st.settings.notified = sent; Store.save();
  },
};

/* ================= Mehr-Linien-Diagramm ================= */
Charts.multi = function (labels, series, { h = 220 } = {}) {
  if (labels.length < 2) return '<div class="empty small">Zu wenige Datenpunkte</div>';
  const W = 640, H = h, L = 52, R = 10, T = 10, B = 24;
  const all = series.flatMap(s => s.values.filter(v => v != null && isFinite(v))); const ticks = this.niceTicks(Math.min(...all), Math.max(...all));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = i => L + (W - L - R) * i / (labels.length - 1); const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const step = Math.max(1, Math.ceil(labels.length / 6));
  let out = ticks.map(t => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${this.short(t)}</text>`).join('');
  for (const s of series) {
    const d = s.values.map((v, i) => v == null ? '' : (i && s.values[i - 1] != null ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  }
  out += labels.map((l, i) => (i % step === 0 || i === labels.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${out}</svg>${this.legend(series.map(s => [s.name, s.color]))}`;
};
