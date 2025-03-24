const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botAPI', {
    startBot: (config) => ipcRenderer.send('start-bot', config),
    onBotStatus: (callback) => ipcRenderer.on('bot-status', (event, status) => callback(status)),
    onBotError: (callback) => ipcRenderer.on('bot-error', (event, error) => callback(error)),
    onBotWarning: (callback) => ipcRenderer.on('bot-warning', (event, warning) => callback(warning)),
    onBotCrash: (callback) => ipcRenderer.on('bot-crash', (event, crash) => callback(crash)),
    showCrashWindow: (crash) => ipcRenderer.send('show-crash-window', crash)
});
