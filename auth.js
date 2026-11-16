/* Sign-in, two-step verification, device approval and the admin screen (Supabase, plain fetch, no library).
   Accounts are created only by the two admins; signing up is switched off in the project.
   Every device must be approved by an admin. An approved device keeps working offline; it checks in with the
   server whenever it is online and locks if the user or the device has been switched off. */
(function () {
  'use strict';
  const SB = 'https://nhfmownapyruurxkzixo.supabase.co';
  const KEY = 'sb_publishable_VtssPrG70NqzerkMn1Ztgw_ji0Vutfa';
  const GRACE_DAYS = 14;   // offline use allowed this long after the last successful check-in
  const LS = 'rs-auth', LSD = 'rs-device';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

  let S = ls.get(LS);   // { access, refresh, exp, email, okAt, role, name, aal }
  const save = () => ls.set(LS, S);
  const deviceId = () => {
    let d = ls.get(LSD);
    if (!d || !d.id) { d = { id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)) + '-' + Math.random().toString(36).slice(2, 8), label: '' }; ls.set(LSD, d); }
    return d;
  };
  const platform = () => {
    const u = navigator.userAgent;
    const os = /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac/.test(u) ? 'Mac' : 'Diğer';
    const app = window.Capacitor ? 'Uygulama' : /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox/.test(u) ? 'Firefox' : 'Tarayıcı';
    return `${os} · ${app}`;
  };
  const jwt = t => { try { const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4))))); } catch (e) { return {}; } };

  // ---------- HTTP ----------
  class ApiError extends Error { constructor(m, s, c) { super(m); this.status = s; this.code = c; } }
  const TR = {
    invalid_credentials: 'Mail ya da şifre hatalı.', user_banned: 'Bu hesap kapatılmış. Bir admin ile görüş.', mfa_verification_failed: 'Kod hatalı ya da süresi geçmiş.',
    weak_password: 'Şifre çok zayıf (en az 8 karakter).', same_password: 'Yeni şifre eskisiyle aynı olamaz.', over_request_rate_limit: 'Çok fazla deneme. Biraz bekleyip tekrar dene.',
    email_not_confirmed: 'Mail adresi onaylanmamış. Bir admin ile görüş.',
  };
  async function api(path, { method = 'GET', body, auth = true, headers = {}, timeout = 15000 } = {}) {
    const h = { apikey: KEY, 'Content-Type': 'application/json', ...headers };
    if (auth && S && S.access) h.Authorization = 'Bearer ' + S.access;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    let r;
    try { r = await fetch(SB + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.', 0, 'offline'); }
    finally { clearTimeout(t); }
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) {
      const code = j && (j.error_code || j.code || j.error) || '', msg = j && (j.msg || j.message || j.error_description || j.error) || r.statusText;
      throw new ApiError(TR[code] || msg || 'Hata', r.status, code);
    }
    return j;
  }
  function setTokens(j) {
    const c = jwt(j.access_token);
    S = Object.assign(S || {}, { access: j.access_token, refresh: j.refresh_token, exp: c.exp || (Date.now() / 1000 + (j.expires_in || 3600)), aal: c.aal, email: (j.user && j.user.email) || c.email || (S && S.email) });
    save();
  }
  async function refresh() {
    if (!S || !S.refresh) throw new ApiError('Oturum yok', 401, 'no_session');
    const j = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: S.refresh }, auth: false });
    setTokens(j);
  }
  async function fresh() { if (S && S.exp && S.exp * 1000 - Date.now() < 60000) await refresh(); }
  const rest = async (path, o = {}) => { await fresh(); return api('/rest/v1/' + path, o); };
  const fn = async (name, body) => { await fresh(); return api('/functions/v1/' + name, { method: 'POST', body }); };

  async function checkIn(event) {
    await fresh();
    const d = deviceId();
    const r = await api('/rest/v1/rpc/check_in', { method: 'POST', body: { p_device: d.id, p_label: d.label || platform(), p_platform: platform(), p_event: event || 'check' } });
    if (r && r.ok) { Object.assign(S, { okAt: Date.now(), role: r.role, name: r.name || '', email: r.email || S.email }); save(); }
    return r || { ok: false, reason: 'error' };
  }
  function signOutLocal() { S = null; ls.del(LS); }
  async function signOut() { try { if (S && S.access) await api('/auth/v1/logout', { method: 'POST', timeout: 5000 }); } catch (e) {} signOutLocal(); location.hash = '#/'; location.reload(); }

  // ---------- screens ----------
  const $app = () => document.getElementById('app');
  const shell = (title, inner) => `<div class="bar"><h1>${esc(title)}</h1></div><div class="full" style="align-items:center;justify-content:center">
    <div class="card" style="width:min(460px,100%);gap:14px">${inner}</div></div>`;
  const errBox = id => `<div class="note w" id="${id}" hidden></div>`;
  const showErr = (id, m) => { const e = document.getElementById(id); if (e) { e.textContent = m; e.hidden = !m; } };
  const busy = (b, on, label) => { if (!b) return; if (on) { b.dataset.l = b.textContent; b.textContent = label || 'Bekle…'; b.disabled = true; } else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; } };

  function loginView(done, msg) {
    $app().innerHTML = shell('Route Survey · Giriş', `<b style="font-size:18px">Şirket hesabınla gir</b>
      <div class="hint">Hesapları adminler açar. Hesabın yoksa bir admin ile görüş.</div>
      ${msg ? `<div class="note w">${esc(msg)}</div>` : ''}
      <form id="lf" style="display:flex;flex-direction:column;gap:12px">
        <label class="f">Mail<input id="le" type="email" autocomplete="username" inputmode="email" required value="${esc((S && S.email) || '')}"></label>
        <label class="f">Şifre<input id="lp" type="password" autocomplete="current-password" required></label>
        ${errBox('lerr')}<button class="btn pri" id="lb">Giriş yap</button></form>`);
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById('lb'); showErr('lerr', ''); busy(b, true, 'Giriş yapılıyor…');
      try {
        const j = await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: document.getElementById('le').value.trim().toLowerCase(), password: document.getElementById('lp').value } });
        S = { email: j.user && j.user.email }; setTokens(j);
        await mfaStep(done);
      } catch (err) { busy(b, false); showErr('lerr', err.message); }
    };
  }

  async function mfaStep(done) {
    const u = await api('/auth/v1/user');
    const fs = (u.factors || []).filter(f => f.factor_type === 'totp');
    const ok = fs.find(f => f.status === 'verified');
    for (const f of fs.filter(f => f.status !== 'verified')) { try { await api('/auth/v1/factors/' + f.id, { method: 'DELETE' }); } catch (e) {} }
    if (ok) return codeView(ok.id, done, false);
    const en = await api('/auth/v1/factors', { method: 'POST', body: { factor_type: 'totp', friendly_name: 'Route Survey ' + new Date().toISOString().slice(0, 16) } });
    $app().innerHTML = shell('İki adımlı doğrulama', `<b style="font-size:18px">Authenticator'ı bağla (bir kez)</b>
      <div class="hint">Telefonuna Google Authenticator ya da Microsoft Authenticator kur. Uygulamada "+" → "QR kodu tara" ile aşağıdaki kodu okut.</div>
      <img alt="QR kodu" src="${esc(window.QRSvg && en.totp.uri ? URL.createObjectURL(new Blob([QRSvg(en.totp.uri)], { type: 'image/svg+xml' })) : qrSrc(en.totp.qr_code))}" style="width:210px;height:210px;align-self:center;background:#fff;padding:8px;border-radius:10px;border:1px solid var(--line)">
      <div class="hint">QR okutamıyorsan anahtarı elle gir: <b style="user-select:all;word-break:break-all;color:var(--ink)">${esc(en.totp.secret)}</b></div>
      <form id="cf" style="display:flex;flex-direction:column;gap:12px"><label class="f">Authenticator'daki 6 haneli kod<input id="cc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label>
      ${errBox('cerr')}<button class="btn pri" id="cb">Doğrula</button></form>
      <button class="btn dash" id="cx">Vazgeç</button>`);
    wireCode(en.id, done);
  }
  /* Supabase returns the QR as "data:image/svg+xml;utf-8,<svg …>" with the SVG unencoded: a "#" in it cuts the data URL,
     so the picture never shows. Turn it into a proper blob URL. */
  function qrSrc(q) {
    q = String(q || '');
    const m = /^data:image\/svg\+xml(;[^,]*)?,/.exec(q);
    let svg = q;
    if (m) { const body = q.slice(m[0].length); svg = /;base64/.test(m[1] || '') ? atob(body) : (/%3C/i.test(body.slice(0, 6)) ? decodeURIComponent(body) : body); }
    if (!/^\s*<svg/i.test(svg)) return q;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }
  function codeView(fid, done) {
    $app().innerHTML = shell('İki adımlı doğrulama', `<b style="font-size:18px">Doğrulama kodu</b>
      <div class="hint">Telefonundaki Authenticator uygulamasında "Route Survey" için görünen 6 haneli kodu gir.</div>
      <form id="cf" style="display:flex;flex-direction:column;gap:12px"><label class="f">Kod<input id="cc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus></label>
      ${errBox('cerr')}<button class="btn pri" id="cb">Devam</button></form>
      <div class="hint">Telefonunu kaybettiysen bir admin authenticator bağlantını sıfırlayabilir.</div>
      <button class="btn dash" id="cx">Farklı hesapla gir</button>`);
    wireCode(fid, done);
  }
  function wireCode(fid, done) {
    document.getElementById('cx').onclick = () => { signOutLocal(); loginView(done); };
    document.getElementById('cf').onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById('cb'); showErr('cerr', ''); busy(b, true, 'Doğrulanıyor…');
      try {
        const ch = await api(`/auth/v1/factors/${fid}/challenge`, { method: 'POST', body: {} });
        const j = await api(`/auth/v1/factors/${fid}/verify`, { method: 'POST', body: { challenge_id: ch.id, code: document.getElementById('cc').value.trim() } });
        setTokens(j);
        await afterAal2(done, 'login');
      } catch (err) { busy(b, false); showErr('cerr', err.message); }
    };
  }

  async function afterAal2(done, event) {
    const r = await checkIn(event);
    if (r.ok) return done();
    if (r.reason === 'mfa') return mfaStep(done);
    if (!r.active) { signOutLocal(); return loginView(done, 'Bu hesap kapatılmış. Bir admin ile görüş.'); }
    pendingView(done);
  }

  function pendingView(done) {
    const d = deviceId();
    $app().innerHTML = shell('Cihaz onayı', `<b style="font-size:18px">Bu cihaz onay bekliyor</b>
      <div class="hint">${esc(S && S.email)} hesabı bu cihazda ilk kez açılıyor. Adminlerden biri onaylayınca uygulama açılır.</div>
      <label class="f">Bu cihazın adı (admin listede bu adı görür)<input id="dl" maxlength="60" value="${esc(d.label || '')}" placeholder="ör. Saha tableti 2 · Ahmet"></label>
      <div class="hint">Cihaz kodu: <b style="color:var(--ink)">${esc(d.id.slice(0, 8).toUpperCase())}</b> · ${esc(platform())}</div>
      ${errBox('perr')}<button class="btn pri" id="pb">Onaylandı mı? Kontrol et</button>
      <button class="btn dash" id="px">Çıkış yap</button>`);
    document.getElementById('dl').onchange = e => { const x = deviceId(); x.label = e.target.value.trim(); ls.set(LSD, x); };
    document.getElementById('px').onclick = signOut;
    const chk = async () => {
      const b = document.getElementById('pb'); if (!b) return; showErr('perr', ''); busy(b, true, 'Kontrol ediliyor…');
      try {
        const r = await checkIn('check');
        if (r.ok) return done();
        if (!r.active) { signOutLocal(); return loginView(done, 'Bu hesap kapatılmış.'); }
        busy(b, false); showErr('perr', 'Henüz onaylanmadı.');
      } catch (err) { busy(b, false); showErr('perr', err.message); }
    };
    document.getElementById('pb').onclick = chk;
    const t = setInterval(() => { if (!document.getElementById('pb')) return clearInterval(t); chk(); }, 20000);
  }

  function lockedView(done, msg) {
    $app().innerHTML = shell('Bağlantı gerekli', `<b style="font-size:18px">İnternete bağlanman gerekiyor</b>
      <div class="hint">${esc(msg)}</div>${errBox('oerr')}<button class="btn pri" id="ob">Tekrar dene</button><button class="btn dash" id="ox">Çıkış yap</button>`);
    document.getElementById('ox').onclick = signOut;
    document.getElementById('ob').onclick = () => start(done);
  }

  // ---------- start: decide what to show before the app ----------
  let started = false, appDone = null;
  async function start(done) {
    appDone = done;
    const go = () => { if (!started) { started = true; done(); watch(); } else done(); };
    if (!S || !S.refresh) return loginView(go);
    try {
      await refresh();
      if (S.aal !== 'aal2') return mfaStep(go);
      return afterAal2(go, 'open');
    } catch (err) {
      if (err.code === 'offline' || err.status === 0 || err.status >= 500) {
        const age = Date.now() - (S.okAt || 0);
        if (S.okAt && age < GRACE_DAYS * 864e5) return go();   // approved device, offline: carry on
        return lockedView(go, S.okAt ? `Bu cihaz ${GRACE_DAYS} günden uzun süredir sunucuya bağlanmadı. Bağlanınca kontrol edilip açılacak.` : 'İlk giriş için internet bağlantısı gerekli.');
      }
      signOutLocal(); return loginView(go, 'Oturumun sona ermiş, tekrar giriş yap.');
    }
  }
  // while the app is open: re-check when the connection comes back and every 30 minutes
  function watch() {
    const again = async () => {
      if (!navigator.onLine) return;
      try {
        await refresh();
        const r = await checkIn('check');
        if (!r.ok) { if (!r.active) signOutLocal(); location.reload(); }
      } catch (err) { if (err.status === 400 || err.status === 401 || err.status === 403) { signOutLocal(); location.reload(); } }
    };
    window.addEventListener('online', again);
    setInterval(again, 30 * 60000);
  }

  // ---------- account sheet (home screen) ----------
  function accountSheet() {
    document.querySelectorAll('.sheet').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'sheet';
    d.innerHTML = `<div class="sheet-bg" data-x="1"></div><div class="sheet-box" role="dialog" aria-label="Hesap"><b>${esc((S && S.name) || 'Hesap')}</b><div class="hint">${esc(S && S.email)} · ${S && S.role === 'admin' ? 'Admin' : 'Kullanıcı'} · ${esc(platform())}</div>
      ${S && S.role === 'admin' ? '<button class="btn pri" data-a="admin">Yönetim (kullanıcılar, cihazlar, girişler)</button>' : ''}
      <button class="btn" data-a="pw">Şifremi değiştir</button><button class="btn" data-a="out" style="color:var(--badtx)">Çıkış yap</button><button class="btn dash" data-x="1">Kapat</button></div>`;
    document.body.appendChild(d);
    d.onclick = e => {
      if (e.target.closest('[data-x]')) return d.remove();
      const a = e.target.closest('[data-a]'); if (!a) return; d.remove();
      if (a.dataset.a === 'admin') location.hash = '#/admin';
      if (a.dataset.a === 'out') signOut();
      if (a.dataset.a === 'pw') pwSheet();
    };
  }
  function pwSheet() {
    const d = document.createElement('div'); d.className = 'sheet';
    d.innerHTML = `<div class="sheet-bg" data-x="1"></div><form class="sheet-box" id="pwf"><b>Şifremi değiştir</b>
      <label class="f">Yeni şifre (en az 8 karakter)<input id="p1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="f">Yeni şifre (tekrar)<input id="p2" type="password" autocomplete="new-password" minlength="8" required></label>
      ${errBox('pwerr')}<button class="btn pri" id="pwb">Kaydet</button><button type="button" class="btn dash" data-x="1">Vazgeç</button></form>`;
    document.body.appendChild(d);
    d.onclick = e => { if (e.target.closest('[data-x]')) d.remove(); };
    document.getElementById('pwf').onsubmit = async e => {
      e.preventDefault(); const p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value, b = document.getElementById('pwb');
      if (p1 !== p2) return showErr('pwerr', 'İki şifre aynı değil.');
      busy(b, true, 'Kaydediliyor…');
      try { await fresh(); await api('/auth/v1/user', { method: 'PUT', body: { password: p1 } }); d.remove(); toastMsg('Şifren değişti'); }
      catch (err) { busy(b, false); showErr('pwerr', err.message); }
    };
  }
  function toastMsg(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  // ---------- admin screen (#/admin) ----------
  const when = t => { if (!t) return '—'; const d = new Date(t); return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
  const EVT = { login: 'Giriş', open: 'Uygulama açıldı', check: 'Kontrol', pending: 'Onay bekleyen cihaz', blocked: 'Engellendi', device_approved: 'Cihaz onaylandı', device_removed: 'Cihaz kaldırıldı',
    user_created: 'Kullanıcı açıldı', password_set: 'Şifre belirlendi', user_disabled: 'Kullanıcı kapatıldı', user_enabled: 'Kullanıcı açıldı (tekrar)', user_deleted: 'Kullanıcı silindi', mfa_reset: 'Authenticator sıfırlandı', role_changed: 'Yetki değişti' };
  let ATAB = 'dev';
  async function adminView(bar) {
    const $ = $app();
    if (!S || S.role !== 'admin') { location.hash = '#/'; return; }
    $.innerHTML = `${bar('Yönetim', '#/')}<div class="full"><div class="empty">Yükleniyor…</div></div>`;
    let users, devs, logs;
    try {
      [users, devs, logs] = await Promise.all([rest('profiles?select=*&order=created_at.asc'), rest('devices?select=*&order=created_at.desc'), rest('access_log?select=*&order=at.desc&limit=300')]);
    } catch (err) { $.innerHTML = `${bar('Yönetim', '#/')}<div class="full"><div class="note w">${esc(err.message)}</div></div>`; return; }
    const uname = id => { const u = users.find(x => x.id === id); return u ? (u.full_name || u.email) : '—'; };
    const pend = devs.filter(d => !d.approved);
    const tabs = [['dev', `Cihazlar${pend.length ? ` · ${pend.length} onay bekliyor` : ''}`], ['usr', `Kullanıcılar · ${users.length}`], ['log', 'Giriş kayıtları']];
    const devRow = d => `<div class="card" style="gap:6px;${d.approved ? '' : 'border:2px solid var(--warntx)'}"><div class="row" style="justify-content:space-between"><b>${esc(d.label || d.platform || 'Cihaz')}</b>${d.approved ? '<span class="tag ok">Onaylı</span>' : '<span class="tag warn">Onay bekliyor</span>'}</div>
      <div class="hint">${esc(uname(d.user_id))} · ${esc(d.platform)} · kod ${esc(d.id.slice(0, 8).toUpperCase())}</div><div class="hint">İlk: ${when(d.created_at)} · Son: ${when(d.last_seen)}${d.approved_at ? ' · Onay: ' + when(d.approved_at) + ' (' + esc(uname(d.approved_by)) + ')' : ''}</div>
      <div class="row">${d.approved ? '' : `<button class="btn pri sm grow" data-dok="${esc(d.id)}|${d.user_id}">Onayla</button>`}<button class="btn sm grow" data-ddel="${esc(d.id)}|${d.user_id}" style="color:var(--badtx)">${d.approved ? 'Onayı kaldır' : 'Reddet'}</button></div></div>`;
    const usrRow = u => { const n = devs.filter(d => d.user_id === u.id); return `<div class="card" style="gap:6px;${u.active ? '' : 'opacity:.65'}"><div class="row" style="justify-content:space-between"><b>${esc(u.full_name || u.email)}</b><span class="row" style="gap:6px">${u.role === 'admin' ? '<span class="tag sub">ADMİN</span>' : ''}${u.active ? '<span class="tag ok">Açık</span>' : '<span class="tag bad">Kapalı</span>'}</span></div>
      <div class="hint">${esc(u.email)} · ${n.filter(d => d.approved).length} onaylı cihaz${n.some(d => !d.approved) ? ', ' + n.filter(d => !d.approved).length + ' bekleyen' : ''} · açılış ${when(u.created_at)}</div>
      ${u.id === jwt(S.access).sub ? '<div class="hint">Bu sensin.</div>' : `<div class="row" style="flex-wrap:wrap">
        <button class="btn sm grow" data-ua="password" data-u="${u.id}">Şifre belirle</button><button class="btn sm grow" data-ua="mfa_reset" data-u="${u.id}">Authenticator sıfırla</button>
        <button class="btn sm grow" data-ua="${u.active ? 'disable' : 'enable'}" data-u="${u.id}">${u.active ? 'Kapat' : 'Aç'}</button>
        <button class="btn sm grow" data-ua="role" data-u="${u.id}">${u.role === 'admin' ? 'Admin yetkisini al' : 'Admin yap'}</button>
        <button class="btn sm grow" data-ua="delete" data-u="${u.id}" style="color:var(--badtx)">Sil</button></div>`}</div>`; };
    const body = ATAB === 'dev' ? (devs.length ? `<div class="tiles">${[...pend, ...devs.filter(d => d.approved)].map(devRow).join('')}</div>` : '<div class="empty">Henüz cihaz yok.</div>')
      : ATAB === 'usr' ? `<form class="card" id="nu"><b>Yeni kullanıcı</b><div class="g2"><label class="f">Ad Soyad<input id="nn" required maxlength="60"></label><label class="f">Mail<input id="ne" type="email" required></label></div>
          <div class="g2"><label class="f">İlk şifre (en az 8 karakter, kullanıcıya sen ilet)<input id="np" type="text" minlength="8" required autocomplete="off"></label><label class="f">Yetki<select id="nr"><option value="user">Kullanıcı</option><option value="admin">Admin</option></select></label></div>
          ${errBox('nuerr')}<button class="btn pri" id="nub">Kullanıcıyı aç</button><div class="hint">Kullanıcı ilk girişte authenticator'ı bağlar; cihazı da senin onayını bekler. Şifresini sonra kendisi değiştirebilir.</div></form>
          <div class="tiles">${users.map(usrRow).join('')}</div>`
      : `<div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--bg);text-align:left"><th style="padding:8px">Zaman</th><th style="padding:8px">Kişi</th><th style="padding:8px">Olay</th><th style="padding:8px">Cihaz</th><th style="padding:8px">Ayrıntı</th></tr></thead>
          <tbody>${logs.map(l => `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 8px;white-space:nowrap">${when(l.at)}</td><td style="padding:7px 8px">${esc(l.email || uname(l.user_id))}</td><td style="padding:7px 8px">${esc(EVT[l.event] || l.event)}</td><td style="padding:7px 8px">${esc(l.device_label || (l.device_id || '').slice(0, 8).toUpperCase())}</td><td style="padding:7px 8px">${esc(l.detail || '')}</td></tr>`).join('') || '<tr><td style="padding:10px" colspan="5">Kayıt yok.</td></tr>'}</tbody></table></div>`;
    $.innerHTML = `${bar('Yönetim', '#/', `<button class="btn" id="arf">Yenile</button>`)}<div class="full"><div class="row" style="flex-wrap:wrap">${tabs.map(([k, l]) => `<button class="btn ${ATAB === k ? 'pri' : ''}" data-atab="${k}">${esc(l)}</button>`).join('')}</div>${body}</div>`;
    const again = () => adminView(bar);
    document.getElementById('arf').onclick = again;
    const act = async (b, f) => { busy(b, true); try { await f(); again(); } catch (err) { busy(b, false); toastMsg(err.message); } };
    $.onclick = async e => {
      const t = e.target.closest('[data-atab]'); if (t) { ATAB = t.dataset.atab; return again(); }
      const ok = e.target.closest('[data-dok]'), del = e.target.closest('[data-ddel]'), ua = e.target.closest('[data-ua]');
      if (ok) { const [id, uid] = ok.dataset.dok.split('|'); return act(ok, () => rest('rpc/admin_device', { method: 'POST', body: { p_device: id, p_user: uid, p_approve: true } })); }
      if (del) { if (!sure(del)) return; const [id, uid] = del.dataset.ddel.split('|'); return act(del, () => rest('rpc/admin_device', { method: 'POST', body: { p_device: id, p_user: uid, p_approve: false } })); }
      if (ua) {
        const id = ua.dataset.u, a = ua.dataset.ua, u = users.find(x => x.id === id);
        if (a === 'password') { const p = await askPw(u); if (p) act(ua, () => fn('admin-users', { action: 'set_password', id, password: p })); return; }
        if (['delete', 'disable', 'mfa_reset', 'role'].includes(a) && !sure(ua)) return;
        if (a === 'role') return act(ua, () => fn('admin-users', { action: 'set_role', id, role: u.role === 'admin' ? 'user' : 'admin' }));
        return act(ua, () => fn('admin-users', { action: a, id }));
      }
    };
    const nu = document.getElementById('nu');
    if (nu) nu.onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById('nub'); showErr('nuerr', ''); busy(b, true, 'Açılıyor…');
      try { await fn('admin-users', { action: 'create', email: document.getElementById('ne').value.trim().toLowerCase(), password: document.getElementById('np').value, full_name: document.getElementById('nn').value.trim(), role: document.getElementById('nr').value }); toastMsg('Kullanıcı açıldı'); again(); }
      catch (err) { busy(b, false); showErr('nuerr', err.message); }
    };
  }
  function sure(b) { if (b.dataset.sure === '1') return true; b.dataset.sure = '1'; b.dataset.l0 = b.textContent; b.textContent = 'Emin misin?'; b.style.background = 'var(--red)'; b.style.color = '#fff'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = b.dataset.l0; b.style.background = ''; b.style.color = ''; } }, 4000); return false; }
  function askPw(u) {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'sheet';
      d.innerHTML = `<div class="sheet-bg" data-x="1"></div><form class="sheet-box" id="apf"><b>${esc(u.full_name || u.email)} · yeni şifre</b>
        <label class="f">Şifre (en az 8 karakter, kullanıcıya sen ilet)<input id="ap" type="text" minlength="8" required autocomplete="off"></label>
        <button class="btn pri">Kaydet</button><button type="button" class="btn dash" data-x="1">Vazgeç</button></form>`;
      document.body.appendChild(d);
      d.onclick = e => { if (e.target.closest('[data-x]')) { d.remove(); res(null); } };
      document.getElementById('apf').onsubmit = e => { e.preventDefault(); const p = document.getElementById('ap').value; d.remove(); res(p); };
    });
  }

  // other pages (report.html, report2.html): only with a signed-in, recently checked device
  function pageGuard() {
    const s = ls.get(LS);
    if (!s || !s.refresh || !s.okAt || Date.now() - s.okAt > GRACE_DAYS * 864e5) { location.replace('index.html'); return false; }
    return true;
  }

  window.Auth = { start, adminView, accountSheet, pageGuard, isAdmin: () => !!(S && S.role === 'admin'), user: () => S && { email: S.email, name: S.name, role: S.role } };
})();
