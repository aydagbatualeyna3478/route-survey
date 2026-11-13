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
  const settingsOf = sv => ({ minHeight: pn(sv.project.minHeight) ?? 0, refLV: pn(sv.project.refLV), refMV: pn(sv.project.refMV), refHV: pn(sv.project.refHV) });
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

  // ---------- views ----------
  const V = {};

  V.home = async () => {
    GPS.stop();
    const list = (await DB.listSurveys()).sort((a, b) => b.createdAt - a.createdAt);
    const card = sv => {
      const n = sv.records.length, act = sv.status === 'active';
      return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(sv.project.start.name)} → ${esc(sv.project.end.name)}</b>
        <span class="tag ${act ? 'warn' : 'ok'}">${act ? 'Sahada' : 'Tamamlandı'}</span></div>
        <div class="hint">${esc(sv.project.date || '')} · ${fmt(sv.odo / 1000, 1)} km · ${n} kayıt</div>
        <div class="row"><button class="btn grow sm" data-go="#/s/${sv.id}">${act ? 'Etüde devam et' : 'Kayıtları aç'}</button><button class="btn grow sm" data-go="#/rep/${sv.id}">Rapor</button></div></div>`;
    };
    $app.innerHTML = `${bar('Etütlerim')}<div class="body">
      <button class="btn pri" style="min-height:64px;font-size:17px" data-go="#/new">+ Yeni etüt raporu oluştur</button>
      ${list.length ? list.map(card).join('') : '<div class="empty">Henüz etüt yok. Yeni bir etüt başlatmak için yukarıdaki düğmeye dokun.</div>'}
      <div class="hint" style="text-align:center;margin-top:auto">Veriler bu cihazda saklanır, internetsiz de çalışır.</div></div>`;
  };

  // ----- project form (new / edit) -----
  const PF = [['start', 'Başlangıç noktası'], ['end', 'Varış noktası']];
  V.form = async (id) => {
    GPS.stop();
    const sv = id ? await DB.getSurvey(id) : null;
    const last = (await DB.getSetting('defaults')) || {};
    const p = sv ? sv.project : {
      start: { name: '' }, end: { name: '' }, company: last.company || 'CJ ICM / Çaba Misnak Project Logistics Heavy Lifting and Engineering Inc.', companyShort: last.companyShort || 'CABAMISNAK',
      preparedBy: last.preparedBy || [], rev: '00', reference: '', client: '', preparedFor: '', formCode: last.formCode || 'PL-WI-03/210114/070317/01',
      minHeight: '', refLV: '', refMV: '', refHV: '', conclusion: { bridge: 'required' },
    };
    const logos = sv ? sv.logos : {};
    const compLogo = await blobUrl(await DB.getSetting('companyLogo'));
    const pv = async (bid, fallback) => { const u = await blobUrl(bid); return u ? `<img src="${u}" alt="">` : (fallback || 'Yükle'); };
    const slot = async (key, title, note, bid, fallback) => `<label class="logo"><b>${title}</b><span class="pv" id="pv-${key}">${await pv(bid, fallback)}</span><span>${note}</span><input class="hid" type="file" accept="image/*" data-logo="${key}"></label>`;
    $app.innerHTML = `${bar(sv ? 'Etüt bilgileri' : 'Yeni etüt raporu', sv ? `#/s/${sv.id}` : '#/')}
    <form class="body" id="pf" autocomplete="off">
      <div class="sec">Güzergah</div>
      <div class="g2"><label class="f">Başlangıç noktası<input name="start" required value="${esc(p.start.name)}" placeholder="Fabrika / saha adı"></label>
      <label class="f">Varış noktası<input name="end" required value="${esc(p.end.name)}" placeholder="Liman / saha adı"></label></div>
      <div class="sec">Kapak bilgileri</div>
      <label class="f">Müşteri unvanı<input name="client" value="${esc(p.client)}"></label>
      <label class="f">Kimin için hazırlandığı<input name="preparedFor" value="${esc(p.preparedFor)}" placeholder="Boşsa müşteri unvanı yazılır"></label>
      <div class="g2"><label class="f">Proje referansı<input name="reference" value="${esc(p.reference)}"></label><label class="f">Rev. no<input name="rev" value="${esc(p.rev)}"></label></div>
      <label class="f">Hazırlayanlar (her satıra bir isim)<textarea name="preparedBy" rows="3">${esc((p.preparedBy || []).join('\n'))}</textarea></label>
      <div class="sec">Logolar · yerleşim otomatik</div>
      <div class="g3">${await slot('company', 'Bizim firma', 'Her etütte hazır', null, compLogo ? `<img src="${compLogo}" alt="">` : '<img src="assets/logo_company.jpg" alt="">')}
        ${await slot('partner', 'Ortak logo', 'İsteğe bağlı', logos.partner)}${await slot('client', 'Müşteri', 'Kapak + sayfalar', logos.client)}</div>
      <div class="g2">${await slot('cover', 'Kapak fotoğrafı', 'Boşsa standart', logos.cover, '<img src="assets/cover_photo.jpg" alt="">')}${await slot('drawing', 'Taşıma çizimi', 'Resim (JPG/PNG)', logos.drawing)}</div>
      <div class="sec">Ekipman ve referans yükseklikler</div>
      <label class="f">Ekipman minimum yüksekliği (m)<input name="minHeight" inputmode="decimal" required value="${esc(fmt(p.minHeight))}" placeholder="ör. 7,57" style="font-size:18px;font-weight:600;border:2px solid var(--navy)">
        <span class="hint">Taşıma çiziminden alınır. Üst yapı ve kablo kontrolleri bu değere göre yapılır.</span></label>
      <div class="g3"><label class="f">AG referans (m)<input name="refLV" inputmode="decimal" value="${esc(fmt(p.refLV))}"></label>
        <label class="f">OG referans (m)<input name="refMV" inputmode="decimal" value="${esc(fmt(p.refMV))}"></label>
        <label class="f">YG referans (m)<input name="refHV" inputmode="decimal" value="${esc(fmt(p.refHV))}"></label></div>
      <span class="hint">Hat bu yüksekliğin altındaysa kayıt otomatik renklenir (AG sarı, OG magenta, YG mor) ve enerji kesme cümlesi eklenir. Boş bırakırsan minimum yüksekliğin 1 / 3 / 4 m fazlası alınır.</span>
    </form>
    <div class="foot"><button class="btn pri grow" id="save">${sv ? 'Kaydet' : 'Etüdü başlat'}</button></div>`;
    const f = document.getElementById('pf'), pending = {};
    f.minHeight.addEventListener('change', () => { // propose the three reference heights
      const m = pn(f.minHeight.value); if (m == null) return;
      [['refLV', 1], ['refMV', 3], ['refHV', 4]].forEach(([k, d]) => { if (!f[k].value) f[k].value = fmt(m + d, 2); });
    });
    f.querySelectorAll('[data-logo]').forEach(inp => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      const key = inp.dataset.logo, blob = await shrink(inp.files[0], key === 'drawing' ? 3000 : key === 'cover' ? 1800 : 1200);
      pending[key] = blob; document.getElementById('pv-' + key).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
    }));
    document.getElementById('save').onclick = async () => {
      if (!f.reportValidity()) return;
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const now = new Date();
      const s = sv || { id: DB.uid(), createdAt: Date.now(), status: 'active', track: [], odo: 0, records: [], bypassParent: null, logos: {}, project: p };
      Object.assign(s.project, {
        start: { name: f.start.value.trim() }, end: { name: f.end.value.trim() },
        title: `ROUTE SURVEY REPORT FROM\n${f.start.value.trim().toUpperCase()} TO ${f.end.value.trim().toUpperCase()}`,
        client: f.client.value.trim(), preparedFor: f.preparedFor.value.trim() || f.client.value.trim(), reference: f.reference.value.trim(), rev: f.rev.value.trim(),
        preparedBy: f.preparedBy.value.split('\n').map(x => x.trim()).filter(Boolean), executedBy: s.project.companyShort,
        minHeight: pn(f.minHeight.value), refLV: pn(f.refLV.value), refMV: pn(f.refMV.value), refHV: pn(f.refHV.value),
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

  // ----- active survey -----
  V.survey = async (id) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    const act = sv.status === 'active';
    if (act) GPS.start(sv); else GPS.stop();
    const st = settingsOf(sv), recs = orderedRecords(sv);
    const status = r => {
      const s = R.suggest(r, st), col = R.highlightOf(r, st);
      if (col) return `<span class="tag bad">${COLNAME[col] || col}</span>`;
      if (/Overhead/.test(r.obstacle) && s.action) return '<span class="tag ok">Uygun</span>';
      return '';
    };
    const line = async r => {
      const u = await blobUrl(r.photoId), hs = (r.heights || []).filter(h => h.value != null).map(h => `${h.label} ${fmt(h.value)} m`).join(' · ');
      return `<button class="rec" data-go="#/r/${sv.id}/${r.id}">${u ? `<img src="${u}" alt="">` : '<span class="ph"></span>'}
        <span style="flex:1;min-width:0"><span class="t">${r.flag ? `<span class="tag sub">${r.no} ${r.flag}</span> ` : r.no + ' · '}${esc(r.obstacle)}</span><br>
        <span class="s">KM ${fmt(r.km, 1)}${r.fields && r.fields.type ? ' · ' + esc(r.fields.type) : ''}${hs ? ' · ' + hs : ''}</span></span>${status(r)}</button>`;
    };
    let html = '';
    for (const m of recs.filter(r => !r.parentId)) {
      const subs = recs.filter(r => r.parentId === m.id);
      html += `<div class="card">${await line(m)}${subs.length ? `<div class="subs">${(await Promise.all(subs.map(line))).join('')}</div>` : ''}</div>`;
    }
    const bp = sv.bypassParent && recs.find(r => r.id === sv.bypassParent);
    $app.innerHTML = `<div class="bar navy"><div class="row"><button class="back" data-go="#/" aria-label="Geri" style="color:#fff">${backSvg}</button>
        <b style="flex:1;font-size:15px">${esc(sv.project.start.name)} → ${esc(sv.project.end.name)}</b>
        ${act ? '<span class="gps" id="gps"><i></i><span>GPS aranıyor…</span></span>' : '<span class="tag ok">Tamamlandı</span>'}</div>
      <div class="stat"><div><b id="km">${fmt(sv.odo / 1000, 1)}</b><span>KM</span></div><div><b>${recs.length}</b><span>kayıt</span></div><div><b>${fmt(sv.project.minHeight)}</b><span>min. H (m)</span></div></div></div>
    <div class="body">
      ${bp ? `<div class="note g row" style="justify-content:space-between"><span>Bypass açık: ${bp.no} · ${esc(bp.obstacle)} için alternatif yol. Yeni kayıtlar ${bp.no}-… olarak eklenir.</span><button class="btn sm" data-act="endbypass">Bitir</button></div>` : ''}
      ${html || '<div class="empty">Henüz kayıt yok. İlk engel için aşağıdaki düğmeye dokun.</div>'}
      <div class="row" style="margin-top:8px"><button class="btn sm grow" data-go="#/edit/${sv.id}">Etüt bilgileri</button><button class="btn sm grow" data-go="#/rep/${sv.id}">Rapor</button></div>
    </div>
    <div class="foot">${act ? `<button class="btn" data-act="finish">Etüdü bitir</button><button class="btn red grow" style="min-height:56px;font-size:16px" data-go="#/add/${sv.id}">${camSvg} Engel ekle</button>`
        : '<button class="btn grow" data-act="resume">Etüde devam et</button>'}</div>`;
    paintGps();
    $app.onclick = async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'endbypass') sv.bypassParent = null;
      if (a.dataset.act === 'finish') { if (a.dataset.sure !== '1') { a.dataset.sure = '1'; a.textContent = 'Emin misin? Bitir'; return; } GPS.flush(); sv.status = 'done'; sv.bypassParent = null; }
      if (a.dataset.act === 'resume') sv.status = 'active';
      await DB.putSurvey(sv); V.survey(id);
    };
  };

  // ----- add record: pick type, take photo -----
  V.add = async (id, q) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    if (sv.status === 'active') GPS.start(sv);
    const recs = orderedRecords(sv);
    let parent = q.parent ? recs.find(r => r.id === q.parent) : (sv.bypassParent ? recs.find(r => r.id === sv.bypassParent) : null);
    if (parent && parent.parentId) parent = recs.find(r => r.id === parent.parentId);
    const flag = q.parent ? (q.flag || 'INFO') : (parent ? 'BYPASS' : '');
    const custom = [...new Set(sv.records.map(r => r.obstacle).filter(t => !TYPES.includes(t)))];
    let type = flag === 'INFO' ? 'Satellite View' : null, all = false;
    const draw = () => {
      const list = all ? TYPES : QUICK.concat(flag === 'INFO' ? ['Satellite View', 'Drone View'] : []);
      $app.innerHTML = `${bar(parent ? `Yeni kayıt · ${parent.no}-… ${flag}` : 'Yeni kayıt', `#/s/${sv.id}`)}
      <div class="body">
        <div class="sec">Engel tipi</div>
        <div class="chips">${list.concat(custom).map(t => `<button class="chip ${t === type ? 'on' : ''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}
          ${all ? '' : '<button class="chip" data-all="1">Tümü…</button>'}<button class="chip dash" data-custom="1">+ Kendim yazacağım</button></div>
        <label class="f" id="cw" style="display:none">Engel adı (raporda OBSTACLE hücresine yazılır)<input id="ct" placeholder="ör. Industrial Area Gate"></label>
        <div class="hint">Tipi seçmeden de çekebilirsin; sonraki ekranda sorulur.</div>
        <div class="sec">Fotoğraf</div>
        <label class="btn red" style="min-height:72px;font-size:17px">${camSvg} Fotoğraf çek<input class="hid" type="file" accept="image/*" capture="environment" id="cam"></label>
        <label class="btn">Galeriden seç (uydu / drone görüntüsü)<input class="hid" type="file" accept="image/*" id="gal"></label>
        <button class="btn dash" id="nop">Fotoğrafsız devam et</button>
        <div class="hint" id="pos"></div>
      </div>`;
      const ct = document.getElementById('ct');
      $app.onclick = e => {
        const t = e.target.closest('[data-type]');
        if (t) { type = t.dataset.type; draw(); return; }
        if (e.target.closest('[data-all]')) { all = true; draw(); return; }
        if (e.target.closest('[data-custom]')) { document.getElementById('cw').style.display = ''; ct.focus(); type = null; $app.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on')); }
      };
      const make = async (file, fromCamera) => {
        toast('Kaydediliyor…');
        const name = (ct.value || '').trim() || type || 'Road Condition';
        const rec = { id: DB.uid(), parentId: parent ? parent.id : null, flag, obstacle: name, t: Date.now(), fields: {}, heights: [], remarks: '', actions: '', highlight: null, actionAuto: true, overlays: [], ann: [] };
        if (/Overhead/.test(name)) rec.heights = [{ label: 'H', value: null }];
        if (file) { rec.photoId = await DB.putBlob(await to43(file)); rec.aspect = 4 / 3; }
        const pos = fromCamera || !parent ? await GPS.current() : null;
        if (pos) {
          rec.latDec = pos.lat; rec.lonDec = pos.lon; rec.acc = pos.acc;
          if (sv.status === 'active') GPS.extend(sv, pos, true);   // bring the odometer up to this point
          rec.km = Math.round(sv.odo) / 1000;
        } else if (parent) { rec.latDec = parent.latDec; rec.lonDec = parent.lonDec; rec.km = parent.km; }
        else { const prevRec = sv.records[sv.records.length - 1]; rec.km = prevRec ? prevRec.km : 0; }
        if (rec.latDec != null) { rec.lat = Geo.dms(rec.latDec, true); rec.lon = Geo.dms(rec.lonDec, false); }
        if (PHRASES[name] && PHRASES[name].length === 1 && !/%/.test(PHRASES[name][0]) && !/Overhead|Bridge|Culvert/.test(name)) rec.remarks = PHRASES[name][0];
        sv.records.push(rec); await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv;
        go(`#/r/${sv.id}/${rec.id}`);
      };
      document.getElementById('cam').onchange = e => e.target.files[0] && make(e.target.files[0], true);
      document.getElementById('gal').onchange = e => e.target.files[0] && make(e.target.files[0], false);
      document.getElementById('nop').onclick = () => make(null, true);
      const f = GPS.fresh(); document.getElementById('pos').textContent = f ? `Konum hazır: ${Geo.dms(f.lat, true)} · ${Geo.dms(f.lon, false)} (±${Math.round(f.acc)} m)` : 'Konum aranıyor… Fotoğraf çekildiğinde tekrar denenecek.';
    };
    draw();
  };

  // ----- record form -----
  V.record = async (id, rid) => {
    const sv = await DB.getSurvey(id); if (!sv) return go('#/');
    if (sv.status === 'active') GPS.start(sv);
    const recs = orderedRecords(sv), r = recs.find(x => x.id === rid); if (!r) return go(`#/s/${id}`);
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
      $app.innerHTML = `${bar(r.obstacle, `#/s/${sv.id}`, `<span class="tag ${r.flag ? 'sub' : ''}" style="${r.flag ? '' : 'background:#E8EEF5;color:var(--navy)'}">${r.no}${r.flag ? ' ' + r.flag : ''}</span>`)}
      <div class="body">
        <div class="photo">${u ? `<img src="${u}" alt="">` : ''}${annHtml(r.ann || [], -1)}
          <button class="btn sm" data-go="#/a/${sv.id}/${r.id}" style="position:absolute;right:8px;bottom:8px">İşaretle</button>
          <label class="btn sm" style="position:absolute;left:8px;bottom:8px">${u ? 'Değiştir' : 'Fotoğraf ekle'}<input class="hid" type="file" accept="image/*" id="rep"></label></div>
        <div class="card"><div class="g3">
          <label class="f">KM<input id="km" inputmode="decimal" value="${esc(fmt(r.km, 1))}"></label>
          <label class="f">Enlem<input id="la" inputmode="decimal" value="${r.latDec == null ? '' : r.latDec.toFixed(6)}"></label>
          <label class="f">Boylam<input id="lo" inputmode="decimal" value="${r.lonDec == null ? '' : r.lonDec.toFixed(6)}"></label></div>
          <div class="row" style="justify-content:space-between"><span class="hint">${r.lat ? esc(r.lat) + ' · ' + esc(r.lon) : 'Konum alınamadı, elle girilebilir'}</span><button class="btn sm" id="here">Konumu güncelle</button></div></div>
        <label class="f">Engel tipi<select id="ty">${[...new Set(TYPES.concat(sv.records.map(x => x.obstacle)))].map(t => `<option ${t === r.obstacle ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__c">Kendim yazacağım…</option></select></label>
        ${sub ? `<div class="sec">${isOH ? (r.obstacle === 'Overhead Cable' ? 'Line type' : 'Structure type') : isBr ? 'Bridge type' : 'Culvert type'}</div>
          <div class="chips">${sub.map(t => `<button class="chip ${r.fields.type === t ? 'on' : ''}" data-sub="${esc(t)}">${esc(t.replace(' Powerline', ''))}</button>`).join('')}</div>
          <label class="f">Tip metni (raporda yazılacak)<input id="tt" value="${esc(r.fields.type || '')}" placeholder="ör. 2x Low Voltage Powerline"></label>` : ''}
        ${isBr ? `<div class="g2"><label class="f">Bridge name<input id="bn" value="${esc(r.fields.name || '')}" placeholder="Unidentified"></label><label class="f">Bridge spans<input id="sp" value="${esc(r.fields.spans || '')}" placeholder="ör. 7x16m"></label></div>` : ''}
        ${isCu ? `<label class="f">Culvert spans<input id="sp" value="${esc(r.fields.spans || '')}" placeholder="ör. 1x5m"></label>` : ''}
        ${isOH ? `<div class="sec">Yükseklikler · sınır ${fmt(lim, 2)} m</div>${r.heights.map(hrow).join('')}<button class="btn dash sm" id="hadd">+ Yükseklik ekle (H1 / H2 / HR / HL)</button>` : ''}
        <label class="f">${isOH ? 'Actions' : 'Remarks'}${isOH && r.actionAuto ? ' (otomatik önerildi, düzenlenebilir)' : ''}<textarea id="tx" rows="4">${esc(r[textKey] || '')}</textarea></label>
        ${(PHRASES[r.obstacle] || []).length ? `<div class="chips">${PHRASES[r.obstacle].map((p, i) => `<button class="chip" style="font-size:13px;border-radius:10px;text-align:left" data-ph="${i}">${esc(p)}</button>`).join('')}</div>` : ''}
        <div class="row" style="justify-content:space-between"><span class="sec">REMARKS rengi</span>${auto ? `<span class="tag warn">Otomatik: ${COLNAME[auto]}</span>` : ''}</div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">
          ${sw('auto', 'Otomatik', auto ? COLORS.find(c => c[0] === auto)[2] : '#fff', cur == null)}${sw('none', 'Yok', '#fff', cur === 'none')}
          ${COLORS.map(c => sw(c[0], c[1], `linear-gradient(180deg,#fff,${c[2]},#fff)`, cur === c[0])).join('')}</div>
        <div class="g2" style="margin-top:6px"><button class="btn grn" data-go="#/add/${sv.id}?parent=${r.parentId || r.id}&flag=INFO">+ INFO ekle</button>
          ${r.parentId ? '<span></span>' : `<button class="btn grn" id="byp">+ BYPASS başlat</button>`}</div>
        <button class="btn dash" id="del" style="color:var(--badtx)">Kaydı sil</button>
      </div>
      <div class="foot"><button class="btn pri grow" id="ok">Kaydet</button></div>`;
      bind();
    };
    const read = () => { // pull the inputs back into the record
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
      g('ty').onchange = e => {
        read(); let t = e.target.value;
        if (t === '__c') { t = (prompt('Engel adı') || '').trim(); if (!t) return draw(); }
        r.obstacle = t; r.fields = {}; r.actionAuto = true;
        if (/Overhead/.test(t) && !r.heights.length) r.heights = [{ label: 'H', value: null }];
        DB.putSurvey(sv).then(() => V.record(id, rid));
      };
      if (g('hadd')) g('hadd').onclick = () => { read(); if (r.heights.length === 1 && r.heights[0].label === 'H') r.heights[0].label = 'H1'; r.heights.push({ label: 'H' + (r.heights.length + 1), value: null }); draw(); };
      g('rep').onchange = async e => { if (!e.target.files[0]) return; read(); await DB.delBlob(r.photoId); urls.delete(r.photoId); r.photoId = await DB.putBlob(await to43(e.target.files[0])); await DB.putSurvey(sv); V.record(id, rid); };
      g('here').onclick = async () => { read(); const p = await GPS.current(); if (!p) return toast('Konum alınamadı'); r.latDec = p.lat; r.lonDec = p.lon; r.lat = Geo.dms(p.lat, true); r.lon = Geo.dms(p.lon, false); draw(); };
      if (g('byp')) g('byp').onclick = async () => { read(); sv.bypassParent = r.id; await DB.putSurvey(sv); go(`#/add/${sv.id}`); };
      g('del').onclick = async e => {
        if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = 'Emin misin? Kaydı ve alt kayıtlarını sil'; return; }
        const gone = sv.records.filter(x => x.id === r.id || x.parentId === r.id);
        for (const x of gone) await DB.delBlob(x.photoId);
        sv.records = sv.records.filter(x => !gone.includes(x)); if (sv.bypassParent === r.id) sv.bypassParent = null;
        await DB.putSurvey(sv); go(`#/s/${sv.id}`);
      };
      g('ok').onclick = async () => { read(); autoAct(); await DB.putSurvey(sv); if (GPS.sv) GPS.sv = sv; go(`#/s/${sv.id}`); };
      $app.onclick = async e => {
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
  function annToOverlays(items, stage) { // editor items -> the overlay format the report draws
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
      <div class="body"><div class="photo" id="stage">${u ? `<img src="${u}" alt="">` : ''}<div id="lay" style="position:absolute;inset:0"></div></div>
        <div class="hint">Öğeye dokunup sürükle. Kırmızı okun iki ucunu ayrı ayrı taşıyabilirsin.</div>
        <div class="tools"><button class="btn sm" data-add="arrow">+ Yön oku</button><button class="btn sm" data-add="text">+ Not kutusu</button><button class="btn sm" data-add="line">+ Kırmızı ok</button><button class="btn sm" data-add="h">+ Yükseklik</button></div>
        <div id="ctl"></div></div>
      <div class="foot"><button class="btn pri grow" id="ok">Bitti</button></div>`;
    const stage = document.getElementById('stage'), lay = document.getElementById('lay'), ctl = document.getElementById('ctl');
    const paint = () => {
      lay.innerHTML = annHtml(items, sel);
      const o = items[sel];
      ctl.innerHTML = !o ? '' : `<div class="card">${o.k === 'text' ? `<label class="f">Not metni<textarea id="tv" rows="2">${esc(o.text)}</textarea></label>` : ''}
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
        if (k === 'h') { // vertical measure arrow with the record's lowest height
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
    const opt = (k, v, t) => `<label class="row" style="border:${c[k] === v ? '2px solid var(--navy)' : '1px solid var(--line2)'};border-radius:10px;padding:10px;font-size:14px"><input type="radio" name="${k}" value="${v}" ${c[k] === v ? 'checked' : ''} style="width:18px;height:18px">${t}</label>`;
    c.bridge = c.bridge || 'required'; c.road = c.road || 'paved_ok';
    $app.innerHTML = `${bar('Rapor oluştur', `#/s/${id}`)}
    <div class="body">
      <div class="card"><b>1.5 Brief Information <span class="tag ok">Otomatik</span></b>
        <div class="stat" style="grid-template-columns:repeat(4,minmax(0,1fr));text-align:center;color:var(--ink)">
          <div><b style="font-size:20px">${Math.round(Math.max(0, ...recs.filter(r => !r.flag).map(r => r.km || 0)))}</b><span style="color:var(--mut)">km</span></div><div><b style="font-size:20px">${cnt(['Bridge'])}</b><span style="color:var(--mut)">köprü</span></div>
          <div><b style="font-size:20px">${cnt(['Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn'])}</b><span style="color:var(--mut)">dönüş/viraj</span></div><div><b style="font-size:20px">${cnt(['Overhead Structure'])}</b><span style="color:var(--mut)">üst yapı</span></div></div></div>
      <div class="card"><b>3 Route Survey</b><span class="hint">${recs.length} kayıt · her sayfada 3 engel · ${Math.ceil(recs.length / 3)} sayfa · ${recs.length - nf - ni} ana, ${nf} BYPASS, ${ni} INFO</span>
        ${miss ? `<span class="note w">${miss} kayıtta fotoğraf yok.</span>` : ''}${nopos ? `<span class="note w">${nopos} kayıtta konum yok.</span>` : ''}</div>
      <div class="card"><b>2 Transportation Drawing</b><span class="hint">${sv.logos.drawing ? 'Çizim yüklendi.' : 'Çizim yüklenmedi; "Etüt bilgileri" ekranından resim olarak ekleyebilirsin.'}</span></div>
      <div class="card" id="cb"><b>4.1 Bridge</b>${opt('bridge', 'done_ok', 'Statik analiz yapıldı, tüm köprüler uygun')}${opt('bridge', 'required', 'Statik analiz gerekli')}${opt('bridge', 'custom', 'Kendi metnimi yazacağım')}
        <label class="f" style="${c.bridge === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="bt" rows="3">${esc(c.bridgeText || '')}</textarea></label></div>
      <div class="card" id="cr"><b>4.6 Road condition</b>${opt('road', 'paved_ok', 'Yol uygun, tamamı asfalt, kritik dar nokta yok')}${opt('road', 'custom', 'Kendi metnimi yazacağım')}
        <label class="f" style="${c.road === 'custom' ? '' : 'display:none'}">Metin (İngilizce)<textarea id="rt" rows="3">${esc(c.roadText || '')}</textarea></label></div>
      <div class="hint">Giriş metinleri, kısaltmalar, 4.2–4.8 standart metinleri ve referans fotoğrafları otomatik eklenir. Güzergah haritası internet varsa OpenStreetMap'ten çizilir.</div>
    </div>
    <div class="foot"><button class="btn pri grow" id="mk">Raporu aç ve PDF al</button></div>`;
    const save = async () => { const b = document.getElementById('bt'), r2 = document.getElementById('rt'); c.bridgeText = b.value.trim(); c.roadText = r2.value.trim(); await DB.putSurvey(sv); };
    $app.onchange = async e => { if (e.target.type === 'radio') { await save(); c[e.target.name] = e.target.value; await DB.putSurvey(sv); V.report(id); } };
    document.getElementById('mk').onclick = async () => { await save(); GPS.flush(); location.href = `report.html#${id}`; };
  };

  // ---------- router ----------
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  async function route() {
    $app.onclick = null; $app.onchange = null; window.scrollTo(0, 0);
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
    } catch (err) { console.error(err); $app.innerHTML = `${bar('Hata', '#/')}<div class="body"><div class="note w">Beklenmeyen bir hata oluştu: ${esc(err.message)}</div></div>`; }
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
