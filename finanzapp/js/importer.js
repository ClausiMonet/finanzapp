'use strict';
/* CSV-Import für Kontoumsätze (Sparkasse, Volksbank, ING, DKB, comdirect, Trade Republic, …)
   und für Broker-Transaktionen (Scalable Capital, Bitvavo, Trade Republic, generisch). */

const Importer = {
  /* ---------- CSV-Grundlagen ---------- */
  detectDelimiter(text) {
    const lines = text.split(/\r?\n/).slice(0, 40);
    let best = ';', bestScore = -1;
    for (const d of [';', ',', '\t', '|']) {
      const counts = lines.map(l => this.splitLine(l, d).length).filter(n => n > 2);
      if (!counts.length) continue;
      // häufigste Spaltenanzahl * Anzahl Zeilen mit dieser Spaltenzahl
      const freq = {}; counts.forEach(n => freq[n] = (freq[n] || 0) + 1);
      const [n, f] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      const score = f * 10 + (+n);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  },
  splitLine(line, d) { return this.parse(line, d)[0] || []; },
  parse(text, d) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
  },
  norm(s) { return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9*/ ]/g, ' ').replace(/\s+/g, ' ').trim(); },

  /* Kopfzeile finden: erste Zeile mit Datums-Spaltenname, auf die eine Zeile mit Datum folgt */
  findHeader(rows) {
    const dateHead = /(buchung|datum|date|valuta|wertstellung|zeit|time)/;
    for (let i = 0; i < Math.min(rows.length - 1, 40); i++) {
      const r = rows[i];
      if (r.length < 3) continue;
      const nr = r.map(x => this.norm(x));
      if (!nr.some(x => dateHead.test(x))) continue;
      if (r.some(x => parseDate(x))) continue; // Datenzeile, keine Kopfzeile
      for (let j = i + 1; j < Math.min(rows.length, i + 4); j++) if (rows[j].some(x => parseDate(x))) return i;
    }
    return -1;
  },

  /* ---------- Kontoumsätze ---------- */
  FIELDS: { date: 'Buchungsdatum', amount: 'Betrag', payee: 'Empfänger/Auftraggeber', payeeOut: 'Empfänger (bei Ausgaben)', payeeIn: 'Auftraggeber (bei Einnahmen)', purpose: 'Verwendungszweck', text: 'Buchungstext', debit: 'Soll-Betrag', credit: 'Haben-Betrag', sh: 'Soll/Haben-Kennzeichen' },

  guessMapping(header) {
    const H = header.map(h => this.norm(h));
    const find = (tests, exclude) => { for (const t of tests) { const i = H.findIndex((h, idx) => (t instanceof RegExp ? t.test(h) : h === t) && !(exclude && exclude.test(h))); if (i > -1) return i; } return -1; };
    const m = {};
    m.date = find(['buchungstag', 'buchungsdatum', 'buchung', 'datum', 'date', /^buchung/, /datum/, 'valutadatum', 'wertstellung', /valuta/]);
    m.amount = find(['betrag', 'betrag eur', 'betrag euro', 'umsatz in eur', 'umsatz', 'amount', /^betrag/, /umsatz in/, /^betrag \(/], /(saldo|ursprungsbetrag|auslagen|gebuehr|fee|steuer)/);
    m.payeeOut = find([/zahlungsempfaenger/, /^empfaenger$/, /beguenstigter$/]);
    m.payeeIn = find([/zahlungspflichtige/, /^auftraggeber$/]);
    m.payee = find(['beguenstigter/zahlungspflichtiger', 'beguenstigter zahlungspflichtiger', 'name zahlungsbeteiligter', 'auftraggeber/empfaenger', 'auftraggeber / beguenstigter', /auftraggeber.*(empfaenger|beguenstigter)/, /zahlungsbeteiligter$/, /^name$/, 'gegenseite', 'counterparty', 'payee', /empfaenger/, /auftraggeber/]);
    if (m.payeeOut > -1 && m.payeeIn > -1 && m.payeeOut !== m.payeeIn) m.payee = -1;
    else { m.payeeOut = -1; m.payeeIn = -1; }
    m.purpose = find(['verwendungszweck', /verwendungszweck/, 'description', 'beschreibung', 'reference', 'notiz']);
    m.text = find(['buchungstext', 'vorgang', 'umsatzart', 'umsatztyp', 'transaktionsart', 'type', 'typ'], /verwendungszweck/);
    if (m.amount < 0) { m.debit = find(['soll', /^soll/, 'ausgang', 'debit']); m.credit = find(['haben', /^haben/, 'eingang', 'credit']); }
    m.sh = find([/^soll haben$/, /^s h$/, 'soll/haben', /kennzeichen/]);
    return m;
  },

  detectBank(header, pre) {
    const H = header.map(h => this.norm(h)).join('|'); const P = pre.flat().join(' ').toLowerCase();
    if (H.includes('auftragskonto') && H.includes('beguenstigter')) return 'Sparkasse';
    if (H.includes('name zahlungsbeteiligter')) return 'Volksbank/Raiffeisenbank';
    if (H.includes('zahlungsempfaenger*in') || H.includes('zahlungsempfaenger in') || P.includes('dkb')) return 'DKB';
    if (H.includes('umsatz in eur') || P.includes('comdirect')) return 'comdirect';
    if (H.includes('auftraggeber/empfaenger') || P.includes('ing-diba') || P.includes(' ing ')) return 'ING';
    if (P.includes('trade republic') || H.includes('trade republic')) return 'Trade Republic';
    return 'Unbekannt (automatische Zuordnung)';
  },

  /* comdirect: Empfänger steckt im Buchungstext */
  extractPayee(text) {
    const m = String(text || '').match(/(?:Auftraggeber|Empfänger|Empfaenger|Zahlungspflichtiger):\s*(.+?)(?:\s+(?:Buchungstext|Kto\/IBAN|IBAN|Ref\.|BLZ\/BIC|BIC):|$)/i);
    return m ? m[1].trim() : '';
  },

  analyze(text) {
    const delim = this.detectDelimiter(text);
    const rows = this.parse(text, delim);
    const hi = this.findHeader(rows);
    if (hi < 0) throw new Error('Keine Kopfzeile mit Datumsspalte gefunden. Ist das eine Umsatz-CSV?');
    const header = rows[hi]; const data = rows.slice(hi + 1);
    return { delim, header, data, pre: rows.slice(0, hi), mapping: this.guessMapping(header), bank: this.detectBank(header, rows.slice(0, hi)) };
  },

  build(an, mapping, accountId) {
    const out = []; const seen = {}; const m = mapping; let skipped = 0;
    for (const r of an.data) {
      const date = parseDate(r[m.date]);
      if (!date) { skipped++; continue; }
      let amount;
      if (m.amount > -1) amount = parseNum(r[m.amount]);
      else if (m.debit > -1 || m.credit > -1) { const d = parseNum(r[m.debit]); const c = parseNum(r[m.credit]); amount = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d)); }
      if (amount === undefined || isNaN(amount)) { skipped++; continue; }
      if (m.sh > -1) { const k = (r[m.sh] || '').trim().toUpperCase(); if (k === 'S') amount = -Math.abs(amount); else if (k === 'H') amount = Math.abs(amount); }
      amount = Math.round(amount * 100) / 100;
      let payee = '';
      if (m.payeeOut > -1 || m.payeeIn > -1) payee = (amount < 0 ? (r[m.payeeOut] || r[m.payeeIn]) : (r[m.payeeIn] || r[m.payeeOut])) || '';
      else if (m.payee > -1) payee = r[m.payee] || '';
      const text = m.text > -1 ? r[m.text] || '' : '';
      let purpose = m.purpose > -1 ? r[m.purpose] || '' : '';
      if (!payee) payee = this.extractPayee(text) || this.extractPayee(purpose);
      if (!purpose && text) { const bt = text.match(/Buchungstext:\s*(.+?)(?:\s+Ref\.|$)/i); purpose = bt ? bt[1] : text; }
      payee = payee.replace(/\s+/g, ' ').trim(); purpose = purpose.replace(/\s+/g, ' ').trim();
      // PayPal: echten Händler aus dem Verwendungszweck holen ("… Ihr Einkauf bei Spotify")
      if (/paypal/i.test(payee)) { const pm = purpose.match(/(?:Ihr Einkauf bei|Your purchase at|Einkauf bei)\s+([^,.;]+?)(?:\s*,|\s*\.|\s+Artikel|$)/i); if (pm && pm[1].trim().length > 1) { purpose = purpose + ' (PayPal)'; payee = pm[1].trim(); } }
      const base = [date, amount.toFixed(2), payee.toUpperCase(), purpose.toUpperCase().slice(0, 80)].join('|');
      seen[base] = (seen[base] || 0) + 1;
      const t = { id: uid(), accountId, date, amount, payee, purpose, kind: text, hash: hashStr(base + '#' + seen[base]) };
      t.categoryId = categorize(t);
      out.push(t);
    }
    return { txs: out, skipped };
  },

  commit(txs, accountId) {
    const existing = new Set(S().transactions.filter(t => t.accountId === accountId).map(t => t.hash));
    const fresh = txs.filter(t => !existing.has(t.hash));
    S().transactions.push(...fresh);
    S().transactions.sort((a, b) => b.date.localeCompare(a.date));
    Store.save();
    return { added: fresh.length, dupes: txs.length - fresh.length };
  },

  /* ---------- PayPal-Abgleich ---------- */
  isPayPal(an) { const H = an.header.map(h => this.norm(h)); return (H.includes('transaktionscode') || H.includes('transaction id')) && (H.includes('brutto') || H.includes('gross')); },
  paypalRows(an) {
    const H = an.header.map(h => this.norm(h)); const ix = (...n) => { for (const x of n) { const i = H.indexOf(x); if (i > -1) return i; } return -1; };
    const iD = ix('datum', 'date'), iN = ix('name'), iB = ix('brutto', 'gross'), iC = ix('waehrung', 'currency'), iS = ix('status'), iT = ix('typ', 'type'), iA = ix('artikelbezeichnung', 'item title'), iE = ix('empfaenger e mail adresse', 'to email address');
    const out = [];
    for (const r of an.data) {
      const date = parseDate(r[iD]); const amount = parseNum(r[iB]); const name = (r[iN] || '').trim();
      if (!date || isNaN(amount) || amount >= 0 || !name) continue;
      if (iC > -1 && r[iC] && r[iC] !== 'EUR') continue;
      if (iS > -1 && /(abgelehnt|storniert|denied|cancel)/i.test(r[iS] || '')) continue;
      if (iT > -1 && /(bankgutschrift|bank deposit|waehrungsumrechnung|währungsumrechnung|currency conversion|allgemeine abbuchung)/i.test(r[iT] || '')) continue;
      out.push({ date, amount: Math.round(amount * 100) / 100, name, item: iA > -1 ? (r[iA] || '').trim() : '' });
    }
    return out;
  },
  matchPayPal(rows) {
    const cands = S().transactions.filter(t => t.amount < 0 && /paypal/i.test((t.ppOrig || t.payee || '') + ' ' + t.purpose) && !t.ppMatched);
    const used = new Set(); const matches = [];
    for (const pp of rows) {
      let best = null, bd = 99;
      for (const t of cands) {
        if (used.has(t.id) || Math.abs(t.amount - pp.amount) > 0.009) continue;
        const d = daysBetween(pp.date, t.date); if (d < -2 || d > 7) continue;
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = t; }
      }
      if (best) { used.add(best.id); matches.push({ t: best, pp }); }
    }
    return matches;
  },
  applyPayPal(matches) {
    for (const { t, pp } of matches) {
      if (!t.ppOrig) t.ppOrig = t.payee;
      t.payee = pp.name; t.ppMatched = true;
      if (pp.item && !t.purpose.includes(pp.item)) t.purpose = (pp.item + ' · ' + t.purpose).slice(0, 200);
      if (!t.manualCat) t.categoryId = categorize(t);
    }
    Store.save(); return matches.length;
  },

  /* ---------- Broker / Krypto ---------- */
  BFIELDS: { date: 'Datum', type: 'Typ (Kauf/Verkauf)', isin: 'ISIN / Symbol', name: 'Name', shares: 'Stück / Menge', price: 'Kurs je Stück', amount: 'Betrag gesamt', fee: 'Gebühr', currency: 'Währung' },

  analyzeBroker(text) {
    const delim = this.detectDelimiter(text);
    const rows = this.parse(text, delim);
    const hi = this.findHeader(rows);
    if (hi < 0) throw new Error('Keine Kopfzeile gefunden.');
    const header = rows[hi]; const H = header.map(h => this.norm(h)); const data = rows.slice(hi + 1);
    const find = (tests, ex) => { for (const t of tests) { const i = H.findIndex(h => (t instanceof RegExp ? t.test(h) : h === t) && !(ex && ex.test(h))); if (i > -1) return i; } return -1; };
    let broker = 'Generisch';
    if (H.includes('received / paid currency') || H.includes('received paid currency') || (H.includes('quote price') && H.includes('timezone'))) broker = 'Bitvavo';
    else if (H.includes('assettype') || (H.includes('isin') && H.includes('shares') && H.includes('reference'))) broker = 'Scalable Capital';
    else if (rows.slice(0, hi).flat().join(' ').toLowerCase().includes('trade republic')) broker = 'Trade Republic';
    const m = {
      date: find(['date', 'datum', 'buchungstag', /datum/, /date/]),
      type: find(['type', 'typ', 'transaktionsart', 'art', 'vorgang', /typ/], /asset/),
      isin: broker === 'Bitvavo' ? find(['currency']) : find(['isin', 'symbol', 'wkn', 'ticker', /isin/]),
      name: find(['description', 'name', 'wertpapier', 'bezeichnung', 'titel', /name/]),
      shares: broker === 'Bitvavo' ? find(['amount']) : find(['shares', 'stueck', 'anzahl', 'menge', 'quantity', /stueck/, /anzahl/]),
      price: broker === 'Bitvavo' ? find(['quote price']) : find(['price', 'kurs', 'preis', /kurs/, /preis/]),
      amount: broker === 'Bitvavo' ? find(['received / paid amount', 'received paid amount', /paid amount/]) : find(['amount', 'betrag', 'summe', 'total', /betrag/]),
      fee: find(['fee', 'fee amount', 'gebuehr', 'gebuehren', /fee/, /gebuehr/]),
      currency: broker === 'Bitvavo' ? find(['quote currency']) : find(['currency', 'waehrung']),
    };
    return { delim, header, data, mapping: m, broker };
  },

  classifyType(s) {
    const t = this.norm(s);
    if (/(distribution|dividend|dividende|ausschuettung|ertrag|interest|zinsen)/.test(t)) return 'div';
    if (/(sell|verkauf)/.test(t)) return 'sell';
    if (/(buy|kauf|savings plan|sparplan|purchase)/.test(t)) return 'buy';
    if (/(staking|reward|bonus|airdrop|einbuchung|split|spin)/.test(t)) return 'in';
    if (/(withdraw|auszahlung)/.test(t)) return 'out_asset';
    if (/(deposit|einzahlung)/.test(t)) return 'in_asset';
    return 'other';
  },

  buildTrades(an, m) {
    const out = []; let skipped = 0;
    const en = an.delim === ',';
    const num = v => parseNum(v, en);
    for (const r of an.data) {
      const date = parseDate(r[m.date]); if (!date) { skipped++; continue; }
      const id = (r[m.isin] || '').trim().toUpperCase(); if (!id || id === 'EUR') { skipped++; continue; }
      let type = m.type > -1 ? this.classifyType(r[m.type]) : 'buy';
      let shares = Math.abs(num(r[m.shares]));
      let price = Math.abs(num(r[m.price]));
      const amount = Math.abs(num(r[m.amount]));
      const fee = Math.abs(num(r[m.fee])) || 0;
      if (an.broker === 'Bitvavo') {
        if (type === 'in_asset') type = 'in'; // Krypto-Einzahlung: Bestand erhöhen, Einstand unbekannt
        if (type === 'out_asset') type = 'sell_nocash';
      } else {
        if (type === 'in_asset' || type === 'out_asset') { skipped++; continue; } // Geld-Ein/Auszahlungen
      }
      if (type === 'div') { if (!amount) { skipped++; continue; } out.push({ id: uid(), date, type: 'div', ident: id, name: (m.name > -1 ? r[m.name] : '') || id, shares: 0, price: 0, amount: Math.abs(amount), fee: 0, tax: 0, broker: an.broker, hash: hashStr([date, 'div', id, amount].join('|')) }); continue; }
      if (type === 'other' || !shares || isNaN(shares)) { skipped++; continue; }
      if ((!price || isNaN(price)) && amount && shares) price = amount / shares;
      if (isNaN(price)) price = 0;
      out.push({ id: uid(), date, type, ident: id, name: (m.name > -1 ? r[m.name] : '') || id, shares, price, fee, broker: an.broker, hash: hashStr([date, type, id, shares, price].join('|')) });
    }
    return { trades: out, skipped };
  },

  /* Trades zu Positionen verdichten (Durchschnittskosten-Methode) */
  applyTrades(trades, accountId, isCrypto) {
    const st = S();
    const existing = new Set(st.trades.filter(t => t.accountId === accountId).map(t => t.hash));
    const fresh = trades.filter(t => !existing.has(t.hash)).map(t => ({ ...t, accountId }));
    st.trades.push(...fresh);
    // Positionen dieses Kontos aus allen importierten Trades neu berechnen (manuelle bleiben)
    const all = st.trades.filter(t => t.accountId === accountId).sort((a, b) => a.date.localeCompare(b.date));
    const agg = {};
    for (const t of all) {
      const a = agg[t.ident] || (agg[t.ident] = { shares: 0, cost: 0, name: t.name });
      if (t.type === 'buy' || t.type === 'in') { a.cost += t.shares * t.price + (t.type === 'buy' ? t.fee : 0); a.shares += t.shares; }
      else if (t.type === 'sell' || t.type === 'sell_nocash') { const avg = a.shares ? a.cost / a.shares : 0; a.shares = Math.max(0, a.shares - t.shares); a.cost = avg * a.shares; }
      if (t.name && t.name !== t.ident) a.name = t.name;
    }
    let created = 0, updated = 0;
    for (const [ident, a] of Object.entries(agg)) {
      let p = st.positions.find(p => p.accountId === accountId && (p.isin === ident || p.ident === ident));
      const shares = Math.round(a.shares * 1e8) / 1e8;
      if (!p) {
        if (shares <= 0) continue;
        p = { id: uid(), accountId, name: a.name, isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(ident) ? ident : '', ident, symbol: isCrypto ? ident + '-EUR' : '', shares: 0, buyPrice: 0, lastPrice: null, fromImport: true };
        st.positions.push(p); created++;
      } else updated++;
      p.shares = shares; p.buyPrice = shares ? a.cost / shares : 0;
    }
    st.positions = st.positions.filter(p => !(p.fromImport && p.shares <= 0));
    Store.save();
    return { added: fresh.length, dupes: trades.length - fresh.length, created, updated };
  },
};
