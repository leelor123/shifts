/* ============================================================
 * mascot.js — "שעתי", the app's little coin character. A smiling
 * gold coin with a clock-hand sprout on its head. It bobs, blinks
 * and changes its face (happy, wave, wow, love, party, think, cool,
 * sleepy) to react to what the user does: in the setup questions,
 * on empty screens, in celebrations and in the help centre.
 * SVG drawings in HTML layers + CSS (styles-v3.css); motion stops with reduced motion.
 * mascot-voice.js gives it a voice (it reads the setup questions aloud, its mouth moving with the
 * words) and small reactions tied to what the user does (a nod, a hop, a head shake...).
 * ============================================================ */
(function (root) {
  'use strict';
  const App = root.App;

  const EYES = {
    open: '<ellipse cx="46" cy="60" rx="5.2" ry="6.6" class="m-eye"/><ellipse cx="74" cy="60" rx="5.2" ry="6.6" class="m-eye"/><circle cx="47.8" cy="57.6" r="1.8" fill="#fff"/><circle cx="75.8" cy="57.6" r="1.8" fill="#fff"/>',
    happy: '<path d="M40 61 q6 -8 12 0" class="m-line"/><path d="M68 61 q6 -8 12 0" class="m-line"/>',
    wink: '<ellipse cx="46" cy="60" rx="5.2" ry="6.6" class="m-eye"/><circle cx="47.8" cy="57.6" r="1.8" fill="#fff"/><path d="M68 61 q6 -7 12 0" class="m-line"/>',
    love: '<path d="M46 66 l-6.5 -6.5 a4 4 0 0 1 6.5 -5 a4 4 0 0 1 6.5 5 z" fill="#ff4f7b"/><path d="M74 66 l-6.5 -6.5 a4 4 0 0 1 6.5 -5 a4 4 0 0 1 6.5 5 z" fill="#ff4f7b"/>',
    up: '<ellipse cx="48" cy="57" rx="5" ry="6.4" class="m-eye"/><ellipse cx="76" cy="57" rx="5" ry="6.4" class="m-eye"/><circle cx="50" cy="54" r="1.8" fill="#fff"/><circle cx="78" cy="54" r="1.8" fill="#fff"/>',
    cool: '<path d="M34 55 h52 v5 c0 8 -6 11 -12 11 s-10 -4 -10 -10 h-4 c0 6 -4 10 -10 10 s-12 -3 -12 -11 z" fill="#1d1d2b"/><path d="M40 58 l6 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>',
    sleepy: '<path d="M40 61 q6 4 12 0" class="m-line"/><path d="M68 61 q6 4 12 0" class="m-line"/>',
    // heavy lids: the lower half of each eye under a flat lid (late at night)
    drowsy: '<path d="M40.8 59.5 a5.2 5.4 0 0 0 10.4 0 z" class="m-eye"/><path d="M68.8 59.5 a5.2 5.4 0 0 0 10.4 0 z" class="m-eye"/><path d="M39.5 59.5 h13" class="m-line"/><path d="M67.5 59.5 h13" class="m-line"/>',
  };
  const MOUTH = {
    smile: '<path d="M50 73 q10 9 20 0" class="m-line"/>',
    grin: '<path d="M47 71 q13 17 26 0 z" fill="#7a2d12"/><path d="M53 79 q7 5 14 0 q-7 -4 -14 0" fill="#ff7a8a"/>',
    o: '<ellipse cx="60" cy="77" rx="5" ry="6.2" fill="#7a2d12"/>',
    flat: '<path d="M53 76 h13" class="m-line"/>',
    small: '<path d="M54 74 q6 5 12 0" class="m-line"/>',
  };
  // the mouth while it speaks, from closed to wide open (mascot-voice.js picks one by data-mouth)
  const TALK = '<g class="m-talk">'
    + '<path class="t0" d="M53 75.5 q7 2.4 14 0" stroke="#2a1b0f" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
    + '<ellipse class="t1" cx="60" cy="76" rx="5" ry="2.8" fill="#7a2d12"/>'
    + '<ellipse class="t2" cx="60" cy="77" rx="4.6" ry="5.6" fill="#7a2d12"/>'
    + '<g class="t3"><path d="M49 72 q11 15 22 0 q-11 2.5 -22 0 z" fill="#7a2d12"/><path d="M54.5 80 q5.5 3.6 11 0 q-5.5 -3 -11 0" fill="#ff7a8a"/></g></g>';
  // calm faces turn drowsy late at night (23:00 to 06:00); a party or a surprise stays awake
  const DROWSY = new Set(['happy', 'think', 'wave', 'wink']);
  const night = () => !!(root.Moments && root.Moments.quietHour(Date.now())); // the app's one night rule (core/moments.js)
  const MOODS = {
    happy: ['open', 'smile'], wave: ['happy', 'grin'], wow: ['open', 'o'], love: ['love', 'grin'], party: ['happy', 'grin'],
    think: ['up', 'flat'], cool: ['cool', 'smile'], wink: ['wink', 'grin'], sleepy: ['sleepy', 'small'],
  };

  // Chrome never runs a motion of an SVG element on the compositor, so a busy phone froze the coin's bob, blink and
  // wave. Every part that moves is an HTML layer around its own drawing; all drawings share one viewBox and fill the
  // coin's box, so they line up exactly as one drawing did. The CSS moves the layers (styles-v3.css, mascot).
  const draw = (inner, cls) => `<svg viewBox="0 0 120 124"${cls ? ` class="${cls}"` : ''}>${inner}</svg>`;
  const part = (cls, inner) => `<span class="m-l ${cls}">${draw(inner)}</span>`;

  /** The mascot as an HTML string. mood: one of MOODS; opts: { size (px), cls } */
  App.mascot = function (mood, opts) {
    opts = opts || {};
    let [eyes, mouth] = MOODS[mood] || MOODS.happy;
    const late = DROWSY.has(mood || 'happy') && night();
    if (late) { eyes = 'drowsy'; mouth = 'small'; }
    const hat = mood === 'party'
      ? '<g class="m-hat"><path d="M48 24 l12 -22 l12 22 z" fill="#8b6cff"/><path d="M52 17 l16 0 M55 11 l10 0" stroke="#ffd23f" stroke-width="2.4"/><circle cx="60" cy="2" r="3.4" fill="#ff5c8a"/></g>' : '';
    const zz = mood === 'sleepy' ? part('m-z', '<text x="88" y="30" class="m-zt">z</text>') + part('m-z m-z2', '<text x="98" y="18" class="m-zt">z</text>') : '';
    return `<span class="mascot m-${mood || 'happy'}${late ? ' m-night' : ''} ${opts.cls || ''}" style="--sz:${opts.size || 96}px" aria-hidden="true">`
      + part('m-shadow', '<ellipse class="m-shd" cx="60" cy="116" rx="30" ry="5"/>')
      + '<span class="m-l m-talkb"><span class="m-l m-act"><span class="m-l m-body">'
      + part('m-arm-l', '<path class="m-arm" d="M24 70 q-12 -2 -14 -14"/>')
      + part('m-arm-r', '<path class="m-arm" d="M96 70 q12 -2 14 -14"/>')
      + part('m-sprout', '<path d="M60 24 v-9" stroke="#1f9d52" stroke-width="4" stroke-linecap="round"/><path d="M60 16 q9 -9 16 -3 q-8 8 -16 3" fill="#2ee59d"/>')
      + draw(hat + '<circle cx="60" cy="64" r="40" class="m-coin"/><circle cx="60" cy="64" r="32.5" class="m-rim"/><ellipse cx="42" cy="42" rx="11" ry="6" transform="rotate(-35 42 42)" class="m-shine"/>')
      + `<span class="m-l m-eyes">${part('m-look', EYES[eyes])}</span>`
      + draw(`<circle cx="37" cy="72" r="5.4" class="m-cheek"/><circle cx="83" cy="72" r="5.4" class="m-cheek"/><g class="m-mouth">${MOUTH[mouth]}</g>${TALK}`, 'm-face')
      + zz + '</span></span></span></span>';
  };
  /** The mascot with a speech bubble next to it. */
  App.mascotSays = (mood, html, opts) => `<div class="m-say ${(opts && opts.cls) || ''}">${App.mascot(mood, opts)}<div class="bubble">${html}</div></div>`;
})(typeof window !== 'undefined' ? window : globalThis);
