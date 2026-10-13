/* ============================================================
 * charts.js — small dependency-free SVG charts.
 * Thin marks, rounded data ends, recessive grid, one axis,
 * tap/hover tooltip on every mark (data-tip).
 *
 * They come alive when they scroll into view: bars grow from the
 * baseline one after another, lines draw themselves over a soft
 * area, markers pop in. Tapping a mark keeps it bright and steps
 * the others back while the tooltip shows. All of it is CSS on
 * transforms (styles-v3.css), off with reduced motion, and never
 * replayed when the same screen redraws after a save.
 * ============================================================ */
(function (root) {
  'use strict';
  const { esc } = root.UI;
  const W = 360;
  const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }
  let uid = 0;
  /** Stagger: the whole chart finishes growing in about half a second, however many bars. */
  const delay = (i, n, total) => Math.round((i * (total || 480)) / Math.max(1, n));
  const short = (v) => (Math.abs(v) >= 1000 ? +(v / 1000).toFixed(1) + 'K' : String(Math.round(v)));
  /** Bar with rounded top corners only (4px), anchored to the baseline. */
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function grid(maxV, top, bottom, left, right, fmt) {
    let g = '<g class="grid">';
    for (let i = 0; i <= 4; i++) {
      const v = (maxV / 4) * i;
      const y = bottom - ((bottom - top) * i) / 4;
      g += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}"/>`;
      g += `<text x="${left - 4}" y="${y + 4}" text-anchor="end">${esc((fmt || short)(v))}</text>`;
    }
    return g + '</g>';
  }

  /** data: [{label, value, tip, color}] */
  function bars(data, opts) {
    opts = opts || {};
    const H = opts.height || 190, top = 10, bottom = H - 24, left = 34, right = W - 4;
    const maxV = niceMax(Math.max(0, ...data.map((d) => d.value)));
    const n = data.length || 1;
    const slot = (right - left) / n;
    const bw = Math.max(4, Math.min(28, slot - 6));
    let s = `<svg class="chart" data-anim viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">`;
    s += grid(maxV, top, bottom, left, right, opts.axisFmt);
    data.forEach((d, i) => {
      const h = ((bottom - top) * Math.max(0, d.value)) / maxV;
      const x = left + slot * i + (slot - bw) / 2;
      const col = d.color || opts.color || SERIES[0];
      s += `<path class="bar" data-i="${i}" style="--d:${delay(i, n)}ms" d="${barPath(x, bottom - h, bw, h, 4)}" fill="${col}" opacity="${d.dim ? 0.45 : 1}"/>`;
      s += `<rect class="hit" data-i="${i}" x="${left + slot * i}" y="${top}" width="${slot}" height="${bottom - top}" data-tip="${esc(d.tip || d.label + ': ' + d.value)}"/>`;
      if (n <= 14 || i % Math.ceil(n / 12) === 0) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    s += `<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    return s + '</svg>';
  }

  /** labels: [], series: [{name, color, values:[]}] — stacked, 2px surface gap between segments */
  function stacked(labels, series, opts) {
    opts = opts || {};
    const H = opts.height || 200, top = 10, bottom = H - 24, left = 34, right = W - 4;
    const totals = labels.map((_, i) => series.reduce((s, se) => s + (se.values[i] || 0), 0));
    const maxV = niceMax(Math.max(0, ...totals));
    const n = labels.length || 1;
    const slot = (right - left) / n;
    const bw = Math.max(4, Math.min(28, slot - 6));
    let s = `<svg class="chart" data-anim viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">`;
    s += grid(maxV, top, bottom, left, right, opts.axisFmt);
    labels.forEach((lab, i) => {
      const x = left + slot * i + (slot - bw) / 2;
      let y = bottom;
      const segs = series.filter((se) => (se.values[i] || 0) > 0);
      s += `<g class="bar" data-i="${i}" style="--d:${delay(i, n)}ms">`;
      segs.forEach((se, j) => {
        const h = ((bottom - top) * se.values[i]) / maxV;
        const isTop = j === segs.length - 1;
        const gap = j > 0 ? 2 : 0;
        if (isTop) s += `<path d="${barPath(x, y - h + gap, bw, Math.max(0, h - gap), 4)}" fill="${se.color}"/>`;
        else s += `<rect x="${x}" y="${y - h + gap}" width="${bw}" height="${Math.max(0, h - gap)}" fill="${se.color}"/>`;
        y -= h;
      });
      s += '</g>';
      const tip = lab + ' · ' + series.filter((se) => se.values[i]).map((se) => se.name + ' ' + (opts.fmt ? opts.fmt(se.values[i]) : se.values[i])).join(' · ');
      s += `<rect class="hit" data-i="${i}" x="${left + slot * i}" y="${top}" width="${slot}" height="${bottom - top}" data-tip="${esc(tip)}"/>`;
      if (n <= 14 || i % Math.ceil(n / 12) === 0) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
    });
    s += `<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    s += '</svg>';
    s += `<div class="chart-legend">${series.map((se) => `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join('')}</div>`;
    return s;
  }

  /** Single series line with markers. */
  function line(labels, values, opts) {
    opts = opts || {};
    const H = opts.height || 170, top = 12, bottom = H - 24, left = 34, right = W - 10;
    const vals = values.map((v) => (v == null ? null : v));
    const present = vals.filter((v) => v != null);
    const minV0 = present.length ? Math.min(...present) : 0;
    const maxV = niceMax(Math.max(1, ...present));
    const minV = opts.zero === false ? Math.max(0, Math.floor(minV0 * 0.8)) : 0;
    const n = labels.length;
    const xAt = (i) => left + (n <= 1 ? (right - left) / 2 : ((right - left) * i) / (n - 1));
    const yAt = (v) => bottom - ((bottom - top) * (v - minV)) / (maxV - minV || 1);
    let s = `<svg class="chart" data-anim viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || '')}">`;
    let g = '<g class="grid">';
    for (let i = 0; i <= 4; i++) {
      const v = minV + ((maxV - minV) / 4) * i;
      const y = yAt(v);
      g += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}"/><text x="${left - 4}" y="${y + 4}" text-anchor="end">${esc((opts.axisFmt || short)(v))}</text>`;
    }
    s += g + '</g>';
    const col = opts.color || SERIES[0];
    let d = '';
    const pts = [];
    vals.forEach((v, i) => { if (v == null) return; d += (d ? 'L' : 'M') + xAt(i) + ',' + yAt(v); pts.push(xAt(i)); });
    // a soft area under the line, fading down to the axis
    if (pts.length > 1) {
      const id = 'lg' + ++uid;
      s += `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>`;
      s += `<path class="area" d="${d}L${pts[pts.length - 1]},${bottom}L${pts[0]},${bottom}Z" fill="url(#${id})"/>`;
    }
    s += `<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    vals.forEach((v, i) => {
      if (v != null) s += `<circle class="dot" data-i="${i}" style="--d:${300 + delay(i, n, 700)}ms" cx="${xAt(i)}" cy="${yAt(v)}" r="4" fill="${col}" stroke="var(--surface-1)" stroke-width="2"/>`;
      const slot = (right - left) / Math.max(1, n - 1);
      s += `<rect class="hit" data-i="${i}" x="${xAt(i) - slot / 2}" y="${top}" width="${slot}" height="${bottom - top}" data-tip="${esc(labels[i] + ': ' + (v == null ? '—' : opts.fmt ? opts.fmt(v) : v))}"/>`;
      if (n <= 14 || i % Math.ceil(n / 12) === 0) s += `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    return s + '</svg>';
  }

  /** steps: [{label, value, type:'total'|'neg'}] — gross → deductions → net */
  function waterfall(steps, opts) {
    opts = opts || {};
    const H = opts.height || 220, top = 10, bottom = H - 34, left = 40, right = W - 4;
    const maxV = niceMax(Math.max(...steps.map((s) => Math.abs(s.value))));
    const n = steps.length;
    const slot = (right - left) / n;
    const bw = Math.min(34, slot - 8);
    const yAt = (v) => bottom - ((bottom - top) * v) / maxV;
    let s = `<svg class="chart" data-anim viewBox="0 0 ${W} ${H}" role="img" aria-label="מברוטו לנטו">`;
    s += grid(maxV, top, bottom, left, right, opts.axisFmt);
    let run = 0;
    steps.forEach((st, i) => {
      const x = left + slot * i + (slot - bw) / 2;
      let y0, y1, col;
      if (st.type === 'total') { y0 = 0; y1 = st.value; run = st.value; col = i === 0 ? '#2a78d6' : '#1baf7a'; }
      else { y1 = run; y0 = run + st.value; run = y0; col = '#e34948'; }
      const yt = yAt(Math.max(y0, y1)), yb = yAt(Math.min(y0, y1));
      const a = `data-i="${i}" style="--d:${i * 130}ms"`;
      s += st.type === 'total' ? `<path class="bar" ${a} d="${barPath(x, yt, bw, yb - yt, 4)}" fill="${col}"/>` : `<rect class="bar neg" ${a} x="${x}" y="${yt}" width="${bw}" height="${Math.max(1, yb - yt)}" rx="2" fill="${col}" opacity=".85"/>`;
      if (i < n - 1) {
        const yl = yAt(run);
        s += `<line x1="${x + bw}" x2="${x + slot}" y1="${yl}" y2="${yl}" stroke="var(--outline)" stroke-dasharray="3 3"/>`;
      }
      s += `<rect class="hit" data-i="${i}" x="${left + slot * i}" y="${top}" width="${slot}" height="${bottom - top}" data-tip="${esc(st.label + ': ' + (opts.fmt ? opts.fmt(st.value) : st.value))}"/>`;
      const words = st.label.split(' ');
      s += `<text x="${x + bw / 2}" y="${bottom + 14}" text-anchor="middle">${esc(words[0])}</text>`;
      if (words[1]) s += `<text x="${x + bw / 2}" y="${bottom + 26}" text-anchor="middle">${esc(words.slice(1).join(' '))}</text>`;
    });
    s += `<line class="axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    return s + '</svg>';
  }

  /** Horizontal bars (HTML) for role/category splits. rows: [{name, value, color, text}] */
  function hbars(rows, fmt) {
    const max = Math.max(1e-9, ...rows.map((r) => r.value));
    return rows.map((r, i) => `<div class="hbar" data-anim><span class="nm">${esc(r.name)}</span><span class="track"><i style="width:${(r.value / max) * 100}%;background:${r.color};--d:${i * 90}ms"></i></span><span class="vv">${esc(r.text || (fmt ? fmt(r.value) : r.value))}</span></div>`).join('');
  }

  /* ---------- tooltip (tap or hover) ---------- */
  let tipEl = null;
  function showTip(e, text) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    tipEl.textContent = text;
    tipEl.style.display = 'block';
    tipEl.classList.remove('pop'); void tipEl.offsetWidth; tipEl.classList.add('pop');
    const x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    tipEl.style.left = Math.max(70, Math.min(window.innerWidth - 70, x)) + 'px';
    tipEl.style.top = y + 'px';
  }
  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
    document.querySelectorAll('.chart.focus').forEach((c) => { c.classList.remove('focus'); c.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); });
  }
  /** Tapped mark: it (and its marker) stays bright, the rest step back. */
  function focusMark(t) {
    const svg = t.closest('svg.chart');
    if (!svg || t.dataset.i == null) return;
    document.querySelectorAll('.chart.focus').forEach((c) => { if (c !== svg) c.classList.remove('focus'); });
    svg.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
    svg.querySelectorAll(`[data-i="${t.dataset.i}"]:not(.hit)`).forEach((x) => x.classList.add('on'));
    svg.classList.add('focus');
  }
  document.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && e.pointerType === 'mouse') showTip(e, t.dataset.tip); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) { showTip(e, t.dataset.tip); focusMark(t); clearTimeout(showTip._t); showTip._t = setTimeout(hideTip, 2600); } else hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  /* ---------- start the entrance animation when a chart scrolls into view ---------- */
  const io = 'IntersectionObserver' in root ? new IntersectionObserver((list) => {
    for (const en of list) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.2 }) : null;
  let scanQueued = false;
  function scan() {
    scanQueued = false;
    document.querySelectorAll('[data-anim]:not(.in):not(.watched)').forEach((el) => {
      el.classList.add('watched');
      if (io) io.observe(el); else el.classList.add('in');
    });
  }
  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver((recs) => {
      if (scanQueued) return;
      for (const r of recs) if (r.addedNodes.length) { scanQueued = true; requestAnimationFrame(scan); return; }
    }).observe(document.body, { childList: true, subtree: true });
  }

  root.Charts = { bars, stacked, line, waterfall, hbars, SERIES };
})(typeof window !== 'undefined' ? window : globalThis);
