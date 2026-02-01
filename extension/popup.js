document.addEventListener('DOMContentLoaded', async () => {
    // ============================================
    // VERIFICAÇÃO DE AUTENTICAÇÃO COM LICENÇA
    // ============================================
    
    // Verificar se tem licença ativa
    const authData = await chrome.storage.local.get(['isAuthenticated', 'licenseKey']);

    // Se CONFIG.REQUIRE_LICENSE for true e não tiver licença, redirecionar
    if (CONFIG.REQUIRE_LICENSE && (!authData.isAuthenticated || !authData.licenseKey)) {
        window.location.href = 'auth.html';
        return;
    }

    // Elements
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const attachBtn = document.getElementById('attach-btn');
    const statusBadge = document.getElementById('status-badge');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const historyListBtn = document.getElementById('history-list-btn');
    const historyDropdown = document.getElementById('history-dropdown');
    const historyDropdownList = document.getElementById('history-dropdown-list');
    const historyDropdownEmpty = document.getElementById('history-dropdown-empty');
    const lovableRequiredOverlay = document.getElementById('lovable-required-overlay');
    const logoutBtn = document.getElementById('logout-btn');
    const licenseDaysEl = document.getElementById('license-days');

    // Storage key for chat per project (isolated from auth/token/license keys)
    const CHAT_STORAGE_KEY = 'lovable_infinity_chat';
    const MAX_HISTORIES_PER_PROJECT = 20;

    // In-memory mirror of current chat for persistence
    let currentSessionMessages = [];

    // State - Webhook ofuscado
    const _w = ['aHR0cHM6Ly9ha3NvZnR3YXJlLW44bi5jbG91ZGZ5LmxpdmUv', 'd2ViaG9vay9wcm9tcHR4ZXhl'];
    const _getW = () => atob(_w[0]) + atob(_w[1]);

    let config = {
        webhookUrl: _getW(),
        token: '',
        projectId: ''
    };

    // Load saved settings and captured token from background
    const stored = await chrome.storage.local.get(['lovable_token', 'licenseKey']);

    // Tenta pegar o token que o background.js pode ter salvo
    if (stored.lovable_token) {
        config.token = stored.lovable_token;
        updateTokenDisplay(config.token);
    }

    // ============================================
    // 🔒 VALIDAÇÃO ÚNICA DE LICENÇA NA ABERTURA
    // ============================================

    /**
     * Valida a licença UMA ÚNICA VEZ na abertura
     * Com device fingerprint, não precisa revalidar periodicamente
     */
    async function validateLicenseOnce() {
        const loadingOverlay = document.getElementById('loading-overlay');

        try {
            const authData = await chrome.storage.local.get(['licenseKey']);

            if (!authData.licenseKey) {
                // Se não tem chave, joga pro login
                window.location.href = 'auth.html';
                return;
            }

            console.log('[Popup] Validando licença na abertura...');
            // Validação única
            const result = await validateKeySecure(authData.licenseKey);

            if (!result.valid) {
                console.error('[Popup] Licença inválida:', result.message);
                // Limpar autenticação
                await chrome.storage.local.remove(['isAuthenticated', 'licenseKey', 'authTimestamp', 'userData', 'lovable_token', 'deviceFingerprint', 'firebaseDatabaseURL']);
                alert('Acesso negado: ' + result.message);
                window.location.href = 'auth.html';
            } else {
                console.log('[Popup] Licença válida - Acesso permanente concedido');
                // Atualizar userData com expiryDate e lifetime para exibir no header
                if (result.license) {
                    const current = await chrome.storage.local.get(['userData']);
                    const userData = { ...(current.userData || {}) };
                    if (result.license.expiryDate) userData.expiryDate = result.license.expiryDate;
                    if (result.license.lifetime === true) userData.lifetime = true;
                    await chrome.storage.local.set({ userData });
                }
                // Garantir deviceFingerprint e firebaseDatabaseURL no storage (para heartbeat de sessão no background)
                const sess = await chrome.storage.local.get(['deviceFingerprint', 'firebaseDatabaseURL']);
                if (!sess.deviceFingerprint || !sess.firebaseDatabaseURL) {
                    const fp = await getDeviceFingerprint();
                    const dbUrl = (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) ? FIREBASE_CONFIG.databaseURL : '';
                    await chrome.storage.local.set({ deviceFingerprint: fp, firebaseDatabaseURL: dbUrl });
                }
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                await updateLicenseDaysDisplay();
            }
        } catch (error) {
            console.error('[Popup] Erro fatal na validação:', error);
            // Em caso de erro de rede, avisar mas não bloquear
            console.warn('[Popup] Erro de conexão ao validar licença');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
            await updateLicenseDaysDisplay();
        }
    }

    /**
     * Calcula dias restantes da licença e atualiza o texto no header
     */
    async function updateLicenseDaysDisplay() {
        if (!licenseDaysEl) return;
        const stored = await chrome.storage.local.get(['userData', 'devLicenseFirstUsed']);

        if (stored.userData && stored.userData.lifetime === true) {
            licenseDaysEl.textContent = 'Vitalício';
            licenseDaysEl.style.display = '';
            return;
        }

        const dayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        let daysLeft = null;

        if (stored.userData && stored.userData.expiryDate) {
            const expiry = new Date(stored.userData.expiryDate).getTime();
            if (expiry > now) daysLeft = Math.ceil((expiry - now) / dayMs);
        } else if (stored.devLicenseFirstUsed && typeof CONFIG !== 'undefined' && CONFIG.DEV_LICENSE_DAYS) {
            const firstUsed = new Date(stored.devLicenseFirstUsed).getTime();
            const elapsed = (now - firstUsed) / dayMs;
            daysLeft = Math.ceil(CONFIG.DEV_LICENSE_DAYS - elapsed);
            if (daysLeft < 0) daysLeft = 0;
        }

        if (daysLeft !== null && daysLeft >= 0) {
            licenseDaysEl.textContent = daysLeft === 0 ? 'Último dia' : (daysLeft === 1 ? '1 dia restante' : daysLeft + ' dias restantes');
            licenseDaysEl.style.display = '';
        } else {
            licenseDaysEl.textContent = '';
            licenseDaysEl.style.display = 'none';
        }
    }

    // Verificar integridade
    const integrityOk = await verifyIntegrity();
    if (!integrityOk) {
        console.warn('[Popup] Modificação detectada');
    }

    // Executar validação UMA ÚNICA VEZ ao iniciar
    console.log('[Popup] Iniciando validação de licença...');
    await validateLicenseOnce();




    // Helper: Update UI when token is found
    function updateTokenDisplay(token) {
        if (token) {
            statusBadge.innerText = 'Ativo';
            statusBadge.style.color = 'var(--success)';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
            statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        } else {
            statusBadge.innerText = 'Desconectado';
            statusBadge.style.color = 'var(--text-secondary)';
            statusBadge.style.background = 'rgba(161, 161, 170, 0.1)';
            statusBadge.style.borderColor = 'rgba(161, 161, 170, 0.2)';
        }
    }

    // ----- Chat storage (per project): only CHAT_STORAGE_KEY, never touch auth/token keys -----
    async function loadChatState(projectId) {
        if (!projectId) return;
        try {
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const data = result[CHAT_STORAGE_KEY] && result[CHAT_STORAGE_KEY][projectId];
            const current = data && data.current && Array.isArray(data.current) ? data.current : [];
            currentSessionMessages = current.slice();
            if (current.length > 0) {
                renderMessagesToChat(current);
            }
        } catch (e) {
            console.warn('[Popup] loadChatState:', e);
        }
    }

    async function saveCurrentSession(projectId) {
        if (!projectId) return;
        try {
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const root = result[CHAT_STORAGE_KEY] || {};
            if (!root[projectId]) root[projectId] = { current: [], histories: [] };
            root[projectId].current = currentSessionMessages.slice();
            await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: root });
        } catch (e) {
            console.warn('[Popup] saveCurrentSession:', e);
        }
    }

    function formatHistoryTitle(dateStr) {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `Conversa ${day}/${month} ${h}:${m}`;
    }

    async function addToHistories(projectId, title) {
        if (!projectId || currentSessionMessages.length === 0) return;
        try {
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const root = result[CHAT_STORAGE_KEY] || {};
            if (!root[projectId]) root[projectId] = { current: [], histories: [] };
            const histories = root[projectId].histories || [];
            const entry = {
                id: 'h-' + Date.now(),
                title: title || formatHistoryTitle(new Date().toISOString()),
                messages: currentSessionMessages.slice(),
                createdAt: new Date().toISOString()
            };
            histories.unshift(entry);
            if (histories.length > MAX_HISTORIES_PER_PROJECT) histories.length = MAX_HISTORIES_PER_PROJECT;
            root[projectId].histories = histories;
            root[projectId].current = [];
            await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: root });
        } catch (e) {
            console.warn('[Popup] addToHistories:', e);
        }
    }

    function renderMessagesToChat(messages) {
        chatContainer.replaceChildren();
        if (!Array.isArray(messages)) return;
        messages.forEach(function (msg) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (msg.type || 'system');
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = msg.text || '';
            messageDiv.appendChild(contentDiv);
            chatContainer.appendChild(messageDiv);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Chat Logic
    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = text;

        messageDiv.appendChild(contentDiv);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        currentSessionMessages.push({ text: text, type: type });
        if (config.projectId) saveCurrentSession(config.projectId);
    }

    function addSystemMessage(text) {
        addMessage(text, 'system');
    }

    // Elements
    const filePreviewContainer = document.getElementById('file-preview-container');

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Helper: Update Send Button State
    function updateSendButtonState() {
        const hasText = messageInput.value.trim().length > 0;
        const hasFile = fileInput.files.length > 0;

        if (hasText || hasFile) {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', 'true');
        }
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            // Show preview
            filePreviewContainer.style.display = 'flex';

            // Clear previous previews (since we only support 1 file for now, based on logic)
            filePreviewContainer.innerHTML = '';

            const file = fileInput.files[0];

            // Create Chip
            const chip = document.createElement('div');
            chip.className = 'file-preview-chip';

            chip.innerHTML = `
                <span class="file-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                </span>
                <span class="file-name">${file.name}</span>
                <button class="remove-file-btn" title="Remover">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;

            // Add remove logic
            chip.querySelector('.remove-file-btn').addEventListener('click', () => {
                clearFile();
            });

            filePreviewContainer.appendChild(chip);

            // Highlight attach button
            attachBtn.classList.add('active');

            // Focus back on input
            messageInput.focus();
        }
        updateSendButtonState();
    });

    function clearFile() {
        fileInput.value = '';
        filePreviewContainer.style.display = 'none';
        attachBtn.classList.remove('active');
        updateSendButtonState();
    }

    async function sendMessage() {
        const text = messageInput.value.trim();
        const file = fileInput.files.length > 0 ? fileInput.files[0] : null;

        // Must have either text or file
        if (!text && !file) return;

        // ... existing webhook checks ...
        if (!config.webhookUrl) {
            addSystemMessage('Erro: Webhook URL não configurada.');
            return;
        }

        // Check if we need to refresh token from storage
        if (!config.token) {
            const freshStore = await chrome.storage.local.get(['lovable_token']);
            if (freshStore.lovable_token) {
                config.token = freshStore.lovable_token;
                updateTokenDisplay(config.token);
            }
        }

        // Refresh project ID from current tab if needed
        await captureData();

        if (!config.token || !config.projectId) {
            addSystemMessage('Alerta: Token ou ID do projeto ausentes. Dê um refresh na página do Lovable para capturar.');
            return;
        }

        // Add user message to UI
        const messageContent = text + (file ? ` [Imagem enviada]` : '');
        addMessage(messageContent, 'user');

        messageInput.value = '';
        messageInput.style.height = 'auto';
        updateSendButtonState();

        // Prepare Payload and File Data
        let fileData = null;
        if (file) {
            try {
                fileData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        name: file.name,
                        type: file.type,
                        data: reader.result
                    });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            } catch (e) {
                addSystemMessage("Erro ao processar arquivo: " + e.message);
                return;
            }
        }

        // Clear file input AFTER processing
        clearFile();

        // Send to Webhook via BACKGROUND
        try {
            chrome.runtime.sendMessage({
                action: "sendWebhookWithFile",
                url: config.webhookUrl,
                payload: {
                    message: text,
                    projectId: config.projectId,
                    token: config.token,
                    timestamp: new Date().toISOString(),
                    chatMode: false
                },
                file: fileData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    addSystemMessage("Erro: " + chrome.runtime.lastError.message);
                    return;
                }

                if (response && response.success) {
                    const json = response.data || {};
                    if (json.reply) addSystemMessage(json.reply);
                    else addSystemMessage('Mensagem enviada com sucesso!');
                } else {
                    addSystemMessage(`Erro ao enviar: ${response.error || 'Desconhecido'}`);
                }
            });

        } catch (error) {
            addSystemMessage(`Erro interno: ${error.message}`);
        }
    }

    // Limpar histórico da conversa (salva em Histórico antes se houver projeto e mensagens)
    async function clearChatHistory() {
        if (config.projectId && currentSessionMessages.length > 0) {
            await addToHistories(config.projectId, formatHistoryTitle(new Date().toISOString()));
        }
        currentSessionMessages = [];
        chatContainer.replaceChildren();
        if (config.projectId) await saveCurrentSession(config.projectId);
    }

    clearHistoryBtn.addEventListener('click', async () => {
        if (chatContainer.children.length === 0) return;
        if (confirm('Limpar todo o histórico da conversa?')) {
            await clearChatHistory();
        }
    });

    // Sair: limpar licença/sessão e voltar para a tela de ativação
    logoutBtn.addEventListener('click', async () => {
        if (!confirm('Deseja sair e desativar a licença neste navegador?')) return;
        await chrome.storage.local.remove([
            'isAuthenticated', 'licenseKey', 'authTimestamp', 'userData',
            'deviceFingerprint', 'firebaseDatabaseURL', 'lovable_token'
        ]);
        window.location.href = 'auth.html';
    });

    // Histórico: abrir lista de conversas salvas do projeto atual
    historyListBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!config.projectId) {
            if (historyDropdown.style.display === 'none') return;
            historyDropdown.style.display = 'none';
            return;
        }
        const isOpen = historyDropdown.style.display !== 'none';
        if (isOpen) {
            historyDropdown.style.display = 'none';
            return;
        }
        try {
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const data = result[CHAT_STORAGE_KEY] && result[CHAT_STORAGE_KEY][config.projectId];
            const histories = (data && data.histories && Array.isArray(data.histories)) ? data.histories : [];
            historyDropdownList.innerHTML = '';
            historyDropdownEmpty.style.display = histories.length === 0 ? 'block' : 'none';
            histories.forEach(function (entry) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'history-dropdown-item';
                btn.textContent = entry.title || formatHistoryTitle(entry.createdAt);
                btn.addEventListener('click', function () {
                    if (entry.messages && entry.messages.length > 0) {
                        currentSessionMessages = entry.messages.slice();
                        renderMessagesToChat(entry.messages);
                        if (config.projectId) saveCurrentSession(config.projectId);
                    }
                    historyDropdown.style.display = 'none';
                });
                historyDropdownList.appendChild(btn);
            });
            historyDropdown.style.display = 'flex';
        } catch (err) {
            console.warn('[Popup] Histórico:', err);
            historyDropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', function () {
        if (historyDropdown.style.display !== 'none') historyDropdown.style.display = 'none';
    });
    historyDropdown.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        updateSendButtonState();
    });

    function isOnLovableTab(url) {
        if (!url) return false;
        try {
            const u = new URL(url);
            return u.origin === 'https://lovable.dev';
        } catch (_) {
            return false;
        }
    }

    async function captureData() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url) {
            config.projectId = '';
            return;
        }

        if (!isOnLovableTab(tab.url)) {
            config.projectId = '';
            return;
        }

        // 1. Get Project ID from URL
        const projectMatch = tab.url.match(/projects\/([a-zA-Z0-9-]+)/);
        if (projectMatch && projectMatch[1]) {
            config.projectId = projectMatch[1];
        } else {
            config.projectId = '';
            console.log("No project ID found in URL");
        }

        // Se a gente ainda não tem o token, tenta o background
        if (!config.token) {
            const freshStore = await chrome.storage.local.get(['lovable_token']);
            if (freshStore.lovable_token) {
                config.token = freshStore.lovable_token;
                updateTokenDisplay(config.token);
            }
        }
    }

    function updateLovableRequiredOverlay() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tab = tabs && tabs[0];
            const onLovable = tab && tab.url && isOnLovableTab(tab.url);
            if (lovableRequiredOverlay) {
                lovableRequiredOverlay.style.display = onLovable ? 'none' : 'flex';
            }
        });
    }

    // Initial capture on open, then load chat state for this project
    await captureData();
    updateLovableRequiredOverlay();
    if (config.projectId) loadChatState(config.projectId);

    // Verificar periodicamente se a aba ativa é Lovable (painel pode ficar aberto ao trocar de aba)
    setInterval(function () {
        updateLovableRequiredOverlay();
        chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
            const tab = tabs && tabs[0];
            if (tab && tab.url && isOnLovableTab(tab.url)) {
                await captureData();
            }
        });
    }, 1500);

    // Tentar capturar token do content script ao abrir o popup
    function requestTokenFromContent() {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) {
                    console.log('[Popup] Nenhuma aba ativa encontrada');
                    return;
                }
                
                const tab = tabs[0];
                if (tab && tab.url && tab.url.includes('lovable.dev')) {
                    console.log('[Popup] Enviando getToken para tab:', tab.id);
                    
                    chrome.tabs.sendMessage(tab.id, { action: 'getToken' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('[Popup] Erro ao enviar mensagem:', chrome.runtime.lastError.message);
                            return;
                        }
                        
                        if (response && response.token) {
                            config.token = response.token;
                            updateTokenDisplay(config.token);
                            console.log('[Popup] Token obtido do content script:', config.token.substring(0, 20) + '...');
                        } else {
                            console.log('[Popup] Nenhum token retornado do content script');
                        }
                    });
                } else {
                    console.log('[Popup] Aba ativa não é lovable.dev');
                }
            });
        } catch (error) {
            console.error('[Popup] Erro ao solicitar token:', error);
        }
    }
    
    // Solicitar token do content script com delay para garantir que está injetado
    setTimeout(() => {
        console.log('[Popup] Solicitando token do content script...');
        requestTokenFromContent();
    }, 500);

    // Listen for storage changes in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.lovable_token) {
            config.token = changes.lovable_token.newValue;
            updateTokenDisplay(config.token);
            console.log('[Popup] Token atualizado via storage listener');
        }
    });

    // Initial state check
    updateSendButtonState();
});
