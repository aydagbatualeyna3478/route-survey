/* Route Survey field app (PWA). Vanilla JS, no dependencies; data lives in IndexedDB (db.js). */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pn = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
  const fmt = (v, d) => v == null || v === '' ? '' : (d == null ? String(v) : Number(v).toFixed(d)).replace('.', ',');
  const R = window.SurveyRules;

  const TYPES = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn',
    'Inclination', 'Declination', 'Road Condition', 'Width Obstruction', 'Railroad Crossing', 'Port Gate', 'Satellite View', 'Drone View'];
  const QUICK = ['Overhead Cable', 'Overhead Structure', 'Bridge', 'Culvert', 'Left Turn', 'Right Turn', 'Curve', 'Inclination', 'Declination'];
  const WIDTH_TYPES = ['Port Gate', 'Width Obstruction'];   // these ask for W automatically; any other type can add it by hand
  const CURVES = ['Right curve. Turning radius of the curve is suitable for planned transportation operation.', 'Left curve. Turning radius of the curve is suitable for planned transportation operation.'];
  const SUB = {
    'Overhead Structure': ['L Shape Signboard', 'Signboard', 'Bridge', 'Traffic Enforcement Camera', 'L Shape Traffic Light', 'Traffic Light', 'Pedestrian Bridge', 'Pipeline'],
    'Overhead Cable': ['High Voltage Powerline', 'Medium Voltage Powerline', 'Low Voltage Powerline', 'Telephone Line'],
    'Bridge': ['Precast Concrete I Girder', 'Precast Concrete U Girder', 'Concrete Tee Beam', 'Concrete Flat Slab', 'Steel I Girder', 'Steel U Girder', 'Concrete Box Girder'],
    'Culvert': ['Box', 'Arc', 'Pipe'],
  };
  const PHRASES = {
    'Overhead Cable': [R.TEXT.lvLift, R.TEXT.lvOff, R.TEXT.hvOff, R.TEXT.none],
    'Overhead Structure': [R.TEXT.structure, 'Structure must be removed/bypassed.', 'Use right lane to pass. No action required.', 'Use left lane to pass. No action required.', R.TEXT.none],
    'Bridge': ['Bridge static analysis and evaluation is required.', 'The bridge is in good condition.'],
    'Culvert': ['The culvert is good condition.'],
    'Left Turn': ['Turn left.', 'Turn left. Turning radius of the turn is suitable for planned transportation operation.', 'Turn left. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.'],
    'Right Turn': ['Turn right.', 'Turn right. Turning radius of the turn is suitable for planned transportation operation.', 'Turn right. Turning radius of the turn is not suitable for planned transportation operation.', 'The opposite traffic direction must be used.'],
    'U Turn': ['U turn. Turning radius of the turn is suitable for planned transportation operation.'],
    'Roundabout Turn': ['Continue straight at the roundabout.'],
    'Inclination': ['The degree of the inclination is about %.'],
    'Declination': ['The degree of the declination is about %.'],
    'Road Condition': ['The road is in poor condition and requires minor civil works.', 'The opposite traffic direction must be used.'],
    'Width Obstruction': ['The clearance is sufficient for transport.'],
    'Satellite View': ['Satellite view of transportation simulation.'],
    'Drone View': ['Drone view of transportation simulation.'],
  };
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
    off() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; this.cb = null; },
    got(p) {
      this.err = null;
      const fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      this.last = fix;   // always the newest fix: the vehicle may be moving
      this.cb && this.cb();
    },
    fresh(maxAge) { return this.last && Date.now() - this.last.t < (maxAge || 30000) ? this.last : null; },
    current() {   // one-off position (photo-less record, "update position")
      return new Promise(res => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(p => { this.got(p); res(this.last); }, () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      });
    },
    /* Route points are [lat, lon, time, km-from-start in metres], one per photo. KM normally adds the distance
       from the previous point; a point that lies beside the route already measured (driving back to where a
       bypass branches off) takes the KM of that place instead, so KM always counts from the starting point. */
    extend(sv, pt, opts) {
      const tr = sv.track, prev = tr[tr.length - 1];
      if (!prev) { tr.push([pt.lat, pt.lon, pt.t, 0]); sv.odo = 0; return; }
      const d = Geo.hav(prev, [pt.lat, pt.lon]);
      if (d < 3) return;
      let cum = (prev[3] || 0) + d;
      const k = Math.cos(pt.lat * Math.PI / 180), M = 111320;
      let best = null;
      for (let j = 0; j < tr.length - 2; j++) {   // nearest place on the earlier route (not the last stretch)
        const A = tr[j], B = tr[j + 1];
        const ax = A[1] * k * M, ay = A[0] * M, bx = B[1] * k * M, by = B[0] * M, px = pt.lon * k * M, py = pt.lat * M;
        const L = (bx - ax) ** 2 + (by - ay) ** 2, t = L ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L)) : 0;
        const off = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
        const c = (A[3] || 0) + t * ((B[3] || 0) - (A[3] || 0)) + off;
        if (off < 400 && (!best || c < best)) best = c;
      }
      if (best != null && (opts && opts.bypass ? best < cum : best < cum - 500)) cum = best;
      tr.push([pt.lat, pt.lon, pt.t, cum]); sv.odo = cum;
    },
  };


  /* new record from a photo (or none). Camera photos take the current GPS position; INFO images take the parent's. */
  async function createRecord(sv, o) {
    toast('Kaydediliyor…');
    const parent = o.parent || null, name = o.name || '';
    const rec = { id: DB.uid(), parentId: parent ? parent.id : null, flag: o.flag || '', obstacle: name, pendingImage: o.pending || null, t: Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [] };
    if (/Overhead/.test(name)) rec.heights = [{ label: 'H', value: null }];
    if (WIDTH_TYPES.includes(name)) rec.widths = [{ label: 'W', value: null }];
    if (o.file) { rec.photoId = await DB.putBlob(await to43(o.file)); rec.aspect = 4 / 3; }
    const pos = o.pos || (o.useGps ? await GPS.current() : null);
    if (pos) {
      rec.latDec = pos.lat; rec.lonDec = pos.lon; rec.acc = pos.acc;
      if (sv.status === 'active') GPS.extend(sv, pos, { bypass: rec.flag === 'BYPASS' });
      rec.km = Math.round(sv.odo) / 1000;
    } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; rec.km = parent.km; }
    else { const prevRec = sv.records[sv.records.length - 1]; rec.km = prevRec ? prevRec.km : Math.round(sv.odo) / 1000; }
    if (rec.latDec != null) { rec.lat = Geo.dms(rec.latDec, true); rec.lon = Geo.dms(rec.lonDec, false); }
    if (name && PHRASES[name] && PHRASES[name].length === 1 && !/%/.test(PHRASES[name][0]) && !/Overhead|Bridge|Culvert/.test(name)) rec.remarks = PHRASES[name][0];
    sv.records.push(rec); sv.selected = rec.id; await DB.putSurvey(sv); 
    go(`#/r/${sv.id}/${rec.id}`);
  }

  /* small bottom sheet with choices; gallery options are file inputs so the picker opens from the tap itself */
  function sheet(title, items) {
    document.querySelectorAll('.sheet').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'sheet';
    d.innerHTML = `<div class="sheet-bg" data-x="1"></div><div class="sheet-box" role="dialog" aria-label="${esc(title)}"><b>${esc(title)}</b>
      ${items.map((it, i) => it.file ? `<label class="btn" style="cursor:pointer">${it.icon || ''}${esc(it.label)}<input class="hid" type="file" accept="image/*" data-i="${i}"></label>`
        : `<button class="btn ${it.cls || ''}" data-i="${i}">${it.icon || ''}${esc(it.label)}</button>`).join('')}
      <button class="btn dash" data-x="1">Vazgeç</button></div>`;
    document.body.appendChild(d);
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target.closest('[data-x]')) return close(); const b = e.target.closest('button[data-i]'); if (b) { close(); items[b.dataset.i].run(); } });
    d.querySelectorAll('input[data-i]').forEach(inp => inp.onchange = () => { const f = inp.files[0]; close(); if (f) items[inp.dataset.i].run(f); });
  }

  // ---------- views ----------
  const V = {};
  const imgSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>';
  const cargoOf = p => p.cargo || { height: p.minHeight };
  const cargoBox = p => {
    if (p.general) return `<div class="cargo"><b>Taşıma Bilgileri</b><span style="font-size:15px;font-weight:700;color:var(--navy)">Genel Etüt</span><span class="hint">Belirli bir yüke bağlı değil</span></div>`;
    const c = cargoOf(p), m = v => v == null || v === '' ? '–' : fmt(v) + ' m';
    return `<div class="cargo"><b>Taşıma Bilgileri</b><div class="cg"><span>Uzunluk: <b>${m(c.length)}</b></span><span>Genişlik: <b>${m(c.width)}</b></span>
      <span>Yükseklik: <b>${m(c.height)}</b></span><span>Ağırlık: <b>${c.weight == null || c.weight === '' ? '–' : fmt(c.weight) + ' t'}</b></span></div></div>`;
  };

  V.home = async () => {
    const list = (await DB.listSurveys()).sort((a, b) => b.createdAt - a.createdAt);
    const card = sv => {
      const n = sv.records.length, act = sv.status === 'active', c = cargoOf(sv.project);
      return `<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:17px">${esc(sv.project.start.name)} → ${esc(sv.project.end.name)}</b>
        <span class="tag ${act ? 'warn' : 'ok'}">${act ? 'Sahada' : 'Tamamlandı'}</span></div>
        <div class="hint">${esc(sv.project.date || '')} · ${fmt(sv.odo / 1000, 1)} km · ${n} kayıt · ${sv.project.general ? 'genel etüt' : c.height ? 'yük H ' + fmt(c.height) + ' m' : 'yük ölçüsü yok'}</div>
        <div class="row"><button class="btn grow sm" data-go="#/s/${sv.id}">${act ? 'Etüde devam et' : 'Kayıtları aç'}</button><button class="btn grow sm" data-go="#/rep/${sv.id}">Rapor</button></div></div>`;
    };
    $app.innerHTML = `${bar('Etütlerim', null, '<button class="btn pri" data-go="#/new" style="min-width:260px">+ Yeni etüt raporu oluştur</button>')}
      <div class="full">${list.length ? `<div class="tiles">${list.map(card).join('')}</div>` : '<div class="empty">Henüz etüt yok. Sağ üstteki "Yeni etüt raporu oluştur" ile başla.</div>'}
      <div class="hint" style="text-align:center;margin-top:auto">Veriler bu cihazda saklanır, internetsiz de çalışır.</div></div>`;
  };

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
    $app.innerHTML = `${bar(sv ? 'Etüt bilgileri' : 'Yeni etüt raporu', sv ? `#/s/${sv.id}` : '#/')}
    <form class="split even" id="pf" autocomplete="off">
      <div class="pane">
        <div class="sec">Güzergah</div>
        <div class="g2"><label class="f">Başlangıç noktası<input name="start" required value="${esc(p.start.name)}" placeholder="Fabrika / saha adı"></label>
          <label class="f">Varış noktası<input name="end" required value="${esc(p.end.name)}" placeholder="Liman / saha adı"></label></div>
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
        <div class="sec">Kapak bilgileri</div>
        <div class="g2"><label class="f">Müşteri unvanı<input name="client" value="${esc(p.client)}"></label>
          <label class="f">Kimin için hazırlandığı<input name="preparedFor" value="${esc(p.preparedFor)}" placeholder="Boşsa müşteri unvanı yazılır"></label></div>
        <div class="g2"><label class="f">Proje referansı<input name="reference" value="${esc(p.reference)}"></label><label class="f">Rev. no<input name="rev" value="${esc(p.rev)}"></label></div>
      </div>
      <div class="pane">
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
    let general = !!p.general;
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
      const s = sv || { id: DB.uid(), createdAt: Date.now(), status: 'active', track: [], odo: 0, records: [], bypassParent: null, selected: null, logos: {}, project: p };
      const cargo = { length: pn(f.length.value), width: pn(f.width.value), height: pn(f.height.value), weight: pn(f.weight.value) };
      Object.assign(s.project, {
        start: { name: f.start.value.trim() }, end: { name: f.end.value.trim() },
        title: `ROUTE SURVEY REPORT FROM\n${f.start.value.trim().toUpperCase()} TO ${f.end.value.trim().toUpperCase()}`,
        client: f.client.value.trim(), preparedFor: f.preparedFor.value.trim() || f.client.value.trim(), reference: f.reference.value.trim(), rev: f.rev.value.trim(),
        preparedBy: f.preparedBy.value.split('\n').map(x => x.trim()).filter(Boolean), executedBy: s.project.companyShort,
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
      go(`#/s/${s.id}`);
    };
  };

  // ----- active survey: obstacle list on the left, actions on the right -----
  V.survey = async (id) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const act = sv.status === 'active';
    const st = settingsOf(sv), recs = orderedRecords(sv);
    const last = sv.selected;
    const status = r => {
      const s = R.suggest(r, st), col = R.highlightOf(r, st);
      if (col) return `<span class="tag bad">${COLNAME[col] || col}</span>`;
      if (/Overhead/.test(r.obstacle) && s.action) return '<span class="tag ok">Uygun</span>';
      return '';
    };
    const line = async (r, sub) => {
      const u = await blobUrl(r.photoId), hs = (r.heights || []).filter(h => h.value != null).map(h => `${h.label} ${fmt(h.value)} m`).join(' · ');
      const txt = (r.actions || r.remarks || '').slice(0, 90);
      return `<button class="rec ${sub ? 'sub' : ''} ${last === r.id ? 'on' : ''}" data-rec="${r.id}">${u ? `<img src="${u}" alt="">` : `<span class="ph" style="display:flex;align-items:center;justify-content:center;color:#5B6B80;flex-direction:column;font-size:11px;gap:2px">${r.pendingImage ? imgSvg + 'Ofiste eklenecek' : ''}</span>`}
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span class="t">${r.flag ? `<span class="tag sub">${r.no} ${r.flag}</span> ` : r.no + ' · '}${r.obstacle ? esc(r.obstacle) : '<span style="color:var(--badtx)">Tip seçilmedi</span>'}</span>
        <span class="s">KM ${fmt(r.km, 1)}${r.fields && r.fields.type ? ' · ' + esc(r.fields.type) : ''}${hs ? ' · ' + hs : ''}</span>
        ${txt ? `<span class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(txt)}</span>` : ''}</span>${status(r)}</button>`;
    };
    let html = '';
    for (const m of recs.filter(r => !r.parentId)) {
      const subs = recs.filter(r => r.parentId === m.id);
      html += `<div class="grp">${await line(m)}${subs.length ? `<div class="subs">${(await Promise.all(subs.map(x => line(x, true)))).join('')}</div>` : ''}</div>`;
    }
    const bp = sv.bypassParent && recs.find(r => r.id === sv.bypassParent);
    const rb = (attrs, cls, icon, label, dis) => `<button class="rb ${cls}" ${attrs} ${dis ? 'disabled' : ''}>${icon || ''}<span>${label}</span></button>`;
    $app.innerHTML = `<div class="bar"><button class="back" data-go="#/" aria-label="Geri">${backSvg}</button>
        <h1>${esc(sv.project.start.name)} &gt; ${esc(sv.project.end.name)}</h1>${cargoBox(sv.project)}</div>
      <div class="split">
        <div class="pane box" id="list">${html || '<div class="empty">Henüz engel yok.<br>Sağdaki "Yeni engel ekle" ile ilk fotoğrafı çek.</div>'}</div>
        <div class="side">
          <div class="row" style="justify-content:space-between"><span class="count">Engel Sayısı: ${recs.length}</span>
            ${act ? '<span class="hint">Konum fotoğraf çekerken alınır</span>' : '<span class="tag ok">Tamamlandı</span>'}</div>
          <div class="row" style="gap:18px;color:var(--mut);font-size:14px"><span>KM <b id="km" style="color:var(--ink)">${fmt(sv.odo / 1000, 1)}</b></span>
            <span>${recs.filter(r => r.flag === 'BYPASS').length} bypass · ${recs.filter(r => r.flag === 'INFO').length} info</span></div>
          <div class="hint">Info, Bypass ve uydu fotoğrafını bir engele eklemek ya da engeli düzenlemek için listeden engele dokun.</div>
          ${bp ? `<div class="note g row" style="justify-content:space-between"><span>Bypass açık: <b>${bp.no} · ${esc(bp.obstacle)}</b>. Yeni engeller ${bp.no}-… olarak eklenir.</span></div>` : ''}
          <div class="acts">
            ${act ? rb('data-act="nophoto"', '', '', 'Fotoğrafsız Engel Ekle')
              + rb(`data-go="#/add/${sv.id}?mode=sat"`, '', imgSvg, 'Uydu Fotoğrafı Ekle')
              + rb('', 'ghost', '', '') + rb('', 'ghost', '', '') + rb('', 'ghost', '', '')
              + (bp ? rb('data-act="endbypass"', 'grn', '', "Bypass'ı Bitir") : rb('', 'ghost', '', ''))
              + rb('data-act="finish"', '', '', 'Etüdü Bitir') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + rb(`data-go="#/cam/${sv.id}"`, 'red', camSvg, 'Yeni Engel Ekle')
            : rb('data-act="resume"', '', '', 'Etüde Devam Et') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + rb(`data-go="#/rep/${sv.id}"`, 'navy', '', 'Rapor')}
          </div>
        </div>
      </div>`;
    const onSel = document.querySelector('.rec.on'); if (onSel) onSel.scrollIntoView({ block: 'nearest' });
    $app.onclick = async e => {
      const rc = e.target.closest('[data-rec]');
      if (rc) return go(`#/r/${sv.id}/${rc.dataset.rec}`);
      const a = e.target.closest('[data-act]'); if (!a) return;
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
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const recs = orderedRecords(sv), bp = sv.bypassParent && recs.find(r => r.id === sv.bypassParent);
    const infoParent = q.info ? recs.find(r => r.id === q.info) : null, target = q.replace ? sv.records.find(r => r.id === q.replace) : null;
    const back = target ? `#/r/${sv.id}/${target.id}` : infoParent ? `#/r/${sv.id}/${infoParent.id}` : `#/s/${sv.id}`;
    document.body.style.background = '#000';
    $app.innerHTML = `<div style="flex:1;min-height:0;display:flex;background:#000;color:#fff;position:relative">
      <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:12px">
        <div id="vf" style="position:relative;height:100%;aspect-ratio:4/3;max-width:100%;background:#111;overflow:hidden;border-radius:6px">
          <video id="vid" playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
          <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(#fff3,#fff3) 33.33% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 66.66% 0/1px 100% no-repeat,linear-gradient(#fff3,#fff3) 0 33.33%/100% 1px no-repeat,linear-gradient(#fff3,#fff3) 0 66.66%/100% 1px no-repeat"></div>
          <div id="cmsg" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:15px;color:#E5E7EB"></div>
          ${target ? `<span class="tag" style="position:absolute;left:12px;top:12px;font-size:13px;background:#fff;color:#111">${target.no} · fotoğrafı değiştir</span>`
            : infoParent ? `<span class="tag sub" style="position:absolute;left:12px;top:12px;font-size:13px">${infoParent.no} → INFO</span>`
            : bp ? `<span class="tag sub" style="position:absolute;left:12px;top:12px;font-size:13px">${bp.no} BYPASS</span>` : ''}
        </div>
      </div>
      <div style="width:180px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:16px 12px">
        <div id="sat" style="display:flex;flex-direction:column;align-items:center;gap:4px;color:#9CA3AF;font-size:12px;text-align:center;min-height:70px">${satSvg}<span id="sact">Konum aranıyor…</span></div>
        <button id="shut" aria-label="Fotoğraf çek" style="width:96px;height:96px;border-radius:50%;border:5px solid #fff;background:transparent;padding:0;display:flex;align-items:center;justify-content:center"><span style="width:76px;height:76px;border-radius:50%;background:#fff;display:block"></span></button>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%">
          <label class="btn sm" style="background:#1F2937;color:#fff;border-color:#374151;cursor:pointer">${imgSvg} Galeri<input class="hid" type="file" accept="image/*" id="cgal"></label>
          <button class="btn sm" id="cclose" style="background:#1F2937;color:#fff;border-color:#374151">Kapat</button>
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
    GPS.last = null; GPS.on(paint); paint();
    const tick = setInterval(paint, 2000);
    const stop = () => { clearInterval(tick); GPS.off(); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; document.body.style.background = ''; window.removeEventListener('hashchange', stop); };
    window.addEventListener('hashchange', stop);
    const fallback = text => { msg.style.display = 'flex'; msg.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;align-items:center"><span>${text}</span><label class="btn red" style="cursor:pointer">${camSvg} Telefonun kamerasıyla çek<input class="hid" type="file" accept="image/*" capture="environment" id="cnat"></label></div>`;
      document.getElementById('cnat').onchange = e => e.target.files[0] && save(e.target.files[0]); };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      vid.srcObject = stream; await vid.play().catch(() => {});
    } catch (e) { fallback(e && e.name === 'NotAllowedError' ? 'Kamera izni verilmedi.' : 'Kamera açılamadı.'); }
    async function save(blob, fromGallery) {
      if (busy) return; busy = true;
      let pos = GPS.fresh(8000);
      if (!pos && !fromGallery) { sact.textContent = 'Konum bekleniyor…'; pos = await new Promise(res => { const t0 = Date.now(), iv = setInterval(() => { const f = GPS.fresh(8000); if (f || Date.now() - t0 > 8000) { clearInterval(iv); res(f); } }, 300); }); }
      stop();
      if (target) {   // replace the photo, keep the record's position (fill it in if it had none)
        await DB.delBlob(target.photoId); urls.delete(target.photoId);
        target.photoId = await DB.putBlob(await to43(blob)); target.pendingImage = null;
        if (target.latDec == null && pos) { target.latDec = pos.lat; target.lonDec = pos.lon; target.lat = Geo.dms(pos.lat, true); target.lon = Geo.dms(pos.lon, false); }
        await DB.putSurvey(sv); return go(back);
      }
      if (infoParent) return createRecord(sv, { file: blob, parent: infoParent, flag: 'INFO', name: infoParent.obstacle === 'Satellite View' ? 'Satellite View' : '' });
      createRecord(sv, { file: blob, pos: fromGallery ? null : pos, useGps: false, parent: bp || null, flag: bp ? 'BYPASS' : '' });
    }
    document.getElementById('shut').onclick = () => {
      if (!stream || !vid.videoWidth) return;
      const w = vid.videoWidth, h = vid.videoHeight; let cw = w, ch = w * 3 / 4; if (ch > h) { ch = h; cw = h * 4 / 3; }
      const c = document.createElement('canvas'); c.width = Math.round(cw); c.height = Math.round(ch);
      c.getContext('2d').drawImage(vid, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height);
      document.getElementById('vf').style.outline = '4px solid #fff'; setTimeout(() => { const v = document.getElementById('vf'); if (v) v.style.outline = ''; }, 150);
      c.toBlob(b => save(b), 'image/jpeg', 0.9);
    };
    document.getElementById('cgal').onchange = e => e.target.files[0] && save(e.target.files[0], false);
    document.getElementById('cclose').onclick = () => go(back);
  };

  // ----- add record: pick type, take photo -----
  V.add = async (id, q) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
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
              ${mains.length ? `<label class="f">Hangi engele ait?<select id="par">${mains.slice().reverse().map(m => `<option value="${m.id}" ${parent && parent.id === m.id ? 'selected' : ''}>${m.no} · ${esc(m.obstacle)} · KM ${fmt(m.km, 1)}</option>`).join('')}</select></label>
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
          if (sv.status === 'active') GPS.extend(sv, pos, true);
          rec.km = Math.round(sv.odo) / 1000;
        } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; rec.km = parent.km; }
        else { const prevRec = sv.records[sv.records.length - 1]; rec.km = prevRec ? prevRec.km : 0; }
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
  V.record = async (id, rid) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const recs = orderedRecords(sv), r = recs.find(x => x.id === rid); if (!r) return go(`#/s/${id}`);
    if (sv.selected !== r.id) { sv.selected = r.id; }
    const st = settingsOf(sv), refs = R.refs(st);
    const u = await blobUrl(r.photoId);
    const isOH = /^Overhead/.test(r.obstacle), isBr = r.obstacle === 'Bridge', isCu = r.obstacle === 'Culvert';
    const textKey = isOH ? 'actions' : 'remarks';
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
      $app.innerHTML = `${bar(r.obstacle || 'Yeni engel', `#/s/${sv.id}`, `<span class="tag ${r.flag ? 'sub' : ''}" style="font-size:13px;${r.flag ? '' : 'background:#E8EEF5;color:var(--navy)'}">${r.no}${r.flag ? ' ' + r.flag : ''}</span>`)}
      <div class="split even">
        <div class="pane">
          <div class="photo">${u ? `<img src="${u}" alt="">` : r.pendingImage ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff;font-size:15px">${imgSvg}Uydu / simülasyon görüntüsü ofiste eklenecek</div>` : ''}${annHtml(r.ann || [], -1)}
            <button class="btn sm" data-go="#/a/${sv.id}/${r.id}" style="position:absolute;right:10px;bottom:10px">İşaretle</button>
            <button class="btn sm" id="rep" style="position:absolute;left:10px;bottom:10px">${u ? 'Değiştir' : 'Fotoğraf ekle'}</button></div>
          <div class="card"><div class="g3">
            <label class="f">KM<input id="km" inputmode="decimal" value="${esc(fmt(r.km, 1))}"></label>
            <label class="f">Enlem<input id="la" inputmode="decimal" value="${r.latDec == null ? '' : r.latDec.toFixed(6)}"></label>
            <label class="f">Boylam<input id="lo" inputmode="decimal" value="${r.lonDec == null ? '' : r.lonDec.toFixed(6)}"></label></div>
            <div class="row" style="justify-content:space-between"><span class="hint">${r.lat ? esc(r.lat) + ' · ' + esc(r.lon) : 'Konum alınamadı, elle girilebilir'}</span><button class="btn sm" id="here">Konumu güncelle</button></div></div>
          <div class="g3"><button class="btn grn" id="infq">+ Info ekle</button>
            <button class="btn grn" id="simq">+ Simülasyon ekle</button>
            ${r.parentId ? `<button class="btn dash" id="del" style="color:var(--badtx)">Kaydı sil</button>` : `<button class="btn grn" id="bypq">+ Bypass ekle</button>`}</div>
          <span class="hint">Info: fotoğraf çek ya da galeriden seç. Simülasyon: boş görselli kayıt, görüntü ofiste eklenir. Bypass: alternatif yolun ilk engelinin fotoğrafını çek; sonraki engeller de bypass'a eklenir.</span>
          ${r.parentId ? '' : '<button class="btn dash" id="del" style="color:var(--badtx)">Kaydı sil</button>'}
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
          ${isOH && !st.general && !st.minHeight ? `<div class="note w">Taşıma yüksekliği girilmemiş; kontrol için "Etüt bilgileri"nden yüksekliği gir.</div>` : ''}
          ${isOH ? `<div class="sec">Yükseklikler${st.general ? '' : ' · sınır ' + fmt(lim, 2) + ' m'}</div>${r.heights.map(hrow).join('')}<button class="btn dash sm" id="hadd">+ Yükseklik ekle</button>` : ''}
          ${r.obstacle === 'Curve' ? `<div class="sec">Viraj yönü</div><div class="g2">${CURVES.map((c, i) => `<button class="chip ${r.remarks === c ? 'on' : ''}" data-curve="${i}" style="border-radius:12px">${i ? 'Left curve' : 'Right curve'}</button>`).join('')}</div>` : ''}
          ${!isOH && r.obstacle ? `${(r.widths || []).length ? `<div class="sec">Genişlik${cw ? ' · yük ' + fmt(cw, 2) + ' m' : ''}</div>${r.widths.map(wrow).join('')}` : ''}<button class="btn dash sm" id="wadd">+ Genişlik (W) ekle</button>` : ''}
          <label class="f">${isOH ? 'Actions' : 'Remarks'}${isOH && r.actionAuto && !st.general ? ' (otomatik önerildi, düzenlenebilir)' : ''}<textarea id="tx" rows="3">${esc(r[textKey] || '')}</textarea></label>
          ${(PHRASES[r.obstacle] || []).length ? `<div class="chips">${PHRASES[r.obstacle].map((p, i) => `<button class="chip" style="font-size:13px;border-radius:10px;text-align:left;min-height:40px;padding:8px 12px" data-ph="${i}">${esc(p)}</button>`).join('')}</div>` : ''}
          <div class="row" style="justify-content:space-between"><span class="sec">REMARKS rengi</span>${auto ? `<span class="tag warn">Otomatik: ${COLNAME[auto]}</span>` : ''}</div>
          <div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px">
            ${sw('auto', 'Otomatik', auto ? COLORS.find(c => c[0] === auto)[2] : '#fff', cur == null)}${sw('none', 'Yok', '#fff', cur === 'none')}
            ${COLORS.map(c => sw(c[0], c[1], `linear-gradient(180deg,#fff,${c[2]},#fff)`, cur === c[0])).join('')}</div>
        </div>
      </div>
      <div class="foot"><button class="btn" id="cancel">${r.obstacle ? 'Vazgeç' : 'Kaydı iptal et'}</button><button class="btn pri" id="ok">Kaydet</button></div>`;
      bind();
    };
    const read = () => {
      const g = i => document.getElementById(i);
      const km = pn(g('km').value); if (km != null) r.km = km;
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
      document.querySelectorAll('[data-wv],[data-wl]').forEach(i => i.addEventListener('change', () => { read(); draw(); }));
      document.querySelectorAll('[data-hl]').forEach(i => i.addEventListener('change', () => { read(); draw(); }));
      g('rep').onclick = () => sheet(u ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle', [
        { label: 'Fotoğraf çek', icon: camSvg, cls: 'red', run: async () => { read(); await DB.putSurvey(sv); go(`#/cam/${sv.id}?replace=${r.id}`); } },
        { label: 'Galeriden seç', icon: imgSvg, file: true, run: async f => { read(); await DB.delBlob(r.photoId); urls.delete(r.photoId); r.photoId = await DB.putBlob(await to43(f)); r.pendingImage = null; await DB.putSurvey(sv); V.record(id, rid); } },
      ]);
      g('here').onclick = async () => { read(); const p = await GPS.current(); if (!p) return toast('Konum alınamadı'); r.latDec = p.lat; r.lonDec = p.lon; r.lat = Geo.dms(p.lat, true); r.lon = Geo.dms(p.lon, false); draw(); };
      g('del').onclick = async e => {
        const b = e.target.closest('button');
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Emin misin? Kaydı ve alt kayıtlarını sil'; return; }
        const gone = sv.records.filter(x => x.id === r.id || x.parentId === r.id);
        for (const x of gone) await DB.delBlob(x.photoId);
        sv.records = sv.records.filter(x => !gone.includes(x)); if (sv.bypassParent === r.id) sv.bypassParent = null; sv.selected = null;
        await DB.putSurvey(sv); go(`#/s/${sv.id}`);
      };
      g('cancel').onclick = async () => {   // a fresh photo without a type is thrown away; otherwise just leave without saving
        if (!r.obstacle) { await DB.delBlob(r.photoId); sv.records = sv.records.filter(x => x.id !== r.id); if (sv.bypassParent === r.id) sv.bypassParent = null; await DB.putSurvey(sv);  }
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
        const s = e.target.closest('[data-sub]'), p = e.target.closest('[data-ph]'), c = e.target.closest('[data-col]'), hd = e.target.closest('[data-hdel]'), nav = e.target.closest('[data-go]');
        if (nav) { read(); await DB.putSurvey(sv); return; }
        if (s) { read(); r.fields.type = s.dataset.sub; autoAct(); draw(); }
        if (p) { read(); const t = PHRASES[r.obstacle][p.dataset.ph]; r[textKey] = t; if (isOH) r.actionAuto = false; draw(); const tx = document.getElementById('tx'); tx.focus(); const k = tx.value.lastIndexOf('%'); if (k >= 0 && /about %/.test(tx.value)) tx.setSelectionRange(k, k); }
        if (c) { read(); r.highlight = c.dataset.col === 'auto' ? null : c.dataset.col; draw(); }
        if (hd) { read(); r.heights.splice(hd.dataset.hdel, 1); autoAct(); draw(); }
        const wd = e.target.closest('[data-wdel]'); if (wd) { read(); r.widths.splice(wd.dataset.wdel, 1); draw(); }
        const cv = e.target.closest('[data-curve]'); if (cv) { read(); r.remarks = CURVES[cv.dataset.curve]; draw(); }
      };
    };
    autoAct(); draw();
  };

  // ----- photo annotation -----
  // editor items: {k:'arrow',x,y,w,h,rot} · {k:'text',x,y,w,text} · {k:'line',x1,y1,x2,y2}   (all in 0..1 of the photo)
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
  function annToOverlays(items, stage) {
    return items.map((o, i) => {
      if (o.k === 'arrow') return { kind: 'sp', geom: 'upArrow', x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, fill: '#FFFF00' };
      if (o.k === 'text') {
        const el = stage && stage.querySelector(`.ov[data-i="${i}"]`); const hh = el ? el.getBoundingClientRect().height / stage.getBoundingClientRect().height : 0.12;
        return { kind: 'sp', geom: 'rect', x: o.x, y: o.y, w: o.w, h: hh, line: '#FF0000', lw: 1.5, fill: '#FFFFFF', text: [[{ t: o.text || '', b: true, sz: 11, color: '#FF0000' }]] };
      }
      return { kind: 'cxnSp', x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1), flipH: o.x1 > o.x2, flipV: o.y1 > o.y2, line: '#FF0000', lw: 2.25, head: 'none', tail: 'triangle' };
    });
  }
  V.annotate = async (id, rid) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const r = sv.records.find(x => x.id === rid); if (!r) return go(`#/s/${id}`);
    const u = await blobUrl(r.photoId), items = JSON.parse(JSON.stringify(r.ann || [])); let sel = -1;
    $app.innerHTML = `${bar('Fotoğrafı işaretle', `#/r/${id}/${rid}`)}
      <div class="split wide">
        <div class="pane photo-stage" style="overflow:hidden"><div class="photo" id="stage">${u ? `<img src="${u}" alt="">` : ''}<div id="lay" style="position:absolute;inset:0"></div></div></div>
        <div class="pane">
          <div class="sec">Ekle</div>
          <div class="tools"><button class="btn" data-add="arrow">+ Yön oku</button><button class="btn" data-add="text">+ Not kutusu</button><button class="btn" data-add="line">+ Kırmızı ok</button><button class="btn" data-add="h">+ Yükseklik</button></div>
          <div class="hint">Öğeye dokunup sürükle. Kırmızı okun iki ucunu ayrı ayrı taşıyabilirsin.</div>
          <div id="ctl"></div>
        </div>
      </div>
      <div class="foot"><button class="btn pri" id="ok">Bitti</button></div>`;
    const stage = document.getElementById('stage'), lay = document.getElementById('lay'), ctl = document.getElementById('ctl');
    const paint = () => {
      lay.innerHTML = annHtml(items, sel);
      const o = items[sel];
      ctl.innerHTML = !o ? '' : `<div class="card"><div class="sec">Seçili öğe</div>${o.k === 'text' ? `<label class="f">Not metni<textarea id="tv" rows="2">${esc(o.text)}</textarea></label>` : ''}
        <div class="tools">${o.k === 'arrow' ? '<button class="btn sm" data-c="rl">↺ Döndür</button><button class="btn sm" data-c="rr">↻ Döndür</button>' : ''}
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
        if (k === 'h') {
          const hs = (r.heights || []).map(h => pn(h.value)).filter(v => v != null), v = hs.length ? Math.min(...hs) : null;
          items.push({ k: 'line', x1: 0.6, y1: 0.75, x2: 0.6, y2: 0.3 }); items.push({ k: 'text', x: 0.38, y: 0.5, w: 0.2, text: v == null ? 'H:  m' : `H: ${v.toFixed(2)} m` });
        }
        sel = items.length - 1; paint();
      }
      if (c && items[sel]) {
        const o = items[sel], k = c.dataset.c;
        if (k === 'rl') o.rot = ((o.rot || 0) - 15) % 360; if (k === 'rr') o.rot = ((o.rot || 0) + 15) % 360;
        if (k === 'big' || k === 'small') { const f = k === 'big' ? 1.2 : 1 / 1.2; o.w *= f; if (o.h) o.h *= f; }
        if (k === 'del') { items.splice(sel, 1); sel = -1; }
        paint();
      }
    };
    document.getElementById('ok').onclick = async () => { sel = -1; paint(); r.ann = items; r.overlays = annToOverlays(items, stage); await DB.putSurvey(sv); go(`#/r/${id}/${rid}`); };
    paint();
  };

  // ----- report setup -----
  V.report = async (id) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const recs = orderedRecords(sv), c = sv.project.conclusion || (sv.project.conclusion = {});
    const cnt = t => recs.filter(r => t.includes(r.obstacle)).length;
    const nf = recs.filter(r => r.flag === 'BYPASS').length, ni = recs.filter(r => r.flag === 'INFO').length;
    const miss = recs.filter(r => !r.photoId).length, nopos = recs.filter(r => r.latDec == null).length;
    c.bridge = c.bridge || 'required'; c.road = c.road || 'paved_ok';
    const opt = (k, v, t) => `<label class="row" style="border:${c[k] === v ? '2px solid var(--navy)' : '1px solid var(--line2)'};border-radius:10px;padding:10px;font-size:14px;background:#fff"><input type="radio" name="${k}" value="${v}" ${c[k] === v ? 'checked' : ''} style="width:18px;height:18px">${t}</label>`;
    $app.innerHTML = `${bar('Rapor oluştur', `#/s/${id}`, cargoBox(sv.project))}
    <div class="split even">
      <div class="pane">
        <div class="card"><b>1.5 Brief Information <span class="tag ok">Otomatik</span></b>
          <div class="stat4"><div><b>${Math.round(Math.max(0, ...recs.filter(r => !r.flag).map(r => r.km || 0)))}</b><span>km</span></div><div><b>${cnt(['Bridge'])}</b><span>köprü</span></div>
            <div><b>${cnt(['Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn'])}</b><span>dönüş/viraj</span></div><div><b>${cnt(['Overhead Structure'])}</b><span>üst yapı</span></div></div></div>
        <div class="card"><b>3 Route Survey</b><span class="hint">${recs.length} kayıt · her sayfada 3 engel · ${Math.ceil(recs.length / 3)} sayfa · ${recs.length - nf - ni} ana, ${nf} BYPASS, ${ni} INFO</span>
          ${miss ? `<span class="note w">${miss} kayıtta fotoğraf yok.</span>` : ''}${nopos ? `<span class="note w">${nopos} kayıtta konum yok.</span>` : ''}</div>
        <div class="card"><b>2 Transportation Drawing</b><span class="hint">${sv.logos.drawing ? 'Çizim yüklendi.' : 'Çizim yüklenmedi; "Etüt bilgileri" ekranından resim olarak ekleyebilirsin.'}</span></div>
        <div class="hint">Giriş metinleri, kısaltmalar, 4.2–4.8 standart metinleri ve referans fotoğrafları otomatik eklenir. Güzergah haritası internet varsa OpenStreetMap'ten çizilir.</div>
      </div>
      <div class="pane">
        <div class="card"><b>4.1 Bridge</b>${opt('bridge', 'done_ok', 'Statik analiz yapıldı, tüm köprüler uygun')}${opt('bridge', 'required', 'Statik analiz gerekli')}${opt('bridge', 'custom', 'Kendi metnimi yazacağım')}
          <label class="f" style="${c.bridge === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="bt" rows="3">${esc(c.bridgeText || '')}</textarea></label></div>
        <div class="card"><b>4.6 Road condition</b>${opt('road', 'paved_ok', 'Yol uygun, tamamı asfalt, kritik dar nokta yok')}${opt('road', 'custom', 'Kendi metnimi yazacağım')}
          <label class="f" style="${c.road === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="rt" rows="3">${esc(c.roadText || '')}</textarea></label></div>
      </div>
    </div>
    <div class="foot"><button class="btn pri" id="mk">Raporu aç ve PDF al</button></div>`;
    const save = async () => { const b = document.getElementById('bt'), r2 = document.getElementById('rt'); c.bridgeText = b.value.trim(); c.roadText = r2.value.trim(); await DB.putSurvey(sv); };
    $app.onchange = async e => { if (e.target.type === 'radio') { await save(); c[e.target.name] = e.target.value; await DB.putSurvey(sv); V.report(id); } };
    document.getElementById('mk').onclick = async () => { await save(); location.href = `report.html#${id}`; };
  };

  // ---------- router ----------
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  async function route() {
    $app.onclick = null; $app.onchange = null; window.scrollTo(0, 0); document.querySelectorAll('.toast').forEach(t => t.remove());
    const [path, qs] = (location.hash.slice(1) || '/').split('?'), p = path.split('/').filter(Boolean), q = Object.fromEntries(new URLSearchParams(qs || ''));
    try {
      if (!p.length) await V.home();
      else if (p[0] === 'new') await V.form(null);
      else if (p[0] === 'edit') await V.form(p[1]);
      else if (p[0] === 's') await V.survey(p[1]);
      else if (p[0] === 'add') await V.add(p[1], q);
      else if (p[0] === 'cam') await V.camera(p[1], q);
      else if (p[0] === 'r') await V.record(p[1], p[2]);
      else if (p[0] === 'a') await V.annotate(p[1], p[2]);
      else if (p[0] === 'rep') await V.report(p[1]);
      else go('#/');
    } catch (err) { console.error(err); $app.innerHTML = `${bar('Hata', '#/')}<div class="full"><div class="note w">Beklenmeyen bir hata oluştu: ${esc(err.message)}</div></div>`; }
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
