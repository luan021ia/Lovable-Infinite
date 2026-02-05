/**
 * Configuração do Firebase - Lovable Infinity
 * Sistema de Licenças na Nuvem
 */

const FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    databaseURL: "https://lovable2-e6f7f-default-rtdb.firebaseio.com",
    projectId: "lovable2-e6f7f",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let firebaseApp = null;
let firebaseDb = null;
let firebaseInitialized = false;

/**
 * Inicializar Firebase - Usando Realtime Database REST API
 */
async function initializeFirebase() {
    return new Promise((resolve) => {
        if (firebaseInitialized) {
            resolve(true);
            return;
        }

        if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL === "") {
            resolve(false);
            return;
        }

        try {
            firebaseInitialized = true;
            resolve(true);
        } catch (error) {
            resolve(false);
        }
    });
}

/**
 * Fazer requisição ao Firebase Realtime Database
 */
async function firebaseRequest(path, method = 'GET', data = null) {
    if (!FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase não configurado. Preencha FIREBASE_CONFIG em firebase-config.js');
    }

    try {
        const url = `${FIREBASE_CONFIG.databaseURL}${path}.json`;

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        throw error;
    }
}

async function testFirebaseConnection() {
    try {
        await firebaseRequest('/licenses');
        return { success: true, message: 'Conexão com Firebase OK' };
    } catch (error) {
        return { success: false, message: 'Erro de conexão.' };
    }
}

/**
 * Salvar licença na nuvem
 */
async function saveLicenseToCloud(license) {
    try {
        const path = `/licenses/${license.key}`;
        const data = {
            key: license.key,
            userName: license.userName || '',
            userPhone: license.userPhone || '',
            created: license.created,
            expiryDate: license.expiryDate,
            active: license.active,
            activated: license.activated || false,
            activatedDate: license.activatedDate || null,
            maxUses: license.maxUses || null,
            uses: license.uses || 0,
            activatedDevices: license.activatedDevices || [],
            timestamp: new Date().toISOString()
        };
        await firebaseRequest(path, 'PUT', data);
        return true;
    } catch (error) {
        return false;
    }
}

async function getLicenseFromCloud(key) {
    try {
        const path = `/licenses/${key}`;
        const result = await firebaseRequest(path);
        if (result && result.key) return result;
        return null;
    } catch (error) {
        return null;
    }
}

async function getAllLicensesFromCloud() {
    try {
        const result = await firebaseRequest('/licenses');
        if (result && typeof result === 'object') {
            return Object.values(result).filter(l => l && l.key);
        }
        return [];
    } catch (error) {
        return [];
    }
}

async function updateLicenseInCloud(key, updates) {
    try {
        const path = `/licenses/${key}`;
        const current = await getLicenseFromCloud(key);
        if (!current) return false;
        const updated = { ...current, ...updates, timestamp: new Date().toISOString() };
        await firebaseRequest(path, 'PUT', updated);
        return true;
    } catch (error) {
        return false;
    }
}

async function deleteLicenseFromCloud(key) {
    try {
        await firebaseRequest(`/licenses/${key}`, 'DELETE');
        return true;
    } catch (error) {
        return false;
    }
}

initializeFirebase();
