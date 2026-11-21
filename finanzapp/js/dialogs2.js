'use strict';
/* Weitere Dialoge: Dividenden, Rebalancing, gemeinsame Ausgaben */
Object.assign(Dialogs, {
  syncPair() {
    const m = openModal('Mit anderem Gerät koppeln', `<form><p class="small">Öffne auf dem Gerät, auf dem der Sync schon läuft, <b>Einstellungen → Kopplungscode anzeigen</b>, und füge den Code hier ein.</p>
      <p class="tiny warn">Achtung: Die Daten auf <b>diesem</b> Gerät werden durch den Stand vom Server ersetzt.</p>
      <textarea name="code" rows="4" required placeholder="FA1-…" style="font-family:monospace;font-size:12px"></textarea>
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Koppeln</button></div></form>`);
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      try { await Sync.pair(e.target.code.value); m.close(); App.applyTheme(); App.render(); toast('✓ Gekoppelt – Daten übernommen', 4000); }
      catch (err) { toast('✗ ' + err.message, 6000); }
    };
  },
  syncCode() {
    const code = Sync.pairingCode();
    const m = openModal('Kopplungscode', `<p class="small">Mit diesem Code kann ein weiteres Gerät deine Daten entschlüsseln. <b>Behandle ihn wie ein Passwort</b> – übertrage ihn nur privat (z. B. Notiz an dich selbst, USB, persönlich abtippen) und lösche ihn danach.</p>
      <textarea rows="5" readonly style="font-family:monospace;font-size:12px" data-code>${esc(code)}</textarea>
      <div class="modal-actions"><button class="btn primary" data-copy>Kopieren</button></div>`);
    m.querySelector('[data-copy]').onclick = () => copyText(code);
  },
  bioEnable() {
    const m = openModal('Fingerabdruck einrichten', `<form><p class="small">Bestätige einmal dein App-Passwort. Danach legt dein Handy einen Passkey an, und du entsperrst künftig per Fingerabdruck. Das Passwort funktioniert weiterhin.</p>
      <label>App-Passwort</label><input name="pw" type="password" required autocomplete="current-password">
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Einrichten</button></div></form>`);
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const pw = e.target.pw.value;
      try { const blob = await DB.get('vault'); await Crypto.decrypt(await Crypto.deriveKey(pw, Crypto.unb64(blob.salt), blob.iter || Crypto.ITER), blob); } catch { return toast('Passwort falsch'); }
      try { await Bio.enable(pw); m.close(); App.render(); toast('✓ Fingerabdruck-Entsperrung aktiv'); }
      catch (err) { toast('✗ ' + (err.name === 'NotAllowedError' ? 'Abgebrochen' : err.message), 6000); }
    };
  },

  dividend(id) {
    const invAccs = S().accounts.filter(isInvestAcc);
    if (!invAccs.length) return toast('Lege zuerst ein Depot an');
    const t = id ? S().trades.find(x => x.id === id) : { date: todayISO(), accountId: invAccs[0].id, ident: '', amount: '' };
    const posOpts = acc => S().positions.filter(p => p.accountId === acc).map(p => `<option value="${esc(p.isin || p.ident || p.symbol || p.id)}" ${(p.isin || p.ident || p.symbol || p.id) === t.ident ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const m = openModal(id ? 'Ausschüttung' : 'Dividende / Ausschüttung erfassen', `<form>
      <label>Depot</label><select name="accountId">${accOptions(t.accountId, isInvestAcc)}</select>
      <label>Wertpapier</label><select name="ident">${posOpts(t.accountId)}<option value="">— anderes / unbekannt —</option></select>
      <div class="row"><div><label>Betrag netto erhalten (€)</label><input name="amount" inputmode="decimal" required value="${t.amount ? fmtNum(t.amount) : ''}"></div><div><label>Datum</label><input type="date" name="date" value="${t.date}" required></div></div>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form'); f.accountId.onchange = () => { f.ident.innerHTML = posOpts(f.accountId.value) + '<option value="">— anderes —</option>'; };
    f.onsubmit = e => {
      e.preventDefault(); const d = formData(f); const p = S().positions.find(x => (x.isin || x.ident || x.symbol || x.id) === d.ident);
      const tr = id ? t : { id: uid(), type: 'div', shares: 0, price: 0, fee: 0, manual: true, hash: 'm' + uid() };
      Object.assign(tr, { accountId: d.accountId, ident: d.ident || 'DIV', name: p ? p.name : 'Ausschüttung', amount: Math.abs(parseNum(d.amount)) || 0, date: d.date });
      if (!id) S().trades.push(tr); Store.save(); m.close(); App.render();
    };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = () => { S().trades = S().trades.filter(x => x.id !== id); Store.save(); m.close(); App.render(); };
  },

  rebalance() {
    const { rows } = Rebalance.rows();
    if (!rows.length) return toast('Noch keine Positionen');
    const m = openModal('Rebalancing – Zielaufteilung', `
      <p class="small muted">Lege fest, wie viel Prozent jede Position ausmachen soll. Positionen ohne Ziel bekommen 0 %. Die Summe sollte 100 % ergeben.</p>
      <div class="table-wrap"><table><thead><tr><th>Position</th><th class="r">Aktuell</th><th class="r">Ziel %</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.p.name)}</td><td class="r num">${fmtNum(r.cur, 1)} %</td><td class="r"><input data-tg="${r.p.id}" inputmode="decimal" value="${r.target || ''}" style="width:80px;padding:5px 8px;text-align:right"></td></tr>`).join('')}
      </tbody></table></div><p class="small" data-sum></p>
      <div class="row" style="margin-top:6px"><div><label>Neues Geld zum Investieren (€)</label><input data-new inputmode="decimal" placeholder="z. B. 300"></div>
        <label class="check shrink" style="margin-top:28px"><input type="checkbox" data-sell> Auch Verkäufe vorschlagen</label></div>
      <div data-plan></div>
      <div class="modal-actions"><button class="btn" data-close>Schließen</button><button class="btn primary" data-save>Ziele speichern</button></div>`, { wide: true });
    const read = () => { const tg = {}; $$('[data-tg]', m).forEach(i => { const v = parseNum(i.value); if (v > 0) tg[i.dataset.tg] = v; }); return tg; };
    const upd = () => {
      const tg = read(); const sum = Object.values(tg).reduce((s, v) => s + v, 0);
      m.querySelector('[data-sum]').innerHTML = `Summe der Ziele: <b class="${Math.abs(sum - 100) > 0.5 ? 'warn' : 'pos'}">${fmtNum(sum, 1)} %</b>${Math.abs(sum - 100) > 0.5 && sum ? ' (wird anteilig auf 100 % hochgerechnet)' : ''}`;
      const old = S().targets; S().targets = tg;
      const amt = parseNum(m.querySelector('[data-new]').value) || 0; const sell = m.querySelector('[data-sell]').checked;
      const plan = sum ? Rebalance.plan(amt, sell) : []; S().targets = old;
      const rowsP = plan.filter(r => Math.abs(r.trade) >= 1);
      m.querySelector('[data-plan]').innerHTML = !sum ? '' : `<h4 style="margin-top:14px">Vorschlag</h4>${rowsP.length ? `<div class="table-wrap"><table><thead><tr><th>Position</th><th class="r">Ist → Ziel</th><th class="r">${sell ? 'Kaufen/Verkaufen' : 'Kaufen'}</th></tr></thead><tbody>${rowsP.map(r => `<tr><td>${esc(r.p.name)}</td><td class="r num">${fmtNum(r.cur, 1)} % → ${fmtNum(r.target / sum * 100, 1)} %</td><td class="r num ${r.trade < 0 ? 'neg' : 'pos'}">${PRIV() ? (r.trade > 0 ? 'kaufen' : 'verkaufen') : fmtSigned(r.trade)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Gib einen Betrag ein, um einen Kaufvorschlag zu sehen.</p>'}`;
    };
    $$('input', m).forEach(i => i.addEventListener('input', debounce(upd, 250))); m.querySelector('[data-sell]').onchange = upd; upd();
    m.querySelector('[data-save]').onclick = () => { S().targets = read(); Store.save(); m.close(); App.render(); toast('Zielaufteilung gespeichert'); };
  },

  /* ---------- Gemeinsame Ausgaben ---------- */
  person(id) {
    const sh = Shared.data(); const p = id ? Shared.person(id) : { name: '' };
    const m = openModal(id ? 'Person' : 'Person hinzufügen', `<form><label>Name</label><input name="name" required value="${esc(p.name)}" placeholder="z. B. Lena, WG">
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Entfernen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const n = e.target.name.value.trim(); if (id) p.name = n; else sh.people.push({ id: uid(), name: n }); Store.save(); m.close(); App.render(); };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = async () => { if (await confirmDialog(`${p.name} und alle gemeinsamen Einträge entfernen?`, { ok: 'Entfernen', danger: true })) { sh.people = sh.people.filter(x => x.id !== id); sh.entries = sh.entries.filter(e => e.person !== id && e.paidBy !== id); sh.entries.forEach(e => { if (e.with) e.with = e.with.filter(x => x !== id); }); sh.entries = sh.entries.filter(e => e.type === 'settle' || e.with.length); Store.save(); closeAllModals(); App.render(); } };
  },
  sharedEntry(id, preset) {
    const sh = Shared.data(); if (!sh.people.length) { toast('Füge zuerst eine Person hinzu'); return this.person(); }
    const e = id ? sh.entries.find(x => x.id === id) : { date: todayISO(), desc: '', amount: '', paidBy: 'me', with: sh.people.length === 1 ? [sh.people[0].id] : [], includeMe: true, ...(preset || {}) };
    const m = openModal(id ? 'Gemeinsame Ausgabe' : 'Gemeinsame Ausgabe', `<form>
      <label>Wofür?</label><input name="desc" required value="${esc(e.desc)}" placeholder="z. B. Einkauf, Pizza, Urlaub">
      <div class="row"><div><label>Betrag gesamt (€)</label><input name="amount" inputmode="decimal" required value="${e.amount ? fmtNum(e.amount) : ''}"></div><div><label>Datum</label><input type="date" name="date" value="${e.date}"></div></div>
      <label>Bezahlt von</label><select name="paidBy"><option value="me">Mir</option>${sh.people.map(p => `<option value="${p.id}" ${e.paidBy === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <label>Aufteilen zwischen (zu gleichen Teilen – wer bezahlt hat, ist automatisch dabei)</label>
      <label class="check"><input type="checkbox" name="includeMe" ${e.includeMe ? 'checked' : ''}> Mir</label>
      ${sh.people.map(p => `<label class="check"><input type="checkbox" data-with="${p.id}" ${e.with.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}
      <p class="small" data-info></p>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form');
    const info = () => { const amt = parseNum(f.amount.value) || 0; const n = $$('[data-with]:checked', m).filter(x => x.dataset.with !== f.paidBy.value).length + (f.includeMe.checked ? 1 : 0) + (f.paidBy.value !== 'me' ? 1 : 0); m.querySelector('[data-info]').textContent = n ? `= ${fmtEUR(amt / n)} pro Person` : ''; };
    $$('input', f).forEach(i => i.addEventListener('input', info)); $$('input[type=checkbox]', f).forEach(i => i.addEventListener('change', info)); info();
    f.onsubmit = ev => {
      ev.preventDefault(); const d = formData(f); const w = $$('[data-with]:checked', m).map(x => x.dataset.with);
      if (!w.length && d.paidBy === 'me') return toast('Mindestens eine Person auswählen');
      const en = id ? e : { id: uid(), type: 'expense', txId: e.txId };
      Object.assign(en, { desc: d.desc.trim(), amount: Math.abs(parseNum(d.amount)) || 0, date: d.date, paidBy: d.paidBy, with: w.filter(x => x !== d.paidBy), includeMe: !!d.includeMe });
      if (!id) { sh.entries.unshift(en); if (en.txId) { const t = S().transactions.find(x => x.id === en.txId); if (t) t.sharedId = en.id; } }
      Store.save(); m.close(); App.render();
    };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = () => { sh.entries = sh.entries.filter(x => x.id !== id); const t = S().transactions.find(x => x.sharedId === id); if (t) delete t.sharedId; Store.save(); m.close(); App.render(); };
  },
  shareTx(txId) {
    const t = S().transactions.find(x => x.id === txId); if (!t) return;
    if (t.sharedId) { const e = Shared.data().entries.find(x => x.id === t.sharedId); if (e) return this.sharedEntry(e.id); }
    this.sharedEntry(null, { desc: t.payee || t.purpose, amount: Math.abs(t.amount), date: t.date, paidBy: 'me', txId });
  },
  settle(pid) {
    const p = Shared.person(pid); const bal = Shared.balances()[pid] || 0;
    const m = openModal('Ausgleichen mit ' + p.name, `<form><p class="small">${bal > 0 ? `${esc(p.name)} schuldet dir <b>${fmtEUR(bal)}</b>.` : bal < 0 ? `Du schuldest ${esc(p.name)} <b>${fmtEUR(-bal)}</b>.` : 'Ihr seid quitt.'}</p>
      <label>Gezahlter Betrag (€)</label><input name="amount" inputmode="decimal" required value="${bal ? fmtNum(Math.abs(bal)) : ''}">
      <label>Richtung</label><select name="dir"><option value="toMe" ${bal >= 0 ? 'selected' : ''}>${esc(p.name)} hat mir gezahlt</option><option value="fromMe" ${bal < 0 ? 'selected' : ''}>Ich habe ${esc(p.name)} gezahlt</option></select>
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const d = formData(e.target); Shared.data().entries.unshift({ id: uid(), type: 'settle', person: pid, amount: Math.abs(parseNum(d.amount)) || 0, dir: d.dir, date: todayISO() }); Store.save(); m.close(); App.render(); toast('Ausgleich gespeichert'); };
  },
});
