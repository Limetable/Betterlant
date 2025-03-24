window.crashAPI.onCrashData((crashData) => {
    document.getElementById('crash-message').textContent = crashData.message;

    if (crashData.stack) {
        document.getElementById('crash-details').textContent = crashData.stack;
    } else {
        document.getElementById('crash-details').textContent = `Exit code: ${crashData.code}`;
    }

    // Populate console log
    if (crashData.consoleLog && crashData.consoleLog.length > 0) {
        const logContainer = document.getElementById('console-log-container');
        logContainer.innerHTML = ''; // Clear existing content

        crashData.consoleLog.forEach(entry => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${entry.type}`;

            const timestamp = document.createElement('span');
            timestamp.className = 'log-timestamp';
            timestamp.textContent = new Date(entry.timestamp).toLocaleTimeString();

            logEntry.appendChild(timestamp);
            logEntry.appendChild(document.createTextNode(entry.message));

            logContainer.appendChild(logEntry);
        });

        // Scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    }
});
