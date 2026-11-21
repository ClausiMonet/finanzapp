'use strict';
/* Kursabruf über deinen eigenen Cloudflare-Proxy (Yahoo Finance).
   Es werden nur Tickersymbole übertragen – niemals Stückzahlen, Beträge oder Kontostände. */
const Prices = {
  base() { return (S().settings.proxyUrl || '').trim().replace(/\/+$/, ''); },
  configured() { return !!this.base(); },
  async call(path) {
    const url = this.base() + path;
    const r = await fetch(url, { headers: { 'X-Token': S().settings.proxyToken || '' }, cache: 'no-store' });
    if (r.status === 401) throw new Error('Proxy lehnt ab: Token falsch');
    if (!r.ok) throw new Error('Proxy-Fehler ' + r.status);
    return r.json();
  },
  async search(q) { const j = await this.call('/search?q=' + encodeURIComponent(q)); return j.results || []; },
  async quotes(symbols) {
    if (!symbols.length) return {};
    const out = {};
    for (let i = 0; i < symbols.length; i += 20) {
      const chunk = symbols.slice(i, i + 20);
      const j = await this.call('/quote?symbols=' + encodeURIComponent(chunk.join(',')));
      for (const q of j.quotes || []) out[q.symbol] = q;
    }
    return out;
  },
  async history(symbol, range = '1y') { const j = await this.call('/history?symbol=' + encodeURIComponent(symbol) + '&range=' + range); return j.points || []; },

  /* Alle Positionen mit Symbol aktualisieren; Fremdwährungen in EUR umrechnen */
  async updateAll() {
    const ps = S().positions.filter(p => p.symbol);
    if (!ps.length) return { ok: 0, fail: [] };
    const syms = [...new Set(ps.map(p => p.symbol))];
    const q = await this.quotes(syms);
    const ccys = [...new Set(Object.values(q).map(x => x.currency).filter(c => c && c !== 'EUR'))];
    const fx = {};
    if (ccys.length) {
      const fq = await this.quotes(ccys.map(c => (c === 'GBp' || c === 'GBX' ? 'GBP' : c) + 'EUR=X'));
      for (const c of ccys) { const k = (c === 'GBp' || c === 'GBX' ? 'GBP' : c) + 'EUR=X'; if (fq[k]) fx[c] = fq[k].price * (c === 'GBp' || c === 'GBX' ? 0.01 : 1); }
    }
    let ok = 0; const fail = [];
    for (const p of ps) {
      const x = q[p.symbol];
      if (!x || !isFinite(x.price)) { fail.push(p.name || p.symbol); continue; }
      const rate = !x.currency || x.currency === 'EUR' ? 1 : fx[x.currency];
      if (!rate) { fail.push((p.name || p.symbol) + ' (Währung ' + x.currency + ')'); continue; }
      p.lastPrice = x.price * rate; p.priceCcy = x.currency; p.prevClose = x.prevClose ? x.prevClose * rate : null;
      p.lastPriceTime = x.time || Date.now(); ok++;
    }
    S().settings.lastPriceUpdate = Date.now();
    Store.save(); recordSnapshot();
    return { ok, fail };
  },
};
