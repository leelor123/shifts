/* Admin helper that reuses the Firebase CLI login (dev tool, not part of the app).
 *   node tools/fbapi.js domains <projectId> <domain>    add an authorized sign-in domain
 *   node tools/fbapi.js authcfg <projectId>             show Auth config (providers, domains)
 *   node tools/fbapi.js ruletest <projectId>            run security-rule test cases
 *   node tools/fbapi.js emaillink <projectId>           turn on signing in with an email link (no password) */
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
  if (cmd === 'emaillink') {
    const r = await idt.patch(`/projects/${project}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, { signIn: { email: { enabled: true, passwordRequired: false } } });
    console.log('email link sign-in:', r.body.signIn && r.body.signIn.email && r.body.signIn.email.enabled ? 'on' : JSON.stringify(r.body).slice(0, 300));
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
  if (cmd === 'makeadmin') {
    // node tools/fbapi.js makeadmin <projectId> <email>  — adds the account to admins/ (owner access, rules don't apply)
    const look = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1', auth: true });
    const r = await look.post(`/projects/${project}/accounts:lookup`, { email: [arg] });
    const users = (r.body && r.body.users) || [];
    if (!users.length) { console.log('no account with that email has signed in to the app yet'); process.exit(1); }
    const uid = users[0].localId;
    const fsApi = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
    await fsApi.request({ method: 'PATCH', path: `/projects/${project}/databases/(default)/documents/admins/${uid}`, body: { fields: { added: { integerValue: String(Date.now()) }, by: { stringValue: 'owner-setup' } } } });
    console.log('admin added:', uid.slice(0, 6) + '…');
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
    const boss = { uid: 'boss', token: { email: 'boss@example.com' } };
    const tk = (o) => Object.assign({ uid: 'u1', reason: 'bug', text: 'the button does not work', status: 'open', created: 1, updated: 1, last: 'user', seen: true }, o || {});
    const owner = (uid, status) => [{ function: 'get', args: [{ exactValue: '/databases/(default)/documents/tickets/t1' }], result: { value: { data: { uid, status: status || 'open' } } } }];
    const lb = (o) => Object.assign({ n: 'שועל זריז 27', e: '🦊', bg: '', p: false, t: 1790000000000, g: { coins: { d: 2026101500050, a: 50 } } }, o || {});
    const frS = (o) => Object.assign({ m: { k: 202610, v: 6834 }, y: { k: 2026, v: 40000 }, a: 52000, h: 42.5 }, o || {});
    const frNoS = (o) => Object.assign({ n: 'שועל זריז 27', e: '🦊', t: 1790000000000, hide: false, f: ['u2'] }, o || {});
    const fr = (o) => Object.assign(frNoS(), { s: frS() }, o || {});
    const inv = (o) => Object.assign({ from: 'u1', n: 'שועל זריז 27', e: '🦊', t: 1790000000000, to: '' }, o || {});
    const stat = () => ({ v: '1.5.0', p: 'android', first: '2026-10-01', last: '2026-10-13', days: 5, sh: 12, s30: 6, ps: 1, age: 'u18', f: { rights: true }, t: 1790000000000 });
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
      ['a device writes its anonymous stats', 'ALLOW', 'create', me, '/stats/abcdef0123456789abcdef', stat(), null],
      ['stats need a signed-in user', 'DENY', 'create', null, '/stats/abcdef0123456789abcdef', stat(), null],
      ['stats cannot carry extra fields (e.g. email)', 'DENY', 'create', me, '/stats/abcdef0123456789abcdef', Object.assign(stat(), { email: 'a@b.c' }), null],
      ['stats platform must be known', 'DENY', 'create', me, '/stats/abcdef0123456789abcdef', Object.assign(stat(), { p: '<b>x</b>' }), null],
      ['stats dates must be dates', 'DENY', 'create', me, '/stats/abcdef0123456789abcdef', Object.assign(stat(), { last: '<img src=x>' }), null],
      ['a short stats id is refused', 'DENY', 'create', me, '/stats/abc', stat(), null],
      ['a regular user cannot read stats', 'DENY', 'get', me, '/stats/abcdef0123456789abcdef', null, stat()],
      ['an admin can read stats', 'ALLOW', 'get', boss, '/stats/abcdef0123456789abcdef', null, stat(), ['boss']],
      ['a user can check their own admin entry', 'ALLOW', 'get', me, '/admins/u1', null, { added: 1, by: 'x' }],
      ['a user cannot read another user’s admin entry', 'DENY', 'get', me, '/admins/boss', null, { added: 1, by: 'x' }],
      ['a regular user cannot make themselves admin', 'DENY', 'create', me, '/admins/u1', { added: 1, by: 'u1' }, null],
      ['an admin can add an admin', 'ALLOW', 'create', boss, '/admins/u7', { added: 1, by: 'boss' }, null, ['boss']],
      ['an admin must sign the entry as themselves', 'DENY', 'create', boss, '/admins/u7', { added: 1, by: 'u1' }, null, ['boss']],
      ['an admin cannot remove themselves', 'DENY', 'delete', boss, '/admins/boss', null, { added: 1, by: 'x' }, ['boss']],
      ['an admin can remove another admin', 'ALLOW', 'delete', boss, '/admins/u7', null, { added: 1, by: 'boss' }, ['boss']],
      ['admin entries cannot be edited', 'DENY', 'update', boss, '/admins/u7', { added: 2, by: 'boss' }, { added: 1, by: 'boss' }, ['boss']],
      ['a user opens a support request', 'ALLOW', 'create', me, '/tickets/t1', tk(), null],
      ['a request in someone else’s name is refused', 'DENY', 'create', me, '/tickets/t1', tk({ uid: 'u2' }), null],
      ['someone who can’t sign in may write, with an email', 'ALLOW', 'create', null, '/tickets/t2', tk({ uid: '', email: 'kid@example.com' }), null],
      ['…but not without an email', 'DENY', 'create', null, '/tickets/t2', tk({ uid: '' }), null],
      ['…and not in a user’s name', 'DENY', 'create', null, '/tickets/t2', tk({ email: 'kid@example.com' }), null],
      ['a request cannot carry extra fields', 'DENY', 'create', me, '/tickets/t1', tk({ admin: true }), null],
      ['a new request cannot start as answered', 'DENY', 'create', me, '/tickets/t1', tk({ status: 'answered' }), null],
      ['a too-short request is refused', 'DENY', 'create', me, '/tickets/t1', tk({ text: 'hi' }), null],
      ['the writer can read their request', 'ALLOW', 'get', me, '/tickets/t1', null, tk()],
      ['another user cannot read it', 'DENY', 'get', { uid: 'u2' }, '/tickets/t1', null, tk()],
      ['signed-out cannot read any request', 'DENY', 'get', null, '/tickets/t2', null, tk({ uid: '' })],
      ['an admin can read every request', 'ALLOW', 'get', boss, '/tickets/t1', null, tk(), ['boss']],
      ['the writer marks a reply as seen', 'ALLOW', 'update', me, '/tickets/t1', tk({ status: 'answered', last: 'admin', seen: true }), tk({ status: 'answered', last: 'admin', seen: false })],
      ['the writer cannot change what they wrote', 'DENY', 'update', me, '/tickets/t1', tk({ text: 'something else entirely' }), tk()],
      ['the writer cannot mark it answered', 'DENY', 'update', me, '/tickets/t1', tk({ status: 'answered' }), tk()],
      ['the writer cannot pose as the team', 'DENY', 'update', me, '/tickets/t1', tk({ last: 'admin' }), tk()],
      ['an admin answers', 'ALLOW', 'update', boss, '/tickets/t1', tk({ status: 'answered', last: 'admin', seen: false, updated: 9 }), tk(), ['boss']],
      ['the writer adds a message', 'ALLOW', 'create', me, '/tickets/t1/msgs/m1', { from: 'user', text: 'more info', t: 5 }, null, [], owner('u1')],
      ['the writer cannot write as the team', 'DENY', 'create', me, '/tickets/t1/msgs/m1', { from: 'admin', text: 'fake answer', t: 5 }, null, [], owner('u1')],
      ['another user cannot add messages', 'DENY', 'create', { uid: 'u2' }, '/tickets/t1/msgs/m1', { from: 'user', text: 'hi', t: 5 }, null, [], owner('u1')],
      ['an admin replies in the conversation', 'ALLOW', 'create', boss, '/tickets/t1/msgs/m2', { from: 'admin', text: 'we fixed it', t: 6 }, null, ['boss'], owner('u1')],
      ['another user cannot read the conversation', 'DENY', 'get', { uid: 'u2' }, '/tickets/t1/msgs/m1', null, { from: 'user', text: 'x', t: 1 }, [], owner('u1')],
      ['an admin deletes a closed request', 'ALLOW', 'delete', boss, '/tickets/t1', null, tk({ status: 'closed' }), ['boss']],
      ['an admin cannot delete an open request', 'DENY', 'delete', boss, '/tickets/t1', null, tk(), ['boss']],
      ['an admin cannot delete an answered request', 'DENY', 'delete', boss, '/tickets/t1', null, tk({ status: 'answered' }), ['boss']],
      ['the writer deletes their own (account deletion)', 'ALLOW', 'delete', me, '/tickets/t1', null, tk()],
      ['another user cannot delete it', 'DENY', 'delete', { uid: 'u2' }, '/tickets/t1', null, tk({ status: 'closed' })],
      ['an admin deletes the messages of a closed request', 'ALLOW', 'delete', boss, '/tickets/t1/msgs/m1', null, { from: 'user', text: 'x', t: 1 }, ['boss'], owner('u1', 'closed')],
      ['an admin cannot delete the messages of an open request', 'DENY', 'delete', boss, '/tickets/t1/msgs/m1', null, { from: 'user', text: 'x', t: 1 }, ['boss'], owner('u1', 'open')],
      ['the writer deletes their messages', 'ALLOW', 'delete', me, '/tickets/t1/msgs/m1', null, { from: 'user', text: 'x', t: 1 }, [], owner('u1')],
      ['another user cannot delete the messages', 'DENY', 'delete', { uid: 'u2' }, '/tickets/t1/msgs/m1', null, { from: 'user', text: 'x', t: 1 }, [], owner('u1', 'closed')],
      ['a player joins the champions table', 'ALLOW', 'create', me, '/lb/u1', lb(), null],
      ['a player saves a score', 'ALLOW', 'update', me, '/lb/u1', lb({ g: { coins: { d: 2026101500120, w: 2026101100120, m: 20261000120, y: 202600120, a: 120 }, facts: { a: 10 } } }), lb()],
      ['a row in someone else’s name is refused', 'DENY', 'create', me, '/lb/u2', lb(), null],
      ['signed out: cannot write', 'DENY', 'create', null, '/lb/u1', lb(), null],
      ['a score above the game’s highest is refused', 'DENY', 'update', me, '/lb/u1', lb({ g: { facts: { a: 11 } } }), lb()],
      ['a packed score above the highest is refused', 'DENY', 'update', me, '/lb/u1', lb({ g: { facts: { d: 2026101500011 } } }), lb()],
      ['a period that is not a date is refused', 'DENY', 'update', me, '/lb/u1', lb({ g: { coins: { d: 99 } } }), lb()],
      ['an unknown game is refused', 'DENY', 'update', me, '/lb/u1', lb({ g: { cheat: { a: 1 } } }), lb()],
      ['a score that is not a whole number is refused', 'DENY', 'update', me, '/lb/u1', lb({ g: { coins: { a: 1.5 } } }), lb()],
      ['a nickname with markup is refused', 'DENY', 'create', me, '/lb/u1', lb({ n: '<b>x</b>' }), null],
      ['a nickname with a phone number is refused', 'DENY', 'create', me, '/lb/u1', lb({ n: 'call 0541234567' }), null],
      ['a nickname too long is refused', 'DENY', 'create', me, '/lb/u1', lb({ n: 'אבגדהוזחטיכלמנסעפ' }), null],
      ['an unknown emoji is refused', 'DENY', 'create', me, '/lb/u1', lb({ e: '💩' }), null],
      ['an unknown background is refused', 'DENY', 'create', me, '/lb/u1', lb({ bg: 'url(x)' }), null],
      ['extra fields (an email) are refused', 'DENY', 'create', me, '/lb/u1', lb({ email: 'a@b.c' }), null],
      ['a signed-in player reads a row', 'ALLOW', 'get', { uid: 'u2' }, '/lb/u1', null, lb()],
      ['signed out: cannot read the table', 'DENY', 'get', null, '/lb/u1', null, lb()],
      ['a player leaves the table', 'ALLOW', 'delete', me, '/lb/u1', null, lb()],
      ['another player cannot remove a row', 'DENY', 'delete', { uid: 'u2' }, '/lb/u1', null, lb()],
      ['an admin removes a bad row', 'ALLOW', 'delete', boss, '/lb/u1', null, lb(), ['boss']],
      // the friends' competition: a card is read only by the friends it lists; an invitation is accepted once
      ['a player saves their friends card', 'ALLOW', 'create', me, '/fr/u1', fr(), null],
      ['a card in someone else’s name is refused', 'DENY', 'create', me, '/fr/u2', fr(), null],
      ['a listed friend reads the card', 'ALLOW', 'get', { uid: 'u2' }, '/fr/u1', null, fr()],
      ['someone not on the list cannot read it', 'DENY', 'get', { uid: 'u3' }, '/fr/u1', null, fr()],
      ['signed out: cannot read a card', 'DENY', 'get', null, '/fr/u1', null, fr()],
      ['the cards cannot be listed', 'DENY', 'list', { uid: 'u2' }, '/fr/u1', null, fr()],
      ['hidden amounts: a card without them', 'ALLOW', 'update', me, '/fr/u1', frNoS({ hide: true }), fr()],
      ['hidden amounts: a card that still carries them is refused', 'DENY', 'update', me, '/fr/u1', fr({ hide: true }), fr()],
      ['an amount out of range is refused', 'DENY', 'update', me, '/fr/u1', fr({ s: frS({ m: { k: 202610, v: 20000000 } }) }), fr()],
      ['a month that is not a month is refused', 'DENY', 'update', me, '/fr/u1', fr({ s: frS({ m: { k: 99, v: 1 } }) }), fr()],
      ['more than 50 friends is refused', 'DENY', 'update', me, '/fr/u1', fr({ f: Array.from({ length: 51 }, (_, i) => 'u' + i) }), fr()],
      ['extra fields (an email) on a card are refused', 'DENY', 'update', me, '/fr/u1', fr({ email: 'a@b.c' }), fr()],
      ['a nickname with a phone number on a card is refused', 'DENY', 'create', me, '/fr/u1', fr({ n: 'call 0541234567' }), null],
      ['another player cannot delete a card', 'DENY', 'delete', { uid: 'u2' }, '/fr/u1', null, fr()],
      ['a player removes their card', 'ALLOW', 'delete', me, '/fr/u1', null, fr()],
      ['a player makes an invitation', 'ALLOW', 'create', me, '/inv/abcdefghijklmnop1', inv(), null],
      ['an invitation in someone else’s name is refused', 'DENY', 'create', me, '/inv/abcdefghijklmnop1', inv({ from: 'u2' }), null],
      ['a short (guessable) code is refused', 'DENY', 'create', me, '/inv/abc', inv(), null],
      ['an invitation made already accepted is refused', 'DENY', 'create', me, '/inv/abcdefghijklmnop1', inv({ to: 'u2' }), null],
      ['whoever has the link reads the invitation', 'ALLOW', 'get', { uid: 'u2' }, '/inv/abcdefghijklmnop1', null, inv()],
      ['signed out: cannot read an invitation', 'DENY', 'get', null, '/inv/abcdefghijklmnop1', null, inv()],
      ['the friend accepts', 'ALLOW', 'update', { uid: 'u2' }, '/inv/abcdefghijklmnop1', inv({ to: 'u2' }), inv()],
      ['accepting in someone else’s name is refused', 'DENY', 'update', { uid: 'u2' }, '/inv/abcdefghijklmnop1', inv({ to: 'u3' }), inv()],
      ['the sender cannot accept their own', 'DENY', 'update', me, '/inv/abcdefghijklmnop1', inv({ to: 'u1' }), inv()],
      ['an invitation accepted once cannot be taken again', 'DENY', 'update', { uid: 'u3' }, '/inv/abcdefghijklmnop1', inv({ to: 'u3' }), inv({ to: 'u2' })],
      ['accepting cannot change the sender', 'DENY', 'update', { uid: 'u2' }, '/inv/abcdefghijklmnop1', inv({ to: 'u2', from: 'u2' }), inv()],
      ['the sender lists their invitations', 'ALLOW', 'list', me, '/inv/abcdefghijklmnop1', null, inv()],
      ['another player cannot list them', 'DENY', 'list', { uid: 'u2' }, '/inv/abcdefghijklmnop1', null, inv()],
      ['the sender deletes an invitation', 'ALLOW', 'delete', me, '/inv/abcdefghijklmnop1', null, inv({ to: 'u2' })],
      ['the friend who accepted deletes it', 'ALLOW', 'delete', { uid: 'u2' }, '/inv/abcdefghijklmnop1', null, inv({ to: 'u2' })],
      ['a third player cannot delete it', 'DENY', 'delete', { uid: 'u3' }, '/inv/abcdefghijklmnop1', null, inv({ to: 'u2' })],
    ];
    const testCases = cases.map(([, expect, method, auth, p, data, existing, admins, mocks]) => {
      const tc = { expectation: expect, request: { auth: auth || null, path: db + p, method } };
      if (data) tc.request.resource = { data };
      // exists(admins/{uid}) is answered by a mock: true for the listed admins, false for everyone else
      tc.functionMocks = (admins || []).map((a) => ({ function: 'exists', args: [{ exactValue: '/databases/(default)/documents/admins/' + a }], result: { value: true } }))
        .concat(mocks || []).concat([{ function: 'exists', args: [{ anyValue: {} }], result: { value: false } }]);
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
