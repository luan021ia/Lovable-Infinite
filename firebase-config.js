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

const FIREBASE_CONFIG = {
    apiKey: "",           // Opcional para licenças; preencha se for usar Hosting/outros
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
            console.log('[Firebase] Já inicializado');
            resolve(true);
            return;
        }

        if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL === "") {
            console.warn('[Firebase] databaseURL não configurado. Configure FIREBASE_CONFIG em firebase-config.js');
            resolve(false);
            return;
        }

        try {
            firebaseInitialized = true;
            console.log('[Firebase] Inicializado com sucesso!');
            console.log('[Firebase] Database URL:', FIREBASE_CONFIG.databaseURL);
            resolve(true);
        } catch (error) {
            console.error('[Firebase] Erro ao inicializar:', error);
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
        console.error('[Firebase] Erro na requisição:', error);
        throw error;
    }
}

/**
 * Testar conexão com Firebase
 */
async function testFirebaseConnection() {
    try {
        console.log('[Firebase] Testando conexão...');
        const result = await firebaseRequest('/licenses');
        console.log('[Firebase] Conexão OK - Dados acessíveis');
        return { success: true, message: 'Conexão com Firebase OK' };
    } catch (error) {
        console.error('[Firebase] Erro na conexão:', error);
        return { success: false, message: 'Erro: ' + error.message };
    }
}

/**
 * Salvar licença na nuvem
 */
async function saveLicenseToCloud(license) {
    try {
        console.log('[Firebase] Salvando licença:', license.key);
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
        console.log('[Firebase] Licença salva com sucesso:', license.key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar licença:', error);
        return false;
    }
}

/**
 * Carregar licença da nuvem
 */
async function getLicenseFromCloud(key) {
    try {
        console.log('[Firebase] Carregando licença:', key);
        const path = `/licenses/${key}`;
        const result = await firebaseRequest(path);
        if (result && result.key) {
            console.log('[Firebase] Licença encontrada:', key);
            return result;
        }
        console.log('[Firebase] Licença não encontrada:', key);
        return null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar licença:', error);
        return null;
    }
}

/**
 * Carregar todas as licenças da nuvem
 */
async function getAllLicensesFromCloud() {
    try {
        console.log('[Firebase] Carregando todas as licenças...');
        const result = await firebaseRequest('/licenses');
        if (result && typeof result === 'object') {
            const licenses = Object.values(result).filter(l => l && l.key);
            console.log('[Firebase] Carregadas ' + licenses.length + ' licenças');
            return licenses;
        }
        return [];
    } catch (error) {
        console.error('[Firebase] Erro ao carregar licenças:', error);
        return [];
    }
}

/**
 * Atualizar licença na nuvem
 */
async function updateLicenseInCloud(key, updates) {
    try {
        console.log('[Firebase] Atualizando licença:', key);
        const path = `/licenses/${key}`;
        const current = await getLicenseFromCloud(key);
        if (!current) {
            console.error('[Firebase] Licença não encontrada para atualizar');
            return false;
        }
        const updated = { ...current, ...updates, timestamp: new Date().toISOString() };
        await firebaseRequest(path, 'PUT', updated);
        console.log('[Firebase] Licença atualizada com sucesso:', key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao atualizar licença:', error);
        return false;
    }
}

/**
 * Deletar licença da nuvem
 */
async function deleteLicenseFromCloud(key) {
    try {
        console.log('[Firebase] Deletando licença:', key);
        await firebaseRequest(`/licenses/${key}`, 'DELETE');
        console.log('[Firebase] Licença deletada com sucesso:', key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao deletar licença:', error);
        return false;
    }
}

/**
 * Sincronizar licenças locais com nuvem
 */
async function syncLicensesWithCloud() {
    try {
        console.log('[Firebase] Iniciando sincronização...');
        const localLicenses = await licenseManager.getAllLicenses();
        console.log('[Firebase] Sincronizando ' + localLicenses.length + ' licenças...');
        let saved = 0;
        for (const license of localLicenses) {
            const result = await saveLicenseToCloud(license);
            if (result) saved++;
        }
        console.log('[Firebase] Sincronização concluída: ' + saved + '/' + localLicenses.length);
        return { success: true, message: 'Sincronizadas ' + saved + ' licenças' };
    } catch (error) {
        console.error('[Firebase] Erro ao sincronizar:', error);
        return { success: false, message: 'Erro: ' + error.message };
    }
}

// Inicializar Firebase automaticamente
console.log('[Firebase] Carregando configuração...');
initializeFirebase();

/**
 * Salvar senha de admin no Firebase
 */
async function saveAdminPasswordToCloud(passwordHash) {
    try {
        await firebaseRequest('/admin/password', 'PUT', passwordHash);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar senha:', error);
        return false;
    }
}

/**
 * Carregar senha de admin do Firebase
 */
async function getAdminPasswordFromCloud() {
    try {
        const result = await firebaseRequest('/admin/password');
        return result || null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar senha:', error);
        return null;
    }
}

/**
 * Carregar usuário de admin do Firebase
 */
async function getAdminUsernameFromCloud() {
    try {
        const result = await firebaseRequest('/admin/username');
        return result || null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar usuário:', error);
        return null;
    }
}

/**
 * Salvar usuário de admin no Firebase
 */
async function saveAdminUsernameToCloud(username) {
    try {
        await firebaseRequest('/admin/username', 'PUT', username);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar usuário:', error);
        return false;
    }
}

/**
 * Deletar senha de admin do Firebase
 */
async function deleteAdminPasswordFromCloud() {
    try {
        await firebaseRequest('/admin/password', 'DELETE');
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao deletar senha:', error);
        return false;
    }
}
