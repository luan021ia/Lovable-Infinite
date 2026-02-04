/**
 * Painel de Admin - Multi-tenant com Firebase Auth
 */

let currentAction = null;
let allLicensesCache = [];
let currentUser = null;

const EXPIRING_DAYS = 30;

function isExpiringSoon(license) {
    if (!license.active || license.lifetime) return false;
    const now = new Date();
    const expiry = new Date(license.expiryDate);
    if (now > expiry) return false;
    const limit = new Date(now);
    limit.setDate(limit.getDate() + EXPIRING_DAYS);
    return expiry <= limit;
}

function isExpired(license) {
    return new Date(license.expiryDate) < new Date();
}

function getCurrentUser() {
    return currentUser;
}

var MASTER_EMAILS = ['luan93dutra@gmail.com'];
function isMasterUser() {
    if (!currentUser || !currentUser.email) return false;
    return MASTER_EMAILS.indexOf(currentUser.email.trim().toLowerCase()) !== -1;
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeFirebase();
    await licenseManager.init();

    const lifetimeCheckbox = document.getElementById('create-license-lifetime');
    const expiryDaysGroup = document.getElementById('create-expiry-days-group');
    if (lifetimeCheckbox && expiryDaysGroup) {
        const toggle = () => { expiryDaysGroup.style.display = lifetimeCheckbox.checked ? 'none' : 'block'; };
        toggle();
        lifetimeCheckbox.addEventListener('change', toggle);
    }

    const editLifetimeCheck = document.getElementById('edit-lifetime');
    const editExpiryGroup = document.getElementById('edit-expiry-group');
    if (editLifetimeCheck && editExpiryGroup) {
        const toggleEdit = () => { editExpiryGroup.style.display = editLifetimeCheck.checked ? 'none' : 'block'; };
        toggleEdit();
        editLifetimeCheck.addEventListener('change', toggleEdit);
    }

    const auth = getFirebaseAuth();
    if (!auth) {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('login-error').textContent = 'Configure apiKey e authDomain no firebase-config.js para usar o login.';
        document.getElementById('login-error').classList.add('show');
        return;
    }

    auth.onAuthStateChanged(function (user) {
        currentUser = user;
        window.getAdminAuthToken = user ? function () { return user.getIdToken(); } : null;
        if (user) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('admin-panel-wrap').classList.add('visible');
            applyMasterUI();
            initializePanel();
        } else {
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('admin-panel-wrap').classList.remove('visible');
        }
    });

    document.getElementById('login-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('login-email')?.value?.trim() || '';
        const password = document.getElementById('login-password')?.value || '';
        const errEl = document.getElementById('login-error');
        const btn = document.getElementById('btn-login-submit');
        if (!email || !password) {
            errEl.textContent = 'Preencha e-mail e senha.';
            errEl.classList.add('show');
            return;
        }
        errEl.classList.remove('show');
        if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
        try {
            await auth.signInWithEmailAndPassword(email, password);
            errEl.classList.remove('show');
        } catch (err) {
            errEl.textContent = err.message || 'Falha no login. Verifique e-mail e senha.';
            errEl.classList.add('show');
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    });

    document.getElementById('btn-logout')?.addEventListener('click', function () {
        auth.signOut();
    });

    document.querySelectorAll('.admin-tabs .tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            if (tab.classList.contains('hidden')) return;
            const t = tab.getAttribute('data-tab');
            document.querySelectorAll('.admin-tabs .tab').forEach(function (x) { x.classList.remove('active'); });
            tab.classList.add('active');
            document.getElementById('main-licenses').style.display = t === 'licenses' ? 'block' : 'none';
            document.getElementById('main-admin').style.display = t === 'admin' ? 'block' : 'none';
            document.getElementById('main-admin').setAttribute('aria-hidden', t !== 'admin');
        });
    });
});

function applyMasterUI() {
    var isMaster = typeof isMasterUser === 'function' ? isMasterUser() : false;
    var tabAdmin = document.getElementById('tab-admin');
    if (tabAdmin) tabAdmin.classList.toggle('hidden', !isMaster);
}

function initializePanel() {
    setupEventListeners();
    loadMain();
}

function setupEventListeners() {
    document.getElementById('btn-open-create-modal')?.addEventListener('click', openCreateModal);
    document.getElementById('modal-create-close')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-create-cancel')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-create-submit')?.addEventListener('click', submitCreateLicense);
    document.getElementById('btn-create-copy')?.addEventListener('click', copyCreatedLicense);

    document.getElementById('modal-edit-close')?.addEventListener('click', closeEditModal);
    document.getElementById('btn-edit-cancel')?.addEventListener('click', closeEditModal);
    document.getElementById('btn-edit-submit')?.addEventListener('click', submitEditLicense);

    document.getElementById('confirm-modal')?.addEventListener('click', (e) => { if (e.target.id === 'confirm-modal') closeModal(); });
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-confirm')?.addEventListener('click', confirmAction);
    document.getElementById('btn-cancel')?.addEventListener('click', closeModal);

    document.getElementById('btn-export')?.addEventListener('click', exportLicenses);
    document.getElementById('btn-copy-export')?.addEventListener('click', copyExport);
    document.getElementById('btn-import')?.addEventListener('click', importLicenses);
    document.getElementById('btn-toggle-import-export')?.addEventListener('click', () => {
        const body = document.getElementById('import-export-body');
        const btn = document.getElementById('btn-toggle-import-export');
        if (body && btn) {
            body.classList.toggle('show');
            btn.setAttribute('aria-expanded', body.classList.contains('show'));
        }
    });

    document.getElementById('btn-create-panel-user')?.addEventListener('click', createPanelUserSubmit);
}

async function createPanelUserSubmit() {
    var emailEl = document.getElementById('panel-user-email');
    var passEl = document.getElementById('panel-user-password');
    var confirmEl = document.getElementById('panel-user-password-confirm');
    var errEl = document.getElementById('panel-user-error');
    var btn = document.getElementById('btn-create-panel-user');
    var email = (emailEl && emailEl.value || '').trim().toLowerCase();
    var password = (passEl && passEl.value) || '';
    var passwordConfirm = (confirmEl && confirmEl.value) || '';
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (!email) {
        if (errEl) { errEl.textContent = 'Informe o e-mail.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        return;
    }
    if (password.length < 6) {
        if (errEl) { errEl.textContent = 'A senha deve ter no mínimo 6 caracteres.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        return;
    }
    if (password !== passwordConfirm) {
        if (errEl) { errEl.textContent = 'A confirmação da senha não confere.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        return;
    }
    var apiUrl = typeof CREATE_PANEL_USER_API_URL !== 'undefined' ? CREATE_PANEL_USER_API_URL : '';
    if (!apiUrl) {
        if (errEl) { errEl.textContent = 'Configure CREATE_PANEL_USER_API_URL no firebase-config.js.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        return;
    }
    if (!currentUser) {
        if (errEl) { errEl.textContent = 'Sessão expirada. Faça login novamente.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
    try {
        var token = await currentUser.getIdToken();
        var res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ email: email, password: password })
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.success) {
            showAlert('Acesso criado. O usuário já pode entrar com esse e-mail e senha.', 'success');
            if (emailEl) emailEl.value = '';
            if (passEl) passEl.value = '';
            if (confirmEl) confirmEl.value = '';
        } else {
            if (errEl) { errEl.textContent = data.error || 'Não foi possível criar o acesso. Tente novamente.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
        }
    } catch (e) {
        if (errEl) { errEl.textContent = 'Erro de conexão. Verifique a URL da API.'; errEl.style.display = 'block'; errEl.classList.add('alert-error'); }
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Gerar acesso'; }
}

async function loadMain() {
    if (!currentUser || !currentUser.uid) return;
    licenseManager.setOwnerId(currentUser.uid);
    if (isMasterUser() && typeof migrateUnassignedLicensesToOwner === 'function') {
        try {
            var migrationKey = 'lovable_migration_owner_done';
            if (!localStorage.getItem(migrationKey)) {
                var r = await migrateUnassignedLicensesToOwner(currentUser.uid);
                if (r.migrated > 0) localStorage.setItem(migrationKey, '1');
            }
        } catch (e) {}
    }
    await licenseManager.loadLicenses();
    const stats = await licenseManager.getStats();
    allLicensesCache = licenseManager.licenses;

    const statsGrid = document.getElementById('stats-grid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">Total</div></div>
            <div class="stat-card"><div class="stat-number">${stats.active}</div><div class="stat-label">Ativas</div></div>
            <div class="stat-card"><div class="stat-number">${stats.activated}</div><div class="stat-label">Ativadas</div></div>
            <div class="stat-card"><div class="stat-number">${stats.expired}</div><div class="stat-label">Expiradas</div></div>
            <div class="stat-card"><div class="stat-number">${stats.expiringSoon ?? 0}</div><div class="stat-label">Expirando em breve</div></div>
        `;
    }

    renderTable(allLicensesCache);
    attachTableButtonListeners();
}

function renderTable(licenses) {
    const tbody = document.getElementById('licenses-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    licenses.forEach(license => {
        const tr = document.createElement('tr');
        let statusClass = 'status-inactive';
        let statusText = 'Inativa';
        if (license.active) {
            statusClass = isExpired(license) ? 'status-inactive' : (isExpiringSoon(license) ? 'status-expiring' : 'status-active');
            statusText = isExpired(license) ? 'Expirada' : (isExpiringSoon(license) ? 'Expirando' : 'Ativa');
        }
        const activatedText = license.activated ? 'Sim' : 'Não';
        const expiryDisplay = license.lifetime ? 'Vitalício' : new Date(license.expiryDate).toLocaleDateString('pt-BR');

        tr.innerHTML = `
            <td><div class="license-key">${escapeHtml(license.key)}</div></td>
            <td>${escapeHtml(license.userName || '—')}</td>
            <td>${escapeHtml(license.userPhone || '—')}</td>
            <td><span class="status-badge-small ${statusClass}">${statusText}</span></td>
            <td>${activatedText}</td>
            <td>${expiryDisplay}</td>
            <td>
                <div class="action-buttons">
                    <button type="button" class="action-btn-small btn-edit" data-key="${escapeAttr(license.key)}">Editar</button>
                    <button type="button" class="action-btn-small btn-copy" data-key="${escapeAttr(license.key)}">Copiar</button>
                    <button type="button" class="action-btn-small btn-toggle" data-key="${escapeAttr(license.key)}" data-active="${license.active}">${license.active ? 'Desativar' : 'Ativar'}</button>
                    <button type="button" class="action-btn-small delete btn-delete" data-key="${escapeAttr(license.key)}">Deletar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (licenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px;">Nenhuma licença encontrada</td></tr>';
    }
    attachTableButtonListeners();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function attachTableButtonListeners() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            openEditModal(key);
        });
    });
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            copyLicense(key, e.currentTarget);
        });
    });
    document.querySelectorAll('.btn-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            const active = e.currentTarget.getAttribute('data-active') === 'true';
            toggleLicense(key, !active);
        });
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            deleteLicenseConfirm(key);
        });
    });
}

function openCreateModal() {
    document.getElementById('create-user-name').value = '';
    document.getElementById('create-user-phone').value = '';
    document.getElementById('create-license-lifetime').checked = false;
    document.getElementById('create-expiry-days').value = '30';
    document.getElementById('create-expiry-days-group').style.display = 'block';
    document.getElementById('create-max-uses').value = '';
    document.getElementById('create-result').style.display = 'none';
    document.getElementById('modal-create').classList.add('show');
}

function closeCreateModal() {
    document.getElementById('modal-create').classList.remove('show');
}

function submitCreateLicense() {
    const userName = document.getElementById('create-user-name')?.value.trim() || '';
    const userPhone = document.getElementById('create-user-phone')?.value.trim() || '';
    const isLifetime = document.getElementById('create-license-lifetime')?.checked === true;
    const expiryDays = isLifetime ? 30 : (parseInt(document.getElementById('create-expiry-days')?.value) || 30);
    const maxUsesEl = document.getElementById('create-max-uses');
    const maxUses = maxUsesEl?.value ? parseInt(maxUsesEl.value) : null;

    licenseManager.generateLicense(expiryDays, maxUses, userName, userPhone, isLifetime).then(license => {
        document.getElementById('create-new-license-key').textContent = license.key;
        document.getElementById('create-result').style.display = 'block';
        showAlert('Licença gerada com sucesso. Salva na nuvem.', 'success');
        loadMain();
    }).catch(err => {
        showAlert('Erro ao gerar licença: ' + (err.message || err), 'error');
    });
}

function copyCreatedLicense() {
    const key = document.getElementById('create-new-license-key')?.textContent || '';
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
        showCopyToast(true);
        const btn = document.getElementById('btn-create-copy');
        if (btn) { const t = btn.textContent; btn.textContent = 'Copiado!'; btn.disabled = true; setTimeout(() => { btn.textContent = t; btn.disabled = false; }, 2000); }
    }).catch(() => showCopyToast(false));
}

async function openEditModal(key) {
    const license = await licenseManager.getLicenseInfo(key);
    if (!license) {
        showAlert('Licença não encontrada.', 'error');
        return;
    }
    document.getElementById('edit-license-key').value = license.key;
    document.getElementById('edit-license-key-display').textContent = license.key;
    document.getElementById('edit-user-name').value = license.userName || '';
    document.getElementById('edit-user-phone').value = license.userPhone || '';
    document.getElementById('edit-active').checked = !!license.active;
    document.getElementById('edit-lifetime').checked = !!license.lifetime;
    const expiryGroup = document.getElementById('edit-expiry-group');
    const expiryInput = document.getElementById('edit-expiry-date');
    if (license.lifetime) {
        expiryGroup.style.display = 'none';
    } else {
        expiryGroup.style.display = 'block';
        const d = new Date(license.expiryDate);
        expiryInput.value = d.toISOString().slice(0, 10);
    }
    document.getElementById('edit-max-uses').value = license.maxUses != null && license.maxUses !== '' ? String(license.maxUses) : '';
    document.getElementById('modal-edit').classList.add('show');
}

function closeEditModal() {
    document.getElementById('modal-edit').classList.remove('show');
}

async function submitEditLicense() {
    const key = document.getElementById('edit-license-key').value;
    const userName = document.getElementById('edit-user-name')?.value.trim() || '';
    const userPhone = document.getElementById('edit-user-phone')?.value.trim() || '';
    const active = document.getElementById('edit-active').checked;
    const lifetime = document.getElementById('edit-lifetime').checked;
    const expiryDateInput = document.getElementById('edit-expiry-date').value;
    const maxUsesEl = document.getElementById('edit-max-uses');
    const maxUses = maxUsesEl?.value ? parseInt(maxUsesEl.value) : null;

    let expiryDate;
    if (lifetime) {
        expiryDate = new Date('9999-12-31T23:59:59.999Z').toISOString();
    } else if (expiryDateInput) {
        expiryDate = new Date(expiryDateInput + 'T23:59:59.999Z').toISOString();
    } else {
        showAlert('Informe a data de expiração ou marque vitalícia.', 'error');
        return;
    }

    try {
        await licenseManager.editLicense(key, {
            userName,
            userPhone,
            active,
            lifetime,
            expiryDate,
            maxUses
        });
        showAlert('Licença atualizada.', 'success');
        closeEditModal();
        loadMain();
    } catch (err) {
        showAlert('Erro ao salvar: ' + (err.message || err), 'error');
    }
}

function copyLicense(key, buttonEl) {
    navigator.clipboard.writeText(key).then(() => {
        showCopyToast(true);
        if (buttonEl) { const t = buttonEl.textContent; buttonEl.textContent = 'Copiado!'; buttonEl.disabled = true; setTimeout(() => { buttonEl.textContent = t; buttonEl.disabled = false; }, 2000); }
    }).catch(() => { showCopyToast(false); showAlert('Erro ao copiar.', 'error'); });
}

function showCopyToast(success) {
    const toast = document.getElementById('copy-toast');
    if (!toast) return;
    toast.textContent = success ? 'Copiado!' : 'Erro ao copiar';
    toast.style.background = success ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

async function toggleLicense(key, activate) {
    try {
        if (activate) await licenseManager.reactivateLicense(key);
        else await licenseManager.deactivateLicense(key);
        showAlert(activate ? 'Licença reativada.' : 'Licença desativada.', 'success');
        loadMain();
    } catch (err) {
        showAlert('Erro: ' + (err.message || err), 'error');
    }
}

function deleteLicenseConfirm(key) {
    currentAction = async () => {
        try {
            await licenseManager.deleteLicense(key);
            showAlert('Licença deletada.', 'success');
            closeModal();
            loadMain();
        } catch (err) {
            showAlert('Erro: ' + (err.message || err), 'error');
        }
    };
    showModal('Deletar licença', 'Tem certeza? Esta ação não pode ser desfeita.');
}

async function exportLicenses() {
    try {
        const json = await licenseManager.exportLicenses();
        const textarea = document.getElementById('export-textarea');
        if (textarea) textarea.value = json;
        showAlert('Licenças exportadas.', 'success');
    } catch (err) {
        showAlert('Erro: ' + (err.message || err), 'error');
    }
}

function copyExport() {
    const textarea = document.getElementById('export-textarea');
    if (!textarea?.value) { showAlert('Exporte primeiro.', 'error'); return; }
    navigator.clipboard.writeText(textarea.value).then(() => showAlert('JSON copiado.', 'success')).catch(() => showAlert('Erro ao copiar.', 'error'));
}

async function importLicenses() {
    const textarea = document.getElementById('import-textarea');
    const json = textarea?.value?.trim() || '';
    if (!json) { showAlert('Cole o JSON das licenças.', 'error'); return; }
    try {
        const result = await licenseManager.importLicenses(json);
        showAlert(result.message || 'Importado.', result.success ? 'success' : 'error');
        if (result.success && textarea) textarea.value = '';
        if (result.success) loadMain();
    } catch (err) {
        showAlert('Erro: ' + (err.message || err), 'error');
    }
}

function showAlert(message, type) {
    const el = document.getElementById('alert-main');
    if (!el) return;
    el.textContent = message;
    el.className = 'alert show alert-' + type;
    setTimeout(() => el.classList.remove('show'), 5000);
}

function showModal(title, message) {
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    document.getElementById('confirm-modal')?.classList.add('show');
}

function closeModal() {
    document.getElementById('confirm-modal')?.classList.remove('show');
    currentAction = null;
}

function confirmAction() {
    if (currentAction) currentAction();
}
