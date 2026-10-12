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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('מסד הנתונים חסום — סגור לשוניות אחרות של האפליקציה'));
    });
  }
  function tx(stores, mode) {
    return db.transaction(stores, mode || 'readonly');
  }
  function reqP(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function done(t) {
    return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  }
  async function getAll(store) {
    return reqP(tx([store]).objectStore(store).getAll());
  }

  async function load() {
    db = await openDb();
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
  const DEVICE_META = ['cloudUid', 'cloudEmail', 'cloudName', 'cloudPhoto', 'cloudReady', 'lastSync', 'designV2', 'chat', 'chatShareData'];
  const SYNC_META = ['pendingDeletes', 'settingsDirty', 'activeDirty', 'activeUpdatedAt'];
  /** Values that end up inside HTML attributes must have a safe shape. */
  function safeRecord(store, r) {
    if (store === 'roles' && r && typeof r.color === 'string' && !/^#[0-9a-f]{3,8}$/i.test(r.color)) r.color = '#888888';
    return r;
  }

  async function rawPut(store, obj) {
    const t = tx([store], 'readwrite');
    t.objectStore(store).put(obj);
    return done(t);
  }
  async function rawDel(store, id) {
    const t = tx([store], 'readwrite');
    t.objectStore(store).delete(id);
    return done(t);
  }
  async function rawKv(key, value) {
    return rawPut('kv', { key, value });
  }
  async function saveAll() {
    const t = tx(STORES, 'readwrite');
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
    return done(t);
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
    const t = tx([...new Set(ops.map((o) => o.store).concat(['kv']))], 'readwrite');
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
        t.objectStore(op.store).put(obj);
        const pi = pend.findIndex((d) => d.store === op.store && d.id === obj.id);
        if (pi >= 0) { pend.splice(pi, 1); metaChanged = true; }
      } else if (op.del) {
        const i = arr.findIndex((x) => x.id === op.del);
        if (i < 0) continue;
        inverse.push({ store: op.store, put: clone(arr[i]) });
        arr.splice(i, 1);
        t.objectStore(op.store).delete(op.del);
        if (SYNC_STORES.includes(op.store)) { pend.push({ store: op.store, id: op.del, at: now }); metaChanged = true; }
      }
    }
    if (metaChanged) t.objectStore('kv').put({ key: 'meta', value: S.meta });
    await done(t);
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
    const t = tx([...new Set(ops.map((o) => o.store))], 'readwrite');
    for (const op of ops) {
      const arr = S[op.store];
      if (op.put) {
        const obj = safeRecord(op.store, Object.assign({}, op.put, { _syncedAt: op.put.updatedAt }));
        const i = arr.findIndex((x) => x.id === obj.id);
        if (i >= 0) arr[i] = obj; else arr.push(obj);
        t.objectStore(op.store).put(obj);
      } else if (op.del) {
        const i = arr.findIndex((x) => x.id === op.del);
        if (i >= 0) arr.splice(i, 1);
        t.objectStore(op.store).delete(op.del);
      }
    }
    await done(t);
    undoStack.length = 0; // remote changes invalidate local undo history
    emit({ type: 'data', remote: true, stores: ops.map((o) => o.store) });
  }
  /** After a successful push: remember which versions are in the cloud (silent). */
  async function markSynced(items, deletes) {
    const t = tx([...new Set(items.map((x) => x.store).concat(['kv']))], 'readwrite');
    for (const it of items) {
      const rec = S[it.store].find((x) => x.id === it.id);
      if (rec && rec.updatedAt === it.at) { rec._syncedAt = it.at; t.objectStore(it.store).put(rec); }
    }
    if (deletes && deletes.length) {
      S.meta.pendingDeletes = (S.meta.pendingDeletes || []).filter((d) => !deletes.some((x) => x.store === d.store && x.id === d.id && x.at === d.at));
    }
    t.objectStore('kv').put({ key: 'meta', value: S.meta });
    await done(t);
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
    return reqP(tx(['files']).objectStore('files').get(id));
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
      settings: Object.assign({}, S.settings, { ai: Object.assign({}, S.settings.ai, { apiKey: '' }), lock: Object.assign({}, S.settings.lock) }),
      meta: S.meta, activeShift: S.activeShift,
    };
    for (const s of LIST_STORES) out[s] = S[s];
    if (includeFiles) {
      const files = await getAll('files');
      out.files = [];
      for (const f of files) out.files.push({ id: f.id, name: f.name, type: f.type, data: await blobToDataUrl(f.blob) });
    }
    return out;
  }
  /** mode: 'replace' | 'merge' */
  async function importBackup(json, mode) {
    if (!json || json.app !== 'shiftpay') throw new Error('הקובץ אינו גיבוי של האפליקציה');
    if ((json.schemaVersion || 1) > SCHEMA_VERSION) throw new Error('הגיבוי נוצר בגרסה חדשה יותר של האפליקציה. עדכן קודם את האפליקציה.');
    const incoming = { settings: json.settings, meta: json.meta || {}, activeShift: json.activeShift || null };
    for (const s of LIST_STORES) incoming[s] = json[s] || [];
    runMigrations(incoming, json.schemaVersion || 1);
    const keepKey = S.settings && S.settings.ai ? S.settings.ai.apiKey : '';
    for (const s of SYNC_STORES) for (const x of incoming[s]) delete x._syncedAt; // that sync state belongs to the device that made the backup
    for (const r of incoming.roles) safeRecord('roles', r);
    if (mode === 'replace') {
      S.settings = mergeDeep(root.Defaults.defaultSettings(), incoming.settings || {});
      S.settings.ai.apiKey = keepKey;
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
      const t = tx(['files'], 'readwrite');
      t.objectStore('files').clear();
      await done(t);
    } else {
      for (const s of LIST_STORES) {
        const ids = new Set(S[s].map((x) => x.id));
        for (const x of incoming[s]) if (!ids.has(x.id)) S[s].push(x);
      }
    }
    if (!S.employers.length) S.employers = [root.Defaults.defaultEmployer()];
    await saveAll();
    for (const f of json.files || []) {
      try { await putFile(f.id, await dataUrlToBlob(f.data), f.name, f.type); } catch (e) { console.warn('file restore failed', e); }
    }
    undoStack.length = 0;
    emit({ type: 'restore', mode });
  }
  async function wipe() {
    const t = tx(STORES, 'readwrite');
    for (const s of STORES) t.objectStore(s).clear();
    await done(t);
    S.settings = root.Defaults.defaultSettings();
    S.meta = {}; S.activeShift = null;
    for (const s of LIST_STORES) S[s] = [];
    S.employers = [root.Defaults.defaultEmployer()];
    await saveAll();
    undoStack.length = 0;
    emit({ type: 'restore' });
  }

  root.Store = {
    S, load, on, apply, put, del, undo: undoAny, canUndo, setSettings, setMeta, setActive, find, clone,
    putFile, getFile, delFile, exportBackup, importBackup, wipe, saveAll, SCHEMA_VERSION, DB_NAME,
    SYNC_STORES, applyRemote, markSynced, dirtyRecords, touchAll, forgetSyncState, applyRemoteSettings, applyRemoteActive,
  };
})(typeof window !== 'undefined' ? window : globalThis);
