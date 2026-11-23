/* Computer: the report as one PDF made by the app itself, like on the tablet — no print dialog, so every page keeps
   its own size (portrait / landscape A4, A3) and every colour. Each page is drawn into a canvas (vendor/html-to-image.js)
   and written straight into the file page by page, so long reports (300 pages) do not fill the memory.
   deskPdf(name, onStep) → { path, err } ; onStep(i, n) shows the progress. */
(function () {
  const latin1 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
  const pad = n => String(n).padStart(10, '0');

  async function deskPdf(name, onStep) {
    if (!window.htmlToImage) return { err: 'PDF aracı yüklenemedi; lütfen sayfayı yenileyin.' };
    const safe = (name || 'Route Survey Report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Route Survey Report';
    let w = null; const parts = [];
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: safe + '.pdf', types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
        w = await h.createWritable();
      } catch (e) { if (e && e.name === 'AbortError') return { cancelled: true }; w = null; }
    }
    let pos = 0; const offs = []; const kids = []; let next = 3;
    const put = async d => { const b = typeof d === 'string' ? latin1(d) : d; pos += b.length; if (w) await w.write(b); else parts.push(b); };
    const obj = n => { offs[n - 1] = pos; };

    const root = document.documentElement, z = root.style.getPropertyValue('--z');
    root.classList.add('cap'); root.style.setProperty('--z', '1');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const pages = [...document.querySelectorAll('#report .page')];
    let err = null;
    try {
      await put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); obj(1); await put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      let fontCSS = ''; try { fontCSS = await window.htmlToImage.getFontEmbedCSS(pages[0]); } catch (e) { fontCSS = ''; }
      for (let i = 0; i < pages.length; i++) {
        if (window.__pdfCancel) throw Object.assign(new Error('İptal edildi'), { cancel: true });
        const p = pages[i], b = p.getBoundingClientRect();
        const cv = await window.htmlToImage.toCanvas(p, { pixelRatio: 2, backgroundColor: '#ffffff', fontEmbedCSS: fontCSS, cacheBust: false, skipAutoScale: true, width: b.width, height: b.height, style: { margin: '0', transform: 'none', boxShadow: 'none' } });
        const jpg = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86))).arrayBuffer());
        const bw = cv.width, bh = cv.height; cv.width = cv.height = 0;
        const pw = b.width * 0.75, ph = b.height * 0.75;
        const po = next, co = po + 1, io = po + 2; next += 3; kids.push(po);
        obj(po); await put(`${po} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(pw)} ${f2(ph)}] /Resources << /XObject << /Im0 ${io} 0 R >> >> /Contents ${co} 0 R >>\nendobj\n`);
        const cs = `q ${f2(pw)} 0 0 ${f2(ph)} 0 0 cm /Im0 Do Q`;
        obj(co); await put(`${co} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
        obj(io); await put(`${io} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${bw} /Height ${bh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
        await put(jpg); await put('\nendstream\nendobj\n');
        if (onStep) onStep(i + 1, pages.length);
        await new Promise(r => setTimeout(r, 0));
      }
      obj(2); await put(`2 0 obj\n<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>\nendobj\n`);
      const xref = pos, n = offs.length;
      let x = `xref\n0 ${n + 1}\n0000000000 65535 f \n`; for (const o of offs) x += `${pad(o)} 00000 n \n`;
      await put(x + `trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    } catch (e) { if (!e.cancel) console.error(e); err = (e && e.message) || 'PDF yazılamadı.'; }
    window.__pdfCancel = false;
    root.classList.remove('cap'); root.style.setProperty('--z', z || '1'); window.dispatchEvent(new Event('resize'));
    if (w) { try { if (err) await w.abort(); else await w.close(); } catch (e) { err = err || e.message; } return { path: err ? null : safe + '.pdf', err, pages: pages.length }; }
    if (err) return { err };
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/pdf' }));   // browsers without a save dialog: download
    const a = document.createElement('a'); a.href = url; a.download = safe + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { path: safe + '.pdf', pages: pages.length };
  }
  window.deskPdf = deskPdf;
})();
