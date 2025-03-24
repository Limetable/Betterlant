const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crashAPI', {
    onCrashData: (callback) => ipcRenderer.on('crash-data', (event, data) => callback(data))
});
