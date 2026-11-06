// The mascot speaks with the browser's speech synthesis, which on Windows plays on the computer's speakers even in a
// headless browser: tests ran the user's computer talking (6 Nov 2026). Before a page loads, speech is replaced by a
// silent stand-in that still tells the app a sentence started and ended, so the mascot's own logic runs as before.
const QUIET = `(() => {
  const s = window.speechSynthesis; if (!s) return;
  const fire = (u, t) => { try { const e = new Event(t); if (typeof u['on' + t] === 'function') u['on' + t](e); u.dispatchEvent(e); } catch (x) { /* none */ } };
  s.speak = (u) => { setTimeout(() => fire(u, 'start'), 0); setTimeout(() => fire(u, 'end'), 30); };
})();`;
module.exports = { QUIET, quiet: (page) => page.evaluateOnNewDocument(QUIET) };
