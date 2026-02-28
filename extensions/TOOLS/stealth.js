/**
 * WSActions Stealth Engine
 * Anti-detection patches injected as GLOBAL_SCRIPT (runs before extensions)
 * Patches browser APIs to hide automation fingerprints
 */

// navigator.webdriver
try {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
    });
} catch(e) {}

// Remove automation markers
try {
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    delete window.__selenium_evaluate;
    delete window.__selenium_unwrapped;
    delete window.__webdriver_script_fn;
    delete window.__driver_evaluate;
    delete window.__webdriver_evaluate;
    delete window.__fxdriver_evaluate;
    delete window.__fxdriver_unwrapped;
    delete window._Selenium_IDE_Recorder;
    delete window._selenium;
    delete window.calledSelenium;
    delete window.domAutomation;
    delete window.domAutomationController;
} catch(e) {}

// Fake plugins (Chrome normally has 5)
try {
    const fakePlugins = {
        length: 5,
        0: { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        1: { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        2: { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        3: { name: 'Chromium PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        4: { name: 'Chromium PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        item: function(i) { return this[i] || null; },
        namedItem: function(name) {
            for (let i = 0; i < this.length; i++) {
                if (this[i].name === name) return this[i];
            }
            return null;
        },
        refresh: function() {}
    };
    Object.defineProperty(navigator, 'plugins', {
        get: () => fakePlugins,
        configurable: true
    });
} catch(e) {}

// navigator.languages
try {
    Object.defineProperty(navigator, 'languages', {
        get: () => ['pt-BR', 'pt', 'en-US', 'en'],
        configurable: true
    });
} catch(e) {}

// Permissions API — hide "denied" for notifications
try {
    const originalQuery = window.Permissions.prototype.query;
    window.Permissions.prototype.query = function(parameters) {
        if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery.call(this, parameters);
    };
} catch(e) {}

// Chrome runtime — make chrome.runtime appear normal
try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            connect: function() {},
            sendMessage: function() {}
        };
    }
} catch(e) {}

// Canvas fingerprint noise (subtle randomization)
try {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        if (this.width === 0 && this.height === 0) return origToDataURL.apply(this, arguments);
        const ctx = this.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, Math.min(this.width, 2), Math.min(this.height, 2));
            // Subtle noise: flip 1-2 least significant bits of a few pixels
            for (let i = 0; i < Math.min(imageData.data.length, 8); i += 4) {
                imageData.data[i] ^= 1; // tiny R change
            }
            ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.apply(this, arguments);
    };
} catch(e) {}

// WebGL vendor/renderer
try {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Google Inc. (NVIDIA)';       // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
        return getParam.call(this, param);
    };
    if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParam2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(param) {
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParam2.call(this, param);
        };
    }
} catch(e) {}

// Connection type (automation often has no network info)
try {
    if (navigator.connection) {
        Object.defineProperty(navigator.connection, 'rtt', { get: () => 50, configurable: true });
    }
} catch(e) {}

// Hardware concurrency (headless often reports 1-2)
try {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true
    });
} catch(e) {}

// Device memory
try {
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true
    });
} catch(e) {}
