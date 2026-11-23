/* Folder backup, on demand: the user picks the surveys and the place, then "Yedekle" writes each survey as a folder,
   one sub-folder per obstacle (nothing runs in the background while a survey is being worked on).
     <A>-<B> Arası Etüt Raporu/  1 - Bridge/ foto.jpg, ek-1.jpg, bilgiler.txt   1-1 - INFO/ …   Arşiv/ …   etut.json
   Tablet (APK): Belgeler/Etütler/ on the tablet itself.  Computer (Edge/Chrome): a folder the user picks once — a folder
   inside OneDrive goes to the cloud by itself. The folder is the same layout as the ZIP, so "Etüt Dosyası Aç" → folder
   (or "Yedekten Geri Yükle" on the tablet) opens it again.
   Only what changed is written: photos are tracked by their id (moved, not rewritten, when numbers shift), texts by a hash. */
(function (g) {
  'use strict';
  const T = () => g.Transfer;
  const enc = new TextEncoder();
  const hash = s => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };
  const dirOf = p => p.slice(0, p.lastIndexOf('/') + 1);
  const dirsOf = paths => { const s = new Set(); for (const p of paths) { let d = dirOf(p); while (d) { s.add(d); d = dirOf(d.slice(0, -1)); } } return s; };

  // ---------- targets ----------
  const ANDROID_BASE = 'Etütler/';
  const android = {
    kind: 'android', label: 'Tablet · Belgeler/Etütler',
    async ready() { return true; },
    async write(path, data) {   // data: Uint8Array or string
      const opts = { path: ANDROID_BASE + path, directory: 'DOCUMENTS', recursive: true };
      if (typeof data === 'string') { opts.data = data; opts.encoding = 'utf8'; } else opts.data = T().b64(data);
      await T().call('Filesystem', 'writeFile', opts);
    },
    async move(from, to) { await T().call('Filesystem', 'mkdir', { path: ANDROID_BASE + dirOf(to), directory: 'DOCUMENTS', recursive: true }).catch(() => {}); await T().call('Filesystem', 'rename', { from: ANDROID_BASE + from, to: ANDROID_BASE + to, directory: 'DOCUMENTS', toDirectory: 'DOCUMENTS' }); },
    async remove(path) { await T().call('Filesystem', 'deleteFile', { path: ANDROID_BASE + path, directory: 'DOCUMENTS' }).catch(() => {}); },
    async removeDir(path) { await T().call('Filesystem', 'rmdir', { path: ANDROID_BASE + path.replace(/\/$/, ''), directory: 'DOCUMENTS', recursive: true }).catch(() => {}); },
    async list(path) { try { const r = await T().call('Filesystem', 'readdir', { path: ANDROID_BASE + path, directory: 'DOCUMENTS' }); return (r.files || []).map(f => typeof f === 'string' ? { name: f, dir: !/\.[a-z0-9]{2,4}$/i.test(f) } : { name: f.name, dir: f.type === 'directory' }); } catch (e) { return []; } },
    async read(path) { const r = await T().call('Filesystem', 'readFile', { path: ANDROID_BASE + path, directory: 'DOCUMENTS' }); const bin = atob(r.data); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u]); },
  };
  let HANDLE = null;   // computer: the chosen folder (FileSystemDirectoryHandle), kept in IndexedDB
  const desktop = {
    kind: 'desktop', get label() { return HANDLE ? 'Klasör · ' + HANDLE.name : 'Yedekleme konumu tanımlanmadı'; },
    async ready(ask) {
      if (!HANDLE) return false;
      const o = { mode: 'readwrite' };
      if ((await HANDLE.queryPermission(o)) === 'granted') return true;
      return ask ? (await HANDLE.requestPermission(o)) === 'granted' : false;
    },
    async dir(path, create) { let d = HANDLE; for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create }); return d; },
    async write(path, data) { const d = await this.dir(dirOf(path), true), fh = await d.getFileHandle(path.slice(dirOf(path).length), { create: true }), w = await fh.createWritable(); await w.write(data); await w.close(); },
    async move(from, to) {
      const fd = await this.dir(dirOf(from), false), name = from.slice(dirOf(from).length), fh = await fd.getFileHandle(name), td = await this.dir(dirOf(to), true), nn = to.slice(dirOf(to).length);
      if (typeof fh.move === 'function') { try { await fh.move(td, nn); return; } catch (e) { /* fall back to copy */ } }
      await this.write(to, await fh.getFile()); await fd.removeEntry(name);
    },
    async remove(path) { try { const d = await this.dir(dirOf(path), false); await d.removeEntry(path.slice(dirOf(path).length)); } catch (e) {} },
    async removeDir(path) { try { const p = path.replace(/\/$/, ''), d = await this.dir(dirOf(p), false); await d.removeEntry(p.slice(dirOf(p).length), { recursive: true }); } catch (e) {} },
  };
  // tablet: a folder picked with Android's own folder picker (AndroidFolder bridge in MainActivity), when one is set
  const AF = () => window.AndroidFolder;
  const afCall = (m, ...a) => { const r = AF()[m](...a); if (typeof r === 'string' && r.startsWith('ERR:')) throw new Error(r.slice(4)); return r; };
  let SAF = null;   // { uri, name, ok }
  const saf = {
    kind: 'saf', get label() { return 'Klasör · ' + (SAF ? SAF.name : ''); },
    async ready() { return !!(SAF && SAF.ok); },
    async write(path, data) { afCall('write', path, typeof data === 'string' ? T().b64(enc.encode(data)) : T().b64(data)); },
    async move(from, to) { afCall('move', from, to); },
    async remove(path) { try { afCall('remove', path); } catch (e) {} },
    async removeDir(path) { try { afCall('remove', path.replace(/\/$/, '')); } catch (e) {} },
    async list(path) { try { return JSON.parse(afCall('list', path.replace(/\/$/, ''))); } catch (e) { return []; } },
    async read(path) { const bin = atob(afCall('read', path)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u]); },
  };
  // Windows app (GoSurvey exe): a normal Windows folder written by the app itself (window.DesktopFs in desktop/preload.js)
  const DF = () => window.DesktopFs;
  let WINF = null;   // { path, name }
  const dfCall = async (m, ...a) => { const r = await DF()[m](...a); if (r && r.ok === false) throw new Error(r.err); return r && r.v; };
  const winfs = {
    kind: 'winfs', get label() { return WINF ? 'Klasör · ' + WINF.path : 'Yedekleme konumu tanımlanmadı'; },
    async ready() { return !!WINF; },
    async write(path, data) { await dfCall('write', path, data); },
    async move(from, to) { await dfCall('move', from, to); },
    async remove(path) { try { await dfCall('remove', path); } catch (e) {} },
    async removeDir(path) { try { await dfCall('remove', path.replace(/\/$/, '')); } catch (e) {} },
    async list(path) { try { return (await dfCall('list', path.replace(/\/$/, ''))) || []; } catch (e) { return []; } },
    async read(path) { return new Blob([await dfCall('read', path)]); },
  };
  const readSaf = () => { try { const c = AF() && AF().current(); SAF = c ? JSON.parse(c) : null; } catch (e) { SAF = null; } };
  const target = () => (T() && T().native() ? (SAF ? saf : android) : DF() ? winfs : desktop);
  const supported = () => (T() && T().native()) || !!DF() || typeof window.showDirectoryPicker === 'function';

  // ---------- state ----------
  const ST = { busy: false, last: null, error: '', listeners: new Set() };
  const emit = () => ST.listeners.forEach(f => { try { f(status()); } catch (e) {} });
  /* has: a place to write is known (tablet: always, Belgeler/Etütler by default; computer: once a folder is chosen) */
  const status = () => ({ supported: supported(), canPick: !T().native() || !!AF(), kind: target().kind, label: target().label, has: target().kind === 'desktop' ? !!HANDLE : target().kind === 'winfs' ? !!WINF : true, on: true, busy: ST.busy, last: ST.last, error: ST.error, needsPermission: !!ST.needsPermission });
  const mkey = id => `bk:${target().kind}:${id}`;

  async function init() {
    if (!supported()) return;
    const cfg = (await DB.getSetting('backup')) || {};
    if (T().native()) readSaf();
    if (target().kind === 'saf' && !SAF.ok) ST.needsPermission = true;
    if (DF()) { try { WINF = await DF().current(); } catch (e) { WINF = null; } }
    if (target().kind === 'desktop') HANDLE = (await DB.getSetting('backupDir')) || null;
    ST.last = cfg.last || null;
    emit();
  }
  function schedule() { /* backups run only when asked for */ }
  /* back up the chosen surveys now; onStep(text) shows the progress */
  async function backupSurveys(ids, onStep) {
    if (ST.busy) throw new Error('Yedekleme işlemi zaten devam ediyor.');
    const t = target();
    if (t.kind === 'desktop' && !(await desktop.ready(true))) { ST.needsPermission = true; emit(); throw new Error(HANDLE ? 'Klasöre yazma izni verilmedi.' : 'Lütfen önce yedekleme konumunu tanımlayın.'); }
    if (t.kind === 'winfs' && !WINF) throw new Error('Lütfen önce yedekleme konumunu tanımlayın.');
    if (t.kind === 'saf' && !(await saf.ready())) { ST.needsPermission = true; emit(); throw new Error('Yedekleme klasörüne yazılamıyor; lütfen konumu yeniden tanımlayın.'); }
    if (t.kind === 'android') { try { await T().call('Filesystem', 'requestPermissions'); } catch (e) { /* Android 11+: not needed */ } }
    ST.busy = true; ST.needsPermission = false; ST.error = ''; emit();
    let n = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const sv = await DB.getSurvey(ids[i]); if (!sv) continue;
        const nm = `${sv.project.start.name} - ${sv.project.end.name}`;
        await syncSurvey(sv, (j, m) => onStep && onStep(`${ids.length > 1 ? `Etüt ${i + 1} / ${ids.length} · ` : ''}${nm} · ${j} / ${m} dosya`));
        n++;
      }
      ST.last = Date.now(); const cfg = (await DB.getSetting('backup')) || {}; cfg.last = ST.last; await setCfg(cfg);
    } catch (e) {
      console.error('backup', e); ST.error = (e && e.message) || 'Yedekleme verisi yazılamadı.';
      if (/permission|izin|NotAllowed/i.test(ST.error)) ST.needsPermission = true;
      throw e;
    } finally { ST.busy = false; emit(); }
    return n;
  }
  const setCfg = cfg => DB.setSetting('backup', cfg);

  // folder name for a survey: "<A>-<B> Arası Etüt Raporu", with " (2)" … when two surveys share the same route
  async function rootFor(sv) {
    const reg = (await DB.getSetting('bkRoots:' + target().kind)) || {};
    const want = T().rootName(sv);
    if (reg[sv.id] && reg[sv.id].replace(/ \(\d+\)$/, '') === want) return reg[sv.id];
    const used = new Set(Object.entries(reg).filter(([k]) => k !== sv.id).map(([, v]) => v));
    let name = want, n = 2; while (used.has(name)) name = `${want} (${n++})`;
    const old = reg[sv.id]; reg[sv.id] = name; await DB.setSetting('bkRoots:' + target().kind, reg);
    if (old && old !== name) await DB.setSetting(mkey(sv.id), null);   // route renamed: the old folder stays as it is, the new one is written in full
    return name;
  }

  // a failed write says which file and why (shown in the backup window)
  const wr = async (t, path, data) => { try { await t.write(path, data); } catch (e) { const m = (e && (e.message || e.name)) || 'bilinmeyen hata'; throw Object.assign(new Error(`${path.split('/').slice(-2).join('/')} yazılamadı: ${m}`), { cause: e, name: e && e.name === 'NotAllowedError' ? 'NotAllowedError' : 'Error' }); } };
  async function syncSurvey(sv, step) {
    const t = target(), root = (await rootFor(sv)) + '/';
    const P = T().plan(sv);
    const man = (await DB.getSetting(mkey(sv.id))) || { files: {} };   // { files: { path: sig } }
    const old = man.files, bySig = {}; for (const [p, s] of Object.entries(old)) bySig[s] = p;
    const next = {};
    // 1) photos and logos: skip if in place, move if the number changed (via a temporary folder, so two obstacles can
    //    swap places), otherwise write
    const moves = [], writes = [];
    for (const e of P.entries.filter(x => x.blob)) {
      const sig = 'b:' + e.blob, had = bySig[sig];
      if (had) {
        const ext = had.slice(had.lastIndexOf('.')), want = e.path.replace(/\.[a-z0-9]+$/i, ext);
        if (want !== e.path) T().renamePath(P, e, want);
        if (had !== e.path) moves.push({ e, from: had, tmp: '.tasima/' + e.blob + ext });
        delete old[had]; next[e.path] = sig;
      } else writes.push(e);
    }
    for (const m of moves) { try { await t.move(root + m.from, root + m.tmp); m.ok = true; } catch (er) { m.ok = false; } }
    for (const m of moves) {
      if (m.ok) { try { await t.move(root + m.tmp, root + m.e.path); continue; } catch (er) { /* write it instead */ } }
      writes.push(m.e);
    }
    if (moves.length) await t.removeDir(root + '.tasima/');
    const total = writes.length + P.entries.filter(x => x.text != null).length + 2; let k = 0;
    const tick = () => { k++; if (step && (k % 3 === 0 || k === total)) step(Math.min(k, total), total); };
    for (const e of writes) {
      tick();
      const b = await DB.getBlob(e.blob); if (!b) { T().dropPath(P, e); delete next[e.path]; continue; }
      const pth = T().fixExt(e.path, b); if (pth !== e.path) { delete next[e.path]; T().renamePath(P, e, pth); }
      await wr(t, root + e.path, new Uint8Array(await b.arrayBuffer()));
      next[e.path] = 'b:' + e.blob;
    }
    // 2) texts
    const texts = P.entries.filter(x => x.text != null).map(x => [x.path, x.text]);
    texts.push(['etut-bilgileri.txt', T().surveyText(sv, P.live, P.arc).replace(/Dışa aktarma: [^\r\n]*/, 'Son yedekleme: ' + new Date().toLocaleString('tr-TR'))]);
    for (const [pth, txt] of texts) {
      tick();
      const sig = 't:' + hash(txt.replace(/Son yedek: [^\r\n]*/, ''));
      if (old[pth] !== sig) await wr(t, root + pth, enc.encode(txt));
      next[pth] = sig;
    }
    const json = P.json(); await wr(t, root + 'etut.json', enc.encode(json)); next['etut.json'] = 't:' + hash(json);
    // 3) remove what is no longer there: old files, then folders that are now empty
    for (const p of Object.keys(old)) if (!(p in next)) await t.remove(root + p);
    const keep = dirsOf(Object.keys(next));
    const gone = [...dirsOf(Object.keys(old))].filter(d => !keep.has(d)).sort((a, b) => a.length - b.length);
    const done = []; for (const d of gone) { if (done.some(x => d.startsWith(x))) continue; await t.removeDir(root + d); done.push(d); }
    await DB.setSetting(mkey(sv.id), { files: next, recs: recSigs(sv, P), at: Date.now() });
  }

  /* per obstacle: a fingerprint of its data + folder at the time it was written, so the list can show which obstacles
     are safely in the backup and which changed since */
  function recSigs(sv, P) { const o = {}; for (const r of sv.records) o[r.id] = hash(JSON.stringify(r) + '|' + ((P.files[r.id] || {}).dir || '')); return o; }
  async function recordStatus(sv) {   // { state: 'off'|'on', at, recs: { id: 'ok'|'pending' } } — ok: in the backup and unchanged since
    const recs = {};
    if (!supported()) { sv.records.forEach(r => recs[r.id] = 'off'); return { state: 'off', recs }; }
    const man = (await DB.getSetting(mkey(sv.id))) || {}, was = man.recs || {};
    if (!man.recs) { sv.records.forEach(r => recs[r.id] = 'pending'); return { state: 'on', recs, at: null }; }
    const now = recSigs(sv, T().plan(sv));
    for (const id of Object.keys(now)) recs[id] = was[id] === now[id] ? 'ok' : 'pending';
    return { state: 'on', recs, at: man.at || null };
  }

  // ---------- where the backup goes ----------
  async function chooseFolder() {   // must run from a click; only sets the place, the backup runs with backupSurveys
    if (T().native()) return pickTablet();
    if (DF()) {
      const r = await DF().pick(); if (!r) return false;
      if (r.err) throw new Error(r.err);
      const changed = !WINF || WINF.path !== r.path; WINF = r;
      if (changed) await resetManifests();
      ST.needsPermission = false; ST.error = ''; emit(); return true;
    }
    const h = await window.showDirectoryPicker({ id: 'rs-backup', mode: 'readwrite', startIn: 'documents' });
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Klasöre yazma izni verilmedi');
    const changed = !HANDLE || !(await HANDLE.isSameEntry(h));
    HANDLE = h; await DB.setSetting('backupDir', h);
    if (changed) await resetManifests();   // new folder: everything is written again there
    ST.needsPermission = false; ST.error = ''; emit(); return true;
  }
  // tablet: pick a folder with Android's folder picker; Belgeler/Etütler again with useDefault()
  function pickTablet() {
    return new Promise((res, rej) => {
      window.__folderPicked = async (uri, error) => {
        window.__folderPicked = null;
        if (error) return rej(new Error(error));
        if (!uri) return res(false);
        readSaf(); await resetManifests();
        ST.needsPermission = false; ST.error = ''; emit(); res(true);
      };
      AF().pick();
    });
  }
  async function useDefault() { if (AF()) AF().clear(); SAF = null; ST.needsPermission = false; ST.error = ''; await resetManifests(); emit(); }
  async function resetManifests() { for (const sv of await DB.listSurveys()) await DB.setSetting(mkey(sv.id), null); await DB.setSetting('bkRoots:' + target().kind, null); }
  async function backupAll() { return backupSurveys((await DB.listSurveys()).map(s => s.id)); }
  // tablet: backup folders that hold an etut.json, to open again
  async function restoreList() {
    const t = target(); if (!t.list) return [];
    const out = [];
    for (const d of (await t.list('')).filter(x => x.dir)) {
      const names = [], walk = async pre => { for (const f of await t.list(pre)) { if (f.dir) await walk(pre + f.name + '/'); else names.push(pre + f.name); } };
      if (!(await t.list(d.name + '/')).some(f => f.name === 'etut.json')) continue;
      out.push({ name: d.name, source: async () => { await walk(d.name + '/'); return { names, get: async n => names.includes(n) ? t.read(n) : null }; } });
    }
    return out;
  }

  g.Backup = { init, status, useDefault, recordStatus, onChange: f => { ST.listeners.add(f); return () => ST.listeners.delete(f); }, chooseFolder, backupSurveys, backupAll, restoreList, schedule, supported };
})(window);
