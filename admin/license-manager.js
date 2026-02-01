/**
 * Sistema de Gerenciamento de Licenças
 * Funciona na extensão (chrome.storage) e na web/admin (Firebase apenas)
 */

const hasChromeStorage = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

class LicenseManager {
    constructor() {
        this.STORAGE_KEY = 'master_lovable_licenses';
        this.ADMIN_KEY = 'master_lovable_admin_password';
        this.licenses = [];
        this.initialized = false;
    }

    /**
     * Inicializa o gerenciador (carrega licenças)
     */
    async init() {
        if (this.initialized) return;

        if (!hasChromeStorage()) {
            this.licenses = [];
            this.initialized = true;
            if (typeof getAllLicensesFromCloud !== 'undefined') {
                try {
                    this.licenses = await getAllLicensesFromCloud();
                } catch (e) {
                    console.warn('[LicenseManager] Web: falha ao carregar da nuvem', e);
                }
            }
            return;
        }

        return new Promise((resolve) => {
            chrome.storage.local.get([this.STORAGE_KEY], (result) => {
                if (result[this.STORAGE_KEY]) {
                    this.licenses = result[this.STORAGE_KEY];
                } else {
                    this.licenses = [];
                }
                this.initialized = true;
                resolve();
            });
        });
    }

    /**
     * Carrega licenças (local ou nuvem quando na web)
     */
    async loadLicenses() {
        if (!hasChromeStorage()) {
            if (typeof getAllLicensesFromCloud !== 'undefined') {
                try {
                    this.licenses = await getAllLicensesFromCloud();
                } catch (e) {
                    console.warn('[LicenseManager] Web: falha ao carregar da nuvem', e);
                }
            }
            return this.licenses;
        }
        return new Promise((resolve) => {
            chrome.storage.local.get([this.STORAGE_KEY], (result) => {
                if (result[this.STORAGE_KEY]) {
                    this.licenses = result[this.STORAGE_KEY];
                } else {
                    this.licenses = [];
                }
                resolve(this.licenses);
            });
        });
    }

    /**
     * Salva licenças (local; na web é no-op, dados ficam no Firebase)
     */
    async saveLicenses() {
        if (!hasChromeStorage()) return Promise.resolve();
        return new Promise((resolve) => {
            chrome.storage.local.set({
                [this.STORAGE_KEY]: this.licenses
            }, () => {
                resolve();
            });
        });
    }

    /**
     * Gera uma licença única
     * Formato: MLI-XXXXXXXX-XXXXXXXX-XXXXXXXX
     * 
     * ⚠️ IMPORTANTE: Esta licença pode ser usada em MÚLTIPLAS MÁQUINAS
     * Cada máquina que usar a licença terá seu próprio HWID registrado
     */
    async generateLicense(expiryDays = 30, maxUses = null, userName = '', userPhone = '', isLifetime = false) {
        const generateSegment = () => {
            return Math.random().toString(36).substring(2, 10).toUpperCase();
        };

        const license = `MLI-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
        const lifetime = isLifetime === true;
        const expiryDate = lifetime ? this.getExpiryDate(null) : this.getExpiryDate(expiryDays);

        const licenseData = {
            key: license,
            created: new Date().toISOString(),
            activated: false,
            activatedDate: null,
            activatedDevices: [], // Array de dispositivos que usaram esta licença
            expiryDate: expiryDate,
            lifetime: lifetime, // true = vitalícia (nunca expira na UI)
            active: true,
            uses: 0,
            maxUses: maxUses, // null = ilimitado
            description: '',
            userName: userName || 'Sem nome',
            userPhone: userPhone || 'Sem telefone'
        };

        this.licenses.push(licenseData);
        await this.saveLicenses();
        
        // Sincronizar com Firebase
        if (typeof saveLicenseToCloud !== 'undefined') {
            await saveLicenseToCloud(licenseData);
        }
        
        return licenseData;
    }

    /**
     * Calcula data de expiração. Se days for null/undefined/-1, retorna data muito futura (vitalício).
     */
    getExpiryDate(days) {
        if (days == null || days === -1 || days === 'lifetime') {
            return new Date('9999-12-31T23:59:59.999Z').toISOString();
        }
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }

    /**
     * Valida uma licenca
     * Funciona em qualquer maquina
     * Multiplos usuarios podem usar a mesma licenca
     * Consulta Firebase primeiro (nuvem)
     */
    async validateLicense(key) {
        // Tentar carregar da nuvem primeiro
        if (typeof getLicenseFromCloud !== 'undefined') {
            try {
                const cloudLicense = await getLicenseFromCloud(key);
                if (cloudLicense) {
                    // Validar licenca da nuvem
                    if (!cloudLicense.active) {
                        return { valid: false, message: 'Licenca desativada' };
                    }

                    const now = new Date();
                    const expiry = new Date(cloudLicense.expiryDate);

                    if (now > expiry) {
                        return { valid: false, message: 'Licenca expirada' };
                    }

                    if (cloudLicense.maxUses && cloudLicense.uses >= cloudLicense.maxUses) {
                        return { valid: false, message: 'Limite de usos atingido' };
                    }

                    return { valid: true, message: 'Licenca valida (nuvem)', license: cloudLicense };
                }
            } catch (error) {
                console.warn('Erro ao validar na nuvem, tentando localmente:', error);
            }
        }

        // Fallback: validar localmente
        await this.loadLicenses();
        
        const license = this.licenses.find(l => l.key === key);

        if (!license) {
            return { valid: false, message: 'Licenca nao encontrada' };
        }

        if (!license.active) {
            return { valid: false, message: 'Licenca desativada' };
        }

        const now = new Date();
        const expiry = new Date(license.expiryDate);

        if (now > expiry) {
            return { valid: false, message: 'Licenca expirada' };
        }

        if (license.maxUses && license.uses >= license.maxUses) {
            return { valid: false, message: 'Limite de usos atingido' };
        }

        return { valid: true, message: 'Licenca valida (local)', license };
    }

    /**
     * Ativa uma licença em um dispositivo
     * ✅ Cada máquina/dispositivo pode ativar a mesma licença
     * ✅ O sistema rastreia qual dispositivo ativou
     */
    async activateLicense(key, deviceId) {
        await this.loadLicenses();
        
        const license = this.licenses.find(l => l.key === key);

        if (!license) {
            return { success: false, message: 'Licença não encontrada' };
        }

        license.activated = true;
        license.activatedDate = new Date().toISOString();
        license.uses = (license.uses || 0) + 1;

        // Adicionar dispositivo à lista se não estiver lá
        if (!license.activatedDevices) {
            license.activatedDevices = [];
        }
        
        if (!license.activatedDevices.includes(deviceId)) {
            license.activatedDevices.push(deviceId);
        }

        await this.saveLicenses();
        return { success: true, message: 'Licença ativada com sucesso', license };
    }

    /**
     * Lista todas as licenças
     */
    async getAllLicenses() {
        await this.loadLicenses();
        return this.licenses;
    }

    /**
     * Deleta uma licença (local e Firebase)
     */
    async deleteLicense(key) {
        await this.loadLicenses();
        
        const index = this.licenses.findIndex(l => l.key === key);
        if (index > -1) {
            this.licenses.splice(index, 1);
            await this.saveLicenses();
            
            // Deletar do Firebase também
            if (typeof deleteLicenseFromCloud !== 'undefined') {
                try {
                    await deleteLicenseFromCloud(key);
                    console.log('[LicenseManager] Licença deletada do Firebase:', key);
                } catch (error) {
                    console.error('[LicenseManager] Erro ao deletar do Firebase:', error);
                    // Continuar mesmo se falhar no Firebase
                }
            }
            
            return { success: true, message: 'Licença deletada com sucesso' };
        }
        return { success: false, message: 'Licença não encontrada' };
    }

    /**
     * Edita uma licença
     */
    async editLicense(key, updates) {
        await this.loadLicenses();
        
        const license = this.licenses.find(l => l.key === key);
        if (!license) {
            return { success: false, message: 'Licença não encontrada' };
        }

        Object.assign(license, updates);
        await this.saveLicenses();
        return { success: true, message: 'Licença atualizada', license };
    }

    /**
     * Desativa uma licença
     */
    async deactivateLicense(key) {
        return this.editLicense(key, { active: false });
    }

    /**
     * Reativa uma licença
     */
    async reactivateLicense(key) {
        return this.editLicense(key, { active: true });
    }

    /**
     * Define senha de admin
     */
    async setAdminPassword(password) {
        const hashed = this.hashPassword(password);

        if (hasChromeStorage()) {
            await new Promise((resolve) => {
                chrome.storage.local.set({
                    [this.ADMIN_KEY]: hashed
                }, resolve);
            });
            console.log('[Admin] Senha salva localmente');
        }

        // Firebase (extensão e web)
        if (typeof saveAdminPasswordToCloud !== 'undefined') {
            try {
                console.log('[Admin] Sincronizando senha com Firebase...');
                const result = await saveAdminPasswordToCloud(hashed);
                console.log('[Admin] Senha sincronizada com Firebase:', result);
            } catch (error) {
                console.error('[Admin] Erro ao sincronizar senha:', error);
            }
        } else {
            console.warn('[Admin] saveAdminPasswordToCloud nao definida');
        }
        
        return { success: true, message: 'Senha de admin definida e sincronizada' };
    }

    /**
     * Verifica senha de admin
     */
    async verifyAdminPassword(password, callback) {
        let storedHash = null;
        if (hasChromeStorage()) {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([this.ADMIN_KEY], (r) => resolve(r));
            });
            storedHash = result[this.ADMIN_KEY];
        }
        if (!storedHash && typeof getAdminPasswordFromCloud !== 'undefined') {
            try {
                storedHash = await getAdminPasswordFromCloud();
                if (storedHash && hasChromeStorage()) {
                    chrome.storage.local.set({ [this.ADMIN_KEY]: storedHash });
                }
            } catch (e) {
                console.warn('[Admin] Erro ao carregar senha do Firebase:', e);
            }
        }
        if (!storedHash) {
            callback(true);
            return;
        }
        const hashed = this.hashPassword(password);
        callback(hashed === storedHash);
    }

    /**
     * Hash simples de senha
     */
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'hash_' + Math.abs(hash).toString(16);
    }

    /**
     * Exporta licenças como JSON
     */
    async exportLicenses() {
        await this.loadLicenses();
        return JSON.stringify(this.licenses, null, 2);
    }

    /**
     * Importa licenças de JSON
     */
    async importLicenses(jsonData) {
        try {
            const imported = JSON.parse(jsonData);
            if (Array.isArray(imported)) {
                this.licenses = imported;
                await this.saveLicenses();
                return { success: true, message: 'Licenças importadas com sucesso' };
            }
            return { success: false, message: 'Formato inválido' };
        } catch (e) {
            return { success: false, message: 'Erro ao importar: ' + e.message };
        }
    }

    /**
     * Obtém estatísticas
     */
    async getStats() {
        await this.loadLicenses();
        
        const total = this.licenses.length;
        const active = this.licenses.filter(l => l.active).length;
        const activated = this.licenses.filter(l => l.activated).length;
        const expired = this.licenses.filter(l => {
            const now = new Date();
            const expiry = new Date(l.expiryDate);
            return now > expiry;
        }).length;

        return {
            total,
            active,
            activated,
            expired,
            available: active - expired
        };
    }

    /**
     * Obtém informações de uma licença
     */
    async getLicenseInfo(key) {
        await this.loadLicenses();
        const license = this.licenses.find(l => l.key === key);
        return license || null;
    }

    /**
     * Limpa todas as licenças
     */
    async clearAllLicenses() {
        this.licenses = [];
        await this.saveLicenses();
        return { success: true, message: 'Todas as licenças foram deletadas' };
    }
}

// Instância global
const licenseManager = new LicenseManager();

// Inicializar ao carregar
licenseManager.init();
