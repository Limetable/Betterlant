function startBot() {
    const config = {
        username: document.getElementById('username').value,
        server: document.getElementById('server').value,
        port: parseInt(document.getElementById('port').value),
        version: document.getElementById('version').value
    };

    // Validate inputs
    if (!config.username || !config.server || !config.port || !config.version) {
        showNotification('Please fill in all fields', 'warning');
        return;
    }

    window.botAPI.startBot(config);
}

// Notification system
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (container.contains(notification)) {
                container.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

// Listen for bot status updates
window.botAPI.onBotStatus((status) => {
    showNotification(status, 'info');
});

// Listen for bot errors
window.botAPI.onBotError((error) => {
    showNotification(error, 'error');
});
