'use strict';
/* Verschlüsselte Datenhaltung: PBKDF2 (SHA-256, 310.000 Runden) -> AES-GCM 256.
   Gespeichert wird nur der verschlüsselte Block in IndexedDB (Fallback localStorage). */

const Crypto = {
  ITER: 310000,
  enc: new TextEncoder(), dec: new TextDecoder(),
  b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
  unb64(s) { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; },
  async deriveKey(pw, salt, iter = this.ITER) {
    const base = await crypto.subtle.importKey('raw', this.enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async encrypt(key, salt, obj, iter = this.ITER) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, this.enc.encode(JSON.stringify(obj)));
    return { app: 'finanzapp', v: 1, iter, salt: this.b64(salt), iv: this.b64(iv), ct: this.b64(ct) };
  },
  async decrypt(key, blob) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(blob.iv) }, key, this.unb64(blob.ct));
    return JSON.parse(this.dec.decode(pt));
  },
};

const DB = {
  name: 'finanzapp', store: 'vault', _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(this.store);
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    try { const db = await this.open(); return await new Promise((res, rej) => { const r = db.transaction(this.store).objectStore(this.store).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
    catch { try { const v = localStorage.getItem('fa_' + k); return v ? JSON.parse(v) : undefined; } catch { return undefined; } }
  },
  async set(k, v) {
    try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction(this.store, 'readwrite'); tx.objectStore(this.store).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
    catch { localStorage.setItem('fa_' + k, JSON.stringify(v)); }
  },
  async keys() {
    try { const db = await this.open(); return await new Promise((res, rej) => { const r = db.transaction(this.store).objectStore(this.store).getAllKeys(); r.onsuccess = () => res(r.result.map(String)); r.onerror = () => rej(r.error); }); }
    catch { try { return Object.keys(localStorage).filter(k => k.startsWith('fa_')).map(k => k.slice(3)); } catch { return []; } }
  },
  async clear() { for (const k of await this.keys()) await this.del(k); },
  async del(k) {
    try { const db = await this.open(); await new Promise(res => { const tx = db.transaction(this.store, 'readwrite'); tx.objectStore(this.store).delete(k); tx.oncomplete = res; }); } catch {}
    try { localStorage.removeItem('fa_' + k); } catch {}
  },
};

/* Standard-Kategorien & Regeln */
const DEFAULT_CATEGORIES = [
  ['gehalt', 'Gehalt & Lohn', 'income', '#059669', '💼'],
  ['einnahmen', 'Sonstige Einnahmen', 'income', '#10b981', '💶'],
  ['kapitalertrag', 'Zinsen & Dividenden', 'income', '#0d9488', '🪙'],
  ['wohnen', 'Wohnen & Nebenkosten', 'expense', '#6366f1', '🏠'],
  ['lebensmittel', 'Lebensmittel', 'expense', '#16a34a', '🛒'],
  ['restaurant', 'Restaurant & Café', 'expense', '#f97316', '🍽️'],
  ['mobilitaet', 'Mobilität', 'expense', '#0ea5e9', '🚆'],
  ['versicherung', 'Versicherungen', 'expense', '#8b5cf6', '🛡️'],
  ['abos', 'Abos & Verträge', 'expense', '#ec4899', '🔁'],
  ['shopping', 'Shopping', 'expense', '#f59e0b', '🛍️'],
  ['freizeit', 'Freizeit & Sport', 'expense', '#14b8a6', '🎟️'],
  ['gesundheit', 'Gesundheit & Drogerie', 'expense', '#ef4444', '💊'],
  ['bildung', 'Bildung & Studium', 'expense', '#3b82f6', '🎓'],
  ['reisen', 'Reisen', 'expense', '#06b6d4', '✈️'],
  ['bargeld', 'Bargeld', 'expense', '#78716c', '🏧'],
  ['geschenke', 'Geschenke & Spenden', 'expense', '#e11d48', '🎁'],
  ['gebuehren', 'Gebühren & Steuern', 'expense', '#64748b', '🧾'],
  ['sonstiges', 'Sonstiges', 'expense', '#94a3b8', '❔'],
  ['sparen', 'Sparen & Investieren', 'transfer', '#2563eb', '📈'],
  ['umbuchung', 'Umbuchung (eigene Konten)', 'transfer', '#475569', '🔀'],
].map(([id, name, type, color, icon]) => ({ id, name, type, color, icon }));

const DEFAULT_RULES = [
  ['REWE|EDEKA|ALDI|LIDL|NETTO|KAUFLAND|PENNY|NORMA|TEGUT|GLOBUS|HIT |BIOMARKT|DENNS|ALNATURA', 'lebensmittel'],
  ['LIEFERANDO|WOLT|UBER EATS|MCDONALD|BURGER KING|STARBUCKS|SUBWAY|KFC|BACKWERK|BAECKEREI|BÄCKEREI|MENSA|STUDIERENDENWERK', 'restaurant'],
  ['NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME|PRIME VIDEO|YOUTUBE|APPLE.COM/BILL|ICLOUD|GOOGLE ONE|DAZN|AUDIBLE|CHATGPT|OPENAI|ANTHROPIC|PLAYSTATION|XBOX|NINTENDO|VODAFONE|TELEKOM|O2 |CONGSTAR|1&1|FREENET|RUNDFUNK|ARD ZDF|URBAN SPORTS|FITNESS|MCFIT|FITX|CLEVER FIT', 'abos'],
  ['DB VERTRIEB|DEUTSCHE BAHN|BAHN.DE|FLIXBUS|SHELL|ARAL|ESSO|TOTAL|JET |AVIA|TANKSTELLE|BVG|MVG|HVV|KVB|VRR|RMV|DEUTSCHLANDTICKET|UBER |BOLT|TIER|LIME|SIXT|SHARE NOW|MILES|PARK', 'mobilitaet'],
  ['LOHN|GEHALT|BEZUEGE|BEZÜGE|BAFOEG|BAFÖG|STIPENDIUM', 'gehalt'],
  ['MIETE|NEBENKOSTEN|STADTWERKE|E\\.ON|EON |VATTENFALL|ENBW|STROM|GASAG|WOHNUNGSBAU|HAUSVERWALTUNG', 'wohnen'],
  ['ALLIANZ|HUK|AXA|ERGO|GENERALI|DEBEKA|R\\+V|VERSICHERUNG|HANSEMERKUR|TECHNIKER KRANKENKASSE|AOK|BARMER|DAK', 'versicherung'],
  ['GELDAUTOMAT|BARGELDAUSZAHLUNG|BARGELD|AUSZAHLUNG GAA|ATM', 'bargeld'],
  ['TRADE REPUBLIC|SCALABLE|BITVAVO|SPARPLAN|WERTPAPIER|DEPOT', 'sparen'],
  ['AMAZON|ZALANDO|MEDIAMARKT|MEDIA MARKT|SATURN|OTTO |EBAY|IKEA|H&M|ZARA|DECATHLON|THALIA|ALIEXPRESS|TEMU|BAMBU', 'shopping'],
  ['APOTHEKE|DM-DROGERIE|DM DROGERIE|ROSSMANN|MUELLER|MÜLLER|ARZT|PRAXIS|ZAHNARZT', 'gesundheit'],
  ['UNIVERSITAET|UNIVERSITÄT|HOCHSCHULE|SEMESTERBEITRAG|STUDENTENWERK|UDEMY|COURSERA', 'bildung'],
  ['BOOKING.COM|AIRBNB|LUFTHANSA|RYANAIR|EUROWINGS|EASYJET|HOTEL', 'reisen'],
  ['ZINSGUTSCHRIFT|HABENZINS|ZINSERTRAG|ZINSEN|DIVIDENDE|AUSSCHUETTUNG|AUSSCHÜTTUNG|ERTRAGSGUTSCHRIFT', 'kapitalertrag'],
  ['FINANZAMT|GEBUEHR|GEBÜHR|ENTGELT|KONTOFUEHRUNG|KONTOFÜHRUNG|ZINSEN', 'gebuehren'],
  ['KINO|CINEMA|CINEMAXX|EVENTIM|STEAM|SPORT', 'freizeit'],
].map(([pattern, categoryId]) => ({ id: uid(), pattern, categoryId }));

function emptyState() {
  return {
    version: 1,
    created: new Date().toISOString(),
    accounts: [],
    transactions: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    rules: DEFAULT_RULES.map(r => ({ ...r })),
    budgets: {},          // categoryId -> Monatsbudget
    goals: [],
    positions: [],
    trades: [],
    contracts: [],        // bestätigte/ignorierte/manuelle Verträge
    targets: {},          // Rebalancing-Zielgewichte je Position
    shared: { people: [], entries: [] },
    snapshots: [],        // {date, net}
    settings: { proxyUrl: '', proxyToken: '', theme: 'auto', autoLockMin: 5, privacy: false, privacyOnStart: false, benchmark: 'EUNL.DE', notify: false, pauschbetrag: 1000, sync: false, fullName: '', address: '', lastPriceUpdate: null },
  };
}

const Store = {
  state: null, key: null, salt: null, iter: Crypto.ITER, _saving: null,

  async exists() { return !!(await DB.get('vault')); },

  async create(pw) {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.iter = Crypto.ITER;
    this.key = await Crypto.deriveKey(pw, this.salt, this.iter);
    this.state = emptyState();
    await this.saveNow();
  },

  async unlock(pw) {
    const blob = await DB.get('vault');
    if (!blob) throw new Error('Keine Daten');
    const salt = Crypto.unb64(blob.salt);
    const key = await Crypto.deriveKey(pw, salt, blob.iter || Crypto.ITER);
    const st = await Crypto.decrypt(key, blob); // wirft bei falschem Passwort
    this.salt = salt; this.key = key; this.iter = blob.iter || Crypto.ITER;
    this.state = migrate(st);
  },

  lock() { this.state = null; this.key = null; },

  async saveNow() {
    if (!this.key || !this.state) return;
    const blob = await Crypto.encrypt(this.key, this.salt, this.state, this.iter);
    await DB.set('vault', blob);
  },
  save: null, // wird unten mit debounce belegt

  async changePassword(newPw) {
    const all = await Receipts.exportAll(); // mit altem Schlüssel entschlüsseln
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await Crypto.deriveKey(newPw, this.salt, this.iter);
    await Receipts.importAll(all);         // mit neuem Schlüssel verschlüsseln
    await this.saveNow();
    if (typeof Bio !== 'undefined') await Bio.disable();
  },

  /* Backup: eigenes Passwort möglich (Standard: gleiches wie App) */
  async exportBackup(pw, withReceipts = true) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await Crypto.deriveKey(pw, salt);
    const payload = withReceipts ? { ...this.state, _receipts: await Receipts.exportAll() } : this.state;
    return JSON.stringify(await Crypto.encrypt(key, salt, payload));
  },
  async readBackup(text, pw) {
    const blob = JSON.parse(text);
    if (blob.app !== 'finanzapp') throw new Error('Keine Finanzapp-Backup-Datei');
    const key = await Crypto.deriveKey(pw, Crypto.unb64(blob.salt), blob.iter || Crypto.ITER);
    return migrate(await Crypto.decrypt(key, blob));
  },
  async wipe() { await DB.clear(); this.lock(); },
};
Store.save = debounce(() => { Store.saveNow().catch(e => { console.error(e); toast('Speichern fehlgeschlagen!'); }); if (typeof Sync !== 'undefined') Sync.markDirty(); }, 400);

/* Belege (Fotos/PDFs): einzeln verschlüsselt in IndexedDB, nicht im Hauptdatensatz */
const Receipts = {
  MAX: 8 * 1024 * 1024,
  async add(file) {
    if (file.size > this.MAX * 2) throw new Error('Datei zu groß (max. 16 MB)');
    let type = file.type || 'application/octet-stream', data;
    if (type.startsWith('image/')) { const r = await this.shrink(file); type = r.type; data = r.data; }
    else { data = Crypto.b64(await file.arrayBuffer()); }
    const id = 'r' + uid();
    await this.put(id, { type, data, name: file.name, added: new Date().toISOString() });
    return id;
  },
  async put(id, obj) { await DB.set('rcpt_' + id, await Crypto.encrypt(Store.key, Store.salt, obj, Store.iter)); },
  async raw(id) { const b = await DB.get('rcpt_' + id); return b ? Crypto.decrypt(Store.key, b) : null; },
  _cache: {},
  async load(id) {
    if (this._cache[id]) return this._cache[id];
    const o = await this.raw(id); if (!o) return null;
    const bin = Crypto.unb64(o.data); const url = URL.createObjectURL(new Blob([bin], { type: o.type }));
    return (this._cache[id] = { type: o.type, url, name: o.name });
  },
  async remove(id) { delete this._cache[id]; await DB.del('rcpt_' + id); },
  async view(id) {
    const d = await this.load(id); if (!d) return toast('Beleg nicht gefunden');
    const m = openModal(d.name || 'Beleg', d.type.startsWith('image/') ? `<img src="${d.url}" style="width:100%;border-radius:10px" alt="Beleg">` : `<iframe src="${d.url}" style="width:100%;height:70vh;border:0;border-radius:10px"></iframe>`, { wide: true });
    const a = document.createElement('div'); a.className = 'modal-actions'; a.innerHTML = '<button class="btn" data-dl>⬇ Herunterladen</button>';
    m.querySelector('.modal-body').appendChild(a);
    a.querySelector('[data-dl]').onclick = async () => { const o = await this.raw(id); downloadFile(o.name || ('beleg.' + (o.type.split('/')[1] || 'bin')), new Blob([Crypto.unb64(o.data)], { type: o.type })); };
  },
  /* Bilder verkleinern (max. 1800 px, JPEG) – spart Speicher */
  shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1800 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); const du = c.toDataURL('image/jpeg', 0.75);
        res({ type: 'image/jpeg', data: du.split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = url;
    });
  },
  async ids() { return (await DB.keys()).filter(k => k.startsWith('rcpt_')).map(k => k.slice(5)); },
  async exportAll() { const o = {}; for (const id of await this.ids()) { try { o[id] = await this.raw(id); } catch {} } return o; },
  async importAll(o) { for (const [id, v] of Object.entries(o || {})) await this.put(id, v); this._cache = {}; },
};

const TAX_TYPES = { werbungskosten: 'Werbungskosten (Studium/Beruf)', sonderausgaben: 'Sonderausgaben (Versicherung, Spenden …)', haushalt: 'Haushaltsnahe Dienste/Handwerker', aussergewoehnlich: 'Außergewöhnliche Belastungen', kapital: 'Kapitalerträge', sonstiges: 'Sonstiges' };

function migrate(st) {
  const base = emptyState();
  for (const k of Object.keys(base)) if (st[k] === undefined) st[k] = base[k];
  st.settings = { ...base.settings, ...st.settings };
  // neue Standardkategorien ergänzen
  for (const c of base.categories) if (!st.categories.find(x => x.id === c.id)) st.categories.push(c);
  if (!st.rules.some(r => r.categoryId === 'kapitalertrag')) { const r = base.rules.find(r => r.categoryId === 'kapitalertrag'); const i = st.rules.findIndex(x => x.categoryId === 'gebuehren'); st.rules.splice(i < 0 ? st.rules.length : i, 0, r); }
  return st;
}

/* ---------- Abgeleitete Werte ---------- */
const S = () => Store.state;
const ACCOUNT_TYPES = {
  giro: { name: 'Girokonto', icon: '🏦' },
  tagesgeld: { name: 'Tagesgeld / Sparkonto', icon: '💰' },
  depot: { name: 'Depot', icon: '📈' },
  krypto: { name: 'Krypto', icon: '₿' },
  bar: { name: 'Bargeld', icon: '👛' },
  kredit: { name: 'Kreditkarte / Kredit', icon: '💳' },
  sonstiges: { name: 'Sonstiges Vermögen', icon: '🏷️' },
};
const isInvestAcc = a => a.type === 'depot' || a.type === 'krypto';

/* Buchung in Teile zerlegen (Split-Buchungen); Rest geht an die Hauptkategorie */
function txParts(t) {
  if (!t.splits || !t.splits.length) return [{ categoryId: t.categoryId, amount: t.amount }];
  const sum = t.splits.reduce((s, p) => s + p.amount, 0);
  const rest = Math.round((t.amount - sum) * 100) / 100;
  const out = t.splits.map(p => ({ categoryId: p.categoryId, amount: p.amount }));
  if (Math.abs(rest) >= 0.005) out.push({ categoryId: t.categoryId, amount: rest });
  return out;
}
function catById(id) { return S().categories.find(c => c.id === id) || S().categories.find(c => c.id === 'sonstiges'); }
function accById(id) { return S().accounts.find(a => a.id === id); }

function txSum(accountId) { let s = 0; for (const t of S().transactions) if (t.accountId === accountId) s += t.amount; return s; }
function positionsValue(accountId) {
  let v = 0;
  for (const p of S().positions) if (!accountId || p.accountId === accountId) v += (p.shares || 0) * (p.lastPrice ?? p.buyPrice ?? 0);
  return v;
}
function positionsCost(accountId) {
  let v = 0;
  for (const p of S().positions) if (!accountId || p.accountId === accountId) v += (p.shares || 0) * (p.buyPrice || 0);
  return v;
}
function accountBalance(a) {
  if (isInvestAcc(a)) return positionsValue(a.id) + (a.cash || 0);
  return (a.offset || 0) + txSum(a.id);
}
function grossAssets() { return S().accounts.filter(a => !a.hidden).reduce((s, a) => s + Math.max(0, accountBalance(a)), 0); }
function netWorth() { return S().accounts.filter(a => !a.hidden).reduce((s, a) => s + accountBalance(a), 0); }

/* Tagesstand des Nettovermögens festhalten (für den Verlauf) */
function recordSnapshot() {
  const st = S(); if (!st || !st.accounts.length) return;
  const d = todayISO(); const net = Math.round(netWorth() * 100) / 100;
  const last = st.snapshots[st.snapshots.length - 1];
  if (last && last.date === d) { if (last.net !== net) { last.net = net; Store.save(); } }
  else { st.snapshots.push({ date: d, net }); st.snapshots.sort((a, b) => a.date.localeCompare(b.date)); Store.save(); }
}

/* Regeln anwenden */
function categorize(t) {
  const hay = ((t.payee || '') + ' ' + (t.purpose || '')).toUpperCase();
  for (const r of S().rules) {
    try {
      if (!new RegExp(r.pattern, 'i').test(hay)) continue;
      const c = S().categories.find(x => x.id === r.categoryId);
      if (c && c.type === 'income' && t.amount < 0) continue; // z. B. Sollzinsen sind keine Einnahme
      return r.categoryId;
    } catch {}
  }
  return t.amount > 0 ? 'einnahmen' : 'sonstiges';
}
function recategorizeAll(onlyAuto = true) {
  let n = 0;
  for (const t of S().transactions) {
    if (onlyAuto && t.manualCat) continue;
    const c = categorize(t); if (c !== t.categoryId) { t.categoryId = c; n++; }
  }
  Store.save(); return n;
}
