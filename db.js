/* Local storage for the survey app: everything stays on the device (IndexedDB), works offline. */
(function (g) {
  const NAME = 'route-survey', VER = 1;
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('surveys')) d.createObjectStore('surveys', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store);
      const q = fn(s);
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const DB = {
    uid,
    listSurveys: () => tx('surveys', 'readonly', s => s.getAll()),
    getSurvey: id => tx('surveys', 'readonly', s => s.get(id)),
    putSurvey: sv => tx('surveys', 'readwrite', s => s.put(sv)),
    delSurvey: id => tx('surveys', 'readwrite', s => s.delete(id)),
    getBlob: id => id ? tx('blobs', 'readonly', s => s.get(id)) : Promise.resolve(null),
    putBlob: async blob => { const id = uid(); await tx('blobs', 'readwrite', s => s.put(blob, id)); return id; },
    delBlob: id => id ? tx('blobs', 'readwrite', s => s.delete(id)) : Promise.resolve(),
    getSetting: k => tx('settings', 'readonly', s => s.get(k)),
    setSetting: (k, v) => tx('settings', 'readwrite', s => s.put(v, k)),
    async blobUrl(id) { const b = await DB.getBlob(id); return b ? URL.createObjectURL(b) : null; },
  };

  /* geo helpers shared by the app and the report */
  const Geo = {
    hav(a, b) { // metres between [lat, lon] pairs
      const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
      const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    },
    dms(v, isLat) { // 40.207833 -> "40 12 28.2 N"
      const hemi = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W'); v = Math.abs(v);
      let d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 600) / 10;
      if (s >= 60) { s = 0; m += 1; } if (m >= 60) { m = 0; d += 1; }
      return `${d} ${m} ${s.toFixed(1)} ${hemi}`;
    },
  };

  /* numbering: main records 1,2,3…; INFO/BYPASS records hang under a parent as 16-1, 16-2… */
  function ordered(sv) {
    const out = []; let n = 0;
    const mains = sv.records.filter(r => !r.parentId);
    for (const m of mains) {
      n += 1; m.no = String(n); out.push(m);
      let k = 0;
      for (const c of sv.records.filter(r => r.parentId === m.id)) { k += 1; c.no = `${n}-${k}`; out.push(c); }
    }
    return out;
  }
  /* logo slots: 1 company (kept in settings) · 2 client 1 · 3 client 2 · 4 owner; each placed in a page corner */
  const LOGO_POS = { company: 'tl', client1: 'tr', client2: 'br', owner: 'bl' };
  function logosOf(sv) {
    const l = sv.logos || {};
    return { ids: { client1: l.client1 || l.client, client2: l.client2 || l.partner, owner: l.owner }, pos: Object.assign({}, LOGO_POS, sv.logoPos || {}) };
  }
  g.DB = DB; g.Geo = Geo; g.orderedRecords = ordered; g.logosOf = logosOf;
})(window);
