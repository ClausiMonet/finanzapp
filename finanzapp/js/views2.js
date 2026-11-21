'use strict';
/* Zusätzliche Ansichten und Erweiterungen bestehender Ansichten */
Object.assign(ui, { ptab: 'budget', dh: { range: '1y', data: null, err: '', loading: false }, taxYear: String(new Date().getFullYear()), recapKey: null });

const kv = (k, v, cls = '') => `<div class="kv"><span class="muted">${k}</span><span class="num ${cls}">${v}</span></div>`;

/* ---------- Übersicht: Hinweise oben ---------- */
(() => {
  const base = Views.uebersicht.render;
  Views.uebersicht.render = function () {
    const html = base.call(this); if (!S().accounts.length) return html;
    const al = Alerts.list(); const fc = Forecast.monthEnd();
    const fcLine = fc ? `<div class="between small" style="margin-top:${al.length ? 10 : 0}px"><span class="muted">Prognose Kontostand ${fmtDate(fc.end)}</span><a href="#planen" data-ptab="prognose" class="num ${clsAmt(fc.endBalance)}" style="text-decoration:none">${fmtEUR(fc.endBalance, true)}</a></div>` : '';
    return `<div class="card"><h3>${al.length ? '🔔 Hinweise' : '✅ Alles im grünen Bereich'}</h3>${Alerts.html(al)}${fcLine}</div>` + html;
  };
})();

/* ---------- Planen: Tabs ---------- */
(() => {
  const base = Views.planen.render, baseBind = Views.planen.bind;
  Views.planen.render = function () {
    const tabs = `<div class="tabs">${[['budget', 'Budgets & Sparziele'], ['prognose', 'Prognosen & Notgroschen']].map(([k, l]) => `<button class="chip ${ui.ptab === k ? 'active' : ''}" data-ptab="${k}">${l}</button>`).join('')}</div>`;
    return tabs + (ui.ptab === 'prognose' ? this.prognose() : base.call(this));
  };
  Views.planen.prognose = function () {
    const fc = Forecast.monthEnd(); const em = Emergency.calc(); const p = Projection.settings(); const rows = Projection.run(p); const fire = Projection.fire(p);
    let h = '';
    // Monatsend-Prognose
    if (fc) {
      h += `<div class="card"><h3>📅 Prognose bis Monatsende (${fmtDate(fc.end)})</h3>
        ${kv('Kontostand Girokonten heute', fmtEUR(fc.balance), clsAmt(fc.balance))}
        ${kv(`Erwartete Einnahmen (${fc.income.length})`, fmtSigned(fc.incSum), 'pos')}
        ${kv(`Feste Abbuchungen (${fc.fixed.length})`, fmtSigned(fc.fixSum), 'neg')}
        ${kv(`Variable Ausgaben (Ø ${fmtEUR(fc.perDay, true)}/Tag × ${fc.daysLeft} Tage)`, fmtSigned(fc.variable), 'neg')}
        <div class="kv" style="font-weight:800;font-size:16px"><span>Voraussichtlich am Monatsende</span><span class="num ${clsAmt(fc.endBalance)}">${fmtEUR(fc.endBalance)}</span></div>
        ${fc.endBalance < 0 ? '<div class="alert bad">⚠️ Es wird knapp – prüfe Abos oder verschiebe Ausgaben.</div>' : ''}
        ${fc.fixed.length || fc.income.length ? `<details style="margin-top:8px"><summary class="small" style="cursor:pointer">Erwartete Buchungen anzeigen</summary><ul class="list">${[...fc.income, ...fc.fixed].sort((a, b) => a.date.localeCompare(b.date)).map(x => `<li class="item" style="cursor:default"><div class="main"><div class="t">${esc(x.name)}</div><div class="s">${fmtDate(x.date)}</div></div><div class="amt num ${clsAmt(x.amount)}">${fmtSigned(x.amount)}</div></li>`).join('')}</ul></details>` : ''}
        <p class="tiny muted">Basis: erkannte Verträge und regelmäßige Einnahmen sowie deine durchschnittlichen variablen Ausgaben der letzten 90 Tage.</p></div>`;
    }
    // Notgroschen
    const lvlTxt = { bad: ['bad', 'Zu wenig Reserve – Ziel sind 3–6 Monatsausgaben.'], ok: ['warn', 'Solide. 6 Monate wären ideal.'], good: ['good', 'Sehr gut abgesichert.'], much: ['warn', 'Mehr als 12 Monate Reserve – überlege, ob ein Teil investiert werden kann.'], none: ['', 'Noch zu wenige Daten über deine Ausgaben.'] }[em.level];
    h += `<div class="card"><h3>🛟 Notgroschen</h3>
      <div class="kpi"><div class="value num">${em.months != null ? fmtNum(em.months, 1) + ' Monate' : '–'}</div><div class="sub muted">so lange reichen Giro, Tagesgeld und Bargeld für deine üblichen Ausgaben</div></div>
      <div class="bar ${em.months < 3 ? 'over' : ''}" style="margin:10px 0"><div style="width:${Math.min(100, (em.months || 0) / 6 * 100)}%;background:${em.months >= 3 ? 'var(--pos)' : ''}"></div></div>
      ${kv('Liquide Mittel', fmtEUR(em.liquid))}${kv('Ø Ausgaben pro Monat (6 Monate)', fmtEUR(em.avgExp))}${kv('Ziel 3 Monate / 6 Monate', fmtEUR(em.target3, true) + ' / ' + fmtEUR(em.target6, true))}
      <div class="alert ${lvlTxt[0]}">${lvlTxt[1]}</div></div>`;
    // Vermögensprognose
    const lastR = rows[rows.length - 1];
    h += `<div class="card"><h3>🔮 Vermögensprognose</h3>
      <form id="proj-form" class="grid g3" style="gap:0 12px">
        <div><label>Startkapital (€)</label><input name="start" inputmode="decimal" value="${PRIV() ? '' : fmtNum(p.start, 0)}" placeholder="${PRIV() ? 'ausgeblendet' : ''}"></div>
        <div><label>Sparrate pro Monat (€)</label><input name="monthly" inputmode="decimal" value="${PRIV() ? '' : fmtNum(p.monthly, 0)}" placeholder="${PRIV() ? 'ausgeblendet' : ''}"></div>
        <div><label>Rendite pro Jahr (%)</label><input name="ret" inputmode="decimal" value="${fmtNum(p.ret, 1)}"></div>
        <div><label>Jahre</label><input name="years" inputmode="numeric" value="${p.years}"></div>
        <div><label>Inflation (%)</label><input name="infl" inputmode="decimal" value="${fmtNum(p.infl, 1)}"></div>
        <div><label>Sparrate steigt jährlich um (%)</label><input name="increase" inputmode="decimal" value="${fmtNum(p.increase || 0, 1)}"></div>
      </form>
      <div class="row tiny" style="margin:8px 0"><button class="btn sm shrink" data-projreset>Werte aus meinen Daten übernehmen</button></div>
      ${Charts.multi(rows.map(r => 'J' + r.y), [{ name: 'Vermögen', color: 'var(--accent)', values: rows.map(r => r.v) }, { name: 'inflationsbereinigt', color: 'var(--pos)', values: rows.map(r => r.real) }, { name: 'eingezahlt', color: 'var(--muted)', dash: true, values: rows.map(r => r.paid) }])}
      <div class="grid g3" style="margin-top:10px">
        <div class="kpi"><div class="label">In ${p.years} Jahren</div><div class="value num" style="font-size:22px">${fmtEUR(lastR.v, true)}</div><div class="sub muted">real (Kaufkraft heute): ${fmtEUR(lastR.real, true)}</div></div>
        <div class="kpi"><div class="label">Davon Zinseszins</div><div class="value num pos" style="font-size:22px">${fmtEUR(lastR.v - lastR.paid, true)}</div><div class="sub muted">${lastR.v ? fmtNum((lastR.v - lastR.paid) / lastR.v * 100, 0) : 0} % des Endvermögens</div></div>
        <div class="kpi"><div class="label">Finanzielle Freiheit (4 %-Regel)</div><div class="value" style="font-size:22px">${fire ? (fire.years != null ? 'in ' + fire.years + ' Jahren' : 'über 60 Jahre') : '–'}</div><div class="sub muted">${fire ? 'Ziel ' + fmtEUR(fire.target, true) + ' = 25 × Jahresausgaben' : 'zu wenige Ausgabendaten'}</div></div>
      </div><p class="tiny muted">Vereinfachte Modellrechnung ohne Steuern und Kosten; reale Renditen schwanken stark.</p></div>`;
    return h;
  };
  Views.planen.bind = function (root) {
    baseBind && baseBind.call(this, root);
    $$('[data-ptab]', root).forEach(b => b.onclick = () => { ui.ptab = b.dataset.ptab; App.render(); });
    const f = $('#proj-form', root);
    if (f) {
      $$('input', f).forEach(i => i.onchange = () => { const p = Projection.settings(); const d = formData(f); for (const [k, v] of Object.entries(d)) { if (v === '' && PRIV()) continue; const n = parseNum(v); if (!isNaN(n)) p[k] = k === 'years' ? Math.max(1, Math.min(60, Math.round(n))) : n; } Store.save(); App.render(); });
      $('[data-projreset]', root).onclick = () => { S().settings.projection = Projection.defaults(); Store.save(); App.render(); };
    }
  };
})();

/* ---------- Vermögen: Depot-Verlauf, Rebalancing, Dividenden ---------- */
(() => {
  const base = Views.vermoegen.render;
  Views.vermoegen.render = function () {
    let h = base.call(this); const st = S(); if (!st.accounts.some(isInvestAcc)) return h;
    // Depot-Verlauf
    const dh = ui.dh;
    h += `<div class="card"><div class="between"><h3>📈 Depot-Verlauf & Vergleich</h3></div>
      <p class="small muted">Rekonstruiert aus historischen Kursen und deinen Käufen. Vergleich: Was wäre, wenn du dieselben Beträge zu denselben Zeitpunkten in <b>${esc(st.settings.benchmark || 'EUNL.DE')}</b> (MSCI World) gesteckt hättest?</p>
      <div class="chips">${[['6mo', '6 M'], ['1y', '1 J'], ['2y', '2 J'], ['5y', '5 J']].map(([k, l]) => `<button class="chip ${dh.range === k ? 'active' : ''}" data-dhr="${k}">${l}</button>`).join('')}
        <button class="chip" data-dhload>${dh.loading ? 'lädt …' : dh.data ? '↻ neu laden' : '▶ Laden'}</button></div>`;
    if (dh.err) h += `<p class="small neg">${esc(dh.err)}</p>`;
    if (dh.data && dh.data.points.length > 1) {
      const pts = dh.data.points; const step = Math.max(1, Math.floor(pts.length / 120)); const sp = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      const lastP = pts[pts.length - 1]; const r1 = lastP.invested ? (lastP.value / lastP.invested - 1) * 100 : 0, r2 = lastP.invested ? (lastP.bench / lastP.invested - 1) * 100 : 0;
      h += Charts.multi(sp.map(p => fmtDate(p.d).slice(0, 6)), [{ name: 'Dein Depot', color: 'var(--accent)', values: sp.map(p => p.value) }, { name: dh.data.bm, color: 'var(--warn)', values: sp.map(p => p.bench) }, { name: 'eingezahlt', color: 'var(--muted)', dash: true, values: sp.map(p => p.invested) }]);
      h += `<div class="grid g2" style="margin-top:8px"><div class="kpi"><div class="label">Dein Depot</div><div class="value num ${clsAmt(r1)}" style="font-size:22px">${fmtPct(r1)}</div></div><div class="kpi"><div class="label">${esc(dh.data.bm)} mit gleichen Einzahlungen</div><div class="value num ${clsAmt(r2)}" style="font-size:22px">${fmtPct(r2)}</div></div></div>
        <p class="small">${r1 >= r2 ? '🏆 Du liegst vor dem Vergleichsindex.' : '📊 Der Vergleichsindex lag vorne – ein breiter ETF wäre einfacher gewesen.'} <span class="tiny muted">Rendite bezogen auf eingezahltes Kapital im Zeitraum.</span></p>`;
    } else if (!Prices.configured()) h += '<p class="small warn">Benötigt den Kurs-Proxy (Einstellungen).</p>';
    h += '</div>';
    // Rebalancing
    const rb = Rebalance.rows(); const hasT = Object.keys(st.targets || {}).length;
    h += `<div class="card"><div class="between"><h3>⚖️ Rebalancing</h3><button class="btn sm" data-act="rebalance">${hasT ? 'Ziele bearbeiten' : 'Zielaufteilung festlegen'}</button></div>`;
    if (hasT) {
      const sumT = Object.values(st.targets).reduce((s, v) => s + v, 0);
      h += `<div class="table-wrap"><table><thead><tr><th>Position</th><th class="r">Ist</th><th class="r">Ziel</th><th class="r">Abw.</th></tr></thead><tbody>${rb.rows.filter(r => r.target || r.cur > 0.5).map(r => { const t = r.target / sumT * 100; const dv = r.cur - t; return `<tr><td>${esc(r.p.name)}</td><td class="r num">${fmtNum(r.cur, 1)} %</td><td class="r num">${fmtNum(t, 1)} %</td><td class="r num ${Math.abs(dv) > 5 ? 'warn' : 'muted'}">${dv > 0 ? '+' : ''}${fmtNum(dv, 1)}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="tiny muted">Abweichungen über 5 Prozentpunkte sind markiert. Für einen Kaufvorschlag: „Ziele bearbeiten“ und Betrag eingeben.</p>`;
    } else h += '<p class="small muted">Lege fest, wie dein Depot aufgeteilt sein soll (z. B. 70 % World, 20 % Schwellenländer, 10 % Bitcoin). Die App zeigt dann Abweichungen und was du nachkaufen solltest.</p>';
    h += '</div>';
    // Dividenden
    const year = String(new Date().getFullYear()); const divs = st.trades.filter(t => t.type === 'div').sort((a, b) => b.date.localeCompare(a.date));
    const dy = divs.filter(t => t.date.startsWith(year)).reduce((s, t) => s + (t.amount || 0), 0); const dly = divs.filter(t => t.date.startsWith(String(+year - 1))).reduce((s, t) => s + (t.amount || 0), 0);
    h += `<div class="card"><div class="between"><h3>🪙 Dividenden & Ausschüttungen</h3><button class="btn sm" data-act="add-div">+ Erfassen</button></div>
      <div class="grid g2"><div class="kpi"><div class="label">${year}</div><div class="value num pos" style="font-size:22px">${fmtEUR(dy)}</div></div><div class="kpi"><div class="label">${+year - 1}</div><div class="value num" style="font-size:22px">${fmtEUR(dly)}</div></div></div>
      ${divs.length ? `<ul class="list">${divs.slice(0, 8).map(t => `<li class="item" data-div="${t.id}"><div class="main"><div class="t">${esc(t.name || t.ident)}</div><div class="s">${fmtDate(t.date)} · ${esc(accById(t.accountId)?.name || '')}</div></div><div class="amt num pos">${fmtSigned(t.amount)}</div></li>`).join('')}</ul>` : '<p class="small muted">Ausschüttungen kommen automatisch aus der Scalable-CSV oder lassen sich hier erfassen. Ausschüttende ETFs zahlen meist quartalsweise.</p>'}
      <p class="tiny muted">Freibetrag & Freistellungsaufträge: siehe <a href="#steuer">Steuer & Belege</a>.</p></div>`;
    return h;
  };
  const baseBind = Views.vermoegen.bind;
  Views.vermoegen.bind = function (root) {
    baseBind && baseBind.call(this, root);
    $$('[data-dhr]', root).forEach(b => b.onclick = () => { ui.dh.range = b.dataset.dhr; ui.dh.data = null; this.loadHistory(); });
    const l = $('[data-dhload]', root); if (l) l.onclick = () => { DepotHistory.cache = {}; this.loadHistory(); };
    $$('[data-div]', root).forEach(el => el.onclick = () => Dialogs.dividend(el.dataset.div));
  };
  Views.vermoegen.loadHistory = async function () {
    if (!Prices.configured()) { ui.dh.err = 'Bitte zuerst den Kurs-Proxy in den Einstellungen eintragen.'; return App.render(); }
    ui.dh.loading = true; ui.dh.err = ''; App.render();
    try { ui.dh.data = await DepotHistory.build(ui.dh.range); } catch (e) { ui.dh.err = 'Verlauf konnte nicht geladen werden: ' + e.message; }
    ui.dh.loading = false; if (App.view === 'vermoegen') App.render();
  };
})();

/* ---------- Auswertung: Tags ---------- */
(() => {
  const base = Views.auswertung.render;
  Views.auswertung.render = function () {
    let h = base.call(this); const cur = monthKey(todayISO());
    const tags = Analysis.byTag(addMonths(cur, -11), cur);
    h += `<div class="card"><h3>🏷️ Nach Tags (12 Monate)</h3>${tags.length ? `<ul class="list">${tags.map(t => `<li class="item" data-search="#${esc(t.tag)}"><div class="main"><div class="t">#${esc(t.tag)}</div><div class="s">${t.n} Buchungen</div></div><div class="amt num neg">${fmtEUR(-t.out)}</div></li>`).join('')}</ul>` : '<p class="small muted">Vergib Tags in einer Buchung (z. B. „Urlaub Italien“), um Ausgaben über Kategorien hinweg zusammenzufassen.</p>'}</div>`;
    return h;
  };
})();

/* ---------- Mehr ---------- */
Views.mehr = {
  title: 'Mehr',
  render() {
    const items = [['auswertung', '📊', 'Auswertung', 'Einnahmen, Ausgaben, Kategorien, Tags'], ['rueckblick', '🗓️', 'Monatsrückblick', 'Dein Monat auf einen Blick'], ['teilen', '👥', 'Ausgaben teilen', 'Wer schuldet wem?'], ['steuer', '🧾', 'Steuer & Belege', 'Absetzbares, Freibeträge'], ['planen', '🔮', 'Prognosen', 'Monatsende, Notgroschen, Zukunft'], ['einstellungen', '⚙️', 'Einstellungen', 'Sync, Sicherheit, Backup']];
    return `<div class="menu-grid">${items.map(([v, i, t, d]) => `<a href="#${v}" ${v === 'planen' ? 'data-ptab="prognose"' : ''}><span class="big">${i}</span>${t}<small>${d}</small></a>`).join('')}</div>`;
  },
  bind(root) { $$('[data-ptab]', root).forEach(a => a.addEventListener('click', () => { ui.ptab = 'prognose'; })); },
};

/* ---------- Monatsrückblick ---------- */
Views.rueckblick = {
  title: 'Rückblick',
  render() {
    const key = ui.recapKey || Recap.lastKey(); const r = Recap.build(key);
    if (key === Recap.lastKey() && S().settings.recapSeen !== key) { S().settings.recapSeen = key; Store.save(); }
    let h = `<div class="between" style="margin-bottom:10px"><button class="icon-btn" data-rk="-1">‹</button><b>${monthLabel(key)}</b><button class="icon-btn" data-rk="1" ${key >= Recap.lastKey() ? 'disabled' : ''}>›</button></div>`;
    if (!r.hasData) return h + emptyBox('🗓️', 'Keine Daten für diesen Monat', 'Importiere Umsätze für diesen Zeitraum.');
    const lines = [];
    if (r.expDiff != null) lines.push(r.expDiff <= 0 ? `👏 Du hast <b>${fmtNum(-r.expDiff, 0)} % weniger</b> ausgegeben als im Schnitt der drei Monate davor.` : `📈 Du hast <b>${fmtNum(r.expDiff, 0)} % mehr</b> ausgegeben als im Schnitt der drei Monate davor.`);
    if (r.rate != null) lines.push(r.rate >= 0 ? `💰 Sparquote: <b>${fmtNum(r.rate, 0)} %</b> deines Einkommens ist übrig geblieben.` : `⚠️ Du hast <b>mehr ausgegeben als eingenommen</b>.`);
    if (r.top) lines.push(`${r.top.cat.icon} Größter Posten: <b>${esc(r.top.cat.name)}</b> mit ${fmtEUR(r.top.value, true)}.`);
    for (const c of r.up) lines.push(`🔺 ${esc(c.cat.name)}: ${PRIV() ? 'deutlich mehr' : fmtEUR(c.diff, true) + ' mehr'} als üblich.`);
    for (const c of r.down) lines.push(`🔻 ${esc(c.cat.name)}: ${PRIV() ? 'deutlich weniger' : fmtEUR(-c.diff, true) + ' weniger'} als üblich.`);
    if (r.netChange != null) lines.push(`🏦 Nettovermögen: ${PRIV() ? (r.netChangePct != null ? fmtPct(r.netChangePct) : '') : fmtSigned(r.netChange)} im Monatsverlauf.`);
    if (r.budgetsOver.length) lines.push(`🚨 Budget überschritten: ${r.budgetsOver.map(b => esc(b.cat.name)).join(', ')}.`);
    else if (r.budgetsOk.length) lines.push(`✅ Alle ${r.budgetsOk.length} Budgets eingehalten.`);
    for (const c of r.priceUps) lines.push(`💸 Preiserhöhung: ${esc(c.customName || c.name)} (${fmtSigned(c.priceChange)}).`);
    for (const c of r.newContracts) lines.push(`🆕 Neuer wiederkehrender Posten: ${esc(c.customName || c.name)} (${fmtEUR(c.amount)}).`);
    h += `<div class="grid g3"><div class="card kpi"><div class="label">Einnahmen</div><div class="value num pos">${fmtEUR(r.inc, true)}</div></div><div class="card kpi"><div class="label">Ausgaben</div><div class="value num neg">${fmtEUR(r.exp, true)}</div><div class="sub muted">Ø vorher ${fmtEUR(r.avgExp, true)}</div></div><div class="card kpi"><div class="label">Gespart / investiert</div><div class="value num">${fmtEUR(r.saved, true)}</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Das Wichtigste</h3>${lines.map(l => `<p style="margin:8px 0">${l}</p>`).join('')}</div>
      <div class="card"><h3>Ausgaben nach Kategorie</h3>${Charts.donut(Analysis.byCategory(key, key).map(c => ({ label: c.cat.name, value: c.value, color: c.cat.color })))}</div>`;
    return h;
  },
  bind(root) { $$('[data-rk]', root).forEach(b => b.onclick = () => { ui.recapKey = addMonths(ui.recapKey || Recap.lastKey(), +b.dataset.rk); App.render(); }); },
};

/* ---------- Ausgaben teilen ---------- */
Views.teilen = {
  title: 'Teilen',
  render() {
    const sh = Shared.data(); const bal = Shared.balances();
    let h = `<div class="row" style="margin-bottom:12px"><button class="btn primary shrink" data-act="shared-add">+ Gemeinsame Ausgabe</button><button class="btn shrink" data-act="person-add">+ Person</button></div>`;
    if (!sh.people.length) return h + emptyBox('👥', 'Gemeinsam ausgeben, fair aufteilen', 'Füge Personen hinzu (Partnerin, WG, Freunde) und erfasse gemeinsame Ausgaben. Eine Buchung aus deinen Umsätzen kannst du direkt über „Mit jemandem teilen“ aufteilen.');
    h += '<div class="grid g2">';
    for (const p of sh.people) {
      const v = bal[p.id] || 0;
      h += `<div class="card"><div class="between"><h3 style="margin:0" data-person="${p.id}">${esc(p.name)} <span class="tiny muted">✎</span></h3><button class="btn sm" data-settle="${p.id}">Ausgleichen</button></div>
        <div class="kpi" style="margin-top:8px"><div class="value num ${v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : ''}" style="font-size:22px">${Math.abs(v) < 0.005 ? 'quitt' : fmtEUR(Math.abs(v))}</div><div class="sub muted">${v > 0.005 ? 'schuldet dir' : v < -0.005 ? 'du schuldest' : 'Alles ausgeglichen'}</div></div></div>`;
    }
    h += '</div>';
    if (sh.entries.length) {
      h += `<div class="card" style="margin-top:14px"><h3>Verlauf</h3><ul class="list">${sh.entries.slice(0, 100).map(e => {
        if (e.type === 'settle') { const p = Shared.person(e.person); return `<li class="item" data-sdelete="${e.id}"><div class="ic" style="background:var(--card2)">🤝</div><div class="main"><div class="t">Ausgleich ${e.dir === 'toMe' ? 'von ' + esc(p?.name || '?') : 'an ' + esc(p?.name || '?')}</div><div class="s">${fmtDate(e.date)}</div></div><div class="amt num">${fmtEUR(e.amount)}</div></li>`; }
        const who = e.paidBy === 'me' ? 'Du hast' : esc(Shared.person(e.paidBy)?.name || '?') + ' hat'; const names = [...(e.includeMe ? ['dir'] : []), ...e.with.map(x => esc(Shared.person(x)?.name || '?'))].join(', ');
        return `<li class="item" data-sentry="${e.id}"><div class="ic" style="background:var(--card2)">🧾</div><div class="main"><div class="t">${esc(e.desc)}</div><div class="s">${fmtDate(e.date)} · ${who} bezahlt · geteilt mit ${names || '–'}</div></div><div class="amt num"><div>${fmtEUR(e.amount)}</div><div class="tiny muted">dein Anteil ${fmtEUR(Shared.myShare(e))}</div></div></li>`;
      }).join('')}</ul></div>`;
    }
    return h;
  },
  bind(root) {
    $$('[data-settle]', root).forEach(b => b.onclick = () => Dialogs.settle(b.dataset.settle));
    $$('[data-person]', root).forEach(b => b.onclick = () => Dialogs.person(b.dataset.person));
    $$('[data-sentry]', root).forEach(b => b.onclick = () => Dialogs.sharedEntry(b.dataset.sentry));
    $$('[data-sdelete]', root).forEach(b => b.onclick = async () => { if (await confirmDialog('Diesen Ausgleich löschen?', { ok: 'Löschen', danger: true })) { const sh = Shared.data(); sh.entries = sh.entries.filter(x => x.id !== b.dataset.sdelete); Store.save(); App.render(); } });
  },
};

/* ---------- Steuer & Belege ---------- */
Views.steuer = {
  title: 'Steuer',
  navTitle: 'Steuer & Belege',
  render() {
    const y = ui.taxYear; const list = Tax.list(y); const ci = CapitalIncome.summary(y);
    const groups = {}; for (const t of list) (groups[t.taxType || 'sonstiges'] || (groups[t.taxType || 'sonstiges'] = [])).push(t);
    let h = `<div class="row" style="margin-bottom:12px"><select id="tax-year" class="shrink" style="width:110px">${Tax.years().map(x => `<option ${x === y ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="btn shrink" data-act="tax-csv" ${list.length ? '' : 'disabled'}>⬇ Liste als CSV (für Steuererklärung)</button></div>`;
    h += `<div class="card"><h3>📋 Steuerlich relevante Ausgaben ${y}</h3>`;
    if (!list.length) h += '<p class="small muted">Markiere Buchungen als „Steuerlich relevant“ (Buchung antippen). Typisch im Studium: Fachliteratur, Laptop/Arbeitsmittel, Fahrten zur Uni, Semesterbeiträge, Bewerbungskosten. Im Masterstudium nach abgeschlossenem Bachelor können solche Kosten oft als Werbungskosten zählen – kläre die Details mit Lohnsteuerhilfe oder Steuerberatung.</p>';
    for (const [k, ts] of Object.entries(groups)) {
      const sum = ts.reduce((s, t) => s - t.amount, 0);
      h += `<h4 style="margin-top:14px">${esc(TAX_TYPES[k] || k)} · <span class="num">${fmtEUR(sum)}</span></h4><ul class="list">${ts.map(txItem).join('')}</ul>`;
    }
    const noRc = list.filter(t => !(t.receipts && t.receipts.length)).length;
    if (noRc) h += `<div class="alert warn">📎 ${noRc} Buchung${noRc > 1 ? 'en' : ''} ohne Beleg – füge am besten gleich ein Foto der Rechnung hinzu.</div>`;
    h += '</div>';
    h += `<div class="card"><h3>🪙 Kapitalerträge & Freistellungsaufträge ${y}</h3>
      <p class="small muted">Zinsen, Dividenden und realisierte Kursgewinne je Bank im Vergleich zu deinem Freistellungsauftrag. Sparerpauschbetrag: ${fmtEUR(ci.pausch, true)} pro Person und Jahr (änderbar in den Einstellungen).</p>`;
    if (ci.rows.length) {
      h += `<div class="table-wrap"><table><thead><tr><th>Konto</th><th class="r">Zinsen</th><th class="r">Dividenden</th><th class="r">Kursgewinne</th><th class="r">Freistellung</th><th class="r">Ausgeschöpft</th></tr></thead><tbody>
        ${ci.rows.map(r => `<tr data-account="${r.acc.id}" style="cursor:pointer"><td>${esc(r.acc.name)}</td><td class="r num">${fmtEUR(r.interest)}</td><td class="r num">${fmtEUR(r.div)}</td><td class="r num ${clsAmt(r.gains)}">${fmtEUR(r.gains)}</td><td class="r num">${r.fsa ? fmtEUR(r.fsa, true) : '–'}</td><td class="r num ${r.over > 0 ? 'neg' : ''}">${r.fsa ? fmtNum(Math.min(999, r.total / r.fsa * 100), 0) + ' %' : r.total > 0 ? '<span class="warn">kein FSA</span>' : '–'}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else h += '<p class="small muted">Noch keine Kapitalerträge erfasst.</p>';
    h += `${kv('Kapitalerträge gesamt', fmtEUR(ci.total))}${kv('Freistellungsaufträge gesamt', fmtEUR(ci.fsaSum, true), ci.overAllocated ? 'neg' : '')}${kv('Sparerpauschbetrag genutzt', fmtNum(ci.total / ci.pausch * 100, 0) + ' %')}
      ${ci.overAllocated ? '<div class="alert bad">Deine Freistellungsaufträge sind zusammen höher als der Sparerpauschbetrag – bitte bei einer Bank reduzieren.</div>' : ''}
      <p class="tiny muted">Freistellungsauftrag je Konto eintragen: Konto in „Vermögen“ antippen. Vereinfachte Rechnung: Teilfreistellung bei Aktien-ETFs (30 %) und Vorabpauschale sind nicht berücksichtigt. Keine Steuerberatung.</p></div>`;
    return h;
  },
  bind(root) { const s = $('#tax-year', root); if (s) s.onchange = () => { ui.taxYear = s.value; App.render(); }; },
};
