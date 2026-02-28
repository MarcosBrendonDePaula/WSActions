// Inicializa as configurações padrão e aplica regras CSP imediatamente
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extensão instalada");
    // Define disableCSP como true por padrão e aplica as regras
    chrome.storage.local.set({ disableCSP: true }, () => {
        setupCSPRules(true);
    });
});

// Aplica as regras CSP ao iniciar o navegador baseado na configuração salva
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(['disableCSP'], (result) => {
        setupCSPRules(result.disableCSP !== false);
    });
});

// ============================================
// CDP (Chrome DevTools Protocol) Engine
// Two modes:
//   transient (default): attach → execute → detach (bar flashes ~200ms)
//   persistent: stays attached (use --silent-debugger-extension-api)
// ============================================

const CDP_VERSION = '1.3';
let attachedTabs = new Set();
let cdpMode = 'transient'; // 'transient' or 'persistent'
const tabMousePos = {};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function gaussianRandom(mean, stdDev) {
    let u1; do { u1 = Math.random(); } while (u1 === 0);
    const u2 = Math.random();
    return Math.max(0, mean + Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * stdDev);
}

function humanDelay(min, max) {
    return Math.floor(gaussianRandom((min + max) / 2, (max - min) / 4));
}

function bezierPoints(sx, sy, ex, ey, steps) {
    const pts = [];
    const c1x = sx + (ex - sx) * (0.2 + Math.random() * 0.3);
    const c1y = sy + (Math.random() - 0.5) * Math.abs(ey - sy) * 0.8;
    const c2x = sx + (ex - sx) * (0.5 + Math.random() * 0.3);
    const c2y = ey + (Math.random() - 0.5) * Math.abs(ey - sy) * 0.4;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, mt = 1 - t;
        pts.push({
            x: mt*mt*mt*sx + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*ex,
            y: mt*mt*mt*sy + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*ey
        });
    }
    return pts;
}

async function attachDebugger(tabId) {
    if (attachedTabs.has(tabId)) return;
    try {
        await chrome.debugger.attach({ tabId }, CDP_VERSION);
        attachedTabs.add(tabId);
    } catch (error) {
        console.error('Error attaching debugger:', error);
        throw error;
    }
}

async function detachDebugger(tabId) {
    if (!attachedTabs.has(tabId)) return;
    try {
        await chrome.debugger.detach({ tabId });
        attachedTabs.delete(tabId);
    } catch (error) {
        console.error('Error detaching debugger:', error);
    }
}

function cdpSend(tabId, method, params) {
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params || {}, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Execute fn with debugger attached.
 * Transient mode: attach → fn() → detach (bar flashes briefly)
 * Persistent mode: attach once, stay attached
 */
async function withCDP(tabId, fn) {
    await attachDebugger(tabId);
    try {
        return await fn(tabId);
    } finally {
        if (cdpMode === 'transient') {
            await sleep(50);
            await detachDebugger(tabId);
        }
    }
}

// --- CDP Actions (humanized) ---

async function cdpClick(tabId, x, y) {
    const ox = (Math.random() - 0.5) * 6;
    const oy = (Math.random() - 0.5) * 6;
    const tx = x + ox, ty = y + oy;
    const last = tabMousePos[tabId] || { x: Math.random() * 500, y: Math.random() * 400 };

    const steps = 8 + Math.floor(Math.random() * 12);
    const pts = bezierPoints(last.x, last.y, tx, ty, steps);
    for (const p of pts) {
        await cdpSend(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: Math.round(p.x), y: Math.round(p.y),
            button: 'none', pointerType: 'mouse'
        });
        await sleep(humanDelay(4, 18));
    }
    await sleep(humanDelay(20, 60));
    await cdpSend(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: Math.round(tx), y: Math.round(ty),
        button: 'left', clickCount: 1, pointerType: 'mouse'
    });
    await sleep(humanDelay(40, 120));
    await cdpSend(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: Math.round(tx), y: Math.round(ty),
        button: 'left', clickCount: 1, pointerType: 'mouse'
    });
    tabMousePos[tabId] = { x: tx, y: ty };
    return { success: true };
}

async function cdpType(tabId, text) {
    for (let i = 0; i < text.length; i++) {
        const ch = text[i], code = ch.charCodeAt(0);
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyDown', key: ch, code: `Key${ch.toUpperCase()}`,
            text: ch, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code
        });
        await sleep(humanDelay(2, 6));
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
            type: 'char', key: ch, code: `Key${ch.toUpperCase()}`,
            text: ch, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code
        });
        await sleep(humanDelay(2, 6));
        await cdpSend(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp', key: ch, code: `Key${ch.toUpperCase()}`,
            windowsVirtualKeyCode: code, nativeVirtualKeyCode: code
        });
        if (ch === ' ' || ch === '.' || ch === ',') await sleep(humanDelay(70, 220));
        else await sleep(humanDelay(20, 90));
        if (Math.random() < 0.05) await sleep(humanDelay(120, 450));
    }
    return { success: true };
}

async function cdpKeyPress(tabId, key, modifiers) {
    const map = {
        'Enter':13,'Tab':9,'Escape':27,'Backspace':8,'Delete':46,
        'ArrowUp':38,'ArrowDown':40,'ArrowLeft':37,'ArrowRight':39,'Space':32
    };
    const kc = map[key] || 0;
    await cdpSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown', key, code: key, modifiers: modifiers || 0,
        windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc
    });
    await sleep(humanDelay(25, 70));
    await cdpSend(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key, code: key, modifiers: modifiers || 0,
        windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc
    });
    return { success: true };
}

async function cdpScroll(tabId, x, y, deltaX, deltaY) {
    await cdpSend(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: Math.round(x), y: Math.round(y),
        deltaX, deltaY, pointerType: 'mouse'
    });
    return { success: true };
}

async function cdpNavigate(tabId, url) {
    await cdpSend(tabId, 'Page.navigate', { url });
    return { success: true };
}

async function cdpBatch(tabId, actions) {
    const results = [];
    for (const a of actions) {
        try {
            let r;
            switch (a.action) {
                case 'click': r = await cdpClick(tabId, a.x, a.y); break;
                case 'type': r = await cdpType(tabId, a.text); break;
                case 'keypress': r = await cdpKeyPress(tabId, a.key, a.modifiers || 0); break;
                case 'scroll': r = await cdpScroll(tabId, a.x||0, a.y||0, a.deltaX||0, a.deltaY||0); break;
                case 'navigate': r = await cdpNavigate(tabId, a.url); break;
                default: r = { success: false, error: `Unknown: ${a.action}` };
            }
            results.push(r);
        } catch (err) {
            results.push({ success: false, error: err.message });
        }
    }
    return { success: true, results };
}

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    attachedTabs.delete(tabId);
    delete tabMousePos[tabId];
});

// Cleanup on debugger detach (user clicked infobar X)
chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId) attachedTabs.delete(source.tabId);
});

// Forward debugger events to content script
chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId) {
        chrome.tabs.sendMessage(source.tabId, {
            type: 'debugger_event',
            method,
            params
        });
    }
});

// Aplica regras CSP em cada navegação baseado na configuração salva
chrome.webNavigation.onCommitted.addListener((details) => {
    // Ignora frames filhos, apenas aplica na página principal
    if (details.frameId === 0) {
        chrome.storage.local.get(['disableCSP'], (result) => {
            setupCSPRules(result.disableCSP !== false);
        });
    }
});

// Listener para mensagens internas (do content script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // --- WSActions CDP humanized actions (from CDP bridge) ---
    if (request && request.source === 'wsactions-cdp') {
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID' });
            return false;
        }
        (async () => {
            try {
                let result;
                switch (request.action) {
                    case 'click':
                        result = await withCDP(tabId, (id) => cdpClick(id, request.x, request.y));
                        break;
                    case 'type':
                        result = await withCDP(tabId, (id) => cdpType(id, request.text));
                        break;
                    case 'keypress':
                        result = await withCDP(tabId, (id) => cdpKeyPress(id, request.key, request.modifiers || 0));
                        break;
                    case 'scroll':
                        result = await withCDP(tabId, (id) => cdpScroll(id, request.x||0, request.y||0, request.deltaX||0, request.deltaY||0));
                        break;
                    case 'navigate':
                        result = await withCDP(tabId, (id) => cdpNavigate(id, request.url));
                        break;
                    case 'batch':
                        result = await withCDP(tabId, (id) => cdpBatch(id, request.actions));
                        break;
                    case 'attach':
                        result = await withCDP(tabId, async () => ({ success: true }));
                        break;
                    case 'detach':
                        await detachDebugger(tabId);
                        result = { success: true };
                        break;
                    case 'setMode':
                        cdpMode = request.mode === 'persistent' ? 'persistent' : 'transient';
                        result = { success: true, mode: cdpMode };
                        break;
                    case 'sendCommand':
                        // Raw CDP command passthrough
                        result = await withCDP(tabId, (id) => cdpSend(id, request.command, request.params));
                        result = { success: true, result };
                        break;
                    default:
                        result = { success: false, error: `Unknown CDP action: ${request.action}` };
                }
                sendResponse(result);
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    // --- Legacy debugger_command protocol (from content script permission system) ---
    if (request.type === 'debugger_command') {
        const tabId = sender.tab.id;

        if (request.action === 'attach') {
            attachDebugger(tabId)
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }

        if (request.action === 'detach') {
            detachDebugger(tabId)
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }

        if (request.action === 'sendCommand') {
            chrome.debugger.sendCommand(
                { tabId },
                request.command,
                request.params || {},
                (result) => {
                    if (chrome.runtime.lastError) {
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse({ success: true, result });
                    }
                }
            );
            return true;
        }
    }

    handleMessage(request, sendResponse);
    return true; // Permitir resposta assíncrona
});

// Listener para mensagens externas (opcional, se necessário)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    handleMessage(request, sendResponse);
    return true; // Permitir resposta assíncrona
});

chrome.runtime.onStartup.addListener(initializeProxy);
// Listener para alterações de configuração de proxy
chrome.storage.onChanged.addListener((changes) => {
    if (changes.proxyMode || changes.proxyIP || changes.proxyPort) {
        setProxyConfig();
    }
});

async function setupCSPRules(enable) {
    try {
        if (enable) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [1, 2],
                addRules: [
                    {
                        "id": 1,
                        "priority": 1,
                        "action": {
                            "type": "modifyHeaders",
                            "responseHeaders": [
                                {
                                    "header": "content-security-policy",
                                    "operation": "remove"
                                },
                                {
                                    "header": "content-security-policy-report-only",
                                    "operation": "remove"
                                }
                            ]
                        },
                        "condition": {
                            "urlFilter": "*",
                            "resourceTypes": ["main_frame", "sub_frame", "script"]
                        }
                    },
                    {
                        "id": 2,
                        "priority": 2,
                        "action": {
                            "type": "modifyHeaders",
                            "responseHeaders": [
                                {
                                    "header": "access-control-allow-origin",
                                    "operation": "set",
                                    "value": "*"
                                }
                            ]
                        },
                        "condition": {
                            "urlFilter": "||127.0.0.1:9514/*",
                            "resourceTypes": ["script"]
                        }
                    }
                ]
            });
            console.log("CSP rules enabled successfully");
        } else {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [1, 2],
                addRules: []
            });
            console.log("CSP rules disabled successfully");
        }
    } catch (error) {
        console.error("Error updating CSP rules:", error);
    }
}


// Função para definir o proxy com base no modo selecionado
function setProxyConfig() {
    chrome.storage.local.get(['proxyMode', 'proxyIP', 'proxyPort'], (prefs) => {
        if (prefs.proxyMode === 'auto') {
            // Modo automático
            chrome.proxy.settings.set({ value: { mode: 'auto_detect' } });
        } else if (prefs.proxyMode === 'http' || prefs.proxyMode === 'https') {
            // Modo manual (HTTP ou HTTPS)
            const scheme = prefs.proxyMode === 'http' ? 'http' : 'https';
            const proxyConfig = {
                mode: 'fixed_servers',
                rules: {
                    singleProxy: {
                        scheme: scheme,
                        host: prefs.proxyIP,
                        port: parseInt(prefs.proxyPort)
                    },
                    bypassList: ["<local>"]
                }
            };

            chrome.proxy.settings.set({ value: proxyConfig }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Erro ao configurar proxy:', chrome.runtime.lastError);
                } else {
                    console.log('Proxy configurado:', proxyConfig);
                }
            });
        }
    });
}

function initializeProxy() {
    setProxyConfig();
}

/**
 * Função para tratar diferentes tipos de ações de mensagens
 */
function handleMessage(request, sendResponse) {
    switch (request.action) {
        case 'open_page':
            handleOpenPage(request, sendResponse);
            break;
        case 'change_page':
            handleChangePage(request, sendResponse);
            break;
        case 'close_page':
            handleClosePage(request, sendResponse);
            break;
        case 'toggleCSP':
            handleToggleCSP(request, sendResponse);
            break;
        default:
            sendResponse({ status: 'error', message: 'Ação desconhecida' });
            break;
    }
}

/**
 * Função para lidar com a ação de toggle do CSP
 */
function handleToggleCSP(request, sendResponse) {
    chrome.storage.local.set({ disableCSP: request.value }, () => {
        setupCSPRules(request.value);
        sendResponse({ status: 'success', message: `CSP ${request.value ? 'desativado' : 'ativado'} com sucesso!` });
    });
}

/**
 * Função para lidar com a ação 'open_page'
 */
async function handleOpenPage(request, sendResponse) {
    if (request.url && isValidURL(request.url)) {
        try {
            const tab = await chrome.tabs.create({ url: request.url });
            sendResponse({ status: 'success', message: 'Página aberta com sucesso!', tabId: tab.id });
        } catch (error) {
            sendResponse({ status: 'error', message: error.message });
        }
    } else {
        sendResponse({ status: 'error', message: 'URL inválida ou não fornecida.' });
    }
}

/**
 * Função para lidar com a ação 'change_page'
 */
async function handleChangePage(request, sendResponse) {
    if (request.url && isValidURL(request.url)) {
        const targetURL = normalizeURL(request.url);
        try {
            const tabs = await chrome.tabs.query({});
            const existingTab = tabs.find(tab => normalizeURL(tab.url) === targetURL);

            if (existingTab) {
                // Ativar aba existente
                await chrome.tabs.update(existingTab.id, { active: true });
                await chrome.windows.update(existingTab.windowId, { focused: true });
                sendResponse({ status: 'success', message: `Aba existente ativada com sucesso!`, tabId: existingTab.id });
            } else if (request.tabId) {
                // Atualizar aba específica
                const tab = await chrome.tabs.update(request.tabId, { url: request.url });
                sendResponse({ status: 'success', message: 'Página atualizada com sucesso na aba específica!', tabId: tab.id });
            } else {
                // Atualizar aba ativa
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab) {
                    const tab = await chrome.tabs.update(activeTab.id, { url: request.url });
                    sendResponse({ status: 'success', message: 'Página atualizada com sucesso na aba ativa!', tabId: tab.id });
                } else {
                    sendResponse({ status: 'error', message: 'Nenhuma aba ativa encontrada.' });
                }
            }
        } catch (error) {
            sendResponse({ status: 'error', message: error.message });
        }
    } else {
        sendResponse({ status: 'error', message: 'URL inválida ou não fornecida.' });
    }
}

/**
 * Função para fechar uma aba específica.
 */
async function closeSpecificTab(tabId, sendResponse) {
    try {
        await chrome.tabs.remove(tabId);
        sendResponse({ status: 'success', message: `Aba com ID ${tabId} fechada com sucesso!` });
    } catch (error) {
        sendResponse({ status: 'error', message: error.message });
    }
}

/**
 * Função para fechar a aba ativa.
 */
async function closeActiveTab(sendResponse) {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
            await chrome.tabs.remove(activeTab.id);
            sendResponse({ status: 'success', message: 'Aba ativa fechada com sucesso!' });
        } else {
            sendResponse({ status: 'error', message: 'Nenhuma aba ativa encontrada.' });
        }
    } catch (error) {
        sendResponse({ status: 'error', message: error.message });
    }
}

/**
 * Função para lidar com a ação 'close_page'.
 */
function handleClosePage(request, sendResponse) {
    if (request.tabId == null) {
        request.tabId = undefined;
    }

    if (request.tabId) {
        closeSpecificTab(request.tabId, sendResponse);
    } else if (request.closeActiveTab) {
        closeActiveTab(sendResponse);
    } else {
        sendResponse({ status: 'error', message: 'Nenhuma opção de fechamento fornecida.' });
    }
}

/**
 * Função para validar URLs
 */
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Função para normalizar URLs para comparação
 */
function normalizeURL(url) {
    try {
        const parsedURL = new URL(url);
        parsedURL.hash = '';
        return parsedURL.toString();
    } catch (_) {
        return url;
    }
}

// Função para configurar o proxy com base nas preferências
function setProxyMode(mode, pacScriptUrl = null) {
    let proxyConfig = { mode };

    if (mode === 'pac_script' && pacScriptUrl) {
        proxyConfig.pacScript = { url: pacScriptUrl };
    }

    chrome.proxy.settings.set({ value: proxyConfig, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
            console.error('Erro ao configurar proxy:', chrome.runtime.lastError);
        } else {
            console.log('Proxy configurado:', proxyConfig);
        }
    });
}
