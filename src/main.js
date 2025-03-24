const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let botProcess;
let crashWindow;
let consoleLog = []; // Store console logs

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', function () {
        mainWindow = null;
        if (botProcess) {
            botProcess.kill();
        }
    });
}

function createCrashWindow(crashData) {
    if (crashWindow) {
        crashWindow.close();
    }

    crashWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'crash-preload.js')
        }
    });

    crashWindow.loadFile('crash.html');

    crashWindow.webContents.on('did-finish-load', () => {
        // Send crash data and console logs
        crashWindow.webContents.send('crash-data', {
            ...crashData,
            consoleLog: consoleLog
        });
    });

    crashWindow.on('closed', () => {
        crashWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// Handle the start-bot event from renderer
ipcMain.on('start-bot', (event, config) => {
    // Reset console log
    consoleLog = [];

    // Kill existing bot process if any
    if (botProcess) {
        botProcess.kill();
    }

    // Start new bot process with config
    botProcess = spawn('node', ['bot.js', JSON.stringify(config)]);

    botProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        // Add to console log
        consoleLog.push({ type: 'info', message, timestamp: new Date().toISOString() });

        if (mainWindow) {
            // Check if message contains kicked or warning keywords
            if (message.toLowerCase().includes('kicked')) {
                const kickData = {
                    code: 'KICKED',
                    message: message,
                    consoleLog: consoleLog
                };
                createCrashWindow(kickData);
            } else if (message.toLowerCase().includes('warning')) {
                mainWindow.webContents.send('bot-warning', message);
            } else {
                mainWindow.webContents.send('bot-status', message);
            }
        }
    });

    botProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        // Add to console log
        consoleLog.push({ type: 'error', message: error, timestamp: new Date().toISOString() });

        if (mainWindow) {
            mainWindow.webContents.send('bot-error', error);
        }
    });

    botProcess.on('close', (code) => {
        if (code !== 0) {
            const crashData = {
                code: code,
                message: `Bot process exited with code ${code}`,
                consoleLog: consoleLog
            };

            createCrashWindow(crashData);
        } else if (mainWindow) {
            mainWindow.webContents.send('bot-status', `Bot process exited with code ${code}`);
        }
    });

    botProcess.on('error', (error) => {
        // Add to console log
        consoleLog.push({ type: 'error', message: error.message, timestamp: new Date().toISOString() });

        const crashData = {
            code: -1,
            message: `Failed to start bot process: ${error.message}`,
            stack: error.stack,
            consoleLog: consoleLog
        };

        createCrashWindow(crashData);
    });
});

// Handle crash window request
ipcMain.on('show-crash-window', (event, crashData) => {
    createCrashWindow({...crashData, consoleLog: consoleLog});
});
