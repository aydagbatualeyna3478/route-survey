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

  /* numbering: main records 1,2,3…; INFO/BYPASS records hang under a parent as 16-1, 16-2…
     Archived records (archive only, not in the report) are left out and numbered A1, A2… by archivedRecords. */
  function ordered(sv) {
    const out = []; let n = 0;
    const mains = sv.records.filter(r => !r.parentId);
    for (const m of mains) {
      if (m.archived) continue;
      n += 1; m.no = String(n); out.push(m);
      let k = 0;
      for (const c of sv.records.filter(r => r.parentId === m.id && !r.archived)) { k += 1; c.no = `${n}-${k}`; out.push(c); }
    }
    return out;
  }
  function archived(sv) {   // archived mains with their INFO/BYPASS, then INFO/BYPASS archived on their own
    const out = []; let a = 0;
    for (const m of sv.records.filter(r => !r.parentId)) {
      if (m.archived) {
        a += 1; m.no = `A${a}`; out.push(m); let k = 0;
        for (const c of sv.records.filter(r => r.parentId === m.id)) { k += 1; c.no = `A${a}-${k}`; out.push(c); }
      } else for (const c of sv.records.filter(r => r.parentId === m.id && r.archived)) { a += 1; c.no = `A${a}`; c.solo = true; out.push(c); }
    }
    return out;
  }

  /* KM is worked out once the obstacles and their order are final (when the report is made), not while
     photographing. The main route runs through the main obstacles' photo positions in list order; an obstacle
     without a position takes the KM before it; INFO takes its obstacle's KM; a BYPASS continues from its
     obstacle along the bypass, and takes the KM of the main route where it rejoins it (within 400 m).
     A KM typed by hand (kmManual) always wins. Returns the main route line for the map. */
  function routeKm(sv) {
    const recs = ordered(sv), line = []; let cum = 0, prev = null;
    for (const r of recs) {
      if (r.parentId) continue;
      if (r.latDec != null) { const p = [r.latDec, r.lonDec]; if (prev) cum += Geo.hav(prev, p); prev = p; line.push([p[0], p[1], cum]); }
      r.kmAuto = cum;
    }
    const k = line.length ? Math.cos(line[0][0] * Math.PI / 180) : 1, M = 111320;
    const onMain = (lat, lon) => {   // KM (m) of the nearest place on the main route, if within 400 m
      let best = null;
      for (let j = 0; j + 1 < line.length; j++) {
        const A = line[j], B = line[j + 1], ax = A[1] * k * M, ay = A[0] * M, bx = B[1] * k * M, by = B[0] * M, px = lon * k * M, py = lat * M;
        const L = (bx - ax) ** 2 + (by - ay) ** 2, t = L ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L)) : 0;
        const off = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
        if (off < 400 && (!best || off < best.off)) best = { off, km: A[2] + t * (B[2] - A[2]) };
      }
      return best && best.km;
    };
    for (const m of recs.filter(r => !r.parentId)) {
      let bcum = m.kmAuto, bprev = m.latDec != null ? [m.latDec, m.lonDec] : null;
      for (const c of recs.filter(r => r.parentId === m.id)) {
        if (c.flag !== 'BYPASS' || c.latDec == null) { c.kmAuto = c.flag === 'BYPASS' ? bcum : m.kmAuto; continue; }
        const p = [c.latDec, c.lonDec]; if (bprev) bcum += Geo.hav(bprev, p); bprev = p;
        const back = onMain(p[0], p[1]);
        c.kmAuto = back != null && back < bcum ? back : bcum;
      }
    }
    for (const r of recs) r.km = r.kmManual != null ? r.kmManual : Math.round(r.kmAuto) / 1000;
    return line.map(x => [x[0], x[1]]);
  }
  g.archivedRecords = archived; g.routeKm = routeKm;
  /* photo annotations (arrows, notes, lines) drawn over a 4:3 photo box; shared by the app and the report */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function annHtml(items, sel) {
    let h = '', lines = '';
    items.forEach((o, i) => {
      if (o.k === 'arrow') h += `<div class="ov ${i === sel ? 'sel' : ''}" data-i="${i}" style="left:${o.x * 100}%;top:${o.y * 100}%;width:${o.w * 100}%;height:${o.h * 100}%;transform:rotate(${o.rot || 0}deg);touch-action:none"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block"><polygon points="50,0 100,50 75,50 75,100 25,100 25,50 0,50" fill="#FFFF00" stroke="#8a7a00" stroke-width="2"/></svg></div>`;
      if (o.k === 'text') h += `<div class="ov ${i === sel ? 'sel' : ''}" data-i="${i}" style="left:${o.x * 100}%;top:${o.y * 100}%;width:${o.w * 100}%;border:.45cqw solid #FF0000;background:rgba(255,255,255,.9);color:#FF0000;font-weight:700;font-size:3.7cqw;line-height:1.15;padding:.6cqw 1cqw;touch-action:none">${esc(o.text) || 'Not'}</div>`;
      if (o.k === 'line') {
        lines += `<line x1="${o.x1 * 100}" y1="${o.y1 * 75}" x2="${o.x2 * 100}" y2="${o.y2 * 75}" stroke="#FF0000" stroke-width="0.8" marker-end="url(#ah)"/><line data-i="${i}" x1="${o.x1 * 100}" y1="${o.y1 * 75}" x2="${o.x2 * 100}" y2="${o.y2 * 75}" stroke="transparent" stroke-width="7" style="pointer-events:stroke;touch-action:none"/>`;
        if (i === sel) h += `<span class="hd" data-i="${i}" data-h="1" style="left:${o.x1 * 100}%;top:${o.y1 * 100}%"></span><span class="hd" data-i="${i}" data-h="2" style="left:${o.x2 * 100}%;top:${o.y2 * 100}%"></span>`;
      }
    });
    return (lines ? `<svg viewBox="0 0 100 75" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#FF0000"/></marker></defs>${lines}</svg>` : '') + h;
  }
  g.annHtml = annHtml;
  /* logo slots: 1 company (kept in settings) · 2 client 1 · 3 client 2 · 4 owner; each placed in a page corner */
  const LOGO_POS = { company: 'tl', client1: 'tr', client2: 'br', owner: 'bl' };
  function logosOf(sv) {
    const l = sv.logos || {};
    const ids = { client1: l.client1 || l.client, client2: l.client2 || l.partner, owner: l.owner };
    const others = ['client1', 'client2', 'owner'].filter(k => ids[k]);
    const cover = Object.assign({ tl: ['company'], tr: others.slice(0, 1), mid: ['company'], row: others.slice(0, 2) }, sv.coverLogos || {});
    return { ids, pos: Object.assign({}, LOGO_POS, sv.logoPos || {}), cover };
  }
  g.DB = DB; g.Geo = Geo; g.orderedRecords = ordered; g.logosOf = logosOf;
})(window);
