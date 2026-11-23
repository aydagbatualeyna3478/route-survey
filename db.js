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
    /* working copy of a photo for screens and the PDF (blob 'md:<id>', ≤1600 px): the stored photo stays in full quality
       for close inspection and backups; small photos are used as they are */
    viewBlob: async (id, max = 1600) => {
      if (!id) return null;
      const k = 'md:' + id; let b = await DB.getBlob(k); if (b) return b;
      const full = await DB.getBlob(id); if (!full || full.size < 1200000 || !/^image\/(jpeg|png|webp)/.test(full.type || 'image/jpeg')) return full;
      try {
        const bm = await createImageBitmap(full, { resizeWidth: max, resizeQuality: 'high' });
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); if (bm.close) bm.close();
        b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.84)); c.width = c.height = 0;
        if (b) { await DB.putBlobAt(k, b); return b; }
      } catch (e) { /* decoder could not resize */ }
      return full;
    },
    /* thumbnails ('th:') and screen copies ('md:') can always be made again from the photos: count / clear them */
    cacheInfo: async () => { const keys = (await tx('blobs', 'readonly', s => s.getAllKeys())) || []; return { all: keys.length, cache: keys.filter(k => /^(th|md):/.test(k)).length }; },
    clearCaches: async () => { const keys = ((await tx('blobs', 'readonly', s => s.getAllKeys())) || []).filter(k => /^(th|md):/.test(k)); await tx('blobs', 'readwrite', s => { keys.forEach(k => s.delete(k)); }); return keys.length; },
    putBlobAt: async (id, blob) => { await tx('blobs', 'readwrite', s => s.put(blob, id)); return id; },
    delBlob: id => id ? tx('blobs', 'readwrite', s => { s.delete('th:' + id); s.delete('md:' + id); return s.delete(id); }) : Promise.resolve(),   // a photo's thumbnail and working copy go with it
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

  /* Road route and road KM (reports): the obstacles in report order (bypasses included, INFO left out) are joined by the
     driving route of OSRM (OpenStreetMap roads, no key); the vehicle is put on the nearest road at every obstacle.
     Returns { line: [[lat, lon]…], cum: { recordId: metres from the first obstacle } }, kept per survey on this device
     and asked again only when the points change. Without internet: null (the straight-line KM stays). */
  async function roadRoute(sv, recs, onBusy) {
    const wp = [];
    for (const r of recs) {
      if (r.latDec == null || r.flag === 'INFO') continue;
      const p = [+r.latDec.toFixed(5), +r.lonDec.toFixed(5)], q = wp[wp.length - 1];
      if (q && q.p[0] === p[0] && q.p[1] === p[1]) q.ids.push(r.id); else wp.push({ p, ids: [r.id] });
    }
    if (wp.length < 2) return null;
    const key = 'road:' + sv.id, sig = 'v2|' + wp.map(w => w.p.join(',')).join(';');
    const kept = await DB.getSetting(key); if (kept && kept.sig === sig && kept.cum) return kept;
    if (onBusy) onBusy();
    /* one-way roads are not a limit here: every leg is asked both ways (A→B and B→A) and the shorter road is used */
    const ask = async part => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
      const u = `https://router.project-osrm.org/route/v1/driving/${part.map(w => `${w.p[1]},${w.p[0]}`).join(';')}?overview=false&steps=true&geometries=geojson&continue_straight=false`;
      const j = await fetch(u, { signal: ctl.signal }).then(r => r.json()).finally(() => clearTimeout(t));
      if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error(j && j.code || 'route');
      return j.routes[0].legs.map(l => ({ d: l.distance || 0, g: [].concat(...(l.steps || []).map(st => st.geometry.coordinates.map(([lo, la]) => [la, lo]))) }));
    };
    const line = [], wcum = [0], N = 40, wait = () => new Promise(r => setTimeout(r, 1100));   // the public server allows about one request a second
    try {
      for (let i = 0; i < wp.length - 1; i += N - 1) {
        const part = wp.slice(i, i + N), fwd = await ask(part); await wait();
        const rev = await ask(part.slice().reverse()); if (i + N < wp.length) await wait();
        fwd.forEach((f, k) => {
          const b = rev[part.length - 2 - k], use = b && b.d < f.d ? { d: b.d, g: b.g.slice().reverse() } : f;
          wcum[i + k + 1] = wcum[i + k] + use.d;
          line.push(...(line.length ? use.g.slice(1) : use.g));
        });
      }
    } catch (e) { console.warn('road route', e); return null; }
    if (wcum.length !== wp.length) return null;
    const cum = {}; wp.forEach((w, i) => w.ids.forEach(id => { cum[id] = wcum[i]; }));
    const out = { sig, line, cum, at: Date.now() };
    try { await DB.setSetting(key, out); } catch (e) {}
    return out;
  }
  /* KM from the road distances: INFO takes its obstacle's KM, a record without a position the KM before it; KM (elle) wins */
  function applyRoadKm(recs, cum) {
    let last = 0; const byId = {};
    for (const r of recs) {
      let m = cum[r.id];
      if (m == null && r.parentId && byId[r.parentId] != null) m = byId[r.parentId];
      if (m == null) m = last; else last = m;
      byId[r.id] = m;
      r.km = r.kmManual != null ? r.kmManual : Math.round(m) / 1000;
    }
  }
  g.roadRoute = roadRoute; g.applyRoadKm = applyRoadKm;
  /* Every record carrying a height ('heights') or width ('widths'), lowest first, with where it lies on the route:
     'route'    an obstacle on the main route
     'bypass'   a record on a bypass
     'info'     an INFO record of an obstacle on the route
     'bypassed' an obstacle that has a bypass (or its INFO): the load goes round it, so it does not limit the load
     Archived records are left out. keep(r) narrows the list (e.g. cables only / no cables). */
  function dimList(sv, key, keep) {
    const live = ordered(sv), out = [];
    const byp = new Set(live.filter(r => r.flag === 'BYPASS').map(r => r.parentId));
    for (const r of live) {
      if (keep && !keep(r)) continue;
      const vals = (r[key] || []).filter(h => h.value != null && h.value !== '' && Number(h.value) > 0);
      if (!vals.length) continue;
      const lo = vals.reduce((a, b) => Number(b.value) < Number(a.value) ? b : a);
      const status = !r.parentId ? (byp.has(r.id) ? 'bypassed' : 'route') : r.flag === 'BYPASS' ? 'bypass' : (byp.has(r.parentId) ? 'bypassed' : 'info');
      out.push({ rec: r, value: Number(lo.value), label: lo.label || (key === 'widths' ? 'W' : 'H'), all: vals, status, counted: status !== 'bypassed' });
    }
    return out.sort((a, b) => a.value - b.value);
  }
  /* Critical (lowest) clear height / width on the route the load actually takes: bypassed obstacles do not count,
     their bypass records do. Overhead cables are left out (they are lifted or switched off; see the cable list). */
  const noCable = r => r.obstacle !== 'Overhead Cable';
  function criticalDim(sv, key) {
    const list = dimList(sv, key, noCable), best = list.find(x => x.counted);
    const skipped = list.filter(x => x.status === 'bypassed' && !x.rec.parentId).length;
    return best ? { value: best.value, rec: best.rec, label: best.label, skipped } : (skipped ? { value: null, skipped } : null);
  }
  g.dimList = dimList; g.criticalDim = criticalDim; g.criticalHeight = sv => criticalDim(sv, 'heights');
  /* photo annotations drawn over a 4:3 photo box; shared by the app and both reports.
     arrow   upright yellow arrow (older surveys)
     garrow  yellow direction arrow lying on the road: dir straight | left | right; w/h set how flat it lies, rot turns it
     sign    traffic sign: t turnL | turnR | uturn | up | down (slope, with text "%8"); w sets the size
     text    red-framed note ("H: 4,85 m", "W: 3,20 m" …)
     line    red line with an arrow head at the end (both: heads at both ends — height / width dimension) */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GARROW = {
    straight: '<polygon points="50,3 80,27 63,27 70,57 30,57 37,27 20,27" />',
    left: '<polygon points="3,33 33,9 33,21 90,15 97,43 33,45 33,57" />',
    right: '<polygon points="97,33 67,9 67,21 10,15 3,43 67,45 67,57" />',
  };
  const SIGNS = {
    turnL: '<path d="M60 76 V54 Q60 42 48 42 H40" fill="none" stroke="#000" stroke-width="8"/><polygon points="26,42 41,31 41,53" fill="#000"/>',
    turnR: '<path d="M40 76 V54 Q40 42 52 42 H60" fill="none" stroke="#000" stroke-width="8"/><polygon points="74,42 59,31 59,53" fill="#000"/>',
    uturn: '<path d="M40 77 V50 Q40 37 51 37 Q62 37 62 50 V58" fill="none" stroke="#000" stroke-width="7"/><polygon points="52,56 72,56 62,69" fill="#000"/>',
    up: '<polygon points="24,77 77,77 77,57" fill="#000"/>',
    down: '<polygon points="24,57 24,77 77,77" fill="#000"/>',
  };
  function signSvg(o) {
    const txt = (o.t === 'up' || o.t === 'down') && o.text ? `<text x="${o.t === 'up' ? 40 : 60}" y="54" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="17" fill="#000">${esc(o.text)}</text>` : '';
    return `<svg viewBox="0 0 100 88" style="width:100%;height:100%;display:block"><path d="M50 6 L95 83 H5 Z" fill="#fff" stroke="#E30613" stroke-width="9" stroke-linejoin="round"/>${SIGNS[o.t] || ''}${txt}</svg>`;
  }
  // colours of notes and red arrows (palette in the marking screen); yellow and white text sit on a dark box
  const ACOL = { red: ['#FF0000', 'rgba(255,255,255,.92)'], black: ['#111111', 'rgba(255,255,255,.92)'], blue: ['#1E5AFF', 'rgba(255,255,255,.92)'], green: ['#15803D', 'rgba(255,255,255,.92)'], yellow: ['#FFE500', 'rgba(0,0,0,.72)'], white: ['#FFFFFF', 'rgba(0,0,0,.72)'] };
  const acol = o => ACOL[o.color] || ACOL.red;
  function annHtml(items, sel) {
    let h = '', lines = ''; const used = new Set();
    const box = (o, i, extra) => `class="ov ${i === sel ? 'sel' : ''}" data-i="${i}" style="position:absolute;left:${o.x * 100}%;top:${o.y * 100}%;${o.w != null ? `width:${o.w * 100}%;` : ''}${o.h != null ? `height:${o.h * 100}%;` : ''}transform:rotate(${o.rot || 0}deg);touch-action:none;${extra || ''}"`;
    items.forEach((o, i) => {
      if (o.k === 'arrow') h += `<div ${box(o, i)}><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block"><polygon points="50,0 100,50 75,50 75,100 25,100 25,50 0,50" fill="#FFFF00" stroke="#8a7a00" stroke-width="2"/></svg></div>`;
      if (o.k === 'garrow') h += `<div ${box(o, i)}><svg viewBox="0 0 100 60" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible"><g fill="#FFE500" stroke="#9A8600" stroke-width="1.6" stroke-linejoin="round">${GARROW[o.dir] || GARROW.straight}</g></svg></div>`;
      if (o.k === 'sign') h += `<div ${box(o, i, 'aspect-ratio:100/88;height:auto')}>${signSvg(o)}</div>`;
      if (o.k === 'text') h += `<div ${box({ ...o, w: null }, i, `width:max-content;max-width:${Math.max(30, (1 - o.x) * 100)}%;border:.45cqw solid ${acol(o)[0]};background:${acol(o)[1]};color:${acol(o)[0]};font-weight:700;font-size:${(3.7 * (o.fs || 1)).toFixed(2)}cqw;line-height:1.15;padding:.6cqw 1cqw;white-space:pre-wrap`)}>${esc(o.text) || 'Not'}</div>`;
      if (o.k === 'yarrow') {   // yellow arrow painted flat on the road from (x1,y1) to (x2,y2): drawn on the ground plane and
        // seen in perspective (narrower and shorter the farther it is); both ends can be dragged
        const HY = 33, F = 60;   // horizon line (viewBox units, 0–75) and focal length of the assumed road camera
        const toG = (x, y) => { const z = F / Math.max(1.5, y - HY); return [(x - 50) * z / F, z]; };   // image → ground (X, Z), camera height 1
        const toI = (X, Z) => [50 + X * F / Z, HY + F / Z];
        const A = toG(o.x1 * 100, o.y1 * 75), B = toG(o.x2 * 100, o.y2 * 75);
        const gx = B[0] - A[0], gz = B[1] - A[1], GL = Math.hypot(gx, gz) || 1e-6, dx = gx / GL, dz = gz / GL, nx = -dz, nz = dx;
        const hw = (o.w || 0.05) * 50 * A[1] / F;   // half width on the ground: o.w is the width seen at the start end
        const hl = Math.min(GL * 0.6, hw * 5), H = hw * 2.5, cx = B[0] - dx * hl, cz = B[1] - dz * hl;
        const P = (X, Z) => { const [x, y] = toI(X, Z); return `${x.toFixed(2)},${y.toFixed(2)}`; };
        const pts = [P(A[0] + nx * hw, A[1] + nz * hw), P(cx + nx * hw, cz + nz * hw), P(cx + nx * H, cz + nz * H), P(B[0], B[1]), P(cx - nx * H, cz - nz * H), P(cx - nx * hw, cz - nz * hw), P(A[0] - nx * hw, A[1] - nz * hw)].join(' ');
        lines += `<polygon data-i="${i}" points="${pts}" fill="#FFE500" fill-opacity="0.92" stroke="#9A8600" stroke-width="0.3" stroke-linejoin="round" style="pointer-events:visiblePainted;touch-action:none"/>`;
        if (i === sel) h += `<span class="hd" data-i="${i}" data-h="1" style="left:${o.x1 * 100}%;top:${o.y1 * 100}%"></span><span class="hd" data-i="${i}" data-h="2" style="left:${o.x2 * 100}%;top:${o.y2 * 100}%"></span>`;
      }
      if (o.k === 'line') {
        const ck = ACOL[o.color] ? o.color : 'red'; used.add(ck);
        lines += `<line x1="${o.x1 * 100}" y1="${o.y1 * 75}" x2="${o.x2 * 100}" y2="${o.y2 * 75}" stroke="${ACOL[ck][0]}" stroke-width="${o.sw || 0.8}" stroke-linecap="round"${o.plain ? '' : ` marker-end="url(#ah-${ck})"`}${o.both && !o.plain ? ` marker-start="url(#ahs-${ck})"` : ''}/><line data-i="${i}" x1="${o.x1 * 100}" y1="${o.y1 * 75}" x2="${o.x2 * 100}" y2="${o.y2 * 75}" stroke="transparent" stroke-width="7" style="pointer-events:stroke;touch-action:none"/>`;
        if (i === sel) h += `<span class="hd" data-i="${i}" data-h="1" style="left:${o.x1 * 100}%;top:${o.y1 * 100}%"></span><span class="hd" data-i="${i}" data-h="2" style="left:${o.x2 * 100}%;top:${o.y2 * 100}%"></span>`;
      }
    });
    return (lines ? `<svg viewBox="0 0 100 75" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><defs>${[...used].map(k => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${ACOL[k][0]}"/></marker><marker id="ahs-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${ACOL[k][0]}"/></marker>`).join('')}</defs>${lines}</svg>` : '') + h;
  }
  g.annHtml = annHtml; g.annSign = signSvg; g.ANNCOL = ACOL; g.annGArrow = dir => `<svg viewBox="0 0 100 60" width="34" height="20"><g fill="#FFE500" stroke="#9A8600" stroke-width="3">${GARROW[dir]}</g></svg>`;
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
