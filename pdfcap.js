/* Tablet app: the report as one PDF made by the app itself (AndroidPdf in MainActivity), so landscape pages stay
   landscape and nothing is shrunk. Pages go one at a time: only that page is shown, at the top of the document,
   the app draws it and writes it to the file; then the next one. onStep(i, n) shows the progress. */
window.nativePdf = function (name, onStep) {
  return new Promise(async res => {
    const root = document.documentElement, z = root.style.getPropertyValue('--z');
    const pages = [...document.querySelectorAll('#report .page')];
    const restore = () => { pages.forEach(p => p.classList.remove('capon')); root.classList.remove('cap', 'cap1'); root.style.setProperty('--z', z || '1'); window.dispatchEvent(new Event('resize')); };
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const e0 = window.AndroidPdf.begin(name);
    if (e0) { res({ path: null, err: e0 }); return; }
    root.classList.add('cap', 'cap1'); root.style.setProperty('--z', '1');
    let err = null;
    for (let i = 0; i < pages.length && !err; i++) {
      const p = pages[i];
      if (i) pages[i - 1].classList.remove('capon');
      p.classList.add('capon'); window.scrollTo(0, 0);
      await Promise.all([...p.querySelectorAll('img')].map(im => (im.decode ? im.decode() : Promise.resolve()).catch(() => {})));
      await frames(); await new Promise(r => setTimeout(r, 60));
      const b = p.getBoundingClientRect();
      err = await new Promise(r => { window.__pdfStep = e => r(e); window.AndroidPdf.add(JSON.stringify({ x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height, pw: b.width * 0.75, ph: b.height * 0.75, scale: 2 })); });
      if (onStep) onStep(i + 1, pages.length);
    }
    window.__pdfDone = (path, e) => { restore(); res({ path, err: err || e }); };
    window.AndroidPdf.end(!err);
  });
};
