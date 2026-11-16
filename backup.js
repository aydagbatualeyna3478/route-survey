/* Live folder backup: every survey is kept as a folder, one sub-folder per obstacle, updated a few seconds after each change.
     <A>-<B> Arası Etüt Raporu/  1 - Bridge/ foto.jpg, ek-1.jpg, bilgiler.txt   1-1 - INFO/ …   Arşiv/ …   etut.json
   Tablet (APK): Belgeler/Etütler/ on the tablet itself.  Computer (Edge/Chrome): a folder the user picks once — a folder
   inside OneDrive goes to the cloud by itself. The folder is the same layout as the ZIP, so "Etüt dosyası aç" → folder
   (or "Yedekten geri yükle" on the tablet) opens it again.
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
    kind: 'desktop', get label() { return HANDLE ? 'Klasör · ' + HANDLE.name : 'Klasör seçilmedi'; },
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
  const target = () => (T() && T().native() ? android : desktop);
  const supported = () => (T() && T().native()) || typeof window.showDirectoryPicker === 'function';

  // ---------- state ----------
  const ST = { on: false, busy: false, last: null, error: '', queue: new Set(), timer: null, listeners: new Set() };
  const emit = () => ST.listeners.forEach(f => { try { f(status()); } catch (e) {} });
  const status = () => ({ supported: supported(), kind: target().kind, label: target().label, on: ST.on, busy: ST.busy, last: ST.last, error: ST.error, needsPermission: ST.needsPermission, pending: ST.queue.size });
  const mkey = id => `bk:${target().kind}:${id}`;

  async function init() {
    if (!supported()) return;
    const cfg = (await DB.getSetting('backup')) || {};
    if (target().kind === 'android') { ST.on = cfg.android !== false; try { await T().call('Filesystem', 'requestPermissions'); } catch (e) { /* Android 11+: not needed */ } }   // on by default on the tablet
    else { HANDLE = (await DB.getSetting('backupDir')) || null; ST.on = !!HANDLE && cfg.desktop !== false; if (ST.on && !(await desktop.ready(false))) ST.needsPermission = true; }
    ST.last = cfg.last || null;
    // every save of a survey schedules its folder update
    const put = DB.putSurvey;
    DB.putSurvey = async sv => { const r = await put(sv); schedule(sv.id); return r; };
    emit();
    if (ST.on && !ST.needsPermission) for (const sv of await DB.listSurveys()) schedule(sv.id, 4000);
  }
  function schedule(id, delay) {
    if (!ST.on) return;
    ST.queue.add(id); clearTimeout(ST.timer); ST.timer = setTimeout(run, delay || 2500); emit();
  }
  async function run() {
    if (ST.busy) { ST.timer = setTimeout(run, 1500); return; }
    if (ST.needsPermission || !ST.on) return;
    ST.busy = true; emit();
    try {
      while (ST.queue.size) {
        const id = ST.queue.values().next().value; ST.queue.delete(id);
        const sv = await DB.getSurvey(id); if (sv) await syncSurvey(sv);
      }
      ST.error = ''; ST.last = Date.now();
      const cfg = (await DB.getSetting('backup')) || {}; cfg.last = ST.last; await setCfg(cfg);
    } catch (e) {
      console.error('backup', e); ST.error = (e && e.message) || 'Yedek yazılamadı';
      if (/permission|izin|NotAllowed/i.test(ST.error) && target().kind === 'desktop') ST.needsPermission = true;
    } finally { ST.busy = false; emit(); }
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

  async function syncSurvey(sv) {
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
    for (const e of writes) {
      const b = await DB.getBlob(e.blob); if (!b) { T().dropPath(P, e); delete next[e.path]; continue; }
      const pth = T().fixExt(e.path, b); if (pth !== e.path) { delete next[e.path]; T().renamePath(P, e, pth); }
      await t.write(root + e.path, new Uint8Array(await b.arrayBuffer()));
      next[e.path] = 'b:' + e.blob;
    }
    // 2) texts
    const texts = P.entries.filter(x => x.text != null).map(x => [x.path, x.text]);
    texts.push(['etut-bilgileri.txt', T().surveyText(sv, P.live, P.arc).replace(/Dışa aktarma: [^\r\n]*/, 'Son yedek: ' + new Date().toLocaleString('tr-TR'))]);
    for (const [pth, txt] of texts) {
      const sig = 't:' + hash(txt.replace(/Son yedek: [^\r\n]*/, ''));
      if (old[pth] !== sig) await t.write(root + pth, enc.encode(txt));
      next[pth] = sig;
    }
    const json = P.json(); await t.write(root + 'etut.json', enc.encode(json)); next['etut.json'] = 't:' + hash(json);
    // 3) remove what is no longer there: old files, then folders that are now empty
    for (const p of Object.keys(old)) if (!(p in next)) await t.remove(root + p);
    const keep = dirsOf(Object.keys(next));
    const gone = [...dirsOf(Object.keys(old))].filter(d => !keep.has(d)).sort((a, b) => a.length - b.length);
    const done = []; for (const d of gone) { if (done.some(x => d.startsWith(x))) continue; await t.removeDir(root + d); done.push(d); }
    await DB.setSetting(mkey(sv.id), { files: next, at: Date.now() });
  }

  // ---------- controls used by the app ----------
  async function chooseFolder() {   // computer only; must run from a click
    const h = await window.showDirectoryPicker({ id: 'rs-backup', mode: 'readwrite', startIn: 'documents' });
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Klasöre yazma izni verilmedi');
    const changed = !HANDLE || !(await HANDLE.isSameEntry(h));
    HANDLE = h; await DB.setSetting('backupDir', h);
    if (changed) for (const sv of await DB.listSurveys()) await DB.setSetting(mkey(sv.id), null);   // new folder: write everything
    const cfg = (await DB.getSetting('backup')) || {}; cfg.desktop = true; await DB.setSetting('backup', cfg);
    ST.on = true; ST.needsPermission = false; ST.error = '';
    await backupAll();
  }
  async function grant() { if (await desktop.ready(true)) { ST.needsPermission = false; ST.error = ''; await backupAll(); } emit(); }
  async function setOn(on) {
    const cfg = (await DB.getSetting('backup')) || {}; cfg[target().kind] = !!on; await DB.setSetting('backup', cfg);
    ST.on = !!on && (target().kind === 'android' || !!HANDLE); emit(); if (ST.on) await backupAll();
  }
  async function backupAll(full) {
    const list = await DB.listSurveys();
    if (full) for (const sv of list) await DB.setSetting(mkey(sv.id), null);
    for (const sv of list) ST.queue.add(sv.id);
    clearTimeout(ST.timer); await run();
  }
  // tablet: backup folders that hold an etut.json, to open again
  async function restoreList() {
    if (target().kind !== 'android') return [];
    const out = [];
    for (const d of (await android.list('')).filter(x => x.dir)) {
      const names = [], walk = async pre => { for (const f of await android.list(pre)) { if (f.dir) await walk(pre + f.name + '/'); else names.push(pre + f.name); } };
      if (!(await android.list(d.name + '/')).some(f => f.name === 'etut.json')) continue;
      out.push({ name: d.name, source: async () => { await walk(d.name + '/'); return { names, get: async n => names.includes(n) ? android.read(n) : null }; } });
    }
    return out;
  }

  g.Backup = { init, status, onChange: f => { ST.listeners.add(f); return () => ST.listeners.delete(f); }, chooseFolder, grant, setOn, backupAll, restoreList, schedule, supported };
})(window);
