/* GoSurvey for Windows: a window around the web app (always the newest version from the site, offline from its
   own cache once opened) plus what a browser cannot do well: the report PDF printed by the app itself (vector, every
   page in its own size and orientation, colours on) and saved where the user chooses. Accounts, sign-in, the
   authenticator code and device approval are the same as on the web (this computer is approved once as a device). */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path'), fs = require('fs');

const SITE = 'https://aydagbatualeyna3478.github.io/route-survey/';
const ORIGIN = new URL(SITE).origin;
let win = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, show: false, title: 'GoSurvey',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('page-title-updated', e => { e.preventDefault(); win.setTitle('GoSurvey'); });
  // links to other sites open in the normal browser; the app's own pages stay in the window
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(ORIGIN)) shell.openExternal(url); else win.loadURL(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (e, code, desc, url, main) => { if (main && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { u: url || SITE } }); });
  win.webContents.on('before-input-event', (e, i) => {   // F5 / Ctrl+F5 reload, F12 tools for support
    if (i.type !== 'keyDown') return;
    if (i.key === 'F5') { e.preventDefault(); i.control ? win.webContents.reloadIgnoringCache() : win.webContents.reload(); }
    if (i.key === 'F12') win.webContents.toggleDevTools();
  });
  win.loadURL(SITE);
}


/* report PDF: Chromium's own PDF printer, page sizes from the report's CSS */
ipcMain.handle('pdf:save', async (e, name) => {
  const wc = e.sender, w = BrowserWindow.fromWebContents(wc);
  const safe = String(name || 'Route Survey Report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Route Survey Report';
  const dir = path.join(app.getPath('documents'), 'Etütler'); try { fs.mkdirSync(dir, { recursive: true }); } catch (er) { /* Documents only */ }
  const pick = await dialog.showSaveDialog(w, { title: 'PDF Olarak Kaydet', defaultPath: path.join(fs.existsSync(dir) ? dir : app.getPath('documents'), safe + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (pick.canceled || !pick.filePath) return { cancelled: true };
  try {
    const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' }, displayHeaderFooter: false, generateTaggedPDF: false });
    fs.writeFileSync(pick.filePath, data);
    return { path: pick.filePath, size: data.length };
  } catch (er) { return { err: er.message || String(er) }; }
});
ipcMain.handle('pdf:open', (e, p) => shell.openPath(p));
ipcMain.handle('pdf:show', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('app:version', () => app.getVersion());

/* backup folder: chosen once with Windows' folder dialog, kept in the app's settings; every path stays inside it */
const CFG = () => path.join(app.getPath('userData'), 'backup.json');
const base = () => { try { const b = JSON.parse(fs.readFileSync(CFG(), 'utf8')).dir; return b && fs.existsSync(b) ? b : null; } catch (e) { return null; } };
const inside = rel => {
  const b = base(); if (!b) throw new Error('Yedekleme klasörü seçilmedi');
  const full = path.resolve(b, String(rel || '').replace(/^[\\/]+/, ''));
  if (full !== path.resolve(b) && !full.startsWith(path.resolve(b) + path.sep)) throw new Error('Geçersiz yol');
  return full;
};
const res = f => async (...a) => { try { return { ok: true, v: await f(...a) } } catch (er) { return { ok: false, err: er.message || String(er) }; } };
ipcMain.handle('fs:pick', async e => {
  const w = BrowserWindow.fromWebContents(e.sender), docs = app.getPath('documents');
  const r = await dialog.showOpenDialog(w, { title: 'Yedekleme Konumunu Seçin', defaultPath: base() || docs, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  try { const t = path.join(dir, '.gosurvey-yazma-testi'); fs.writeFileSync(t, 'ok'); fs.unlinkSync(t); } catch (er) { return { err: 'Bu klasöre yazılamıyor: ' + er.message }; }
  fs.mkdirSync(path.dirname(CFG()), { recursive: true }); fs.writeFileSync(CFG(), JSON.stringify({ dir }));
  return { path: dir, name: path.basename(dir) || dir };
});
ipcMain.handle('fs:current', () => { const b = base(); return b ? { path: b, name: path.basename(b) || b } : null; });
ipcMain.handle('fs:clear', () => { try { fs.unlinkSync(CFG()); } catch (e) {} return true; });
ipcMain.handle('fs:write', res(async (rel, data) => { const f = inside(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' ? data : Buffer.from(data)); }));
ipcMain.handle('fs:move', res(async (a, b) => { const f = inside(a), t = inside(b); if (fs.existsSync(t)) throw new Error('Hedef dolu'); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.renameSync(f, t); }));
ipcMain.handle('fs:remove', res(async rel => { fs.rmSync(inside(rel), { recursive: true, force: true }); }));
ipcMain.handle('fs:list', res(async rel => { const d = inside(rel); return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).map(x => ({ name: x.name, dir: x.isDirectory() })) : []; }));
ipcMain.handle('fs:read', res(async rel => new Uint8Array(fs.readFileSync(inside(rel)))));
ipcMain.handle('fs:open', () => { const b = base(); return b ? shell.openPath(b) : ''; });

app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
