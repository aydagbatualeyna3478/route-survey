/* Moving a survey between the tablet (field) and the office computer as one file.
   The file is a ZIP laid out the way the team agreed:
     <A>-<B> Arası Etüt Raporu/
       etut.json               everything the app needs to open the survey again
       etut-bilgileri.txt      the same, readable
       1 - Bridge/ foto.jpg, ek-1.jpg…, bilgiler.txt
         1-1 - INFO/ …          INFO/BYPASS inside their obstacle's folder
       Arşiv/ A1 - …/          archived obstacles (not in the report)
       logolar/, kapak.jpg, cizim.png   office material, when present
   Photos are already JPEG, so the ZIP stores them without compressing again. */
(function (g) {
  const FORMAT = 'route-survey-etut', VERSION = 1;
  const enc = new TextEncoder();
  const safe = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Engel';
  const rootName = sv => safe(`${sv.project.start.name}-${sv.project.end.name} Arası Etüt Raporu`);
  const fileNameOf = sv => `${rootName(sv)} ${new Date().toISOString().slice(0, 10)}.zip`;
  const extOf = b => /png/.test(b && b.type) ? 'png' : 'jpg';
  const fmt = (v, d) => v == null || v === '' ? '' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 2 : d });

  // ---------- CRC-32 + ZIP writer (stored entries, UTF-8 names) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function dosTime(d) {
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  function zipWriter(sink) {
    const central = []; let offset = 0; const dt = dosTime(new Date());
    return {
      async add(name, data) {   // data: Uint8Array
        const nm = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, dt.time, true); h.setUint16(12, dt.date, true); h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
        await sink.write(new Uint8Array(h.buffer)); await sink.write(nm); await sink.write(data);
        central.push({ nm, crc, size: data.length, offset }); offset += 30 + nm.length + data.length;
      },
      async close() {
        let size = 0;
        for (const e of central) {
          const c = new DataView(new ArrayBuffer(46));
          c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
          c.setUint16(12, dt.time, true); c.setUint16(14, dt.date, true); c.setUint32(16, e.crc, true); c.setUint32(20, e.size, true); c.setUint32(24, e.size, true);
          c.setUint16(28, e.nm.length, true); c.setUint32(42, e.offset, true);
          await sink.write(new Uint8Array(c.buffer)); await sink.write(e.nm); size += 46 + e.nm.length;
        }
        const z = new DataView(new ArrayBuffer(22));
        z.setUint32(0, 0x06054b50, true); z.setUint16(8, central.length, true); z.setUint16(10, central.length, true);
        z.setUint32(12, size, true); z.setUint32(16, offset, true);
        await sink.write(new Uint8Array(z.buffer)); return sink.close();
      },
    };
  }

  // ---------- sinks: in memory (computer) or straight into a file on Android ----------
  const memorySink = () => { const parts = []; return { write: async u8 => { parts.push(u8); }, close: async () => new Blob(parts, { type: 'application/zip' }) }; };
  const native = () => window.Capacitor && typeof Capacitor.nativePromise === 'function';
  const call = (plugin, method, opts) => Capacitor.nativePromise(plugin, method, opts || {});
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function androidSink(path, directory) {   // appends ~2 MB at a time so a large survey never sits in memory as one string
    let buf = [], len = 0, first = false;   // the (empty) file is created by the caller
    const flush = async () => {
      if (!len && !first) return;
      const u8 = new Uint8Array(len); let o = 0; for (const p of buf) { u8.set(p, o); o += p.length; }
      buf = []; len = 0;
      if (first) { first = false; await call('Filesystem', 'writeFile', { path, directory, data: b64(u8), recursive: true }); }
      else await call('Filesystem', 'appendFile', { path, directory, data: b64(u8) });
    };
    return {
      write: async u8 => { buf.push(u8); len += u8.length; if (len >= 2 * 1024 * 1024) await flush(); },
      close: async () => { await flush(); const r = await call('Filesystem', 'getUri', { path, directory }); return r.uri; },
    };
  }

  // ---------- readable text ----------
  function recordText(sv, r) {
    const L = [];
    L.push(`No: ${r.no}${r.flag ? ' (' + r.flag + ')' : ''}`);
    L.push(`Engel: ${r.obstacle || '(tip seçilmedi)'}`);
    if (r.fields && r.fields.type) L.push(`Tip: ${r.fields.type}`);
    if (r.fields && r.fields.name) L.push(`Ad: ${r.fields.name}`);
    if (r.fields && r.fields.spans) L.push(`Açıklıklar: ${r.fields.spans}`);
    if (r.latDec != null) L.push(`Konum: ${r.lat} · ${r.lon} (${r.latDec.toFixed(6)}, ${r.lonDec.toFixed(6)})${r.acc ? ' ±' + Math.round(r.acc) + ' m' : ''}`);
    else L.push('Konum: yok');
    if (r.kmManual != null) L.push(`KM (elle): ${fmt(r.kmManual, 3)}`);
    const hs = (r.heights || []).filter(h => h.value != null); if (hs.length) L.push('Yükseklikler: ' + hs.map(h => `${h.label || 'H'} ${fmt(h.value)} m`).join(', '));
    const ws = (r.widths || []).filter(w => w.value != null); if (ws.length) L.push('Genişlikler: ' + ws.map(w => `${w.label || 'W'} ${fmt(w.value)} m`).join(', '));
    if (r.remarks) L.push(`Remarks: ${r.remarks}`);
    if (r.actions) L.push(`Actions: ${r.actions}`);
    if (r.highlight && r.highlight !== 'none') L.push(`Renk: ${r.highlight}`);
    if (!r.photoId) L.push(r.pendingImage ? 'Görsel: ofiste eklenecek' : 'Görsel: yok');
    if (r.archived) L.push('Arşivde: evet (rapora girmez)');
    if (r.t) L.push(`Kayıt zamanı: ${new Date(r.t).toLocaleString('tr-TR')}`);
    return L.join('\r\n') + '\r\n';
  }
  function surveyText(sv, live, arc) {
    const p = sv.project, c = p.cargo || {};
    return [`${p.start.name} - ${p.end.name} Arası Etüt Raporu`, '',
      `Etüt türü: ${p.general ? 'Genel etüt' : 'Belirli bir yük için'}`,
      p.general ? '' : `Yük: uzunluk ${fmt(c.length)} m, genişlik ${fmt(c.width)} m, yükseklik ${fmt(c.height)} m, ağırlık ${fmt(c.weight)} t`,
      `Durum: ${sv.status === 'done' ? 'tamamlandı' : 'devam ediyor'}`,
      `Engel sayısı: ${live.length} (arşivde ${arc.length})`,
      `Dışa aktarma: ${new Date().toLocaleString('tr-TR')}`, ''].filter(x => x !== null).join('\r\n');
  }

  // ---------- layout: what goes where (shared by the ZIP export and the live folder backup) ----------
  /* entries: { path (inside the survey folder), blob: blobId } or { path, text } — in this order:
     obstacle folders with their photos and bilgiler.txt, logos, then etut.json and etut-bilgileri.txt */
  function plan(sv, when) {
    const live = orderedRecords(sv), arc = archivedRecords(sv), all = live.concat(arc);
    const files = {}, folder = {}, entries = [];
    const place = (list, base) => {
      for (const r of list) {
        const nm = r.parentId && !r.solo ? safe(`${r.no} - ${r.flag || 'INFO'}${r.obstacle && r.obstacle !== r.flag ? ' - ' + r.obstacle : ''}`) : safe(`${r.no} - ${r.obstacle || 'Tip seçilmedi'}`);
        folder[r.id] = (r.parentId && !r.solo && folder[r.parentId] ? folder[r.parentId] : base) + nm + '/';
      }
    };
    place(live, ''); place(arc, 'Arşiv/');
    for (const r of all) {
      const dir = folder[r.id], f = { dir };
      if (r.photoId) { f.photo = dir + 'foto.' + (r.photoExt || 'jpg'); entries.push({ path: f.photo, blob: r.photoId, rec: r }); }
      f.extras = (r.extras || []).map((id, i) => { const pth = dir + `ek-${i + 1}.jpg`; entries.push({ path: pth, blob: id, rec: r }); return pth; });
      entries.push({ path: dir + 'bilgiler.txt', text: recordText(sv, r), rec: r });
      files[r.id] = f;
    }
    const logoFiles = {};
    for (const [k, id] of Object.entries(sv.logos || {})) {
      const pth = k === 'cover' ? 'kapak.jpg' : k === 'drawing' ? 'cizim.png' : `logolar/${k}.png`;
      logoFiles[k] = pth; entries.push({ path: pth, blob: id, logo: k });
    }
    return { live, arc, all, files, logoFiles, entries, json: () => {
      const data = JSON.parse(JSON.stringify(sv)); delete data.track; delete data.odo;
      return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: (when || new Date()).toISOString(), files, logoFiles, survey: data }, null, 1);
    } };
  }
  /* the real file type decides the extension; the planned name is fixed up when the blob is read */
  const fixExt = (pth, b) => pth.replace(/\.(jpg|png)$/, '.' + extOf(b));

  // ---------- export ----------
  async function exportSurvey(sv, onStep) {
    const P = plan(sv), root = rootName(sv) + '/', fileName = fileNameOf(sv);
    let sink, where;
    if (native()) {
      where = 'Belgeler/Etütler/' + fileName;
      try { await call('Filesystem', 'requestPermissions'); } catch (e) { /* Android 11+: not needed */ }
      try { await call('Filesystem', 'writeFile', { path: 'Etütler/' + fileName, directory: 'DOCUMENTS', data: '', recursive: true }); sink = androidSink('Etütler/' + fileName, 'DOCUMENTS'); }
      catch (e) { await call('Filesystem', 'writeFile', { path: fileName, directory: 'CACHE', data: '', recursive: true }); sink = androidSink(fileName, 'CACHE'); where = null; }
    } else sink = memorySink();
    const z = zipWriter(sink);
    let n = 0;
    for (const e of P.entries) {
      if (e.text != null) { n += 1; if (onStep) onStep(n, P.all.length); await z.add(root + e.path, enc.encode(e.text)); continue; }
      const b = await DB.getBlob(e.blob); if (!b) { dropPath(P, e); continue; }
      const pth = fixExt(e.path, b); if (pth !== e.path) renamePath(P, e, pth);
      await z.add(root + pth, new Uint8Array(await b.arrayBuffer()));
    }
    await z.add(root + 'etut.json', enc.encode(P.json()));
    await z.add(root + 'etut-bilgileri.txt', enc.encode(surveyText(sv, P.live, P.arc)));
    const result = await z.close();
    if (native()) {
      try { await call('Share', 'share', { title: fileName, files: [result], dialogTitle: 'Etüt dosyasını gönder' }); } catch (e) { /* closed the share sheet */ }
      return { fileName, where, count: P.all.length };
    }
    return { fileName, blob: result, count: P.all.length };
  }
  // keep etut.json's file list in step with what was really written
  function dropPath(P, e) {
    if (e.logo) { delete P.logoFiles[e.logo]; return; }
    const f = P.files[e.rec.id]; if (f.photo === e.path) delete f.photo; f.extras = f.extras.filter(x => x !== e.path);
  }
  function renamePath(P, e, pth) {
    if (e.logo) { P.logoFiles[e.logo] = pth; e.path = pth; return; }
    const f = P.files[e.rec.id]; if (f.photo === e.path) f.photo = pth; f.extras = f.extras.map(x => x === e.path ? pth : x); e.path = pth;
  }

  // ---------- ZIP reader (stored or deflated, so a zip re-made in Windows also opens) ----------
  async function readZip(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), v = new DataView(buf.buffer);
    let e = buf.length - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('ZIP okunamadı');
    const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    const dec = new TextDecoder(), out = {};
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loff = v.getUint32(p + 42, true);
      const raw = buf.subarray(p + 46, p + 46 + nlen);
      let name; if (flags & 0x0800) name = dec.decode(raw); else { try { name = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch (er) { name = new TextDecoder('latin1').decode(raw); } }
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const lh = loff + 30 + v.getUint16(loff + 26, true) + v.getUint16(loff + 28, true), data = buf.subarray(lh, lh + csize);
      out[name.replace(/\\/g, '/')] = { method, data };
    }
    const get = async name => {
      const it = out[name]; if (!it) return null;
      if (it.method === 0) return new Blob([it.data]);
      if (it.method === 8) return new Response(new Blob([it.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      throw new Error('Desteklenmeyen sıkıştırma: ' + it.method);
    };
    return { names: Object.keys(out), get };
  }
  const folderSource = fileList => {   // a folder picked on the computer (webkitdirectory)
    const map = {}; for (const f of fileList) map[(f.webkitRelativePath || f.name).replace(/\\/g, '/')] = f;
    return { names: Object.keys(map), get: async n => map[n] || null };
  };

  // ---------- import ----------
  /* names re-zipped or unpacked on Windows may use the old DOS code page for ç, ı, ş…: when a name is not found
     as written, it is matched with such letters blanked out, so "2 - Tip seçilmedi/foto.jpg" is still found */
  const skel = n => n.normalize('NFC').replace(/[^\x20-\x7e]+/g, '_');
  function tolerant(src) {
    const set = new Set(src.names), bySkel = {}; for (const n of src.names) bySkel[skel(n)] = n;
    return { names: src.names, get: name => src.get(set.has(name) ? name : bySkel[skel(name)] || name) };
  }
  async function readSurvey(src) {
    src = tolerant(src);
    const jsonName = src.names.filter(n => /(^|\/)etut\.json$/.test(n)).sort((a, b) => a.length - b.length)[0];
    if (!jsonName) throw new Error('Bu dosyada etüt bulunamadı (etut.json yok)');
    const base = jsonName.slice(0, jsonName.length - 'etut.json'.length);
    const doc = JSON.parse(await (await src.get(jsonName)).text());
    if (doc.format !== FORMAT) throw new Error('Bu dosya bir etüt dosyası değil');
    return { doc, base, src };
  }
  async function saveImported({ doc, base, src }, mode, onStep) {   // mode: 'replace' | 'copy'
    const sv = doc.survey, origId = sv.id, old = await DB.getSurvey(sv.id);
    if (old && mode === 'replace') { for (const r of old.records) for (const b of [r.photoId, ...(r.extras || [])]) await DB.delBlob(b); for (const b of Object.values(old.logos || {})) await DB.delBlob(b); }
    if (mode === 'copy') { sv.id = DB.uid(); sv.copyOf = origId; }
    const blobAt = async pth => { const b = pth && await src.get(base + pth); if (!b) return null; const type = /\.png$/i.test(pth) ? 'image/png' : 'image/jpeg'; return DB.putBlob(b.type === type ? b : new Blob([b], { type })); };
    let n = 0;
    for (const r of sv.records) {
      n += 1; if (onStep) onStep(n, sv.records.length);
      const f = doc.files[r.id] || {};
      r.photoId = await blobAt(f.photo); r.extras = [];
      for (const pth of f.extras || []) { const id = await blobAt(pth); if (id) r.extras.push(id); }
    }
    sv.logos = {};
    for (const [k, pth] of Object.entries(doc.logoFiles || {})) { const id = await blobAt(pth); if (id) sv.logos[k] = id; }
    sv.importedAt = Date.now();
    await DB.putSurvey(sv);
    return sv;
  }

  g.Transfer = { exportSurvey, readZip, folderSource, readSurvey, saveImported, rootName, fileNameOf, plan, fixExt, dropPath, renamePath, surveyText, safe, native, call, b64 };
})(window);
