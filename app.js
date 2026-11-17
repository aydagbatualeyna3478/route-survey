/* Route Survey field app (PWA). Vanilla JS, no dependencies; data lives in IndexedDB (db.js). */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pn = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
  const fmt = (v, d) => v == null || v === '' ? '' : (d == null ? String(v) : Number(v).toFixed(d)).replace('.', ',');
  const R = window.SurveyRules;
  const longDate = d => `${d.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;
  /* Field = the tablet app (APK): survey only. Office = the same app on a computer: also the report and PDF.
     For testing in a browser: ?saha=1 switches to field, ?ofis=1 back to office (remembered). */
  const FIELD = (() => {
    try {
      if (/[?&]saha=1/.test(location.search)) localStorage.setItem('rs-mode', 'field');
      if (/[?&]ofis=1/.test(location.search)) localStorage.removeItem('rs-mode');
      return !!window.Capacitor || localStorage.getItem('rs-mode') === 'field';
    } catch (e) { return !!window.Capacitor; }
  })();
  document.documentElement.classList.toggle('field', FIELD);

  const TYPES = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn',
    'Inclination', 'Declination', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate', 'Satellite View', 'Drone View'];
  const QUICK = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'Inclination', 'Declination'];
  const WIDTH_TYPES = ['Port Gate', 'Width Obstruction'];   // these ask for W automatically; any other type can add it by hand
  const CURVES = ['Right curve. Turning radius of the curve is suitable for planned transportation operation.', 'Left curve. Turning radius of the curve is suitable for planned transportation operation.'];
  const SUB = {
    'Overhead Structure': ['L Shape Signboard', 'Signboard', 'Bridge', 'Traffic Enforcement Camera', 'L Shape Traffic Light', 'Traffic Light', 'Pedestrian Bridge', 'Pipeline'],
    'Overhead Cable': ['High Voltage Powerline', 'Medium Voltage Powerline', 'Low Voltage Powerline', 'Telephone Line', 'Railroad Communication Cable'],
    'Bridge': ['Precast Concrete I Girder', 'Precast Concrete U Girder', 'Concrete Tee Beam', 'Concrete Flat Slab', 'Steel I Girder', 'Steel U Girder', 'Concrete Box Girder'],
    'Culvert': ['Box', 'Arc', 'Pipe'],
  };
  // 3: obstacles with a width get one of these automatically when the width is entered (load width known)
  const W_OK = 'The clearance is sufficient for planned transportation operation. No action required.';
  const W_NO = 'The clearance is not sufficient for planned transportation operation.';
  /* standard comments; each list opens with the app's own, followed by the wording used in the team's past reports
     (Gaziantep–Kahramanmaraş and Best Transformer–İzmir Aliağa, Nov 2026) */
  const PHRASES = {
    'Overhead Cable': [R.TEXT.lvLift, R.TEXT.lvOff, R.TEXT.hvOff, R.TEXT.none,
      'Cable height is enough for planned transportation operation. No action required.',
      'The height of the cables is suitable for the planned operation. No action required.'],
    'Overhead Structure': [R.TEXT.structure, 'Structure must be removed/bypassed.', 'Use right lane to pass. No action required.', 'Use left lane to pass. No action required.', R.TEXT.none,
      'The heights and widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The heights of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The widths of the opposing L-shaped traffic lights are suitable for the planned transportation operation.',
      'The clearance on the right side of the L-shape traffic light is enough for transportation.',
      'The clearance between the L-shape traffic lights is enough for transportation. No action required.',
      'The height of the traffic lights is suitable for the planned operation. No action required.',
      'Signboard must be removed.'],
    'Bridge': ['Bridge static analysis and evaluation is required.',
      'Bridge static analysis and evaluation is required. Major cracks observed.',
      'Bridge static analysis and evaluation is required. Minor cracks observed.', 'The bridge is in good condition.',
      'Construction of a new bridge has commenced along the route. The height of bridge is currently unknown.'],
    'Culvert': ['The culvert is good condition.', 'Bridge static analysis and evaluation is required.'],
    'Left Turn': ['Turn left.', 'Turn left. Turning radius of the turn is suitable for planned transportation operation.', 'Turn left. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.',
      'Turn left and take the second exit at the roundabout.', 'Turn left by roundabout turn.', 'Turn left and exit the freeway.'],
    'Right Turn': ['Turn right.', 'Turn right. Turning radius of the turn is suitable for planned transportation operation.', 'Turn right. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.',
      'Turn right. The turn is suitable for planned transportation operation.', 'Concrete blocks must be removed for the right turn.', 'Turn right after exit of factory.', 'Turn right at the roundabout and enter the freeway.'],
    'Curve': ['Left curve. No action required.', 'Right curve. No action required.', 'S Turn.', 'S Turn. Turning radius is suitable for transportation.'],
    'U Turn': ['U turn. Turning radius of the turn is suitable for planned transportation operation.', 'U - Turn is suitable for the planned transportation operation.', 'U turn.', 'U Turn by roundabout turn.'],
    'Roundabout Turn': ['Continue straight at the roundabout.', 'Take the second exit at the roundabout.', 'Enter the roundabout.'],
    'Inclination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `The degree of the inclination is about ${n}%.`).concat('The degree of the inclination is about %.'),
    'Declination': [4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `The degree of the declination is about ${n}%.`).concat('The degree of the declination is about %.'),
    'Road Condition': ['The road is in poor condition and requires minor civil works.', 'The opposite traffic direction must be used.',
      'Road is good condition. No action required.', 'No action required.',
      'The road narrows to a single lane due to roadworks.', 'Due to ongoing roadworks, the road narrows to a single lane.', 'The road is reduced to a single lane.',
      'The road returns to two lanes as the roadworks have been completed.', 'Roadworks have been completed.', 'Start of road works at this point.',
      'Start of roadworks at this point. The traffic cones will be removed to allow the transport convoy to proceed along the planned route.', 'The traffic cones will be removed.',
      'Roadworks ahead, use the right lane.', 'Left lane must be used.', 'Move on the opposite direction.',
      'The road has become a single carriageway with one lane in each direction.', 'The road has become a dual carriageway with two lanes in each direction.',
      'Connect to the main road.', 'Back onto the main road.', 'Security check point. No action required.',
      'Trees are extending into the roadway in some sections.', 'Automatic barrier.', 'Concrete barriers.',
      'Construction of a new bridge has commenced along the route. The height of bridge is currently unknown.',
      'The road condition is not suitable for the planned operation. The road must be widened up to the main road connection, and filling and compaction work must be carried out.'],
    'Width Obstruction': [W_OK, W_NO, 'The clearance is sufficient for transport.'],
    'Railroad Crossing': ['Railroad crossing must be organized based on the train schedule.'],
    'Port Gate': [W_OK, W_NO, 'Entrance of the port gate.', 'Width of factory gate is suitable for planned transportation operation.', 'Gate dimensions is suitable for planned transportation operation.',
      'Jobsite Gate is not suitable for planned transportation operation. Gate must be widened.', 'Exit of the jobsite gate to the opposite direction.', 'Terminal gate entrance.', 'Cargo unloading area.'],
    'Satellite View': ['Satellite view of transportation simulation.'],
    'Drone View': ['Drone view of transportation simulation.'],
  };
  for (const k of Object.keys(PHRASES)) if (!['Satellite View', 'Drone View'].includes(k) && !PHRASES[k].some(t => /^no action required\.?$/i.test(t))) PHRASES[k].push('No action required.');
  /* remarks the user typed themselves on obstacles of the same type in this survey, offered as options for the rest of it
     (derived from the records, so an edited or deleted text simply drops out) */
  function ownPhrases(sv, type, key, skipId) {
    if (!type) return [];
    const std = new Set([...(PHRASES[type] || []), W_OK, W_NO].map(t => t.trim())), seen = new Set(), out = [];
    for (const x of sv.records) {
      const t = (x[key] || '').trim();
      if (x.obstacle !== type || !t || std.has(t) || /about %\.$/.test(t) || seen.has(t)) continue;
      seen.add(t); out.push(t);
    }
    return out.reverse();   // newest first
  }
  const phLabel = t => { const m = /about (\d+)%\.$/.exec(t); return m ? `%${m[1]}` : /about %\.$/.test(t) ? 'Diğer %…' : t; };   // slope buttons show only the percentage
  const COLORS = [['red', 'Kırmızı', '#FF0000'], ['yellow', 'Sarı', '#FFFF00'], ['magenta', 'Magenta', '#FF00FF'], ['purple', 'Mor', '#7030A0'], ['blue', 'Mavi', '#4F81BD'], ['green', 'Yeşil', '#92D050']];
  const COLNAME = Object.fromEntries(COLORS.map(c => [c[0], c[1].toLowerCase()]));

  // ---------- small helpers ----------
  let toastT = null;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600);
  }
  const urls = new Map();
  async function blobUrl(id) { if (!id) return null; if (!urls.has(id)) urls.set(id, await DB.blobUrl(id)); return urls.get(id); }
  const go = h => { location.hash = h; };
  const settingsOf = sv => ({ general: !!sv.project.general, minHeight: pn((sv.project.cargo && sv.project.cargo.height) ?? sv.project.minHeight) ?? 0, refLV: pn(sv.project.refLV), refMV: pn(sv.project.refMV), refHV: pn(sv.project.refHV) });
  const pinSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>';
  const userSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
  const backSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  const camSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const bar = (title, back, extra) => `<div class="bar">${back ? `<button class="back" data-go="${back}" aria-label="Geri">${backSvg}</button>` : ''}<h1>${esc(title)}</h1>${extra || ''}</div>`;

  // image -> 4:3 JPEG (centre crop), max 1600 px wide
  async function to43(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const sw = bmp.width, sh = bmp.height, ar = 4 / 3;
    let cw = sw, ch = sw / ar; if (ch > sh) { ch = sh; cw = sh * ar; }
    const W = Math.min(1600, Math.round(cw)), H = Math.round(W / ar);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(bmp, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
  }
  async function shrink(file, max) { // logos / drawings: keep aspect, PNG keeps transparency
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const png = /png|svg|webp/.test(file.type);
    return new Promise(res => c.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.88));
  }

  // ---------- GPS: only while the camera is open; KM from the photo positions ----------
  const GPS = {
    watch: null, last: null, err: null, cb: null,
    on(cb) {   // start watching (camera opened)
      this.cb = cb || null; this.err = null;
      if (!navigator.geolocation) { this.err = 'yok'; this.cb && this.cb(); return; }
      if (this.watch == null) this.watch = navigator.geolocation.watchPosition(p => this.got(p), e => { this.err = e.code === 1 ? 'izin' : 'sinyal'; this.cb && this.cb(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    },
    off() {   // camera closed; keeps watching only while a photo still waits for its position
      this.cb = null;
      if (LATE.job) return;
      if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null;
    },
    got(p) {
      this.err = null;
      const fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      this.last = fix;   // always the newest fix: the vehicle may be moving
      this.cb && this.cb();
      lateTick();
    },
    fresh(maxAge) { return this.last && Date.now() - this.last.t < (maxAge || 30000) ? this.last : null; },
    current() {   // one-off position (photo-less record, "update position")
      return new Promise(res => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(p => { this.got(p); res(this.last); }, () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      });
    },
  };


  /* A photo taken before the GPS has a fix is saved at once (no waiting on the camera screen). The GPS keeps
     listening in the background; the first usable fix (≤30 m) is written to that obstacle with its KM. */
  let CUR = null;   // the survey object the open screen is editing, so a late fix lands in it and is not overwritten
  const LATE = { job: null, onfix: null };
  async function placeLate(f) {
    const j = LATE.job; if (!j) return; LATE.job = null; clearTimeout(j.timer);
    const sv = CUR && CUR.id === j.svId ? CUR : await DB.getSurvey(j.svId);
    const r = sv && sv.records.find(x => x.id === j.recId);
    if (r && r.latDec == null && f) {
      r.latDec = f.lat; r.lonDec = f.lon; r.acc = f.acc; r.lat = Geo.dms(f.lat, true); r.lon = Geo.dms(f.lon, false);
      await DB.putSurvey(sv);
      if (LATE.onfix) LATE.onfix(r); else toast(`${r.no || ''} konumu alındı (±${Math.round(f.acc)} m)`);
    }
    if (!GPS.cb) GPS.off();
  }
  function lateTick() {
    const f = GPS.last;
    if (LATE.job && f && f.acc <= 30 && f.t >= LATE.job.since) placeLate(f);
  }
  function waitLate(sv, rec) {
    if (GPS.watch == null) GPS.on(null);   // the camera already stopped it
    LATE.job = { svId: sv.id, recId: rec.id, since: Date.now() - 1000,
      timer: setTimeout(() => { if (LATE.job && LATE.job.recId === rec.id) { LATE.job = null; if (!GPS.cb) GPS.off(); toast('Konum alınamadı; engel ekranında "Konumu güncelle" ile alabilirsin'); if (LATE.onfix) LATE.onfix(null); } }, 120000) };
  }

  /* new record from a photo (or none). Camera photos take the current GPS position; INFO images take the parent's. */
  async function createRecord(sv, o) {
    toast('Kaydediliyor…');
    const parent = o.parent || null, name = o.name || '';
    const rec = { id: DB.uid(), parentId: parent ? parent.id : null, flag: o.flag || '', obstacle: name, pendingImage: o.pending || null, t: Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [] };
    if (/Overhead/.test(name)) rec.heights = [{ label: 'H', value: null }];
    if (WIDTH_TYPES.includes(name)) rec.widths = [{ label: 'W', value: null }];
    if (o.file) { rec.photoId = await DB.putBlob(o.ready ? o.file : await to43(o.file)); rec.aspect = 4 / 3; }
    const pos = o.pos || (o.useGps ? await GPS.current() : null);
    if (pos) {
      rec.latDec = pos.lat; rec.lonDec = pos.lon; rec.acc = pos.acc;   // KM is worked out at report time (routeKm)
    } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; }
    if (rec.latDec != null) { rec.lat = Geo.dms(rec.latDec, true); rec.lon = Geo.dms(rec.lonDec, false); }
    if (name && PHRASES[name] && PHRASES[name].length === 1 && !/%/.test(PHRASES[name][0]) && !/Overhead|Bridge|Culvert/.test(name)) rec.remarks = PHRASES[name][0];
    if (o.t) rec.t = o.t; if (o.source) rec.source = o.source;
    if (parent) sv.records.push(rec);
    else { sv.records.splice(insertAt(sv), 0, rec); if (sv.insertAfter) sv.insertAfter = rec.id; }   // the next one follows this one
    sv.selected = rec.id; SCROLLTO = rec.id; await DB.putSurvey(sv);
    if (o.late && rec.latDec == null) waitLate(sv, rec);
    if (o.go !== false) go(`#/r/${sv.id}/${rec.id}`);
    return rec;
  }
  /* where a new obstacle goes: right after the obstacle chosen in the list (after its INFO/BYPASS too), else at the end */
  let SCROLLTO = null;   // the obstacle the list should show next time it opens (just added)
  function insertAt(sv) {
    let s = sv.insertAfter && sv.records.find(r => r.id === sv.insertAfter);
    if (s && s.parentId) s = sv.records.find(r => r.id === s.parentId);
    if (!s || s.archived) { sv.insertAfter = null; return sv.records.length; }
    let i = sv.records.indexOf(s);
    sv.records.forEach((r, j) => { if (r.parentId === s.id && j > i) i = j; });
    return i + 1;
  }
  /* several photos at once (gallery / folder): each becomes an empty obstacle, in capture order, with the position
     read from the photo; details are filled in later with "Detay göster" */
  async function addPhotos(sv, files) {
    files = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic)$/i.test(f.name));
    if (!files.length) return toast('Fotoğraf seçilmedi');
    const items = [];
    for (const f of files) { const x = await exifOf(f); items.push({ f, x, t: x.t || f.lastModified || 0 }); }
    items.sort((a, b) => a.t - b.t || a.f.name.localeCompare(b.f.name, 'tr', { numeric: true }));
    const bp = sv.bypassParent && sv.records.find(r => r.id === sv.bypassParent && !r.archived);
    const tt = document.createElement('div'); tt.className = 'toast'; tt.style.bottom = '50%'; document.body.appendChild(tt);
    let rec = null, nopos = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; tt.textContent = `Fotoğraflar ekleniyor… ${i + 1} / ${items.length}`;
      if (it.x.lat == null) nopos += 1;
      rec = await createRecord(sv, { file: it.f, pos: it.x.lat != null ? { lat: it.x.lat, lon: it.x.lon } : null, parent: bp || null, flag: bp ? 'BYPASS' : '', go: false, t: it.x.t || null, source: it.f.name });
    }
    tt.remove(); document.querySelectorAll('.toast').forEach(t => t.remove());
    if (items.length === 1) return go(`#/r/${sv.id}/${rec.id}`);
    toast(`${items.length} engel eklendi${nopos ? ` (${nopos} tanesinde konum yok)` : ''}. Düzenlemek için "Detay göster".`);
    if (location.hash.startsWith(`#/s/${sv.id}`)) V.survey(sv.id); else go(`#/s/${sv.id}`);
  }

  /* small bottom sheet with choices; gallery options are file inputs so the picker opens from the tap itself */
  function sheet(title, items) {
    document.querySelectorAll('.sheet').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'sheet';
    d.innerHTML = `<div class="sheet-bg" data-x="1"></div><div class="sheet-box" role="dialog" aria-label="${esc(title)}"><b>${esc(title)}</b>
      ${items.map((it, i) => it.file ? `<label class="btn" style="cursor:pointer">${it.icon || ''}${esc(it.label)}<input class="hid" type="file" accept="${it.accept || 'image/*'}" data-i="${i}" ${it.multi ? 'multiple' : ''} ${it.dir ? 'webkitdirectory' : ''}></label>`
        : `<button class="btn ${it.cls || ''}" data-i="${i}">${it.icon || ''}${esc(it.label)}</button>`).join('')}
      <button class="btn dash" data-x="1">Vazgeç</button></div>`;
    document.body.appendChild(d);
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target.closest('[data-x]')) return close(); const b = e.target.closest('button[data-i]'); if (b) { close(); items[b.dataset.i].run(); } });
    d.querySelectorAll('input[data-i]').forEach(inp => inp.onchange = () => { const fs = [...inp.files], it = items[inp.dataset.i]; close(); if (fs.length) it.run(it.multi ? fs : fs[0]); });
  }

  // ---------- photos from a folder -> survey (EXIF time + GPS) ----------
  let IMPORT = null;   // photos chosen on the import screen, waiting for the survey form to be saved
  async function exifOf(file) {   // minimal JPEG EXIF reader: capture time and GPS position
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.getUint16(0) !== 0xFFD8) return {};
      let o = 2;
      while (o + 10 < v.byteLength) {
        const m = v.getUint16(o), len = v.getUint16(o + 2);
        if ((m & 0xFF00) !== 0xFF00) break;
        if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiff(v, o + 10);
        o += 2 + len;
      }
    } catch (e) { /* not readable: treated as a photo without EXIF */ }
    return {};
  }
  function tiff(v, t) {
    const le = v.getUint16(t) === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
    const ifd = p => { const n = u16(p), out = {}; for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; out[u16(e)] = { count: u32(e + 4), at: e + 8 }; } return out; };
    const str = e => { const p = e.count > 4 ? t + u32(e.at) : e.at; let x = ''; for (let i = 0; i < e.count - 1; i++) x += String.fromCharCode(v.getUint8(p + i)); return x; };
    const rats = e => { const p = t + u32(e.at), a = []; for (let i = 0; i < e.count; i++) a.push(u32(p + i * 8) / u32(p + i * 8 + 4)); return a; };
    const res = {}, i0 = ifd(t + u32(t + 4));
    if (i0[0x8769]) { const ex = ifd(t + u32(i0[0x8769].at)), d = ex[0x9003] || ex[0x9004]; if (d) res.date = str(d); }
    if (!res.date && i0[0x0132]) res.date = str(i0[0x0132]);
    if (i0[0x8825]) {
      const g = ifd(t + u32(i0[0x8825].at));
      if (g[2] && g[4]) {
        const la = rats(g[2]), lo = rats(g[4]), dms = a => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
        let lat = dms(la), lon = dms(lo);
        if (g[1] && v.getUint8(g[1].at) === 83) lat = -lat;   // 'S'
        if (g[3] && v.getUint8(g[3].at) === 87) lon = -lon;   // 'W'
        if (isFinite(lat) && isFinite(lon) && (lat || lon)) { res.lat = lat; res.lon = lon; }
      }
    }
    const m = res.date && res.date.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
    if (m) res.t = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return res;
  }
  async function importInto(sv, items) {   // one main obstacle per photo, in capture order; KM like in the field
    const ov = document.createElement('div'); ov.className = 'toast'; ov.style.bottom = '50%'; document.body.appendChild(ov);

    for (let i = 0; i < items.length; i++) {
      const it = items[i]; ov.textContent = `Fotoğraflar ekleniyor… ${i + 1} / ${items.length}`;
      const rec = { id: DB.uid(), parentId: null, flag: '', obstacle: '', t: it.t || Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [], source: it.file.name };
      try { rec.photoId = await DB.putBlob(await to43(it.file)); rec.aspect = 4 / 3; } catch (e) { rec.pendingImage = 'sat'; }
      if (it.lat != null) {
        rec.latDec = it.lat; rec.lonDec = it.lon; rec.lat = Geo.dms(it.lat, true); rec.lon = Geo.dms(it.lon, false);
      }
      sv.records.push(rec);
      if (i % 10 === 9) await DB.putSurvey(sv);
    }
    sv.status = 'done'; sv.imported = { at: Date.now(), count: items.length };
    await DB.putSurvey(sv); ov.remove();
    toast(`${items.length} fotoğraf eklendi. Engel tiplerini seç; sıra yanlışsa basılı tutup sürükle.`);
  }
  const importerView = async () => {
    const android = /Android/i.test(navigator.userAgent);
    let items = IMPORT ? IMPORT.items : [];
    const draw = () => {
      const withPos = items.filter(x => x.lat != null).length, noT = items.filter(x => !x.exifT).length;
      const tf = t => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      $app.innerHTML = `${bar('Fotoğraflardan etüt oluştur', '#/')}
      <div class="split even">
        <div class="pane">
          <div class="card"><b>Eski usulle çekilmiş fotoğraflar</b>
            <span class="hint">Bir etüdün fotoğraflarını seç. Her fotoğraf bir engel olur; çekim saatine göre 1, 2, 3… diye sıralanır. Konum bilgisi olan fotoğraflardan koordinat ve KM, sahadaki gibi hesaplanır.</span>
            <label class="btn red" style="min-height:80px;font-size:18px;cursor:pointer">${imgSvg} Fotoğrafları seç<input class="hid" type="file" accept="image/jpeg,image/*" multiple id="ifiles"></label>
            ${android ? '<span class="hint">Galeride klasörü açıp "Tümünü seç" ile hepsini birden seçebilirsin.</span>' : `<label class="btn" style="cursor:pointer">Klasör seç<input class="hid" type="file" webkitdirectory multiple id="idir"></label>`}</div>
          <div class="note w">Engel tipi, yükseklikler, açıklamalar ve INFO/BYPASS fotoğraflarda yazmaz; bunlar sonra engel ekranında doldurulur. WhatsApp ile gönderilmiş fotoğraflarda konum silinmiş olur, orijinallerini kullan.</div>
        </div>
        <div class="pane">
          ${items.length ? `<div class="card"><b>${items.length} fotoğraf</b>
              <div class="stat4" style="color:var(--ink)"><div><b>${withPos}</b><span style="color:var(--mut)">konumlu</span></div><div><b>${items.length - withPos}</b><span style="color:var(--mut)">konumsuz</span></div>
                <div><b>${items.length - noT}</b><span style="color:var(--mut)">çekim saatli</span></div></div>
              ${items[0].t ? `<span class="hint">${tf(items[0].t)} → ${tf(items[items.length - 1].t)}</span>` : ''}
              ${withPos < items.length ? `<span class="note w">${items.length - withPos} fotoğrafta konum yok: bunların KM'si bir önceki fotoğraftan alınır, konumu sonra elle girilebilir.</span>` : ''}
              ${noT ? `<span class="note w">${noT} fotoğrafta çekim saati yok: dosya tarihine göre sıralandı.</span>` : ''}
              <div style="max-height:260px;overflow:auto;font-size:13px;border:1px solid var(--line);border-radius:10px">${items.map((x, i) => `<div class="row" style="padding:6px 10px;border-bottom:1px solid var(--line);gap:8px"><b style="width:34px">${i + 1}</b><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.file.name)}</span><span class="hint">${x.t ? tf(x.t) : ''}</span>${x.lat != null ? '<span class="tag ok">konum</span>' : '<span class="tag warn">konum yok</span>'}</div>`).join('')}</div>
            </div>
            <button class="btn pri" id="inext" style="min-height:64px;font-size:17px">Devam: etüt bilgilerini gir</button>`
          : '<div class="empty">Henüz fotoğraf seçilmedi.</div>'}
        </div>
      </div>`;
      const take = async fl => {
        const fs = [...fl].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic)$/i.test(f.name));
        if (!fs.length) return toast('Fotoğraf bulunamadı');
        toast('Fotoğraflar okunuyor…');
        const out = [];
        for (const f of fs) { const x = await exifOf(f); out.push({ file: f, lat: x.lat, lon: x.lon, exifT: x.t || null, t: x.t || f.lastModified || null }); }
        out.sort((a, b) => (a.t || 0) - (b.t || 0) || a.file.name.localeCompare(b.file.name, 'tr', { numeric: true }));
        items = out; IMPORT = { items }; draw();
      };
      document.getElementById('ifiles').onchange = e => take(e.target.files);
      const d = document.getElementById('idir'); if (d) d.onchange = e => take(e.target.files);
      const n = document.getElementById('inext'); if (n) n.onclick = () => go('#/new');
    };
    draw();
  };

  // ---------- views ----------
  const V = {};
  const imgSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>';
  const cargoOf = p => p.cargo || { height: p.minHeight };
  /* lowest clear height and width met so far on the route the load takes (bypassed obstacles left out, their bypass
     counted); each line opens its obstacle */
  const minHBox = sv => {
    const cg = sv.project.general ? {} : cargoOf(sv.project);
    const line = (key, t, limit, word) => {
      const c = criticalDim(sv, key);
      if (!c || c.value == null) return `<div class="mrow"><b>${t}</b><span class="hint">${c && c.skipped ? 'yalnız bypass edilen engellerde' : 'henüz girilmedi'}</span></div>`;
      const r = c.rec, low = limit && c.value < limit;
      return `<button class="mrow ${low ? 'low' : ''}" data-go="#/r/${sv.id}/${r.id}" title="Engeli aç"><b>${t}</b><span class="v">${fmt(c.value)} m</span>${low ? `<span class="tag bad">${word}</span>` : ''}
        <span class="hint">Engel ${esc(r.no)}${r.flag === 'BYPASS' ? ' (bypass)' : r.flag === 'INFO' ? ' (info)' : ''} · ${esc(c.label)} · ${esc(r.obstacle || 'Tip seçilmedi')}${c.skipped ? ` · ${c.skipped} bypass edilen hariç` : ''}</span></button>`;
    };
    return `<div class="cargo minh">${line('heights', 'Kritik min. H', Number(cg.height) || null, 'yükten alçak')}${line('widths', 'Kritik min. W', Number(cg.width) || null, 'yükten dar')}</div>`;
  };
  const cargoBox = p => {
    if (p.general) return `<div class="cargo"><b>Taşıma Bilgileri</b><span style="font-size:15px;font-weight:700;color:var(--navy)">Genel Etüt</span><span class="hint">Belirli bir yüke bağlı değil</span></div>`;
    const c = cargoOf(p), m = v => v == null || v === '' ? '–' : fmt(v) + ' m';
    return `<div class="cargo"><b>Taşıma Bilgileri</b><div class="cg"><span>Uzunluk: <b>${m(c.length)}</b></span><span>Genişlik: <b>${m(c.width)}</b></span>
      <span>Yükseklik: <b>${m(c.height)}</b></span><span>Ağırlık: <b>${c.weight == null || c.weight === '' ? '–' : fmt(c.weight) + ' t'}</b></span></div></div>`;
  };

  /* survey identity: region, project code/name, surveyors, company — filled in the form, used by the home filters */
  const REGIONS = ['Afrika', 'Orta Asya', 'Orta Doğu', 'Avrupa'];
  const pkey = p => [p.projectCode, p.projectName].filter(Boolean).join(' – ');
  const surveyorsOf = p => (p.surveyors && p.surveyors.length ? p.surveyors : p.preparedBy || []).filter(Boolean);
  async function dataLists() {
    const all = await DB.listSurveys(), known = (await DB.getSetting('projects')) || [];   // projects: [{code, name}] (list from the team, later)
    const uniq = a => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'tr'));
    const codes = uniq(known.map(x => x.code).concat(all.map(s => s.project.projectCode))), names = uniq(known.map(x => x.name).concat(all.map(s => s.project.projectName)));
    const o = a => a.map(v => `<option value="${esc(v)}">`).join('');
    return `<datalist id="dlPcode">${o(codes)}</datalist><datalist id="dlPname">${o(names)}</datalist><datalist id="dlClient">${o(uniq(all.map(s => s.project.client)))}</datalist>`;
  }
  let FILT = (() => { try { return JSON.parse(localStorage.getItem('rs-filter')) || {}; } catch (e) { return {}; } })();
  const saveFilt = () => { try { localStorage.setItem('rs-filter', JSON.stringify(FILT)); } catch (e) {} };

  V.home = async () => {
    const every = (await DB.listSurveys()).sort((a, b) => b.createdAt - a.createdAt);
    const uniq = a => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'tr'));
    const opts = { proj: uniq(every.map(s => pkey(s.project))), who: uniq(every.flatMap(s => surveyorsOf(s.project))), firm: uniq(every.map(s => s.project.client)) };
    for (const k of ['proj', 'who', 'firm']) if (FILT[k] && !opts[k].includes(FILT[k])) delete FILT[k];
    const list = every.filter(s => (!FILT.region || s.project.region === FILT.region) && (!FILT.proj || pkey(s.project) === FILT.proj)
      && (!FILT.who || surveyorsOf(s.project).includes(FILT.who)) && (!FILT.firm || s.project.client === FILT.firm));
    const sel = (k, label) => `<label class="f" style="min-width:180px;flex:1"><span>${label}</span><select data-filt="${k}"><option value="">Tümü</option>${opts[k].map(v => `<option ${FILT[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const nf = ['region', 'proj', 'who', 'firm'].filter(k => FILT[k]).length;
    const filters = every.length ? `<div class="card filt" style="gap:10px"><div class="row" style="flex-wrap:wrap;gap:8px;align-items:center"><b style="font-size:14px;color:var(--navy);margin-right:4px">Bölge</b>
        <button class="chip ${!FILT.region ? 'on' : ''}" data-freg="">Tümü</button>${REGIONS.map(g => `<button class="chip ${FILT.region === g ? 'on' : ''}" data-freg="${g}">${g}</button>`).join('')}
        <span class="hint" style="margin-left:auto">${list.length} / ${every.length} etüt${nf ? ' · <button class="btn sm" data-fclear="1" style="min-height:30px">Filtreleri temizle</button>' : ''}</span></div>
      <div class="row" style="flex-wrap:wrap;gap:10px">${sel('proj', 'Proje kodu / adı')}${sel('who', 'Etüdü yapan')}${sel('firm', 'Firma')}</div></div>` : '';
    const card = sv => {
      const n = sv.records.length, act = sv.status === 'active', c = cargoOf(sv.project);
      return `<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:17px">${esc(sv.project.start.name)} → ${esc(sv.project.end.name)}</b>
        <span class="tag ${act ? 'warn' : 'ok'}">${act ? 'Sahada' : 'Tamamlandı'}</span></div>
        <div class="hint">${esc(sv.project.date || '')} · ${n} kayıt · ${sv.project.general ? 'genel etüt' : c.height ? 'yük H ' + fmt(c.height) + ' m' : 'yük ölçüsü yok'}</div>
        ${sv.project.region || pkey(sv.project) || sv.project.client || surveyorsOf(sv.project).length ? `<div class="hint" style="color:var(--ink)">${[sv.project.region, pkey(sv.project), sv.project.client, surveyorsOf(sv.project).join(', ')].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
        ${critSummary(sv)}
        <div class="row"><button class="btn grow sm" data-go="#/s/${sv.id}">${act ? 'Etüde devam et' : 'Kayıtları aç'}</button>${FIELD ? '' : `<button class="btn grow sm" data-go="#/rep/${sv.id}">Rapor</button>`}
          <button class="btn sm" data-delsv="${sv.id}" style="color:var(--badtx);min-width:0">Sil</button></div></div>`;
    };
    $app.innerHTML = `${bar('Etütlerim', null, `${FIELD ? '' : '<button class="btn" id="openEtut">Etüt dosyası aç</button>'}<button class="btn" data-go="#/import">${imgSvg} Fotoğraflardan etüt oluştur</button><button class="btn pri" data-go="#/new" style="min-width:260px">+ Yeni etüt raporu oluştur</button><button class="btn" id="acct" title="Hesap" aria-label="Hesap">${userSvg}${Auth.isAdmin() ? ' Yönetim' : ''}</button>`)}
      <div class="full">${filters}${list.length ? `<div class="tiles">${list.map(card).join('')}</div>` : every.length ? '<div class="empty">Bu filtrelere uyan etüt yok.</div>' : '<div class="empty">Henüz etüt yok. Sağ üstteki "Yeni etüt raporu oluştur" ile başla.</div>'}
      <div class="card bk" id="bkline" style="margin-top:auto"></div>
      <div class="hint" style="text-align:center">Veriler bu cihazda saklanır, internetsiz de çalışır.${FIELD ? '' : ' Tabletten "Dışa Aktar" ile gönderilen etüdü "Etüt dosyası aç" ile aç.'}</div></div>`;
    document.getElementById('acct').onclick = () => Auth.accountSheet();
    $app.querySelectorAll('[data-filt]').forEach(x => x.onchange = () => { if (x.value) FILT[x.dataset.filt] = x.value; else delete FILT[x.dataset.filt]; saveFilt(); V.home(); });
    $app.querySelectorAll('[data-freg]').forEach(x => x.onclick = () => { if (x.dataset.freg) FILT.region = x.dataset.freg; else delete FILT.region; saveFilt(); V.home(); });
    const fc = $app.querySelector('[data-fclear]'); if (fc) fc.onclick = () => { FILT = {}; saveFilt(); V.home(); };
    /* delete a survey: first tap asks, second tap deletes the survey with all its photos and logos */
    $app.onclick = async e => {
      const b = e.target.closest('[data-delsv]'); if (!b) return;
      if (b.dataset.sure !== '1') {
        b.dataset.sure = '1'; b.textContent = 'Emin misin? Sil'; b.style.background = 'var(--red)'; b.style.color = '#fff'; b.style.borderColor = 'var(--red)';
        const card = b.closest('.card'); if (card && !card.querySelector('.delnote')) card.insertAdjacentHTML('beforeend', '<span class="hint delnote" style="color:var(--badtx)">Etüt, bütün fotoğrafları ve logolarıyla bu cihazdan silinir; geri alınamaz. Gerekirse önce etüdü açıp "Dışa Aktar" ile yedek al.</span>');
        return;
      }
      const sv = await DB.getSurvey(b.dataset.delsv); if (!sv) return V.home();
      for (const r of sv.records) for (const x of [r.photoId, ...(r.extras || [])]) await DB.delBlob(x);
      for (const x of Object.values(sv.logos || {})) await DB.delBlob(x);
      await DB.delSurvey(sv.id); delete SELST[sv.id]; if (CUR && CUR.id === sv.id) CUR = null;
      toast(`${sv.project.start.name} → ${sv.project.end.name} silindi`); V.home();
    };
    // folder backup status and controls (backup.js)
    const bkl = document.getElementById('bkline');
    const bkDraw = st => {
      if (!bkl.isConnected) return off();
      const t = st.last ? new Date(st.last).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const tag = st.busy ? '<span class="tag warn">Yedekleniyor…</span>' : st.error ? '<span class="tag bad">Yedek hatası</span>' : st.on && !st.needsPermission ? '<span class="tag ok">Yedek açık</span>' : '<span class="tag warn">Yedek kapalı</span>';
      let txt, btns = '';
      if (!st.supported) txt = 'Bu tarayıcı klasöre yedeklemeyi desteklemiyor. Edge ya da Chrome kullan.';
      else if (st.kind === 'android' || st.kind === 'saf') {
        const where = st.kind === 'saf' ? esc(st.label.replace('Klasör · ', '')) : 'Belgeler/Etütler';
        if (st.needsPermission) { txt = `Yedek klasörüne (${where}) artık yazılamıyor. Klasörü yeniden seç.`; btns = '<button class="btn sm pri" data-bk="pick">Klasörü yeniden seç</button><button class="btn sm" data-bk="default">Belgeler/Etütler kullan</button>'; }
        else {
          txt = st.on ? `Yedek klasörü: ${where} · her etüt kendi klasöründe, her engel ayrı klasörde.${t ? ' Son yedek: ' + t : ''}` : 'Klasör yedeği kapalı.';
          btns = `${st.on ? '<button class="btn sm" data-bk="now">Şimdi yedekle</button>' : '<button class="btn sm pri" data-bk="on">Yedeği aç</button>'}${st.canPick ? `<button class="btn sm" data-bk="pick">${st.kind === 'saf' ? 'Klasörü değiştir' : 'Klasör seç'}</button>` : ''}${st.kind === 'saf' ? '<button class="btn sm" data-bk="default">Belgeler/Etütler kullan</button>' : ''}<button class="btn sm" data-bk="restore">Yedekten geri yükle</button>`;
        }
      } else if (!st.on) { txt = 'Etütleri bir klasöre otomatik yedekle. OneDrive içindeki bir klasör seçersen yedek buluta da gider.'; btns = '<button class="btn sm pri" data-bk="pick">Yedek klasörü seç</button>'; }
      else if (st.needsPermission) { txt = `Yedek klasörü: ${esc(st.label.replace('Klasör · ', ''))}. Tarayıcı yeniden açıldığı için yazma izni gerekiyor.`; btns = '<button class="btn sm pri" data-bk="grant">Yedeğe izin ver</button><button class="btn sm" data-bk="pick">Klasörü değiştir</button>'; }
      else { txt = `Yedek klasörü: ${esc(st.label.replace('Klasör · ', ''))} · her etüt kendi klasöründe, her engel ayrı klasörde.${t ? ' Son yedek: ' + t : ''}`; btns = '<button class="btn sm" data-bk="now">Şimdi yedekle</button><button class="btn sm" data-bk="pick">Klasörü değiştir</button>'; }
      bkl.innerHTML = `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><div class="row" style="gap:8px;min-width:0;flex:1">${tag}<span class="hint" style="font-size:13px">${txt}${st.error ? ' · ' + esc(st.error) : ''}</span></div><div class="row" style="gap:8px">${btns}</div></div>`;
    };
    const off = Backup.onChange(bkDraw); bkDraw(Backup.status());
    bkl.onclick = async e => {
      const b = e.target.closest('[data-bk]'); if (!b) return; e.stopPropagation();
      try {
        if (b.dataset.bk === 'pick') await Backup.chooseFolder();
        if (b.dataset.bk === 'grant') await Backup.grant();
        if (b.dataset.bk === 'now') { await Backup.backupAll(); toast('Yedek güncellendi'); }
        if (b.dataset.bk === 'on') await Backup.setOn(true);
        if (b.dataset.bk === 'default') { await Backup.useDefault(); toast('Yedek Belgeler/Etütler klasörüne yazılıyor'); }
        if (b.dataset.bk === 'restore') {
          const L = await Backup.restoreList();
          if (!L.length) return toast('Belgeler/Etütler içinde yedek bulunamadı');
          sheet('Yedekten geri yükle', L.map(x => ({ label: x.name, run: () => openEtut(x.source) })));
        }
      } catch (er) { if (er && er.name !== 'AbortError') toast(er.message || 'Yedek işlemi yapılamadı'); }
    };
    const ob = document.getElementById('openEtut');
    if (ob) ob.onclick = () => sheet('Etüt dosyası aç', [
      { label: 'ZIP dosyası seç', file: true, accept: '.zip,application/zip', run: f => openEtut(() => Transfer.readZip(f)) },
      { label: 'Açılmış klasör seç', file: true, dir: true, multi: true, accept: '*/*', run: fs => openEtut(async () => Transfer.folderSource(fs)) },
    ]);
  };

  /* ----- moving a survey: tablet "Dışa Aktar" -> one ZIP -> computer "Etüt dosyası aç" ----- */
  async function exportNow(sv, btn) {
    let handle = null;   // computer (Edge/Chrome): ask where to save first, e.g. the OneDrive folder
    if (!window.Capacitor && window.showSaveFilePicker) {
      try { handle = await window.showSaveFilePicker({ suggestedName: Transfer.fileNameOf(sv), types: [{ description: 'Etüt dosyası', accept: { 'application/zip': ['.zip'] } }] }); }
      catch (e) { if (e && e.name === 'AbortError') return; handle = null; }
    }
    if (btn) btn.disabled = true;
    const tt = document.createElement('div'); tt.className = 'toast'; tt.style.bottom = '50%'; document.body.appendChild(tt);
    try {
      const r = await Transfer.exportSurvey(sv, (i, n) => { tt.textContent = `Dosya hazırlanıyor… ${i} / ${n}`; });
      tt.remove();
      if (r.blob && handle) { const w = await handle.createWritable(); await w.write(r.blob); await w.close(); toast(`Kaydedildi: ${handle.name}`); }
      else if (r.blob) {   // browser without a save dialog: download
        const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.fileName; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        toast(`${r.fileName} indirildi`);
      } else toast(r.where ? `Kaydedildi: ${r.where}` : 'Dosya hazırlandı');
    } catch (e) { tt.remove(); toast('Dışa aktarılamadı: ' + (e && e.message || e)); }
    if (btn) btn.disabled = false;
  }
  async function openEtut(getSource) {
    const tt = document.createElement('div'); tt.className = 'toast'; tt.style.bottom = '50%'; tt.textContent = 'Dosya okunuyor…'; document.body.appendChild(tt);
    try {
      const pkg = await Transfer.readSurvey(await getSource());
      tt.remove();
      const sv = pkg.doc.survey, old = await DB.getSurvey(sv.id), name = `${sv.project.start.name} → ${sv.project.end.name}`;
      const run = async mode => {
        const t2 = document.createElement('div'); t2.className = 'toast'; t2.style.bottom = '50%'; document.body.appendChild(t2);
        const s2 = await Transfer.saveImported(pkg, mode, (i, n) => { t2.textContent = `Etüt açılıyor… ${i} / ${n}`; });
        t2.remove(); toast(`${name}: ${s2.records.length} kayıt açıldı`); go(`#/s/${s2.id}`);
      };
      if (!old) return run('replace');
      sheet(`${name} bu bilgisayarda zaten var`, [
        { label: 'Üzerine yaz (dosyadaki hali geçerli)', cls: 'pri', run: () => run('replace') },
        { label: 'Ayrı kopya olarak aç', run: () => run('copy') },
      ]);
    } catch (e) { tt.remove(); toast(e && e.message || 'Dosya açılamadı'); }
  }

  // ----- project form (new / edit) -----
  V.form = async (id) => {
    const sv = id ? await DB.getSurvey(id) : null;
    const last = (await DB.getSetting('defaults')) || {};
    const p = sv ? sv.project : {
      start: { name: '' }, end: { name: '' }, company: last.company || 'CJ ICM / Çaba Misnak Project Logistics Heavy Lifting and Engineering Inc.', companyShort: last.companyShort || 'CABAMISNAK',
      preparedBy: last.preparedBy || [], rev: '00', reference: '', client: '', preparedFor: '', formCode: last.formCode || 'PL-WI-03/210114/070317/01',
      cargo: {}, refLV: '', refMV: '', refHV: '', conclusion: { bridge: 'required' },
    };
    const c = cargoOf(p);
    const logos = sv ? sv.logos : {};
    const compLogo = await blobUrl(await DB.getSetting('companyLogo'));
    const pv = async (bid, fallback) => { const u = await blobUrl(bid); return u ? `<img src="${u}" alt="">` : (fallback || imgSvg + ' Yükle'); };
    const slot = async (key, title, note, bid, fallback) => `<label class="logo"><b>${title}</b><span class="pv" id="pv-${key}">${await pv(bid, fallback)}</span><span>${note}</span><input class="hid" type="file" accept="image/*" data-logo="${key}"></label>`;
    const LG = sv ? logosOf(sv) : { ids: {}, pos: { company: 'tl', client1: 'tr', client2: 'br', owner: 'bl' }, cover: { tl: ['company'], tr: ['client1'], mid: ['company'], row: ['client1', 'client2'] } };
    const cover = JSON.parse(JSON.stringify(LG.cover));
    const LNAME = { company: 'İşi yapan', client1: 'Müşteri-1', client2: 'Müşteri-2', owner: 'İşin sahibi' };
    const AREAS = [['tl', 'Sol üst kutu', 'alt alta'], ['tr', 'Sağ üst kutu', 'alt alta'], ['mid', 'Ortadaki büyük logo', 'alt alta'], ['row', 'Müşteri satırı', 'yan yana']];
    const coverRow = ([a, t, how]) => `<div class="row" style="flex-wrap:wrap;gap:6px"><span style="width:150px;font-size:13px;font-weight:600">${t} <span class="hint">(en çok 2, ${how})</span></span>
      ${Object.keys(LNAME).map(k => { const i = cover[a].indexOf(k); return `<button type="button" class="chip ${i >= 0 ? 'on' : ''}" data-ca="${a}" data-ck="${k}" style="min-height:36px;padding:5px 10px;font-size:13px;border-radius:8px">${i >= 0 && cover[a].length > 1 ? (i + 1) + '. ' : ''}${LNAME[k]}</button>`; }).join('')}</div>`;
    const logoPos = Object.assign({}, LG.pos), removed = {};
    const CORNERS = [['tl', 'Sol üst'], ['tr', 'Sağ üst'], ['bl', 'Sol alt'], ['br', 'Sağ alt']];
    const posPick = key => `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px">${CORNERS.map(([v, t]) => `<button type="button" class="chip ${logoPos[key] === v ? 'on' : ''}" data-lp="${key}" data-v="${v}" style="min-height:34px;padding:4px 6px;font-size:12px;border-radius:8px">${t}</button>`).join('')}</div>`;
    const lslot = async (key, title, bid, fallback, note) => `<div class="logo" style="cursor:default"><b>${title}</b>
        <label class="pv" id="pv-${key}" style="cursor:pointer">${await pv(bid, fallback)}<input class="hid" type="file" accept="image/*" data-logo="${key}"></label>
        <span>${note}</span>${posPick(key)}
        ${key !== 'company' && bid ? `<button type="button" class="btn sm" data-lrm="${key}" style="min-height:32px;font-size:12px;color:var(--badtx)">Kaldır</button>` : ''}</div>`;
    const refsOpen = p.refLV != null && p.refLV !== '' || p.refMV != null && p.refMV !== '' || p.refHV != null && p.refHV !== '';
    const imp = !sv && IMPORT ? IMPORT : null;
    $app.innerHTML = `${bar(sv ? 'Etüt bilgileri' : imp ? 'Fotoğraflardan etüt · bilgiler' : 'Yeni etüt raporu', sv ? `#/s/${sv.id}` : imp ? '#/import' : '#/')}
    <form class="split even" id="pf" autocomplete="off">
      <div class="pane">
        ${imp ? `<div class="note g">${imp.items.length} fotoğraf, çekim saatine göre sıralanıp engel olarak eklenecek${imp.items.some(x => x.lat == null) ? ` (${imp.items.filter(x => x.lat == null).length} tanesinde konum yok)` : ''}. Etüt bilgilerini girip kaydet.</div>` : ''}
        <div class="sec">Güzergah</div>
        <div class="g2"><label class="f">Başlangıç noktası<input name="start" required value="${esc(p.start.name)}" placeholder="Fabrika / saha adı"></label>
          <label class="f">Varış noktası<input name="end" required value="${esc(p.end.name)}" placeholder="Liman / saha adı"></label></div>
        <div class="sec">Etüt künyesi</div>
        <div class="row" role="radiogroup" aria-label="Bölge" style="flex-wrap:wrap;gap:8px">${REGIONS.map(g => `<button type="button" class="chip ${p.region === g ? 'on' : ''}" data-region="${g}" style="border-radius:12px">${g}</button>`).join('')}</div>
        <div class="g2"><label class="f">Proje kodu<input name="projectCode" list="dlPcode" value="${esc(p.projectCode || '')}" placeholder="ör. P-2026-014"></label>
          <label class="f">Proje adı<input name="projectName" list="dlPname" value="${esc(p.projectName || '')}"></label></div>
        <div class="g2"><label class="f">Etüdü yapan(lar)<input name="surveyors" value="${esc((p.surveyors || (sv ? [] : [(Auth.user() || {}).name].filter(Boolean))).join(', '))}" placeholder="Ad Soyad, virgülle ayır"></label>
          <label class="f">Firma (etüdün yapıldığı)<input name="client" list="dlClient" value="${esc(p.client)}" placeholder="Müşteri firma"></label></div>
        ${await dataLists()}
        <div class="sec">Taşıma bilgileri</div>
        <div class="g2" role="radiogroup" aria-label="Etüt türü">
          <button type="button" class="chip ${p.general ? '' : 'on'}" data-kind="cargo" style="border-radius:12px">Belirli bir yük için</button>
          <button type="button" class="chip ${p.general ? 'on' : ''}" data-kind="general" style="border-radius:12px">Genel etüt</button></div>
        <span class="hint" id="kindHint">${p.general ? 'Yük ölçüsü girilmez. Engeller ölçülüp kaydedilir; otomatik yükseklik kontrolü ve renklendirme yapılmaz, renkler elle seçilir.' : ''}</span>
        <div id="cargoBox" style="display:${p.general ? 'none' : 'flex'};flex-direction:column;gap:12px">
        <div class="g4"><label class="f">Uzunluk (m)<input name="length" inputmode="decimal" value="${esc(fmt(c.length))}"></label>
          <label class="f">Genişlik (m)<input name="width" inputmode="decimal" value="${esc(fmt(c.width))}"></label>
          <label class="f">Yükseklik (m)<input name="height" inputmode="decimal" ${p.general ? '' : 'required'} value="${esc(fmt(c.height))}" style="font-weight:600;border:2px solid var(--navy)"></label>
          <label class="f">Ağırlık (ton)<input name="weight" inputmode="decimal" value="${esc(fmt(c.weight))}"></label></div>
        <span class="hint">Yükseklik, üst yapı ve enerji hattı kontrollerinde sınır olarak kullanılır.</span>
        <details ${refsOpen ? 'open' : ''} class="card" style="gap:8px"><summary style="font-size:14px;font-weight:600;color:var(--navy);cursor:pointer">Enerji hattı referans yükseklikleri (otomatik)</summary>
          <span class="hint">Boş bırakırsan taşıma yüksekliğinin 1 / 3 / 4 m fazlası kullanılır. Hat bu yüksekliğin altındaysa kayıt renklenir (AG sarı, OG magenta, YG mor) ve enerji kesme cümlesi eklenir.</span>
          <div class="g3"><label class="f">AG (m)<input name="refLV" inputmode="decimal" value="${esc(fmt(p.refLV))}" id="rLV"></label>
            <label class="f">OG (m)<input name="refMV" inputmode="decimal" value="${esc(fmt(p.refMV))}" id="rMV"></label>
            <label class="f">YG (m)<input name="refHV" inputmode="decimal" value="${esc(fmt(p.refHV))}" id="rHV"></label></div></details>
        </div>
        <div class="office-only" style="display:flex;flex-direction:column;gap:14px">
        <div class="sec">Kapak bilgileri</div>
        <div class="g2"><label class="f">Kimin için hazırlandığı<input name="preparedFor" value="${esc(p.preparedFor)}" placeholder="Boşsa firma adı yazılır"></label><span></span></div>
        <div class="g2"><label class="f">Proje referansı<input name="reference" value="${esc(p.reference)}"></label><label class="f">Rev. no<input name="rev" value="${esc(p.rev)}"></label></div>
        </div>
        ${FIELD ? '<div class="note g">Kapak bilgileri, logolar, kapak fotoğrafı, taşıma çizimi ve sonuç bölümü ofiste, bilgisayardaki uygulamada girilir. Etüt bitince "Dışa Aktar" ile dosyayı bilgisayara gönder.</div>' : ''}
      </div>
      <div class="pane office-only">
        <label class="f">Hazırlayanlar (her satıra bir isim)<textarea name="preparedBy" rows="3">${esc((p.preparedBy || []).join('\n'))}</textarea></label>
        <div class="sec">Logolar · PDF'te duracağı köşe</div>
        <div class="g4">${await lslot('company', '1 · İşi yapan', null, compLogo ? `<img src="${compLogo}" alt="">` : '<img src="assets/logo_company.jpg" alt="">', 'Her etütte hazır')}
          ${await lslot('client1', '2 · Müşteri-1', LG.ids.client1, null, 'İsteğe bağlı')}${await lslot('client2', '3 · Müşteri-2', LG.ids.client2, null, 'İsteğe bağlı')}${await lslot('owner', '4 · İşin sahibi', LG.ids.owner, null, 'İsteğe bağlı')}</div>
        <span class="hint">Köşe seçimi iç sayfalar içindir. Logolar oranı bozulmadan küçültülür ve sayfa kenar boşluklarının içinde kalır.</span>
        <div class="sec">Kapak sayfası düzeni</div>
        <div class="card" id="coverPick" style="gap:8px">${AREAS.map(coverRow).join('')}</div>
        <div class="g2">${await slot('cover', 'Kapak fotoğrafı', 'Boşsa standart', logos.cover, '<img src="assets/cover_photo.jpg" alt="">')}${await slot('drawing', 'Taşıma çizimi', 'Resim (JPG/PNG)', logos.drawing)}</div>
      </div>
    </form>
    <div class="foot"><button class="btn pri" id="save">${sv ? 'Kaydet' : 'Etüdü başlat'}</button></div>`;
    const f = document.getElementById('pf'), pending = {};
    const showRefs = () => { const h = pn(f.height.value); [['rLV', 1], ['rMV', 3], ['rHV', 4]].forEach(([k, d]) => { document.getElementById(k).placeholder = h == null ? '' : fmt(h + d, 2); }); };
    f.height.addEventListener('input', showRefs); showRefs();
    let general = !!p.general, region = p.region || '';
    f.querySelectorAll('[data-region]').forEach(b => b.onclick = () => { region = region === b.dataset.region ? '' : b.dataset.region; f.querySelectorAll('[data-region]').forEach(x => x.classList.toggle('on', x.dataset.region === region)); });
    f.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
      general = b.dataset.kind === 'general';
      f.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b));
      document.getElementById('cargoBox').style.display = general ? 'none' : 'flex';
      f.height.required = !general;
      document.getElementById('kindHint').textContent = general ? 'Yük ölçüsü girilmez. Engeller ölçülüp kaydedilir; otomatik yükseklik kontrolü ve renklendirme yapılmaz, renkler elle seçilir.' : '';
    });
    f.addEventListener('click', e => {
      const b = e.target.closest('[data-lp]');
      if (b) { logoPos[b.dataset.lp] = b.dataset.v; f.querySelectorAll(`[data-lp="${b.dataset.lp}"]`).forEach(x => x.classList.toggle('on', x === b)); }
      const ca = e.target.closest('[data-ca]');
      if (ca) {
        const a = ca.dataset.ca, k = ca.dataset.ck, list = cover[a], i = list.indexOf(k);
        if (i >= 0) list.splice(i, 1); else { list.push(k); if (list.length > 2) list.shift(); }
        document.getElementById('coverPick').innerHTML = AREAS.map(coverRow).join('');
      }
      const rm = e.target.closest('[data-lrm]');
      if (rm) { removed[rm.dataset.lrm] = true; delete pending[rm.dataset.lrm]; document.getElementById('pv-' + rm.dataset.lrm).firstChild.replaceWith(document.createRange().createContextualFragment(imgSvg + ' Yükle')); rm.remove(); }
    });
    f.querySelectorAll('[data-logo]').forEach(inp => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      const key = inp.dataset.logo, blob = await shrink(inp.files[0], key === 'drawing' ? 3000 : key === 'cover' ? 1800 : 1200);
      pending[key] = blob; delete removed[key];
      const pvEl = document.getElementById('pv-' + key); [...pvEl.childNodes].forEach(n => { if (n !== inp) n.remove(); }); pvEl.insertAdjacentHTML('afterbegin', `<img src="${URL.createObjectURL(blob)}" alt="">`);
    }));
    document.getElementById('save').onclick = async () => {
      if (!f.reportValidity()) return;
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const now = new Date();
      const s = sv || { id: DB.uid(), createdAt: Date.now(), status: 'active', records: [], bypassParent: null, selected: null, logos: {}, project: p };
      const cargo = { length: pn(f.length.value), width: pn(f.width.value), height: pn(f.height.value), weight: pn(f.weight.value) };
      Object.assign(s.project, {
        start: { name: f.start.value.trim() }, end: { name: f.end.value.trim() },
        title: `ROUTE SURVEY REPORT FROM\n${f.start.value.trim().toUpperCase()} TO ${f.end.value.trim().toUpperCase()}`,
        client: f.client.value.trim(), preparedFor: f.preparedFor.value.trim() || f.client.value.trim(), reference: f.reference.value.trim(), rev: f.rev.value.trim(),
        preparedBy: f.preparedBy.value.split('\n').map(x => x.trim()).filter(Boolean), executedBy: s.project.companyShort,
        region, projectCode: f.projectCode.value.trim(), projectName: f.projectName.value.trim(),
        surveyors: f.surveyors.value.split(',').map(x => x.trim()).filter(Boolean),
        general, cargo, minHeight: general ? null : cargo.height, refLV: pn(f.refLV.value), refMV: pn(f.refMV.value), refHV: pn(f.refHV.value),
      });
      if (!sv) { s.project.date = `${months[now.getMonth()]} ${now.getFullYear()}`; s.project.surveyDate = `${full[now.getMonth()]}, ${now.getFullYear()}`; }
      // move older 'client' / 'partner' logos into the new slots
      if (s.logos.client && !s.logos.client1) s.logos.client1 = s.logos.client; if (s.logos.partner && !s.logos.client2) s.logos.client2 = s.logos.partner;
      delete s.logos.client; delete s.logos.partner;
      for (const k of ['client1', 'client2', 'owner']) if (removed[k]) { await DB.delBlob(s.logos[k]); delete s.logos[k]; }
      for (const k of ['client1', 'client2', 'owner', 'cover', 'drawing']) if (pending[k]) { await DB.delBlob(s.logos[k]); s.logos[k] = await DB.putBlob(pending[k]); }
      s.logoPos = logoPos; s.coverLogos = cover;
      if (pending.company) { await DB.delBlob(await DB.getSetting('companyLogo')); await DB.setSetting('companyLogo', await DB.putBlob(pending.company)); }
      await DB.setSetting('defaults', { company: s.project.company, companyShort: s.project.companyShort, preparedBy: s.project.preparedBy, formCode: s.project.formCode });
      await DB.putSurvey(s);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      if (imp) { await importInto(s, imp.items); IMPORT = null; }
      go(`#/s/${s.id}`);
    };
  };

  // ----- active survey: obstacle list on the left, actions on the right -----
  const BKICON = {
    ok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1F7A3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.3 10.1 4 4 0 0 0 7 18z"/><path d="m9 13.2 2.1 2.1 4-4"/></svg>',
    pending: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#C26A00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.3 10.1 4 4 0 0 0 7 18z"/><path d="M12 16v-5m-2.3 2.2L12 11l2.3 2.2"/></svg>',
    off: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#8A93A0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.3 10.1 4 4 0 0 0 7 18z"/><path d="M4 4l16 16"/></svg>',
  };
  const BKTITLE = { ok: 'Yedeklendi', pending: 'Yedeklenmeyi bekliyor', off: 'Yedek kapalı' };
  const SELST = {};
  const LSCROLL = {};   // list scroll position per survey and tab, kept while the app is open   // per survey: selection mode survives the redraw after a move
  V.survey = async (id) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const act = sv.status === 'active';
    const st = settingsOf(sv), recs = orderedRecords(sv);
    const pick = sv.insertAfter && sv.records.find(r => r.id === sv.insertAfter && !r.archived) ? sv.insertAfter : null;   // new obstacles go after this one
    const status = r => {
      const s = R.suggest(r, st), col = R.highlightOf(r, st);
      if (col) return `<span class="tag bad">${COLNAME[col] || col}</span>`;
      if (/Overhead/.test(r.obstacle) && s.action) return '<span class="tag ok">Uygun</span>';
      return '';
    };
    const line = async (r, sub) => {
      const u = await blobUrl(r.photoId), hs = (r.heights || []).filter(h => h.value != null).map(h => `${h.label} ${fmt(h.value)} m`).join(' · ');
      const txt = (r.actions || r.remarks || '').slice(0, 90);
      return `<div role="button" tabindex="0" class="rec ${sub ? 'sub' : ''} ${pick === r.id ? 'on' : ''}" data-rec="${r.id}">${u ? `<img src="${u}" alt="">` : `<span class="ph" style="display:flex;align-items:center;justify-content:center;color:#5B6B80;flex-direction:column;font-size:11px;gap:2px">${r.pendingImage ? imgSvg + 'Ofiste eklenecek' : ''}</span>`}
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span class="t">${r.flag ? `<span class="tag sub">${r.no} ${r.flag}</span> ` : r.no + ' · '}${r.obstacle ? esc(r.obstacle) : '<span style="color:var(--badtx)">Tip seçilmedi</span>'}</span>
        <span class="s">${r.latDec == null ? '<b style="color:var(--warntx)">konum yok</b>' : r.kmManual != null ? 'KM ' + fmt(r.kmManual, 1) : ''}${r.fields && r.fields.type ? ' · ' + esc(r.fields.type) : ''}${hs ? ' · ' + hs : ''}${(r.extras || []).length ? ` · <b style="color:var(--navy)">+${r.extras.length} ek foto</b>` : ''}</span>
        ${txt ? `<span class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(txt)}</span>` : ''}</span>${status(r)}<span class="bkic" data-bkr="${r.id}" aria-hidden="true"></span><button class="btn sm det" data-open="${r.id}">Detay göster</button></div>`;
    };
    const keep = SELST[id] || { on: false, ids: [], tab: 's' }, tab = keep.tab || 's';
    const arch = archivedRecords(sv);
    const group = async list => {
      let h = '';
      for (const m of list.filter(r => !r.parentId || r.solo)) {
        const subs = m.solo ? [] : list.filter(r => r.parentId === m.id);
        h += `<div class="grp">${await line(m)}${subs.length ? `<div class="subs">${(await Promise.all(subs.map(x => line(x, true)))).join('')}</div>` : ''}</div>`;
      }
      return h;
    };
    const html = `<div class="ltabs" role="tablist"><button role="tab" data-tab="s" class="${tab === 's' ? 'on' : ''}">Etüt raporu · ${recs.filter(r => !r.parentId).length}</button>
        <button role="tab" data-tab="a" class="${tab === 'a' ? 'on' : ''}">${esc(sv.project.start.name)}-${esc(sv.project.end.name)} arşivi · ${arch.length}</button></div>`
      + (tab === 's' ? (await group(recs) || '<div class="empty">Henüz engel yok.<br>Sağdaki "Yeni engel ekle" ile ilk fotoğrafı çek.</div>')
        : (await group(arch) || '<div class="empty">Arşiv boş.<br>Yalnızca arşiv için çekilen engelleri engel ekranındaki "Arşive gönder" ile ya da listede basılı tutup seçerek buraya gönderebilirsin. Arşivdekiler rapora girmez.</div>'));
    const bp = sv.bypassParent && recs.find(r => r.id === sv.bypassParent);
    // computer: "Yeni Engel Ekle" opens the file picker (several photos at once), the tablet opens the camera
    const addBtn = FIELD ? `<button class="rb red" data-go="#/cam/${sv.id}">${camSvg}<span>Yeni Engel Ekle</span></button>`
      : `<label class="rb red" style="cursor:pointer">${imgSvg}<span>Yeni Engel Ekle</span><input class="hid" type="file" accept="image/*" multiple id="addph"></label>`;
    const rb = (attrs, cls, icon, label, dis) => `<button class="rb ${cls}" ${attrs} ${dis ? 'disabled' : ''}>${icon || ''}<span>${label}</span></button>`;
    $app.innerHTML = `<div class="bar"><button class="back" data-go="#/" aria-label="Geri">${backSvg}</button>
        <h1>${esc(sv.project.start.name)} &gt; ${esc(sv.project.end.name)}</h1>${minHBox(sv)}${cargoBox(sv.project)}</div>
      <div class="split">
        <div class="pane box" id="list">${html}</div>
        <div class="side">
          <div class="row" style="justify-content:space-between"><span class="count">Engel Sayısı: ${recs.length}</span>
            ${act ? '<span class="hint">Konum fotoğraf çekerken alınır</span>' : '<span class="tag ok">Tamamlandı</span>'}</div>
          <div class="row" style="gap:18px;color:var(--mut);font-size:14px"><span>KM'ler rapor oluşturulurken son sıraya göre hesaplanır</span>
            <span>${recs.filter(r => r.flag === 'BYPASS').length} bypass · ${recs.filter(r => r.flag === 'INFO').length} info</span></div>
          <div class="hint">Engele dokununca seçilir: yeni engeller seçili engelin arkasına eklenir. Düzenlemek, Info / Bypass eklemek için <b>Detay göster</b>. Sırayı değiştirmek için <b>basılı tut ve sürükle</b>; basılı tutunca çoklu seçim de açılır.</div>
          ${pick ? (() => { const pr = recs.find(r => r.id === pick) || archivedRecords(sv).find(r => r.id === pick); return pr ? `<div class="note w row" style="justify-content:space-between;gap:10px"><span>Yeni engeller <b>${pr.no} · ${esc(pr.obstacle || 'Tip seçilmedi')}</b> engelinin arkasına eklenecek.</span><button class="btn sm" data-act="toend" style="min-width:0">Sona ekle</button></div>` : ''; })() : ''}
          ${bp ? `<div class="note g row" style="justify-content:space-between"><span>Bypass açık: <b>${bp.no} · ${esc(bp.obstacle)}</b>. Yeni engeller ${bp.no}-… olarak eklenir.</span></div>` : ''}
          <div class="acts">
            ${act ? rb('data-act="nophoto"', '', '', 'Fotoğrafsız Engel Ekle')
              + rb(`data-go="#/add/${sv.id}?mode=sat"`, '', imgSvg, 'Uydu Fotoğrafı Ekle')
              + rb(`data-go="#/crit/${sv.id}"`, 'navy', '', 'Kritik Engeller') + rb('data-act="export"', '', '', 'Dışa Aktar') + rb('', 'ghost', '', '')
              + (bp ? rb('data-act="endbypass"', 'grn', '', "Bypass'ı Bitir") : rb('', 'ghost', '', ''))
              + rb('data-act="finish"', '', '', 'Etüdü Bitir') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + addBtn
            : rb('data-act="resume"', '', '', 'Etüde Devam Et') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + rb(`data-go="#/crit/${sv.id}"`, '', '', 'Kritik Engeller')
              + (FIELD ? rb('data-act="export"', 'navy', '', 'Dışa Aktar') : rb(`data-go="#/rep/${sv.id}"`, 'navy', '', 'Rapor') + rb('data-act="export"', '', '', 'Dışa Aktar') + rb('', 'ghost', '', '') + rb('', 'ghost', '', '') + rb('', 'ghost', '', '') + addBtn)}
          </div>
        </div>
      </div>`;
    /* list position: a just-added obstacle is brought into view; otherwise the list opens where it was left;
       the first time it opens at the bottom (the latest obstacles) */
    { const lst = document.getElementById('list'), key = id + ':' + tab;
      const tgt = SCROLLTO && lst.querySelector(`.rec[data-rec="${SCROLLTO}"]`); SCROLLTO = null;
      if (tgt) tgt.scrollIntoView({ block: 'center' }); else if (LSCROLL[key] != null) lst.scrollTop = LSCROLL[key]; else lst.scrollTop = lst.scrollHeight;
      LSCROLL[key] = lst.scrollTop;
      lst.addEventListener('scroll', () => { LSCROLL[key] = lst.scrollTop; }, { passive: true }); }

    /* backup mark on every obstacle: green cloud = in the backup folder, orange = changed since / waiting, grey = backup off */
    { const lst = document.getElementById('list');
      const paintBk = async () => {
        if (!lst.isConnected) return offBk();
        const cur = await DB.getSurvey(id); if (!cur) return;
        const { state, recs } = await Backup.recordStatus(cur);
        lst.querySelectorAll('[data-bkr]').forEach(el => {
          const k = state === 'off' ? 'off' : recs[el.dataset.bkr] || 'pending';
          if (el.dataset.k === k) return; el.dataset.k = k;
          el.innerHTML = BKICON[k]; el.title = BKTITLE[k];
        });
      };
      const offBk = Backup.onChange(st => { if (!st.busy) paintBk(); }); paintBk(); }

    /* reorder: long press selects the obstacle and lets you drag it; while selecting, a tap adds/removes an
       obstacle. Numbers are not stored — they follow the list order, so a move renumbers everything. */
    const list = document.getElementById('list');
    let selMode = keep.on, lp = null, drag = null, suppressClick = false, delSure = false;
    let snap = keep.snap || null;   // order when selection started: "İptal" puts it back
    const sel = new Set(keep.ids.filter(x => sv.records.some(r => r.id === x)));
    const isUnit = (c, grp) => grp ? c.classList.contains('grp') : c.classList.contains('rec');
    const unitOf = rec => rec.classList.contains('sub') ? rec : rec.closest('.grp');
    const recOf = u => u.classList.contains('grp') ? u.querySelector(':scope > .rec') : u;
    const remember = () => { SELST[id] = { on: selMode, ids: [...sel], tab, snap: selMode ? snap : null }; };
    const paintSel = () => {
      list.classList.toggle('selmode', selMode);
      list.querySelectorAll('.rec').forEach(b => b.classList.toggle('chk', sel.has(b.dataset.rec)));
      let sb = list.querySelector('.selbar');
      if (!selMode) { if (sb) sb.remove(); remember(); return; }
      if (!sb) { sb = document.createElement('div'); sb.className = 'selbar'; list.appendChild(sb); }   // fixed over the top bar: the list does not shift
      const n = sel.size;
      sb.innerHTML = `<b>${n} engel seçili</b>${tab === 's' ? `<button class="btn" data-sel="up" ${n ? '' : 'disabled'}>▲ Yukarı</button><button class="btn" data-sel="down" ${n ? '' : 'disabled'}>▼ Aşağı</button>
        <button class="btn" data-sel="arc" ${n ? '' : 'disabled'}>Arşive gönder</button>` : `<button class="btn" data-sel="unarc" ${n ? '' : 'disabled'}>Etüde geri al</button>`}
        <button class="btn del" data-sel="del" ${n ? '' : 'disabled'}>${delSure ? 'Emin misin? Sil' : 'Sil'}</button><button class="btn" data-sel="cancel" title="Seçimi bırak, sırayı seçimden önceki haline getir">İptal</button><button class="btn" data-sel="done">Bitti</button>`;
      remember();
    };
    const applyDom = async () => {   // list order on screen -> sv.records (each main followed by its INFO/BYPASS)
      const byId = Object.fromEntries(sv.records.map(r => [r.id, r])), out = [];
      list.querySelectorAll(':scope > .grp').forEach(g => {
        out.push(byId[g.querySelector(':scope > .rec').dataset.rec]);
        g.querySelectorAll(':scope > .subs > .rec').forEach(c => out.push(byId[c.dataset.rec]));
      });
      for (const r of sv.records) if (!out.includes(r)) out.push(r);
      sv.records = out.filter(Boolean); await DB.putSurvey(sv); remember(); V.survey(id);
    };
    const step = async dir => {   // move every selected obstacle one place up/down among its neighbours
      const units = [...new Set([...sel].map(x => list.querySelector(`.rec[data-rec="${x}"]`)).filter(Boolean).map(unitOf))];
      const ordered = [...list.querySelectorAll('.grp, .subs > .rec')].filter(u => units.includes(u));
      if (dir > 0) ordered.reverse();
      let moved = false;
      for (const u of ordered) {
        const grp = u.classList.contains('grp');
        let nb = dir < 0 ? u.previousElementSibling : u.nextElementSibling;
        while (nb && !isUnit(nb, grp)) nb = dir < 0 ? nb.previousElementSibling : nb.nextElementSibling;
        if (!nb || units.includes(nb)) continue;
        if (dir < 0) u.parentElement.insertBefore(u, nb); else u.parentElement.insertBefore(nb, u);
        moved = true;
      }
      if (moved) await applyDom(); else toast(dir < 0 ? 'Zaten en üstte' : 'Zaten en altta');
    };
    const startDrag = (rec, pid) => {
      lp = null; suppressClick = true; if (navigator.vibrate) navigator.vibrate(25);
      if (!selMode) { sel.clear(); snap = sv.records.map(r => r.id); }
      selMode = true; sel.add(rec.dataset.rec); delSure = false; paintSel();
      if (tab === 'a') return;   // the archive is not ordered: long press only selects
      const u = unitOf(rec); u.classList.add('dragging');
      drag = { u, y: null, moved: false, iv: setInterval(() => { if (drag && drag.y != null) { const lr = list.getBoundingClientRect(); if (drag.y < lr.top + 60) list.scrollTop -= 12; else if (drag.y > lr.bottom - 60) list.scrollTop += 12; moveDrag(drag.y); } }, 30) };
      try { list.setPointerCapture(pid); } catch (e) {}
    };
    const moveDrag = y => {
      drag.y = y; const u = drag.u, box = u.parentElement, grp = u.classList.contains('grp');
      const nextU = () => { let n = u.nextElementSibling; while (n && !isUnit(n, grp)) n = n.nextElementSibling; return n; };
      const prevU = () => { let n = u.previousElementSibling; while (n && !isUnit(n, grp)) n = n.previousElementSibling; return n; };
      let n;
      while ((n = nextU()) && y > n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2) { box.insertBefore(n, u); drag.moved = true; }
      while ((n = prevU()) && y < n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2) { box.insertBefore(u, n); drag.moved = true; }
    };
    const endDrag = async () => {
      const { u, moved } = drag; clearInterval(drag.iv); drag = null; u.classList.remove('dragging');
      if (!moved) return;
      const grp = u.classList.contains('grp'), box = u.parentElement;   // other selected obstacles follow the dragged one
      const others = [...box.children].filter(c => c !== u && isUnit(c, grp) && sel.has(recOf(c).dataset.rec));
      let after = u; for (const o of others) { box.insertBefore(o, after.nextSibling); after = o; }
      await applyDom();
    };
    const ap = document.getElementById('addph'); if (ap) ap.onchange = () => addPhotos(sv, ap.files);
    list.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-open]')) return;
      const rec = e.target.closest('.rec'); if (!rec || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const pid = e.pointerId; suppressClick = false;
      lp = { x0: e.clientX, y0: e.clientY, t: setTimeout(() => startDrag(rec, pid), 450) };
    });
    list.addEventListener('pointermove', e => {
      if (drag) return moveDrag(e.clientY);
      if (lp && Math.hypot(e.clientX - lp.x0, e.clientY - lp.y0) > 10) { clearTimeout(lp.t); lp = null; }
    });
    const pend = () => { if (lp) { clearTimeout(lp.t); lp = null; } if (drag) endDrag(); };
    list.addEventListener('pointerup', pend); list.addEventListener('pointercancel', pend);
    list.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
    list.addEventListener('contextmenu', e => e.preventDefault());
    if (selMode) paintSel();

    $app.onclick = async e => {
      const sb = e.target.closest('[data-sel]');
      if (sb) {
        const k = sb.dataset.sel;
        if (k === 'done') { selMode = false; sel.clear(); delSure = false; snap = null; return paintSel(); }
        if (k === 'cancel') {   // back to the order before this selection; nothing stays selected
          const was = snap || []; selMode = false; sel.clear(); delSure = false; snap = null;
          const pos = Object.fromEntries(was.map((x, i) => [x, i])), before = sv.records.map(r => r.id).join();
          sv.records = sv.records.map((r, i) => [r, pos[r.id] != null ? pos[r.id] : was.length + i]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
          SELST[id] = { on: false, ids: [], tab };
          if (sv.records.map(r => r.id).join() !== before) { await DB.putSurvey(sv); toast('Sıra eski haline döndü'); }
          return V.survey(id);
        }
        if (k === 'up' || k === 'down') return step(k === 'up' ? -1 : 1);
        if (k === 'arc' || k === 'unarc') {   // archive: kept with the survey, left out of the report, numbering and KM
          const on = k === 'arc', hit = sv.records.filter(x => sel.has(x.id));
          for (const x of hit) x.archived = on;
          if (on && hit.some(x => x.id === sv.bypassParent)) sv.bypassParent = null;
          SELST[id] = { on: false, ids: [], tab }; await DB.putSurvey(sv);
          toast(on ? `${hit.length} engel arşive gönderildi` : `${hit.length} engel etüde geri alındı`); return V.survey(id);
        }
        if (k === 'del') {
          if (!delSure) { delSure = true; return paintSel(); }
          const gone = sv.records.filter(x => sel.has(x.id) || sel.has(x.parentId));
          for (const x of gone) for (const b of [x.photoId, ...(x.extras || [])]) await DB.delBlob(b);
          sv.records = sv.records.filter(x => !gone.includes(x));
          if (gone.some(x => x.id === sv.bypassParent)) sv.bypassParent = null;
          if (gone.some(x => x.id === sv.selected)) sv.selected = null;
          delete SELST[id]; await DB.putSurvey(sv); toast(`${gone.length} kayıt silindi`); return V.survey(id);
        }
      }
      const tb = e.target.closest('[data-tab]');
      if (tb) { SELST[id] = { on: false, ids: [], tab: tb.dataset.tab }; return V.survey(id); }
      const op = e.target.closest('[data-open]');
      if (op) { if (suppressClick) { suppressClick = false; return; } delete SELST[id]; return go(`#/r/${sv.id}/${op.dataset.open}`); }
      const rc = e.target.closest('[data-rec]');
      if (rc) {
        if (suppressClick) { suppressClick = false; return; }
        if (selMode) { const k = rc.dataset.rec; sel.has(k) ? sel.delete(k) : sel.add(k); delSure = false; return paintSel(); }
        const k = rc.dataset.rec; sv.insertAfter = sv.insertAfter === k ? null : k;   // tap again to unselect
        await DB.putSurvey(sv); return V.survey(id);
      }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'export') return exportNow(sv, a);
      if (a.dataset.act === 'toend') { sv.insertAfter = null; await DB.putSurvey(sv); return V.survey(id); }
      if (a.dataset.act === 'nophoto') return createRecord(sv, { useGps: true, parent: bp || null, flag: bp ? 'BYPASS' : '' });
      if (a.dataset.act === 'endbypass') sv.bypassParent = null;
      if (a.dataset.act === 'finish') { if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.querySelector('span').textContent = 'Emin misin? Dokun'; a.style.borderColor = 'var(--red)'; return; } sv.status = 'done'; sv.bypassParent = null; }
      if (a.dataset.act === 'resume') sv.status = 'active';
      await DB.putSurvey(sv); V.survey(id);
    };
  };

  // ----- in-app camera: live view, satellite icon top right (green = precise position) -----
  const satSvg = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/></svg>';
  const PRECISE = 10, OK = 30;   // metres: green / yellow
  V.camera = async (id, q) => {
    q = q || {};
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const recs = orderedRecords(sv), bp = sv.bypassParent && recs.find(r => r.id === sv.bypassParent);
    const infoParent = q.info ? recs.find(r => r.id === q.info) : null, target = q.replace ? sv.records.find(r => r.id === q.replace) : null;
    const extraFor = q.extra ? recs.find(r => r.id === q.extra) : null;   // extra photos: camera stays open, shot after shot
    let shots = 0;
    const back = target ? `#/r/${sv.id}/${target.id}` : infoParent ? `#/r/${sv.id}/${infoParent.id}` : extraFor ? `#/r/${sv.id}/${extraFor.id}` : `#/s/${sv.id}`;
    document.body.style.background = '#000';
    $app.innerHTML = `<div style="flex:1;min-height:0;display:flex;background:#000;color:#fff;position:relative">
      <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px">
        <div id="vf" style="position:relative;height:100%;aspect-ratio:4/3;max-width:100%;background:#111;overflow:hidden;border-radius:6px">
          <video id="vid" playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
          <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(#fff3,#fff3) 33.33% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 66.66% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 0 33.33%/100% 1px no-repeat,linear-gradient(#fff3,#fff3) 0 66.66%/100% 1px no-repeat"></div>
          <div id="cmsg" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:15px;color:#E5E7EB"></div>
          ${extraFor ? `<span class="tag" style="position:absolute;left:12px;top:12px;font-size:13px;background:#fff;color:#111">${extraFor.no} · ek fotoğraf: <b id="xc">0</b></span>`
            : target ? `<span class="tag" style="position:absolute;left:12px;top:12px;font-size:13px;background:#fff;color:#111">${target.no} · fotoğrafı değiştir</span>`
            : infoParent ? `<span class="tag sub" style="position:absolute;left:12px;top:12px;font-size:13px">${infoParent.no} → INFO</span>`
            : bp ? `<span class="tag sub" style="position:absolute;left:12px;top:12px;font-size:13px">${bp.no} BYPASS</span>` : ''}
        </div>
      </div>
      <div style="width:180px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:16px 12px">
        <div id="sat" style="${extraFor ? 'visibility:hidden;' : ''}display:flex;flex-direction:column;align-items:center;gap:4px;color:#9CA3AF;font-size:12px;text-align:center;min-height:70px">${satSvg}<span id="sact">Konum aranıyor…</span></div>
        <button id="shut" aria-label="Fotoğraf çek" style="width:96px;height:96px;border-radius:50%;border:5px solid #fff;background:transparent;padding:0;display:flex;align-items:center;justify-content:center"><span style="width:76px;height:76px;border-radius:50%;background:#fff;display:block"></span></button>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <label class="btn sm" style="background:#1F2937;color:#fff;border-color:#374151;cursor:pointer">${imgSvg} Galeri<input class="hid" type="file" accept="image/*" id="cgal" multiple></label>
          <button class="btn sm" id="cclose" style="${extraFor ? 'background:#22C55E;border-color:#22C55E;color:#06260F' : 'background:#1F2937;color:#fff;border-color:#374151'}">${extraFor ? 'Bitti · seç' : 'Kapat'}</button>
        </div>
      </div></div>`;
    const vid = document.getElementById('vid'), msg = document.getElementById('cmsg'), sat = document.getElementById('sat'), sact = document.getElementById('sact');
    let stream = null, busy = false;
    const paint = () => {
      const f = GPS.fresh(8000);
      const col = GPS.err ? '#F87171' : !f ? '#9CA3AF' : f.acc <= PRECISE ? '#22C55E' : f.acc <= OK ? '#FACC15' : '#F97316';
      sat.style.color = col;
      sact.textContent = GPS.err === 'izin' ? 'Konum izni yok' : GPS.err === 'yok' ? 'Konum yok' : !f ? 'Konum aranıyor…' : f.acc <= PRECISE ? `Hassas konum ±${Math.round(f.acc)} m` : `±${Math.round(f.acc)} m`;
    };
    if (!extraFor) { GPS.last = null; GPS.on(paint); paint(); }
    const tick = setInterval(paint, 2000);
    const stop = () => { clearInterval(tick); GPS.off(); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; document.body.style.background = ''; window.removeEventListener('hashchange', stop); };
    window.addEventListener('hashchange', stop);
    const fallback = text => { msg.style.display = 'flex'; msg.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;align-items:center"><span>${text}</span><label class="btn red" style="cursor:pointer">${camSvg} Telefonun kamerasıyla çek<input class="hid" type="file" accept="image/*" capture="environment" id="cnat"></label></div>`;
      document.getElementById('cnat').onchange = e => e.target.files[0] && save(e.target.files[0]); };
    async function save(blob, fromGallery, fromCam) {
      if (extraFor) {   // keep shooting; each photo is kept as a candidate for this obstacle
        const rr = sv.records.find(x => x.id === extraFor.id);
        rr.extras = rr.extras || []; rr.extras.push(await DB.putBlob(await to43(blob)));
        await DB.putSurvey(sv); shots += 1; document.getElementById('xc').textContent = shots; return;
      }
      if (busy) return; busy = true;
      const ready = !fromGallery && fromCam;   // camera shots are already cropped 4:3 at final size
      const pos = GPS.fresh(8000);            // no waiting: without a fresh fix the position follows in the background
      if (pos) await placeLate(pos);          // an earlier photo still waiting gets this fix first (keeps the KM order)
      stop();
      if (target) {   // replace the photo, keep the record's position (fill it in if it had none)
        await DB.delBlob(target.photoId); urls.delete(target.photoId);
        target.photoId = await DB.putBlob(ready ? blob : await to43(blob)); target.pendingImage = null;
        if (target.latDec == null && pos) { target.latDec = pos.lat; target.lonDec = pos.lon; target.lat = Geo.dms(pos.lat, true); target.lon = Geo.dms(pos.lon, false); }
        await DB.putSurvey(sv); return go(back);
      }
      if (infoParent) return createRecord(sv, { file: blob, ready, parent: infoParent, flag: 'INFO', name: infoParent.obstacle === 'Satellite View' ? 'Satellite View' : '' });
      createRecord(sv, { file: blob, ready, pos: fromGallery ? null : pos, useGps: false, late: !fromGallery && !pos, parent: bp || null, flag: bp ? 'BYPASS' : '' });
    }
    document.getElementById('shut').onclick = () => {
      if (!stream || !vid.videoWidth) return;
      const w = vid.videoWidth, h = vid.videoHeight; let cw = w, ch = w * 3 / 4; if (ch > h) { ch = h; cw = h * 4 / 3; }
      const c = document.createElement('canvas'); c.width = Math.min(1600, Math.round(cw)); c.height = Math.round(c.width * 3 / 4);
      c.getContext('2d').drawImage(vid, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height);
      document.getElementById('vf').style.outline = '4px solid #fff'; setTimeout(() => { const v = document.getElementById('vf'); if (v) v.style.outline = ''; }, 150);
      c.toBlob(b => save(b, false, true), 'image/jpeg', 0.82);
    };
    document.getElementById('cgal').onchange = async e => {
      const fs = [...e.target.files]; if (!fs.length) return;
      if (!extraFor && !target && !infoParent) { stop(); return addPhotos(sv, fs); }   // new obstacles: position from each photo
      if (extraFor) { for (const f of fs) await save(f, false); return; }
      save(fs[0], false);
    };
    document.getElementById('cclose').onclick = () => go(extraFor && shots ? back + '?pick=1' : back);
    // buttons are wired first, so the gallery works while the camera permission is still being asked
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      vid.srcObject = stream; await vid.play().catch(() => {});
    } catch (e) { fallback(e && e.name === 'NotAllowedError' ? 'Kamera izni verilmedi.' : 'Kamera açılamadı.'); }
  };

  // ----- add record: pick type, take photo -----
  V.add = async (id, q) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const recs = orderedRecords(sv), mode = q.mode || 'photo';
    const mains = recs.filter(r => !r.parentId);
    let parent = q.parent ? recs.find(r => r.id === q.parent) : mode === 'sat' ? mains[mains.length - 1] : (sv.bypassParent ? recs.find(r => r.id === sv.bypassParent) : null);
    if (parent && parent.parentId) parent = recs.find(r => r.id === parent.parentId);
    const flag = q.parent || (mode === 'sat' && parent) ? (q.flag || 'INFO') : (parent ? 'BYPASS' : '');
    const custom = [...new Set(sv.records.map(r => r.obstacle).filter(t => !TYPES.includes(t)))];
    let type = mode === 'sat' ? 'Satellite View' : flag === 'INFO' ? 'Satellite View' : null, all = false, customName = '';
    const title = mode === 'sat' ? 'Uydu fotoğrafı ekle' : mode === 'nophoto' ? 'Fotoğrafsız engel ekle' : parent ? `Yeni kayıt · ${parent.no}-… ${flag}` : 'Yeni engel ekle';
    const draw = () => {
      const list = all ? TYPES : QUICK.concat(['Satellite View', 'Drone View']);
      $app.innerHTML = `${bar(title, `#/s/${sv.id}`, parent && mode !== 'sat' ? `<span class="tag sub">${parent.no} · ${esc(parent.obstacle)} → ${flag}</span>` : '')}
      <div class="split">
        <div class="pane">
          <div class="sec">Engel tipi</div>
          <div class="chips">${[...new Set(list.concat(custom))].map(t => `<button class="chip ${t === type ? 'on' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}
            ${all ? '' : '<button class="chip" data-all="1">Tümü…</button>'}<button class="chip dash" data-custom="1">+ Kendim yazacağım</button></div>
          <label class="f" id="cw" style="${customName ? '' : 'display:none'}">Engel adı (raporda OBSTACLE hücresine yazılır)<input id="ct" value="${esc(customName)}" placeholder="ör. Industrial Area Gate"></label>
          ${mode === 'photo' ? '<div class="hint">Tipi seçmeden de çekebilirsin; sonraki ekranda değiştirilebilir.</div>' : ''}
        </div>
        <div class="pane">
          ${mode === 'nophoto' ? `<div class="sec">Fotoğrafsız kayıt</div><span class="hint">Konum ve KM şu anki GPS'ten alınır. Fotoğrafı sonradan da ekleyebilirsin.</span>
              <button class="btn red" id="nop" style="min-height:90px;font-size:18px">Kaydı oluştur</button>`
            : mode === 'sat' ? `<div class="sec">Uydu / drone görüntüsü</div>
              ${mains.length ? `<label class="f">Hangi engele ait?<select id="par">${mains.slice().reverse().map(m => `<option value="${m.id}" ${parent && parent.id === m.id ? 'selected' : ''}>${m.no} · ${esc(m.obstacle)}</option>`).join('')}</select></label>
                <span class="hint">Seçilen engelin altına INFO olarak eklenir; konum ve KM o engelden alınır.</span>` : '<span class="hint">Henüz engel yok; yeni kayıt olarak eklenir.</span>'}
              <button class="btn red" id="satp" style="min-height:90px;font-size:18px">${imgSvg} Boş uydu kaydı oluştur</button>
              <span class="hint">Fotoğraf çekilmez. Kayıt boş bir görselle oluşur; simülasyon görüntüsünü ofiste engel ekranındaki "Fotoğraf ekle" ile eklersiniz.</span>`
            : `<div class="sec">Fotoğraf</div>
              <label class="btn red" style="min-height:110px;font-size:20px">${camSvg} Fotoğraf çek<input class="hid" type="file" accept="image/*" capture="environment" id="cam"></label>
              <label class="btn" style="min-height:64px">${imgSvg} Galeriden seç<input class="hid" type="file" accept="image/*" id="gal"></label>`}
          <div class="hint" id="pos"></div>
        </div>
      </div>`;
      const ct = document.getElementById('ct'), par = document.getElementById('par');
      ct.oninput = () => { customName = ct.value; };
      if (par) par.onchange = () => { parent = recs.find(r => r.id === par.value); };
      $app.onclick = e => {
        const t = e.target.closest('[data-type]');
        if (t) { type = t.dataset.type; customName = ''; draw(); return; }
        if (e.target.closest('[data-all]')) { all = true; draw(); return; }
        if (e.target.closest('[data-custom]')) { document.getElementById('cw').style.display = ''; ct.focus(); type = null; $app.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on')); }
      };
      const make = async (file, useGps) => {
        toast('Kaydediliyor…');
        const name = (ct.value || '').trim() || type || 'Road Condition';
        const rec = { id: DB.uid(), parentId: parent ? parent.id : null, flag, obstacle: name, t: Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [] };
        if (/Overhead/.test(name)) rec.heights = [{ label: 'H', value: null }];
        if (file) { rec.photoId = await DB.putBlob(await to43(file)); rec.aspect = 4 / 3; }
        const pos = useGps ? await GPS.current() : null;
        if (pos) {
          rec.latDec = pos.lat; rec.lonDec = pos.lon; rec.acc = pos.acc;
        } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; }
        if (rec.latDec != null) { rec.lat = Geo.dms(rec.latDec, true); rec.lon = Geo.dms(rec.lonDec, false); }
        if (PHRASES[name] && PHRASES[name].length === 1 && !/%/.test(PHRASES[name][0]) && !/Overhead|Bridge|Culvert/.test(name)) rec.remarks = PHRASES[name][0];
        sv.records.push(rec); sv.selected = rec.id; await DB.putSurvey(sv); 
        go(`#/r/${sv.id}/${rec.id}`);
      };
      const cam = document.getElementById('cam'), gal = document.getElementById('gal'), nop = document.getElementById('nop');
      if (cam) cam.onchange = e => e.target.files[0] && make(e.target.files[0], true);
      if (gal) gal.onchange = e => e.target.files[0] && make(e.target.files[0], mode !== 'sat' && !(flag === 'INFO'));
      if (nop) nop.onclick = () => make(null, true);
      const satp = document.getElementById('satp');
      if (satp) satp.onclick = () => createRecord(sv, { parent, flag: parent ? 'INFO' : '', name: 'Satellite View', pending: 'sat' });
      const f = GPS.fresh(), pe = document.getElementById('pos');
      if (mode !== 'sat') pe.textContent = f ? `Konum hazır: ${Geo.dms(f.lat, true)} · ${Geo.dms(f.lon, false)} (±${Math.round(f.acc)} m)` : 'Konum aranıyor… Kayıt anında tekrar denenecek.';
    };
    draw();
  };

  // ----- record form: photo on the left, details on the right -----
  V.record = async (id, rid, q) => {
    q = q || {};
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const recs = orderedRecords(sv); archivedRecords(sv);
    const r = sv.records.find(x => x.id === rid); if (!r) return go(`#/s/${id}`);
    const par = r.parentId && sv.records.find(x => x.id === r.parentId), inArc = !!(r.archived || (par && par.archived));
    if (sv.selected !== r.id) { sv.selected = r.id; }
    const st = settingsOf(sv), refs = R.refs(st);
    const u = await blobUrl(r.photoId);
    r.extras = r.extras || [];
    const thumbs = [];   // [blobId, url] — the photo used in the report first, then the extra shots
    for (const b of [r.photoId, ...r.extras].filter(Boolean)) thumbs.push([b, await blobUrl(b)]);
    const isOH = /^Overhead/.test(r.obstacle), isBr = r.obstacle === 'Bridge', isCu = r.obstacle === 'Culvert';
    let OWN = [];
    const textKey = isOH ? 'actions' : 'remarks', isSlope = /^(In|De)clination$/.test(r.obstacle);
    const limit = () => { if (r.obstacle === 'Overhead Structure') return refs.min; const c = R.lineClass(r.fields.type); return c ? refs[c] : refs.LV; };
    const draw = () => {
      const sug = R.suggest(r, st), auto = sug.highlight, cur = r.highlight;
      const lim = limit();
      const hrow = (h, i) => {
        const v = pn(h.value), cls = st.general || v == null ? '' : v < lim ? 'bad' : 'ok';
        const opts = ['H', 'H1', 'H2', 'H3', 'HL', 'HM', 'HR'];
        return `<div class="hrow ${cls}"><select class="lab" data-hl="${i}" aria-label="Yükseklik etiketi" style="width:84px;padding:8px;border:1px solid ${h.label ? 'var(--line2)' : 'var(--red)'};border-radius:8px;font-size:16px;font-weight:600;background:#fff">
            <option value="" ${h.label ? '' : 'selected'}>Seç</option>${opts.map(o => `<option ${o === h.label ? 'selected' : ''}>${o}</option>`).join('')}</select><input data-hv="${i}" inputmode="decimal" value="${esc(fmt(h.value))}" placeholder="m" aria-label="Yükseklik (m)">
          <span style="flex:1;font-size:13px;font-weight:600;color:${cls === 'bad' ? 'var(--badtx)' : 'var(--oktx)'}">${st.general || v == null ? '' : v < lim ? fmt(lim - v, 2) + ' m eksik' : 'Uygun'}</span>
          ${r.heights.length > 1 ? `<button class="btn sm" data-hdel="${i}" aria-label="Sil">×</button>` : ''}</div>`;
      };
      const sub = SUB[r.obstacle];
      const cw = st.general ? null : pn((sv.project.cargo || {}).width);
      const wrow = (w, i) => {
        const v = pn(w.value), cls = cw == null || v == null ? '' : v < cw ? 'bad' : 'ok';
        return `<div class="hrow ${cls}"><select class="lab" data-wl="${i}" aria-label="Genişlik etiketi" style="width:84px;padding:8px;border:1px solid ${w.label ? 'var(--line2)' : 'var(--red)'};border-radius:8px;font-size:16px;font-weight:600;background:#fff">
            <option value="" ${w.label ? '' : 'selected'}>Seç</option>${['W', 'W1', 'W2', 'W3'].map(o => `<option ${o === w.label ? 'selected' : ''}>${o}</option>`).join('')}</select>
          <input data-wv="${i}" inputmode="decimal" value="${esc(fmt(w.value))}" placeholder="m" aria-label="Genişlik (m)">
          <span style="flex:1;font-size:13px;font-weight:600;color:${cls === 'bad' ? 'var(--badtx)' : 'var(--oktx)'}">${cls === 'bad' ? fmt(cw - v, 2) + ' m dar' : cls === 'ok' ? 'Uygun' : ''}</span>
          <button class="btn sm" data-wdel="${i}" aria-label="Sil">×</button></div>`;
      };
      const sw = (key, name, col, on) => `<button class="sw ${on ? 'on' : ''}" data-col="${key}"><i style="background:${col}"></i>${name}</button>`;
      $app.innerHTML = `${bar(r.obstacle || 'Yeni engel', `#/s/${sv.id}`, `${inArc ? '<span class="tag warn" style="font-size:13px">Arşivde · rapora girmez</span>' : ''}<span class="tag ${r.flag ? 'sub' : ''}" style="font-size:13px;${r.flag ? '' : 'background:#E8EEF5;color:var(--navy)'}">${r.no}${r.flag ? ' ' + r.flag : ''}</span>`)}
      <div class="split rec3">
        <div class="pane">
          <div class="photo">${u ? `<img src="${u}" alt="">` : r.pendingImage ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff;font-size:15px">${imgSvg}Uydu / simülasyon görüntüsü ofiste eklenecek</div>` : ''}${annHtml(r.ann || [], -1)}
            <button class="btn sm" data-go="#/a/${sv.id}/${r.id}" style="position:absolute;right:10px;bottom:10px">İşaretle</button>
            <button class="btn sm" id="rep" style="position:absolute;left:10px;bottom:10px">${u ? 'Değiştir' : 'Fotoğraf ekle'}</button></div>
          ${u ? `<div class="thumbs" aria-label="Bu engelin fotoğrafları">${thumbs.map(([b, x]) => `<button class="th ${b === r.photoId ? 'on' : ''}" data-pick="${b}"><img src="${x}" alt="">${b === r.photoId ? '<span class="use">RAPORDA</span>' : ''}</button>`).join('')}
            <button class="th add" id="xadd">${camSvg}<span>Ek fotoğraf</span></button></div>` : ''}
          <div class="loc"><div class="g3">
            <label class="f">KM (elle)<input id="km" inputmode="decimal" value="${r.kmManual != null ? esc(fmt(r.kmManual, 3)) : ''}" placeholder="raporda otomatik"></label>
            <label class="f">Enlem<input id="la" inputmode="decimal" value="${r.latDec == null ? '' : r.latDec.toFixed(6)}"></label>
            <label class="f">Boylam<input id="lo" inputmode="decimal" value="${r.lonDec == null ? '' : r.lonDec.toFixed(6)}"></label></div>
            <div class="row" style="justify-content:space-between;gap:8px"><span class="hint" id="lochint">${LATE.job && LATE.job.recId === r.id ? '<b style="color:var(--warntx)">Konum bekleniyor… gelince kendiliğinden yazılır</b>' : r.lat ? esc(r.lat) + ' · ' + esc(r.lon) : 'Konum yok, elle girilebilir'}</span><a id="maplink" class="btn sm maplink" target="_blank" rel="noopener" href="${r.latDec != null ? mapsUrl(r.latDec, r.lonDec) : '#'}" style="${r.latDec != null ? '' : 'display:none'}" aria-label="Konumu Google Maps'te aç" title="Google Maps'te aç">${pinSvg}</a><button class="btn sm" id="here">Konumu güncelle</button></div></div>
          <div class="g3"><button class="btn grn sm" id="infq">+ Info</button>
            <button class="btn grn sm" id="simq">+ Simülasyon</button>
            ${r.parentId ? '' : `<button class="btn grn sm" id="bypq">+ Bypass</button>`}</div>
        </div>
        <div class="pane">
          <div class="sec" style="${r.obstacle ? '' : 'color:var(--badtx)'}">${r.obstacle ? 'Engel tipi' : 'Engel tipini seç'}</div>
          <div class="chips" id="tys">${[...new Set(TYPES.concat(sv.records.map(x => x.obstacle)).filter(Boolean))].map(t => `<button class="chip ${t === r.obstacle ? 'on' : ''}" data-type="${esc(t)}" style="min-height:40px;padding:8px 13px;font-size:14px">${esc(t)}</button>`).join('')}
            <button class="chip dash" data-tcustom="1" style="min-height:40px;padding:8px 13px;font-size:14px">+ Kendim yazacağım</button></div>
          <label class="f" id="cnw" style="display:none">Engel adı (raporda OBSTACLE hücresine yazılır)<input id="cnv" placeholder="ör. Industrial Area Gate"></label>
          ${sub ? `<div class="sec">${isOH ? (r.obstacle === 'Overhead Cable' ? 'Line type' : 'Structure type') : isBr ? 'Bridge type' : 'Culvert type'}</div>
            <div class="chips">${sub.map(t => `<button class="chip ${r.fields.type === t ? 'on' : ''}" data-sub="${esc(t)}">${esc(t.replace(' Powerline', ''))}</button>`).join('')}</div>
            <label class="f">Tip metni (raporda yazılacak)<input id="tt" value="${esc(r.fields.type || '')}" placeholder="ör. 2x Low Voltage Powerline"></label>` : ''}
          ${isBr ? `<div class="g2"><label class="f">Bridge name<input id="bn" value="${esc(r.fields.name || '')}" placeholder="Unidentified"></label><label class="f">Bridge spans<input id="sp" value="${esc(r.fields.spans || '')}" placeholder="ör. 7x16m"></label></div>` : ''}
          ${isCu ? `<label class="f">Culvert spans<input id="sp" value="${esc(r.fields.spans || '')}" placeholder="ör. 1x5m"></label>` : ''}
        </div>
        <div class="pane">
          ${isOH && !st.general && !st.minHeight ? `<div class="note w">Taşıma yüksekliği girilmemiş; kontrol için "Etüt bilgileri"nden yüksekliği gir.</div>` : ''}
          ${isOH ? `<div class="sec">Yükseklikler${st.general ? '' : ' · sınır ' + fmt(lim, 2) + ' m'}</div>${r.heights.map(hrow).join('')}<button class="btn dash sm" id="hadd">+ Yükseklik ekle</button>` : ''}
          ${r.obstacle === 'Curve' ? `<div class="sec">Viraj yönü</div><div class="g2">${CURVES.map((c, i) => `<button class="chip ${r.remarks === c ? 'on' : ''}" data-curve="${i}" style="border-radius:12px">${i ? 'Left curve' : 'Right curve'}</button>`).join('')}</div>` : ''}
          ${!isOH && r.obstacle ? `${(r.widths || []).length ? `<div class="sec">Genişlik${cw ? ' · yük ' + fmt(cw, 2) + ' m' : ''}</div>${r.widths.map(wrow).join('')}` : ''}<button class="btn dash sm" id="wadd">+ Genişlik (W) ekle</button>` : ''}
          <label class="f">${isOH ? 'Actions' : 'Remarks'}${isOH && r.actionAuto && !st.general ? ' (otomatik önerildi, düzenlenebilir)' : ''}<textarea id="tx" rows="3">${esc(r[textKey] || '')}</textarea></label>
          ${(() => { const own = ownPhrases(sv, r.obstacle, textKey); OWN = own; return own.length ? `<div class="sec" style="margin-top:2px">Bu etütte yazdıkların</div><div class="chips">${own.slice(0, 3).map((t, i) => `<button class="chip own ${r[textKey] === t ? 'on' : ''}" style="font-size:13px;border-radius:10px;text-align:left;min-height:40px;padding:8px 12px" data-own="${i}">${esc(t)}</button>`).join('')}${own.length > 3 ? `<button class="chip dash" id="ownall" style="font-size:13px;border-radius:10px;min-height:40px">Tümü (${own.length})</button>` : ''}</div>` : ''; })()}
          ${(PHRASES[r.obstacle] || []).length ? `<div class="chips">${PHRASES[r.obstacle].slice(0, isSlope ? 99 : 4).map((p, i) => `<button class="chip ${isSlope && r[textKey] === p ? 'on' : ''}" style="font-size:13px;border-radius:10px;text-align:left;min-height:40px;padding:8px 12px${isSlope ? ';min-width:58px;justify-content:center;font-weight:600' : ''}" data-ph="${i}">${esc(isSlope ? phLabel(p) : p)}</button>`).join('')}${!isSlope && PHRASES[r.obstacle].length > 4 ? `<button class="chip dash" id="phall" style="font-size:13px;border-radius:10px;min-height:40px">Tüm hazır cümleler (${PHRASES[r.obstacle].length})</button>` : ''}</div>` : ''}
          <div class="row" style="justify-content:space-between"><span class="sec">REMARKS rengi</span>${auto ? `<span class="tag warn">Otomatik: ${COLNAME[auto]}</span>` : ''}</div>
          <div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px">
            ${sw('auto', 'Otomatik', auto ? COLORS.find(c => c[0] === auto)[2] : '#fff', cur == null)}${sw('none', 'Yok', '#fff', cur === 'none')}
            ${COLORS.map(c => sw(c[0], c[1], `linear-gradient(180deg,#fff,${c[2]},#fff)`, cur === c[0])).join('')}</div>
        </div>
      </div>
      <div class="foot"><button class="btn dash" id="del" style="min-width:0;color:var(--badtx)">Kaydı sil</button>
        ${par && par.archived ? '' : `<button class="btn" id="arc" style="min-width:0">${r.archived ? 'Etüde geri al' : `${esc(sv.project.start.name)}-${esc(sv.project.end.name)} arşivine gönder`}</button>`}<span style="flex:1"></span><button class="btn" id="cancel">${r.obstacle ? 'Vazgeç' : 'Kaydı iptal et'}</button><button class="btn pri" id="ok">Kaydet</button></div>`;
      bind();
    };
    const read = () => {
      const g = i => document.getElementById(i);
      r.kmManual = pn(g('km').value);   // empty = worked out from the route when the report is made
      const la = pn(g('la').value), lo = pn(g('lo').value);
      if (la != null && lo != null) { r.latDec = la; r.lonDec = lo; r.lat = Geo.dms(la, true); r.lon = Geo.dms(lo, false); }
      if (g('tt')) r.fields.type = g('tt').value.trim();
      if (g('bn')) r.fields.name = g('bn').value.trim();
      if (g('sp')) r.fields.spans = g('sp').value.trim();
      document.querySelectorAll('[data-hv]').forEach(i => { r.heights[i.dataset.hv].value = pn(i.value); });
      document.querySelectorAll('[data-hl]').forEach(i => { r.heights[i.dataset.hl].label = i.value; });
      document.querySelectorAll('[data-wv]').forEach(i => { r.widths[i.dataset.wv].value = pn(i.value); });
      document.querySelectorAll('[data-wl]').forEach(i => { r.widths[i.dataset.wl].label = i.value; });
      const tx = g('tx').value;
      if (tx !== (r[textKey] || '')) { r[textKey] = tx; if (isOH) r.actionAuto = false; }
    };
    const autoAct = () => { if (isOH && r.actionAuto) { const s = R.suggest(r, st); if (s.action) r.actions = s.action; } };
    const bind = () => {
      const g = i => document.getElementById(i);
      document.querySelectorAll('[data-hv]').forEach(i => i.addEventListener('change', () => { read(); autoAct(); draw(); }));
      if (g('tt')) g('tt').addEventListener('change', () => { read(); autoAct(); draw(); });
      const setType = t => { read(); r.obstacle = t; r.fields = {}; r.actionAuto = true;
        if (/Overhead/.test(t) && !r.heights.length) r.heights = [{ label: 'H', value: null }];
        if (WIDTH_TYPES.includes(t) && !(r.widths || []).length) r.widths = [{ label: 'W', value: null }];
        if (!r.remarks && PHRASES[t] && PHRASES[t].length === 1 && !/%/.test(PHRASES[t][0]) && !/Overhead|Bridge|Culvert/.test(t)) r.remarks = PHRASES[t][0];
        DB.putSurvey(sv).then(() => V.record(id, rid)); };
      g('cnv').onchange = () => { if (g('cnv').value.trim()) setType(g('cnv').value.trim()); };
      const infq = g('infq'), bypq = g('bypq'), mainRec = r.parentId ? recs.find(x => x.id === r.parentId) : r;
      const keep = async () => { read(); autoAct(); await DB.putSurvey(sv); };
      infq.onclick = () => sheet(`${mainRec.no} · Info ekle`, [
        { label: 'Fotoğraf çek', icon: camSvg, cls: 'red', run: async () => { await keep(); go(`#/cam/${sv.id}?info=${mainRec.id}`); } },
        { label: 'Galeriden seç', icon: imgSvg, file: true, run: async f => { await keep(); createRecord(sv, { file: f, parent: mainRec, flag: 'INFO', name: '' }); } },
      ]);
      g('simq').onclick = async () => { await keep(); createRecord(sv, { parent: mainRec, flag: 'INFO', name: 'Satellite View', pending: 'sat' }); };
      if (bypq) bypq.onclick = async () => { read(); autoAct(); sv.bypassParent = r.id; await DB.putSurvey(sv); go(`#/cam/${sv.id}`); };
      if (g('hadd')) g('hadd').onclick = () => { read(); r.heights.push({ label: '', value: null }); draw(); };
      if (g('wadd')) g('wadd').onclick = () => { read(); r.widths = r.widths || []; r.widths.push({ label: r.widths.length ? '' : 'W', value: null }); draw(); };
      document.querySelectorAll('[data-wv],[data-wl]').forEach(i => i.addEventListener('change', () => { read(); autoW(); draw(); }));
      document.querySelectorAll('[data-hl]').forEach(i => i.addEventListener('change', () => { read(); draw(); }));
      g('rep').onclick = () => sheet(u ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle', [
        { label: 'Fotoğraf çek', icon: camSvg, cls: 'red', run: async () => { read(); await DB.putSurvey(sv); go(`#/cam/${sv.id}?replace=${r.id}`); } },
        { label: 'Galeriden seç', icon: imgSvg, file: true, run: async f => { read(); await DB.delBlob(r.photoId); urls.delete(r.photoId); r.photoId = await DB.putBlob(await to43(f)); r.pendingImage = null; await DB.putSurvey(sv); V.record(id, rid); } },
      ]);
      if (g('xadd')) g('xadd').onclick = () => sheet(`${r.no} · Ek fotoğraf`, [
        { label: 'Fotoğraf çek (art arda)', icon: camSvg, cls: 'red', run: async () => { read(); await DB.putSurvey(sv); go(`#/cam/${sv.id}?extra=${r.id}`); } },
        { label: 'Galeriden seç (birden çok)', icon: imgSvg, file: true, multi: true, run: async fs => { read(); toast('Ekleniyor…'); for (const f of fs) r.extras.push(await DB.putBlob(await to43(f))); await DB.putSurvey(sv); picker(); } },
      ]);
      if (g('arc')) g('arc').onclick = async () => {
        read(); r.archived = !r.archived;
        if (r.archived && sv.bypassParent === r.id) sv.bypassParent = null;
        await DB.putSurvey(sv); SELST[sv.id] = { on: false, ids: [], tab: r.archived ? 'a' : 's' };
        toast(r.archived ? 'Arşive gönderildi; rapora girmez' : 'Etüde geri alındı'); go(`#/s/${sv.id}`);
      };
      g('here').onclick = async () => { read(); const p = await GPS.current(); if (!p) return toast('Konum alınamadı'); r.latDec = p.lat; r.lonDec = p.lon; r.lat = Geo.dms(p.lat, true); r.lon = Geo.dms(p.lon, false); draw(); };
      g('del').onclick = async e => {
        const b = e.target.closest('button');
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Emin misin? Kaydı ve alt kayıtlarını sil'; return; }
        const gone = sv.records.filter(x => x.id === r.id || x.parentId === r.id);
        for (const x of gone) for (const b of [x.photoId, ...(x.extras || [])]) await DB.delBlob(b);
        sv.records = sv.records.filter(x => !gone.includes(x)); if (sv.bypassParent === r.id) sv.bypassParent = null; sv.selected = null;
        await DB.putSurvey(sv); go(`#/s/${sv.id}`);
      };
      g('cancel').onclick = async () => {   // a fresh photo without a type is thrown away; otherwise just leave without saving
        if (!r.obstacle) { for (const b of [r.photoId, ...(r.extras || [])]) await DB.delBlob(b); sv.records = sv.records.filter(x => x.id !== r.id); if (sv.bypassParent === r.id) sv.bypassParent = null; await DB.putSurvey(sv);  }
        go(`#/s/${sv.id}`);
      };
      g('ok').onclick = async () => { read(); if (!r.obstacle) { toast('Önce engel tipini seç'); return; }
        if (isOH && r.heights.some(h => !h.label && h.value != null)) { toast('Her yükseklik için etiket seç (H, H1, H2, HL, HM, HR)'); return; }
        if (isOH) r.heights = r.heights.filter(h => h.label || h.value != null);
        if ((r.widths || []).some(w => !w.label && w.value != null)) { toast('Her genişlik için etiket seç (W, W1, W2)'); return; }
        if (r.widths) r.widths = r.widths.filter(w => w.label || w.value != null); autoAct(); await DB.putSurvey(sv);  go(`#/s/${sv.id}`); };
      $app.onclick = async e => {
        const ty = e.target.closest('[data-type]'), tc = e.target.closest('[data-tcustom]');
        if (ty) return setType(ty.dataset.type);
        if (tc) { document.getElementById('cnw').style.display = ''; document.getElementById('cnv').focus(); return; }
        const pk = e.target.closest('[data-pick]'); if (pk) { read(); return picker(pk.dataset.pick); }
        const s = e.target.closest('[data-sub]'), p = e.target.closest('[data-ph]'), c = e.target.closest('[data-col]'), hd = e.target.closest('[data-hdel]'), nav = e.target.closest('[data-go]');
        if (nav) { read(); await DB.putSurvey(sv); return; }
        if (s) { read(); r.fields.type = s.dataset.sub; autoAct(); draw(); }
        if (p) applyPh(+p.dataset.ph);
        if (e.target.closest('#phall')) { read(); sheet(`${r.obstacle} · hazır cümleler`, PHRASES[r.obstacle].map((t, i) => ({ label: t, cls: 'phl', run: () => applyPh(i) })).concat(OWN.map(t => ({ label: t, cls: 'phl', run: () => applyOwn(t) })))); }
        const ow = e.target.closest('[data-own]'); if (ow) applyOwn(OWN[+ow.dataset.own]);
        if (e.target.closest('#ownall')) { read(); sheet(`${r.obstacle} · bu etütte yazdıkların`, OWN.map(t => ({ label: t, cls: 'phl', run: () => applyOwn(t) }))); }
        if (c) { read(); r.highlight = c.dataset.col === 'auto' ? null : c.dataset.col; draw(); }
        if (hd) { read(); r.heights.splice(hd.dataset.hdel, 1); autoAct(); draw(); }
        const wd = e.target.closest('[data-wdel]'); if (wd) { read(); r.widths.splice(wd.dataset.wdel, 1); draw(); }
        const cv = e.target.closest('[data-curve]'); if (cv) { read(); r.remarks = CURVES[cv.dataset.curve]; draw(); }
      };
    };
    /* full-screen picker: all photos of this obstacle side by side; the one tapped goes into the report */
    async function picker(focus) {
      const all = [r.photoId, ...r.extras].filter(Boolean);
      let chosen = focus && all.includes(focus) ? focus : r.photoId;
      document.querySelectorAll('.picker').forEach(x => x.remove());
      const d = document.createElement('div'); d.className = 'picker'; document.body.appendChild(d);
      const paint = async () => {
        const list = [r.photoId, ...r.extras].filter(Boolean); let h = '';
        for (let i = 0; i < list.length; i++) {
          const b = list[i], x = await blobUrl(b);
          h += `<button class="pc ${b === chosen ? 'on' : ''}" data-c="${b}"><img src="${x}" alt="Fotoğraf ${i + 1}"><span class="lb">${b === chosen ? 'Raporda kullanılacak' : i + 1}</span>${b !== r.photoId ? `<span class="dl" data-del="${b}" role="button" aria-label="Bu fotoğrafı sil">×</span>` : ''}</button>`;
        }
        d.innerHTML = `<div class="ph-top"><b>${r.no} · ${esc(r.obstacle || 'Engel')} — raporda kullanılacak fotoğrafı seç</b><span style="font-size:13px;color:#D1D5DB">${list.length} fotoğraf</span></div>
          <div class="ph-grid">${h}</div>
          <div class="ph-foot"><button class="btn" data-x="1" style="background:#1F2937;color:#fff;border-color:#374151">Vazgeç</button>
            <button class="btn" id="pmore" style="background:#1F2937;color:#fff;border-color:#374151">${camSvg} Daha çek</button><span style="flex:1"></span>
            <button class="btn pri" id="puse" style="min-width:220px;background:#22C55E;border-color:#22C55E;color:#06260F">Bunu kullan</button></div>`;
      };
      await paint();
      d.onclick = async e => {
        if (e.target.closest('[data-x]')) return d.remove();
        const del = e.target.closest('[data-del]');
        if (del) {
          if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Sil?'; del.style.width = 'auto'; del.style.padding = '0 10px'; del.style.background = '#B4232A'; return; }
          const b = del.dataset.del; r.extras = r.extras.filter(x => x !== b); await DB.delBlob(b); urls.delete(b);
          if (chosen === b) chosen = r.photoId; await DB.putSurvey(sv); return paint();
        }
        const c = e.target.closest('[data-c]'); if (c) { chosen = c.dataset.c; return paint(); }
        if (e.target.closest('#pmore')) { d.remove(); await DB.putSurvey(sv); return go(`#/cam/${sv.id}?extra=${r.id}`); }
        if (e.target.closest('#puse')) {
          if (chosen !== r.photoId) {   // swap: the old report photo stays as an extra
            r.extras = r.extras.filter(x => x !== chosen); r.extras.unshift(r.photoId); r.photoId = chosen;
            if ((r.ann || []).length) toast('Fotoğraf değişti; işaretleri kontrol et');
          }
          await DB.putSurvey(sv); d.remove(); V.record(id, rid);
        }
      };
      window.addEventListener('hashchange', () => d.remove(), { once: true });
    }
    function autoW() {   // width entered and the load width is known: "sufficient" / "not sufficient" — unless the text is the user's own
      const lw = settingsOf(sv).general ? null : pn((sv.project.cargo || {}).width), vals = (r.widths || []).map(w => Number(w.value)).filter(v => v > 0);
      if (!lw || !vals.length || isOH) return;
      const cur = (r.remarks || '').trim();
      if (cur && ![W_OK, W_NO, 'The clearance is sufficient for transport.', 'No action required.'].includes(cur)) return;
      r.remarks = Math.min(...vals) >= lw ? W_OK : W_NO;
    }
    function applyOwn(t) { read(); r[textKey] = t; if (isOH) r.actionAuto = false; draw(); if (document.activeElement) document.activeElement.blur(); }
    function applyPh(i) {   // a standard phrase replaces the text; it never opens the keyboard, except to type the degree in "about %"
      read(); r[textKey] = PHRASES[r.obstacle][i]; if (isOH) r.actionAuto = false; draw();
      const tx = document.getElementById('tx'), k = tx.value.lastIndexOf('%');
      if (k >= 0 && /about %/.test(tx.value)) { tx.focus(); tx.setSelectionRange(k, k + 1); } else if (document.activeElement) document.activeElement.blur();
    }
    autoAct(); draw();
    LATE.onfix = rr => {   // position arrived (or gave up) for a photo taken before the GPS had a fix
      const g = i => document.getElementById(i);
      if (!g('la') || !location.hash.includes(rid)) { LATE.onfix = null; if (rr) toast(`${rr.no || ''} konumu alındı`); return; }
      if (!rr) { g('lochint').textContent = 'Konum alınamadı, "Konumu güncelle" ya da elle gir'; return; }
      if (rr.id !== r.id) return toast(`${rr.no || ''} konumu alındı`);
      if (g('maplink')) { g('maplink').href = mapsUrl(r.latDec, r.lonDec); g('maplink').style.display = ''; }
      g('la').value = r.latDec.toFixed(6); g('lo').value = r.lonDec.toFixed(6);
      g('lochint').textContent = `${r.lat} · ${r.lon}`; toast(`Konum alındı (±${Math.round(r.acc)} m)`);
    };
    if (q.pick) { history.replaceState(null, '', `#/r/${id}/${rid}`); picker(); }
  };

  // ----- most critical obstacles: lowest heights (no cables), lowest widths, cables against their clearance -----
  let CRITF = 'all';
  const KN = { all: 'Tümü', AG: 'AG', OG: 'OG', YG: 'YG', TEL: 'Telefon', RAIL: 'Demiryolu haberleşme', NA: 'Tipi seçilmemiş' };
  /* cables, most critical first: how much each clears its required jump height (AG/OG/YG reference; telephone and
     railroad communication cables use the AG one); general survey: plain height order */
  function cableRank(sv) {
    const gen = !!sv.project.general, ref = R.refs(settingsOf(sv)), CLS = { LV: 'AG', MV: 'OG', HV: 'YG' };
    const kind = r => { const t = (r.fields && r.fields.type) || ''; return /communication|railroad/i.test(t) ? 'RAIL' : /tele/i.test(t) ? 'TEL' : CLS[R.lineClass(t)] || 'NA'; };
    const cab = dimList(sv, 'heights', r => r.obstacle === 'Overhead Cable').map(x => {
      const k = kind(x.rec), need = gen ? null : ['AG', 'TEL', 'RAIL'].includes(k) ? ref.LV : k === 'OG' ? ref.MV : k === 'YG' ? ref.HV : null;
      return Object.assign(x, { k, need, margin: need != null ? x.value - need : null });
    });
    return gen ? cab : cab.sort((a, b) => (a.margin ?? 1e9) - (b.margin ?? 1e9) || a.value - b.value);
  }
  /* one line per section of the critical obstacles screen, for the survey cards */
  function critSummary(sv) {
    const P = sv.project, cg = P.general ? {} : cargoOf(P);
    const h = dimList(sv, 'heights', r => r.obstacle !== 'Overhead Cable').find(x => x.counted), w = dimList(sv, 'widths').find(x => x.counted), c = cableRank(sv).find(x => x.counted);
    const row = (t, x, low, extra) => `<button class="csum ${low ? 'low' : ''}" ${x ? `data-go="#/r/${sv.id}/${x.rec.id}"` : 'disabled'}><span>${t}</span>${x ? `<b>${fmt(x.value)} m</b><span class="hint">Engel ${esc(x.rec.no)}${x.status === 'bypass' ? ' (bypass)' : x.status === 'info' ? ' (info)' : ''}${extra || ''}</span>` : '<span class="hint">—</span>'}</button>`;
    return `<div class="csums">${row('Kritik H', h, h && cg.height && h.value < Number(cg.height))}${row('Kritik W', w, w && cg.width && w.value < Number(cg.width))}${row('Kablo', c, c && c.margin != null && c.margin < 0, c ? ` · ${KN[c.k]}${c.margin != null ? ` · ${c.margin >= 0 ? '+' : ''}${fmt(Math.round(c.margin * 100) / 100)} m` : ''}` : '')}</div>`;
  }
  V.crit = async id => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const P = sv.project, gen = !!P.general, cg = gen ? {} : cargoOf(P), st = settingsOf(sv), ref = R.refs(st);
    const ST = { route: '', bypass: '<span class="tag sub">BYPASS</span>', info: '<span class="tag ok">INFO</span>', bypassed: '<span class="tag warn">bypass edildi · sayılmaz</span>' };
    const where = x => x.status === 'bypass' ? 'bypass güzergahında' : x.status === 'bypassed' ? 'yük bu engelin bypass\'ından geçer' : x.status === 'info' ? 'info kaydı' : 'ana güzergahta';
    const item = (x, top, extra, low) => `<button class="citem ${x.counted ? '' : 'off'} ${top ? 'top' : ''}" data-go="#/r/${sv.id}/${x.rec.id}">
        <span class="cv ${low ? 'low' : ''}">${fmt(x.value)} m</span>
        <span class="ct"><b>${esc(x.rec.no)} · ${esc(x.rec.obstacle || 'Tip seçilmedi')}</b>
          <span class="hint">${esc(x.all.map(h => `${h.label || ''} ${fmt(Number(h.value))}`).join(' · '))}${x.rec.fields && x.rec.fields.type ? ' · ' + esc(x.rec.fields.type) : ''} · ${where(x)}</span>${extra || ''}</span>
        <span class="cb">${top ? '<span class="tag bad">KRİTİK</span>' : ''}${ST[x.status]}</span></button>`;
    const col = (list, limit) => { let first = true; return list.map(x => { const top = first && x.counted; if (top) first = false; return item(x, top, '', limit && x.counted && x.value < limit); }).join('') || '<div class="empty">Kayıt yok</div>'; };
    const hs = dimList(sv, 'heights', r => r.obstacle !== 'Overhead Cable'), ws = dimList(sv, 'widths');
    const order = cableRank(sv), cab = order;
    const kinds = ['all', ...['AG', 'OG', 'YG', 'TEL', 'RAIL', 'NA'].filter(k => cab.some(x => x.k === k))];
    if (!kinds.includes(CRITF)) CRITF = 'all';
    const shown = order.filter(x => CRITF === 'all' || x.k === CRITF);
    let firstC = true;
    const cabHtml = shown.map(x => {
      const top = firstC && x.counted; if (top) firstC = false;
      const extra = x.need != null ? `<span class="hint">${KN[x.k]} referansı ${fmt(x.need)} m · fark <b style="color:${x.margin < 0 ? 'var(--badtx)' : 'var(--oktx)'}">${x.margin >= 0 ? '+' : ''}${fmt(Math.round(x.margin * 100) / 100)} m</b></span>`
        : `<span class="hint">${x.k === 'NA' ? 'Hat tipi seçilmemiş' : KN[x.k]}${gen ? ' · genel etüt: yalnız yüksekliğe göre' : ''}</span>`;
      return item(x, top, extra, x.margin != null && x.margin < 0 && x.counted);
    }).join('') || '<div class="empty">Yüksekliği girilmiş kablo yok</div>';
    $app.innerHTML = `${bar('Kritik Engeller', `#/s/${sv.id}`, minHBox(sv) + cargoBox(P))}
      <div class="crit3">
        <div class="pane box"><div class="ch"><b>1 · Kritik H</b><span class="hint">Kablolar hariç · en alçaktan yükseğe · bypass edilen engeller gri</span></div>${col(hs, Number(cg.height) || null)}</div>
        <div class="pane box"><div class="ch"><b>2 · Kritik W</b><span class="hint">Tüm engeller · en darından genişe</span></div>${col(ws, Number(cg.width) || null)}</div>
        <div class="pane box"><div class="ch"><b>3 · Kablolar</b><span class="hint">${gen ? 'Genel etüt: en alçaktan yükseğe' : `Atlama referansına göre en kritikten rahata (AG ${fmt(ref.LV)} · OG ${fmt(ref.MV)} · YG ${fmt(ref.HV)} m)`}</span>
          <div class="chips">${kinds.map(k => `<button class="chip ${CRITF === k ? 'on' : ''}" data-cf="${k}">${KN[k]} · ${k === 'all' ? cab.length : cab.filter(x => x.k === k).length}</button>`).join('')}</div></div>${cabHtml}</div>
      </div>`;
    $app.onclick = e => { const c = e.target.closest('[data-cf]'); if (c) { CRITF = c.dataset.cf; V.crit(id); } };
  };

  // ----- photo annotation -----
  // editor items: {k:'arrow',x,y,w,h,rot} · {k:'text',x,y,w,text} · {k:'line',x1,y1,x2,y2}   (all in 0..1 of the photo)
  function annToOverlays(items, stage) {
    return items.map((o, i) => {
      if (o.k === 'arrow') return { kind: 'sp', geom: 'upArrow', x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, fill: '#FFFF00' };
      if (o.k === 'text') {
        const el = stage && stage.querySelector(`.ov[data-i="${i}"]`); const hh = el ? el.getBoundingClientRect().height / stage.getBoundingClientRect().height : 0.12;
        return { kind: 'sp', geom: 'rect', x: o.x, y: o.y, w: o.w, h: hh, line: '#FF0000', lw: 1.5, fill: '#FFFFFF', text: [[{ t: o.text || '', b: true, sz: 11, color: '#FF0000' }]] };
      }
      if (o.k !== 'line') return null;   // road arrows and signs: the reports draw them from r.ann
      return { kind: 'cxnSp', x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1), flipH: o.x1 > o.x2, flipV: o.y1 > o.y2, line: '#FF0000', lw: 2.25, head: o.both ? 'triangle' : 'none', tail: 'triangle' };
    }).filter(Boolean);
  }
  V.annotate = async (id, rid) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    const r = sv.records.find(x => x.id === rid); if (!r) return go(`#/s/${id}`);
    const u = await blobUrl(r.photoId), items = JSON.parse(JSON.stringify(r.ann || [])); let sel = -1;
    $app.innerHTML = `${bar('Fotoğrafı işaretle', `#/r/${id}/${rid}`)}
      <div class="split wide">
        <div class="pane photo-stage" style="overflow:hidden"><div class="photo" id="stage">${u ? `<img src="${u}" alt="">` : ''}<div id="lay" style="position:absolute;inset:0"></div></div></div>
        <div class="pane">
          <div class="sec">Yön oku (zemine yatık, sarı)</div>
          <div class="tools"><button class="btn sm" data-add="g:straight">${annGArrow('straight')} Düz</button><button class="btn sm" data-add="g:left">${annGArrow('left')} Sola</button><button class="btn sm" data-add="g:right">${annGArrow('right')} Sağa</button></div>
          <div class="sec">Ölçü</div>
          <div class="tools"><button class="btn sm" data-add="h">↕ Yükseklik (H:)</button><button class="btn sm" data-add="w">↔ Genişlik (W:)</button></div>
          <div class="sec">Tabela</div>
          <div class="tools signs">${[['turnL', 'Sola dönüş'], ['turnR', 'Sağa dönüş'], ['uturn', 'U dönüşü'], ['up', 'Yokuş %'], ['down', 'İniş %']].map(([t, l]) => `<button class="btn sm" data-add="s:${t}" title="${l}"><span style="width:26px;height:23px;display:inline-block">${annSign({ t, text: '' })}</span> ${l}</button>`).join('')}</div>
          <div class="sec">Diğer</div>
          <div class="tools"><button class="btn sm" data-add="text">+ Not kutusu</button><button class="btn sm" data-add="line">+ Kırmızı ok</button></div>
          <div class="hint">Öğeye dokunup sürükle. Okların iki ucunu ayrı ayrı taşıyabilirsin.</div>
          <div id="ctl"></div>
        </div>
      </div>
      <div class="foot"><button class="btn pri" id="ok">Bitti</button></div>`;
    const stage = document.getElementById('stage'), lay = document.getElementById('lay'), ctl = document.getElementById('ctl');
    const paint = () => {
      lay.innerHTML = annHtml(items, sel);
      const o = items[sel];
      const slope = o && o.k === 'sign' && (o.t === 'up' || o.t === 'down');
      ctl.innerHTML = !o ? '' : `<div class="card"><div class="sec">Seçili öğe</div>${o.k === 'text' ? `<label class="f">Not metni<textarea id="tv" rows="2">${esc(o.text)}</textarea></label>` : ''}
        ${slope ? `<label class="f">Tabeladaki eğim<input id="tv" value="${esc(o.text)}" placeholder="%8"></label>` : ''}
        <div class="tools">${['arrow', 'garrow', 'sign'].includes(o.k) ? '<button class="btn sm" data-c="rl">↺ Döndür</button><button class="btn sm" data-c="rr">↻ Döndür</button>' : ''}
        ${o.k === 'garrow' ? '<button class="btn sm" data-c="flat">Yassılaştır</button><button class="btn sm" data-c="tall">Diklet</button>' : ''}
        ${o.k === 'garrow' ? ['straight', 'left', 'right'].map(d => `<button class="btn sm ${o.dir === d ? 'pri' : ''}" data-c="dir:${d}">${annGArrow(d)}</button>`).join('') : ''}
        ${o.k === 'line' ? `<button class="btn sm ${o.both ? 'pri' : ''}" data-c="both">Çift uçlu</button>` : ''}
        ${o.k !== 'line' ? '<button class="btn sm" data-c="big">Büyüt</button><button class="btn sm" data-c="small">Küçült</button>' : ''}<button class="btn sm" data-c="del" style="color:var(--badtx)">Sil</button></div></div>`;
      const tv = document.getElementById('tv'); if (tv) tv.oninput = () => { o.text = tv.value; lay.innerHTML = annHtml(items, sel); };
    };
    let drag = null;
    stage.addEventListener('pointerdown', e => {
      const t = e.target.closest('[data-i]'); if (!t) { sel = -1; paint(); return; }
      sel = +t.dataset.i; const b = stage.getBoundingClientRect();
      drag = { h: t.dataset.h || null, sx: e.clientX, sy: e.clientY, o: JSON.parse(JSON.stringify(items[sel])), b };
      stage.setPointerCapture(e.pointerId); paint(); e.preventDefault();
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return; const dx = (e.clientX - drag.sx) / drag.b.width, dy = (e.clientY - drag.sy) / drag.b.height, o = items[sel], s = drag.o;
      if (o.k === 'line') { if (drag.h !== '2') { o.x1 = s.x1 + dx; o.y1 = s.y1 + dy; } if (drag.h !== '1') { o.x2 = s.x2 + dx; o.y2 = s.y2 + dy; } }
      else { o.x = s.x + dx; o.y = s.y + dy; }
      lay.innerHTML = annHtml(items, sel);
    });
    const end = () => { drag = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    $app.onclick = e => {
      const a = e.target.closest('[data-add]'), c = e.target.closest('[data-c]');
      if (a) {
        const k = a.dataset.add;
        if (k === 'arrow') items.push({ k, x: 0.46, y: 0.62, w: 0.08, h: 0.17, rot: 0 });
        if (k === 'text') items.push({ k, x: 0.08, y: 0.08, w: 0.45, text: '' });
        if (k === 'line') items.push({ k, x1: 0.3, y1: 0.3, x2: 0.45, y2: 0.5 });
        const minOf = list => { const v = (list || []).map(h => pn(h.value)).filter(x => x != null); return v.length ? Math.min(...v) : null; };
        if (k === 'h') {
          const v = minOf(r.heights);
          items.push({ k: 'line', both: true, x1: 0.6, y1: 0.78, x2: 0.6, y2: 0.3 }); items.push({ k: 'text', x: 0.63, y: 0.48, w: 0.2, text: v == null ? 'H:  m' : `H: ${fmt(v, 2)} m` });
        }
        if (k === 'w') {
          const v = minOf(r.widths);
          items.push({ k: 'line', both: true, x1: 0.3, y1: 0.6, x2: 0.7, y2: 0.6 }); items.push({ k: 'text', x: 0.42, y: 0.63, w: 0.2, text: v == null ? 'W:  m' : `W: ${fmt(v, 2)} m` });
        }
        if (k.startsWith('g:')) items.push({ k: 'garrow', dir: k.slice(2), x: 0.14, y: 0.8, w: 0.26, h: 0.12, rot: 0 });
        if (k.startsWith('s:')) {
          const t = k.slice(2), m = /(\d+(?:[.,]\d+)?)\s*%|%\s*(\d+(?:[.,]\d+)?)/.exec(r.remarks || '');
          items.push({ k: 'sign', t, x: Math.max(0.02, 0.78 - 0.18 * items.filter(z => z.k === 'sign').length), y: 0.06, w: 0.16, rot: 0, text: (t === 'up' || t === 'down') ? (m ? '%' + (m[1] || m[2]) : '%') : '' });
        }
        sel = items.length - 1; paint();
      }
      if (c && items[sel]) {
        const o = items[sel], k = c.dataset.c;
        if (k === 'rl') o.rot = ((o.rot || 0) - 15) % 360; if (k === 'rr') o.rot = ((o.rot || 0) + 15) % 360;
        if (k === 'big' || k === 'small') { const f = k === 'big' ? 1.2 : 1 / 1.2; if (o.k === 'text') o.fs = (o.fs || 1) * f; else { o.w *= f; if (o.h) o.h *= f; } }
        if (k === 'flat') o.h *= 0.85; if (k === 'tall') o.h /= 0.85;
        if (k.startsWith('dir:')) o.dir = k.slice(4);
        if (k === 'both') o.both = !o.both;
        if (k === 'del') { items.splice(sel, 1); sel = -1; }
        paint();
      }
    };
    document.getElementById('ok').onclick = async () => { sel = -1; paint(); r.ann = items; r.overlays = annToOverlays(items, stage); await DB.putSurvey(sv); go(`#/r/${id}/${rid}`); };
    paint();
  };

  // ----- report setup -----
  V.report = async (id) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/'); CUR = sv;
    routeKm(sv);   // KMs from the final order
    const recs = orderedRecords(sv), c = sv.project.conclusion || (sv.project.conclusion = {});
    const cnt = t => recs.filter(r => t.includes(r.obstacle)).length;
    const mp = Object.assign({ provider: 'esri', key: '' }, await DB.getSetting('maps'));
    const P = sv.project, last = (await DB.getSetting('headerDefaults')) || {};
    const H = P.header = Object.assign({ client: P.client || '', project: '', route: `${P.start.name} - ${P.end.name} Arası Yol Etüdü`, country: '', date: longDate(new Date()), docNo: last.docNo || '', rev: P.rev || '00', revDate: last.revDate || '' }, P.header || {});
    const R2 = sv.r2 = Object.assign({ head: 'caba', foot: 1 }, sv.r2 || {});
    const NEED = ['client', 'project', 'country', 'date', 'docNo', 'rev', 'revDate'], missing = NEED.filter(k => !String(H[k] || '').trim());
    const lg = { company: await blobUrl(await DB.getSetting('companyLogo')) || 'assets/logo_company.jpg', partner: await blobUrl(await DB.getSetting('partnerLogo')) || 'assets/logo_cjicm.jpg', client1: await blobUrl(sv.logos.client1), client2: await blobUrl(sv.logos.client2) };
    const hf = (k, t, ph) => `<label class="f">${t}<input data-h="${k}" value="${esc(H[k] || '')}" ${ph ? `placeholder="${ph}"` : ''} style="${NEED.includes(k) && !String(H[k] || '').trim() ? 'border:2px solid var(--red)' : ''}"></label>`;
    const lslot = (k, t) => `<label class="logo" style="cursor:pointer"><b>${t}</b><span class="pv">${lg[k] ? `<img src="${lg[k]}" alt="">` : imgSvg + ' Yükle'}</span><span class="hint">Değiştirmek için dokun</span><input class="hid" type="file" accept="image/*" data-r2logo="${k}"></label>`;
    const ropt = (name, v, t, cur) => `<label class="row" style="border:${cur === v ? '2px solid var(--navy)' : '1px solid var(--line2)'};border-radius:10px;padding:8px 10px;font-size:14px;background:#fff"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} style="width:18px;height:18px">${t}</label>`;
    const nf = recs.filter(r => r.flag === 'BYPASS').length, ni = recs.filter(r => r.flag === 'INFO').length;
    const miss = recs.filter(r => !r.photoId).length, nopos = recs.filter(r => r.latDec == null).length;
    c.bridge = c.bridge || 'required'; c.road = c.road || 'paved_ok';
    const opt = (k, v, t) => `<label class="row" style="border:${c[k] === v ? '2px solid var(--navy)' : '1px solid var(--line2)'};border-radius:10px;padding:10px;font-size:14px;background:#fff"><input type="radio" name="${k}" value="${v}" ${c[k] === v ? 'checked' : ''} style="width:18px;height:18px">${t}</label>`;
    $app.innerHTML = `${bar('Rapor oluştur', `#/s/${id}`, cargoBox(sv.project))}
    <div class="split even">
      <div class="pane">
        <div class="card"><b>Antet bilgileri <span class="hint">(engel sayfalarının üst tablosu)</span></b>
          ${missing.length ? '<div class="note w">Raporu açmadan önce kırmızı alanları doldur.</div>' : ''}
          <div class="g2">${hf('client', 'Müşteri / Client')}${hf('date', 'Tarih / Date')}</div>
          <div class="g2">${hf('project', 'Proje / Project', 'ör. Mozambique Inhassoro Project')}${hf('docNo', 'Doküman No / Doc. No', 'ör. RS-102026-MOZ-001-SB')}</div>
          <div class="g2">${hf('route', 'Güzergah / Route')}${hf('rev', 'Revizyon No / Rev. No')}</div>
          <div class="g2">${hf('country', 'Ülke / Country')}${hf('revDate', 'Revizyon Tarihi / Date', 'ör. 13 November 2026')}</div></div>
        <div class="card"><b>Engel sayfası logoları</b>
          <span class="sec">Sol üst</span>
          ${ropt('r2head', 'caba', 'Yalnız Çaba Misnak', R2.head)}${ropt('r2head', 'caba_cj', 'Çaba Misnak + CJ ICM', R2.head)}${ropt('r2head', 'cj_caba', 'CJ ICM + Çaba Misnak', R2.head)}
          <span class="sec">Sol alt (müşteri)</span>
          ${ropt('r2foot', '0', 'Logo yok', String(R2.foot))}${ropt('r2foot', '1', 'Tek müşteri logosu', String(R2.foot))}${ropt('r2foot', '2', 'İki müşteri logosu', String(R2.foot))}
          <div class="g4">${lslot('company', 'Çaba Misnak')}${lslot('partner', 'CJ ICM')}${lslot('client1', 'Müşteri-1')}${lslot('client2', 'Müşteri-2')}</div>
          <span class="hint">Kapak ve dikey sayfaların logoları "Etüt bilgileri"ndeki köşe ve kapak düzeni ayarlarıyla gelir.</span></div>
        <div class="card"><b>1.5 Brief Information <span class="tag ok">Otomatik</span></b>
          <div class="stat4"><div><b>${Math.round(Math.max(0, ...recs.filter(r => !r.flag).map(r => r.km || 0)))}</b><span>km</span></div><div><b>${cnt(['Bridge'])}</b><span>köprü</span></div>
            <div><b>${cnt(['Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn'])}</b><span>dönüş/viraj</span></div><div><b>${cnt(['Overhead Structure'])}</b><span>üst yapı</span></div></div></div>
        <div class="card"><b>Engel sayfaları</b><span class="hint">${recs.length} kayıt · yeni taslakta her kayıt (INFO/BYPASS dahil) ayrı yatay sayfa · ${recs.length - nf - ni} ana, ${nf} BYPASS, ${ni} INFO · arşivdekiler hariç</span>
          ${miss ? `<span class="note w">${miss} kayıtta fotoğraf yok.</span>` : ''}${nopos ? `<span class="note w">${nopos} kayıtta konum yok.</span>` : ''}</div>
        <div class="card"><b>2 Transportation Drawing</b><span class="hint">${sv.logos.drawing ? 'Çizim yüklendi.' : 'Çizim yüklenmedi; "Etüt bilgileri" ekranından resim olarak ekleyebilirsin.'}</span></div>
        <div class="hint">Giriş metinleri, kısaltmalar, 4.2–4.8 standart metinleri ve referans fotoğrafları otomatik eklenir. Güzergah haritası internet varsa OpenStreetMap'ten çizilir.</div>
      </div>
      <div class="pane">
        <div class="card"><b>Haritalar (yeni taslak)</b>
          <span class="hint">Her engel sayfasında: güzergahın tamamı üzerinde engelin yeri ve engelin yakın uydu görüntüsü. Rapor açılırken internetten alınır.</span>
          ${['esri', 'google'].map(v => `<label class="row" style="border:${mp.provider === v ? '2px solid var(--navy)' : '1px solid var(--line2)'};border-radius:10px;padding:10px;font-size:14px;background:#fff"><input type="radio" name="mapProvider" value="${v}" ${mp.provider === v ? 'checked' : ''} style="width:18px;height:18px">${v === 'esri' ? 'Esri uydu + OpenStreetMap (anahtarsız; taslaktaki uydu görüntüsü gibi)' : 'Google Maps (API anahtarı gerekir)'}</label>`).join('')}
          <label class="f" style="${mp.provider === 'google' ? '' : 'display:none'}">Google Maps API anahtarı<input id="gkey" value="${esc(mp.key || '')}" placeholder="AIza…" autocomplete="off"></label></div>
        <div class="card"><b>4.1 Bridge</b>${opt('bridge', 'done_ok', 'Statik analiz yapıldı, tüm köprüler uygun')}${opt('bridge', 'required', 'Statik analiz gerekli')}${opt('bridge', 'custom', 'Kendi metnimi yazacağım')}
          <label class="f" style="${c.bridge === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="bt" rows="3">${esc(c.bridgeText || '')}</textarea></label></div>
        <div class="card"><b>4.6 Road condition</b>${opt('road', 'paved_ok', 'Yol uygun, tamamı asfalt, kritik dar nokta yok')}${opt('road', 'custom', 'Kendi metnimi yazacağım')}
          <label class="f" style="${c.road === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="rt" rows="3">${esc(c.roadText || '')}</textarea></label></div>
      </div>
    </div>
    <div class="foot"><button class="btn" id="mkold" style="min-width:0">Eski format (dikey, sayfada 3 engel)</button><button class="btn pri" id="mk">Raporu aç ve PDF al</button></div>`;
    const save = async () => {
      const b = document.getElementById('bt'), r2 = document.getElementById('rt'); c.bridgeText = b.value.trim(); c.roadText = r2.value.trim();
      mp.key = document.getElementById('gkey').value.trim(); await DB.setSetting('maps', mp);
      document.querySelectorAll('[data-h]').forEach(i => { H[i.dataset.h] = i.value.trim(); });
      if (H.client) P.client = H.client; if (H.rev) P.rev = H.rev;
      await DB.setSetting('headerDefaults', { docNo: H.docNo, revDate: H.revDate });
      await DB.putSurvey(sv);
    };
    document.querySelectorAll('[data-r2logo]').forEach(inp => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return; await save();
      const k = inp.dataset.r2logo, blob = await shrink(inp.files[0], 1200);
      if (k === 'company' || k === 'partner') { const key = k === 'company' ? 'companyLogo' : 'partnerLogo'; await DB.delBlob(await DB.getSetting(key)); await DB.setSetting(key, await DB.putBlob(blob)); }
      else { await DB.delBlob(sv.logos[k]); sv.logos[k] = await DB.putBlob(blob); await DB.putSurvey(sv); }
      V.report(id);
    }));
    $app.onchange = async e => {
      if (e.target.name === 'r2head' || e.target.name === 'r2foot') { await save(); R2[e.target.name === 'r2head' ? 'head' : 'foot'] = e.target.name === 'r2foot' ? +e.target.value : e.target.value; await DB.putSurvey(sv); return V.report(id); }
      if (e.target.name === 'mapProvider') { await save(); mp.provider = e.target.value; await DB.setSetting('maps', mp); return V.report(id); }
      if (e.target.type === 'radio') { await save(); c[e.target.name] = e.target.value; await DB.putSurvey(sv); V.report(id); }
    };
    document.getElementById('mk').onclick = async () => {
      await save();
      if (NEED.some(k => !String(H[k] || '').trim())) { toast('Önce antet bilgilerini doldur'); return V.report(id); }
      if (mp.provider === 'google' && !mp.key) return toast('Google için API anahtarını gir ya da Esri seç');
      location.href = `report2.html#${id}`;
    };
    document.getElementById('mkold').onclick = async () => { await save(); location.href = `report.html#${id}`; };
  };

  // ---------- router ----------
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  async function route() {
    LATE.onfix = null; $app.onclick = null; $app.onchange = null; window.scrollTo(0, 0); document.querySelectorAll('.toast').forEach(t => t.remove());
    const [path, qs] = (location.hash.slice(1) || '/').split('?'), p = path.split('/').filter(Boolean), q = Object.fromEntries(new URLSearchParams(qs || ''));
    try {
      if (!p.length) await V.home();
      else if (p[0] === 'new') await V.form(null);
      else if (p[0] === 'import') await importerView();
      else if (p[0] === 'edit') await V.form(p[1]);
      else if (p[0] === 's') await V.survey(p[1]);
      else if (p[0] === 'add') await V.add(p[1], q);
      else if (p[0] === 'cam') await V.camera(p[1], q);
      else if (p[0] === 'r') await V.record(p[1], p[2], q);
      else if (p[0] === 'rep' && FIELD) go(`#/s/${p[1]}`);
      else if (p[0] === 'crit') await V.crit(p[1]);
      else if (p[0] === 'a') await V.annotate(p[1], p[2]);
      else if (p[0] === 'rep') await V.report(p[1]);
      else if (p[0] === 'admin') await Auth.adminView(bar);
      else go('#/');
    } catch (err) { console.error(err); $app.innerHTML = `${bar('Hata', '#/')}<div class="full"><div class="note w">Beklenmeyen bir hata oluştu: ${esc(err.message)}</div></div>`; }
  }
  // sign-in, authenticator and device approval come first (auth.js); the app starts once this device is allowed
  Auth.start(async () => { try { if (!window.__bk) { window.__bk = 1; await Backup.init(); } } catch (e) { console.error(e); } window.removeEventListener('hashchange', route); window.addEventListener('hashchange', route); route(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
