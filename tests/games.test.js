/* Mini-games: every question has one right answer among four clear choices; the rights statements are sound. */
const { Games, Engine } = globalThis;
const T = require('./t.js');

T.section('mini-games');
T.test('pay quiz: 2000 random rounds, every question well-formed', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const round = Games.quizRound(seed, 10, { rate: seed % 3 ? 30 + (seed % 25) : null });
    T.eq(round.length, 10);
    round.forEach((q, i) => {
      T.ok(q.q && q.x, 'question and explanation');
      T.eq(q.options.length, 4, 'four choices: ' + q.q);
      T.eq(new Set(q.options).size, 4, 'choices are distinct: ' + q.options.join(' | '));
      T.ok(q.answer >= 0 && q.answer < 4, 'answer index');
      T.ok(Number.isFinite(q.value) && q.value > 0, 'answer value');
      T.ok(q.options.every((o) => !/NaN|undefined|Infinity|-/.test(o)), 'no broken numbers: ' + q.options.join(' | '));
      if (i) T.ok(round[i - 1].kind !== q.kind, 'never the same kind twice in a row');
    });
  }
});
T.test('pay quiz: the marked answers are the right ones', () => {
  const r = () => 0; // the first item of every list
  const Q = Games.QUESTIONS;
  const a = (q) => q.options[q.answer];
  T.eq(a(Q[0](r)), '90 ₪'); // 3 h × 30
  T.eq(a(Q[1](r)), '40 ₪'); // 32 × 1.25
  T.eq(a(Q[2](r)), '45 ₪'); // 30 × 1.5
  T.eq(a(Q[3](r)), '5 שעות'); // 07:00–12:30 minus half an hour
  T.eq(a(Q[4](r)), '27 ₪'); // 3 days × 9
  T.eq(a(Q[5](r, {})), 'שעתיים'); // pizza 60 at 30 an hour
  T.eq(a(Q[5](r, { rate: 40 })), 'שעה וחצי'); // 60 / 40 = 1.5
  T.eq(a(Q[6](r)), '240 ₪'); // 2 shifts × 4 h × 30
  T.eq(a(Q[7](r)), '100 ₪'); // 200 × 50%
  T.eq(a(Q[8](r)), '5%'); // 30 -> 31.50
});
T.test('rights true/false: balanced rounds, real minimum wage', () => {
  const mw = Engine.legalMinWage('2026-10-01', '1990-01-01').hourly;
  const all = Games.facts(mw);
  T.eq(new Set(all.map((f) => f.id)).size, all.length, 'unique ids');
  T.ok(all.every((f) => f.s && f.x && typeof f.t === 'boolean'), 'statement, explanation, answer');
  T.ok(all.some((f) => f.id === 'minwage' && f.s.includes('35.40')), 'the minimum wage comes from the engine table');
  for (let seed = 1; seed <= 100; seed++) {
    const round = Games.factsRound(seed, 10, mw);
    T.eq(round.length, 10);
    T.eq(new Set(round.map((f) => f.id)).size, 10, 'no repeats in a round');
    const t = round.filter((f) => f.t).length;
    T.ok(t >= 3 && t <= 7, 'both true and false statements: ' + t);
  }
});
T.test('coin catcher: gets faster, never stops dropping', () => {
  const p0 = Games.coinPace(0), p1 = Games.coinPace(40), p2 = Games.coinPace(400);
  T.ok(p1.every < p0.every && p1.speed > p0.speed, 'faster at the end');
  T.eq(p2.every, p1.every, 'capped');
  const r = Games.rng(7);
  const seen = {};
  for (let i = 0; i < 5000; i++) { const d = Games.coinDrop(r, i % 40); seen[d.k] = (seen[d.k] || 0) + 1; }
  Games.DROPS.forEach((d) => T.ok(seen[d.k] > 0, 'every kind appears: ' + d.k));
  T.ok(seen.fine < 5000 * 0.3, 'fines stay a minority');
});
