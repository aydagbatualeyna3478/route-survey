/* What the web app can ask from the Windows app (report2.html uses window.DesktopPdf when present). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DesktopPdf', {
  save: name => ipcRenderer.invoke('pdf:save', name),
  open: p => ipcRenderer.invoke('pdf:open', p),
  show: p => ipcRenderer.invoke('pdf:show', p),
});
contextBridge.exposeInMainWorld('GoSurveyApp', { version: () => ipcRenderer.invoke('app:version'), windows: true });
/* backup folder on this computer, written with Node (no browser folder permission that can expire) — backup.js */
contextBridge.exposeInMainWorld('DesktopFs', {
  pick: () => ipcRenderer.invoke('fs:pick'),
  current: () => ipcRenderer.invoke('fs:current'),
  clear: () => ipcRenderer.invoke('fs:clear'),
  write: (p, data) => ipcRenderer.invoke('fs:write', p, data),
  move: (a, b) => ipcRenderer.invoke('fs:move', a, b),
  remove: p => ipcRenderer.invoke('fs:remove', p),
  list: p => ipcRenderer.invoke('fs:list', p),
  read: p => ipcRenderer.invoke('fs:read', p),
  open: () => ipcRenderer.invoke('fs:open'),
});
