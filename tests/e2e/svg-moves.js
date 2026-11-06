// A motion whose target is an SVG element: Chrome on the user's phone runs none of those on the compositor (a trace
// there, 6 Nov 2026: compositeFailed), so it stands still whenever the page is busy. The show's logo did, half way up,
// while the app started under it ("the opening still sticks"); the sky's clouds and rain, the tab icon's pop, the saved
// tick's pop and the place button's hop the same. They move as HTML elements around their drawings now.
//   const seen = await SvgMoves.attach(page) before the first load; seen() lists every one so far, across reloads:
//   "name on tag.class".
// Left out: the sky's small ambient touches (a star's twinkle, the sea's glint, the cranes' wings, the sun's halo, an
// autumn leaf): a stalled frame moves them under a pixel. And motions of paint properties (a stroke drawing itself),
// which no compositor runs on any element.
// The mascot's parts (arms, eyes, body, shadow, sprout, its z's, the voice's bob and reactions) and the charts' bars,
// markers and area move as HTML layers too, each around its own drawing (mascot.js, charts.js), so none is left out.
const SMALL = ['sk-tw', 'sk-flap', 'sk-breathe', 'sk-leaf'];
const MOVES = ['transform', 'translate', 'scale', 'rotate', 'opacity', 'filter'];
const WATCH = `(() => {
  const seen = { add: (x) => { if (window.__svgMoveSeen) window.__svgMoveSeen(x); } }; const SMALL = ${JSON.stringify(SMALL)}, MOVES = ${JSON.stringify(MOVES)};
  const name = (t) => t.tagName + '.' + ((t.getAttribute && t.getAttribute('class')) || '');
  // a motion started from script (element.animate) fires no animationstart, so the call itself is watched
  const run = Element.prototype.animate;
  if (run) Element.prototype.animate = function (frames, o) {
    if (this instanceof SVGElement) {
      const props = Array.isArray(frames) ? frames.flatMap((k) => Object.keys(k || {})) : Object.keys(frames || {});
      if (props.some((p) => MOVES.includes(p))) seen.add('animate() on ' + name(this));
    }
    return run.apply(this, arguments);
  };
  document.addEventListener('animationstart', (e) => {
    const t = e.target; if (!(t instanceof SVGElement) || SMALL.includes(e.animationName)) return;
    const a = t.getAnimations().find((x) => x.animationName === e.animationName);
    const props = a ? a.effect.getKeyframes().flatMap((k) => Object.keys(k)) : MOVES;
    if (props.some((p) => MOVES.includes(p))) seen.add(e.animationName + ' on ' + name(t));
  }, true);
  document.addEventListener('transitionstart', (e) => { const t = e.target; if (t instanceof SVGElement && MOVES.includes(e.propertyName)) seen.add('transition ' + e.propertyName + ' on ' + name(t)); }, true);
})();`;
async function attach(page) {
  const seen = new Set();
  await page.exposeFunction('__svgMoveSeen', (x) => { seen.add(x); });
  await page.evaluateOnNewDocument(WATCH);
  return () => [...seen];
}
module.exports = { attach, SMALL };
