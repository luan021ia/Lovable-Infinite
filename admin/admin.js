/**
 * Script do Painel de Admin
 * Sem onclick inline - Usando event listeners
 */

let currentAction = null;
let passwordVerified = false;

// Inicializar ao carregar
document.addEventListener('DOMContentLoaded', async () => {
    // Aguardar inicializacao do license manager
    await licenseManager.init();

    // Toggle "Dias de Validade" quando "Licença vitalícia" estiver marcada
    const lifetimeCheckbox = document.getElementById('license-lifetime');
    const expiryDaysGroup = document.getElementById('expiry-days-group');
    if (lifetimeCheckbox && expiryDaysGroup) {
        const toggleExpiryVisibility = () => {
            expiryDaysGroup.style.display = lifetimeCheckbox.checked ? 'none' : 'block';
        };
        toggleExpiryVisibility();
        lifetimeCheckbox.addEventListener('change', toggleExpiryVisibility);
    }

    // Verificar protecao com senha
    checkAdminPassword();
});

// Senha padrão na primeira vez (210293)
const ADMIN_SEED_PASSWORD_HASH = 'MjEwMjkz';

// Sessão do admin: manter login por 30 dias (localStorage + sessionStorage como fallback)
const ADMIN_SESSION_KEY = 'lovable_admin_session';
const ADMIN_SESSION_DAYS = 30;
const ADMIN_SESSION_MS = ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000;

function _readSessionFrom(storage) {
    try {
        const raw = storage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || typeof data.ts !== 'number') return false;
        return (Date.now() - data.ts) < ADMIN_SESSION_MS;
    } catch (e) {
        return false;
    }
}

function hasValidAdminSession() {
    if (_readSessionFrom(localStorage)) return true;
    if (typeof sessionStorage !== 'undefined' && _readSessionFrom(sessionStorage)) return true;
    return false;
}

function saveAdminSession() {
    const payload = JSON.stringify({ ts: Date.now() });
    try {
        localStorage.setItem(ADMIN_SESSION_KEY, payload);
    } catch (e) {
        console.warn('[Admin] localStorage sessão:', e);
    }
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ADMIN_SESSION_KEY, payload);
    } catch (e) {
        console.warn('[Admin] sessionStorage sessão:', e);
    }
}

function clearAdminSession() {
    try {
        localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (e) {}
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (e) {}
}

/**
 * Verificar se o painel esta protegido com senha
 */
async function checkAdminPassword() {
    try {
        // Se já tem sessão válida (login nos últimos 30 dias), entra direto
        if (hasValidAdminSession()) {
            console.log('[Admin] Sessão válida – acessando painel.');
            initializePanel();
            return;
        }

        const adminPassword = await getAdminPasswordFromCloud();

        if (!adminPassword) {
            // Primeira vez: definir senha padrão 210293
            console.log('[Admin] Nenhuma senha configurada. Definindo senha padrão...');
            await saveAdminPasswordToCloud(ADMIN_SEED_PASSWORD_HASH);
            console.log('[Admin] Senha definida. Digite 210293 para acessar.');
        }
        showPasswordModal();
    } catch (error) {
        console.error('[Admin] Erro ao verificar senha:', error);
        showPasswordModal();
    }
}

/**
 * Mostrar modal de senha
 */
function showPasswordModal() {
    const modal = document.getElementById('password-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('show');

    const btn = document.getElementById('btn-verify-password');
    const closeBtn = document.getElementById('btn-close-panel');
    const passInput = document.getElementById('access-password');

    if (btn) btn.onclick = verifyAdminAccess;
    if (closeBtn) closeBtn.onclick = () => window.close();
    if (passInput) {
        passInput.value = '';
        passInput.onkeypress = (e) => { if (e.key === 'Enter') verifyAdminAccess(); };
        passInput.focus();
    }
}

/**
 * Esconder modal de senha
 */
function hidePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

/**
 * Verificar acesso com senha
 */
async function verifyAdminAccess() {
    const passInput = document.getElementById('access-password');
    const password = (passInput && passInput.value) || '';

    if (!password) {
        alert('Digite a senha!');
        return;
    }

    try {
        const storedPassword = await getAdminPasswordFromCloud();

        if (!storedPassword) {
            alert('Nenhuma senha configurada.');
            return;
        }

        const passwordHash = btoa(password);
        if (passwordHash === storedPassword) {
            console.log('[Admin] Senha correta!');
            passwordVerified = true;
            saveAdminSession(); // Manter login por 30 dias
            hidePasswordModal();
            if (passInput) passInput.value = '';
            initializePanel();
        } else {
            alert('Senha incorreta!');
            if (passInput) {
                passInput.value = '';
                passInput.focus();
            }
        }
    } catch (error) {
        console.error('[Admin] Erro ao verificar senha:', error);
        alert('Erro ao verificar senha: ' + error.message);
    }
}

/**
 * Inicializar o painel
 */
function initializePanel() {
    saveAdminSession(); // Renovar sessão a cada uso (mantém 30 dias)
    setupEventListeners();
    loadDashboard();
    loadManageLicenses();
}

/**
 * Configurar todos os event listeners
 */
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Generate Tab
    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) btnGenerate.addEventListener('click', generateNewLicense);
    
    const btnCopyGenerated = document.getElementById('btn-copy-generated');
    if (btnCopyGenerated) btnCopyGenerated.addEventListener('click', copyToClipboard);

    // Manage Tab
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportLicenses);
    
    const btnCopyExport = document.getElementById('btn-copy-export');
    if (btnCopyExport) btnCopyExport.addEventListener('click', copyExport);
    
    const btnImport = document.getElementById('btn-import');
    if (btnImport) btnImport.addEventListener('click', importLicenses);

    // Modal
    const btnConfirm = document.getElementById('btn-confirm');
    if (btnConfirm) btnConfirm.addEventListener('click', confirmAction);
    
    const btnCancel = document.getElementById('btn-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    
    const modalClose = document.getElementById('modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    // Fechar modal ao clicar fora
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target.id === 'confirm-modal') {
                closeModal();
            }
        });
    }
}

/**
 * Trocar abas
 */
function switchTab(tabName) {
    // Remover classe active de todas as abas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Adicionar classe active a aba selecionada
    const tab = document.getElementById(tabName);
    if (tab) tab.classList.add('active');
    
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');

    if (tabName === 'dashboard') {
        loadDashboard();
    } else if (tabName === 'manage') {
        loadManageLicenses();
    }
}

/**
 * Carregar Dashboard
 */
async function loadDashboard() {
    const stats = await licenseManager.getStats();
    const licenses = await licenseManager.getAllLicenses();

    // Atualizar cards de estatisticas
    const statsGrid = document.getElementById('stats-grid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${stats.total}</div>
                <div class="stat-label">Total de Licencas</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.active}</div>
                <div class="stat-label">Ativas</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.activated}</div>
                <div class="stat-label">Ativadas</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.available}</div>
                <div class="stat-label">Disponiveis</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.expired}</div>
                <div class="stat-label">Expiradas</div>
            </div>
        `;
    }

    // Atualizar tabela de licencas
    const tbody = document.getElementById('licenses-tbody');
    if (tbody) {
        tbody.innerHTML = '';

        licenses.forEach(license => {
            const row = document.createElement('tr');
            const statusClass = license.active ? 'status-active' : 'status-inactive';
            const statusText = license.active ? 'Ativa' : 'Inativa';
            const activatedText = license.activated ? 'Sim' : 'Nao';
            const expiryDisplay = license.lifetime ? 'Vitalício' : new Date(license.expiryDate).toLocaleDateString('pt-BR');
            const userName = license.userName || '—';

            row.innerHTML = `
                <td><div class="license-key">${license.key}</div></td>
                <td>${userName}</td>
                <td><span class="status-badge-small ${statusClass}">${statusText}</span></td>
                <td>${activatedText}</td>
                <td>${expiryDisplay}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn-small btn-copy" data-key="${license.key}" data-context="dashboard">Copiar</button>
                        <button class="action-btn-small btn-toggle" data-key="${license.key}" data-active="${license.active}">
                            ${license.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button class="action-btn-small delete btn-delete" data-key="${license.key}">Deletar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        if (licenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Nenhuma licenca criada ainda</td></tr>';
        }
    }

    // Adicionar event listeners aos botoes
    attachTableButtonListeners();
}

/**
 * Carregar Gerenciar Licencas
 */
async function loadManageLicenses() {
    const licenses = await licenseManager.getAllLicenses();
    const tbody = document.getElementById('manage-tbody');
    if (tbody) {
        tbody.innerHTML = '';

        licenses.forEach(license => {
            const row = document.createElement('tr');
            const statusClass = license.active ? 'status-active' : 'status-inactive';
            const statusText = license.active ? 'Ativa' : 'Inativa';
            const activatedText = license.activated ? 'Sim' : 'Nao';
            const createdDate = new Date(license.created).toLocaleDateString('pt-BR');
            const expiryDisplay = license.lifetime ? 'Vitalício' : new Date(license.expiryDate).toLocaleDateString('pt-BR');

            row.innerHTML = `
                <td><div class="license-key">${license.key}</div></td>
                <td>${license.userName || 'Sem nome'}</td>
                <td>${license.userPhone || 'Sem telefone'}</td>
                <td><span class="status-badge-small ${statusClass}">${statusText}</span></td>
                <td>${activatedText}</td>
                <td>${createdDate}</td>
                <td>${expiryDisplay}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn-small btn-copy" data-key="${license.key}" data-context="manage">Copiar</button>
                        <button class="action-btn-small btn-view" data-key="${license.key}">Ver</button>
                        <button class="action-btn-small delete btn-delete" data-key="${license.key}">Deletar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        if (licenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">Nenhuma licenca criada ainda</td></tr>';
        }
    }

    // Adicionar event listeners aos botoes
    attachTableButtonListeners();
}

/**
 * Adicionar event listeners aos botoes da tabela
 */
function attachTableButtonListeners() {
    // Botoes Copiar (contexto = dashboard ou manage)
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            const context = e.currentTarget.getAttribute('data-context') || 'dashboard';
            copyLicense(key, e.currentTarget, context);
        });
    });

    // Botoes Toggle
    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.getAttribute('data-key');
            const active = e.target.getAttribute('data-active') === 'true';
            toggleLicense(key, !active);
        });
    });

    // Botoes Delete
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.getAttribute('data-key');
            deleteLicenseConfirm(key);
        });
    });

    // Botoes View
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.getAttribute('data-key');
            viewLicenseDetails(key);
        });
    });
}

/**
 * Gerar Nova Licenca
 */
async function generateNewLicense() {
    const userName = document.getElementById('user-name')?.value.trim() || '';
    const userPhone = document.getElementById('user-phone')?.value.trim() || '';
    const isLifetime = document.getElementById('license-lifetime')?.checked === true;
    const expiryDays = isLifetime ? 30 : (parseInt(document.getElementById('expiry-days')?.value) || 30);
    const maxUses = document.getElementById('max-uses')?.value ? parseInt(document.getElementById('max-uses').value) : null;

    try {
        const license = await licenseManager.generateLicense(expiryDays, maxUses, userName, userPhone, isLifetime);

        // Mostrar licenca gerada
        const keyElement = document.getElementById('new-license-key');
        if (keyElement) keyElement.textContent = license.key;
        
        const generatedDiv = document.getElementById('generated-license');
        if (generatedDiv) generatedDiv.style.display = 'block';

        // Limpar campos
        const nameInput = document.getElementById('user-name');
        if (nameInput) nameInput.value = '';
        
        const phoneInput = document.getElementById('user-phone');
        if (phoneInput) phoneInput.value = '';
        
        const lifetimeCheckbox = document.getElementById('license-lifetime');
        if (lifetimeCheckbox) lifetimeCheckbox.checked = false;
        
        const expiryInput = document.getElementById('expiry-days');
        if (expiryInput) expiryInput.value = '30';
        
        const expiryDaysGroup = document.getElementById('expiry-days-group');
        if (expiryDaysGroup) expiryDaysGroup.style.display = 'block';
        
        const maxUsesInput = document.getElementById('max-uses');
        if (maxUsesInput) maxUsesInput.value = '';

        // Mostrar alerta de sucesso (já salva no Firebase automaticamente)
        const successMsg = isLifetime
            ? 'Licenca vitalicia gerada com sucesso! Ja salva na nuvem para ativacao.'
            : 'Licenca gerada com sucesso! Valida por ' + expiryDays + ' dias. Ja salva na nuvem para ativacao.';
        showAlert('alert-generate', successMsg, 'success');

        // Recarregar dashboard
        setTimeout(() => {
            loadDashboard();
        }, 500);
    } catch (error) {
        showAlert('alert-generate', 'Erro ao gerar licenca: ' + error.message, 'error');
    }
}

/**
 * Toast "Copiado!" na aba certa (dashboard, generate, manage)
 */
function showCopyToast(success, context) {
    const ctx = context || 'generate';
    const id = 'copy-toast-' + ctx;
    // Esconder todos os toasts
    ['dashboard', 'generate', 'manage'].forEach(c => {
        const t = document.getElementById('copy-toast-' + c);
        if (t) t.classList.remove('show');
    });
    const toast = document.getElementById(id);
    if (!toast) return;
    toast.textContent = success ? 'Copiado!' : 'Erro ao copiar';
    toast.style.background = success ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

/**
 * Feedback visual no botão "Copiar" (texto do botão)
 */
function showCopyFeedback(buttonEl, success) {
    if (buttonEl) {
        const originalText = buttonEl.textContent;
        buttonEl.textContent = success ? 'Copiado!' : 'Erro';
        buttonEl.disabled = true;
        setTimeout(() => {
            buttonEl.textContent = originalText;
            buttonEl.disabled = false;
        }, 2000);
    }
}

/**
 * Copiar Licenca para Clipboard (contexto = dashboard ou manage)
 */
function copyLicense(key, buttonEl, context) {
    const ctx = context || 'dashboard';
    const alertId = ctx === 'manage' ? 'alert-manage' : 'alert-generate';
    navigator.clipboard.writeText(key).then(() => {
        showCopyFeedback(buttonEl, true);
        showCopyToast(true, ctx);
    }).catch(err => {
        showCopyFeedback(buttonEl, false);
        showCopyToast(false, ctx);
        showAlert(alertId, 'Erro ao copiar: ' + err.message, 'error');
    });
}

/**
 * Copiar Licenca Gerada (sempre contexto "generate")
 */
function copyToClipboard() {
    const keyElement = document.getElementById('new-license-key');
    const key = keyElement ? keyElement.textContent : '';
    const btn = document.getElementById('btn-copy-generated');

    if (!key) {
        showAlert('alert-generate', 'Gere uma licenca primeiro!', 'error');
        return;
    }

    navigator.clipboard.writeText(key).then(() => {
        showCopyFeedback(btn, true);
        showCopyToast(true, 'generate');
    }).catch(err => {
        showCopyFeedback(btn, false);
        showCopyToast(false, 'generate');
        showAlert('alert-generate', 'Erro ao copiar: ' + err.message, 'error');
    });
}

/**
 * Ativar/Desativar Licenca
 */
async function toggleLicense(key, activate) {
    try {
        if (activate) {
            await licenseManager.reactivateLicense(key);
            showAlert('alert-generate', 'Licenca reativada!', 'success');
        } else {
            await licenseManager.deactivateLicense(key);
            showAlert('alert-generate', 'Licenca desativada!', 'success');
        }
        loadDashboard();
    } catch (error) {
        showAlert('alert-generate', 'Erro: ' + error.message, 'error');
    }
}

/**
 * Ver Detalhes da Licenca
 */
async function viewLicenseDetails(key) {
    try {
        const license = await licenseManager.getLicenseInfo(key);
        if (!license) {
            showAlert('alert-generate', 'Licenca nao encontrada', 'error');
            return;
        }

        const devicesInfo = license.activatedDevices && license.activatedDevices.length > 0 
            ? license.activatedDevices.join(', ')
            : 'Nenhum dispositivo';

        const expiryLabel = license.lifetime ? 'Vitalício' : new Date(license.expiryDate).toLocaleDateString('pt-BR');
        const message = 'Detalhes da Licenca\n\nChave: ' + license.key + '\nNome: ' + (license.userName || 'Sem nome') + '\nTelefone: ' + (license.userPhone || 'Sem telefone') + '\nCriada: ' + new Date(license.created).toLocaleDateString('pt-BR') + '\nExpira: ' + expiryLabel + '\nStatus: ' + (license.active ? 'Ativa' : 'Inativa') + '\nDispositivos: ' + devicesInfo + '\nUsos: ' + license.uses + (license.maxUses ? ' / ' + license.maxUses : ' (ilimitado)');

        alert(message);
    } catch (error) {
        showAlert('alert-generate', 'Erro: ' + error.message, 'error');
    }
}

/**
 * Confirmar Deletar Licenca
 */
function deleteLicenseConfirm(key) {
    currentAction = async () => {
        try {
            await licenseManager.deleteLicense(key);
            showAlert('alert-generate', 'Licenca deletada!', 'success');
            loadDashboard();
            loadManageLicenses();
            closeModal();
        } catch (error) {
            showAlert('alert-generate', 'Erro: ' + error.message, 'error');
        }
    };

    showModal('Deletar Licenca', 'Tem certeza que deseja deletar esta licenca? Esta acao nao pode ser desfeita.');
}

/**
 * Exportar Licencas
 */
async function exportLicenses() {
    try {
        const json = await licenseManager.exportLicenses();
        const textarea = document.getElementById('export-textarea');
        if (textarea) textarea.value = json;
        showAlert('alert-manage', 'Licencas exportadas com sucesso!', 'success');
    } catch (error) {
        showAlert('alert-manage', 'Erro: ' + error.message, 'error');
    }
}

/**
 * Copiar JSON Exportado
 */
function copyExport() {
    const textarea = document.getElementById('export-textarea');
    if (!textarea || !textarea.value) {
        showAlert('alert-manage', 'Exporte as licencas primeiro!', 'error');
        return;
    }
    navigator.clipboard.writeText(textarea.value).then(() => {
        showAlert('alert-manage', 'JSON copiado para a area de transferencia!', 'success');
    }).catch(err => {
        showAlert('alert-manage', 'Erro ao copiar: ' + err.message, 'error');
    });
}

/**
 * Importar Licencas
 */
async function importLicenses() {
    const textarea = document.getElementById('import-textarea');
    const json = textarea ? textarea.value.trim() : '';

    if (!json) {
        showAlert('alert-manage', 'Cole o JSON das licencas!', 'error');
        return;
    }

    try {
        const result = await licenseManager.importLicenses(json);
        if (result.success) {
            showAlert('alert-manage', result.message, 'success');
            if (textarea) textarea.value = '';
            loadDashboard();
            loadManageLicenses();
        } else {
            showAlert('alert-manage', result.message, 'error');
        }
    } catch (error) {
        showAlert('alert-manage', 'Erro: ' + error.message, 'error');
    }
}

/**
 * Mostrar Alerta
 */
function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    if (alert) {
        alert.textContent = message;
        alert.className = 'alert show alert-' + type;

        setTimeout(() => {
            alert.classList.remove('show');
        }, 5000);
    }
}

/**
 * Mostrar Modal
 */
function showModal(title, message) {
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;
    
    const messageEl = document.getElementById('modal-message');
    if (messageEl) messageEl.textContent = message;
    
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('show');
}

/**
 * Fechar Modal
 */
function closeModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('show');
    currentAction = null;
}

/**
 * Confirmar Acao
 */
function confirmAction() {
    if (currentAction) {
        currentAction();
    }
}


