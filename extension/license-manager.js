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
                } catch (e) {}
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
                } catch (e) {}
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
     */
    async generateLicense(expiryDays = 30, maxUses = null, userName = '', userPhone = '') {
        const generateSegment = () => {
            return Math.random().toString(36).substring(2, 10).toUpperCase();
        };

        const license = `MLI-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
        
        const licenseData = {
            key: license,
            created: new Date().toISOString(),
            activated: false,
            activatedDate: null,
            activatedDevices: [],
            expiryDate: this.getExpiryDate(expiryDays),
            active: true,
            uses: 0,
            maxUses: maxUses,
            description: '',
            userName: userName || 'Sem nome',
            userPhone: userPhone || 'Sem telefone'
        };

        this.licenses.push(licenseData);
        await this.saveLicenses();
        
        if (typeof saveLicenseToCloud !== 'undefined') {
            await saveLicenseToCloud(licenseData);
        }
        
        return licenseData;
    }

    /**
     * Calcula data de expiração
     */
    getExpiryDate(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
    }

    /**
     * Valida uma licença
     */
    async validateLicense(key) {
        if (typeof getLicenseFromCloud !== 'undefined') {
            try {
                const cloudLicense = await getLicenseFromCloud(key);
                if (cloudLicense) {
                    if (!cloudLicense.active) {
                        return { valid: false, message: 'Licença desativada' };
                    }

                    const now = new Date();
                    const expiry = new Date(cloudLicense.expiryDate);

                    if (now > expiry) {
                        return { valid: false, message: 'Licença expirada' };
                    }

                    if (cloudLicense.maxUses && cloudLicense.uses >= cloudLicense.maxUses) {
                        return { valid: false, message: 'Limite de usos atingido' };
                    }

                    return { valid: true, message: 'Licença válida (nuvem)', license: cloudLicense };
                }
            } catch (error) {}
        }

        await this.loadLicenses();
        
        const license = this.licenses.find(l => l.key === key);

        if (!license) {
            return { valid: false, message: 'Licença não encontrada' };
        }

        if (!license.active) {
            return { valid: false, message: 'Licença desativada' };
        }

        const now = new Date();
        const expiry = new Date(license.expiryDate);

        if (now > expiry) {
            return { valid: false, message: 'Licença expirada' };
        }

        if (license.maxUses && license.uses >= license.maxUses) {
            return { valid: false, message: 'Limite de usos atingido' };
        }

        return { valid: true, message: 'Licença válida (local)', license };
    }

    /**
     * Ativa uma licença em um dispositivo
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
     * Deleta uma licença
     */
    async deleteLicense(key) {
        await this.loadLicenses();
        
        const index = this.licenses.findIndex(l => l.key === key);
        if (index > -1) {
            this.licenses.splice(index, 1);
            await this.saveLicenses();
            
            if (typeof deleteLicenseFromCloud !== 'undefined') {
                try {
                    await deleteLicenseFromCloud(key);
                } catch (error) {}
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
     * Obtém informações de uma licença
     */
    async getLicenseInfo(key) {
        await this.loadLicenses();
        const license = this.licenses.find(l => l.key === key);
        return license || null;
    }
}

// Instância global
const licenseManager = new LicenseManager();

// Inicializar ao carregar
licenseManager.init();
