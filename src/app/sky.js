/* ============================================================
 * sky.js — the living scene at the top of the opening screens: the sky of the hour (its colours follow the real
 * sunrise and sunset of the user's city), the sun or the moon in its phase, a few stars, the season (cranes
 * crossing in autumn and spring, a leaf or two in autumn), the weather (clouds, rain, a storm, fog, snow, heat) and
 * the place, as one or two quiet silhouettes: sea and towers, hills, desert, the Kinneret, Eilat's mountains, the
 * Carmel. Minimal on purpose (the user, 2026-11-02: less detail, more quality).
 *
 *  - Everything that moves is a transform or opacity, so it plays on the compositor while the app starts up.
 *  - Two drawings of the same scene (the opening show and the welcome screen under it) move in step: each moving
 *    part's delay is counted from the clock, not from when it was drawn, so the hand-over between them is unseen.
 *  - The opening runs before the database is open, so what it needs (the city, the first name, which screen comes
 *    first, the last weather) is kept in a small copy in localStorage (Sky.prefs / Sky.remember).
 *  - The weather is asked of Open-Meteo for the city's coordinates only (no name, no account, no location
 *    permission), at most once an hour, and used on the next open (the scene never changes while it is seen).
 * ============================================================ */
(function (root) {
  'use strict';
  // the drawing's height and horizon, and its width: 390 on a phone; a wide screen (the website) draws a wider scene
  // of the same height (o.width), so nothing is stretched
  const W0 = 390, H0 = 330;
  let W = W0, H = H0, HZ = H0 - 68;
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'shaati.sky';
  const WX_URL = 'https://api.open-meteo.com/v1/forecast';
  const WX_MAX_AGE = 60 * 60000;
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  // the sky of each part of the day: top, middle, horizon, and the ink the land is drawn in
  const PHASES = {
    night: { sky: ['#050d26', '#0b1f4d', '#1b3470'], ink: '#030916', lights: 1, stars: 1 },
    dawn: { sky: ['#1d2f6e', '#5d4a8a', '#f2a477'], ink: '#1a1638', lights: .5, stars: .3 },
    morning: { sky: ['#1b58ad', '#336fbd', '#cfe6f7'], ink: '#1d3d6b', lights: 0, stars: 0 },
    day: { sky: ['#124c9a', '#2c69b8', '#a6d2f4'], ink: '#173866', lights: 0, stars: 0 },
    golden: { sky: ['#243f86', '#8a5470', '#ffc27a'], ink: '#2a2346', lights: .2, stars: 0 },
    dusk: { sky: ['#14214f', '#5a3b78', '#e07a5f'], ink: '#120f2c', lights: .8, stars: .5 },
  };
  const GREY = { cloudy: .45, rain: .6, storm: .72, fog: .5, snow: .4 }; // a grey day dulls the sky
  // i18n-keep-start the city names are keys (the settings keep them in Hebrew), never shown from here
  const TLV = { name: 'תל אביב-יפו', lat: 32.0809, lon: 34.7806 };
  // i18n-keep-end

  /** The part of the day at `now` in a city ({lat, lon}), from its real sunrise and sunset; and the season. */
  function state(now, place) {
    const HC = root.HebCal, d = new Date(now);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let rise = new Date(d).setHours(6, 15, 0, 0), set = new Date(d).setHours(17, 0, 0, 0);
    try {
      if (HC && place && place.lat) { rise = HC.sunrise(key, place.lat, place.lon); set = HC.sunset(key, place.lat, place.lon); }
      else {
        // without it (the website): Israel's sunrise and sunset by the day of the year, on the local clock (about 5:35 and
        // 19:48 in late June, 6:38 and 16:38 in late December), close enough for a sky
        const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000), c = Math.cos((2 * Math.PI * (doy - 172)) / 365.25);
        const at = (h) => new Date(d).setHours(0, 0, 0, 0) + h * 3600000;
        rise = at(6.105 - .525 * c); set = at(18.21 + 1.58 * c);
      }
    } catch (e) { /* the usual hours */ }
    const m = 60000, t = +d;
    const phase = t < rise - 50 * m ? 'night' : t < rise + 35 * m ? 'dawn' : t < rise + 180 * m ? 'morning'
      : t < set - 80 * m ? 'day' : t < set - 5 * m ? 'golden' : t < set + 55 * m ? 'dusk' : 'night';
    const sunT = (t - rise) / (set - rise);
    const nightLen = 24 * 60 * m - (set - rise);
    const moonT = t > set ? (t - set) / nightLen : (t + 24 * 60 * m - set) / nightLen;
    const month = d.getMonth() + 1;
    const season = month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 9 ? 'summer' : 'autumn';
    // the moon's age in days (0 new, 14.8 full), from a known new moon
    const moonAge = (((t - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588 + 29.530588) % 29.530588;
    return { phase, sunT, moonT, season, month, moonAge };
  }

  /** The greeting for the hour. */
  function greeting(now) {
    const h = new Date(now || Date.now()).getHours();
    return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  }

  // which landscape a city gets (other places: by the sea west of the coast road, otherwise a town)
  // i18n-keep-start the city names are keys, as above
  const KINDS = {
    sea: ['תל אביב-יפו', 'בת ים', 'הרצליה', 'נתניה', 'אשדוד', 'אשקלון', 'חדרה', 'עכו', 'נהריה'],
    carmel: ['חיפה', 'קריית אתא', 'קריית מוצקין', 'זכרון יעקב', 'יקנעם'],
    hills: ['ירושלים', 'מעלה אדומים', 'בית שמש', 'צפת', 'כרמיאל', 'נצרת', 'אריאל', 'מודיעין', 'מגדל העמק'],
    desert: ['באר שבע', 'דימונה', 'ערד', 'אופקים'],
    eilat: ['אילת'], lake: ['טבריה'],
  };
  // i18n-keep-end
  function placeKind(name, lon) {
    for (const k in KINDS) if (KINDS[k].includes(name)) return k;
    return lon && lon < 34.82 ? 'sea' : 'town';
  }

  // ---- drawing ----
  const el = (tag, attrs, kids) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (kids || []).forEach((c) => e.appendChild(c)); return e; };
  function ridge(r, base, amp, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([-20 + (i * (W + 40)) / n, base - amp * (0.35 + 0.65 * r())]);
    let d = `M-20 ${H + 10} L${pts[0][0]} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; d += ` Q${(x0 + (x1 - x0) / 2).toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)} T${x1.toFixed(1)} ${y1.toFixed(1)}`; }
    return d + ` L${W + 20} ${H + 10} Z`;
  }
  /** a row of buildings as one stepped outline, with a few lit windows at night */
  function skyline(g, r, o) {
    const { x0, x1, base, hMin, hMax, fill, lights, towers } = o;
    let x = x0, d = `M${x0.toFixed(1)} ${H + 10} L${x0.toFixed(1)} ${base}`;
    const lit = [];
    while (x < x1) {
      const w = 10 + r() * 14;
      let h = hMin + r() * (hMax - hMin);
      if (towers && r() < towers) h *= 1.6 + r() * .5;
      const top = base - h;
      d += ` L${x.toFixed(1)} ${top.toFixed(1)} L${(x + w).toFixed(1)} ${top.toFixed(1)}`;
      if (lights && r() < .45 * lights) lit.push([x + 3 + r() * (w - 6), top + 4 + r() * Math.max(1, h - 8)]);
      x += w;
    }
    d += ` L${x.toFixed(1)} ${base} L${x.toFixed(1)} ${H + 10} Z`;
    g.appendChild(el('path', { d, fill }));
    if (lit.length) { const win = el('g', { class: 'sk-win' }); lit.slice(0, 9).forEach(([wx, wy]) => win.appendChild(el('rect', { x: wx.toFixed(1), y: wy.toFixed(1), width: 2, height: 2.4, rx: .5 }))); g.appendChild(win); }
  }
  function cloud(r, y, s, fill, op) {
    const c = el('g', { fill, opacity: op });
    for (let i = 0; i < 3; i++) c.appendChild(el('ellipse', { cx: ((i * 14 - 21) * s).toFixed(1), cy: (-(Math.sin((i / 2) * Math.PI) * 9 + r() * 3) * s).toFixed(1), rx: ((13 + r() * 8) * s).toFixed(1), ry: ((10 + r() * 6) * s).toFixed(1) }));
    c.appendChild(el('rect', { x: (-29 * s).toFixed(1), y: (-4 * s).toFixed(1), width: (46 * s).toFixed(1), height: (10 * s).toFixed(1), rx: (5 * s).toFixed(1) }));
    return el('g', { transform: `translate(0 ${y.toFixed(1)})` }, [c]);
  }
  let uid = 0;

  /** Draws the scene into an <svg>. o: { now, place: {name, lat, lon}, weather: 'clear'|'partly'|'cloudy'|'rain'|'storm'|'fog'|'snow'|'hot' } */
  function render(svg, o) {
    o = o || {};
    const now = o.now || Date.now();
    const place = o.place && o.place.lat ? o.place : TLV;
    W = Math.max(W0, Math.round(o.width || W0));
    H = Math.max(H0, Math.round(o.height || H0)); HZ = H - 68;
    const X = (v) => (v * W) / W0, more = (n) => Math.round((n * W) / W0);
    const st = state(now, place);
    const phase = o.phase || st.phase, season = o.season || st.season, weather = o.weather || 'clear';
    const P = PHASES[phase], grey = GREY[weather] || 0, night = phase === 'night' || phase === 'dusk';
    // grey weather: a slate grey, dark enough for the white words on it
    const sky = P.sky.map((c, i) => mix(c, night ? '#1c2233' : i === 2 ? '#a9b4c2' : '#55647a', grey)), ink = P.ink;
    const r = rng(String(place.name || 'x').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
    const kind = placeKind(place.name, place.lon);
    const id = 'sk' + (++uid) + '-';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    // every moving part counts its delay from the clock (see the top of this file)
    svg.style.setProperty('--sk0', (-(now % 86400000) / 1000).toFixed(3) + 's');
    svg.style.setProperty('--skw', String(W));
    svg.style.setProperty('--skh', String(H));
    Object.assign(svg.dataset, { phase, weather, kind, season });
    const defs = el('defs');
    defs.appendChild(el('linearGradient', { id: id + 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, [el('stop', { offset: 0, 'stop-color': sky[0] }), el('stop', { offset: .58, 'stop-color': sky[1] }), el('stop', { offset: 1, 'stop-color': sky[2] })]));
    defs.appendChild(el('radialGradient', { id: id + 'glow' }, [el('stop', { offset: 0, 'stop-color': phase === 'night' ? '#cfe0ff' : '#fff4d6', 'stop-opacity': .55 }), el('stop', { offset: 1, 'stop-color': '#fff4d6', 'stop-opacity': 0 })]));
    defs.appendChild(el('linearGradient', { id: id + 'sea', x1: 0, y1: 0, x2: 0, y2: 1 }, [el('stop', { offset: 0, 'stop-color': mix(sky[2], ink, .35) }), el('stop', { offset: 1, 'stop-color': mix(sky[1], ink, .75) })]));
    svg.appendChild(defs);
    svg.appendChild(el('rect', { width: W, height: H, fill: `url(#${id}sky)` }));

    if (P.stars && grey < .5) {
      const g = el('g', { class: 'sk-stars', fill: '#fff' });
      for (let i = 0; i < more(22); i++) g.appendChild(el('circle', { cx: (r() * W).toFixed(1), cy: (r() * HZ * .72).toFixed(1), r: (.4 + r() * .9).toFixed(2), opacity: (P.stars * (.4 + r() * .6)).toFixed(2), style: `--d:${(r() * 6).toFixed(2)}s;--t:${(2.5 + r() * 4).toFixed(2)}s` }));
      svg.appendChild(g);
    }
    // the sun and the moon keep to the sides (the middle is the logo's and the greeting's): the right half before
    // noon (or midnight), the left half after it
    const arc = (t) => { t = Math.max(0, Math.min(1, t)); const d = Math.abs(t - .5) * 2, x = X(40) + (1 - d) * X(50); const y = HZ - 26 - (1 - Math.pow(d, 1.6)) * Math.max(186, H * .56);
      // a tall sky (a phone's whole screen on the website) keeps the sun and the moon up high, clear of the words
      return [t < .5 ? W - x : x, H > H0 ? Math.min(y, 40 + H * .2) : y]; };
    if (grey < .7) {
      if (night) {
        const [mx, my] = arc(Math.max(.12, Math.min(.88, st.moonT)));
        // how much of it is lit (0 new, 1 full); the lit part is drawn as it is (an edge and the shadow's line), so the
        // dark part is simply the sky behind it
        const k = (1 - Math.cos((2 * Math.PI * st.moonAge) / 29.530588)) / 2, R = 11;
        if (k > .04) {
          const g = el('g', { transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})` });
          g.appendChild(el('circle', { r: 34, fill: `url(#${id}glow)`, opacity: (.35 + .65 * k).toFixed(2) }));
          const rx = (R * Math.abs(2 * k - 1)).toFixed(2);
          // the lit edge on the right while it waxes, on the left while it wanes (as seen from Israel)
          const d = `M0 ${-R} A${R} ${R} 0 0 1 0 ${R} A${rx} ${R} 0 0 ${k < .5 ? 0 : 1} 0 ${-R} Z`;
          g.appendChild(el('path', { d, fill: '#f4f1e4', transform: st.moonAge < 14.77 ? '' : 'scale(-1 1)' }));
          svg.appendChild(g);
        }
      } else {
        const [sx, sy] = arc(st.sunT);
        const low = phase === 'golden' || phase === 'dawn';
        const g = el('g', { transform: `translate(${sx.toFixed(1)} ${sy.toFixed(1)})` });
        g.appendChild(el('circle', { class: 'sk-halo', r: weather === 'hot' || season === 'summer' ? 70 : 52, fill: `url(#${id}glow)` }));
        g.appendChild(el('circle', { r: low ? 15 : 12, fill: low ? '#ffd28a' : '#fff6dc' }));
        svg.appendChild(g);
      }
    }
    // clouds drift slowly to the left, above or below the greeting; more, and greyer, on a grey day
    const nClouds = { clear: season === 'summer' ? 0 : 1, hot: 0, partly: 2, cloudy: 3, rain: 3, storm: 3, fog: 2, snow: 3 }[weather];
    const cloudFill = grey ? mix(sky[1], phase === 'night' ? '#2a3350' : '#e8edf3', .55) : phase === 'night' ? '#20305e' : night || phase === 'golden' || phase === 'dawn' ? '#ffd9c2' : '#ffffff';
    for (let i = 0; i < (nClouds == null ? 1 : nClouds) * Math.max(1, Math.ceil((W / W0) * .6)); i++) {
      const lay = el('g', { class: 'sk-cloud', style: `--t:${(70 + r() * 70).toFixed(0)}s;--d:${(-r() * 120).toFixed(0)}s` });
      lay.appendChild(cloud(r, r() < .5 ? 6 + r() * 10 : HZ - 36 + r() * 14, .7 + r() * .7, cloudFill, grey ? .85 : .7));
      svg.appendChild(lay);
    }
    // cranes crossing Israel in autumn and spring (it is on their way), by day, in dry weather
    if ((season === 'autumn' || season === 'spring') && !night && !['rain', 'storm', 'snow'].includes(weather)) {
      const g = el('g', { fill: 'none', stroke: mix(ink, sky[1], .2), 'stroke-width': 1.3, 'stroke-linecap': 'round' });
      for (let i = 0; i < 5; i++) {
        const b = el('g', { transform: `translate(${Math.abs(i - 2) * 13} ${i * 5 + (i > 2 ? -(i - 2) * 10 : 0)})` });
        b.appendChild(el('path', { class: 'sk-wing', d: 'M-5 0 Q-2.5 -3 0 0 Q2.5 -3 5 0', style: `--d:${(i * .13).toFixed(2)}s` }));
        g.appendChild(b);
      }
      svg.appendChild(el('g', { class: 'sk-flock' }, [g]));
    }

    // ---- the land: one or two clean silhouettes ----
    const far = mix(sky[2], ink, .32), near = mix(sky[2], ink, .78);
    const land = el('g');
    const lights = P.lights * (grey ? 1.2 : 1);
    const sea = (y) => {
      land.appendChild(el('rect', { x: 0, y, width: W, height: H - y, fill: `url(#${id}sea)` }));
      const gl = el('g', { class: 'sk-glint', stroke: phase === 'night' ? '#cfe0ff' : '#fff6dc', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: .7 });
      for (let i = 0; i < more(5); i++) { const x = 20 + r() * (W - 60), yy = y + 8 + r() * 30, w = 8 + r() * 14; gl.appendChild(el('line', { x1: x.toFixed(1), y1: yy.toFixed(1), x2: (x + w).toFixed(1), y2: yy.toFixed(1), style: `--d:${(r() * 4).toFixed(2)}s` })); }
      land.appendChild(gl);
    };
    const sand = (c, t) => mix(c, '#c9925e', phase === 'night' ? t * .2 : t);
    if (kind === 'sea') {
      sea(HZ + 6);
      skyline(land, r, { x0: X(140), x1: W + 10, base: HZ + 7, hMin: 12, hMax: 30, towers: .3, fill: near, lights });
    } else if (kind === 'carmel') {
      sea(HZ + 6);
      land.appendChild(el('path', { d: `M${W * .2} ${H} C${W * .36} ${HZ + 4} ${W * .46} ${HZ - 34} ${W * .66} ${HZ - 40} S${W * .92} ${HZ - 46} ${W + 20} ${HZ - 44} L${W + 20} ${H} Z`, fill: mix(far, near, .62) }));
      skyline(land, r, { x0: W * .3, x1: W * .7, base: HZ + 7, hMin: 7, hMax: 18, towers: .2, fill: near, lights });
    } else if (kind === 'eilat') {
      land.appendChild(el('path', { d: ridge(rng(5), HZ - 2, 44, 6), fill: mix(far, '#b8603f', phase === 'night' ? .08 : .32) }));
      sea(HZ + 6);
      skyline(land, r, { x0: X(220), x1: W + 10, base: HZ + 7, hMin: 7, hMax: 18, fill: near, lights });
    } else if (kind === 'lake') {
      land.appendChild(el('path', { d: ridge(rng(9), HZ - 2, 38, 5), fill: far }));
      sea(HZ - 2);
      skyline(land, r, { x0: X(236), x1: W + 10, base: HZ - 1, hMin: 6, hMax: 15, fill: near, lights });
    } else if (kind === 'hills') {
      land.appendChild(el('path', { d: ridge(r, HZ - 26, 38, 5), fill: far }));
      land.appendChild(el('path', { d: ridge(r, HZ + 10, 20, 4), fill: near }));
      skyline(land, r, { x0: X(60), x1: X(320), base: HZ - 2, hMin: 5, hMax: 13, fill: near, lights });
    } else if (kind === 'desert') {
      land.appendChild(el('path', { d: ridge(r, HZ - 4, 14, 3), fill: sand(far, .3) }));
      skyline(land, r, { x0: X(70), x1: X(330), base: HZ + 10, hMin: 6, hMax: 16, fill: sand(near, .12), lights });
      land.appendChild(el('path', { d: ridge(r, HZ + 22, 6, 3), fill: sand(near, .12) }));
    } else {
      land.appendChild(el('path', { d: ridge(r, HZ - 10, 24, 4), fill: far }));
      skyline(land, r, { x0: 20, x1: W - 20, base: HZ + 10, hMin: 7, hMax: 22, towers: .15, fill: near, lights });
      land.appendChild(el('path', { d: ridge(r, HZ + 22, 6, 4), fill: near }));
    }
    svg.appendChild(land);

    // the weather in front
    if (weather === 'rain' || weather === 'storm') {
      const g = el('g', { class: 'sk-fall', stroke: phase === 'night' ? 'rgba(190,210,255,.24)' : 'rgba(255,255,255,.3)', 'stroke-width': 1, 'stroke-linecap': 'round', style: '--t:.75s' });
      // two screens of drops, one above the other: falling by one screen's height loops without a seam
      for (let k = 0; k < 2; k++) for (let i = 0; i < more(22); i++) { const x = r() * (W + 60), y = r() * H - k * H; g.appendChild(el('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: (x - 4).toFixed(1), y2: (y + 12).toFixed(1) })); }
      svg.appendChild(el('g', {}, [g]));
      if (weather === 'storm') svg.appendChild(el('rect', { class: 'sk-flash', width: W, height: H, fill: '#e8eeff' }));
    }
    if (weather === 'snow') {
      const g = el('g', { class: 'sk-fall', fill: '#fff', style: '--t:11s' });
      for (let k = 0; k < 2; k++) for (let i = 0; i < more(22); i++) g.appendChild(el('circle', { cx: (r() * W).toFixed(1), cy: (r() * H - k * H).toFixed(1), r: (.8 + r() * 1.4).toFixed(2), opacity: (.5 + r() * .5).toFixed(2) }));
      svg.appendChild(el('g', {}, [g]));
    }
    if (weather === 'fog') svg.appendChild(el('rect', { class: 'sk-fog', y: HZ - 70, width: W * 2, height: 110, fill: `url(#${id}sky)`, opacity: .65 }));
    if (season === 'autumn' && !night && !['rain', 'storm', 'snow'].includes(weather)) {
      const g = el('g');
      for (let i = 0; i < 3; i++) g.appendChild(el('ellipse', { class: 'sk-leaf', cx: (r() * W).toFixed(1), cy: -10, rx: 3, ry: 1.6, fill: ['#d9822b', '#c4562d', '#e0a43a'][i], style: `--d:${(-r() * 14).toFixed(1)}s;--t:${(10 + r() * 6).toFixed(1)}s;--x:${(-30 - r() * 40).toFixed(0)}px` }));
      svg.appendChild(g);
    }
    return { phase, season, weather, kind };
  }

  // Open-Meteo's weather codes (WMO) to the scene's weather
  function fromWmo(code, temp) {
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (code === 3) return 'cloudy';
    if (code === 1 || code === 2) return 'partly';
    return temp >= 32 ? 'hot' : 'clear';
  }

  /** What the opening needs before the database is open: { place: {name, lat, lon}, name, mode, wx: {w, at, city} } */
  function prefs() {
    try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch (e) { /* none */ }
    return {};
  }
  function remember(patch) {
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign(prefs(), patch))); } catch (e) { /* private mode: the scene keeps its defaults */ }
  }
  /** The weather to draw now: the last one heard for this city if it is recent enough, otherwise a clear sky. */
  function weatherNow(p) {
    p = p || prefs();
    const wx = p.wx, place = p.place || TLV;
    const ok = wx && wx.city === place.name && Date.now() - wx.at < 3 * WX_MAX_AGE && typeof wx.w === 'string' && /^[a-z]{3,7}$/.test(wx.w);
    return ok ? wx.w : 'clear';
  }
  /** Asks the weather for the city, for the next open (at most once an hour). */
  function refreshWeather() {
    const p = prefs(), place = p.place && p.place.lat ? p.place : TLV;
    if (p.wx && p.wx.city === place.name && Date.now() - p.wx.at < WX_MAX_AGE) return Promise.resolve(p.wx.w);
    if (typeof fetch !== 'function' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(null);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 6000);
    const url = `${WX_URL}?latitude=${(+place.lat).toFixed(2)}&longitude=${(+place.lon).toFixed(2)}&current=weather_code,temperature_2m`;
    return fetch(url, ctl ? { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' } : { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      clearTimeout(t);
      const c = j && j.current;
      if (!c || typeof c.weather_code !== 'number') return null;
      const w = fromWmo(c.weather_code, +c.temperature_2m);
      remember({ wx: { w, at: Date.now(), city: place.name } });
      return w;
    }).catch(() => { clearTimeout(t); return null; });
  }

  /** The first name, short (the greeting's title) */
  function firstName(n) { return typeof n === 'string' ? n.trim().split(/\s+/)[0].slice(0, 20) : ''; }
  /** "Monday, 2 November", in the page's language */
  function dateLine(now) {
    try { return new Intl.DateTimeFormat(document.documentElement.lang || 'he', { weekday: 'long', day: 'numeric', month: 'long' }).format(now || Date.now()); } catch (e) { return ''; }
  }

  root.Sky = { render, state, greeting, firstName, dateLine, placeKind, fromWmo, prefs, remember, weatherNow, refreshWeather, PHASES, TLV };
})(typeof window !== 'undefined' ? window : globalThis);
