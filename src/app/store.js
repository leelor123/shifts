/* ============================================================
 * store.js — IndexedDB persistence, in-memory state, undo,
 * data migrations between app versions, backup & restore.
 *
 * Data lives only on this device (per origin). Keep the app at a
 * fixed HTTPS address so updates keep reading the same database.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;

  const DB_NAME = 'shiftpay';
  const DB_VERSION = 1; // bump only to add object stores / indexes
  const SCHEMA_VERSION = 1; // bump when the shape of saved records changes (see MIGRATIONS)
  const STORES = ['kv', 'employers', 'roles', 'shifts', 'entries', 'templates', 'dayRules', 'payslips', 'files', 'notifications', 'gaps'];
  const LIST_STORES = STORES.filter((s) => s !== 'kv' && s !== 'files');
  // stores mirrored to the cloud (notifications are derived per device; files stay on the phone)
  const SYNC_STORES = ['employers', 'roles', 'shifts', 'entries', 'templates', 'dayRules', 'payslips', 'gaps'];

  /* ---------------- migrations ----------------
   * MIGRATIONS[n] upgrades data from schema n-1 to n. They run on load
   * and on restore of an older backup. Never edit an old migration —
   * add a new one. */
  const MIGRATIONS = {
    // 2: (S) => { for (const s of S.shifts) s.newField = s.newField ?? null; },
  };

  let db = null;
  // true when this browser can't keep a local database (some private modes, a broken storage engine):
  // the app then runs from memory and the cloud account keeps the data
  let memoryOnly = false;
  const S = { settings: null, meta: {}, activeShift: null };
  LIST_STORES.forEach((s) => (S[s] = []));
  const listeners = new Set();
  const undoStack = [];

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const name of STORES) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' });
        }
      };
      req.onsuccess = () => {
        const d = req.result;
        // the browser may drop the connection (iPhones do when the app goes to the background): reopen on next use
        d.onclose = () => { if (db === d) db = null; };
        d.onversionchange = () => { d.close(); if (db === d) db = null; };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('מסד הנתונים חסום — סגור לשוניות אחרות של האפליקציה'));
    });
  }
  function done(t) {
    return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('transaction aborted')); });
  }
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const STORAGE_LOST = ['UnknownError', 'InvalidStateError', 'TransactionInactiveError', 'AbortError', 'QuotaExceededError', 'NotFoundError', 'VersionError', 'Error'];
  /**
   * Runs one transaction: body(t) queues the reads/writes and run() waits for the commit.
   * A lost or broken connection is reopened and the transaction tried again (bodies only write
   * the current in-memory state, so repeating one is safe). In memory-only mode body gets null.
   */
  async function run(stores, mode, body) {
    for (let attempt = 0; ; attempt++) {
      if (memoryOnly) return body(null);
      try {
        if (!db) db = await openDb();
        const t = db.transaction(stores, mode || 'readonly');
        const out = body(t);
        await done(t);
        return out;
      } catch (e) {
        try { if (db) db.close(); } catch (x) { /* already closed */ }
        db = null;
        if (attempt >= 2) {
          // the phone's storage stopped working (lost connection, storage full): carry on from memory for
          // this session, so nothing freezes; the cloud copy keeps the data, and the app says so once
          if (!e || !e.name || STORAGE_LOST.includes(e.name)) {
            console.warn('local database lost, continuing from memory', e);
            memoryOnly = true;
            db = null;
            emit({ type: 'storage-lost' });
            return body(null);
          }
          throw e;
        }
        await pause(120 * (attempt + 1));
      }
    }
  }
  /** Reads every record of a store. */
  async function getAll(store) {
    let req = null;
    await run([store], 'readonly', (t) => { if (t) req = t.objectStore(store).getAll(); });
    return (req && req.result) || [];
  }

  async function load() {
    try {
      db = await openDb();
    } catch (e) {
      // no local database in this browser: keep going from memory (the cloud account keeps the data)
      console.warn('local database unavailable, running from memory', e);
      memoryOnly = true;
      db = null;
    }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* optional */ }
    const kv = await getAll('kv');
    const kvMap = Object.fromEntries(kv.map((x) => [x.key, x.value]));
    S.settings = mergeDeep(root.Defaults.defaultSettings(), kvMap.settings || {});
    S.meta = kvMap.meta || {};
    S.activeShift = kvMap.activeShift || null;
    for (const s of LIST_STORES) S[s] = await getAll(s);
    S.roles.forEach((r) => safeRecord('roles', r));
    // first run: default employer
    if (!S.employers.length) {
      S.employers = [root.Defaults.defaultEmployer()];
      await rawPut('employers', S.employers[0]);
    } else {
      S.employers = S.employers.map((e) => Object.assign(root.Defaults.defaultEmployer(e.id), e));
    }
    // every synced record needs a version; records without one are treated as the oldest possible
    for (const st of SYNC_STORES) for (const r of S[st]) if (!r.updatedAt) { r.updatedAt = 1; await rawPut(st, r); }
    const from = +(kvMap.schemaVersion || SCHEMA_VERSION);
    if (from < SCHEMA_VERSION) {
      runMigrations(S, from);
      await saveAll();
    }
    await rawKv('schemaVersion', SCHEMA_VERSION);
    return S;
  }
  function runMigrations(state, from) {
    for (let v = from + 1; v <= SCHEMA_VERSION; v++) if (MIGRATIONS[v]) MIGRATIONS[v](state);
  }

  function mergeDeep(base, over) {
    if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k of Object.keys(over)) {
      if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) && typeof over[k] === 'object' && over[k] !== null && !Array.isArray(over[k])) out[k] = mergeDeep(base[k], over[k]);
      else out[k] = over[k];
    }
    return out;
  }

  // meta that describes this phone (account link, sync progress), never taken from a backup
  const DEVICE_META = ['cloudUid', 'cloudEmail', 'cloudName', 'cloudPhoto', 'cloudReady', 'lastSync', 'designV2', 'chat', 'chatShareData',
    'installId', 'statsSentAt', 'activeDays', 'firstActiveDay', 'lastActiveDay',
    // Shaati Plus is checked on each phone (Google Play / the purchase code): never taken from a backup file
    'plus', 'plusInst', 'plusPreview', 'plusSeen', 'plusTrial', 'plusTrialEnd', 'plusNudge', 'plusUse', 'plusWall'];
  const SYNC_META = ['pendingDeletes', 'settingsDirty', 'activeDirty', 'activeUpdatedAt'];
  /** Values that end up inside HTML attributes must have a safe shape. */
  function safeRecord(store, r) {
    if (store === 'roles' && r && typeof r.color === 'string' && !/^#[0-9a-f]{3,8}$/i.test(r.color)) r.color = '#888888';
    return r;
  }

  async function rawPut(store, obj) {
    return run([store], 'readwrite', (t) => { if (t) t.objectStore(store).put(obj); });
  }
  async function rawDel(store, id) {
    return run([store], 'readwrite', (t) => { if (t) t.objectStore(store).delete(id); });
  }
  async function rawKv(key, value) {
    return rawPut('kv', { key, value });
  }
  async function saveAll() {
    return run(STORES, 'readwrite', (t) => {
      if (!t) return;
      for (const s of LIST_STORES) {
        const os = t.objectStore(s);
        os.clear();
        for (const x of S[s]) os.put(x);
      }
      const kv = t.objectStore('kv');
      kv.put({ key: 'settings', value: S.settings });
      kv.put({ key: 'meta', value: S.meta });
      kv.put({ key: 'activeShift', value: S.activeShift });
      kv.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }

  function emit(what) {
    for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } }
  }
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const find = (store, id) => S[store].find((x) => x.id === id);

  /**
   * Apply a group of operations as one undoable step.
   * ops: [{store, put: obj} | {store, del: id}]
   */
  async function apply(ops, label, opts) {
    opts = opts || {};
    const inverse = [];
    const now = Date.now();
    const writes = []; // [store, record] or [store, null, id] for a delete
    const pend = S.meta.pendingDeletes || (S.meta.pendingDeletes = []);
    let metaChanged = false;
    for (const op of ops) {
      const arr = S[op.store];
      if (op.put) {
        const obj = op.put;
        if (!obj.id) obj.id = U.uid();
        if (!obj.createdAt) obj.createdAt = now;
        obj.updatedAt = now;
        const i = arr.findIndex((x) => x.id === obj.id);
        inverse.push(i >= 0 ? { store: op.store, put: clone(arr[i]) } : { store: op.store, del: obj.id });
        if (i >= 0) arr[i] = obj; else arr.push(obj);
        writes.push([op.store, obj]);
        const pi = pend.findIndex((d) => d.store === op.store && d.id === obj.id);
        if (pi >= 0) { pend.splice(pi, 1); metaChanged = true; }
      } else if (op.del) {
        const i = arr.findIndex((x) => x.id === op.del);
        if (i < 0) continue;
        inverse.push({ store: op.store, put: clone(arr[i]) });
        arr.splice(i, 1);
        writes.push([op.store, null, op.del]);
        if (SYNC_STORES.includes(op.store)) { pend.push({ store: op.store, id: op.del, at: now }); metaChanged = true; }
      }
    }
    await run([...new Set(ops.map((o) => o.store).concat(['kv']))], 'readwrite', (t) => {
      if (!t) return;
      for (const [st, rec, id] of writes) { if (rec) t.objectStore(st).put(rec); else t.objectStore(st).delete(id); }
      if (metaChanged) t.objectStore('kv').put({ key: 'meta', value: S.meta });
    });
    if (label && opts.undo !== false) {
      undoStack.push({ label, ops: inverse.reverse() });
      if (undoStack.length > 30) undoStack.shift();
    }
    emit({ type: 'data', stores: ops.map((o) => o.store) });
    return label && opts.undo !== false;
  }

  /* ---------------- cloud sync hooks ----------------
   * Records carry updatedAt (set on every local change) and _syncedAt
   * (the version known to be in the cloud). A record is "dirty" when they differ.
   * Deletions are queued in meta.pendingDeletes and sent as tombstones. */
  async function applyRemote(ops) {
    if (!ops.length) return;
    const writes = [];
    for (const op of ops) {
      const arr = S[op.store];
      if (op.put) {
        const obj = safeRecord(op.store, Object.assign({}, op.put, { _syncedAt: op.put.updatedAt }));
        const i = arr.findIndex((x) => x.id === obj.id);
        if (i >= 0) arr[i] = obj; else arr.push(obj);
        writes.push([op.store, obj]);
      } else if (op.del) {
        const i = arr.findIndex((x) => x.id === op.del);
        if (i >= 0) arr.splice(i, 1);
        writes.push([op.store, null, op.del]);
      }
    }
    await run([...new Set(ops.map((o) => o.store))], 'readwrite', (t) => {
      if (!t) return;
      for (const [st, rec, id] of writes) { if (rec) t.objectStore(st).put(rec); else t.objectStore(st).delete(id); }
    });
    undoStack.length = 0; // remote changes invalidate local undo history
    emit({ type: 'data', remote: true, stores: ops.map((o) => o.store) });
  }
  /** After a successful push: remember which versions are in the cloud (silent). */
  async function markSynced(items, deletes) {
    const recs = [];
    for (const it of items) {
      const rec = S[it.store].find((x) => x.id === it.id);
      if (rec && rec.updatedAt === it.at) { rec._syncedAt = it.at; recs.push([it.store, rec]); }
    }
    if (deletes && deletes.length) {
      S.meta.pendingDeletes = (S.meta.pendingDeletes || []).filter((d) => !deletes.some((x) => x.store === d.store && x.id === d.id && x.at === d.at));
    }
    await run([...new Set(items.map((x) => x.store).concat(['kv']))], 'readwrite', (t) => {
      if (!t) return;
      for (const [st, rec] of recs) t.objectStore(st).put(rec);
      t.objectStore('kv').put({ key: 'meta', value: S.meta });
    });
  }
  function dirtyRecords() {
    const out = [];
    for (const st of SYNC_STORES) for (const r of S[st]) if ((r.updatedAt || 0) !== r._syncedAt) out.push({ store: st, rec: r });
    return out;
  }
  /** This phone has never synced with the signed-in account: offer every local record to it. */
  async function forgetSyncState() {
    for (const st of SYNC_STORES) for (const r of S[st]) delete r._syncedAt;
    await saveAll();
  }
  /** Mark every local record dirty with a fresh timestamp (used to make the cloud match this device). */
  async function touchAll() {
    const now = Date.now();
    for (const st of SYNC_STORES) for (const r of S[st]) { r.updatedAt = now; delete r._syncedAt; }
    S.settings._updatedAt = now;
    S.meta.settingsDirty = true;
    await saveAll();
  }
  async function applyRemoteSettings(remote, localOnlyKeys) {
    const keep = {};
    for (const k of localOnlyKeys) keep[k] = S.settings[k];
    S.settings = mergeDeep(root.Defaults.defaultSettings(), remote);
    for (const k of localOnlyKeys) if (keep[k] !== undefined) S.settings[k] = keep[k];
    S.meta.settingsDirty = false;
    await rawKv('settings', S.settings);
    await rawKv('meta', S.meta);
    emit({ type: 'settings', remote: true });
  }
  async function applyRemoteActive(a, u) {
    S.activeShift = a;
    S.meta.activeUpdatedAt = u;
    S.meta.activeDirty = false;
    await rawKv('activeShift', a);
    await rawKv('meta', S.meta);
    emit({ type: 'active', remote: true });
  }
  const put = (store, obj, label, opts) => apply([{ store, put: obj }], label, opts);
  const del = (store, id, label) => apply([{ store, del: id }], label);
  async function undo() {
    const step = undoStack.pop();
    if (!step) return null;
    await apply(step.ops, null, { undo: false });
    return step.label;
  }
  function canUndo() { return undoStack.length > 0; }

  async function setSettings(patchFn, label) {
    const before = clone(S.settings);
    patchFn(S.settings);
    S.settings._updatedAt = Date.now();
    S.meta.settingsDirty = true;
    await rawKv('meta', S.meta);
    await rawKv('settings', S.settings);
    if (label) {
      undoStack.push({ label, ops: [], settings: before });
    }
    emit({ type: 'settings' });
  }
  async function setMeta(patch) {
    Object.assign(S.meta, patch);
    await rawKv('meta', S.meta);
  }
  async function setActive(a) {
    S.activeShift = a;
    S.meta.activeUpdatedAt = Date.now();
    S.meta.activeDirty = true;
    await rawKv('meta', S.meta);
    await rawKv('activeShift', a);
    emit({ type: 'active' });
  }
  // undo of a settings step
  const _undo = undo;
  async function undoAny() {
    const step = undoStack[undoStack.length - 1];
    if (step && step.settings) {
      undoStack.pop();
      S.settings = step.settings;
      S.settings._updatedAt = Date.now();
      S.meta.settingsDirty = true;
      await rawKv('meta', S.meta);
      await rawKv('settings', S.settings);
      emit({ type: 'settings' });
      return step.label;
    }
    return _undo();
  }

  /* ---------------- files (payslip images / PDFs) ---------------- */
  async function putFile(id, blob, name, type) {
    await rawPut('files', { id, blob, name, type, at: Date.now() });
  }
  async function getFile(id) {
    let req = null;
    await run(['files'], 'readonly', (t) => { if (t) req = t.objectStore('files').get(id); });
    return req ? req.result : undefined;
  }
  async function delFile(id) { return rawDel('files', id); }

  /* ---------------- backup & restore ---------------- */
  function blobToDataUrl(blob) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  }
  async function dataUrlToBlob(url) {
    const r = await fetch(url);
    return r.blob();
  }
  async function exportBackup(includeFiles) {
    const out = {
      app: 'shiftpay', schemaVersion: SCHEMA_VERSION, appVersion: root.APP_VERSION, exportedAt: new Date().toISOString(),
      // keys stay out of files: the AI key, and the Shaati Plus purchase code (a shared backup would give it away)
      settings: Object.assign({}, S.settings, { ai: Object.assign({}, S.settings.ai, { apiKey: '' }), lock: Object.assign({}, S.settings.lock), plusKey: '' }),
      meta: Object.fromEntries(Object.entries(S.meta).filter(([k]) => !/^plus/.test(k))), activeShift: S.activeShift,
    };
    for (const s of LIST_STORES) out[s] = S[s];
    if (includeFiles) {
      const files = await getAll('files');
      out.files = [];
      for (const f of files) out.files.push({ id: f.id, name: f.name, type: f.type, data: await blobToDataUrl(f.blob) });
    }
    return out;
  }
  /*
   * A backup is a file from outside the app (maybe old, maybe edited by hand, maybe damaged), so it is
   * cleaned before anything is replaced: lists must be lists of records with an id, shifts and entries
   * must make sense, pay rates must be numbers, and there is a limit to how much a file may hold.
   * Then the whole thing is calculated once on the side: a file the app can't calculate is refused and
   * the data on the phone stays as it was.
   */
  const MAX_RECORDS = 50000;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const x of list) {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id || x.id.length > 120 || seen.has(x.id)) continue;
      seen.add(x.id);
      out.push(x);
      if (out.length >= MAX_RECORDS) break;
    }
    return out;
  }
  function cleanIncoming(inc) {
    const E = root.Engine;
    inc.settings = isObj(inc.settings) ? inc.settings : {};
    inc.meta = isObj(inc.meta) ? inc.meta : {};
    if (!isObj(inc.activeShift) || !Number.isFinite(inc.activeShift.start) || inc.activeShift.start > Date.now() + 60000) inc.activeShift = null;
    for (const s of LIST_STORES) inc[s] = cleanList(inc[s]);
    inc.shifts = inc.shifts.filter((x) => E.validShift(x));
    inc.entries = inc.entries.filter((x) => E.validEntry(x));
    const okDay = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
    inc.roles = inc.roles.filter((r) => {
      // a role without usable rates is kept with rate 0, so it shows up (as below the minimum) and can be fixed
      r.rates = (Array.isArray(r.rates) ? r.rates : []).filter((x) => isObj(x) && okDay(x.from) && Number.isFinite(+x.rate) && +x.rate >= 0 && +x.rate < 10000).map((x) => Object.assign({}, x, { rate: +x.rate }));
      if (typeof r.name !== 'string') r.name = String(r.name == null ? '' : r.name);
      r.name = r.name.slice(0, 60);
      if (!r.rates.length) r.rates = [{ from: '2000-01-01', rate: 0 }];
      return true;
    });
    inc.employers = inc.employers.map((e) => Object.assign(root.Defaults.defaultEmployer(e.id), e, { name: String(e.name == null ? '' : e.name).slice(0, 60) }));
    return inc;
  }
  /** mode: 'replace' | 'merge' */
  async function importBackup(json, mode) {
    if (!isObj(json) || json.app !== 'shiftpay') throw new Error('הקובץ אינו גיבוי של האפליקציה');
    if ((+json.schemaVersion || 1) > SCHEMA_VERSION) throw new Error('הגיבוי נוצר בגרסה חדשה יותר של האפליקציה. עדכן קודם את האפליקציה.');
    const incoming = { settings: json.settings, meta: json.meta || {}, activeShift: json.activeShift || null };
    for (const s of LIST_STORES) incoming[s] = json[s] || [];
    cleanIncoming(incoming);
    runMigrations(incoming, +json.schemaVersion || 1);
    // calculate it once on the side; a file that can't be calculated is refused before anything changes
    try {
      const trial = root.Engine.buildModel({
        settings: mergeDeep(root.Defaults.defaultSettings(), incoming.settings), employers: incoming.employers.length ? incoming.employers : [root.Defaults.defaultEmployer()],
        roles: incoming.roles, dayRules: incoming.dayRules, shifts: incoming.shifts, entries: incoming.entries,
      });
      root.Engine.totals(trial, '2000-01-01', '2100-12-31');
    } catch (e) {
      console.warn('backup refused', e);
      throw new Error('הקובץ פגום ואי אפשר לשחזר ממנו. הנתונים בטלפון לא השתנו.');
    }
    const keepKey = S.settings && S.settings.ai ? S.settings.ai.apiKey : '';
    const keepPlus = (S.settings && S.settings.plusKey) || '';
    for (const s of SYNC_STORES) for (const x of incoming[s]) delete x._syncedAt; // that sync state belongs to the device that made the backup
    for (const r of incoming.roles) safeRecord('roles', r);
    if (mode === 'replace') {
      S.settings = mergeDeep(root.Defaults.defaultSettings(), incoming.settings || {});
      S.settings.ai.apiKey = keepKey;
      S.settings.plusKey = keepPlus;
      // keep this phone's account link and sync bookkeeping; take everything else from the backup
      const device = {};
      for (const k of DEVICE_META) if (S.meta[k] !== undefined) device[k] = S.meta[k];
      S.meta = Object.assign({}, incoming.meta);
      for (const k of DEVICE_META.concat(SYNC_META)) delete S.meta[k];
      Object.assign(S.meta, device);
      S.activeShift = incoming.activeShift;
      S.meta.activeUpdatedAt = Date.now();
      S.meta.activeDirty = true;
      for (const s of LIST_STORES) S[s] = incoming[s];
      await run(['files'], 'readwrite', (t) => { if (t) t.objectStore('files').clear(); });
    } else {
      for (const s of LIST_STORES) {
        const ids = new Set(S[s].map((x) => x.id));
        for (const x of incoming[s]) if (!ids.has(x.id)) S[s].push(x);
      }
    }
    if (!S.employers.length) S.employers = [root.Defaults.defaultEmployer()];
    // a backup without any job still leaves something to start a shift with (at the legal minimum)
    if (!S.roles.some((r) => !r.archived)) {
      let rate = 0;
      try { rate = root.Engine.minWageFor(S.settings, root.U.todayKey()).hourly || 0; } catch (e) { /* keep 0 */ }
      S.roles.push({ id: 'r_' + root.U.uid(), name: 'העבודה שלי', color: root.Defaults.ROLE_COLORS[0], employerId: S.employers[0].id, rates: [{ from: '2000-01-01', rate }], archived: false });
    }
    await saveAll();
    for (const f of json.files || []) {
      try { await putFile(f.id, await dataUrlToBlob(f.data), f.name, f.type); } catch (e) { console.warn('file restore failed', e); }
    }
    undoStack.length = 0;
    emit({ type: 'restore', mode });
  }
  async function wipe() {
    await run(STORES, 'readwrite', (t) => { if (t) for (const s of STORES) t.objectStore(s).clear(); });
    S.settings = root.Defaults.defaultSettings();
    S.meta = {}; S.activeShift = null;
    for (const s of LIST_STORES) S[s] = [];
    S.employers = [root.Defaults.defaultEmployer()];
    await saveAll();
    undoStack.length = 0;
    emit({ type: 'restore' });
  }

  root.Store = {
    S, load, on, apply, isMemoryOnly: () => memoryOnly, put, del, undo: undoAny, canUndo, setSettings, setMeta, setActive, find, clone,
    putFile, getFile, delFile, exportBackup, importBackup, wipe, saveAll, SCHEMA_VERSION, DB_NAME,
    SYNC_STORES, applyRemote, markSynced, dirtyRecords, touchAll, forgetSyncState, applyRemoteSettings, applyRemoteActive,
  };
})(typeof window !== 'undefined' ? window : globalThis);
