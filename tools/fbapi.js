/* Admin helper that reuses the Firebase CLI login (dev tool, not part of the app).
 *   node tools/fbapi.js domains <projectId> <domain>    add an authorized sign-in domain
 *   node tools/fbapi.js authcfg <projectId>             show Auth config (providers, domains)
 *   node tools/fbapi.js ruletest <projectId>            run security-rule test cases */
const path = require('path');
const { execSync } = require('child_process');
const lib = path.join(execSync('npm root -g').toString().trim(), 'firebase-tools', 'lib');
const { requireAuth } = require(path.join(lib, 'requireAuth'));
const { Client } = require(path.join(lib, 'apiv2'));
const fs = require('fs');

async function main() {
  const [cmd, project, arg] = process.argv.slice(2);
  const { configstore } = require(path.join(lib, 'configstore'));
  await requireAuth({ user: configstore.get('user'), tokens: configstore.get('tokens') });
  const idt = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2', auth: true });
  if (cmd === 'enable') {
    const su = new Client({ urlPrefix: 'https://serviceusage.googleapis.com', apiVersion: 'v1', auth: true });
    for (const svc of arg.split(',')) {
      const r = await su.post(`/projects/${project}/services/${svc}:enable`, {});
      let op = r.body;
      for (let i = 0; i < 30 && op && op.name && !op.done; i++) { await new Promise((res) => setTimeout(res, 3000)); op = (await su.get(`/${op.name}`)).body; }
      console.log(svc, op && op.error ? 'ERROR ' + JSON.stringify(op.error) : 'enabled');
    }
  }
  if (cmd === 'authcfg') {
    const r = await idt.get(`/projects/${project}/config`);
    console.log('authorizedDomains:', (r.body.authorizedDomains || []).join(', '));
    const p = await idt.get(`/projects/${project}/defaultSupportedIdpConfigs`).catch((e) => ({ body: { error: e.message } }));
    // never print secrets (client secret, password-hash keys)
    for (const c of p.body.defaultSupportedIdpConfigs || []) console.log('provider:', c.name.split('/').pop(), c.enabled ? 'enabled' : 'disabled');
    if (p.body.error) console.log('providers: error', p.body.error);
  }
  if (cmd === 'redirectcheck') {
    // asks Google whether <arg>/__/auth/handler is an allowed redirect for the Google sign-in client
    // (the client ID is public; the secret is never read)
    const p = await idt.get(`/projects/${project}/defaultSupportedIdpConfigs/google.com`);
    const q = new URLSearchParams({ client_id: p.body.clientId, redirect_uri: `https://${arg}/__/auth/handler`, response_type: 'code', scope: 'openid' });
    const r = await fetch(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { redirect: 'manual' });
    const loc = r.headers.get('location') || '';
    const body = r.status === 200 ? await r.text() : '';
    const bad = /redirect_uri_mismatch|signin\/oauth\/error/.test(body + loc);
    console.log(arg, r.status, bad ? 'MISMATCH (not allowed)' : 'allowed', loc.split('?')[0]);
  }
  if (cmd === 'domains') {
    const r = await idt.get(`/projects/${project}/config`);
    const domains = r.body.authorizedDomains || [];
    if (!domains.includes(arg)) domains.push(arg);
    const u = await idt.patch(`/projects/${project}/config`, { authorizedDomains: domains }, { queryParams: { updateMask: 'authorizedDomains' } });
    console.log('authorizedDomains:', u.body.authorizedDomains.join(', '));
  }
  if (cmd === 'ruletest') {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const db = '/databases/(default)/documents';
    const me = { uid: 'u1', token: { email: 'me@example.com' } };
    const rec = (u) => ({ u, d: false, j: '{"id":"s1"}' });
    const cases = [
      ['owner can create a shift', 'ALLOW', 'create', me, `/users/u1/shifts/s1`, rec(5), null],
      ['owner can update with a newer version', 'ALLOW', 'update', me, `/users/u1/shifts/s1`, rec(9), rec(5)],
      ['an older version cannot overwrite a newer one', 'DENY', 'update', me, `/users/u1/shifts/s1`, rec(3), rec(5)],
      ['owner can read', 'ALLOW', 'get', me, `/users/u1/shifts/s1`, null, rec(5)],
      ['another user cannot read', 'DENY', 'get', { uid: 'u2' }, `/users/u1/shifts/s1`, null, rec(5)],
      ['another user cannot write', 'DENY', 'create', { uid: 'u2' }, `/users/u1/shifts/s9`, rec(5), null],
      ['signed-out cannot read', 'DENY', 'get', null, `/users/u1/shifts/s1`, null, rec(5)],
      ['unknown collection refused', 'DENY', 'create', me, `/users/u1/evil/x`, rec(5), null],
      ['extra fields refused', 'DENY', 'create', me, `/users/u1/shifts/s2`, Object.assign(rec(5), { x: 1 }), null],
      ['tombstone allowed', 'ALLOW', 'update', me, `/users/u1/shifts/s1`, { u: 10, d: true, j: null }, rec(5)],
      ['profile doc writable by owner', 'ALLOW', 'update', me, `/users/u1`, { email: 'me@example.com', updatedAt: 1 }, { email: 'me@example.com' }],
      ['other paths refused', 'DENY', 'create', me, `/other/x`, { a: 1 }, null],
    ];
    const testCases = cases.map(([, expect, method, auth, p, data, existing]) => {
      const tc = { expectation: expect, request: { auth: auth || null, path: db + p, method } };
      if (data) tc.request.resource = { data };
      tc.functionMocks = [];
      if (existing) tc.resource = { data: existing };
      return tc;
    });
    const rulesApi = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1', auth: true });
    const r = await rulesApi.post(`/projects/${project}:test`, { source: { files: [{ name: 'firestore.rules', content: rules }] }, testSuite: { testCases } });
    const res = r.body.testResults || [];
    let fails = 0;
    res.forEach((t, i) => { const ok = t.state === 'SUCCESS'; if (!ok) fails++; console.log(`${ok ? '✓' : '✗'} ${cases[i][0]}${ok ? '' : '  ' + JSON.stringify(t.debugMessages || t.errorPosition || t)}`); });
    if (r.body.issues) console.log('issues:', JSON.stringify(r.body.issues));
    console.log(`${res.length - fails}/${res.length} rule tests passed`);
    process.exit(fails ? 1 : 0);
  }
}
main().catch((e) => { console.error('ERROR', e.status || '', e.message, e.context && JSON.stringify(e.context.body || '').slice(0, 500)); process.exit(1); });
