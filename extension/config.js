/**
 * Configurações da Extensão Lovable Infinity
 * Sistema de Licenças Vinculadas ao Dispositivo (Device Fingerprint)
 */
(function(){ var n=function(){}; if(typeof console!=='undefined'){ console.log=n; console.info=n; console.debug=n; console.warn=n; console.error=n; } })();
const CONFIG = {
    REQUIRE_LICENSE: true,
    // Use a mesma databaseURL do firebase-config.js (seu novo projeto Firebase)
    FIREBASE_URL: 'https://lovable2-e6f7f-default-rtdb.firebaseio.com',
    CACHE_DURATION: 5 * 60 * 1000,
    // Chave de desenvolvimento: válida por 30 dias, não usa Firebase (só para testar a extensão)
    // Em produção, remova ou altere esta chave.
    DEV_LICENSE_KEY: 'MLI-DEV-30DIAS-TESTE',
    DEV_LICENSE_DAYS: 30,
    // URL da API do melhorador de prompt (Vercel)
    IMPROVE_PROMPT_ENDPOINT: 'https://lovable-infinity-api.vercel.app/api/improvePrompt'
};

let licenseCache = {};
let cacheTimestamp = 0;

/**
 * Gerar fingerprint único do dispositivo
 * Combina: CPU Info + Hostname + User Agent
 */
async function generateDeviceFingerprint() {
    try {
        let fingerprint = '';
        
        // 1. Tentar obter informações da CPU
        try {
            const cpuInfo = await navigator.deviceMemory || 'unknown';
            fingerprint += 'cpu_' + cpuInfo + '_';
        } catch (e) {
            fingerprint += 'cpu_unknown_';
        }
        
        // 2. Usar User Agent (contém informações do SO e navegador)
        const userAgent = navigator.userAgent;
        fingerprint += 'ua_' + userAgent.substring(0, 100).replace(/[^a-zA-Z0-9]/g, '') + '_';
        
        // 3. Usar Screen Resolution
        const screen = window.screen;
        fingerprint += 'screen_' + screen.width + 'x' + screen.height + '_';
        
        // 4. Usar Timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        fingerprint += 'tz_' + timezone.replace(/[^a-zA-Z0-9]/g, '') + '_';
        
        // 5. Usar Language
        const language = navigator.language;
        fingerprint += 'lang_' + language.replace(/[^a-zA-Z0-9]/g, '');
        
        // Gerar hash do fingerprint
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
        // Fallback: hash simples
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
 * Valida a chave de licença usando Firebase
 * SISTEMA NOVO: Vincula a licença ao dispositivo permanentemente
 * 
 * Fluxo:
 * 1. Se licença não existe → Erro
 * 2. Se licença não está ativa → Erro
 * 3. Se licença expirou → Erro
 * 4. Se já foi ativada em OUTRO dispositivo → Erro
 * 5. Se já foi ativada NESTE dispositivo → Acesso permanente ✅
 * 6. Se é primeira ativação → Vincular ao dispositivo ✅
 */
async function validateKeySecure(key) {
    if (!CONFIG.REQUIRE_LICENSE) {
        return { valid: true, message: 'Acesso liberado (verificação desabilitada)' };
    }

    const cleanKey = key.trim();

    // Chave de desenvolvimento: só aceita quando Firebase NÃO está configurado (evita uso em produção)
    const firebaseConfigured = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.trim() !== '';
    if (!firebaseConfigured && CONFIG.DEV_LICENSE_KEY && cleanKey === CONFIG.DEV_LICENSE_KEY) {
        const stored = await chrome.storage.local.get(['devLicenseFirstUsed']);
        const now = new Date();
        let firstUsed = stored.devLicenseFirstUsed ? new Date(stored.devLicenseFirstUsed) : null;
        if (!firstUsed) {
            await chrome.storage.local.set({ devLicenseFirstUsed: now.toISOString() });
            firstUsed = now;
        }
        const daysElapsed = (now - firstUsed) / (24 * 60 * 60 * 1000);
        if (daysElapsed > CONFIG.DEV_LICENSE_DAYS) {
            return { valid: false, message: 'Chave de desenvolvimento expirada (' + CONFIG.DEV_LICENSE_DAYS + ' dias). Use uma licença real ou gere outra no admin.' };
        }
        const daysLeft = Math.ceil(CONFIG.DEV_LICENSE_DAYS - daysElapsed);
        return { valid: true, message: 'Modo desenvolvimento (válido por ' + daysLeft + ' dias).', license: {} };
    }

    const deviceFingerprint = await getDeviceFingerprint();

    try {
        const cloudLicense = await getLicenseFromCloud(cleanKey);

        if (!cloudLicense) {
            return { valid: false, message: 'Licença não encontrada' };
        }

        if (!cloudLicense.active) {
            return { valid: false, message: 'Licença inativa' };
        }

        const expiryDate = new Date(cloudLicense.expiryDate);
        if (expiryDate < new Date()) {
            return { valid: false, message: 'Licença expirada' };
        }

        // ============================================
        // UMA SESSÃO ATIVA POR LICENÇA (evitar compartilhamento)
        // ============================================
        const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 min sem ping = sessão liberada
        const activeSession = cloudLicense.activeSession;
        if (activeSession && activeSession.deviceFingerprint !== deviceFingerprint && activeSession.lastPingAt) {
            const lastPing = new Date(activeSession.lastPingAt).getTime();
            if (Date.now() - lastPing < SESSION_TIMEOUT_MS) {
                return {
                    valid: false,
                    message: 'Esta licença está em uso em outro dispositivo no momento. Tente novamente mais tarde.'
                };
            }
        }

        // ============================================
        // VALIDAÇÃO POR DEVICE FINGERPRINT
        // ============================================

        // Se a licença já foi ativada em outro dispositivo
        if (cloudLicense.activatedDeviceFingerprint && cloudLicense.activatedDeviceFingerprint !== deviceFingerprint) {
            return { 
                valid: false, 
                message: 'Esta licença já foi ativada em outro computador. Uma licença só pode ser usada em um dispositivo por vez.' 
            };
        }

        // Se a licença já foi ativada NESTE dispositivo, permitir acesso e registrar sessão ativa
        if (cloudLicense.activatedDeviceFingerprint === deviceFingerprint) {
            const sessionUpdate = { activeSession: { deviceFingerprint: deviceFingerprint, lastPingAt: new Date().toISOString() } };
            await updateLicenseInCloud(cleanKey, sessionUpdate);
            return { 
                valid: true, 
                message: 'Licença ativada neste dispositivo. Acesso permanente.', 
                license: cloudLicense 
            };
        }

        const newUses = (cloudLicense.uses || 0) + 1;
        const updateData = {
            activatedDeviceFingerprint: deviceFingerprint,
            activatedDate: new Date().toISOString(),
            uses: newUses,
            lastAccessDate: new Date().toISOString(),
            activeSession: { deviceFingerprint: deviceFingerprint, lastPingAt: new Date().toISOString() }
        };

        const updateResult = await updateLicenseInCloud(cleanKey, updateData);

        if (!updateResult) {
            return { valid: false, message: 'Erro ao ativar licença. Tente novamente.' };
        }

        return { 
            valid: true, 
            message: 'Licença ativada e vinculada a este dispositivo! Você poderá usar indefinidamente.', 
            license: cloudLicense 
        };

    } catch (error) {
        return { valid: false, message: 'Erro ao validar licença.' };
    }
}

async function verifyIntegrity() {
    try {
        const response = await fetch(chrome.runtime.getURL('config.js'));
        const code = await response.text();
        const hash = await hashString(code);
        
        const stored = await chrome.storage.local.get('codeHash');
        if (stored.codeHash && stored.codeHash !== hash) {
            console.warn('[Config] Código foi modificado!');
            return false;
        }
        
        await chrome.storage.local.set({ codeHash: hash });
        return true;
    } catch (error) {
        console.error('[Config] Erro ao verificar integridade:', error);
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
        console.error('[Config] Erro ao obter chave armazenada:', error);
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
