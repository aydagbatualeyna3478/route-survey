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
    'Curve': ['Right curve. Turning radius of the curve is suitable for planned transportation operation.', 'Left curve. Turning radius of the curve is suitable for planned transportation operation.'],
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
  const settingsOf = sv => ({ minHeight: pn((sv.project.cargo && sv.project.cargo.height) ?? sv.project.minHeight) ?? 0, refLV: pn(sv.project.refLV), refMV: pn(sv.project.refMV), refHV: pn(sv.project.refHV) });
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

  // ---------- GPS: track + odometer while a survey is active ----------
  const GPS = {
    watch: null, last: null, sv: null, dirty: 0, err: null, lock: null,
    start(sv) {
      this.sv = sv;
      if (this.watch != null || !navigator.geolocation) { if (!navigator.geolocation) this.err = 'yok'; return; }
      this.watch = navigator.geolocation.watchPosition(p => this.on(p), e => { this.err = e.code === 1 ? 'izin' : 'sinyal'; paintGps(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
      this.keepAwake();
    },
    stop() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; this.flush(); this.sv = null; if (this.lock) { this.lock.release().catch(() => {}); this.lock = null; } },
    async keepAwake() { try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch (e) { /* not available */ } },
    on(p) {
      this.err = null;
      this.last = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
      const sv = this.sv;
      if (sv && sv.status === 'active' && p.coords.accuracy <= 40) this.extend(sv, this.last);
      paintGps();
    },
    /* Track points are [lat, lon, time, km-from-start in metres]. Driving back along a road already measured
       (e.g. returning to where a bypass branches off) snaps the odometer back to that earlier point,
       so KM is always the distance from the starting point. */
    extend(sv, pt, force) {
      const tr = sv.track, prev = tr[tr.length - 1];
      if (!prev) { tr.push([pt.lat, pt.lon, pt.t, 0]); sv.odo = 0; this.dirty++; return; }
      const d = Geo.hav(prev, [pt.lat, pt.lon]);
      if (d < (force ? 3 : Math.max(8, Math.min(pt.acc || 0, 25)))) return;
      let cum = (prev[3] || 0) + d;
      const k = Math.cos(pt.lat * Math.PI / 180), vx = (pt.lon - prev[1]) * k, vy = pt.lat - prev[0];
      let best = -1, bd = 45;
      for (let j = 0; j < tr.length - 12; j++) {
        const q = tr[j]; if (Math.abs(q[0] - pt.lat) > 0.0006 || Math.abs(q[1] - pt.lon) > 0.0009) continue;
        const dj = Geo.hav(q, [pt.lat, pt.lon]); if (dj >= bd || cum - (q[3] || 0) < 250) continue;
        const n = tr[j + 1], ux = (n[1] - q[1]) * k, uy = n[0] - q[0];
        if (ux * vx + uy * vy < 0) { bd = dj; best = j; }   // only when heading the opposite way
      }
      if (best >= 0) cum = tr[best][3] || 0;
      tr.push([pt.lat, pt.lon, pt.t, cum]); sv.odo = cum; this.dirty++; if (this.dirty >= 12) this.flush();
    },
    flush() { if (this.sv && this.dirty) { this.dirty = 0; DB.putSurvey(this.sv); } },
    fresh() { return this.last && Date.now() - this.last.t < 30000 ? this.last : null; },
    current() { // best position for a new record
      return new Promise(res => {
        const f = this.fresh(); if (f) return res(f);
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(p => { this.on(p); res(this.last); }, () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 });
      });
    },
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && GPS.sv) GPS.keepAwake(); else GPS.flush(); });
  function paintGps() {
    const g = document.getElementById('gps'), k = document.getElementById('km');
    if (g) {
      const f = GPS.fresh();
      g.className = 'gps ' + (GPS.err ? 'bad' : f ? 'on' : '');
      g.lastChild.textContent = GPS.err === 'izin' ? 'Konum izni yok' : GPS.err ? 'GPS sinyali yok' : f ? `GPS ±${Math.round(f.acc)} m` : 'GPS aranıyor…';
    }
    if (k && GPS.sv) k.textContent = fmt(GPS.sv.odo / 1000, 1);
  }

  /* new record from a photo (or none). Camera photos take the current GPS position; INFO images take the parent's. */
  async function createRecord(sv, o) {
    toast('Kaydediliyor…');
    const parent = o.parent || null, name = o.name || '';
    const rec = { id: DB.uid(), parentId: parent ? parent.id : null, flag: o.flag || '', obstacle: name, t: Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [] };
    if (/Overhead/.test(name)) rec.heights = [{ label: 'H', value: null }];
    if (o.file) { rec.photoId = await DB.putBlob(await to43(o.file)); rec.aspect = 4 / 3; }
    const pos = o.useGps ? await GPS.current() : null;
    if (pos) {
      rec.latDec = pos.lat; rec.lonDec = pos.lon; rec.acc = pos.acc;
      if (sv.status === 'active') GPS.extend(sv, pos, true);
      rec.km = Math.round(sv.odo) / 1000;
    } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; rec.km = parent.km; }
    else { const prevRec = sv.records[sv.records.length - 1]; rec.km = prevRec ? prevRec.km : Math.round(sv.odo) / 1000; }
    if (rec.latDec != null) { rec.lat = Geo.dms(rec.latDec, true); rec.lon = Geo.dms(rec.lonDec, false); }
    if (name && PHRASES[name] && PHRASES[name].length === 1 && !/%/.test(PHRASES[name][0]) && !/Overhead|Bridge|Culvert/.test(name)) rec.remarks = PHRASES[name][0];
    sv.records.push(rec); sv.selected = rec.id; await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv;
    go(`#/r/${sv.id}/${rec.id}`);
  }

  // ---------- views ----------
  const V = {};
  const imgSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>';
  const cargoOf = p => p.cargo || { height: p.minHeight };
  const cargoBox = p => {
    const c = cargoOf(p), m = v => v == null || v === '' ? '–' : fmt(v) + ' m';
    return `<div class="cargo"><b>Taşıma Bilgileri</b><div class="cg"><span>Uzunluk: <b>${m(c.length)}</b></span><span>Genişlik: <b>${m(c.width)}</b></span>
      <span>Yükseklik: <b>${m(c.height)}</b></span><span>Ağırlık: <b>${c.weight == null || c.weight === '' ? '–' : fmt(c.weight) + ' t'}</b></span></div></div>`;
  };

  V.home = async () => {
    GPS.stop();
    const list = (await DB.listSurveys()).sort((a, b) => b.createdAt - a.createdAt);
    const card = sv => {
      const n = sv.records.length, act = sv.status === 'active', c = cargoOf(sv.project);
      return `<div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:17px">${esc(sv.project.start.name)} → ${esc(sv.project.end.name)}</b>
        <span class="tag ${act ? 'warn' : 'ok'}">${act ? 'Sahada' : 'Tamamlandı'}</span></div>
        <div class="hint">${esc(sv.project.date || '')} · ${fmt(sv.odo / 1000, 1)} km · ${n} kayıt${c.height ? ' · yük H ' + fmt(c.height) + ' m' : ''}</div>
        <div class="row"><button class="btn grow sm" data-go="#/s/${sv.id}">${act ? 'Etüde devam et' : 'Kayıtları aç'}</button><button class="btn grow sm" data-go="#/rep/${sv.id}">Rapor</button></div></div>`;
    };
    $app.innerHTML = `${bar('Etütlerim', null, '<button class="btn pri" data-go="#/new" style="min-width:260px">+ Yeni etüt raporu oluştur</button>')}
      <div class="full">${list.length ? `<div class="tiles">${list.map(card).join('')}</div>` : '<div class="empty">Henüz etüt yok. Sağ üstteki "Yeni etüt raporu oluştur" ile başla.</div>'}
      <div class="hint" style="text-align:center;margin-top:auto">Veriler bu cihazda saklanır, internetsiz de çalışır.</div></div>`;
  };

  // ----- project form (new / edit) -----
  V.form = async (id) => {
    GPS.stop();
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
    const refsOpen = p.refLV != null && p.refLV !== '' || p.refMV != null && p.refMV !== '' || p.refHV != null && p.refHV !== '';
    $app.innerHTML = `${bar(sv ? 'Etüt bilgileri' : 'Yeni etüt raporu', sv ? `#/s/${sv.id}` : '#/')}
    <form class="split even" id="pf" autocomplete="off">
      <div class="pane">
        <div class="sec">Güzergah</div>
        <div class="g2"><label class="f">Başlangıç noktası<input name="start" required value="${esc(p.start.name)}" placeholder="Fabrika / saha adı"></label>
          <label class="f">Varış noktası<input name="end" required value="${esc(p.end.name)}" placeholder="Liman / saha adı"></label></div>
        <div class="sec">Taşıma bilgileri</div>
        <div class="g4"><label class="f">Uzunluk (m)<input name="length" inputmode="decimal" value="${esc(fmt(c.length))}"></label>
          <label class="f">Genişlik (m)<input name="width" inputmode="decimal" value="${esc(fmt(c.width))}"></label>
          <label class="f">Yükseklik (m)<input name="height" inputmode="decimal" required value="${esc(fmt(c.height))}" style="font-weight:600;border:2px solid var(--navy)"></label>
          <label class="f">Ağırlık (ton)<input name="weight" inputmode="decimal" value="${esc(fmt(c.weight))}"></label></div>
        <span class="hint">Yükseklik, üst yapı ve enerji hattı kontrollerinde sınır olarak kullanılır.</span>
        <details ${refsOpen ? 'open' : ''} class="card" style="gap:8px"><summary style="font-size:14px;font-weight:600;color:var(--navy);cursor:pointer">Enerji hattı referans yükseklikleri (otomatik)</summary>
          <span class="hint">Boş bırakırsan taşıma yüksekliğinin 1 / 3 / 4 m fazlası kullanılır. Hat bu yüksekliğin altındaysa kayıt renklenir (AG sarı, OG magenta, YG mor) ve enerji kesme cümlesi eklenir.</span>
          <div class="g3"><label class="f">AG (m)<input name="refLV" inputmode="decimal" value="${esc(fmt(p.refLV))}" id="rLV"></label>
            <label class="f">OG (m)<input name="refMV" inputmode="decimal" value="${esc(fmt(p.refMV))}" id="rMV"></label>
            <label class="f">YG (m)<input name="refHV" inputmode="decimal" value="${esc(fmt(p.refHV))}" id="rHV"></label></div></details>
        <div class="sec">Kapak bilgileri</div>
        <div class="g2"><label class="f">Müşteri unvanı<input name="client" value="${esc(p.client)}"></label>
          <label class="f">Kimin için hazırlandığı<input name="preparedFor" value="${esc(p.preparedFor)}" placeholder="Boşsa müşteri unvanı yazılır"></label></div>
        <div class="g2"><label class="f">Proje referansı<input name="reference" value="${esc(p.reference)}"></label><label class="f">Rev. no<input name="rev" value="${esc(p.rev)}"></label></div>
      </div>
      <div class="pane">
        <label class="f">Hazırlayanlar (her satıra bir isim)<textarea name="preparedBy" rows="3">${esc((p.preparedBy || []).join('\n'))}</textarea></label>
        <div class="sec">Logolar · yerleşim otomatik</div>
        <div class="g3">${await slot('company', 'Bizim firma', 'Her etütte hazır', null, compLogo ? `<img src="${compLogo}" alt="">` : '<img src="assets/logo_company.jpg" alt="">')}
          ${await slot('partner', 'Ortak logo', 'İsteğe bağlı', logos.partner)}${await slot('client', 'Müşteri', 'Kapak + sayfalar', logos.client)}</div>
        <div class="g2">${await slot('cover', 'Kapak fotoğrafı', 'Boşsa standart', logos.cover, '<img src="assets/cover_photo.jpg" alt="">')}${await slot('drawing', 'Taşıma çizimi', 'Resim (JPG/PNG)', logos.drawing)}</div>
      </div>
    </form>
    <div class="foot"><button class="btn pri" id="save">${sv ? 'Kaydet' : 'Etüdü başlat'}</button></div>`;
    const f = document.getElementById('pf'), pending = {};
    const showRefs = () => { const h = pn(f.height.value); [['rLV', 1], ['rMV', 3], ['rHV', 4]].forEach(([k, d]) => { document.getElementById(k).placeholder = h == null ? '' : fmt(h + d, 2); }); };
    f.height.addEventListener('input', showRefs); showRefs();
    f.querySelectorAll('[data-logo]').forEach(inp => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      const key = inp.dataset.logo, blob = await shrink(inp.files[0], key === 'drawing' ? 3000 : key === 'cover' ? 1800 : 1200);
      pending[key] = blob; document.getElementById('pv-' + key).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
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
        cargo, minHeight: cargo.height, refLV: pn(f.refLV.value), refMV: pn(f.refMV.value), refHV: pn(f.refHV.value),
      });
      if (!sv) { s.project.date = `${months[now.getMonth()]} ${now.getFullYear()}`; s.project.surveyDate = `${full[now.getMonth()]}, ${now.getFullYear()}`; }
      for (const k of ['partner', 'client', 'cover', 'drawing']) if (pending[k]) { await DB.delBlob(s.logos[k]); s.logos[k] = await DB.putBlob(pending[k]); }
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
    if (act) GPS.start(sv); else GPS.stop();
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
      return `<button class="rec ${sub ? 'sub' : ''} ${last === r.id ? 'on' : ''}" data-rec="${r.id}">${u ? `<img src="${u}" alt="">` : '<span class="ph"></span>'}
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
            ${act ? '<span class="gps" id="gps"><i></i><span>GPS aranıyor…</span></span>' : '<span class="tag ok">Tamamlandı</span>'}</div>
          <div class="row" style="gap:18px;color:var(--mut);font-size:14px"><span>KM <b id="km" style="color:var(--ink)">${fmt(sv.odo / 1000, 1)}</b></span>
            <span>${recs.filter(r => r.flag === 'BYPASS').length} bypass · ${recs.filter(r => r.flag === 'INFO').length} info</span></div>
          <div class="hint">Info, Bypass ve uydu fotoğrafını bir engele eklemek ya da engeli düzenlemek için listeden engele dokun.</div>
          ${bp ? `<div class="note g row" style="justify-content:space-between"><span>Bypass açık: <b>${bp.no} · ${esc(bp.obstacle)}</b>. Yeni engeller ${bp.no}-… olarak eklenir.</span></div>` : ''}
          <div class="acts">
            ${act ? rb('data-act="nophoto"', '', '', 'Fotoğrafsız Engel Ekle')
              + rb(`data-go="#/add/${sv.id}?mode=sat"`, '', imgSvg, 'Uydu Fotoğrafı Ekle')
              + rb('', 'ghost', '', '') + rb('', 'ghost', '', '') + rb('', 'ghost', '', '')
              + (bp ? rb('data-act="endbypass"', 'grn', '', "Bypass'ı Bitir") : rb('', 'ghost', '', ''))
              + rb('data-act="finish"', '', '', 'Etüdü Bitir') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + `<label class="rb red" style="cursor:pointer">${camSvg}<span>Yeni Engel Ekle</span><input class="hid" type="file" accept="image/*" capture="environment" id="camq"></label>`
            : rb('data-act="resume"', '', '', 'Etüde Devam Et') + rb(`data-go="#/edit/${sv.id}"`, '', '', 'Etüt Bilgileri') + rb(`data-go="#/rep/${sv.id}"`, 'navy', '', 'Rapor')}
          </div>
        </div>
      </div>`;
    paintGps();
    const camq = document.getElementById('camq');
    if (camq) camq.onchange = e => { const f = e.target.files[0]; if (f) createRecord(sv, { file: f, useGps: true, parent: bp || null, flag: bp ? 'BYPASS' : '' }); };
    const onSel = document.querySelector('.rec.on'); if (onSel) onSel.scrollIntoView({ block: 'nearest' });
    $app.onclick = async e => {
      const rc = e.target.closest('[data-rec]');
      if (rc) return go(`#/r/${sv.id}/${rc.dataset.rec}`);
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'nophoto') return createRecord(sv, { useGps: true, parent: bp || null, flag: bp ? 'BYPASS' : '' });
      if (a.dataset.act === 'endbypass') sv.bypassParent = null;
      if (a.dataset.act === 'finish') { if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.querySelector('span').textContent = 'Emin misin? Dokun'; a.style.borderColor = 'var(--red)'; return; } GPS.flush(); sv.status = 'done'; sv.bypassParent = null; }
      if (a.dataset.act === 'resume') sv.status = 'active';
      await DB.putSurvey(sv); V.survey(id);
    };
  };

  // ----- add record: pick type, take photo -----
  V.add = async (id, q) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    if (sv.status === 'active') GPS.start(sv);
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
              <label class="btn red" style="min-height:90px;font-size:18px">${imgSvg} Galeriden seç<input class="hid" type="file" accept="image/*" id="gal"></label>`
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
        sv.records.push(rec); sv.selected = rec.id; await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv;
        go(`#/r/${sv.id}/${rec.id}`);
      };
      const cam = document.getElementById('cam'), gal = document.getElementById('gal'), nop = document.getElementById('nop');
      if (cam) cam.onchange = e => e.target.files[0] && make(e.target.files[0], true);
      if (gal) gal.onchange = e => e.target.files[0] && make(e.target.files[0], mode !== 'sat' && !(flag === 'INFO'));
      if (nop) nop.onclick = () => make(null, true);
      const f = GPS.fresh(), pe = document.getElementById('pos');
      if (mode !== 'sat') pe.textContent = f ? `Konum hazır: ${Geo.dms(f.lat, true)} · ${Geo.dms(f.lon, false)} (±${Math.round(f.acc)} m)` : 'Konum aranıyor… Kayıt anında tekrar denenecek.';
    };
    draw();
  };

  // ----- record form: photo on the left, details on the right -----
  V.record = async (id, rid) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    if (sv.status === 'active') GPS.start(sv);
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
        const v = pn(h.value), cls = v == null ? '' : v < lim ? 'bad' : 'ok';
        return `<div class="hrow ${cls}"><input class="lab" data-hl="${i}" value="${esc(h.label)}" aria-label="Etiket"><input data-hv="${i}" inputmode="decimal" value="${esc(fmt(h.value))}" placeholder="m" aria-label="Yükseklik (m)">
          <span style="flex:1;font-size:13px;font-weight:600;color:${cls === 'bad' ? 'var(--badtx)' : 'var(--oktx)'}">${v == null ? '' : v < lim ? fmt(lim - v, 2) + ' m eksik' : 'Uygun'}</span>
          ${r.heights.length > 1 ? `<button class="btn sm" data-hdel="${i}" aria-label="Sil">×</button>` : ''}</div>`;
      };
      const sub = SUB[r.obstacle];
      const sw = (key, name, col, on) => `<button class="sw ${on ? 'on' : ''}" data-col="${key}"><i style="background:${col}"></i>${name}</button>`;
      $app.innerHTML = `${bar(r.obstacle || 'Yeni engel', `#/s/${sv.id}`, `<span class="tag ${r.flag ? 'sub' : ''}" style="font-size:13px;${r.flag ? '' : 'background:#E8EEF5;color:var(--navy)'}">${r.no}${r.flag ? ' ' + r.flag : ''}</span>`)}
      <div class="split even">
        <div class="pane">
          <div class="photo">${u ? `<img src="${u}" alt="">` : ''}${annHtml(r.ann || [], -1)}
            <button class="btn sm" data-go="#/a/${sv.id}/${r.id}" style="position:absolute;right:10px;bottom:10px">İşaretle</button>
            <label class="btn sm" style="position:absolute;left:10px;bottom:10px">${u ? 'Değiştir' : 'Fotoğraf ekle'}<input class="hid" type="file" accept="image/*" id="rep"></label></div>
          <div class="card"><div class="g3">
            <label class="f">KM<input id="km" inputmode="decimal" value="${esc(fmt(r.km, 1))}"></label>
            <label class="f">Enlem<input id="la" inputmode="decimal" value="${r.latDec == null ? '' : r.latDec.toFixed(6)}"></label>
            <label class="f">Boylam<input id="lo" inputmode="decimal" value="${r.lonDec == null ? '' : r.lonDec.toFixed(6)}"></label></div>
            <div class="row" style="justify-content:space-between"><span class="hint">${r.lat ? esc(r.lat) + ' · ' + esc(r.lon) : 'Konum alınamadı, elle girilebilir'}</span><button class="btn sm" id="here">Konumu güncelle</button></div></div>
          <div class="g2"><label class="btn grn" style="cursor:pointer">+ INFO ekle<input class="hid" type="file" accept="image/*" id="infq"></label>
            ${r.parentId ? `<button class="btn dash" id="del" style="color:var(--badtx)">Kaydı sil</button>` : `<label class="btn grn" style="cursor:pointer">+ BYPASS başlat<input class="hid" type="file" accept="image/*" capture="environment" id="bypq"></label>`}</div>
          <span class="hint">INFO: kamera ya da galeriden görsel (uydu, drone, simülasyon). BYPASS: alternatif yolun ilk engelinin fotoğrafını çek; sonraki engeller de bypass'a eklenir.</span>
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
          ${isOH ? `<div class="sec">Yükseklikler · sınır ${fmt(lim, 2)} m</div>${r.heights.map(hrow).join('')}<button class="btn dash sm" id="hadd">+ Yükseklik ekle (H1 / H2 / HR / HL)</button>` : ''}
          <label class="f">${isOH ? 'Actions' : 'Remarks'}${isOH && r.actionAuto ? ' (otomatik önerildi, düzenlenebilir)' : ''}<textarea id="tx" rows="3">${esc(r[textKey] || '')}</textarea></label>
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
      document.querySelectorAll('[data-hl]').forEach(i => { r.heights[i.dataset.hl].label = i.value.trim() || 'H'; });
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
        if (!r.remarks && PHRASES[t] && PHRASES[t].length === 1 && !/%/.test(PHRASES[t][0]) && !/Overhead|Bridge|Culvert/.test(t)) r.remarks = PHRASES[t][0];
        DB.putSurvey(sv).then(() => V.record(id, rid)); };
      g('cnv').onchange = () => { if (g('cnv').value.trim()) setType(g('cnv').value.trim()); };
      const infq = g('infq'), bypq = g('bypq'), mainRec = r.parentId ? recs.find(x => x.id === r.parentId) : r;
      infq.onchange = async e => { const f = e.target.files[0]; if (!f) return; read(); autoAct(); await DB.putSurvey(sv); createRecord(sv, { file: f, parent: mainRec, flag: 'INFO', name: 'Satellite View' }); };
      if (bypq) bypq.onchange = async e => { const f = e.target.files[0]; if (!f) return; read(); autoAct(); sv.bypassParent = r.id; await DB.putSurvey(sv); createRecord(sv, { file: f, useGps: true, parent: r, flag: 'BYPASS' }); };
      if (g('hadd')) g('hadd').onclick = () => { read(); if (r.heights.length === 1 && r.heights[0].label === 'H') r.heights[0].label = 'H1'; r.heights.push({ label: 'H' + (r.heights.length + 1), value: null }); draw(); };
      g('rep').onchange = async e => { if (!e.target.files[0]) return; read(); await DB.delBlob(r.photoId); urls.delete(r.photoId); r.photoId = await DB.putBlob(await to43(e.target.files[0])); await DB.putSurvey(sv); V.record(id, rid); };
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
        if (!r.obstacle) { await DB.delBlob(r.photoId); sv.records = sv.records.filter(x => x.id !== r.id); if (sv.bypassParent === r.id) sv.bypassParent = null; await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv; }
        go(`#/s/${sv.id}`);
      };
      g('ok').onclick = async () => { read(); if (!r.obstacle) { toast('Önce engel tipini seç'); return; } autoAct(); await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv; go(`#/s/${sv.id}`); };
      $app.onclick = async e => {
        const ty = e.target.closest('[data-type]'), tc = e.target.closest('[data-tcustom]');
        if (ty) return setType(ty.dataset.type);
        if (tc) { document.getElementById('cnw').style.display = ''; document.getElementById('cnv').focus(); return; }
        const s = e.target.closest('[data-sub]'), p = e.target.closest('[data-ph]'), c = e.target.closest('[data-col]'), hd = e.target.closest('[data-hdel]'), nav = e.target.closest('[data-go]');
        if (nav) { read(); await DB.putSurvey(sv); return; }
        if (s) { read(); r.fields.type = s.dataset.sub; autoAct(); draw(); }
        if (p) { read(); const t = PHRASES[r.obstacle][p.dataset.ph]; r[textKey] = (r[textKey] ? r[textKey].trim() + ' ' : '') + t; if (isOH) r.actionAuto = false; draw(); const tx = document.getElementById('tx'); tx.focus(); const k = tx.value.lastIndexOf('%'); if (k >= 0 && /about %/.test(tx.value)) tx.setSelectionRange(k, k); }
        if (c) { read(); r.highlight = c.dataset.col === 'auto' ? null : c.dataset.col; draw(); }
        if (hd) { read(); r.heights.splice(hd.dataset.hdel, 1); autoAct(); draw(); }
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
    document.getElementById('mk').onclick = async () => { await save(); GPS.flush(); location.href = `report.html#${id}`; };
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
