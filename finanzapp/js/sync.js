'use strict';
/* Ende-zu-Ende-verschlüsselter Abgleich über deinen Cloudflare-Worker (KV-Speicher).
   Der Sync-Schlüssel ist ein zufälliger 256-Bit-Schlüssel, der nur in deinen (verschlüsselten)
   App-Daten liegt. Cloudflare sieht ausschließlich unlesbaren Datensalat. */
const Sync = {
  applying: false, running: false, timer: null, status: '', lastErr: '',

  enabled() { const s = Store.state && S().settings; return !!(s && s.sync && s.syncKey && s.proxyUrl); },
  async meta() { return (await DB.get('syncmeta')) || { rev: 0, dirty: true, last: null }; },
  async setMeta(m) { await DB.set('syncmeta', m); },
  async key() { return crypto.subtle.importKey('raw', Crypto.unb64(S().settings.syncKey), 'AES-GCM', false, ['encrypt', 'decrypt']); },
  async seal(state) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(), new TextEncoder().encode(JSON.stringify(state)));
    return { v: 1, iv: Crypto.b64(iv), ct: Crypto.b64(ct) };
  },
  async open(blob, rawKey) {
    const k = rawKey ? await crypto.subtle.importKey('raw', Crypto.unb64(rawKey), 'AES-GCM', false, ['decrypt']) : await this.key();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Crypto.unb64(blob.iv) }, k, Crypto.unb64(blob.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  },
  async req(method, path, body, base, token) {
    const r = await fetch((base || Prices.base()) + path, { method, headers: { 'X-Token': token ?? S().settings.proxyToken, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive: method === 'PUT' && body && JSON.stringify(body).length < 60000 });
    if (r.status === 501) throw new Error('Im Cloudflare-Worker ist noch kein KV-Speicher „SYNC“ verknüpft (siehe Anleitung).');
    if (r.status === 401) throw new Error('Token falsch');
    if (r.status === 409) return { conflict: true, ...(await r.json()) };
    if (!r.ok) throw new Error('Server-Fehler ' + r.status);
    return r.json();
  },

  /* Kopplungscode: Proxy-Adresse + Token + Sync-Schlüssel in einem Text */
  pairingCode() { const s = S().settings; return 'FA1-' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: s.proxyUrl, t: s.proxyToken, k: s.syncKey })))).replace(/=+$/, ''); },
  parseCode(code) {
    const c = code.trim().replace(/\s+/g, ''); if (!c.startsWith('FA1-')) throw new Error('Ungültiger Kopplungscode');
    let b = c.slice(4); while (b.length % 4) b += '=';
    const o = JSON.parse(decodeURIComponent(escape(atob(b)))); if (!o.u || !o.k) throw new Error('Ungültiger Kopplungscode'); return o;
  },

  /* Erstes Gerät: Sync einschalten und aktuellen Stand hochladen */
  async enableFirst() {
    const s = S().settings; if (!s.proxyUrl) throw new Error('Bitte zuerst Proxy-URL und Token eintragen');
    const remote = await this.req('GET', '/sync/rev');
    if (remote.rev > 0 && !s.syncKey) throw new Error('Auf dem Server liegen bereits Sync-Daten. Verbinde dieses Gerät per Kopplungscode – oder setze den Sync auf dem anderen Gerät zurück.');
    if (!s.syncKey) s.syncKey = Crypto.b64(crypto.getRandomValues(new Uint8Array(32)));
    s.sync = true; await Store.saveNow();
    await this.setMeta({ rev: remote.rev || 0, dirty: true, last: null });
    await this.run(true);
  },
  /* Weiteres Gerät: per Kopplungscode verbinden und Stand herunterladen (ersetzt lokale Daten) */
  async pair(code) {
    const o = this.parseCode(code);
    const r = await this.req('GET', '/sync', null, o.u.replace(/\/+$/, ''), o.t);
    if (!r.rev || !r.blob) throw new Error('Auf dem Server liegen noch keine Daten. Aktiviere den Sync zuerst auf dem anderen Gerät.');
    const st = await this.open(r.blob, o.k);
    this.applying = true;
    Store.state = migrate(st); Object.assign(S().settings, { proxyUrl: o.u, proxyToken: o.t, syncKey: o.k, sync: true });
    await Store.saveNow(); this.applying = false;
    await this.setMeta({ rev: r.rev, dirty: false, last: Date.now() });
  },
  async disable() { S().settings.sync = false; await Store.saveNow(); },
  async resetServer() { await this.req('DELETE', '/sync'); await this.setMeta({ rev: 0, dirty: true, last: null }); },

  markDirty() {
    if (this.applying || !this.enabled()) return;
    this.setMeta && this.meta().then(m => { if (!m.dirty) { m.dirty = true; this.setMeta(m); } });
    clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 15000);
  },

  /* Zusammenführen, wenn auf beiden Geräten geändert wurde: alles behalten, bei gleicher ID gewinnt dieses Gerät */
  merge(local, remote) {
    const byId = (a = [], b = [], k = 'id') => { const m = new Map(); for (const x of b) m.set(x[k], x); for (const x of a) m.set(x[k], x); return [...m.values()]; };
    const out = { ...remote, ...local };
    for (const k of ['accounts', 'transactions', 'categories', 'rules', 'goals', 'positions', 'trades', 'contracts']) out[k] = byId(local[k], remote[k]);
    out.transactions.sort((a, b) => b.date.localeCompare(a.date));
    out.snapshots = byId(local.snapshots, remote.snapshots, 'date').sort((a, b) => a.date.localeCompare(b.date));
    out.budgets = { ...remote.budgets, ...local.budgets }; out.targets = { ...(remote.targets || {}), ...(local.targets || {}) };
    const ls = local.shared || { people: [], entries: [] }, rs = remote.shared || { people: [], entries: [] };
    out.shared = { people: byId(ls.people, rs.people), entries: byId(ls.entries, rs.entries).sort((a, b) => b.date.localeCompare(a.date)) };
    out.settings = { ...remote.settings, ...local.settings };
    return out;
  },

  async run(force = false, depth = 0) {
    if (!this.enabled() || this.running || !navigator.onLine) return;
    this.running = true; this.lastErr = '';
    try {
      const meta = await this.meta(); const r = await this.req('GET', '/sync/rev');
      let pulled = false;
      if (r.rev > meta.rev) {
        const full = await this.req('GET', '/sync'); const remote = migrate(await this.open(full.blob));
        this.applying = true;
        Store.state = meta.dirty ? this.merge(S(), remote) : remote;
        await Store.saveNow(); this.applying = false;
        meta.rev = full.rev; pulled = true;
        if (!meta.dirty) { meta.last = Date.now(); await this.setMeta(meta); this.status = 'Neuer Stand vom anderen Gerät geladen'; App.render(); return; }
      }
      if (meta.dirty || force || r.rev < meta.rev) {
        const res = await this.req('PUT', '/sync', { baseRev: r.rev > meta.rev ? r.rev : (pulled ? meta.rev : r.rev), blob: await this.seal(S()), device: navigator.userAgent.slice(0, 60) });
        if (res.conflict) { this.running = false; if (depth < 2) return this.run(force, depth + 1); throw new Error('Konflikt beim Abgleich'); }
        meta.rev = res.rev; meta.dirty = false;
        this.status = pulled ? 'Zusammengeführt und hochgeladen' : 'Hochgeladen';
      } else this.status = 'Aktuell';
      meta.last = Date.now(); await this.setMeta(meta);
      if (pulled) App.render();
    } catch (e) { this.lastErr = e.message; this.status = 'Fehler: ' + e.message; }
    finally { this.applying = false; this.running = false; const el = document.getElementById('sync-status'); if (el) el.textContent = this.status; }
  },
};
