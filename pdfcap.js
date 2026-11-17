/* Tablet app: the report as one PDF made by the app itself (AndroidPdf in MainActivity), so landscape pages stay
   landscape and nothing is shrunk; Android's print dialog cannot mix page sizes or drop its margins. */
window.nativePdf = function (name) {
  return new Promise(async res => {
    const root = document.documentElement, z = root.style.getPropertyValue('--z');
    root.classList.add('cap'); root.style.setProperty('--z', '1');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 500));
    const pages = [...document.querySelectorAll('#report .page')].map(p => { const b = p.getBoundingClientRect(); return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height, pw: b.width * 0.75, ph: b.height * 0.75 }; });
    window.__pdfDone = (path, err) => { root.classList.remove('cap'); root.style.setProperty('--z', z || '1'); window.dispatchEvent(new Event('resize')); res({ path, err }); };
    try { window.AndroidPdf.make(JSON.stringify({ name, scale: 2, pages })); } catch (e) { window.__pdfDone(null, e.message); }
  });
};
