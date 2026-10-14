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
T.test('pairs: every board has n distinct pairs, each word with its own meaning', () => {
  T.ok(Games.PAIRS.length >= 10, 'enough words');
  T.eq(new Set(Games.PAIRS.map((p) => p.t)).size, Games.PAIRS.length, 'words are distinct');
  T.eq(new Set(Games.PAIRS.map((p) => p.d)).size, Games.PAIRS.length, 'meanings are distinct');
  Games.PAIRS.forEach((p) => T.ok(p.t.length <= 14 && p.d.length <= 24, 'fits on a small card: ' + p.t + ' / ' + p.d));
  for (let seed = 1; seed <= 300; seed++) {
    const { pairs, cards } = Games.pairsRound(seed, 6);
    T.eq(pairs.length, 6); T.eq(cards.length, 12);
    for (const p of pairs) {
      const two = cards.filter((c) => c.pair === p.id);
      T.eq(two.length, 2, 'two cards per pair');
      T.ok(two.some((c) => c.kind === 't' && c.text === p.t) && two.some((c) => c.kind === 'd' && c.text === p.d), 'a word and its meaning');
    }
  }
  const a = Games.pairsRound(5, 6).cards.map((c) => c.text).join(), b = Games.pairsRound(6, 6).cards.map((c) => c.text).join();
  T.ok(a !== b, 'boards differ between rounds');
  T.eq(Games.pairsRound(1, 99).pairs.length, Games.PAIRS.length, 'never more pairs than words');
});
T.test('pairs: points reward memory and speed, never below 10', () => {
  T.eq(Games.pairsScore(6, 6, 0), 140); // perfect and instant
  T.eq(Games.pairsScore(6, 6, 80), 100); // perfect, slow
  T.ok(Games.pairsScore(6, 10, 30) < Games.pairsScore(6, 7, 30), 'more tries, fewer points');
  T.ok(Games.pairsScore(6, 7, 60) < Games.pairsScore(6, 7, 20), 'slower, fewer points');
  T.eq(Games.pairsScore(6, 60, 600), 10, 'floor');
});
T.test('how many hours: always a right answer, no repeats in a row', () => {
  T.eq(new Set(Games.THINGS.map((t) => t.name)).size, Games.THINGS.length, 'names are distinct');
  Games.THINGS.forEach((t) => T.ok(t.price > 0 && t.e && t.name, 'well-formed: ' + t.name));
  for (let seed = 1; seed <= 300; seed++) {
    const chain = Games.hoursRound(seed, 40);
    T.eq(chain.length, 40);
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1].price, b = chain[i].price;
      T.ok(Math.max(a, b) / Math.min(a, b) >= 1.2, 'clearly more or less: ' + chain[i - 1].name + ' / ' + chain[i].name);
      T.ok(chain[i] !== chain[i - 1], 'not the same thing twice in a row');
    }
  }
});
T.test('how many hours: work time in words', () => {
  T.eq(Games.workTime(0.01), '5 דק׳');
  T.eq(Games.workTime(0.75), '45 דק׳');
  T.eq(Games.workTime(1), 'שעה');
  T.eq(Games.workTime(2.25), 'שעתיים ו-15 דק׳');
  T.eq(Games.workTime(3.5), '3 שעות ו-30 דק׳');
  T.eq(Games.workTime(9.99), '10 שעות');
  T.eq(Games.workTime(10.9), '11 שעות');
  T.eq(Games.workTime(105), '105 שעות');
  T.ok(!/NaN|undefined/.test(Games.workTime(4200 / 29.12)), 'odd rates are fine');
});
