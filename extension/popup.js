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
    const improvePromptBtn = document.getElementById('improve-prompt-btn');
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

    // Um único anexo: do input de arquivo OU colado (Ctrl+V)
    let currentAttachedFile = null;

    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Helper: Update Send Button State
    function updateSendButtonState() {
        const hasText = messageInput.value.trim().length > 0;
        const hasFile = !!currentAttachedFile;

        if (hasText || hasFile) {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', 'true');
        }
    }

    /**
     * Remove formatação markdown do texto para evitar problemas com o Lovable
     * Converte: # Título -> Título:, - item -> item, **bold** -> bold, etc.
     */
    function sanitizeMarkdown(text) {
        if (!text) return '';

        return text
            // Remove headers markdown (# ## ### etc) e adiciona dois-pontos
            .replace(/^#{1,6}\s+(.+)$/gm, '$1:')
            // Remove asteriscos de bold/italic
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            // Remove backticks de código
            .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
            // Remove marcadores de lista (- ou *) - usa hífen simples para compatibilidade
            .replace(/^[-*]\s+/gm, '- ')
            // Remove linhas horizontais
            .replace(/^[-*_]{3,}$/gm, '')
            // Remove links markdown [text](url) -> text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove múltiplas quebras de linha
            .replace(/\n{3,}/g, '\n\n')
            // Trim final
            .trim();
    }

    function showPreviewForFile(file) {
        if (!file) return;
        filePreviewContainer.style.display = 'flex';
        filePreviewContainer.innerHTML = '';

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

        chip.querySelector('.remove-file-btn').addEventListener('click', () => {
            clearFile();
        });

        filePreviewContainer.appendChild(chip);
        attachBtn.classList.add('active');
        messageInput.focus();
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            currentAttachedFile = fileInput.files[0];
            showPreviewForFile(currentAttachedFile);
        }
        updateSendButtonState();
    });

    // Colar imagem (Ctrl+V): print ou imagem copiada
    messageInput.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.indexOf('image/') === 0) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (!blob) return;
                const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' || blob.type === 'image/jpg' ? 'jpg' : 'png';
                currentAttachedFile = new File([blob], `imagem-colada.${ext}`, { type: blob.type });
                fileInput.value = '';
                showPreviewForFile(currentAttachedFile);
                updateSendButtonState();
                return;
            }
        }
    });

    function clearFile() {
        currentAttachedFile = null;
        fileInput.value = '';
        filePreviewContainer.style.display = 'none';
        attachBtn.classList.remove('active');
        updateSendButtonState();
    }

    // Envio: mesma lógica para (1) grampo → anexar → texto → enviar e (2) texto melhorado + imagem (Ctrl+V ou anexo).
    // FormData no background: file primeiro, depois message, projectId, token, timestamp, chatMode (ordem fixa).
    /** Obtém token do background (capturado via webRequest). Fonte mais confiável que o content script. */
    function getTokenFromBackground() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 2000);
            chrome.runtime.sendMessage({ action: 'getToken' }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) resolve(null);
                else resolve(response && response.token ? response.token : null);
            });
        });
    }

    function getTokenFromActiveTab() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 1500);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0) { clearTimeout(timeout); resolve(null); return; }
                const tab = tabs[0];
                if (!tab || !tab.url || !tab.url.includes('lovable.dev')) { clearTimeout(timeout); resolve(null); return; }
                chrome.tabs.sendMessage(tab.id, { action: 'getToken' }, (response) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) resolve(null);
                    else resolve(response && response.token ? response.token : null);
                });
            });
        });
    }

    async function sendMessage() {
        // DEBUG: Log inicial
        console.log('[DEBUG sendMessage] Iniciando envio...');
        console.log('[DEBUG sendMessage] messageInput.value:', messageInput.value);
        console.log('[DEBUG sendMessage] messageInput.readOnly:', messageInput.readOnly);

        // O que está no input (digitado ou colocado pelo Melhorar prompt) + anexo se houver. Mesma lógica sempre.
        const rawText = messageInput.value || '';
        const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        const file = currentAttachedFile;

        console.log('[DEBUG sendMessage] text após trim:', text.substring(0, 100) + '...');
        console.log('[DEBUG sendMessage] file:', file ? file.name : 'null');

        if (!text && !file) return;

        if (!config.webhookUrl) {
            console.error('[Popup] Erro: Webhook URL não configurada.');
            return;
        }

        // Garantir token antes de enviar: background (webRequest) é a fonte mais confiável
        async function ensureToken() {
            if (config.token) return true;
            const fromStorage = await chrome.storage.local.get(['lovable_token']);
            if (fromStorage.lovable_token) {
                config.token = fromStorage.lovable_token;
                updateTokenDisplay(config.token);
                return true;
            }
            const fromBg = await getTokenFromBackground();
            if (fromBg) {
                config.token = fromBg;
                updateTokenDisplay(config.token);
                return true;
            }
            const fromTab = await getTokenFromActiveTab();
            if (fromTab) {
                config.token = fromTab;
                updateTokenDisplay(config.token);
                return true;
            }
            return false;
        }

        await ensureToken();

        await captureData();

        if (file && !config.token) {
            const freshToken = await getTokenFromActiveTab();
            if (freshToken) {
                config.token = freshToken;
                updateTokenDisplay(config.token);
            }
        }

        console.log('[DEBUG sendMessage] config.token:', config.token ? config.token.substring(0, 20) + '...' : 'VAZIO');
        console.log('[DEBUG sendMessage] config.projectId:', config.projectId || 'VAZIO');

        if (!config.token || !config.projectId) {
            console.warn('[Popup] Token ou ID do projeto ausentes. Dê um refresh na página do Lovable e tente de novo.');
            return;
        }

        // Add user message to UI (mesmo texto que será enviado no payload)
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
                console.error('[Popup] Erro ao processar arquivo:', e.message);
                return;
            }
        }

        // Clear file input AFTER processing
        clearFile();

        const payload = {
            message: text,
            projectId: config.projectId,
            token: config.token,
            timestamp: new Date().toISOString(),
            chatMode: false
        };

        console.log('[DEBUG sendMessage] Payload preparado:', JSON.stringify(payload).substring(0, 200) + '...');
        console.log('[DEBUG sendMessage] fileData:', fileData ? { name: fileData.name, type: fileData.type, dataLength: fileData.data?.length } : 'null');

        const doSend = () => {
            try {
                chrome.runtime.sendMessage({
                    action: "sendWebhookWithFile",
                    url: config.webhookUrl,
                    payload,
                    file: fileData
                }, (response) => {
                    console.log('[DEBUG sendMessage] Resposta do webhook:', JSON.stringify(response));
                    if (chrome.runtime.lastError) {
                        console.error('[Popup] Erro:', chrome.runtime.lastError.message);
                        return;
                    }
                    if (response && response.success) {
                        console.log('[Popup] Mensagem enviada com sucesso.');
                        const json = response.data || {};
                        if (json.reply) console.log('[Popup] Resposta:', json.reply);
                    } else {
                        console.error('[Popup] Erro ao enviar:', response?.error || 'Desconhecido');
                    }
                });
            } catch (error) {
                console.error('[Popup] Erro interno:', error.message);
            }
        };

        try {
            // Envio único: o que está no input (digitado ou colocado pelo Melhorar prompt) + anexo se houver. Sem lógica especial.
            doSend();
        } catch (error) {
            console.error('[Popup] Erro interno:', error.message);
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

    // Melhorar prompt: apenas troca o texto no input. O envio continua igual (como se o usuário tivesse digitado).
    improvePromptBtn.addEventListener('click', async () => {
        console.log('[DEBUG Enhanced] INÍCIO - config.token:', config.token ? config.token.substring(0, 20) + '...' : 'VAZIO');
        console.log('[DEBUG Enhanced] INÍCIO - config.projectId:', config.projectId || 'VAZIO');

        const text = messageInput.value.trim();
        if (!text) {
            console.warn('[Popup] Digite algo para melhorar.');
            messageInput.focus();
            return;
        }
        const endpoint = (typeof CONFIG !== 'undefined' && CONFIG.IMPROVE_PROMPT_ENDPOINT) ? CONFIG.IMPROVE_PROMPT_ENDPOINT : '';
        if (!endpoint) {
            console.warn('[Popup] Melhorador de prompt não configurado (IMPROVE_PROMPT_ENDPOINT).');
            return;
        }
        improvePromptBtn.disabled = true;
        improvePromptBtn.classList.add('loading');
        improvePromptBtn.setAttribute('aria-busy', 'true');
        improvePromptBtn.title = 'Melhorando...';
        messageInput.readOnly = true;
        messageInput.classList.add('improving');
        messageInput.placeholder = 'Melhorando prompt...';
        attachBtn.disabled = true;
        sendBtn.disabled = true;
        // Não limpar o input aqui: só substituir quando o primeiro chunk da IA chegar. Se a API falhar, o texto original fica na caixa.
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, stream: false })
            });
            const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
            const isJson = contentType.includes('application/json');
            let fullText = '';

            if (!response.ok) {
                const errText = await response.text();
                let errMsg = 'Erro ao melhorar prompt.';
                try {
                    const errData = JSON.parse(errText);
                    errMsg = errData.error || errData.message || errMsg;
                } catch (_) {
                    if (errText) errMsg = errText.slice(0, 200);
                    else errMsg = response.status + ' ' + (response.statusText || errMsg);
                }
                if (errMsg && (errMsg.includes('resposta vazia') || errMsg.includes('Open Router retornou resposta vazia'))) {
                    errMsg = 'A IA não retornou texto. Verifique OPENROUTER_API_KEY e o modelo no Vercel (Deployments → Logs).';
                }
                console.error('[Popup] Erro ao melhorar prompt:', errMsg);
                return;
            }

            if (isJson) {
                const json = await response.json();
                if (json.error) {
                    console.error('[Popup] Erro da API:', json.error);
                    return;
                }
                const msg = json.text ?? json.choices?.[0]?.message?.content ?? json.choices?.[0]?.delta?.content ?? json.message ?? '';
                if (typeof msg === 'string') fullText = msg.trim();
                else if (Array.isArray(msg)) fullText = msg.map(p => (p && typeof p.text === 'string') ? p.text : (typeof p === 'string' ? p : '')).join('').trim();
                else fullText = '';
            } else {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                const parseDataLine = (payload) => {
                    if (!payload || payload === '[DONE]') return null;
                    try {
                        const data = JSON.parse(payload);
                        const content = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? null;
                        return typeof content === 'string' ? content : null;
                    } catch (_) { return null; }
                };
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const content = parseDataLine(line.slice(6).trim());
                            if (content) {
                                fullText += content;
                                messageInput.value = fullText;
                                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                    }
                }
                if (buffer.startsWith('data: ')) {
                    const content = parseDataLine(buffer.slice(6).trim());
                    if (content) fullText += content;
                }
            }

            if (fullText) {
                // Sanitiza o markdown para evitar problemas com o Lovable
                const cleanText = sanitizeMarkdown(fullText);
                console.log('[DEBUG Enhanced] Texto sanitizado:', cleanText.substring(0, 100) + '...');
                messageInput.value = cleanText;
                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                messageInput.scrollTop = messageInput.scrollHeight;
                updateSendButtonState();
            } else {
                console.error('[Popup] A IA não retornou texto. Verifique OPENROUTER_API_KEY e o modelo no Vercel (Deployments → Logs).');
            }
            messageInput.focus();
        } catch (e) {
            console.error('[Popup] Erro:', e.message || 'desconhecido');
        } finally {
            console.log('[DEBUG Enhanced] FINALLY - config.token:', config.token ? config.token.substring(0, 20) + '...' : 'VAZIO');
            console.log('[DEBUG Enhanced] FINALLY - config.projectId:', config.projectId || 'VAZIO');

            improvePromptBtn.disabled = false;
            improvePromptBtn.classList.remove('loading');
            improvePromptBtn.removeAttribute('aria-busy');
            improvePromptBtn.title = 'Melhorar prompt com IA';
            messageInput.readOnly = false;
            messageInput.classList.remove('improving');
            messageInput.placeholder = 'Enviar mensagem...';
            attachBtn.disabled = false;
            sendBtn.disabled = false;
            updateSendButtonState();
        }
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

    // Tentar capturar token: content script + background (background é a fonte mais confiável)
    function applyTokenIfFound(token, source) {
        if (token) {
            config.token = token;
            updateTokenDisplay(config.token);
            console.log('[Popup] Token obtido do', source + ':', config.token.substring(0, 20) + '...');
        }
    }

    async function requestTokenFromContent() {
        try {
            const tabs = await new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, r));
            if (!tabs || tabs.length === 0) {
                console.log('[Popup] Nenhuma aba ativa encontrada');
                return;
            }
            const tab = tabs[0];
            if (tab && tab.url && tab.url.includes('lovable.dev')) {
                console.log('[Popup] Solicitando token do content script e do background...');
                const fromBg = await getTokenFromBackground();
                if (fromBg) {
                    applyTokenIfFound(fromBg, 'background');
                    return;
                }
                chrome.tabs.sendMessage(tab.id, { action: 'getToken' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('[Popup] Content script:', chrome.runtime.lastError.message);
                        return;
                    }
                    if (response && response.token) applyTokenIfFound(response.token, 'content script');
                    else console.log('[Popup] Nenhum token retornado do content script');
                });
            } else {
                const fromBg = await getTokenFromBackground();
                if (fromBg) applyTokenIfFound(fromBg, 'background');
            }
        } catch (error) {
            console.error('[Popup] Erro ao solicitar token:', error);
        }
    }

    // Polling: token pode ser capturado pelo background quando a página Lovable fizer a primeira requisição
    function startTokenPolling() {
        let attempts = 0;
        const maxAttempts = 6;
        const intervalMs = 1000;
        const poll = async () => {
            if (config.token) return;
            attempts++;
            const fromBg = await getTokenFromBackground();
            if (fromBg) {
                applyTokenIfFound(fromBg, 'background (polling)');
                return;
            }
            const fromStorage = await chrome.storage.local.get(['lovable_token']);
            if (fromStorage.lovable_token) {
                applyTokenIfFound(fromStorage.lovable_token, 'storage (polling)');
                return;
            }
            if (attempts < maxAttempts) setTimeout(poll, intervalMs);
        };
        setTimeout(poll, intervalMs);
    }

    // Solicitar token com delay para content script estar injetado; depois polling para pegar quando background capturar
    setTimeout(() => {
        requestTokenFromContent();
        startTokenPolling();
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
