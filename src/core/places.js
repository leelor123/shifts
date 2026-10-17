/* ============================================================
 * places.js — finding a place among every locality in Israel (the data is in places-data.js).
 *
 * Search forgives the way people type: spaces, hyphens, quotes and brackets do not count ("תל אביב",
 * "תל-אביב" and "תלאביב" are one), final letters equal the plain ones, and a double yod or vav equals a
 * single one ("קרית"/"קריית", "תקוה"/"תקווה", "הרצליה"/"הרצלייה"). The beginning of the name comes first,
 * then the beginning of any word in it ("רעות" finds מודיעין-מכבים-רעות), then anywhere in it; among
 * equals the towns first (the bigger first), then the rest in Hebrew order. Latin letters search the English names ("haifa"), and the usual
 * abbreviations work ("פ״ת", "ב״ש").
 * ============================================================ */
(function (root) {
  'use strict';
  const D = root.PlacesData || { DATA: '', ALIAS: {} };
  const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINAL[c])
    .replace(/[^א-תa-z0-9]/g, '')
    .replace(/יי/g, 'י').replace(/וו/g, 'ו');

  const ALL = D.DATA ? D.DATA.split('\n').map((line, i) => {
    const [name, lat, lon, pop, fact, pic, kind, candle, en] = line.split('|');
    return {
      i, name, lat: +lat, lon: +lon, pop: +pop || 0, fact: fact || '', pic: pic || '📍', kind: +kind || 0,
      candle: +candle || 18, en: en || '',
      key: norm(name), words: name.split(/[\s\-()]+/).filter(Boolean).map(norm), enKey: (en || '').replace(/[^a-z0-9]/g, ''),
    };
  }) : [];
  const byName = new Map(ALL.map((p) => [p.name, p]));
  const byKey = new Map();
  for (const p of ALL) if (!byKey.has(p.key)) byKey.set(p.key, p);
  // the abbreviations people type (normalized: no quotes)
  const ABBR = { 'תא': 'תל אביב-יפו', 'פת': 'פתח תקווה', 'ראשלצ': 'ראשון לציון', 'בש': 'באר שבע', 'קש': 'קריית שמונה', 'רג': 'רמת גן', 'כס': 'כפר סבא', 'קג': 'קריית גת', 'בב': 'בני ברק' };

  /** The place of a stored name (the old list's names too), or null. */
  function find(name) {
    if (!name) return null;
    return byName.get(name) || byName.get(D.ALIAS[name]) || byKey.get(norm(name)) || null;
  }
  /** The biggest places people live in. */
  function popular(n) {
    return ALL.filter((p) => !p.kind).sort((a, b) => b.pop - a.pop).slice(0, n || 10);
  }
  /** Places matching what was typed, best first: { list, total }. */
  function search(q, limit) {
    const k = norm(q);
    if (!k) return { list: [], total: 0 };
    const latin = /[a-z]/.test(k);
    const hits = [];
    for (const p of ALL) {
      let s = -1;
      if (latin) { if (p.enKey.startsWith(k)) s = 0; else if (p.enKey.includes(k)) s = 2; }
      else if (p.key.startsWith(k)) s = 0;
      else if (p.words.some((w) => w.startsWith(k))) s = 1;
      else if (p.key.includes(k)) s = 2;
      if (s >= 0) hits.push([s, p]);
    }
    // among equals, towns of 10,000 and more first (the bigger first), then the rest in Hebrew order
    const big = (p) => (p.pop >= 10000 ? p.pop : 0);
    hits.sort((a, b) => a[0] - b[0] || big(b[1]) - big(a[1]) || a[1].i - b[1].i);
    let list = hits.map((h) => h[1]);
    const ab = ABBR[k] && find(ABBR[k]);
    if (ab) list = [ab].concat(list.filter((p) => p !== ab));
    return { list: limit ? list.slice(0, limit) : list, total: list.length };
  }
  /** The nearest place people live in to a point: { place, km }, or null. */
  function nearest(lat, lon) {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    let best = null, bd = Infinity;
    for (const p of ALL) {
      if (p.kind) continue; // not a work zone or a tribe's area
      const dx = (p.lon - lon) * kx, dy = (p.lat - lat) * ky;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { place: best, km: Math.sqrt(bd) } : null;
  }
  const LETTERS = [...new Set(ALL.map((p) => p.name[0]))];

  root.Places = { ALL, LETTERS, find, popular, search, nearest, norm };
})(typeof window !== 'undefined' ? window : globalThis);
