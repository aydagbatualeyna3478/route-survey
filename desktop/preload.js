/* What the web app can ask from the Windows app (report2.html uses window.DesktopPdf when present). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DesktopPdf', {
  save: name => ipcRenderer.invoke('pdf:save', name),
  open: p => ipcRenderer.invoke('pdf:open', p),
  show: p => ipcRenderer.invoke('pdf:show', p),
});
contextBridge.exposeInMainWorld('GoSurveyApp', { version: () => ipcRenderer.invoke('app:version'), windows: true });
