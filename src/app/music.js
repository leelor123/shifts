/* ============================================================
 * music.js — a little music for each game, made in the browser
 * (Web Audio; no files, nothing downloaded).
 *
 * Every game has its own loop: a tempo, four chords, a bass line, a
 * melody or an arpeggio and a light beat. It starts with a round, plays
 * softly under the sound effects, fades out when the round ends, stops
 * when the game closes or the app goes to the background (and comes back
 * with it), and has its own on/off: the note button in every game, or
 * Settings › Look. With all sounds off there is no music either.
 *
 * Timing: notes are scheduled a little ahead on the audio clock (not on
 * timers), so a busy moment on the page never makes the beat stumble.
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = root.Fx;
  const Music = { playing: '' };
  root.Music = Music;

  /* ---------------- the songs ----------------
   * Notes are written per bar as 16 sixteenths: a note (C5, Bb4, F#3), '.' for silence or '-' to hold
   * the note before. Chords give the bass and the arpeggios their notes. */
  const SONGS = {
    // "תופסים מטבעות": a bright arcade run
    coins: {
      bpm: 150, lead: 'square', leadVol: 0.022,
      chords: [['C3', 'E', 'G'], ['G2', 'B', 'D'], ['A2', 'C', 'E'], ['F2', 'A', 'C']],
      melody: [
        'C5 . E5 . G5 . E5 . C6 . G5 . E5 . G5 .',
        'B4 . D5 . G5 . D5 . B5 - A5 . G5 . D5 .',
        'A4 . C5 . E5 . C5 . A5 . G5 . E5 . C5 .',
        'A4 . C5 . F5 . A5 . G5 - E5 . D5 . B4 .',
      ],
      bass: 'octaves8', kick: [0, 8], clap: [4, 12], hat: [2, 6, 10, 14],
    },
    // "כמה זה יוצא?": thinking music with a clock that ticks
    quiz: {
      bpm: 112, lead: 'triangle', leadVol: 0.03,
      chords: [['A2', 'C', 'E'], ['F2', 'A', 'C'], ['C3', 'E', 'G'], ['G2', 'B', 'D']],
      melody: [
        'E5 . . . . . D5 . C5 . . . A4 . . .',
        'C5 . . . . . A4 . F4 . . . A4 . . .',
        'G4 . . . C5 . . . E5 . . . G5 . . .',
        'D5 . . . B4 . . . G4 . . . . . . .',
      ],
      arp: 'up8', bass: 'roots4', kick: [0, 10], hat: [2, 6, 10, 14], tick: [0, 4, 8, 12], soft: true,
    },
    // "נכון או לא?": sunny, a marimba
    facts: {
      bpm: 104, lead: 'marimba', leadVol: 0.06,
      chords: [['F2', 'A', 'C'], ['C3', 'E', 'G'], ['D3', 'F', 'A'], ['Bb2', 'D', 'F']],
      melody: [
        'F5 . A5 . C6 . A5 . G5 . F5 . . . C5 .',
        'E5 . G5 . C6 . G5 . E5 . D5 . C5 . . .',
        'D5 . F5 . A5 . F5 . E5 . D5 . A4 . . .',
        'Bb4 . D5 . F5 . D5 . C5 . . . . . . .',
      ],
      bass: 'rootFifth4', kick: [0, 8], clap: [4, 12], soft: true,
    },
    // "זוגות": a music box, calm for remembering
    pairs: {
      bpm: 88,
      chords: [['C3', 'E', 'G', 'B'], ['A2', 'C', 'E', 'G'], ['F2', 'A', 'C', 'E'], ['G2', 'B', 'D', 'E']],
      arp: 'box16', bass: 'half', echo: true, soft: true,
    },
    // "כמה שעות זה?": a funky groove
    hours: {
      bpm: 116, lead: 'square', leadVol: 0.016,
      chords: [['E2', 'G', 'B', 'D'], ['A2', 'C#', 'E', 'G'], ['E2', 'G', 'B', 'D'], ['B2', 'D#', 'F#', 'A']],
      bass: 'funk', stabs: [3, 11], kick: [0, 6, 8], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  };
  Music.SONGS = SONGS;

  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  /** 'C5' → 72; a name without an octave is placed just above the note before it (for chords). */
  function midi(name, above) {
    const m = /^([A-G][#b]?)(-?\d)?$/.exec(name);
    if (!m) return null;
    if (m[2] != null) return 12 * (+m[2] + 1) + NOTE[m[1]];
    let n = (above != null ? above : 48) - ((above != null ? above : 48) % 12) + NOTE[m[1]];
    while (above != null && n <= above) n += 12;
    return n;
  }
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  /** A chord as notes: ['A2', 'C', 'E'] → [45, 48, 52]. */
  const chordNotes = (c) => { const out = [midi(c[0])]; for (let i = 1; i < c.length; i++) out.push(midi(c[i], out[i - 1])); return out; };
  /** A bar of the melody: 16 slots of {n, len} (len in sixteenths) or null. */
  function parseBar(text) {
    const t = text.trim().split(/\s+/);
    const out = new Array(16).fill(null);
    let last = null;
    t.slice(0, 16).forEach((tok, i) => {
      if (tok === '-') { if (last) last.len++; return; }
      if (tok === '.') { last = null; return; }
      const n = midi(tok);
      last = n == null ? null : { n, len: 1 };
      out[i] = last;
    });
    return out;
  }
  Music._parse = { midi, chordNotes, parseBar };

  /* ---------------- the instruments ---------------- */
  let ctx = null, out = null, echo = null, noise = null;
  function setup() {
    const c = Fx.audio && Fx.audio();
    if (!c) return null;
    if (ctx !== c) build(c);
    return ctx;
  }
  /** The mixer on an audio context: master volume, a limiter, the echo and a noise buffer for the drums. */
  function build(c) {
    {
      ctx = c;
      out = c.createGain();
      out.gain.value = 0;
      // a gentle limiter keeps several voices together from ever clipping
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
      out.connect(comp).connect(c.destination);
      // a short echo for the music box
      echo = c.createDelay(1);
      echo.delayTime.value = 0.27;
      const fb = c.createGain(); fb.gain.value = 0.28;
      const wet = c.createGain(); wet.gain.value = 0.35;
      echo.connect(fb).connect(echo);
      echo.connect(wet).connect(out);
      const len = Math.floor(c.sampleRate * 0.5);
      noise = c.createBuffer(1, len, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
  }
  let voices = 0;
  /** One note: an oscillator through an envelope. */
  function tone(t, n, dur, wave, vol, opts) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(hz(n), t);
    const a = (opts && opts.attack) || 0.006;
    const d = (opts && opts.decay) || dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(vol * ((opts && opts.sustain) || 0.55), t + Math.min(dur, a + d * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    if (opts && opts.echo) g.connect(echo);
    o.start(t);
    o.stop(t + dur + 0.03);
    voices++;
    o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
  }
  /** A marimba: a sine and a quiet high partial, both dying away fast. */
  function marimba(t, n, vol) {
    tone(t, n, 0.32, 'sine', vol, { attack: 0.003, sustain: 0.25 });
    tone(t, n + 24, 0.08, 'sine', vol * 0.25, { attack: 0.002, sustain: 0.2 });
  }
  function kick(t, vol) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.18);
    voices++; o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
  }
  function hiss(t, dur, freq, type, vol) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 0.9 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.02);
    voices++; s.onended = () => { voices--; s.disconnect(); f.disconnect(); g.disconnect(); };
  }

  /* ---------------- playing ---------------- */
  let song = null, step = 0, nextAt = 0, timer = 0, wanted = '', bars = null, chords = null;
  const LOOK = 0.12; // seconds scheduled ahead
  const MASTER = 0.55; // the music sits under the sound effects (a coin, a right answer)
  function stepDur() { return 60 / song.bpm / 4; }
  /** Plays one sixteenth: drums, bass, chords and melody at that moment. */
  function playStep(t, i) {
    const s = song, bar = Math.floor(i / 16) % 4, k = i % 16;
    const ch = chords[bar];
    const soft = s.soft ? 0.6 : 1;
    if (s.kick && s.kick.includes(k)) kick(t, 0.32 * soft);
    if (s.clap && s.clap.includes(k)) hiss(t, 0.11, 1800, 'bandpass', 0.07 * soft);
    if (s.hat && s.hat.includes(k)) hiss(t, 0.035, 7000, 'highpass', (k % 4 === 2 ? 0.03 : 0.018) * soft);
    if (s.tick && s.tick.includes(k)) tone(t, 96, 0.03, 'sine', 0.018, { attack: 0.001 });
    // bass
    const root = ch[0];
    const sd = stepDur();
    if (s.bass === 'octaves8' && k % 2 === 0) tone(t, root + (k % 4 === 2 ? 12 : 0), sd * 1.8, 'triangle', 0.09);
    if (s.bass === 'roots4' && k % 4 === 0) tone(t, root, sd * 3.5, 'triangle', 0.08);
    if (s.bass === 'rootFifth4' && k % 4 === 0) tone(t, k % 8 === 0 ? root : root + 7, sd * 3.2, 'triangle', 0.08);
    if (s.bass === 'half' && k % 8 === 0) tone(t, k === 0 ? root : root + 7, sd * 7.5, 'sine', 0.07, { attack: 0.03, sustain: 0.7 });
    if (s.bass === 'funk') {
      const FUNK = { 0: 0, 3: 0, 6: 3, 8: 5, 12: 7, 14: 10 };
      if (FUNK[k] != null) tone(t, root + FUNK[k], sd * (k === 0 ? 1.8 : 0.9), 'sawtooth', 0.045, { attack: 0.004, sustain: 0.4 });
    }
    // chords: arpeggios and stabs
    if (s.arp === 'up8' && k % 2 === 0) { const up = ch.slice(1).concat(ch[1] + 12); tone(t, up[(k / 2) % up.length] + 12, sd * 1.6, 'triangle', 0.025, { attack: 0.004, sustain: 0.3 }); }
    if (s.arp === 'box16') {
      const notes = ch.map((n) => n + 24);
      const ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
      tone(t, notes[ORDER[k] % notes.length], 0.45, 'sine', 0.04, { attack: 0.002, sustain: 0.2, echo: true });
    }
    if (s.stabs && s.stabs.includes(k)) ch.slice(1).forEach((n) => tone(t, n + 12, 0.09, s.lead || 'square', 0.014, { attack: 0.002, sustain: 0.3 }));
    // the melody
    const m = bars && bars[bar][k];
    if (m) {
      const dur = m.len * sd * 0.92;
      if (s.lead === 'marimba') marimba(t, m.n, s.leadVol);
      else tone(t, m.n, Math.max(0.06, dur), s.lead, s.leadVol, { attack: 0.005, sustain: 0.6 });
    }
  }
  function tick() {
    if (!song || !ctx) return;
    // fell far behind (the phone slept a moment): skip ahead rather than play a burst of notes
    if (nextAt < ctx.currentTime - 0.25) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + LOOK) {
      try { playStep(nextAt, step); } catch (e) { /* one lost note never stops the song */ }
      step++;
      nextAt += stepDur();
    }
  }
  const enabled = () => { const p = Fx.prefs(); return p.music !== false && p.sound !== false; };
  Music.enabled = enabled;
  function start(id) {
    const s = SONGS[id];
    const c = s && setup();
    if (!c) return false;
    song = s; step = 0;
    chords = s.chords.map(chordNotes);
    bars = s.melody ? s.melody.map(parseBar) : null;
    nextAt = c.currentTime + 0.08;
    const g = out.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), c.currentTime);
    g.linearRampToValueAtTime(MASTER, c.currentTime + 0.35);
    clearInterval(timer);
    timer = setInterval(tick, 25);
    tick();
    Music.playing = id;
    return true;
  }
  function halt(fade) {
    clearInterval(timer); timer = 0;
    song = null;
    Music.playing = '';
    if (ctx && out) {
      const g = out.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(0, now + (fade == null ? 0.3 : fade));
    }
  }
  /** Starts a game's music (or keeps it going); quietly nothing when music is off. */
  Music.play = function (id) {
    wanted = id;
    if (!enabled() || document.hidden) return false;
    if (Music.playing === id && timer) return true;
    return start(id);
  };
  /** Stops (fading out); the game no longer wants music. */
  Music.stop = function (fade) { wanted = ''; halt(fade); };
  /** The on/off of the music (kept in the settings with the other sounds). */
  Music.toggle = async function () {
    const on = !enabled() || Fx.prefs().sound === false ? true : false;
    if (root.Store) await root.Store.setSettings((s) => { s.fx = Object.assign({}, s.fx, { music: on }, on ? { sound: true } : {}); });
    if (on && wanted) start(wanted); else if (!on) halt(0.2);
    return on;
  };
  // the app in the background: silence; back: the game's music again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { const w = wanted; halt(0.05); wanted = w; }
    else if (wanted && enabled()) start(wanted);
  });
  Music._stats = () => ({ voices, playing: Music.playing, wanted, step });
  /** For tests: renders a song's first bars offline and measures its loudness (peak and RMS). */
  Music._measure = async function (id, bars, raw) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!OAC || !SONGS[id]) return null;
    const keep = { ctx, out, echo, noise, song, chords, bars: bars0() };
    const s = SONGS[id];
    const secs = (bars || 4) * 16 * (60 / s.bpm / 4) + 0.6;
    const oc = new OAC(1, Math.ceil(44100 * secs), 44100);
    build(oc); out.gain.value = MASTER;
    song = s; chords = s.chords.map(chordNotes); barsSet(s.melody ? s.melody.map(parseBar) : null);
    const sd = 60 / s.bpm / 4;
    for (let i = 0; i < (bars || 4) * 16; i++) playStep(0.02 + i * sd, i);
    const buf = await oc.startRendering();
    ctx = keep.ctx; out = keep.out; echo = keep.echo; noise = keep.noise; song = keep.song; chords = keep.chords; barsSet(keep.bars);
    const d = buf.getChannelData(0);
    if (raw) return d;
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  };
  function bars0() { return bars; }
  function barsSet(b) { bars = b; }
})(typeof window !== 'undefined' ? window : globalThis);
