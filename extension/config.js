/**
 * Configurações da Extensão Lovable Infinity
 * Sistema de Licenças Vinculadas ao Dispositivo (Device Fingerprint)
 */
(function(){ var n=function(){}; if(typeof console!=='undefined'){ console.log=n; console.info=n; console.debug=n; console.warn=n; console.error=n; } })();

const CONFIG = {
    REQUIRE_LICENSE: true,
    FIREBASE_URL: 'https://lovable2-e6f7f-default-rtdb.firebaseio.com',
    CACHE_DURATION: 5 * 60 * 1000,
    // URL da API do melhorador de prompt SEGURO (Vercel) — exige JWT
    IMPROVE_PROMPT_ENDPOINT: 'https://lovable-infinity-api.vercel.app/api/improvePromptSecure',
    // URL da API de validação de licença (Vercel) - usa Firebase Admin SDK
    VALIDATE_LICENSE_ENDPOINT: 'https://lovable-infinity-api.vercel.app/api/validateLicense',
    // Endpoints JWT (sessão segura)
    VERIFY_SESSION_ENDPOINT: 'https://lovable-infinity-api.vercel.app/api/verifySession',
    REFRESH_SESSION_ENDPOINT: 'https://lovable-infinity-api.vercel.app/api/refreshSession'
};

let licenseCache = {};
let cacheTimestamp = 0;

/**
 * Gerar fingerprint único do dispositivo
 */
async function generateDeviceFingerprint() {
    try {
        let fingerprint = '';
        
        try {
            const cpuInfo = await navigator.deviceMemory || 'unknown';
            fingerprint += 'cpu_' + cpuInfo + '_';
        } catch (e) {
            fingerprint += 'cpu_unknown_';
        }
        
        const userAgent = navigator.userAgent;
        fingerprint += 'ua_' + userAgent.substring(0, 100).replace(/[^a-zA-Z0-9]/g, '') + '_';
        
        const screen = window.screen;
        fingerprint += 'screen_' + screen.width + 'x' + screen.height + '_';
        
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        fingerprint += 'tz_' + timezone.replace(/[^a-zA-Z0-9]/g, '') + '_';
        
        const language = navigator.language;
        fingerprint += 'lang_' + language.replace(/[^a-zA-Z0-9]/g, '');
        
        const hash = await hashString(fingerprint);
        return hash;
    } catch (error) {
        return 'UNKNOWN_DEVICE_' + Date.now();
    }
}

/**
 * Gerar hash SHA-256 de uma string
 */
async function hashString(str) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.substring(0, 32);
    } catch (error) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}

/**
 * Obter ou gerar ID do dispositivo
 */
async function getDeviceFingerprint() {
    try {
        const stored = await chrome.storage.local.get('deviceFingerprint');
        if (stored.deviceFingerprint) return stored.deviceFingerprint;
        const fingerprint = await generateDeviceFingerprint();
        await chrome.storage.local.set({ deviceFingerprint: fingerprint });
        return fingerprint;
    } catch (error) {
        return 'UNKNOWN_DEVICE';
    }
}

/**
 * Valida a chave de licença usando a API Vercel (Firebase Admin SDK)
 */
async function validateKeySecure(key) {
    if (!CONFIG.REQUIRE_LICENSE) {
        return { valid: true, message: 'Acesso liberado (verificação desabilitada)' };
    }

    const cleanKey = key.trim();
    const deviceFingerprint = await getDeviceFingerprint();

    try {
        // Usar API Vercel que tem Firebase Admin SDK (com permissão de escrita)
        const response = await fetch(CONFIG.VALIDATE_LICENSE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                licenseKey: cleanKey,
                deviceFingerprint: deviceFingerprint
            })
        });

        const result = await response.json();

        // A API já retorna no formato { valid, message, license?, userData?, sessionToken?, refreshToken?, expiresAt? }
        return {
            valid: result.valid,
            message: result.message,
            license: result.license || null,
            userData: result.userData || null,
            // JWT tokens (se o servidor retornar)
            sessionToken: result.sessionToken || null,
            refreshToken: result.refreshToken || null,
            sessionExpiresAt: result.expiresAt || null
        };

    } catch (error) {
        return { valid: false, message: 'Erro de conexão. Verifique sua internet e tente novamente.' };
    }
}

async function verifyIntegrity() {
    try {
        const response = await fetch(chrome.runtime.getURL('config.js'));
        const code = await response.text();
        const hash = await hashString(code);
        
        const stored = await chrome.storage.local.get('codeHash');
        if (stored.codeHash && stored.codeHash !== hash) {
            return false;
        }
        
        await chrome.storage.local.set({ codeHash: hash });
        return true;
    } catch (error) {
        return true;
    }
}

async function isAuthenticated() {
    try {
        const storage = await chrome.storage.local.get(['isAuthenticated', 'licenseKey']);
        return storage.isAuthenticated === true && storage.licenseKey;
    } catch (error) {
        return false;
    }
}

async function getStoredLicenseKey() {
    try {
        const storage = await chrome.storage.local.get('licenseKey');
        return storage.licenseKey || null;
    } catch (error) {
        return null;
    }
}

async function clearAuthentication() {
    try {
        await chrome.storage.local.remove(['licenseKey', 'isAuthenticated', 'authTimestamp', 'userData', 'deviceFingerprint', 'firebaseDatabaseURL']);
    } catch (error) {}
}

async function initializeConfig() {
    await verifyIntegrity();
    return await isAuthenticated();
}

// ============================================
// SESSÃO JWT (camada de segurança extra)
// Se falhar, a extensão continua funcionando normalmente.
// ============================================

/**
 * Verifica a sessão JWT com o servidor
 */
async function verifySessionWithServer() {
    try {
        const stored = await chrome.storage.local.get(['sessionToken']);
        if (!stored.sessionToken) return { valid: false, message: 'Sem sessão JWT.' };

        const response = await fetch(CONFIG.VERIFY_SESSION_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + stored.sessionToken
            }
        });

        const result = await response.json();
        return result;
    } catch (error) {
        return { valid: false, message: 'Erro de conexão.' };
    }
}

/**
 * Tenta renovar a sessão usando o refresh token
 */
async function tryRefreshSession() {
    try {
        const stored = await chrome.storage.local.get(['refreshToken', 'deviceFingerprint']);
        if (!stored.refreshToken) return false;

        const response = await fetch(CONFIG.REFRESH_SESSION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                refreshToken: stored.refreshToken,
                deviceFingerprint: stored.deviceFingerprint || ''
            })
        });

        const result = await response.json();
        if (result.valid && result.sessionToken) {
            await chrome.storage.local.set({
                sessionToken: result.sessionToken,
                refreshToken: result.refreshToken,
                sessionExpiresAt: result.expiresAt
            });
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Obter token de sessão atual (verifica expiração e tenta renovar)
 */
async function getSessionToken() {
    const stored = await chrome.storage.local.get(['sessionToken', 'sessionExpiresAt']);
    if (!stored.sessionToken) return null;

    const now = Date.now();
    if (stored.sessionExpiresAt && (stored.sessionExpiresAt - now) < 5 * 60 * 1000) {
        const refreshed = await tryRefreshSession();
        if (refreshed) {
            const updated = await chrome.storage.local.get(['sessionToken']);
            return updated.sessionToken;
        }
        return null;
    }

    return stored.sessionToken;
}
