/**
 * Configuração do Firebase - Lovable Infinity
 * Sistema de Licenças na Nuvem
 *
 * CONEXÃO DO ZERO: Este projeto está desconectado do Firebase antigo.
 * Configure seu NOVO projeto Firebase abaixo (dados do Console Firebase).
 *
 * Passos:
 * 1. Acesse https://console.firebase.google.com
 * 2. Crie um novo projeto (ou use um existente)
 * 3. Ative o Realtime Database (crie o banco se pedir)
 * 4. Em Configurações do projeto > Geral > Seus apps > adicione um app Web
 * 5. Copie o objeto firebaseConfig e preencha FIREBASE_CONFIG abaixo
 * 6. A databaseURL deve ser algo como: https://SEU-PROJECT-ID-default-rtdb.firebaseio.com
 *
 * Guia completo: pasta docs/FIREBASE_SETUP.md
 */

/** URL do endpoint createPanelUser no Vercel (ex: https://seu-projeto.vercel.app/api/createPanelUser) */
var CREATE_PANEL_USER_API_URL = "";

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
let firebaseAuth = null;
let firebaseInitialized = false;

/**
 * Inicializar Firebase - Realtime Database REST + Auth (quando apiKey preenchido)
 */
async function initializeFirebase() {
    return new Promise((resolve) => {
        if (firebaseInitialized) {
            resolve(!!firebaseApp);
            return;
        }

        if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL === "") {
            resolve(false);
            return;
        }

        try {
            if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey) {
                firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
                firebaseAuth = firebase.auth();
            }
            firebaseInitialized = true;
            resolve(true);
        } catch (e) {
            resolve(false);
        }
    });
}

function getFirebaseAuth() {
    return firebaseAuth || (typeof firebase !== 'undefined' && firebase.app && firebase.auth ? firebase.auth() : null);
}

/**
 * Fazer requisição ao Firebase Realtime Database (com auth quando disponível)
 */
async function firebaseRequest(path, method = 'GET', data = null) {
    if (!FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase não configurado. Preencha FIREBASE_CONFIG em firebase-config.js');
    }

    try {
        let url = `${FIREBASE_CONFIG.databaseURL}${path}.json`;
        if (typeof window !== 'undefined' && typeof window.getAdminAuthToken === 'function') {
            try {
                var token = await window.getAdminAuthToken();
                if (token) url += (url.indexOf('?') !== -1 ? '&' : '?') + 'auth=' + encodeURIComponent(token);
            } catch (e) {}
        }

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

/**
 * Testar conexão com Firebase
 */
async function testFirebaseConnection() {
    try {
        await firebaseRequest('/licenses');
        return { success: true, message: 'Conexão com Firebase OK' };
    } catch (error) {
        return { success: false, message: 'Erro de conexão.' };
    }
}

/**
 * Salvar licença na nuvem (ownerId opcional para multi-tenant)
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
            lifetime: license.lifetime === true,
            active: license.active,
            activated: license.activated || false,
            activatedDate: license.activatedDate || null,
            maxUses: license.maxUses || null,
            uses: license.uses || 0,
            activatedDevices: license.activatedDevices || [],
            timestamp: new Date().toISOString()
        };
        if (license.ownerId) data.ownerId = license.ownerId;
        await firebaseRequest(path, 'PUT', data);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Carregar licença da nuvem (extensão usa por chave; ownerId não afeta)
 */
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

/**
 * Carregar licenças da nuvem. Se ownerId for passado, retorna só as do dono.
 */
async function getAllLicensesFromCloud(ownerId) {
    try {
        const result = await firebaseRequest('/licenses');
        if (result && typeof result === 'object') {
            let licenses = Object.values(result).filter(l => l && l.key);
            if (ownerId) licenses = licenses.filter(l => l.ownerId === ownerId);
            return licenses;
        }
        return [];
    } catch (error) {
        return [];
    }
}

/**
 * Atualizar licença na nuvem
 */
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

/**
 * Deletar licença da nuvem
 */
async function deleteLicenseFromCloud(key) {
    try {
        await firebaseRequest(`/licenses/${key}`, 'DELETE');
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Atribui ownerId a licenças que ainda não têm (migração para master)
 */
async function migrateUnassignedLicensesToOwner(ownerId) {
    try {
        const result = await firebaseRequest('/licenses');
        if (!result || typeof result !== 'object') return { migrated: 0 };
        let migrated = 0;
        for (const key of Object.keys(result)) {
            const l = result[key];
            if (l && l.key && !l.ownerId) {
                await updateLicenseInCloud(key, { ownerId: ownerId });
                migrated++;
            }
        }
        return { migrated };
    } catch (error) {
        return { migrated: 0 };
    }
}

/**
 * Sincronizar licenças locais com nuvem
 */
async function syncLicensesWithCloud() {
    try {
        const localLicenses = await licenseManager.getAllLicenses();
        let saved = 0;
        for (const license of localLicenses) {
            const result = await saveLicenseToCloud(license);
            if (result) saved++;
        }
        return { success: true, message: 'Sincronizadas ' + saved + ' licenças' };
    } catch (error) {
        return { success: false, message: 'Erro ao sincronizar.' };
    }
}

initializeFirebase();

/**
 * Salvar senha de admin no Firebase
 */
async function saveAdminPasswordToCloud(passwordHash) {
    try {
        await firebaseRequest('/admin/password', 'PUT', passwordHash);
        return true;
    } catch (error) {
        return false;
    }
}

async function getAdminPasswordFromCloud() {
    try {
        const result = await firebaseRequest('/admin/password');
        return result || null;
    } catch (error) {
        return null;
    }
}

async function getAdminUsernameFromCloud() {
    try {
        const result = await firebaseRequest('/admin/username');
        return result || null;
    } catch (error) {
        return null;
    }
}

async function saveAdminUsernameToCloud(username) {
    try {
        await firebaseRequest('/admin/username', 'PUT', username);
        return true;
    } catch (error) {
        return false;
    }
}

async function deleteAdminPasswordFromCloud() {
    try {
        await firebaseRequest('/admin/password', 'DELETE');
        return true;
    } catch (error) {
        return false;
    }
}
