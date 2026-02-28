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

// =======================
// Utilitários de Humanização
// =======================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function gaussianRandom(mean, stddev) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stddev + mean;
}

function humanDelay(minMs = 30, maxMs = 120) {
    const delay = gaussianRandom((minMs + maxMs) / 2, (maxMs - minMs) / 4);
    return Math.max(minMs, Math.min(maxMs, delay));
}

function bezierPoints(x0, y0, x1, y1, steps = 10) {
    const points = [];
    // Control points com variação aleatória para parecer humano
    const cx1 = x0 + (x1 - x0) * 0.25 + (Math.random() - 0.5) * 50;
    const cy1 = y0 + (y1 - y0) * 0.1 + (Math.random() - 0.5) * 50;
    const cx2 = x0 + (x1 - x0) * 0.75 + (Math.random() - 0.5) * 50;
    const cy2 = y0 + (y1 - y0) * 0.9 + (Math.random() - 0.5) * 50;

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const px = invT ** 3 * x0 + 3 * invT ** 2 * t * cx1 + 3 * invT * t ** 2 * cx2 + t ** 3 * x1;
        const py = invT ** 3 * y0 + 3 * invT ** 2 * t * cy1 + 3 * invT * t ** 2 * cy2 + t ** 3 * y1;
        points.push({ x: Math.round(px), y: Math.round(py) });
    }
    return points;
}

// =======================
// Gerenciamento do Debugger (CDP)
// =======================

let attachedTabs = new Set();
let cdpMode = 'transient'; // 'transient' ou 'persistent'

async function attachDebugger(tabId) {
    if (attachedTabs.has(tabId)) return;

    try {
        await chrome.debugger.attach({ tabId }, '1.3');
        attachedTabs.add(tabId);
        console.log(`Debugger attached to tab ${tabId}`);
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
        console.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
        console.error('Error detaching debugger:', error);
        throw error;
    }
}

function sendCDPCommand(tabId, method, params = {}) {
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Wrapper transient: attach → execute fn → sleep(50) → detach
 * No modo persistent, não faz detach.
 */
async function withCDP(tabId, fn) {
    const wasAttached = attachedTabs.has(tabId);
    if (!wasAttached) {
        await attachDebugger(tabId);
    }
    try {
        const result = await fn(tabId);
        return result;
    } finally {
        if (!wasAttached && cdpMode === 'transient') {
            await sleep(50);
            await detachDebugger(tabId);
        }
    }
}

// =======================
// Ações Humanizadas via CDP
// =======================

async function doClick(tabId, x, y) {
    return withCDP(tabId, async () => {
        // Movimento via curva Bezier a partir de posição aleatória
        const startX = Math.random() * 200;
        const startY = Math.random() * 200;
        const offsetX = (Math.random() - 0.5) * 4;
        const offsetY = (Math.random() - 0.5) * 4;
        const targetX = x + offsetX;
        const targetY = y + offsetY;

        const points = bezierPoints(startX, startY, targetX, targetY, 8);
        for (const pt of points) {
            await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: pt.x,
                y: pt.y
            });
            await sleep(humanDelay(5, 20));
        }

        // Click com delays humanizados
        await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: targetX,
            y: targetY,
            button: 'left',
            clickCount: 1
        });
        await sleep(humanDelay(30, 80));
        await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: targetX,
            y: targetY,
            button: 'left',
            clickCount: 1
        });
    });
}

async function doType(tabId, text) {
    return withCDP(tabId, async () => {
        for (const char of text) {
            await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'keyDown',
                text: char,
                key: char,
                code: `Key${char.toUpperCase()}`,
                unmodifiedText: char
            });
            await sleep(humanDelay(20, 50));
            await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
                type: 'keyUp',
                key: char,
                code: `Key${char.toUpperCase()}`
            });
            await sleep(humanDelay(40, 150));
        }
    });
}

async function doKeyPress(tabId, key, modifiers = 0) {
    return withCDP(tabId, async () => {
        const keyMap = {
            'Enter': { code: 'Enter', keyCode: 13, text: '\r' },
            'Tab': { code: 'Tab', keyCode: 9, text: '' },
            'Escape': { code: 'Escape', keyCode: 27, text: '' },
            'Backspace': { code: 'Backspace', keyCode: 8, text: '' },
            'ArrowUp': { code: 'ArrowUp', keyCode: 38, text: '' },
            'ArrowDown': { code: 'ArrowDown', keyCode: 40, text: '' },
            'ArrowLeft': { code: 'ArrowLeft', keyCode: 37, text: '' },
            'ArrowRight': { code: 'ArrowRight', keyCode: 39, text: '' },
            'Delete': { code: 'Delete', keyCode: 46, text: '' },
            'Home': { code: 'Home', keyCode: 36, text: '' },
            'End': { code: 'End', keyCode: 35, text: '' },
            'PageUp': { code: 'PageUp', keyCode: 33, text: '' },
            'PageDown': { code: 'PageDown', keyCode: 34, text: '' },
        };

        const mapped = keyMap[key] || { code: key, keyCode: 0, text: '' };

        await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
            text: mapped.text,
            modifiers
        });
        await sleep(humanDelay(30, 80));
        await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: key,
            code: mapped.code,
            windowsVirtualKeyCode: mapped.keyCode,
            nativeVirtualKeyCode: mapped.keyCode,
            modifiers
        });
    });
}

async function doScroll(tabId, x, y, deltaX, deltaY) {
    return withCDP(tabId, async () => {
        await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x,
            y,
            deltaX,
            deltaY
        });
    });
}

async function doNavigate(tabId, url) {
    return withCDP(tabId, async () => {
        return await sendCDPCommand(tabId, 'Page.navigate', { url });
    });
}

/**
 * Executa múltiplas ações em uma única sessão attach/detach (batch).
 * Cada ação: { action: 'click'|'type'|'keypress'|'scroll'|'navigate', ...params }
 */
async function doBatch(tabId, actions) {
    return withCDP(tabId, async () => {
        const results = [];
        for (const action of actions) {
            let result;
            switch (action.action) {
                case 'click':
                    result = await doClickInner(tabId, action.x, action.y);
                    break;
                case 'type':
                    result = await doTypeInner(tabId, action.text);
                    break;
                case 'keypress':
                    result = await doKeyPressInner(tabId, action.key, action.modifiers || 0);
                    break;
                case 'scroll':
                    result = await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
                        type: 'mouseWheel',
                        x: action.x, y: action.y,
                        deltaX: action.deltaX, deltaY: action.deltaY
                    });
                    break;
                case 'navigate':
                    result = await sendCDPCommand(tabId, 'Page.navigate', { url: action.url });
                    break;
                default:
                    result = { error: `Unknown action: ${action.action}` };
            }
            results.push(result);
            if (action.delay) await sleep(action.delay);
        }
        return results;
    });
}

// Versões internas (sem withCDP) para uso dentro de batch
async function doClickInner(tabId, x, y) {
    const startX = Math.random() * 200;
    const startY = Math.random() * 200;
    const offsetX = (Math.random() - 0.5) * 4;
    const offsetY = (Math.random() - 0.5) * 4;
    const targetX = x + offsetX;
    const targetY = y + offsetY;

    const points = bezierPoints(startX, startY, targetX, targetY, 8);
    for (const pt of points) {
        await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: pt.x, y: pt.y
        });
        await sleep(humanDelay(5, 20));
    }

    await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: targetX, y: targetY, button: 'left', clickCount: 1
    });
    await sleep(humanDelay(30, 80));
    await sendCDPCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: targetX, y: targetY, button: 'left', clickCount: 1
    });
}

async function doTypeInner(tabId, text) {
    for (const char of text) {
        await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyDown', text: char, key: char,
            code: `Key${char.toUpperCase()}`, unmodifiedText: char
        });
        await sleep(humanDelay(20, 50));
        await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
            type: 'keyUp', key: char, code: `Key${char.toUpperCase()}`
        });
        await sleep(humanDelay(40, 150));
    }
}

async function doKeyPressInner(tabId, key, modifiers = 0) {
    const keyMap = {
        'Enter': { code: 'Enter', keyCode: 13, text: '\r' },
        'Tab': { code: 'Tab', keyCode: 9, text: '' },
        'Escape': { code: 'Escape', keyCode: 27, text: '' },
        'Backspace': { code: 'Backspace', keyCode: 8, text: '' },
        'ArrowUp': { code: 'ArrowUp', keyCode: 38, text: '' },
        'ArrowDown': { code: 'ArrowDown', keyCode: 40, text: '' },
        'ArrowLeft': { code: 'ArrowLeft', keyCode: 37, text: '' },
        'ArrowRight': { code: 'ArrowRight', keyCode: 39, text: '' },
    };
    const mapped = keyMap[key] || { code: key, keyCode: 0, text: '' };

    await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown', key, code: mapped.code,
        windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode,
        text: mapped.text, modifiers
    });
    await sleep(humanDelay(30, 80));
    await sendCDPCommand(tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key, code: mapped.code,
        windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode, modifiers
    });
}

// Listener para comandos do debugger
chrome.debugger.onEvent.addListener((source, method, params) => {
    // Encaminha eventos do debugger para o content script
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
    // Tratamento específico para comandos do debugger
    if (request.type === 'debugger_command') {
        const tabId = sender.tab ? sender.tab.id : request.tabId;

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
            sendCDPCommand(tabId, request.command, request.params || {})
                .then(result => sendResponse({ success: true, result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
        }

        if (request.action === 'setMode') {
            cdpMode = request.mode === 'persistent' ? 'persistent' : 'transient';
            sendResponse({ success: true, mode: cdpMode });
            return true;
        }

        if (request.action === 'getMode') {
            sendResponse({ success: true, mode: cdpMode });
            return true;
        }
    }

    // Tratamento para ações CDP humanizadas
    if (request.type === 'cdp_action') {
        const tabId = sender.tab ? sender.tab.id : request.tabId;

        const handleAction = async () => {
            try {
                let result;
                switch (request.action) {
                    case 'click':
                        result = await doClick(tabId, request.x, request.y);
                        break;
                    case 'type':
                        result = await doType(tabId, request.text);
                        break;
                    case 'keypress':
                        result = await doKeyPress(tabId, request.key, request.modifiers || 0);
                        break;
                    case 'scroll':
                        result = await doScroll(tabId, request.x, request.y, request.deltaX, request.deltaY);
                        break;
                    case 'navigate':
                        result = await doNavigate(tabId, request.url);
                        break;
                    case 'batch':
                        result = await doBatch(tabId, request.actions);
                        break;
                    default:
                        return { success: false, error: `Unknown CDP action: ${request.action}` };
                }
                return { success: true, result };
            } catch (error) {
                return { success: false, error: error.message };
            }
        };

        handleAction().then(sendResponse);
        return true;
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
