/* Every locality in Israel (core/places-data.js, core/places.js) and Shabbat times by place (hebcal.js). */
const T = require('./t.js');
const P = globalThis.Places, HC = globalThis.HebCal;
const names = (q, n) => P.search(q, n || 5).list.map((p) => p.name);

T.section('places: every locality');
T.test('the whole CBS list is there, each with a place and a short line', () => {
  T.eq(P.ALL.length, 1313);
  T.eq(P.LETTERS.join(''), 'אבגדהוזחטיכלמנסעפצקרשת');
  for (const p of P.ALL) {
    T.ok(p.lat > 29.4 && p.lat < 33.4 && p.lon > 34.2 && p.lon < 35.95, p.name + ' outside Israel');
    T.ok(p.fact && p.fact.length <= 32, p.name + ': line ' + p.fact);
    T.ok(!/[|]/.test(p.name + p.fact), p.name);
  }
  T.eq(new Set(P.ALL.map((p) => p.name)).size, P.ALL.length);
});
T.test('cities, local councils, kibbutzim, moshavim, community villages and villages', () => {
  for (const n of ['ירושלים', 'אום אל-פחם', 'דגניה א׳', 'נהלל', 'עפרה', 'מג׳דל שמס', 'רהט', 'כפר תבור', 'עין גדי', 'אבו גוש', 'מצפה רמון', 'יטבתה']) T.ok(P.find(n), n);
});
T.test('the old list keeps its exact coordinates (nobody\'s Shabbat times moved)', () => {
  for (const c of HC.CITIES) {
    const f = HC.findCity(c.name);
    T.eq([f.lat, f.lon, f.candle].join(), [c.lat, c.lon, c.candle].join(), c.name);
  }
  // the same city under its CBS spelling: the same place
  T.eq(JSON.stringify(P.find('הרצלייה') && [P.find('הרצלייה').lat, P.find('הרצלייה').lon]), JSON.stringify([32.1663, 34.8436]));
  T.eq(P.find('ירושלים').candle, 40);
  T.eq(P.find('חיפה').candle, 30);
  T.eq(P.find('נתניה').candle, 18);
});
T.test('a new place: its own coordinates for Shabbat', () => {
  const d = HC.findCity('דגניה א׳');
  T.ok(Math.abs(d.lat - 32.707) < 0.02 && Math.abs(d.lon - 35.574) < 0.02, JSON.stringify(d));
  T.eq(HC.findCity('no such place').name, 'תל אביב-יפו');
});

T.section('places: search');
T.test('the way people type', () => {
  T.eq(names('תל אביב')[0], 'תל אביב-יפו');
  T.eq(names('תלאביב')[0], 'תל אביב-יפו');
  T.eq(names('תל-אביב')[0], 'תל אביב-יפו');
  T.eq(names('הרצליה')[0], 'הרצלייה');
  T.eq(names('נהריה')[0], 'נהרייה');
  T.eq(names('פתח תקוה')[0], 'פתח תקווה');
  T.ok(names('קרית', 30).length >= 15 && names('קרית', 30).every((n) => /^קרי?ית/.test(n)), names('קרית', 30).join());
  T.eq(names('רעות')[0], 'מודיעין-מכבים-רעות');
  T.eq(names('גוש חלב')[0], 'ג׳ש (גוש חלב)');
});
T.test('abbreviations and English names', () => {
  T.eq(names('פ"ת')[0], 'פתח תקווה');
  T.eq(names('ב״ש')[0], 'באר שבע');
  T.eq(names('ראשל"צ')[0], 'ראשון לציון');
  T.eq(names('haifa')[0], 'חיפה');
  T.eq(names('Tel Aviv')[0], 'תל אביב-יפו');
});
T.test('the start of the name first, towns first, then Hebrew order', () => {
  const r = names('דגניה');
  T.eq(r.join(), 'דגניה א׳,דגניה ב׳');
  T.eq(names('ירו')[0], 'ירושלים');
  T.eq(P.search('', 5).total, 0);
  T.eq(P.search('זזזז').total, 0);
});
T.test('old names are found', () => {
  T.eq(P.find('מודיעין').name, 'מודיעין-מכבים-רעות');
  T.eq(P.find('יקנעם').name, 'יקנעם עילית');
  T.eq(P.find('נצרת עילית').name, 'נוף הגליל');
  T.eq(P.find(''), null);
});
T.test('the most common: the biggest places people live in', () => {
  T.eq(P.popular(4).map((p) => p.name).join(), 'ירושלים,תל אביב-יפו,חיפה,פתח תקווה');
});

T.section('places: nearest');
T.test('the nearest place people live in', () => {
  T.eq(P.nearest(31.778, 35.235).place.name, 'ירושלים');
  T.eq(P.nearest(29.555, 34.951).place.name, 'אילת');
  T.eq(P.nearest(33.2077, 35.5709).place.name, 'קריית שמונה');
  T.ok(P.nearest(40.7, -74).km > 1000);
  // never an industrial zone or a tribe's area
  for (const [la, lo] of [[30.0, 35.1], [31.25, 34.85], [32.9, 35.4]]) T.eq(P.nearest(la, lo).place.kind, 0);
});
