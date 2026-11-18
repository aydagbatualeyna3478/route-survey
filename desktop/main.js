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
  const pick = await dialog.showSaveDialog(w, { title: 'PDF kaydet', defaultPath: path.join(fs.existsSync(dir) ? dir : app.getPath('documents'), safe + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
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

app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
