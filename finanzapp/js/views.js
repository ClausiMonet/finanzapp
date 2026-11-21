'use strict';
/* Alle Ansichten der App */
const ui = { month: monthKey(todayISO()), acc: '', cat: '', q: '', period: '1', vmode: 'konten' };

const catOptions = (sel, filter) => S().categories.filter(c => !filter || filter(c)).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
const accOptions = (sel, filter, empty) => (empty ? `<option value="">${esc(empty)}</option>` : '') + S().accounts.filter(a => !filter || filter(a)).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const catIcon = c => `<div class="ic" style="background:${c.color}22;color:${c.color}">${c.icon}</div>`;
const emptyBox = (icon, title, text, btn) => `<div class="card empty"><div class="big">${icon}</div><h3>${esc(title)}</h3><p>${text}</p>${btn || ''}</div>`;

const Views = {
  /* ================= ÜBERSICHT ================= */
  uebersicht: {
    title: 'Übersicht',
    render() {
      const st = S();
      if (!st.accounts.length) return `
        ${emptyBox('👋', 'Willkommen in deiner Finanzapp', 'Lege zuerst deine Konten an – z. B. Girokonto (Sparkasse), Tagesgeld (ING), Depot (Scalable) und Krypto (Bitvavo). Danach importierst du deine Umsätze als CSV aus dem Online-Banking.', '<button class="btn primary" data-act="add-account">+ Erstes Konto anlegen</button>')}
        <div class="card"><h3>So funktioniert's</h3><ol class="small" style="padding-left:18px;line-height:1.7">
          <li>Konten anlegen (Bereich <b>Vermögen</b>)</li>
          <li>Im Online-Banking Umsätze als <b>CSV</b> exportieren und hier importieren</li>
          <li>Depot-Positionen eintragen oder Broker-CSV importieren</li>
          <li>Kurs-Proxy in den <b>Einstellungen</b> eintragen → Kurse aktualisieren sich per Knopfdruck</li>
          <li>Ab und zu ein <b>Backup</b> exportieren und aufs andere Gerät übertragen</li></ol></div>`;
      const net = netWorth();
      const snaps = st.snapshots; let ref = [...snaps].reverse().find(s => daysBetween(s.date, todayISO()) >= 30) || snaps[0]; if (ref && ref.date === todayISO()) ref = null;
      const chg = ref ? net - ref.net : 0;
      const cur = ui.month = monthKey(todayISO());
      const mt = Analysis.monthTotals(cur);
      const cats = Analysis.byCategory(cur, cur).slice(0, 6);
      const budgets = Analysis.budgetStatus(cur).sort((a, b) => b.spent / b.limit - a.spent / a.limit).slice(0, 4);
      const soon = Analysis.contracts().filter(c => c.active && c.status !== 'cancelled' && c.nextDate && daysBetween(todayISO(), c.nextDate) >= -3 && daysBetween(todayISO(), c.nextDate) <= 14).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
      const recent = st.transactions.slice(0, 6);
      const inv = positionsValue(), invCost = positionsCost();
      return `
      <div class="grid g3">
        <div class="card kpi hero"><div class="label">Nettovermögen</div><div class="value num">${fmtEUR(net)}</div>
          <div class="sub">${ref ? `${PRIV() ? (ref.net ? fmtPct(chg / Math.abs(ref.net) * 100) : '–') : fmtSigned(chg)} seit ${fmtDate(ref.date)}` : 'Verlauf startet heute'}</div></div>
        <div class="card kpi"><div class="label">${MONTHS[+cur.slice(5) - 1]}: Einnahmen / Ausgaben</div>
          <div class="value num"><span class="pos">${fmtEUR(mt.inc, true)}</span> <span class="muted" style="font-weight:400">/</span> <span class="neg">${fmtEUR(mt.exp, true)}</span></div>
          <div class="sub ${clsAmt(mt.net)}">Saldo ${fmtSigned(mt.net)}${mt.saved ? ` · gespart/investiert ${fmtEUR(mt.saved, true)}` : ''}</div></div>
        <div class="card kpi"><div class="label">Depot & Krypto</div><div class="value num">${PRIV() ? fmtNum(grossAssets() > 0 ? inv / grossAssets() * 100 : 0, 0) + ' % des Vermögens' : fmtEUR(inv, true)}</div>
          <div class="sub ${clsAmt(inv - invCost)}">${invCost ? (PRIV() ? fmtPct((inv - invCost) / invCost * 100) + ' Gewinn/Verlust' : `${fmtSigned(inv - invCost)} (${fmtPct((inv - invCost) / invCost * 100)})`) : 'Noch keine Positionen'}</div></div>
      </div>
      <div class="row" style="margin:14px 0">
        <button class="btn primary shrink" data-act="import">⇪ CSV importieren</button>
        <button class="btn shrink" data-act="add-tx">+ Buchung</button>
        ${Prices.configured() && st.positions.some(p => p.symbol) ? '<button class="btn shrink" data-act="prices">↻ Kurse aktualisieren</button>' : ''}
      </div>
      <div class="grid g2">
        <div class="card"><h3>Vermögensverlauf</h3>${Charts.line(snaps.slice(-365).map(s => ({ label: fmtDate(s.date).slice(0, 6), y: s.net })))}</div>
        <div class="card"><div class="between"><h3>Ausgaben ${MONTHS[+cur.slice(5) - 1]}</h3><a href="#auswertung" class="small">Details</a></div>
          ${Charts.donut(cats.map(c => ({ label: c.cat.name, value: c.value, color: c.cat.color })))}</div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><div class="between"><h3>Budgets</h3><a href="#planen" class="small">Bearbeiten</a></div>
          ${budgets.length ? budgets.map(b => this.budgetRow(b)).join('') : '<p class="muted small">Noch keine Budgets festgelegt.</p>'}</div>
        <div class="card"><div class="between"><h3>Demnächst fällig</h3><a href="#vertraege" class="small">Alle Verträge</a></div>
          ${soon.length ? `<ul class="list">${soon.map(c => `<li class="item" data-contract="${esc(c.key)}">${catIcon(catById(c.categoryId))}<div class="main"><div class="t">${esc(c.customName || c.name)}</div><div class="s">${fmtDate(c.nextDate)} · ${Analysis.intervalById(c.interval).name}</div></div><div class="amt num neg">${fmtEUR(-c.amount)}</div></li>`).join('')}</ul>` : '<p class="muted small">In den nächsten 14 Tagen nichts.</p>'}</div>
      </div>
      <div class="card" style="margin-top:14px"><div class="between"><h3>Letzte Umsätze</h3><a href="#umsaetze" class="small">Alle</a></div>
        ${recent.length ? `<ul class="list">${recent.map(txItem).join('')}</ul>` : '<p class="muted small">Noch keine Umsätze – importiere eine CSV aus deinem Online-Banking.</p>'}</div>`;
    },
    budgetRow(b) {
      const p = b.spent / b.limit; const cls = p > 1 ? 'over' : p > 0.85 ? 'near' : '';
      return `<div style="margin:10px 0"><div class="between small"><span>${b.cat.icon} ${esc(b.cat.name)}</span><span class="num">${PRIV() ? fmtNum(p * 100, 0) + ' %' : fmtEUR(b.spent, true) + ' / ' + fmtEUR(b.limit, true)}</span></div><div class="bar ${cls}"><div style="width:${Math.min(100, p * 100)}%"></div></div></div>`;
    },
  },

  /* ================= UMSÄTZE ================= */
  umsaetze: {
    title: 'Umsätze',
    render() {
      const st = S();
      if (!st.accounts.length) return emptyBox('🏦', 'Noch keine Konten', 'Lege zuerst ein Konto an, dann kannst du Umsätze importieren.', '<button class="btn primary" data-act="add-account">+ Konto anlegen</button>');
      const list = this.filtered();
      const sumIn = list.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), sumOut = list.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      let html = `<div class="row" style="margin-bottom:10px">
        <button class="btn primary shrink" data-act="import">⇪ CSV importieren</button><button class="btn shrink" data-act="add-tx">+ Buchung</button></div>
      <div class="card" style="padding:12px">
        <div class="between" style="margin-bottom:10px">
          <button class="icon-btn" data-month="-1" ${ui.month === 'all' ? 'disabled' : ''}>‹</button>
          <select id="f-month" style="max-width:220px;text-align:center">${this.monthOptions()}</select>
          <button class="icon-btn" data-month="1" ${ui.month === 'all' ? 'disabled' : ''}>›</button></div>
        <div class="row">
          <select id="f-acc">${accOptions(ui.acc, a => !isInvestAcc(a), 'Alle Konten')}</select>
          <select id="f-cat"><option value="">Alle Kategorien</option><option value="__none" ${ui.cat === '__none' ? 'selected' : ''}>❔ Unkategorisiert/Sonstiges</option>${catOptions(ui.cat)}</select>
        </div>
        <input id="f-q" type="search" placeholder="Suche nach Empfänger, Zweck, Betrag …" value="${esc(ui.q)}" style="margin-top:10px">
        <div class="between small" style="margin-top:10px"><span class="muted">${list.length} Buchungen</span><span class="num"><span class="pos">${fmtEUR(sumIn)}</span> · <span class="neg">${fmtEUR(sumOut)}</span></span></div>
      </div>`;
      if (!list.length) return html + `<div class="card empty"><div class="big">🔍</div>Keine Umsätze für diese Auswahl.</div>`;
      html += '<div class="card" style="padding-top:4px"><ul class="list">';
      let day = ''; let n = 0;
      for (const t of list) {
        if (n++ > 600) { html += '<li class="muted small" style="padding:12px">… weitere Buchungen – bitte Filter eingrenzen.</li>'; break; }
        if (t.date !== day) { day = t.date; html += `<li class="day-head">${fmtDayHead(day)}</li>`; }
        html += txItem(t);
      }
      return html + '</ul></div>';
    },
    monthOptions() {
      const keys = new Set(S().transactions.map(t => monthKey(t.date))); keys.add(monthKey(todayISO())); if (ui.month !== 'all') keys.add(ui.month);
      return `<option value="all" ${ui.month === 'all' ? 'selected' : ''}>Alle Monate</option>` + [...keys].sort().reverse().map(k => `<option value="${k}" ${k === ui.month ? 'selected' : ''}>${monthLabel(k)}</option>`).join('');
    },
    filtered() {
      const q = ui.q.trim().toLowerCase();
      return S().transactions.filter(t => {
        const a = accById(t.accountId); if (!a || isInvestAcc(a)) return false;
        if (ui.month !== 'all' && !t.date.startsWith(ui.month)) return false;
        if (ui.acc && t.accountId !== ui.acc) return false;
        if (ui.cat === '__none') { if (t.categoryId !== 'sonstiges' && t.categoryId !== 'einnahmen') return false; }
        else if (ui.cat && !txParts(t).some(p => p.categoryId === ui.cat)) return false;
        if (q) { const hay = (t.payee + ' ' + t.purpose + ' ' + (t.note || '') + ' ' + (t.tags || []).map(x => '#' + x).join(' ') + (t.tax ? ' #steuer' : '') + (t.receipts && t.receipts.length ? ' #beleg' : '') + ' ' + fmtNum(Math.abs(t.amount))).toLowerCase(); if (!q.split(/\s+/).every(w => hay.includes(w))) return false; }
        return true;
      });
    },
    bind(root) {
      const rer = () => App.render();
      $('#f-month', root) && ($('#f-month', root).onchange = e => { ui.month = e.target.value; rer(); });
      $$('[data-month]', root).forEach(b => b.onclick = () => { ui.month = addMonths(ui.month, +b.dataset.month); rer(); });
      $('#f-acc', root) && ($('#f-acc', root).onchange = e => { ui.acc = e.target.value; rer(); });
      $('#f-cat', root) && ($('#f-cat', root).onchange = e => { ui.cat = e.target.value; rer(); });
      const q = $('#f-q', root); if (q) q.oninput = debounce(e => { ui.q = q.value; const pos = q.selectionStart; rer(); const nq = $('#f-q'); nq.focus(); nq.setSelectionRange(pos, pos); }, 300);
    },
  },

  /* ================= VERMÖGEN ================= */
  vermoegen: {
    title: 'Vermögen',
    render() {
      const st = S(); const net = netWorth(); const gross = grossAssets();
      const groups = {}; for (const a of st.accounts) (groups[a.type] || (groups[a.type] = [])).push(a);
      const alloc = Object.entries(groups).map(([type, accs]) => ({ label: ACCOUNT_TYPES[type].name, value: Math.max(0, accs.filter(a => !a.hidden).reduce((s, a) => s + accountBalance(a), 0)) })).filter(x => x.value > 0);
      const colors = ['#2563eb', '#059669', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
      const invAccs = st.accounts.filter(isInvestAcc);
      const last = st.settings.lastPriceUpdate;
      let html = `<div class="card kpi hero"><div class="label">Nettovermögen</div><div class="value num">${fmtEUR(net)}</div><div class="sub">${st.accounts.length} Konten · ${st.positions.length} Positionen${PRIV() ? ' · Diskret-Modus: Anteile in %' : ''}</div></div>
      <div class="row" style="margin-bottom:14px"><button class="btn primary shrink" data-act="add-account">+ Konto</button><button class="btn shrink" data-act="add-position">+ Position</button><button class="btn shrink" data-act="import-broker">⇪ Broker-CSV</button>
      ${st.positions.some(p => p.symbol) ? `<button class="btn shrink" data-act="prices">↻ Kurse</button>` : ''}</div>`;
      if (!st.accounts.length) return html + emptyBox('🏦', 'Noch keine Konten', 'Lege Girokonten, Tagesgeld, Depots und Krypto-Konten an.');
      html += '<div class="grid g2"><div>';
      for (const [type, accs] of Object.entries(groups)) {
        const sum = accs.filter(a => !a.hidden).reduce((s, a) => s + accountBalance(a), 0);
        html += `<div class="card"><div class="between"><h4>${ACCOUNT_TYPES[type].icon} ${ACCOUNT_TYPES[type].name}</h4><b class="num">${fmtShare(sum, gross)}</b></div><ul class="list">`;
        for (const a of accs) {
          const bal = accountBalance(a); const cnt = isInvestAcc(a) ? st.positions.filter(p => p.accountId === a.id).length + ' Positionen' : st.transactions.filter(t => t.accountId === a.id).length + ' Umsätze';
          html += `<li class="item" data-account="${a.id}"><div class="main"><div class="t">${esc(a.name)}${a.hidden ? ' <span class="badge">ausgeblendet</span>' : ''}</div><div class="s">${cnt}${a.iban ? ' · ' + esc(a.iban) : ''}</div></div><div class="amt num ${bal < 0 ? 'neg' : ''}">${fmtShare(bal, gross)}</div></li>`;
        }
        html += '</ul></div>';
      }
      html += `</div><div><div class="card"><h3>Aufteilung</h3>${Charts.donut(alloc.map((x, i) => ({ ...x, color: colors[i % colors.length] })), { center: fmtEUR(net, true) })}</div>
        <div class="card"><h3>Verlauf</h3>${Charts.line(st.snapshots.slice(-365).map(s => ({ label: fmtDate(s.date).slice(0, 6), y: s.net })), { h: 180 })}</div></div></div>`;
      for (const a of invAccs) {
        const ps = st.positions.filter(p => p.accountId === a.id).sort((x, y) => (y.shares * (y.lastPrice ?? y.buyPrice)) - (x.shares * (x.lastPrice ?? x.buyPrice)));
        const val = positionsValue(a.id), cost = positionsCost(a.id);
        html += `<div class="card"><div class="between"><h3>${ACCOUNT_TYPES[a.type].icon} ${esc(a.name)}</h3><div class="num" style="text-align:right"><b>${fmtShare(val, gross)}</b><div class="small ${clsAmt(val - cost)}">${cost ? (PRIV() ? fmtPct((val - cost) / cost * 100) : fmtSigned(val - cost) + ' (' + fmtPct((val - cost) / cost * 100) + ')') : ''}</div></div></div>`;
        if (!ps.length) { html += `<p class="muted small">Noch keine Positionen. <button class="btn link" data-act="add-position" data-accid="${a.id}">Position hinzufügen</button></p></div>`; continue; }
        html += `<div class="table-wrap"><table><thead><tr><th>Wertpapier</th>${PRIV() ? '' : '<th class="r">Stück</th>'}<th class="r">Kurs</th><th class="r">${PRIV() ? 'Anteil' : 'Wert'}</th><th class="r">G/V</th></tr></thead><tbody>`;
        for (const p of ps) {
          const price = p.lastPrice ?? p.buyPrice ?? 0; const v = p.shares * price; const c = p.shares * (p.buyPrice || 0); const day = p.prevClose ? (price - p.prevClose) / p.prevClose * 100 : null;
          html += `<tr data-position="${p.id}" style="cursor:pointer"><td><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.symbol || p.isin || 'kein Symbol')}${p.lastPrice == null ? ' · <span class="warn">kein Kurs</span>' : ''}</div></td>
            ${PRIV() ? '' : `<td class="r num">${fmtNum(p.shares, p.shares % 1 ? 4 : 0)}</td>`}<td class="r num">${PRIV() && p.lastPrice == null ? '–' : fmtEURpub(price)}${day != null ? `<div class="tiny ${clsAmt(day)}">${fmtPct(day, 2)} heute</div>` : ''}</td><td class="r num">${fmtShare(v, val)}</td>
            <td class="r num ${clsAmt(v - c)}">${c && p.lastPrice != null ? (PRIV() ? fmtPct((v - c) / c * 100) : fmtSigned(v - c) + `<div class="tiny">${fmtPct((v - c) / c * 100)}</div>`) : '–'}</td></tr>`;
        }
        html += `</tbody></table></div>${a.cash && !PRIV() ? `<p class="small muted">+ Guthaben/Cash: ${fmtEUR(a.cash)}</p>` : ''}</div>`;
      }
      if (invAccs.length) html += `<p class="tiny muted">${last ? 'Kurse zuletzt aktualisiert: ' + new Date(last).toLocaleString('de-DE') : 'Kurse noch nie aktualisiert.'} ${Prices.configured() ? '' : '· <a href="#einstellungen">Kurs-Proxy einrichten</a>'}</p>`;
      return html;
    },
  },

  /* ================= VERTRÄGE ================= */
  vertraege: {
    title: 'Verträge & Abos',
    render() {
      const all = Analysis.contracts();
      const active = all.filter(c => c.active && c.status !== 'cancelled');
      const monthly = active.reduce((s, c) => s + c.monthly, 0);
      const changes = active.filter(c => c.priceChange > 0);
      let html = `<div class="grid g3"><div class="card kpi hero"><div class="label">Fixkosten pro Monat</div><div class="value num">${fmtEUR(monthly)}</div><div class="sub">${fmtEUR(monthly * 12, true)} pro Jahr · ${active.length} aktive Verträge</div></div>
        <div class="card kpi"><div class="label">Preiserhöhungen erkannt</div><div class="value ${changes.length ? 'warn' : ''}">${changes.length}</div><div class="sub muted">${changes.length ? changes.map(c => esc(c.customName || c.name)).slice(0, 3).join(', ') : 'Alles stabil'}</div></div>
        <div class="card kpi"><div class="label">Wie das funktioniert</div><div class="sub muted" style="margin-top:6px">Wiederkehrende Abbuchungen (wöchentlich bis jährlich) werden automatisch aus deinen Umsätzen erkannt – komplett lokal.</div></div></div>
        <div class="row" style="margin:14px 0"><button class="btn primary shrink" data-act="add-contract">+ Vertrag manuell</button></div>`;
      if (!all.length) return html + emptyBox('🔁', 'Noch keine Verträge erkannt', 'Importiere Umsätze von mindestens 3 Monaten – dann erkennt die App Abos, Versicherungen, Handyverträge usw. automatisch.');
      const sec = (title, list) => !list.length ? '' : `<div class="card"><h4>${title}</h4><ul class="list">${list.map(c => {
        const cat = catById(c.categoryId); const iv = Analysis.intervalById(c.interval);
        const badges = [c.status === 'confirmed' ? '<span class="badge ok">bestätigt</span>' : '', c.status === 'detected' ? '<span class="badge">erkannt</span>' : '', c.manual ? '<span class="badge">manuell</span>' : '',
          c.priceChange > 0 ? `<span class="badge warn">+${fmtEUR(c.priceChange)}</span>` : '', c.status === 'cancelled' ? '<span class="badge">gekündigt</span>' : ''].join(' ');
        return `<li class="item" data-contract="${esc(c.key || c.id)}">${catIcon(cat)}<div class="main"><div class="t">${esc(c.customName || c.name)} ${badges}</div><div class="s">${iv.name} · ${c.nextDate ? 'nächste ca. ' + fmtDate(c.nextDate) : ''}${c.count ? ' · ' + c.count + '× gebucht' : ''}</div></div><div class="amt num"><div>${fmtEUR(c.amount)}</div><div class="tiny muted">${fmtEUR(c.monthly)}/Monat</div></div></li>`;
      }).join('')}</ul></div>`;
      html += sec('Aktiv', active) + sec('Beendet / gekündigt / pausiert', all.filter(c => !(c.active && c.status !== 'cancelled')));
      html += '<p class="tiny muted">Tipp: Falsch erkannte Einträge kannst du im Detail „ignorieren“.</p>';
      return html;
    },
  },

  /* ================= PLANEN ================= */
  planen: {
    title: 'Planen',
    render() {
      const st = S(); const cur = monthKey(todayISO());
      const spent = {}; for (const r of Analysis.byCategory(cur, cur)) spent[r.cat.id] = r.value;
      const avg = {}; const from = addMonths(cur, -3), to = addMonths(cur, -1); for (const r of Analysis.byCategory(from, to)) avg[r.cat.id] = r.value / 3;
      const totalB = Object.values(st.budgets).reduce((s, v) => s + (+v || 0), 0); const totalS = Object.keys(st.budgets).reduce((s, k) => s + (st.budgets[k] > 0 ? spent[k] || 0 : 0), 0);
      let html = `<div class="card"><div class="between"><h3>Budgets ${MONTHS[+cur.slice(5) - 1]}</h3><span class="num small">${PRIV() ? (totalB ? fmtNum(totalS / totalB * 100, 0) + ' % genutzt' : '') : fmtEUR(totalS, true) + ' / ' + fmtEUR(totalB, true)}</span></div>
        <p class="small muted">${PRIV() ? 'Diskret-Modus: Zum Bearbeiten der Limits Beträge einblenden (Auge oben).' : 'Lege für Kategorien ein Monatslimit fest. Ø = Durchschnitt der letzten 3 Monate.'}</p>`;
      for (const c of st.categories.filter(c => c.type === 'expense')) {
        const lim = +st.budgets[c.id] || 0; const s = spent[c.id] || 0; const p = lim ? s / lim : 0;
        html += `<div style="margin:12px 0"><div class="between"><span>${c.icon} ${esc(c.name)}</span>
          <span class="row shrink" style="gap:6px;flex-wrap:nowrap">${PRIV() ? '' : `<span class="small muted num">${fmtEUR(s, true)} · Ø ${fmtEUR(avg[c.id] || 0, true)}</span>`}${PRIV() ? (lim ? `<span class="small num">${fmtNum(p * 100, 0)} %</span>` : '') : `<input type="number" inputmode="decimal" min="0" step="10" placeholder="Limit" value="${lim || ''}" data-budget="${c.id}" style="width:90px;padding:6px 8px">`}</span></div>
          ${lim ? `<div class="bar ${p > 1 ? 'over' : p > 0.85 ? 'near' : ''}"><div style="width:${Math.min(100, p * 100)}%"></div></div>${PRIV() ? '' : p > 1 ? `<div class="tiny neg">${fmtEUR(s - lim)} über dem Budget</div>` : `<div class="tiny muted">noch ${fmtEUR(lim - s)} übrig</div>`}` : ''}</div>`;
      }
      html += '</div><div class="between" style="margin:20px 0 10px"><h3 style="margin:0">Sparziele</h3><button class="btn primary sm" data-act="add-goal">+ Sparziel</button></div>';
      if (!st.goals.length) html += emptyBox('🎯', 'Noch keine Sparziele', 'Z. B. Notgroschen, neuer Laptop, Urlaub – die App rechnet aus, wie viel du monatlich zurücklegen musst.');
      else {
        html += '<div class="grid g2">';
        for (const g of st.goals) {
          const saved = goalSaved(g); const p = g.target ? saved / g.target : 0;
          let rate = '';
          if (g.targetDate && saved < g.target) { const months = Math.max(1, (new Date(g.targetDate) - new Date()) / (30.44 * 864e5)); rate = PRIV() ? `Ziel: ${fmtDate(g.targetDate)}` : `Noch ${fmtEUR(g.target - saved, true)} → <b>${fmtEUR((g.target - saved) / months, true)}/Monat</b> bis ${fmtDate(g.targetDate)}`; }
          else if (saved >= g.target) rate = '<span class="pos">🎉 Ziel erreicht!</span>';
          html += `<div class="card" data-goal="${g.id}" style="cursor:pointer"><div class="between"><h3 style="margin:0">${esc(g.icon || '🎯')} ${esc(g.name)}</h3><span class="num">${fmtNum(p * 100, 0)} %</span></div>
            <div class="bar"><div style="width:${Math.min(100, p * 100)}%;background:var(--pos)"></div></div>
            <div class="between small" style="margin-top:8px"><span class="num">${PRIV() ? '' : fmtEUR(saved, true) + ' von ' + fmtEUR(g.target, true)}</span>${g.accountId ? `<span class="muted">🔗 ${esc(accById(g.accountId)?.name || '')}</span>` : ''}</div>
            <p class="small" style="margin:8px 0 0">${rate}</p></div>`;
        }
        html += '</div>';
      }
      return html;
    },
    bind(root) {
      $$('[data-budget]', root).forEach(inp => inp.onchange = () => {
        const v = parseNum(inp.value); if (v > 0) S().budgets[inp.dataset.budget] = v; else delete S().budgets[inp.dataset.budget];
        Store.save(); App.render();
      });
    },
  },

  /* ================= AUSWERTUNG ================= */
  auswertung: {
    title: 'Auswertung',
    render() {
      const cur = monthKey(todayISO());
      const months = Analysis.lastMonths(12);
      const tot = months.map(k => ({ k, ...Analysis.monthTotals(k) }));
      const n = { '1': 1, '0': 1, '3': 3, '6': 6, '12': 12 }[ui.period];
      const to = ui.period === '0' ? addMonths(cur, -1) : cur; const from = addMonths(to, -(n - 1));
      const cats = Analysis.byCategory(from, to); const incs = Analysis.byCategory(from, to, 1);
      const sumExp = cats.reduce((s, c) => s + c.value, 0), sumInc = incs.reduce((s, c) => s + c.value, 0);
      const valid = tot.filter(t => t.inc || t.exp);
      const avgInc = valid.length ? valid.reduce((s, t) => s + t.inc, 0) / valid.length : 0, avgExp = valid.length ? valid.reduce((s, t) => s + t.exp, 0) / valid.length : 0;
      const rate = avgInc ? (avgInc - avgExp) / avgInc * 100 : 0;
      // Top-Empfänger
      const payees = {}; for (const t of S().transactions) { const k = monthKey(t.date); if (k < from || k > to || t.amount >= 0 || Analysis.isTransfer(t)) continue; const p = t.payee || '(ohne Name)'; payees[p] = (payees[p] || 0) - t.amount; }
      const top = Object.entries(payees).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `<div class="grid g3">
        <div class="card kpi"><div class="label">Ø Einnahmen / Monat</div><div class="value num pos">${fmtEUR(avgInc, true)}</div><div class="sub muted">letzte 12 Monate</div></div>
        <div class="card kpi"><div class="label">Ø Ausgaben / Monat</div><div class="value num neg">${fmtEUR(avgExp, true)}</div><div class="sub muted">ohne Umbuchungen & Investments</div></div>
        <div class="card kpi"><div class="label">Sparquote</div><div class="value num ${clsAmt(rate)}">${fmtNum(rate, 0)} %</div><div class="sub muted">vom Einkommen übrig</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Einnahmen & Ausgaben (12 Monate)</h3>
        ${Charts.bars(tot.map(t => ({ label: MONTHS_S[+t.k.slice(5) - 1], values: [t.inc, t.exp] })), ['var(--pos)', 'var(--neg)'])}
        ${Charts.legend([['Einnahmen', 'var(--pos)'], ['Ausgaben', 'var(--neg)']])}</div>
      <div class="chips">${[['1', 'Dieser Monat'], ['0', 'Letzter Monat'], ['3', '3 Monate'], ['6', '6 Monate'], ['12', '12 Monate']].map(([v, l]) => `<button class="chip ${ui.period === v ? 'active' : ''}" data-period="${v}">${l}</button>`).join('')}</div>
      <div class="grid g2">
        <div class="card"><h3>Ausgaben nach Kategorie</h3><p class="small muted">${monthLabel(from)}${from !== to ? ' – ' + monthLabel(to) : ''} · ${fmtEUR(sumExp)}${n > 1 ? ' · Ø ' + fmtEUR(sumExp / n, true) + '/Monat' : ''}</p>
          ${Charts.donut(cats.map(c => ({ label: c.cat.name, value: c.value, color: c.cat.color })))}</div>
        <div class="card"><h3>Einnahmen</h3><p class="small muted">${fmtEUR(sumInc)}</p>
          ${incs.length ? `<ul class="list">${incs.map(c => `<li class="item" data-filtercat="${c.cat.id}">${catIcon(c.cat)}<div class="main"><div class="t">${esc(c.cat.name)}</div></div><div class="amt num pos">${fmtEUR(c.value)}</div></li>`).join('')}</ul>` : '<p class="muted small">Keine Einnahmen.</p>'}
          <h3 style="margin-top:18px">Top-Empfänger</h3>
          ${top.length ? `<ul class="list">${top.map(([p, v]) => `<li class="item" data-search="${esc(p)}"><div class="main"><div class="t">${esc(p)}</div></div><div class="amt num neg">${fmtEUR(-v)}</div></li>`).join('')}</ul>` : '<p class="muted small">–</p>'}</div>
      </div>`;
    },
    bind(root) {
      $$('[data-period]', root).forEach(b => b.onclick = () => { ui.period = b.dataset.period; App.render(); });
      $$('[data-filtercat]', root).forEach(b => b.onclick = () => { ui.cat = b.dataset.filtercat; ui.q = ''; ui.month = 'all'; location.hash = 'umsaetze'; });
      $$('[data-search]', root).forEach(b => b.onclick = () => { ui.q = b.dataset.search; ui.cat = ''; ui.month = 'all'; location.hash = 'umsaetze'; });
    },
  },

  /* ================= EINSTELLUNGEN ================= */
  einstellungen: {
    title: 'Einstellungen',
    render() {
      const s = S().settings;
      return `
      <div class="card"><h3>🔄 Backup & Gerätewechsel</h3>
        <p class="small muted">Es gibt keine Cloud. Um Laptop und Handy abzugleichen, exportierst du ein verschlüsseltes Backup und importierst es auf dem anderen Gerät (z. B. per USB, Nearby Share, Mail an dich selbst – die Datei ist ohne Passwort unlesbar).</p>
        <div class="row"><button class="btn primary shrink" data-act="backup-export">⬇ Backup exportieren</button><button class="btn shrink" data-act="backup-import">⬆ Backup importieren</button></div>
        <p class="tiny muted">Import ersetzt die Daten auf diesem Gerät durch den Stand der Backup-Datei.</p></div>

      <div class="card"><h3>☁️ Automatischer Abgleich (Laptop ↔ Handy)</h3>
        <p class="small muted">Ende-zu-Ende-verschlüsselt über deinen Cloudflare-Worker: Cloudflare speichert nur unlesbaren Datensalat. Belege (Fotos) werden nicht abgeglichen – die laufen weiter übers Backup.</p>
        ${Sync.enabled() ? `<p class="small">Status: <b id="sync-status">${esc(Sync.status || 'aktiv')}</b> <span class="tiny muted" id="sync-last"></span></p>
          <div class="row"><button class="btn primary shrink" data-act="sync-now">↻ Jetzt abgleichen</button><button class="btn shrink" data-act="sync-code">Kopplungscode anzeigen</button><button class="btn shrink" data-act="sync-off">Ausschalten</button><button class="btn danger sm shrink" data-act="sync-reset">Server-Daten löschen</button></div>`
        : `<div class="row"><button class="btn primary shrink" data-act="sync-first">Sync starten (erstes Gerät)</button><button class="btn shrink" data-act="sync-pair">Mit anderem Gerät koppeln</button></div>
          <p class="tiny muted">Voraussetzung: Kurs-Proxy ist eingetragen und im Cloudflare-Worker ist ein KV-Speicher „SYNC“ verknüpft (siehe Anleitung).</p>`}</div>

      <div class="card"><h3>👆 Fingerabdruck</h3><div id="bio-box"><p class="small muted">…</p></div></div>

      <div class="card"><h3>🔔 Benachrichtigungen</h3><p class="small muted">Zeigt wichtige Hinweise (Budget überschritten, Kündigungsfrist, Preiserhöhung, Monatsende knapp) als Handy-Benachrichtigung – immer dann, wenn du die App öffnest. Ohne eigenen Server sind Benachrichtigungen bei geschlossener App leider nicht möglich.</p>
        ${s.notify ? '<button class="btn shrink" data-act="notify-off">Ausschalten</button>' : '<button class="btn shrink" data-act="notify-on">Einschalten</button>'}</div>

      <div class="card"><h3>📈 Kurs-Proxy (Yahoo Finance)</h3>
        <p class="small muted">Adresse deines Cloudflare-Workers (siehe Anleitung). Übertragen werden nur Ticker-Symbole, nie Stückzahlen oder Beträge.</p>
        <form id="proxy-form"><label>Proxy-URL</label><input name="proxyUrl" placeholder="https://kurse.deinname.workers.dev" value="${esc(s.proxyUrl)}" autocomplete="off">
        <label>Zugangs-Token</label><input name="proxyToken" type="password" placeholder="geheimes Token aus der Worker-Einrichtung" value="${esc(s.proxyToken)}" autocomplete="off">
        <label>Vergleichsindex für den Depot-Verlauf (Yahoo-Symbol)</label><input name="benchmark" value="${esc(s.benchmark || 'EUNL.DE')}" placeholder="EUNL.DE = iShares Core MSCI World">
        <div class="row" style="margin-top:12px"><button class="btn primary shrink">Speichern</button><button type="button" class="btn shrink" data-act="proxy-test">Verbindung testen</button></div></form></div>

      <div class="card"><h3>🔒 Sicherheit</h3>
        <label>Automatisch sperren nach Inaktivität</label>
        <select id="set-autolock">${[[0, 'nie'], [1, '1 Minute'], [5, '5 Minuten'], [15, '15 Minuten'], [60, '1 Stunde']].map(([v, l]) => `<option value="${v}" ${+s.autoLockMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="row" style="margin-top:12px"><button class="btn shrink" data-act="change-pw">Passwort ändern</button><button class="btn shrink" data-act="lock">Jetzt sperren</button></div></div>

      <div class="card"><h3>👁️ Diskret-Modus</h3><p class="small muted">Blendet alle Geldbeträge aus. Sichtbar bleiben Konten, ETFs, Kategorien sowie Anteile, Fortschritt und Rendite in Prozent – ideal, wenn jemand mitschaut. Schnell umschalten über das Auge oben rechts.</p>
        <label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--text)"><input type="checkbox" id="set-privacy" ${s.privacy ? 'checked' : ''}> Beträge ausblenden</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--text)"><input type="checkbox" id="set-privstart" ${s.privacyOnStart ? 'checked' : ''}> Beim Entsperren immer im Diskret-Modus starten</label></div>

      <div class="card"><h3>🎨 Darstellung</h3><label>Farbschema</label>
        <select id="set-theme">${[['auto', 'Automatisch (wie System)'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>

      <div class="card"><h3>🏷️ Kategorien</h3><ul class="list">${S().categories.map(c => `<li class="item" data-editcat="${c.id}">${catIcon(c)}<div class="main"><div class="t">${esc(c.name)}</div><div class="s">${{ income: 'Einnahme', expense: 'Ausgabe', transfer: 'Umbuchung/Sparen (nicht in Ausgaben)' }[c.type]}</div></div></li>`).join('')}</ul>
        <button class="btn sm" data-act="add-cat" style="margin-top:8px">+ Kategorie</button></div>

      <div class="card"><h3>⚡ Automatische Kategorisierung</h3>
        <p class="small muted">Wenn Empfänger oder Verwendungszweck einen Begriff enthält, wird die Kategorie gesetzt. Mehrere Begriffe mit | trennen. Erste passende Regel gewinnt.</p>
        <ul class="list">${S().rules.map((r, i) => { const c = catById(r.categoryId); return `<li class="item" data-rule="${r.id}"><div class="main"><div class="t">${c.icon} ${esc(c.name)}</div><div class="s">${esc(r.pattern.replace(/\|/g, ' · '))}</div></div><div class="shrink row" style="gap:4px;flex-wrap:nowrap">${i ? `<button class="icon-btn" data-ruleup="${r.id}" title="nach oben">↑</button>` : ''}</div></li>`; }).join('')}</ul>
        <div class="row" style="margin-top:8px"><button class="btn sm shrink" data-act="add-rule">+ Regel</button><button class="btn sm shrink" data-act="recat">Alle Umsätze neu kategorisieren</button></div></div>

      <div class="card"><h3>🧾 Steuer</h3><form id="tax-form"><label>Sparerpauschbetrag (€ pro Jahr)</label><div class="row"><input name="pausch" inputmode="decimal" value="${fmtNum(s.pauschbetrag || 1000, 0)}"><button class="btn shrink">Speichern</button></div>
        <p class="tiny muted">Derzeit 1.000 € für Alleinstehende, 2.000 € bei Zusammenveranlagung.</p></form></div>

      <div class="card"><h3>✉️ Daten für Kündigungsschreiben</h3><form id="addr-form">
        <label>Vor- und Nachname</label><input name="fullName" value="${esc(s.fullName)}" autocomplete="name">
        <label>Anschrift</label><textarea name="address" rows="2" autocomplete="street-address">${esc(s.address)}</textarea>
        <button class="btn sm" style="margin-top:10px">Speichern</button></form></div>

      <div class="card"><h3>⚠️ Gefahrenzone</h3><button class="btn danger" data-act="wipe">Alle Daten auf diesem Gerät löschen</button></div>
      <p class="tiny muted" style="text-align:center">Finanzapp · Daten: ${S().transactions.length} Umsätze, ${S().accounts.length} Konten · verschlüsselt mit AES-256-GCM</p>`;
    },
    bind(root) {
      $('#proxy-form', root).onsubmit = e => { e.preventDefault(); const d = formData(e.target); S().settings.proxyUrl = d.proxyUrl.trim(); S().settings.proxyToken = d.proxyToken.trim(); S().settings.benchmark = (d.benchmark || 'EUNL.DE').trim().toUpperCase(); DepotHistory.cache = {}; ui.dh.data = null; Store.save(); toast('Gespeichert'); };
      $('#tax-form', root).onsubmit = e => { e.preventDefault(); const v = parseNum(e.target.pausch.value); if (v > 0) { S().settings.pauschbetrag = v; Store.save(); toast('Gespeichert'); } };
      Bio.stored().then(b => { const box = $('#bio-box', root); if (!box) return;
        box.innerHTML = !Bio.supported() ? '<p class="small muted">Nur in der installierten App über die https-Adresse (GitHub Pages) verfügbar.</p>'
          : b ? '<p class="small">✓ Aktiv auf diesem Gerät.</p><button class="btn shrink" data-act="bio-off">Ausschalten</button>'
          : '<p class="small muted">Entsperre die App per Fingerabdruck statt Passwort. Benötigt Chrome auf Android mit Displaysperre (Passkey im Google-Passwortmanager).</p><button class="btn primary shrink" data-act="bio-on">Einrichten</button>'; });
      Sync.meta().then(m => { const el = $('#sync-last', root); if (el && m.last) el.textContent = '· zuletzt ' + new Date(m.last).toLocaleString('de-DE'); });
      $('#addr-form', root).onsubmit = e => { e.preventDefault(); Object.assign(S().settings, formData(e.target)); Store.save(); toast('Gespeichert'); };
      $('#set-autolock', root).onchange = e => { S().settings.autoLockMin = +e.target.value; Store.save(); App.resetIdle(); };
      $('#set-privacy', root).onchange = e => App.setPrivacy(e.target.checked);
      $('#set-privstart', root).onchange = e => { S().settings.privacyOnStart = e.target.checked; Store.save(); };
      $('#set-theme', root).onchange = e => { S().settings.theme = e.target.value; Store.save(); App.applyTheme(); };
      $$('[data-editcat]', root).forEach(el => el.onclick = () => Dialogs.category(el.dataset.editcat));
      $$('[data-rule]', root).forEach(el => el.onclick = e => { if (e.target.closest('[data-ruleup]')) return; Dialogs.rule(el.dataset.rule); });
      $$('[data-ruleup]', root).forEach(b => b.onclick = () => { const r = S().rules; const i = r.findIndex(x => x.id === b.dataset.ruleup); if (i > 0) { [r[i - 1], r[i]] = [r[i], r[i - 1]]; Store.save(); App.render(); } });
    },
  },
};

function goalSaved(g) { return g.accountId && accById(g.accountId) ? accountBalance(accById(g.accountId)) : (+g.saved || 0); }

function txItem(t) {
  const c = catById(t.categoryId); const a = accById(t.accountId);
  return `<li class="item" data-tx="${t.id}">${catIcon(c)}<div class="main"><div class="t">${esc(t.payee || t.purpose || 'Ohne Bezeichnung')}<span class="tx-flags">${t.splits && t.splits.length ? '✂' : ''}${t.receipts && t.receipts.length ? '📎' : ''}${t.tax ? '§' : ''}${t.sharedId ? '👥' : ''}</span></div><div class="s">${esc(c.name)}${(t.tags || []).length ? ' · ' + t.tags.map(x => '#' + esc(x)).join(' ') : ''}${S().accounts.length > 1 && a ? ' · ' + esc(a.name) : ''}${t.purpose && t.payee ? ' · ' + esc(t.purpose) : ''}</div></div><div class="amt num ${clsAmt(t.amount)}">${fmtSigned(t.amount)}</div></li>`;
}
