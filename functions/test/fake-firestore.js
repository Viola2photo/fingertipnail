// 測試用的簡易記憶體 Firestore，只實作 API handler 用到的部分
const ARRAY_UNION = Symbol('arrayUnion');

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function applyPatch(target, patch) {
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value && value[ARRAY_UNION]) out[key] = [...(out[key] || []), ...clone(value.items)];
    else out[key] = clone(value);
  }
  return out;
}

function createFakeDb() {
  const store = new Map();
  let autoId = 0;

  const docRef = (path) => ({
    id: path.split('/').pop(),
    path,
    async get() { return snapshot(path); },
    async set(data, opts) { write(path, data, opts); },
    async update(data) { if (!store.has(path)) throw new Error(`no doc ${path}`); write(path, data, { merge: true }); },
    collection: (name) => collectionRef(`${path}/${name}`),
  });

  const snapshot = (path) => ({
    id: path.split('/').pop(),
    exists: store.has(path),
    data: () => clone(store.get(path)),
  });

  const write = (path, data, opts) => {
    const base = opts && opts.merge ? store.get(path) || {} : {};
    store.set(path, applyPatch(base, data));
  };

  const collectionRef = (path) => ({
    doc: (id) => docRef(`${path}/${id || `auto${++autoId}`}`),
    where: (field, op, value) => ({
      limit: () => ({
        async get() {
          const docs = [...store.keys()]
            .filter((k) => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1)
            .filter((k) => { const v = field.split('.').reduce((o, f) => (o ? o[f] : undefined), store.get(k)); return op === 'in' ? value.includes(v) : v === value; })
            .map((k) => snapshot(k));
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
  });

  const writer = () => {
    const ops = [];
    return {
      get: (ref) => ref.get(),
      set: (ref, data, opts) => { ops.push(() => write(ref.path, data, opts)); },
      update: (ref, data) => { ops.push(() => { if (!store.has(ref.path)) throw new Error(`no doc ${ref.path}`); write(ref.path, data, { merge: true }); }); },
      commit: async () => ops.forEach((op) => op()),
    };
  };

  return {
    store,
    collection: collectionRef,
    batch: writer,
    async runTransaction(fn) { const tx = writer(); const r = await fn(tx); await tx.commit(); return r; },
  };
}

const fieldValue = { arrayUnion: (...items) => ({ [ARRAY_UNION]: true, items }) };

module.exports = { createFakeDb, fieldValue };
