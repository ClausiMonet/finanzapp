'use strict';
/* Dialoge zum Anlegen und Bearbeiten */
const Dialogs = {
  /* ---------- Konto ---------- */
  account(id) {
    const a = id ? accById(id) : { type: 'giro', name: '' };
    const inv = isInvestAcc(a);
    const m = openModal(id ? 'Konto bearbeiten' : 'Neues Konto', `<form>
      <label>Name</label><input name="name" required value="${esc(a.name)}" placeholder="z. B. Sparkasse Giro, Scalable Depot, Bitvavo">
      <label>Kontoart</label><select name="type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('')}</select>
      <div data-cashonly><label>Aktueller Kontostand (€)</label><input name="balance" inputmode="decimal" value="${id && !inv ? fmtNum(accountBalance(a)) : ''}" placeholder="0,00">
        <p class="tiny muted">Wird mit den importierten Umsätzen verrechnet. Stimmt der Stand später nicht mehr, trägst du hier einfach den echten Kontostand ein.</p></div>
      <div data-invonly><label>Guthaben/Cash im Depot (€, optional)</label><input name="cash" inputmode="decimal" value="${a.cash ? fmtNum(a.cash) : ''}" placeholder="0,00"></div>
      <label>IBAN / Notiz (optional)</label><input name="iban" value="${esc(a.iban || '')}">
      <label>Freistellungsauftrag bei dieser Bank (€, optional)</label><input name="fsa" inputmode="decimal" value="${a.fsa ? fmtNum(a.fsa, 0) : ''}" placeholder="z. B. 500">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--text)"><input type="checkbox" name="excludeStats" ${a.excludeStats ? 'checked' : ''}> Nicht in Einnahmen/Ausgaben-Statistik zählen</label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500;color:var(--text)"><input type="checkbox" name="hidden" ${a.hidden ? 'checked' : ''}> Nicht ins Nettovermögen einrechnen</label>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form');
    const sync = () => { const i = ['depot', 'krypto'].includes(f.type.value); m.querySelector('[data-cashonly]').classList.toggle('hidden', i); m.querySelector('[data-invonly]').classList.toggle('hidden', !i); };
    f.type.onchange = sync; sync();
    f.onsubmit = e => {
      e.preventDefault(); const d = formData(f);
      const acc = id ? a : { id: uid() };
      Object.assign(acc, { name: d.name.trim(), type: d.type, iban: d.iban.trim(), excludeStats: !!d.excludeStats, hidden: !!d.hidden, fsa: parseNum(d.fsa) || 0 });
      if (!id) S().accounts.push(acc);
      if (isInvestAcc(acc)) acc.cash = parseNum(d.cash) || 0;
      else { const b = parseNum(d.balance); if (!isNaN(b)) acc.offset = b - txSum(acc.id); else if (acc.offset == null) acc.offset = 0; }
      Store.save(); recordSnapshot(); m.close(); App.render(); toast('Konto gespeichert');
    };
    const del = m.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      const n = S().transactions.filter(t => t.accountId === id).length + S().positions.filter(p => p.accountId === id).length;
      if (!await confirmDialog(`„${a.name}“ und ${n} zugehörige Umsätze/Positionen löschen?`, { ok: 'Löschen', danger: true })) return;
      const st = S(); st.accounts = st.accounts.filter(x => x.id !== id); st.transactions = st.transactions.filter(t => t.accountId !== id);
      st.positions = st.positions.filter(p => p.accountId !== id); st.trades = st.trades.filter(t => t.accountId !== id);
      Store.save(); closeAllModals(); App.render();
    };
  },

  /* ---------- Buchung ---------- */
  tx(id) {
    const cashAccs = S().accounts.filter(a => !isInvestAcc(a));
    if (!cashAccs.length) { toast('Lege zuerst ein Konto an'); return this.account(); }
    const t = id ? S().transactions.find(x => x.id === id) : { date: todayISO(), amount: -0, accountId: ui.acc || cashAccs[0].id, categoryId: 'sonstiges', payee: '', purpose: '', tags: [], splits: [], receipts: [] };
    if (!t) return;
    const isIn = t.amount > 0;
    let splits = (t.splits || []).map(p => ({ ...p, amount: Math.abs(p.amount) }));
    let receipts = [...(t.receipts || [])];
    const taxTypes = TAX_TYPES;
    const m = openModal(id ? 'Buchung' : 'Neue Buchung', `<form>
      <div class="chips"><button type="button" class="chip ${!isIn ? 'active' : ''}" data-sign="-1">Ausgabe</button><button type="button" class="chip ${isIn ? 'active' : ''}" data-sign="1">Einnahme</button></div>
      <div class="row"><div><label>Betrag (€)</label><input name="amount" inputmode="decimal" required value="${t.amount ? fmtNum(Math.abs(t.amount)) : ''}" placeholder="0,00"></div>
        <div><label>Datum</label><input name="date" type="date" required value="${t.date}"></div></div>
      <label>Empfänger / Auftraggeber</label><input name="payee" value="${esc(t.payee)}">
      <label>Verwendungszweck</label><input name="purpose" value="${esc(t.purpose)}">
      <label>Kategorie${splits.length ? ' (Rest)' : ''}</label><select name="categoryId">${catOptions(t.categoryId)}</select>
      ${id && t.payee ? `<label class="check"><input type="checkbox" name="mkrule"> Kategorie für alle Buchungen von „${esc(t.payee.slice(0, 40))}“ merken</label>` : ''}
      <div data-splits></div>
      <button type="button" class="btn sm" data-addsplit style="margin-top:8px">✂ Auf mehrere Kategorien aufteilen</button>
      <label>Tags (mit Komma trennen)</label><input name="tags" list="tag-list" value="${esc((t.tags || []).join(', '))}" placeholder="z. B. Urlaub Italien, Geburtstag">
      <datalist id="tag-list">${Analysis.allTags().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="row" style="margin-top:10px"><label class="check" style="margin:0"><input type="checkbox" name="tax" ${t.tax ? 'checked' : ''}> Steuerlich relevant</label>
        <select name="taxType" class="${t.tax ? '' : 'hidden'}">${Object.entries(taxTypes).map(([k, v]) => `<option value="${k}" ${t.taxType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <label>Belege</label><div class="receipts" data-receipts></div>
      <button type="button" class="btn sm" data-addrcpt>📎 Beleg hinzufügen (Foto/PDF)</button>
      <label>Konto</label><select name="accountId">${accOptions(t.accountId, a => !isInvestAcc(a))}</select>
      <label>Notiz</label><input name="note" value="${esc(t.note || '')}">
      ${t.kind ? `<p class="tiny muted">Buchungsart laut Bank: ${esc(t.kind)}</p>` : ''}
      ${t.ppOrig ? `<p class="tiny muted">Ursprünglich auf dem Kontoauszug: ${esc(t.ppOrig)} (über PayPal-Abgleich ersetzt)</p>` : ''}
      ${id ? `<p class="tiny"><button type="button" class="btn link tiny" data-share>👥 Mit jemandem teilen</button>${t.sharedId ? ' <span class="badge ok">geteilt</span>' : ''}</p>` : ''}
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form'); let sign = isIn ? 1 : -1;
    $$('[data-sign]', m).forEach(b => b.onclick = () => { sign = +b.dataset.sign; $$('[data-sign]', m).forEach(x => x.classList.toggle('active', x === b)); });
    f.tax.onchange = () => f.taxType.classList.toggle('hidden', !f.tax.checked);
    const renderSplits = () => {
      const box = m.querySelector('[data-splits]');
      if (!splits.length) { box.innerHTML = ''; return; }
      const total = Math.abs(parseNum(f.amount.value)) || 0; const used = splits.reduce((s, p) => s + (+p.amount || 0), 0);
      box.innerHTML = `<div class="card" style="padding:10px;margin:10px 0 0">${splits.map((p, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><select data-scat="${i}">${catOptions(p.categoryId)}</select><input data-samt="${i}" inputmode="decimal" style="width:100px;flex:0 0 100px" value="${p.amount ? fmtNum(p.amount) : ''}" placeholder="Betrag"><button type="button" class="icon-btn" data-sdel="${i}" style="flex:0 0 38px">✕</button></div>`).join('')}
        <div class="tiny ${used > total + 0.005 ? 'neg' : 'muted'}">Aufgeteilt: ${fmtNum(used)} € von ${fmtNum(total)} € · Rest ${fmtNum(total - used)} € → Hauptkategorie</div></div>`;
      $$('[data-scat]', box).forEach(s => s.onchange = () => splits[+s.dataset.scat].categoryId = s.value);
      $$('[data-samt]', box).forEach(s => s.onchange = () => { splits[+s.dataset.samt].amount = Math.abs(parseNum(s.value)) || 0; renderSplits(); });
      $$('[data-sdel]', box).forEach(b => b.onclick = () => { splits.splice(+b.dataset.sdel, 1); renderSplits(); });
    };
    m.querySelector('[data-addsplit]').onclick = () => { splits.push({ categoryId: 'sonstiges', amount: 0 }); renderSplits(); };
    f.amount.addEventListener('change', renderSplits); renderSplits();
    const renderRcpts = async () => {
      const box = m.querySelector('[data-receipts]');
      box.innerHTML = receipts.length ? receipts.map(r => `<div class="rc" data-rview="${r}"><span class="muted tiny">lädt…</span><button type="button" class="rc-del" data-rdel="${r}">✕</button></div>`).join('') : '<span class="tiny muted">Keine Belege</span>';
      for (const r of receipts) {
        const el = box.querySelector(`[data-rview="${r}"]`); const d = await Receipts.load(r).catch(() => null); if (!el) continue;
        if (!d) { el.firstChild.textContent = 'fehlt'; continue; }
        el.firstChild.outerHTML = d.type.startsWith('image/') ? `<img src="${d.url}" alt="Beleg">` : '<span class="pdf">PDF</span>';
      }
      $$('[data-rview]', box).forEach(el => el.onclick = e => { if (e.target.closest('[data-rdel]')) return; Receipts.view(el.dataset.rview); });
      $$('[data-rdel]', box).forEach(b => b.onclick = async () => { if (await confirmDialog('Beleg entfernen?', { ok: 'Entfernen', danger: true })) { receipts = receipts.filter(x => x !== b.dataset.rdel); Receipts.remove(b.dataset.rdel); renderRcpts(); } });
    };
    m.querySelector('[data-addrcpt]').onclick = async () => {
      const files = await pickFile('image/*,application/pdf', true);
      for (const file of files) { try { receipts.push(await Receipts.add(file)); } catch (e) { toast(e.message, 4000); } }
      renderRcpts();
    };
    renderRcpts();
    const collect = () => {
      const d = formData(f); const amt = Math.abs(parseNum(d.amount));
      if (isNaN(amt)) { toast('Betrag ungültig'); return null; }
      const sp = splits.filter(p => p.amount > 0).map(p => ({ categoryId: p.categoryId, amount: Math.round(sign * p.amount * 100) / 100 }));
      if (sp.reduce((s, p) => s + Math.abs(p.amount), 0) > amt + 0.005) { toast('Aufteilung ist größer als der Betrag'); return null; }
      return { d, amt, sp };
    };
    f.onsubmit = e => {
      e.preventDefault(); const c = collect(); if (!c) return; const { d, amt, sp } = c;
      const tx = id ? t : { id: uid(), hash: 'm' + uid() };
      const catChanged = d.categoryId !== t.categoryId;
      Object.assign(tx, { date: d.date, amount: Math.round(sign * amt * 100) / 100, payee: d.payee.trim(), purpose: d.purpose.trim(), categoryId: d.categoryId, accountId: d.accountId, note: d.note.trim(),
        splits: sp, tags: d.tags.split(',').map(x => x.trim().replace(/^#/, '')).filter(Boolean), tax: !!d.tax, taxType: d.tax ? d.taxType : undefined, receipts });
      if (catChanged || !id || sp.length) tx.manualCat = true;
      if (!id) { S().transactions.push(tx); }
      S().transactions.sort((a, b) => b.date.localeCompare(a.date));
      if (d.mkrule) {
        const key = Analysis.payeeKey(tx).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (key) { S().rules.unshift({ id: uid(), pattern: key, categoryId: d.categoryId }); const n = recategorizeAll(true); toast(`Regel gespeichert · ${n} weitere Buchungen angepasst`); }
      }
      Store.save(); recordSnapshot(); m.close(); App.render();
    };
    const sh = m.querySelector('[data-share]'); if (sh) sh.onclick = () => { f.requestSubmit(); setTimeout(() => Dialogs.shareTx(id), 50); };
    const del = m.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (await confirmDialog('Buchung löschen?', { ok: 'Löschen', danger: true })) { (t.receipts || []).forEach(r => Receipts.remove(r)); S().transactions = S().transactions.filter(x => x.id !== id); Store.save(); closeAllModals(); App.render(); } };
  },

  /* ---------- Depot-Position ---------- */
  position(id, accId) {
    const invAccs = S().accounts.filter(isInvestAcc);
    if (!invAccs.length) { toast('Lege zuerst ein Depot- oder Krypto-Konto an'); return this.account(); }
    const p = id ? S().positions.find(x => x.id === id) : { accountId: accId || invAccs[0].id, name: '', isin: '', symbol: '', shares: '', buyPrice: '' };
    const m = openModal(id ? 'Position bearbeiten' : 'Neue Position', `<form>
      <label>Depot / Krypto-Konto</label><select name="accountId">${accOptions(p.accountId, isInvestAcc)}</select>
      <label>Suche (ISIN, WKN oder Name)</label>
      <div class="row"><input name="q" value="${esc(p.isin || '')}" placeholder="z. B. IE00B4L5Y983 oder Bitcoin"><button type="button" class="btn shrink" data-search>Suchen</button></div>
      <div data-results></div>
      <label>Name</label><input name="name" required value="${esc(p.name)}" placeholder="z. B. iShares Core MSCI World">
      <div class="row"><div><label>ISIN (optional)</label><input name="isin" value="${esc(p.isin || '')}"></div>
        <div><label>Kurs-Symbol (Yahoo)</label><input name="symbol" value="${esc(p.symbol || '')}" placeholder="z. B. EUNL.DE, BTC-EUR"></div></div>
      <div class="row"><div><label>Stück / Menge</label><input name="shares" inputmode="decimal" required value="${p.shares !== '' ? fmtNum(p.shares, p.shares % 1 ? 6 : 0).replace(/,?0+$/, '') || '0' : ''}"></div>
        <div><label>Ø Kaufkurs (€)</label><input name="buyPrice" inputmode="decimal" value="${p.buyPrice ? fmtNum(p.buyPrice, 4).replace(/0{1,2}$/, '') : ''}"></div></div>
      <label>Aktueller Kurs (€) – optional, wird beim Kursabruf überschrieben</label><input name="lastPrice" inputmode="decimal" value="${p.lastPrice != null ? fmtNum(p.lastPrice, 4).replace(/0{1,2}$/, '') : ''}">
      <p class="tiny muted">Tipp: Xetra-Kurse haben die Endung <b>.DE</b> (z. B. EUNL.DE), Krypto in Euro z. B. <b>BTC-EUR</b>, <b>ETH-EUR</b>.</p>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form');
    m.querySelector('[data-search]').onclick = async () => {
      const box = m.querySelector('[data-results]'); const q = f.q.value.trim(); if (!q) return;
      if (!Prices.configured()) { box.innerHTML = '<p class="small warn">Kurs-Proxy ist noch nicht eingerichtet (Einstellungen). Trage das Symbol manuell ein.</p>'; return; }
      box.innerHTML = '<p class="small muted">Suche …</p>';
      try {
        const res = await Prices.search(q);
        if (!res.length) { box.innerHTML = '<p class="small muted">Nichts gefunden.</p>'; return; }
        box.innerHTML = `<ul class="list card" style="padding:4px 12px;margin-top:8px">${res.slice(0, 8).map((r, i) => `<li class="item" data-pick="${i}"><div class="main"><div class="t">${esc(r.name || r.symbol)}</div><div class="s">${esc(r.symbol)} · ${esc(r.exchange || '')} · ${esc(r.type || '')}</div></div><span class="badge">wählen</span></li>`).join('')}</ul>`;
        $$('[data-pick]', box).forEach(li => li.onclick = () => { const r = res[+li.dataset.pick]; f.symbol.value = r.symbol; if (!f.name.value) f.name.value = r.name || r.symbol; if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(q.toUpperCase())) f.isin.value = q.toUpperCase(); box.innerHTML = `<p class="small pos">✓ ${esc(r.symbol)} übernommen</p>`; });
      } catch (err) { box.innerHTML = `<p class="small neg">${esc(err.message)}</p>`; }
    };
    f.onsubmit = e => {
      e.preventDefault(); const d = formData(f);
      const pos = id ? p : { id: uid() };
      const lp = parseNum(d.lastPrice);
      Object.assign(pos, { accountId: d.accountId, name: d.name.trim(), isin: d.isin.trim().toUpperCase(), symbol: d.symbol.trim().toUpperCase(), shares: parseNum(d.shares) || 0, buyPrice: parseNum(d.buyPrice) || 0 });
      if (!isNaN(lp)) pos.lastPrice = lp; else if (!id) pos.lastPrice = null;
      if (!id) S().positions.push(pos);
      Store.save(); recordSnapshot(); m.close(); App.render();
      if (pos.symbol && Prices.configured() && isNaN(lp)) App.updatePrices(true);
    };
    const del = m.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (await confirmDialog('Position löschen?', { ok: 'Löschen', danger: true })) { S().positions = S().positions.filter(x => x.id !== id); Store.save(); closeAllModals(); App.render(); } };
  },

  /* ---------- Vertrag ---------- */
  contract(key) {
    const c = Analysis.contracts().find(x => (x.key || x.id) === key) || S().contracts.find(x => x.key === key || x.id === key);
    if (!c) return;
    const iv = Analysis.intervalById(c.interval);
    const txs = c.manual ? [] : S().transactions.filter(t => t.accountId === c.accountId && t.amount < 0 && Analysis.payeeKey(t) === c.key.split('|')[1]).slice(0, 24);
    const m = openModal(c.customName || c.name, `
      <div class="grid g2"><div class="card kpi" style="margin:0"><div class="label">${iv.name}</div><div class="value num">${fmtEUR(c.amount)}</div><div class="sub muted">${fmtEUR(c.monthly)}/Monat · ${fmtEUR(c.monthly * 12, true)}/Jahr</div></div>
        <div class="card kpi" style="margin:0"><div class="label">Nächste Abbuchung (geschätzt)</div><div class="value" style="font-size:20px">${c.nextDate ? fmtDate(c.nextDate) : '–'}</div>${c.priceChange ? `<div class="sub ${c.priceChange > 0 ? 'neg' : 'pos'}">Preisänderung${c.changeDate ? ' seit ' + fmtDate(c.changeDate) : ''}: ${fmtSigned(c.priceChange)} (vorher ${fmtEUR(c.prevAmount)})</div>` : ''}</div></div>
      <form style="margin-top:10px"><label>Anzeigename</label><input name="customName" value="${esc(c.customName || c.name)}">
        ${c.manual ? `<div class="row"><div><label>Betrag (€)</label><input name="amount" inputmode="decimal" value="${fmtNum(c.amount)}"></div><div><label>Rhythmus</label><select name="interval">${Analysis.INTERVALS.map(i => `<option value="${i.id}" ${i.id === c.interval ? 'selected' : ''}>${i.name}</option>`).join('')}</select></div></div><label>Nächste Fälligkeit</label><input type="date" name="nextDate" value="${c.nextDate || ''}">` : ''}
        <label>Kategorie</label><select name="categoryId">${catOptions(c.categoryId, x => x.type !== 'income')}</select>
        <label>Kunden-/Vertragsnummer (für Kündigung)</label><input name="customerNo" value="${esc(c.customerNo || '')}">
        <div class="row"><div><label>Vertragsende / nächste Verlängerung</label><input type="date" name="contractEnd" value="${c.contractEnd || ''}"></div>
          <div><label>Kündigungsfrist (Monate)</label><input name="noticeMonths" inputmode="numeric" value="${c.noticeMonths ?? ''}" placeholder="z. B. 1"></div>
          <div><label>Verlängert sich um (Monate)</label><input name="renewMonths" inputmode="numeric" value="${c.renewMonths ?? ''}" placeholder="12"></div></div>
        ${(() => { const n = Notice.info(c); return n ? `<p class="small ${n.missed ? 'muted' : n.daysLeft <= 30 ? 'warn' : ''}">⏰ Aktuelles Vertragsende ${fmtDate(n.end)} · kündigen bis spätestens <b>${fmtDate(n.deadline)}</b> (noch ${n.daysLeft} Tage${n.missed ? '; die letzte Frist ist bereits verstrichen' : ''}). Die App erinnert dich 30 Tage vorher.</p>` : '<p class="tiny muted">Trage Vertragsende und Frist ein, dann erinnert dich die App rechtzeitig vor der automatischen Verlängerung.</p>'; })()}
        <label>Notiz</label><input name="noticeNote" value="${esc(c.noticeNote || '')}" placeholder="z. B. Kündigung nur schriftlich">
        <label>Status</label><select name="status">${[['detected', 'Erkannt (ungeprüft)'], ['confirmed', 'Bestätigt'], ['cancelled', 'Gekündigt / beendet']].map(([v, l]) => `<option value="${v}" ${(c.status || 'detected') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="modal-actions">
          ${c.manual ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : '<button type="button" class="btn" data-ignore style="margin-right:auto">Kein Vertrag – ignorieren</button>'}
          <button type="button" class="btn" data-letter>✉️ Kündigung schreiben</button><button class="btn primary">Speichern</button></div></form>
      ${txs.length ? `<h4 style="margin-top:18px">Bisherige Abbuchungen</h4><ul class="list">${txs.map(txItem).join('')}</ul>` : ''}`, { wide: true });
    const f = m.querySelector('form');
    const saveForm = () => {
      const d = formData(f); const s = c.manual ? S().contracts.find(x => x.id === c.id) : Analysis.savedContract(c.key);
      Object.assign(s, { customName: d.customName.trim(), categoryId: d.categoryId, customerNo: d.customerNo.trim(), noticeNote: d.noticeNote.trim(), status: d.status,
        contractEnd: d.contractEnd, noticeMonths: d.noticeMonths === '' ? undefined : +d.noticeMonths, renewMonths: d.renewMonths === '' ? undefined : +d.renewMonths });
      if (c.manual) Object.assign(s, { amount: Math.abs(parseNum(d.amount)) || 0, interval: d.interval, nextDate: d.nextDate, name: d.customName.trim() });
      Store.save(); return s;
    };
    f.onsubmit = e => { e.preventDefault(); saveForm(); m.close(); App.render(); };
    m.querySelector('[data-letter]').onclick = () => { const s = saveForm(); this.cancelLetter({ ...c, ...s }); };
    const ig = m.querySelector('[data-ignore]'); if (ig) ig.onclick = () => { Analysis.savedContract(c.key).status = 'ignored'; Store.save(); m.close(); App.render(); toast('Wird nicht mehr als Vertrag angezeigt'); };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = () => { S().contracts = S().contracts.filter(x => x.id !== c.id); Store.save(); m.close(); App.render(); };
  },

  addContract() {
    const m = openModal('Vertrag manuell hinzufügen', `<form>
      <label>Name</label><input name="name" required placeholder="z. B. Haftpflichtversicherung">
      <div class="row"><div><label>Betrag (€)</label><input name="amount" inputmode="decimal" required></div><div><label>Rhythmus</label><select name="interval">${Analysis.INTERVALS.map(i => `<option value="${i.id}" ${i.id === 'monthly' ? 'selected' : ''}>${i.name}</option>`).join('')}</select></div></div>
      <label>Nächste Fälligkeit</label><input type="date" name="nextDate">
      <label>Kategorie</label><select name="categoryId">${catOptions('abos', x => x.type !== 'income')}</select>
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Hinzufügen</button></div></form>`);
    m.querySelector('form').onsubmit = e => {
      e.preventDefault(); const d = formData(e.target);
      S().contracts.push({ id: uid(), key: 'manual-' + uid(), manual: true, name: d.name.trim(), amount: Math.abs(parseNum(d.amount)) || 0, interval: d.interval, nextDate: d.nextDate, categoryId: d.categoryId, status: 'confirmed' });
      Store.save(); m.close(); App.render();
    };
  },

  cancelLetter(c) {
    const s = S().settings; const today = new Date().toLocaleDateString('de-DE');
    const text = `${s.fullName || '[Dein Name]'}
${s.address || '[Deine Anschrift]'}

An
${c.customName || c.name}
[Anschrift des Anbieters]

${today}

Kündigung meines Vertrags${c.customerNo ? ' – Kunden-/Vertragsnummer: ' + c.customerNo : ''}

Sehr geehrte Damen und Herren,

hiermit kündige ich meinen Vertrag${c.customerNo ? ' mit der Kunden-/Vertragsnummer ' + c.customerNo : ''} fristgerecht zum nächstmöglichen Zeitpunkt.

Bitte bestätigen Sie mir den Eingang dieser Kündigung sowie das genaue Vertragsende schriftlich. Einer Verlängerung des Vertrags sowie einer weiteren Nutzung meiner Daten zu Werbezwecken widerspreche ich hiermit.

Eine bestehende Einzugsermächtigung (SEPA-Lastschriftmandat) widerrufe ich zum Vertragsende.

Mit freundlichen Grüßen

${s.fullName || '[Dein Name]'}`;
    const m = openModal('Kündigungsschreiben', `<p class="small muted">Prüfe die Angaben, ergänze die Anbieter-Adresse und verschicke das Schreiben selbst (E-Mail, Kontaktformular, Brief oder Einschreiben). Viele Anbieter haben außerdem einen „Verträge hier kündigen“-Button auf ihrer Website.</p>
      <textarea rows="18" style="font-size:14px" data-text>${esc(text)}</textarea>
      <div class="modal-actions"><button class="btn" data-dl>⬇ Als Textdatei</button><button class="btn" data-copy>Kopieren</button><button class="btn primary" data-done>Als gekündigt markieren</button></div>`, { wide: true });
    m.querySelector('[data-copy]').onclick = () => copyText(m.querySelector('[data-text]').value);
    m.querySelector('[data-dl]').onclick = () => downloadFile('Kuendigung_' + (c.customName || c.name).replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.txt', m.querySelector('[data-text]').value, 'text/plain;charset=utf-8');
    m.querySelector('[data-done]').onclick = () => { const sc = c.manual ? S().contracts.find(x => x.id === c.id) : Analysis.savedContract(c.key); sc.status = 'cancelled'; sc.cancelDate = todayISO(); Store.save(); closeAllModals(); App.render(); toast('Als gekündigt markiert'); };
  },

  /* ---------- Sparziel ---------- */
  goal(id) {
    const g = id ? S().goals.find(x => x.id === id) : { name: '', target: '', saved: '', icon: '🎯', targetDate: '', accountId: '' };
    const m = openModal(id ? 'Sparziel' : 'Neues Sparziel', `<form>
      <div class="row"><div class="shrink" style="width:70px"><label>Symbol</label><input name="icon" value="${esc(g.icon)}" maxlength="4"></div><div><label>Name</label><input name="name" required value="${esc(g.name)}" placeholder="z. B. Notgroschen"></div></div>
      <div class="row"><div><label>Zielbetrag (€)</label><input name="target" inputmode="decimal" required value="${g.target ? fmtNum(g.target) : ''}"></div><div><label>Zieldatum (optional)</label><input name="targetDate" type="date" value="${g.targetDate || ''}"></div></div>
      <label>Fortschritt aus Konto übernehmen (optional)</label><select name="accountId">${accOptions(g.accountId, null, '— manuell eintragen —')}</select>
      <div data-manual><label>Bereits gespart (€)</label><input name="saved" inputmode="decimal" value="${g.saved ? fmtNum(g.saved) : ''}">
        ${id ? '<div class="row" style="margin-top:8px"><input name="delta" inputmode="decimal" placeholder="Betrag"><button type="button" class="btn shrink" data-add>+ Einzahlen</button></div>' : ''}</div>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const f = m.querySelector('form'); const sync = () => m.querySelector('[data-manual]').classList.toggle('hidden', !!f.accountId.value); f.accountId.onchange = sync; sync();
    const add = m.querySelector('[data-add]'); if (add) add.onclick = () => { const v = parseNum(f.delta.value); if (!isNaN(v)) { f.saved.value = fmtNum((parseNum(f.saved.value) || 0) + v); f.delta.value = ''; } };
    f.onsubmit = e => {
      e.preventDefault(); const d = formData(f); const goal = id ? g : { id: uid() };
      Object.assign(goal, { name: d.name.trim(), icon: d.icon.trim() || '🎯', target: parseNum(d.target) || 0, targetDate: d.targetDate, accountId: d.accountId, saved: parseNum(d.saved) || 0 });
      if (!id) S().goals.push(goal); Store.save(); m.close(); App.render();
    };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = async () => { if (await confirmDialog('Sparziel löschen?', { ok: 'Löschen', danger: true })) { S().goals = S().goals.filter(x => x.id !== id); Store.save(); closeAllModals(); App.render(); } };
  },

  /* ---------- Kategorie & Regel ---------- */
  category(id) {
    const c = id ? S().categories.find(x => x.id === id) : { name: '', type: 'expense', color: '#64748b', icon: '🏷️' };
    const m = openModal(id ? 'Kategorie' : 'Neue Kategorie', `<form>
      <div class="row"><div class="shrink" style="width:70px"><label>Symbol</label><input name="icon" value="${esc(c.icon)}" maxlength="4"></div><div><label>Name</label><input name="name" required value="${esc(c.name)}"></div><div class="shrink" style="width:64px"><label>Farbe</label><input name="color" type="color" value="${c.color}" style="padding:2px;height:40px"></div></div>
      <label>Art</label><select name="type">${[['expense', 'Ausgabe'], ['income', 'Einnahme'], ['transfer', 'Umbuchung / Sparen (zählt nicht als Ausgabe)']].map(([v, l]) => `<option value="${v}" ${c.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="modal-actions">${id && !['sonstiges', 'einnahmen'].includes(id) ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const d = formData(e.target); const cat = id ? c : { id: uid() }; Object.assign(cat, d); if (!id) S().categories.push(cat); Store.save(); m.close(); App.render(); };
    const del = m.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!await confirmDialog(`Kategorie „${c.name}“ löschen? Betroffene Buchungen werden „Sonstiges“.`, { ok: 'Löschen', danger: true })) return;
      const st = S(); st.categories = st.categories.filter(x => x.id !== id); st.rules = st.rules.filter(r => r.categoryId !== id); delete st.budgets[id];
      st.transactions.forEach(t => { if (t.categoryId === id) t.categoryId = 'sonstiges'; }); Store.save(); closeAllModals(); App.render();
    };
  },
  rule(id) {
    const r = id ? S().rules.find(x => x.id === id) : { pattern: '', categoryId: 'sonstiges' };
    const m = openModal(id ? 'Regel' : 'Neue Regel', `<form>
      <label>Wenn Empfänger oder Verwendungszweck enthält … (mehrere mit | trennen)</label><input name="pattern" required value="${esc(r.pattern)}" placeholder="z. B. NETFLIX|SPOTIFY">
      <label>… dann Kategorie</label><select name="categoryId">${catOptions(r.categoryId)}</select>
      <div class="modal-actions">${id ? '<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>' : ''}<button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    m.querySelector('form').onsubmit = e => {
      e.preventDefault(); const d = formData(e.target);
      try { new RegExp(d.pattern, 'i'); } catch { return toast('Ungültiges Muster'); }
      const rule = id ? r : { id: uid() }; Object.assign(rule, d); if (!id) S().rules.unshift(rule);
      const n = recategorizeAll(true); m.close(); App.render(); toast(`Gespeichert · ${n} Buchungen neu zugeordnet`);
    };
    const del = m.querySelector('[data-del]'); if (del) del.onclick = () => { S().rules = S().rules.filter(x => x.id !== id); Store.save(); m.close(); App.render(); };
  },

  /* ---------- CSV-Import Kontoumsätze ---------- */
  importTx(preAcc) {
    const accs = S().accounts.filter(a => !isInvestAcc(a));
    if (!accs.length) { toast('Lege zuerst ein Konto an (z. B. Girokonto)'); return this.account(); }
    const m = openModal('Umsätze importieren', `
      <p class="small muted">Exportiere im Online-Banking deine Umsätze als <b>CSV</b> (Sparkasse: „CSV-CAMT“, Volksbank, ING, DKB, comdirect, Trade Republic …). Die Datei wird nur hier auf dem Gerät gelesen.</p>
      <label>In welches Konto?</label><select data-acc>${accOptions(preAcc || ui.acc || accs[0].id, a => !isInvestAcc(a))}</select>
      <div class="modal-actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-pick>CSV-Datei wählen</button></div>
      <p class="tiny muted" style="margin-top:12px">💡 Auch die <b>PayPal-Aktivitäten-CSV</b> kannst du hier wählen: Dann werden „PayPal“-Abbuchungen dem echten Händler zugeordnet.</p>
      <p class="tiny muted">Depot- oder Krypto-Transaktionen (Scalable, Bitvavo …)? <button class="btn link tiny" data-broker>Hier entlang</button></p>`, { wide: true });
    m.querySelector('[data-broker]').onclick = () => { m.close(); this.importBroker(); };
    m.querySelector('[data-pick]').onclick = async () => {
      const [file] = await pickFile('.csv,.txt,text/csv'); if (!file) return;
      const accountId = m.querySelector('[data-acc]').value;
      let an; try { an = Importer.analyze(await readFileText(file)); } catch (e) { return toast(e.message, 5000); }
      m.close();
      if (Importer.isPayPal(an)) return this.importPayPal(an, file.name);
      this.importTxMap(an, accountId, file.name);
    };
  },
  importTxMap(an, accountId, fname) {
    const mp = { ...an.mapping };
    const colSel = (f) => `<select data-map="${f}"><option value="-1">—</option>${an.header.map((h, i) => `<option value="${i}" ${mp[f] === i ? 'selected' : ''}>${esc(h || 'Spalte ' + (i + 1))}</option>`).join('')}</select>`;
    const m = openModal('Import prüfen', `
      <p class="small">Datei: <b>${esc(fname)}</b> · erkannt: <b>${esc(an.bank)}</b> · ${an.data.length} Zeilen → Konto <b>${esc(accById(accountId).name)}</b></p>
      <details ${mp.date < 0 || (mp.amount < 0 && mp.debit < 0) ? 'open' : ''}><summary class="small" style="cursor:pointer">Spaltenzuordnung anpassen</summary>
        <div class="grid g2" style="gap:0 14px">${['date', 'amount', 'payee', 'payeeOut', 'payeeIn', 'purpose', 'text', 'debit', 'credit', 'sh'].map(f => `<div><label>${Importer.FIELDS[f]}</label>${colSel(f)}</div>`).join('')}</div></details>
      <h4 style="margin-top:14px">Vorschau</h4><div data-prev></div>
      <div class="modal-actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-go>Importieren</button></div>`, { wide: true });
    let built;
    const preview = () => {
      built = Importer.build(an, mp, accountId);
      const existing = new Set(S().transactions.filter(t => t.accountId === accountId).map(t => t.hash));
      const dup = built.txs.filter(t => existing.has(t.hash)).length;
      m.querySelector('[data-prev]').innerHTML = `<p class="small">${built.txs.length} Buchungen erkannt${dup ? `, davon <b>${dup} schon vorhanden</b> (werden übersprungen)` : ''}${built.skipped ? ` · ${built.skipped} Zeilen ohne Datum/Betrag ignoriert` : ''}</p>
        <div class="table-wrap"><table><thead><tr><th>Datum</th><th>Empfänger</th><th>Zweck</th><th>Kategorie</th><th class="r">Betrag</th></tr></thead><tbody>
        ${built.txs.slice(0, 8).map(t => `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.payee.slice(0, 28))}</td><td>${esc(t.purpose.slice(0, 34))}</td><td>${catById(t.categoryId).icon} ${esc(catById(t.categoryId).name)}</td><td class="r num ${clsAmt(t.amount)}">${fmtEUR(t.amount)}</td></tr>`).join('')}</tbody></table></div>`;
      m.querySelector('[data-go]').disabled = !built.txs.length;
    };
    $$('[data-map]', m).forEach(s => s.onchange = () => { mp[s.dataset.map] = +s.value; preview(); });
    preview();
    m.querySelector('[data-go]').onclick = () => {
      const r = Importer.commit(built.txs, accountId);
      m.close(); recordSnapshot(); App.render();
      toast(`${r.added} Buchungen importiert${r.dupes ? ` · ${r.dupes} Duplikate übersprungen` : ''}`, 4000);
      const acc = accById(accountId);
      if (r.added && !acc.balanceAsked) { acc.balanceAsked = true; Store.save(); setTimeout(() => this.reconcile(accountId), 400); }
    };
  },
  importPayPal(an, fname) {
    const rows = Importer.paypalRows(an); const matches = Importer.matchPayPal(rows);
    const m = openModal('PayPal-Abgleich', `<p class="small">Datei <b>${esc(fname)}</b>: ${rows.length} PayPal-Zahlungen gelesen. <b>${matches.length}</b> davon passen zu Buchungen auf deinem Konto, die bisher nur „PayPal“ heißen.</p>
      <p class="tiny muted">Die PayPal-Zahlungen werden nicht als neue Buchungen angelegt, sie ersetzen nur den Empfänger in deinen Kontoumsätzen. Kategorien und Vertragserkennung werden dadurch genauer.</p>
      ${matches.length ? `<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Vorher</th><th>Nachher</th><th class="r">Betrag</th></tr></thead><tbody>${matches.slice(0, 12).map(x => `<tr><td>${fmtDate(x.t.date)}</td><td>${esc((x.t.payee || '').slice(0, 22))}</td><td><b>${esc(x.pp.name.slice(0, 26))}</b></td><td class="r num neg">${fmtEUR(x.t.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small warn">Keine passenden Buchungen gefunden. Importiere zuerst die Kontoumsätze, auf denen die PayPal-Abbuchungen stehen.</p>'}
      <div class="modal-actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-go ${matches.length ? '' : 'disabled'}>Übernehmen</button></div>`, { wide: true });
    m.querySelector('[data-go]').onclick = () => { const n = Importer.applyPayPal(matches); m.close(); App.render(); toast(`${n} PayPal-Zahlungen zugeordnet`); };
  },
  async reconcile(accountId) {
    const acc = accById(accountId);
    const v = await promptDialog('Kontostand abgleichen', `Wie hoch ist der aktuelle Kontostand von „${acc.name}“ laut Bank? (Damit stimmt dein Vermögen.)`, { value: fmtNum(accountBalance(acc)), ok: 'Übernehmen' });
    if (v == null) return; const b = parseNum(v); if (isNaN(b)) return;
    acc.offset = b - txSum(acc.id); Store.save(); recordSnapshot(); App.render(); toast('Kontostand übernommen');
  },

  /* ---------- CSV-Import Broker ---------- */
  importBroker() {
    const accs = S().accounts.filter(isInvestAcc);
    if (!accs.length) { toast('Lege zuerst ein Depot- oder Krypto-Konto an'); return this.account(); }
    const m = openModal('Depot-/Krypto-Transaktionen importieren', `
      <p class="small muted">Unterstützt: <b>Scalable Capital</b> (Transaktionen-CSV), <b>Bitvavo</b> (Transaktionshistorie-CSV), <b>Trade Republic</b> und andere Broker über die Spaltenzuordnung. Aus Käufen/Verkäufen werden Stückzahl und Ø-Kaufkurs je Position berechnet.</p>
      <label>In welches Depot / Krypto-Konto?</label><select data-acc>${accOptions(accs[0].id, isInvestAcc)}</select>
      <div class="modal-actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-pick>CSV-Datei wählen</button></div>`, { wide: true });
    m.querySelector('[data-pick]').onclick = async () => {
      const [file] = await pickFile('.csv,.txt,text/csv'); if (!file) return;
      const accountId = m.querySelector('[data-acc]').value;
      let an; try { an = Importer.analyzeBroker(await readFileText(file)); } catch (e) { return toast(e.message, 5000); }
      m.close(); this.importBrokerMap(an, accountId, file.name);
    };
  },
  importBrokerMap(an, accountId, fname) {
    const mp = { ...an.mapping }; const acc = accById(accountId);
    const colSel = f => `<select data-map="${f}"><option value="-1">—</option>${an.header.map((h, i) => `<option value="${i}" ${mp[f] === i ? 'selected' : ''}>${esc(h || 'Spalte ' + (i + 1))}</option>`).join('')}</select>`;
    const m = openModal('Broker-Import prüfen', `<p class="small">Datei: <b>${esc(fname)}</b> · erkannt: <b>${esc(an.broker)}</b> · ${an.data.length} Zeilen → <b>${esc(acc.name)}</b></p>
      <details><summary class="small" style="cursor:pointer">Spaltenzuordnung anpassen</summary><div class="grid g2" style="gap:0 14px">${Object.keys(Importer.BFIELDS).map(f => `<div><label>${Importer.BFIELDS[f]}</label>${colSel(f)}</div>`).join('')}</div></details>
      <h4 style="margin-top:14px">Vorschau</h4><div data-prev></div>
      <div class="modal-actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-go>Importieren</button></div>`, { wide: true });
    let built; const tn = { buy: 'Kauf', sell: 'Verkauf', in: 'Einbuchung', sell_nocash: 'Auszahlung' };
    const preview = () => {
      built = Importer.buildTrades(an, mp);
      m.querySelector('[data-prev]').innerHTML = `<p class="small">${built.trades.length} Transaktionen erkannt${built.skipped ? ` · ${built.skipped} Zeilen übersprungen (Ein-/Auszahlungen, Dividenden, Gebühren o. Ä.)` : ''}</p>
      <div class="table-wrap"><table><thead><tr><th>Datum</th><th>Typ</th><th>Wert</th><th class="r">Stück</th><th class="r">Kurs</th></tr></thead><tbody>${built.trades.slice(0, 8).map(t => `<tr><td>${fmtDate(t.date)}</td><td>${tn[t.type]}</td><td>${esc((t.name || t.ident).slice(0, 30))}</td><td class="r num">${fmtNum(t.shares, 4)}</td><td class="r num">${fmtEUR(t.price)}</td></tr>`).join('')}</tbody></table></div>`;
      m.querySelector('[data-go]').disabled = !built.trades.length;
    };
    $$('[data-map]', m).forEach(s => s.onchange = () => { mp[s.dataset.map] = +s.value; preview(); }); preview();
    m.querySelector('[data-go]').onclick = async () => {
      const r = Importer.applyTrades(built.trades, accountId, acc.type === 'krypto' || an.broker === 'Bitvavo');
      m.close(); App.render();
      toast(`${r.added} Transaktionen · ${r.created} neue, ${r.updated} aktualisierte Positionen`, 4500);
      const missing = S().positions.filter(p => p.accountId === accountId && !p.symbol && p.isin);
      if (missing.length && Prices.configured()) {
        toast(`Suche Kurs-Symbole für ${missing.length} Positionen …`);
        for (const p of missing) { try { const res = await Prices.search(p.isin); const pick = res.find(x => /\.DE$/.test(x.symbol)) || res.find(x => /\.(F|SG|MU|DU|BE|HM)$/.test(x.symbol)) || res[0]; if (pick) p.symbol = pick.symbol; } catch {} }
        Store.save(); App.updatePrices(true);
      }
    };
  },

  /* ---------- Backup ---------- */
  async backupExport() {
    const m = openModal('Backup exportieren', `<form><p class="small muted">Das Backup ist mit einem Passwort verschlüsselt. Standard: dein App-Passwort.</p>
      <label>Passwort für das Backup</label><input name="pw" type="password" required autocomplete="new-password">
      <label class="check"><input type="checkbox" name="rc" checked> Belege (Fotos/PDFs) mitsichern</label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Exportieren</button></div></form>`);
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const pw = e.target.pw.value; if (pw.length < 6) return toast('Mindestens 6 Zeichen');
      const data = await Store.exportBackup(pw, e.target.rc.checked);
      downloadFile(`finanzapp-backup-${todayISO()}.finanzapp`, data, 'application/json'); m.close(); toast('Backup erstellt – bewahre es sicher auf');
    };
  },
  async backupImport(fromLock = false) {
    const [file] = await pickFile('.finanzapp,.json,application/json'); if (!file) return;
    const text = await file.text();
    const m = openModal('Backup importieren', `<form><p class="small">Datei: <b>${esc(file.name)}</b></p><label>Passwort des Backups</label><input name="pw" type="password" required autocomplete="current-password">
      ${fromLock ? '<p class="tiny muted">Das Backup-Passwort wird danach auch dein App-Passwort auf diesem Gerät.</p>' : '<p class="tiny warn">Achtung: Die aktuellen Daten auf diesem Gerät werden ersetzt.</p>'}
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Wiederherstellen</button></div></form>`);
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const pw = e.target.pw.value;
      let st; try { st = await Store.readBackup(text, pw); } catch { return toast('Falsches Passwort oder beschädigte Datei'); }
      if (fromLock || !Store.key) { await Store.create(pw); }
      const rc = st._receipts; delete st._receipts;
      Store.state = st; await Store.saveNow(); if (rc) await Receipts.importAll(rc); m.close();
      if (fromLock) App.enter(); else App.render();
      toast(`Wiederhergestellt: ${st.transactions.length} Umsätze, ${st.accounts.length} Konten`, 4000);
    };
  },
  changePw() {
    const m = openModal('Passwort ändern', `<form><label>Aktuelles Passwort</label><input name="old" type="password" required autocomplete="current-password">
      <label>Neues Passwort (mind. 8 Zeichen)</label><input name="pw" type="password" required minlength="8" autocomplete="new-password"><label>Wiederholen</label><input name="pw2" type="password" required autocomplete="new-password">
      <div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">Ändern</button></div></form>`);
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const d = formData(e.target);
      if (d.pw !== d.pw2) return toast('Passwörter stimmen nicht überein');
      try { const blob = await DB.get('vault'); await Crypto.decrypt(await Crypto.deriveKey(d.old, Crypto.unb64(blob.salt), blob.iter || Crypto.ITER), blob); } catch { return toast('Aktuelles Passwort falsch'); }
      await Store.changePassword(d.pw); m.close(); toast('Passwort geändert');
    };
  },
};
