// Background service worker

console.log('[Background] Service worker iniciado');

const LOVABLE_ORIGIN = 'https://lovable.dev';

function isLovableTab(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        return u.origin === LOVABLE_ORIGIN;
    } catch (_) {
        return false;
    }
}

/** Habilita o side panel só em abas do Lovable; desabilita nas demais. */
async function updateSidePanelForTab(tabId, url) {
    if (tabId == null) return;
    try {
        const enabled = isLovableTab(url);
        await chrome.sidePanel.setOptions({ tabId, enabled });
        console.log('[Background] Side panel', enabled ? 'habilitado' : 'desabilitado', 'para tab', tabId);
    } catch (err) {
        console.warn('[Background] setOptions para tab', tabId, err);
    }
}

// Abrir Side Panel ao clicar no ícone (só funciona quando habilitado para a aba)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.warn('[Background] setPanelBehavior:', err));

async function syncSidePanelForAllTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.id && tab.url) await updateSidePanelForTab(tab.id, tab.url);
    }
}

// Ao instalar/atualizar: aplicar regra para todas as abas atuais e alarme de sessão se já tiver licença
chrome.runtime.onInstalled.addListener(async () => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.warn('[Background] setPanelBehavior onInstalled:', err));
    await syncSidePanelForAllTabs();
    chrome.storage.local.get(['licenseKey', 'deviceFingerprint', 'firebaseDatabaseURL'], (d) => {
        if (d.licenseKey && d.deviceFingerprint && d.firebaseDatabaseURL) startSessionPingAlarm();
    });
});

// Ao iniciar o navegador: garantir que abas já abertas respeitem a regra
chrome.runtime.onStartup.addListener(() => {
    syncSidePanelForAllTabs();
});

// Quando a URL da aba muda (navegação, refresh)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url !== undefined) {
        updateSidePanelForTab(tabId, changeInfo.url);
    } else if (changeInfo.status === 'loading' && tab.url) {
        updateSidePanelForTab(tabId, tab.url);
    }
});

// Quando o usuário troca de aba
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        updateSidePanelForTab(tab.id, tab.url);
    } catch (_) { /* aba fechada */ }
});

// ========== UMA SESSÃO ATIVA POR LICENÇA (heartbeat) ==========
const SESSION_PING_ALARM = 'sessionPing';
const SESSION_PING_MINUTES = 5;

function startSessionPingAlarm() {
    chrome.alarms.create(SESSION_PING_ALARM, { periodInMinutes: SESSION_PING_MINUTES });
    console.log('[Background] Alarm sessionPing criado (a cada', SESSION_PING_MINUTES, 'min)');
}

function stopSessionPingAlarm() {
    chrome.alarms.clear(SESSION_PING_ALARM);
    console.log('[Background] Alarm sessionPing removido');
}

async function pingLicenseSession(licenseKey, deviceFingerprint, firebaseDatabaseURL) {
    if (!licenseKey || !deviceFingerprint || !firebaseDatabaseURL) return;
    const url = firebaseDatabaseURL.replace(/\/$/, '') + '/licenses/' + encodeURIComponent(licenseKey) + '.json';
    try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.key) return;
        const updated = { ...data, activeSession: { deviceFingerprint: deviceFingerprint, lastPingAt: new Date().toISOString() }, timestamp: new Date().toISOString() };
        const putRes = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        if (putRes.ok) console.log('[Background] Sessão ping OK');
    } catch (e) {
        console.warn('[Background] Ping sessão:', e);
    }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.licenseKey) {
        if (changes.licenseKey.newValue) {
            chrome.storage.local.get(['deviceFingerprint', 'firebaseDatabaseURL'], (d) => {
                if (d.deviceFingerprint && d.firebaseDatabaseURL) startSessionPingAlarm();
            });
        } else {
            stopSessionPingAlarm();
        }
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SESSION_PING_ALARM) return;
    chrome.storage.local.get(['licenseKey', 'deviceFingerprint', 'firebaseDatabaseURL'], (d) => {
        if (d.licenseKey && d.deviceFingerprint && d.firebaseDatabaseURL) {
            pingLicenseSession(d.licenseKey, d.deviceFingerprint, d.firebaseDatabaseURL);
        }
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(['licenseKey', 'deviceFingerprint', 'firebaseDatabaseURL'], (d) => {
        if (d.licenseKey && d.deviceFingerprint && d.firebaseDatabaseURL) startSessionPingAlarm();
    });
});

// Função auxiliar para injetar o content script se necessário
async function ensureContentScriptInjected(tabId) {
    try {
        // Tenta enviar uma mensagem de "ping" simples
        await chrome.tabs.sendMessage(tabId, { action: "ping" });
        console.log('[Background] Content script já está injetado na tab', tabId);
        return true; // Já está lá
    } catch (e) {
        // Se falhar (receiving end does not exist), injetamos
        console.log("[Background] Injetando Content Script manualmente na tab", tabId);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ["content.js"]
            });
            console.log('[Background] Content script injetado com sucesso');
            return true;
        } catch (err) {
            console.error("[Background] Falha ao injetar script:", err);
            return false;
        }
    }
}

// Fallback: ao clicar no ícone, abrir o Side Panel explicitamente (útil se setPanelBehavior falhar)
chrome.action.onClicked.addListener((tab) => {
    if (tab?.windowId != null) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => console.warn('[Background] sidePanel.open:', err));
    }
});

// 1. Interceptor de Token via webRequest (Manifest V3)
// Usar chrome.webRequest para interceptar requisições
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        console.log('[Background] Interceptando requisição:', details.url);
        
        const authHeader = details.requestHeaders.find(
            (header) => header.name.toLowerCase() === 'authorization'
        );

        if (authHeader && authHeader.value) {
            const token = authHeader.value.replace('Bearer ', '').trim();
            if (token.length > 20) {
                console.log('[Background] Token capturado:', token.substring(0, 20) + '...');
                chrome.storage.local.set({ lovable_token: token });

                // Tenta avisar abas ativas do lovable sem quebrar se falhar
                chrome.tabs.query({ url: "https://lovable.dev/*" }, (tabs) => {
                    tabs.forEach(t => {
                        chrome.tabs.sendMessage(t.id, { action: "tokenFound", token: token })
                            .catch(() => { /* Aba fechada ou sem script, ignora */ });
                    });
                });
            }
        }
    },
    { urls: ["https://api.lovable.dev/*"] },
    ["requestHeaders"]
);

// 2. Manipulador de Envio para Webhook (CORS Proxy)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Responde ao ping
    if (request.action === "ping") {
        console.log('[Background] Ping recebido');
        sendResponse("pong");
        return;
    }

    if (request.action === "sendWebhook") {

        fetch(request.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(request.payload)
        })
            .then(async (response) => {
                const text = await response.text();
                let json = {};
                try { json = JSON.parse(text); } catch (e) { }

                if (response.ok) {
                    sendResponse({ success: true, data: json, text: text });
                } else {
                    const errorMsg = json.message || response.statusText || "Erro desconhecido";
                    sendResponse({
                        success: false,
                        error: `Erro ${response.status}: ${errorMsg}`
                    });
                }
            })
            .catch((error) => {
                sendResponse({ success: false, error: "Falha na conexão: " + error.message });
            });

        return true;
    }

    if (request.action === "toggleChatMode") {
        const { projectId, token, enabled } = request;
        fetch(`https://api.lovable.dev/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ chat_mode_enabled: enabled })
        })
            .then(async (response) => {
                const text = await response.text();
                if (response.ok) {
                    sendResponse({ success: true, text });
                } else {
                    sendResponse({ success: false, error: `Erro Lovable ${response.status}` });
                }
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (request.action === "sendWebhookWithFile") {
        (async () => {
            try {
                let body;
                let headers = {};

                if (request.file) {
                    // Convert Data URL to Blob
                    const res = await fetch(request.file.data);
                    const blob = await res.blob();

                    const formData = new FormData();
                    // Append file
                    formData.append('file', blob, request.file.name);

                    // Append other payload data
                    for (const key in request.payload) {
                        formData.append(key, request.payload[key]);
                    }

                    body = formData;
                    // Note: When using FormData, fetch automatically sets Content-Type to multipart/form-data with boundary
                    // DO NOT set Content-Type header manually here.
                } else {
                    // Fallback to JSON if no file, though popup handles this separation
                    headers["Content-Type"] = "application/json";
                    body = JSON.stringify(request.payload);
                }

                const response = await fetch(request.url, {
                    method: "POST",
                    headers: headers,
                    body: body
                });

                const text = await response.text();
                let json = {};
                try { json = JSON.parse(text); } catch (e) { }

                if (response.ok) {
                    sendResponse({ success: true, data: json, text: text });
                } else {
                    const errorMsg = json.message || response.statusText || "Erro desconhecido";
                    sendResponse({
                        success: false,
                        error: `Erro ${response.status}: ${errorMsg}`
                    });
                }
            } catch (error) {
                console.error('[Background] Erro ao enviar webhook:', error);
                sendResponse({ success: false, error: "Falha ao enviar: " + error.message });
            }
        })();
        return true;
    }
});
