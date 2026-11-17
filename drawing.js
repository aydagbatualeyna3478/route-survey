/* Transport drawing as a PDF (Etüt bilgileri / rapor ekranı): every page of it is drawn with pdf.js (vendor/, offline)
   into a picture for the report. Returns [{ src, landscape }] or null when the stored drawing is not a PDF. */
window.drawingPages = async function (blob, onStep) {
  if (!blob || !/pdf/.test(blob.type)) return null;
  if (!window.pdfjsLib) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('pdf.js yüklenemedi')); document.head.appendChild(s); });
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise, out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (onStep) onStep(i, doc.numPages);
    const page = await doc.getPage(i), v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, 3000 / Math.max(v1.width, v1.height)), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const src = await new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/png'));
    out.push({ src, landscape: vp.width > vp.height });
  }
  return out;
};
