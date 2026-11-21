'use strict';
/* App-Steuerung: Sperrbildschirm, Navigation, globale Aktionen */
const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.8 10.8 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.1-5.9M9.9 5.2A9.9 9.9 0 0 1 12 5c7 0 11 7 11 7a19.6 19.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/></svg>';
const App = {
  view: 'uebersicht', idleTimer: null,

  async init() {
    this.applyTheme();
    if (!window.crypto || !crypto.subtle) {
      $('#lock').classList.remove('hidden');
      $('#lock-text').textContent = 'Dieser Browser unterstützt keine sichere Verschlüsselung in diesem Kontext. Bitte die App über https:// (GitHub Pages) oder direkt als Datei in Chrome/Firefox öffnen.';
      $('#lock-form').classList.add('hidden'); return;
    }
    const exists = await Store.exists();
    this.showLock(!exists);
    $('#lock-form').onsubmit = e => { e.preventDefault(); this.submitLock(!exists && !Store._created); };
    $('#lock-restore').onclick = () => Dialogs.backupImport(true);
    $('#lock-bio').onclick = () => this.bioUnlock();
    document.addEventListener('click', e => { const a = e.target.closest('[data-ptab]'); if (a && a.tagName === 'A') ui.ptab = a.dataset.ptab; }, true);
    window.addEventListener('online', () => Sync.run());
    $('#lock-now').onclick = $('#lock-now-m').onclick = () => this.lock();
    window.addEventListener('hashchange', () => this.route());
    document.addEventListener('click', e => this.onClick(e));
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => this.resetIdle(), { passive: true }));
    document.addEventListener('visibilitychange', () => { if (Store.state) Sync.run(); if (document.hidden) this.hiddenAt = Date.now(); else if (this.hiddenAt && Store.state && S().settings.autoLockMin && Date.now() - this.hiddenAt > S().settings.autoLockMin * 60000) this.lock(); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  },

  showLock(isNew) {
    $('#main').classList.add('hidden'); $('#lock').classList.remove('hidden'); closeAllModals();
    $('#lock-pw').value = ''; $('#lock-pw2').value = ''; $('#lock-err').textContent = '';
    $('#lock-pw2').classList.toggle('hidden', !isNew); $('#lock-pw2').required = isNew;
    $('#lock-restore').classList.toggle('hidden', !isNew);
    $('#lock-text').textContent = isNew ? 'Willkommen! Lege ein Passwort fest. Es verschlüsselt alle deine Daten – ohne Passwort kommt niemand (auch du nicht) an die Daten. Bitte gut merken!' : 'Gib dein Passwort ein.';
    $('#lock-btn').textContent = isNew ? 'Loslegen' : 'Entsperren';
    $('#lock-bio').classList.add('hidden');
    if (!isNew) Bio.stored().then(b => { if (b && Bio.supported()) { $('#lock-bio').classList.remove('hidden'); if (!this._bioTried) { this._bioTried = true; this.bioUnlock(true); } } });
    $('#lock-pw').autocomplete = isNew ? 'new-password' : 'current-password';
    setTimeout(() => $('#lock-pw').focus(), 50);
  },

  async submitLock(isNew) {
    const pw = $('#lock-pw').value, err = $('#lock-err'); err.textContent = '';
    const btn = $('#lock-btn'); btn.disabled = true; btn.textContent = '…';
    try {
      if (isNew) {
        if (pw.length < 8) throw new Error('Bitte mindestens 8 Zeichen verwenden.');
        if (pw !== $('#lock-pw2').value) throw new Error('Die Passwörter stimmen nicht überein.');
        await Store.create(pw); Store._created = true;
      } else {
        await Store.unlock(pw);
      }
      this.enter();
    } catch (e) {
      err.textContent = isNew ? e.message : 'Falsches Passwort.';
      btn.textContent = isNew ? 'Loslegen' : 'Entsperren';
    } finally { btn.disabled = false; }
  },

  async bioUnlock(silent) {
    try { const pw = await Bio.unlockPw(); await Store.unlock(pw); this.enter(); }
    catch (e) { if (!silent && e.name !== 'NotAllowedError') $('#lock-err').textContent = 'Fingerabdruck fehlgeschlagen: ' + e.message; }
  },

  enter() {
    Store._created = true;
    $('#lock').classList.add('hidden'); $('#main').classList.remove('hidden');
    if (S().settings.privacyOnStart) S().settings.privacy = true;
    this.applyTheme(); this.syncPrivacyBtn(); recordSnapshot(); this.route(); this.resetIdle();
    // Kurse automatisch aktualisieren, wenn älter als 6 Stunden
    if (Sync.enabled()) Sync.run();
    setTimeout(() => Alerts.notify().catch(() => {}), 1500);
    const st = S(); if (Prices.configured() && st.positions.some(p => p.symbol) && (!st.settings.lastPriceUpdate || Date.now() - st.settings.lastPriceUpdate > 6 * 3600e3)) this.updatePrices(true);
  },

  async lock() { if (Store.state) { await Store.saveNow(); if (Sync.enabled()) await Sync.run(); } Store.lock(); this.showLock(false); location.hash = ''; },

  resetIdle() {
    clearTimeout(this.idleTimer);
    if (!Store.state) return; const min = +S().settings.autoLockMin; if (!min) return;
    this.idleTimer = setTimeout(() => this.lock(), min * 60000);
  },

  setPrivacy(on) {
    S().settings.privacy = !!on; Store.save(); this.syncPrivacyBtn(); this.render();
    toast(on ? 'Diskret-Modus an – Beträge ausgeblendet' : 'Beträge wieder sichtbar');
  },
  syncPrivacyBtn() {
    const on = !!(Store.state && S().settings.privacy);
    $$('.priv-btn').forEach(b => { b.classList.toggle('on', on); b.title = on ? 'Beträge anzeigen' : 'Beträge ausblenden'; b.innerHTML = on ? EYE_OFF : EYE; });
    document.body.classList.toggle('private', on);
  },

  applyTheme() { const t = Store.state ? S().settings.theme : 'auto'; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; },

  route() {
    if (!Store.state) return;
    const v = location.hash.slice(1); this.view = Views[v] ? v : 'uebersicht';
    closeAllModals(); this.render(); window.scrollTo(0, 0);
  },

  render() {
    if (!Store.state) return;
    const V = Views[this.view];
    $('#view-title').textContent = V.title;
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === this.view));
    const root = $('#view');
    try { root.innerHTML = V.render(); V.bind && V.bind(root); }
    catch (e) { console.error(e); root.innerHTML = `<div class="card"><h3>Fehler in der Ansicht</h3><pre class="small">${esc(e.stack || e.message)}</pre></div>`; }
  },

  async updatePrices(silent) {
    if (!Prices.configured()) { if (!silent) toast('Bitte zuerst den Kurs-Proxy in den Einstellungen eintragen'); return; }
    if (!silent) toast('Kurse werden abgerufen …');
    try {
      const r = await Prices.updateAll(); this.render();
      toast(r.fail.length ? `${r.ok} Kurse aktualisiert · nicht gefunden: ${r.fail.join(', ')}` : `${r.ok} Kurse aktualisiert`, r.fail.length ? 6000 : 2500);
    } catch (e) { if (!silent || true) toast('Kursabruf fehlgeschlagen: ' + e.message, 5000); }
  },

  async onClick(e) {
    const t = e.target.closest('[data-act],[data-tx],[data-account],[data-position],[data-contract],[data-goal],[data-go]');
    if (!t || !Store.state) return;
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.tx) return Dialogs.tx(t.dataset.tx);
    if (t.dataset.account) return Dialogs.account(t.dataset.account);
    if (t.dataset.position) return Dialogs.position(t.dataset.position);
    if (t.dataset.contract) return Dialogs.contract(t.dataset.contract);
    if (t.dataset.goal) return Dialogs.goal(t.dataset.goal);
    switch (t.dataset.act) {
      case 'privacy': return this.setPrivacy(!S().settings.privacy);
      case 'add-account': return Dialogs.account();
      case 'rebalance': return Dialogs.rebalance();
      case 'add-div': return Dialogs.dividend();
      case 'shared-add': return Dialogs.sharedEntry();
      case 'person-add': return Dialogs.person();
      case 'tax-csv': return downloadFile(`Steuer_${ui.taxYear}.csv`, Tax.csv(ui.taxYear), 'text/csv;charset=utf-8');
      case 'sync-first': try { toast('Sync wird eingerichtet …'); await Sync.enableFirst(); this.render(); toast(Sync.lastErr ? '✗ ' + Sync.lastErr : '✓ Sync aktiv – jetzt das andere Gerät koppeln', 5000); } catch (err) { toast('✗ ' + err.message, 6000); } return;
      case 'sync-pair': return Dialogs.syncPair();
      case 'sync-now': await Sync.run(true); this.render(); return toast(Sync.lastErr ? '✗ ' + Sync.lastErr : '✓ ' + Sync.status, 4000);
      case 'sync-code': return Dialogs.syncCode();
      case 'sync-off': if (await confirmDialog('Automatischen Abgleich auf diesem Gerät ausschalten?', { ok: 'Ausschalten' })) { await Sync.disable(); this.render(); } return;
      case 'sync-reset': if (await confirmDialog('Die verschlüsselten Sync-Daten auf dem Server löschen? Deine Daten auf den Geräten bleiben erhalten.', { ok: 'Löschen', danger: true })) { try { await Sync.resetServer(); toast('Server-Daten gelöscht'); } catch (err) { toast('✗ ' + err.message); } this.render(); } return;
      case 'bio-on': return Dialogs.bioEnable();
      case 'bio-off': await Bio.disable(); this.render(); return toast('Fingerabdruck-Entsperrung ausgeschaltet');
      case 'notify-on': {
        if (!('Notification' in window)) return toast('Benachrichtigungen werden hier nicht unterstützt');
        const p = await Notification.requestPermission(); S().settings.notify = p === 'granted'; Store.save(); this.render();
        return toast(p === 'granted' ? 'Benachrichtigungen aktiv' : 'Benachrichtigungen wurden nicht erlaubt');
      }
      case 'notify-off': S().settings.notify = false; Store.save(); return this.render();
      case 'add-tx': return Dialogs.tx();
      case 'add-position': return Dialogs.position(null, t.dataset.accid);
      case 'add-contract': return Dialogs.addContract();
      case 'add-goal': return Dialogs.goal();
      case 'add-cat': return Dialogs.category();
      case 'add-rule': return Dialogs.rule();
      case 'import': return Dialogs.importTx();
      case 'import-broker': return Dialogs.importBroker();
      case 'prices': return this.updatePrices(false);
      case 'recat': { const n = recategorizeAll(true); this.render(); return toast(`${n} Buchungen neu zugeordnet (manuell gesetzte bleiben)`); }
      case 'backup-export': return Dialogs.backupExport();
      case 'backup-import': return Dialogs.backupImport(false);
      case 'change-pw': return Dialogs.changePw();
      case 'lock': return this.lock();
      case 'proxy-test': {
        const f = $('#proxy-form'); S().settings.proxyUrl = f.proxyUrl.value.trim(); S().settings.proxyToken = f.proxyToken.value.trim(); Store.save();
        if (!Prices.configured()) return toast('Bitte Proxy-URL eintragen');
        try { const q = await Prices.quotes(['BTC-EUR', 'EUNL.DE']); const b = q['BTC-EUR'], w = q['EUNL.DE']; toast(`✓ Verbindung ok · Bitcoin ${b ? fmtEUR(b.price) : '–'} · MSCI World ${w ? fmtEUR(w.price) : '–'}`, 6000); }
        catch (err) { toast('✗ ' + err.message, 6000); }
        return;
      }
      case 'wipe': {
        if (!await confirmDialog('Wirklich ALLE Daten auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden. Exportiere vorher ein Backup!', { ok: 'Alles löschen', danger: true })) return;
        const v = await promptDialog('Letzte Sicherheitsabfrage', 'Tippe LÖSCHEN ein:'); if ((v || '').trim().toUpperCase() !== 'LÖSCHEN') return toast('Abgebrochen');
        await Store.wipe(); Store._created = false; location.hash = ''; location.reload(); return;
      }
    }
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
