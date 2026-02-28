/**
 * TOOLS Extension - Web client
 * Runs in page context. Provides automation commands via WebSocket.
 */

const TOOLS_NAME = 'TOOLS';

// Wait for CDP bridge to be available
function waitForCDP(timeout) {
    timeout = timeout || 5000;
    return new Promise(function(resolve) {
        if (window.__wsactions_cdp) {
            resolve(window.__wsactions_cdp);
            return;
        }
        var timer = setTimeout(function() {
            resolve(null);
        }, timeout);
        window.addEventListener('wsactions-cdp-ready', function() {
            clearTimeout(timer);
            resolve(window.__wsactions_cdp);
        }, { once: true });
    });
}

// Module context
var TOOLS_CONTEXT = {
    MODULE_NAME: TOOLS_NAME,
    NAME: TOOLS_NAME,
    cdp: null,
    stealthMode: false,
    maxDelay: 3000,

    KEYBOARD_COMMANDS: [
        {
            description: 'Toggle Stealth Mode',
            keys: [{ key: 'F9' }],
            function: function() {
                this.stealthMode = !this.stealthMode;
                console.log('[TOOLS] Stealth mode:', this.stealthMode ? 'ON' : 'OFF');
            }
        }
    ]
};

// Initialize
(async function() {
    TOOLS_CONTEXT.cdp = await waitForCDP();

    if (TOOLS_CONTEXT.cdp) {
        console.log('[TOOLS] CDP bridge available');
    } else {
        console.warn('[TOOLS] CDP bridge not available, some features will be limited');
    }

    // Register with context manager
    if (window.WSACTION && window.WSACTION.CONTEXT_MANAGER) {
        window.WSACTION.CONTEXT_MANAGER.addExtension(TOOLS_NAME, TOOLS_CONTEXT);
    }
})();
