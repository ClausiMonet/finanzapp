'use strict';
/* Auswertungen: Monatssummen, Kategorien, Budgets, Vertragserkennung */
const Analysis = {
  isTransfer(t) { const c = catById(t.categoryId); return c && c.type === 'transfer'; },

  monthTotals(key, accountFilter) {
    let inc = 0, exp = 0, saved = 0;
    for (const t of S().transactions) {
      if (!t.date.startsWith(key)) continue;
      if (accountFilter && t.accountId !== accountFilter) continue;
      const acc = accById(t.accountId); if (acc && acc.excludeStats) continue;
      for (const p of txParts(t)) {
        const c = catById(p.categoryId);
        if (c.type === 'transfer') { if (c.id === 'sparen') saved += -p.amount; continue; }
        if (p.amount > 0) inc += p.amount; else exp += -p.amount;
      }
    }
    return { inc, exp, saved, net: inc - exp };
  },

  byCategory(fromKey, toKey, sign = -1) {
    const m = {};
    for (const t of S().transactions) {
      const k = monthKey(t.date); if (k < fromKey || k > toKey) continue;
      const acc = accById(t.accountId); if (acc && acc.excludeStats) continue;
      for (const p of txParts(t)) {
        const c = catById(p.categoryId);
        if (c.type === 'transfer') continue;
        if (sign < 0 && c.type === 'income') continue;
        if (sign > 0 && c.type !== 'income') continue;
        m[c.id] = (m[c.id] || 0) + (sign < 0 ? -p.amount : p.amount);
      }
    }
    return Object.entries(m).filter(([, v]) => v > 0.005).map(([id, v]) => ({ cat: catById(id), value: v })).sort((a, b) => b.value - a.value);
  },

  byTag(fromKey, toKey) {
    const m = {};
    for (const t of S().transactions) {
      const k = monthKey(t.date); if (k < fromKey || k > toKey || !t.tags || !t.tags.length) continue;
      for (const tag of t.tags) { const e = m[tag] || (m[tag] = { tag, out: 0, inc: 0, n: 0 }); if (t.amount < 0) e.out -= t.amount; else e.inc += t.amount; e.n++; }
    }
    return Object.values(m).sort((a, b) => b.out - a.out);
  },
  allTags() { const s = new Set(); for (const t of S().transactions) (t.tags || []).forEach(x => s.add(x)); return [...s].sort(); },

  lastMonths(n, endKey = monthKey(todayISO())) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addMonths(endKey, -i)); return out; },

  budgetStatus(key) {
    const spent = {}; for (const r of this.byCategory(key, key)) spent[r.cat.id] = r.value;
    return Object.entries(S().budgets).filter(([, v]) => v > 0).map(([id, limit]) => ({ cat: catById(id), limit, spent: spent[id] || 0 }));
  },

  /* ---------- Vertrags- und Abo-Erkennung ---------- */
  payeeKey(t) {
    let s = (t.payee || '').trim() || (t.purpose || '').trim();
    s = s.toUpperCase().replace(/\b(GMBH|AG|SE|KG|EV|E\.V\.|LTD|INC|SARL|BV|CO|DEUTSCHLAND|GERMANY|EUROPE|EU|PAYPAL \(EUROPE\)|SAGT DANKE)\b/g, ' ')
      .replace(/[0-9]{3,}/g, ' ').replace(/[^A-ZÄÖÜ& ]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.split(' ').slice(0, 3).join(' ');
  },
  median(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  INTERVALS: [
    { id: 'weekly', name: 'wöchentlich', days: 7, min: 6, max: 8, perMonth: 52 / 12, minCount: 4 },
    { id: 'monthly', name: 'monatlich', days: 30, min: 26, max: 35, perMonth: 1, minCount: 3 },
    { id: 'quarterly', name: 'vierteljährlich', days: 91, min: 84, max: 99, perMonth: 1 / 3, minCount: 2 },
    { id: 'halfyear', name: 'halbjährlich', days: 182, min: 172, max: 192, perMonth: 1 / 6, minCount: 2 },
    { id: 'yearly', name: 'jährlich', days: 365, min: 350, max: 380, perMonth: 1 / 12, minCount: 2 },
  ],
  intervalById(id) { return this.INTERVALS.find(i => i.id === id) || this.INTERVALS[1]; },

  detectContracts(income = false) {
    const sg = income ? 1 : -1;
    const groups = {};
    const skipCats = new Set(['lebensmittel', 'restaurant', 'bargeld', 'umbuchung', 'sparen', 'shopping']);
    for (const t of S().transactions) {
      if (t.amount * sg <= 0 || (!income && skipCats.has(t.categoryId)) || t.categoryId === 'umbuchung') continue;
      const k = this.payeeKey(t); if (!k) continue;
      (groups[t.accountId + '|' + k] || (groups[t.accountId + '|' + k] = [])).push(t);
    }
    const found = [];
    for (const [gk, list] of Object.entries(groups)) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.date.localeCompare(b.date));
      // Betragscluster: Buchungen mit ähnlichem Betrag (±25 %) wie die letzte
      const last = list[list.length - 1];
      const cluster = list.filter(t => Math.abs(t.amount - last.amount) <= Math.max(1, Math.abs(last.amount) * 0.25));
      if (cluster.length < 2) continue;
      const gaps = []; for (let i = 1; i < cluster.length; i++) gaps.push(daysBetween(cluster[i - 1].date, cluster[i].date));
      const med = this.median(gaps.filter(g => g > 3));
      const iv = this.INTERVALS.find(i => med >= i.min && med <= i.max);
      if (!iv || cluster.length < iv.minCount) continue;
      const regular = gaps.filter(g => g >= iv.min * 0.8 && g <= iv.max * 1.25).length;
      if (regular / gaps.length < 0.6) continue;
      const amount = sg * last.amount;
      // letzte Preisänderung finden (innerhalb der letzten 6 Monate)
      let prev = amount, changeDate = null;
      for (let i = cluster.length - 2; i >= 0; i--) { if (Math.abs(sg * cluster[i].amount - amount) > 0.009) { prev = sg * cluster[i].amount; changeDate = cluster[i + 1].date; break; } }
      if (changeDate && daysBetween(changeDate, todayISO()) > 183) { prev = amount; changeDate = null; }
      const nextDate = addDays(last.date, iv.days);
      const active = daysBetween(nextDate, todayISO()) <= iv.days * 0.5;
      found.push({
        key: gk, name: last.payee || this.payeeKey(last), accountId: last.accountId, amount, prevAmount: prev,
        priceChange: Math.abs(amount - prev) > 0.009 ? amount - prev : 0, changeDate, interval: iv.id, monthly: amount * iv.perMonth,
        lastDate: last.date, firstDate: cluster[0].date, nextDate, count: cluster.length, categoryId: last.categoryId, active, auto: true,
      });
    }
    return found;
  },

  /* Erkannte + manuelle Verträge, mit Status aus den gespeicherten Einstellungen */
  contracts() {
    const saved = S().contracts; const out = [];
    for (const c of this.detectContracts()) {
      const s = saved.find(x => x.key === c.key);
      if (s && s.status === 'ignored') continue;
      out.push({ ...c, ...(s ? { status: s.status, customName: s.customName, categoryId: s.categoryId || c.categoryId, cancelDate: s.cancelDate, noticeNote: s.noticeNote, customerNo: s.customerNo, contractEnd: s.contractEnd, noticeMonths: s.noticeMonths, renewMonths: s.renewMonths, id: s.id } : { status: 'detected' }) });
    }
    for (const s of saved.filter(x => x.manual)) {
      const iv = this.intervalById(s.interval);
      out.push({ ...s, monthly: s.amount * iv.perMonth, active: s.status !== 'cancelled', nextDate: s.nextDate || '', count: 0 });
    }
    return out.sort((a, b) => b.monthly - a.monthly);
  },
  savedContract(key) { let s = S().contracts.find(x => x.key === key); if (!s) { s = { id: uid(), key, status: 'detected' }; S().contracts.push(s); } return s; },
};
