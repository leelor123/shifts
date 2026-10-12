/* Test doubles: a minimal in-memory IndexedDB (enough for store.js) and a
 * fake Firestore backend shared by several simulated phones. */
const tick = () => new Promise((r) => setTimeout(r, 0));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

/* ---------------- IndexedDB ---------------- */
function fakeIndexedDB() {
  const dbs = new Map();
  function request(fn) {
    const req = { onsuccess: null, onerror: null, result: undefined };
    setTimeout(() => { try { req.result = fn(); req.onsuccess && req.onsuccess({ target: req }); } catch (e) { req.error = e; req.onerror && req.onerror(e); } }, 0);
    return req;
  }
  return {
    open(name) {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null };
      setTimeout(() => {
        let isNew = false;
        if (!dbs.has(name)) { dbs.set(name, new Map()); isNew = true; }
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: (n) => stores.has(n) },
          createObjectStore: (n, o) => { stores.set(n, { keyPath: o.keyPath, rows: new Map() }); },
          transaction(names) {
            const t = { oncomplete: null, onerror: null, onabort: null };
            let timer = null;
            const schedule = () => { clearTimeout(timer); timer = setTimeout(() => t.oncomplete && t.oncomplete(), 3); };
            t.objectStore = (n) => {
              const st = stores.get(n);
              const op = (fn) => { schedule(); return request(fn); };
              return {
                put: (obj) => op(() => { st.rows.set(obj[st.keyPath], clone(obj)); }),
                delete: (k) => op(() => { st.rows.delete(k); }),
                clear: () => op(() => { st.rows.clear(); }),
                getAll: () => op(() => [...st.rows.values()].map(clone)),
                get: (k) => op(() => clone(st.rows.get(k))),
              };
            };
            schedule();
            return t;
          },
        };
        req.result = db;
        if (isNew && req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    },
  };
}

/* ---------------- Firestore ---------------- */
function fakeBackend() {
  return { docs: new Map(), clients: new Set(), rejected: 0 };
}
const parentOf = (p) => p.split('/').slice(0, -1).join('/');
const idOf = (p) => p.split('/').pop();

/** One phone's Firestore client. `online` can be toggled; offline writes queue. */
function fakeClient(backend) {
  const subs = []; // {kind:'coll'|'doc', path, cb}
  const queue = [];
  const client = { online: true, subs };
  backend.clients.add(client);

  function snapDoc(path, data, pendingFlag) {
    return { id: idOf(path), ref: { path }, exists: () => data !== undefined, data: () => clone(data), metadata: { hasPendingWrites: pendingFlag } };
  }
  function notify(path, data, fromSelfPending) {
    // the writer sees its own write immediately as "pending"; other phones see it when the server has it
    for (const c of backend.clients) {
      const own = c === client;
      if (own !== !!fromSelfPending) continue;
      if (!own && !c.online) continue;
      for (const s of c.subs) {
        if (s.kind === 'coll' && parentOf(path) === s.path) s.cb({ docChanges: () => [{ type: 'modified', doc: snapDoc(path, data, own) }], metadata: { fromCache: false } });
        if (s.kind === 'doc' && s.path === path) s.cb(snapDoc(path, data, own));
      }
    }
  }
  function serverApply(path, data) {
    // emulate the security rule: refuse an update that is older than the stored version
    const cur = backend.docs.get(path);
    if (data && cur && typeof cur.u === 'number' && typeof data.u === 'number' && data.u < cur.u) {
      backend.rejected++;
      const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied';
      throw e;
    }
    if (data === undefined) backend.docs.delete(path); else backend.docs.set(path, clone(data));
    notify(path, data, false);
  }
  function write(path, data) {
    notify(path, data, true);
    return new Promise((resolve, reject) => {
      const job = () => { try { serverApply(path, data); resolve(); } catch (e) { reject(e); } };
      if (client.online) setTimeout(job, 0); else queue.push(job);
    });
  }
  client.goOnline = async () => {
    client.online = true;
    while (queue.length) { queue.shift()(); await tick(); }
    // catch up: deliver current server state to listeners (as Firestore does on reconnect)
    for (const s of subs) {
      if (s.kind === 'coll') {
        const changes = [...backend.docs].filter(([k]) => parentOf(k) === s.path).map(([k, v]) => ({ type: 'modified', doc: snapDoc(k, v, false) }));
        s.cb({ docChanges: () => changes, metadata: { fromCache: false } });
      } else s.cb(snapDoc(s.path, backend.docs.get(s.path), false));
    }
  };
  const needOnline = () => { if (!client.online) { const e = new Error('offline'); e.code = 'unavailable'; throw e; } };

  const fs = {
    doc: (db, ...p) => ({ path: p.join('/') }),
    collection: (db, ...p) => ({ path: p.join('/') }),
    setDoc: (ref, data) => write(ref.path, data),
    deleteDoc: (ref) => write(ref.path, undefined),
    writeBatch: () => { const ops = []; return { set: (r, d) => ops.push([r.path, d]), delete: (r) => ops.push([r.path, undefined]), commit: () => Promise.all(ops.map(([p, d]) => write(p, d))) }; },
    getDocsFromServer: async (c) => { needOnline(); return { docs: [...backend.docs].filter(([k]) => parentOf(k) === c.path).map(([k, v]) => snapDoc(k, v, false)) }; },
    getDocs: async (c) => fs.getDocsFromServer(c),
    getDocFromServer: async (d) => { needOnline(); return snapDoc(d.path, backend.docs.get(d.path), false); },
    onSnapshot: (target, cb) => {
      const isColl = target.path.split('/').length % 2 === 1;
      const s = { kind: isColl ? 'coll' : 'doc', path: target.path, cb };
      subs.push(s);
      setTimeout(() => {
        if (isColl) cb({ docChanges: () => [...backend.docs].filter(([k]) => parentOf(k) === target.path).map(([k, v]) => ({ type: 'added', doc: snapDoc(k, v, false) })), metadata: { fromCache: false } });
        else cb(snapDoc(target.path, backend.docs.get(target.path), false));
      }, 0);
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
    },
    waitForPendingWrites: async () => { while (queue.length) await tick(); },
    terminate: async () => {}, clearIndexedDbPersistence: async () => {},
  };
  return { client, fs };
}

module.exports = { fakeIndexedDB, fakeBackend, fakeClient, tick, clone };
