/* Every name the code uses is defined somewhere (tools/undef.js). A name left behind when code moved stopped the
 * shift editor from opening (2026-10-29: `sh`), and only a browser found it; now every `npm test` does. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('./t.js');
const { check } = require('../tools/undef.js');

T.section('every name is defined');
T.test('no name in src/ is used without being declared (or being the browser\'s)', () => {
  T.eq(check().map((x) => `${x.file}:${x.line} ${x.name}`).join('  '), '');
});
T.test('...and the check sees one when there is (a name left behind, as in the shift editor)', () => {
  const f = path.join(os.tmpdir(), 'undef-canary.js');
  fs.writeFileSync(f, "(function (root) {\n  'use strict';\n  function preview(r) {\n    const { a } = r;\n    for (const [k, v] of Object.entries(a)) console.log(k, v);\n    return breakdown(r, sh);\n  }\n  function breakdown(r, s) { return [r, s]; }\n  root.p = preview;\n})(window);\n");
  const r = check([f]);
  fs.unlinkSync(f);
  T.eq(r.map((x) => x.name).join(','), 'sh');
});
