'use strict';
/* Hilfsfunktionen */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const NUM = (d = 2) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
/* Diskret-Modus: Beträge werden durch Punkte ersetzt, Anteile in % bleiben sichtbar */
const PRIV = () => !!(typeof Store !== 'undefined' && Store.state && Store.state.settings.privacy);
const HIDDEN = '•••• €';
function fmtEUR(v, round = false) { return PRIV() ? HIDDEN : (round ? EUR0 : EUR).format(Number(v) || 0); }
function fmtEURpub(v) { return EUR.format(Number(v) || 0); } // öffentliche Kurse – nie versteckt
function fmtSigned(v) { if (PRIV()) return HIDDEN; const s = fmtEUR(v); return v > 0 ? '+' + s : s; }
/* Betrag oder (im Diskret-Modus) Anteil am Ganzen */
function fmtShare(v, total) { if (!PRIV()) return fmtEUR(v); if (v < 0) return 'im Minus'; return total > 0 ? fmtNum(v / total * 100, 1) + ' %' : '–'; }
function fmtPct(v, d = 1) { if (!isFinite(v)) return '–'; return (v > 0 ? '+' : '') + NUM(d).format(v) + ' %'; }
function fmtNum(v, d = 2) { return NUM(d).format(Number(v) || 0); }
function clsAmt(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_S = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function todayISO() { const d = new Date(); return isoDate(d); }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
function fmtDayHead(iso) {
  const d = new Date(iso + 'T12:00:00');
  const t = todayISO(); const y = isoDate(new Date(Date.now() - 864e5));
  if (iso === t) return 'Heute'; if (iso === y) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key, short = false) { const [y, m] = key.split('-'); return (short ? MONTHS_S : MONTHS)[+m - 1] + (short ? ' ' + y.slice(2) : ' ' + y); }
function addMonths(key, n) { let [y, m] = key.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }

/* Zahl aus deutschem oder englischem Format lesen: "1.234,56" "-12,5" "1,234.56" "12.50 €" */
function parseNum(s, en = false) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[€$\s ]|EUR|USD/gi, '');
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (/S$/i.test(t) && /\d/.test(t)) { neg = true; t = t.slice(0, -1); } // "12,00 S" Soll
  if (/H$/i.test(t) && /\d/.test(t)) { t = t.slice(0, -1); }
  t = t.replace(/^\+/, '');
  if (en) { const v = parseFloat(t.replace(/,/g, '')); return isNaN(v) ? NaN : (neg ? -Math.abs(v) : v); }
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    if (lc > ld) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  } else if (lc > -1) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (ld > -1) {
    // nur Punkte: "1.234" (Tausender) vs "12.50" (Dezimal)
    const parts = t.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && /^-?[1-9]\d{0,2}$/.test(parts[0]))) t = t.replace(/\./g, '');
  }
  const v = parseFloat(t);
  if (isNaN(v)) return NaN;
  return neg ? -Math.abs(v) : v;
}

/* Datum lesen: 31.12.2025, 31.12.25, 2025-12-31, 12/31/2025, 2025-12-31T10:00 */
function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) { let y = m[3]; if (y.length === 2) y = (+y > 70 ? '19' : '20') + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/* Kurzer, stabiler Hash (FNV-1a 53 bit) für Duplikaterkennung */
function hashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* Modal-Dialog. content: HTML-String. Gibt das Modal-Element zurück; close() schließt. */
function openModal(title, content, { wide = false, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Schließen">✕</button></div>
    <div class="modal-body">${content}</div></div>`;
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  $('#modal-root').appendChild(bg);
  const m = bg.querySelector('.modal'); m.close = close;
  const first = m.querySelector('input:not([type=hidden]),select,textarea'); if (first && window.innerWidth > 700) first.focus();
  return m;
}
function closeAllModals() { $('#modal-root').innerHTML = ''; }

function confirmDialog(text, { ok = 'OK', danger = false } = {}) {
  return new Promise(res => {
    const m = openModal('Bitte bestätigen', `<p>${esc(text)}</p><div class="modal-actions"><button class="btn" data-no>Abbrechen</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`, { onClose: () => res(false) });
    m.querySelector('[data-no]').onclick = () => { m.close(); };
    m.querySelector('[data-yes]').onclick = () => { res(true); m.parentElement.remove(); };
  });
}

function promptDialog(title, label, { type = 'text', value = '', ok = 'OK' } = {}) {
  return new Promise(res => {
    const m = openModal(title, `<form><label>${esc(label)}</label><input name="v" type="${type}" value="${esc(value)}" required><div class="modal-actions"><button type="button" class="btn" data-close>Abbrechen</button><button class="btn primary">${esc(ok)}</button></div></form>`, { onClose: () => res(null) });
    const f = m.querySelector('form');
    f.onsubmit = e => { e.preventDefault(); const v = f.v.value; m.parentElement.remove(); res(v); };
  });
}

function downloadFile(name, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function pickFile(accept = '', multiple = false) {
  return new Promise(res => {
    const inp = $('#file-input'); inp.value = ''; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => res(Array.from(inp.files || []));
    inp.click();
  });
}

/* Datei als Text lesen, mit Erkennung UTF-8 vs. Windows-1252 (viele Bank-CSVs) */
async function readFileText(file) {
  const buf = await file.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
  return txt.replace(/^﻿/, '');
}

function formData(form) { const o = {}; new FormData(form).forEach((v, k) => o[k] = v); return o; }

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => toast('In Zwischenablage kopiert'), () => toast('Kopieren nicht möglich'));
  const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('In Zwischenablage kopiert'); } catch { toast('Kopieren nicht möglich'); }
  ta.remove();
}
