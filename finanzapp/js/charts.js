'use strict';
/* Schlanke SVG-Diagramme ohne externe Bibliotheken (funktioniert offline) */
const Charts = {
  niceTicks(min, max, n = 4) {
    if (min === max) { max = min + 1; }
    const span = max - min; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= step0) || step0;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 100) / 100);
    return t;
  },
  short(v) { if (PRIV()) return ''; const a = Math.abs(v); if (a >= 1e6) return fmtNum(v / 1e6, 1) + ' Mio'; if (a >= 1e4) return fmtNum(v / 1e3, 0) + ' T'; if (a >= 1e3) return fmtNum(v / 1e3, 1) + ' T'; return fmtNum(v, 0); },

  /* Linie mit Fläche. pts: [{label, y}] */
  line(pts, { h = 200, color = 'var(--accent)' } = {}) {
    if (pts.length < 2) return `<div class="empty small">Noch nicht genug Verlaufsdaten – der Verlauf füllt sich, sobald du die App an mehreren Tagen öffnest.</div>`;
    const W = 640, H = h, L = 52, R = 10, T = 10, B = 24;
    const ys = pts.map(p => p.y); const ticks = this.niceTicks(Math.min(...ys), Math.max(...ys));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = i => L + (W - L - R) * i / (pts.length - 1); const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
    const path = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.y).toFixed(1)).join('');
    const area = path + `L${X(pts.length - 1)},${H - B}L${L},${H - B}Z`;
    const step = Math.max(1, Math.ceil(pts.length / 6));
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(t => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${this.short(t)}</text>`).join('')}
      <path d="${area}" fill="url(#${id})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      ${pts.map((p, i) => (i % step === 0 || i === pts.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>` : '').join('')}
    </svg>`;
  },

  /* Gruppierte Balken. groups: [{label, values:[v1,v2]}], colors: [c1,c2] */
  bars(groups, colors, { h = 220 } = {}) {
    if (!groups.length) return '<div class="empty small">Keine Daten</div>';
    const W = 640, H = h, L = 52, R = 10, T = 10, B = 24;
    const all = groups.flatMap(g => g.values); const ticks = this.niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    const y0 = ticks[0], y1 = ticks[ticks.length - 1]; const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
    const gw = (W - L - R) / groups.length; const n = groups[0].values.length; const bw = Math.min(22, gw * 0.75 / n);
    let out = ticks.map(t => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${this.short(t)}</text>`).join('');
    groups.forEach((g, i) => {
      const cx = L + gw * i + gw / 2; const x0 = cx - bw * n / 2;
      g.values.forEach((v, j) => { const ya = Y(Math.max(v, 0)), yb = Y(Math.min(v, 0)); out += `<rect x="${x0 + j * bw + 1}" y="${ya}" width="${bw - 2}" height="${Math.max(1, yb - ya)}" rx="3" fill="${colors[j]}"><title>${esc(g.label)}: ${fmtEUR(v)}</title></rect>`; });
      out += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(g.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:auto;max-height:${H}px">${out}</svg>`;
  },

  /* Donut. segs: [{label, value, color}] */
  donut(segs, { size = 160, center = '' } = {}) {
    const total = segs.reduce((s, x) => s + x.value, 0);
    if (!total) return '<div class="empty small">Keine Ausgaben in diesem Zeitraum</div>';
    const r = 60, c = 2 * Math.PI * r; let off = 0;
    const arcs = segs.map(s => { const len = c * s.value / total; const a = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${s.color}" stroke-width="26" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(s.label)}: ${fmtEUR(s.value)}</title></circle>`; off += len; return a; }).join('');
    const legend = segs.map(s => `<div class="legend-row"><span><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span><span class="num">${PRIV() ? '' : fmtEUR(s.value)} <span class="${PRIV() ? '' : 'muted tiny'}">${fmtNum(s.value / total * 100, 0)} %</span></span></div>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 160 160" width="${size}" height="${size}">${arcs}<text x="80" y="78" text-anchor="middle" style="font-size:12px;fill:var(--muted)">gesamt</text><text x="80" y="96" text-anchor="middle" style="font-size:15px;font-weight:800;fill:var(--text)">${esc(PRIV() ? '100 %' : (center || fmtEUR(total, true)))}</text></svg><div class="legend">${legend}</div></div>`;
  },

  legend(items) { return `<div class="legend">${items.map(([l, c]) => `<span><span class="dot" style="background:${c}"></span>${esc(l)}</span>`).join('')}</div>`; },
};
