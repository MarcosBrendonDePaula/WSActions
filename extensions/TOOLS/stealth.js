/**
 * Stealth Engine - Anti-detecção para automação web
 * Injeta patches no window para evitar fingerprinting e detecção de bot.
 */

/**
 * Retorna o código de stealth para injeção no contexto da página
 * @returns {string} Código JavaScript para injeção
 */
function getStealthScript() {
    return `
(function() {
    'use strict';

    // =======================
    // 1. navigator.webdriver → false
    // =======================
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true,
    });

    // =======================
    // 2. navigator.plugins (simula plugins reais)
    // =======================
    const mockPlugins = [
        {
            name: 'Chrome PDF Plugin',
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            mimeTypes: [
                { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }
            ]
        },
        {
            name: 'Chrome PDF Viewer',
            description: '',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            mimeTypes: [
                { type: 'application/pdf', suffixes: 'pdf', description: '' }
            ]
        },
        {
            name: 'Native Client',
            description: '',
            filename: 'internal-nacl-plugin',
            mimeTypes: [
                { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
                { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' }
            ]
        }
    ];

    function createMimeType(mime, plugin) {
        const mt = Object.create(MimeType.prototype);
        Object.defineProperties(mt, {
            type: { get: () => mime.type },
            suffixes: { get: () => mime.suffixes },
            description: { get: () => mime.description },
            enabledPlugin: { get: () => plugin }
        });
        return mt;
    }

    function createPlugin(p) {
        const plugin = Object.create(Plugin.prototype);
        const mimes = p.mimeTypes.map(m => createMimeType(m, plugin));
        Object.defineProperties(plugin, {
            name: { get: () => p.name },
            description: { get: () => p.description },
            filename: { get: () => p.filename },
            length: { get: () => mimes.length },
        });
        mimes.forEach((m, i) => {
            Object.defineProperty(plugin, i, { get: () => m });
            Object.defineProperty(plugin, m.type, { get: () => m });
        });
        plugin.item = (index) => mimes[index] || null;
        plugin.namedItem = (name) => mimes.find(m => m.type === name) || null;
        return plugin;
    }

    const plugins = mockPlugins.map(createPlugin);
    const pluginArray = Object.create(PluginArray.prototype);
    Object.defineProperty(pluginArray, 'length', { get: () => plugins.length });
    plugins.forEach((p, i) => {
        Object.defineProperty(pluginArray, i, { get: () => p });
        Object.defineProperty(pluginArray, p.name, { get: () => p });
    });
    pluginArray.item = (index) => plugins[index] || null;
    pluginArray.namedItem = (name) => plugins.find(p => p.name === name) || null;
    pluginArray.refresh = () => {};

    Object.defineProperty(navigator, 'plugins', {
        get: () => pluginArray,
        configurable: true,
    });

    // =======================
    // 3. Patch addEventListener para marcar eventos como isTrusted: true
    // =======================
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        const wrappedListener = function(event) {
            if (!event.isTrusted) {
                const trustedEvent = new Proxy(event, {
                    get(target, prop) {
                        if (prop === 'isTrusted') return true;
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                });
                return listener.call(this, trustedEvent);
            }
            return listener.call(this, event);
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
    };

    // =======================
    // 4. Canvas fingerprint randomization
    // =======================
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const ctx = this.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            const data = imageData.data;
            // Adiciona ruído aleatório sutil a pixels aleatórios
            for (let i = 0; i < data.length; i += 4) {
                if (Math.random() < 0.01) {
                    data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
                    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() * 2 - 1)));
                    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() * 2 - 1)));
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.call(this, type, quality);
    };

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        const ctx = this.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (Math.random() < 0.01) {
                    data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
                    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() * 2 - 1)));
                    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() * 2 - 1)));
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }
        return originalToBlob.call(this, callback, type, quality);
    };

    // =======================
    // 5. WebGL vendor/renderer spoofing
    // =======================
    const getParameterProxyHandler = {
        apply(target, thisArg, args) {
            const param = args[0];
            const gl = thisArg;
            // UNMASKED_VENDOR_WEBGL
            if (param === 0x9245) {
                return 'Intel Inc.';
            }
            // UNMASKED_RENDERER_WEBGL
            if (param === 0x9246) {
                return 'Intel Iris OpenGL Engine';
            }
            return Reflect.apply(target, thisArg, args);
        }
    };

    const getContextProxyHandler = {
        apply(target, thisArg, args) {
            const context = Reflect.apply(target, thisArg, args);
            if (context && (args[0] === 'webgl' || args[0] === 'webgl2' || args[0] === 'experimental-webgl')) {
                const originalGetParameter = context.getParameter.bind(context);
                context.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);

                // Also handle getExtension for WEBGL_debug_renderer_info
                const originalGetExtension = context.getExtension.bind(context);
                context.getExtension = function(name) {
                    const ext = originalGetExtension(name);
                    if (name === 'WEBGL_debug_renderer_info' && ext) {
                        return ext;
                    }
                    return ext;
                };
            }
            return context;
        }
    };

    HTMLCanvasElement.prototype.getContext = new Proxy(
        HTMLCanvasElement.prototype.getContext,
        getContextProxyHandler
    );

    // =======================
    // 6. Remoção de markers de automação
    // =======================
    // Remove window.cdc_ (ChromeDriver)
    const cdcKeys = Object.keys(window).filter(k => k.startsWith('cdc_'));
    for (const key of cdcKeys) {
        try { delete window[key]; } catch(e) {}
    }

    // Remove window.__selenium
    try { delete window.__selenium; } catch(e) {}
    try { delete window.__selenium_evaluate; } catch(e) {}
    try { delete window.__selenium_unwrap; } catch(e) {}

    // Remove document.$cdc_ markers
    const docCdcKeys = Object.keys(document).filter(k => k.startsWith('$cdc_'));
    for (const key of docCdcKeys) {
        try { delete document[key]; } catch(e) {}
    }

    // Override navigator.languages para parecer mais natural
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'pt-BR', 'pt'],
        configurable: true,
    });

    // Override navigator.hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4,
        configurable: true,
    });

    console.log('[WSActions] Stealth patches applied');
})();
`;
}

module.exports = {
    getStealthScript,
};
