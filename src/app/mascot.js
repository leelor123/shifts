/* ============================================================
 * mascot.js — "שעתי", the app's little coin character. A smiling
 * gold coin with a clock-hand sprout on its head. It bobs, blinks
 * and changes its face (happy, wave, wow, love, party, think, cool,
 * sleepy) to react to what the user does: in the setup questions,
 * on empty screens, in celebrations and in the help centre.
 * Pure SVG + CSS (styles-v3.css); motion stops with reduced motion.
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
  };
  const MOUTH = {
    smile: '<path d="M50 73 q10 9 20 0" class="m-line"/>',
    grin: '<path d="M47 71 q13 17 26 0 z" fill="#7a2d12"/><path d="M53 79 q7 5 14 0 q-7 -4 -14 0" fill="#ff7a8a"/>',
    o: '<ellipse cx="60" cy="77" rx="5" ry="6.2" fill="#7a2d12"/>',
    flat: '<path d="M53 76 h13" class="m-line"/>',
    small: '<path d="M54 74 q6 5 12 0" class="m-line"/>',
  };
  const MOODS = {
    happy: ['open', 'smile'], wave: ['happy', 'grin'], wow: ['open', 'o'], love: ['love', 'grin'], party: ['happy', 'grin'],
    think: ['up', 'flat'], cool: ['cool', 'smile'], wink: ['wink', 'grin'], sleepy: ['sleepy', 'small'],
  };

  /** The mascot as an HTML string. mood: one of MOODS; opts: { size (px), cls } */
  App.mascot = function (mood, opts) {
    opts = opts || {};
    const [eyes, mouth] = MOODS[mood] || MOODS.happy;
    const hat = mood === 'party'
      ? '<g class="m-hat"><path d="M48 24 l12 -22 l12 22 z" fill="#8b6cff"/><path d="M52 17 l16 0 M55 11 l10 0" stroke="#ffd23f" stroke-width="2.4"/><circle cx="60" cy="2" r="3.4" fill="#ff5c8a"/></g>' : '';
    const zz = mood === 'sleepy' ? '<text x="88" y="30" class="m-z">z</text><text x="98" y="18" class="m-z m-z2">z</text>' : '';
    return `<span class="mascot m-${mood || 'happy'} ${opts.cls || ''}" style="--sz:${opts.size || 96}px" aria-hidden="true"><svg viewBox="0 0 120 124">
      <ellipse class="m-shadow" cx="60" cy="116" rx="30" ry="5"/>
      <g class="m-body">
        <path class="m-arm m-arm-l" d="M24 70 q-12 -2 -14 -14"/>
        <path class="m-arm m-arm-r" d="M96 70 q12 -2 14 -14"/>
        <g class="m-sprout"><path d="M60 24 v-9" stroke="#1f9d52" stroke-width="4" stroke-linecap="round"/><path d="M60 16 q9 -9 16 -3 q-8 8 -16 3" fill="#2ee59d"/></g>
        ${hat}
        <circle cx="60" cy="64" r="40" class="m-coin"/>
        <circle cx="60" cy="64" r="32.5" class="m-rim"/>
        <ellipse cx="42" cy="42" rx="11" ry="6" transform="rotate(-35 42 42)" class="m-shine"/>
        <g class="m-face"><g class="m-eyes">${EYES[eyes]}</g>
          <circle cx="37" cy="72" r="5.4" class="m-cheek"/><circle cx="83" cy="72" r="5.4" class="m-cheek"/>
          ${MOUTH[mouth]}</g>
        ${zz}
      </g></svg></span>`;
  };
  /** The mascot with a speech bubble next to it. */
  App.mascotSays = (mood, html, opts) => `<div class="m-say ${(opts && opts.cls) || ''}">${App.mascot(mood, opts)}<div class="bubble">${html}</div></div>`;
})(typeof window !== 'undefined' ? window : globalThis);
