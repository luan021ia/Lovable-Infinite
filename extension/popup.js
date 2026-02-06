// Popup - Lovable Infinity (lógica de comunicação PROMPTXV2 + licenciamento Firebase)
(function(){ var n=function(){}; if(typeof console!=='undefined'){ console.log=n; console.info=n; console.debug=n; console.warn=n; console.error=n; } })();

document.addEventListener('DOMContentLoaded', async () => {
    // ============================================
    // VERIFICAÇÃO DE AUTENTICAÇÃO COM LICENÇA + JWT
    // ============================================
    const authData = await chrome.storage.local.get(['isAuthenticated', 'licenseKey', 'sessionToken']);

    if (CONFIG.REQUIRE_LICENSE && (!authData.isAuthenticated || !authData.licenseKey || !authData.sessionToken)) {
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
    const lovableRequiredOverlay = document.getElementById('lovable-required-overlay');
    const logoutBtn = document.getElementById('logout-btn');
    const licenseDaysEl = document.getElementById('license-days');
    const filePreviewContainer = document.getElementById('file-preview-container');
    const screenshotBtn = document.getElementById('screenshot-btn');
    const downloadProjectBtn = document.getElementById('download-project-btn');

    // Storage key for chat per project
    const CHAT_STORAGE_KEY = 'lovable_infinity_chat';
    const MAX_HISTORIES_PER_PROJECT = 20;

    // In-memory mirror of current chat for persistence
    let currentSessionMessages = [];

    // State - Webhook ofuscado (lógica do PROMPTXV2 que funciona)
    const _w = ['aHR0cHM6Ly9jbGVhbnBpZy1uOG4uY2xvdWRmeS5saXZlLw==', 'd2ViaG9vay9oYWhhaDM5M2RtaGFzaA=='];
    const _getW = () => atob(_w[0]) + atob(_w[1]);
    const SECRET_SALT = atob('UFgtVjMtSEFORFNIQUtFLUAjJA==');
    const SCRAMBLE_KEY = atob('UFJPTVBUWC1MT0NLRUQtOTk=');

    let config = {
        webhookUrl: _getW(),
        token: '',
        projectId: ''
    };

    // Load saved settings and captured token from background
    const stored = await chrome.storage.local.get(['lovable_token', 'licenseKey', 'deviceFingerprint']);
    const HWID = stored.deviceFingerprint || 'PX-EXT-CLIENT';

    if (stored.lovable_token) {
        config.token = stored.lovable_token;
        updateTokenDisplay(config.token);
    }

    // ============================================
    // VALIDAÇÃO DE LICENÇA NA ABERTURA (Firebase)
    // ============================================
    async function validateLicenseOnce() {
        const loadingOverlay = document.getElementById('loading-overlay');

        try {
            const authData = await chrome.storage.local.get(['licenseKey']);

            if (!authData.licenseKey) {
                window.location.href = 'auth.html';
                return;
            }

            const result = await validateKeySecure(authData.licenseKey);

            if (!result.valid) {
                await chrome.storage.local.remove(['isAuthenticated', 'licenseKey', 'authTimestamp', 'userData', 'lovable_token', 'deviceFingerprint', 'firebaseDatabaseURL']);
                alert('Acesso negado: ' + result.message);
                window.location.href = 'auth.html';
            } else {
                // Atualizar userData com expiryDate e lifetime
                if (result.license) {
                    const current = await chrome.storage.local.get(['userData']);
                    const userData = { ...(current.userData || {}) };
                    if (result.license.expiryDate) userData.expiryDate = result.license.expiryDate;
                    if (result.license.lifetime === true) userData.lifetime = true;
                    await chrome.storage.local.set({ userData });
                }
                // Garantir deviceFingerprint e firebaseDatabaseURL no storage
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
            licenseDaysEl.textContent = 'Licença ativa';
            licenseDaysEl.style.display = '';
        }
    }

    // Verificar integridade
    const integrityOk = await verifyIntegrity();

    // Executar validação UMA ÚNICA VEZ ao iniciar
    await validateLicenseOnce();

    // ============================================
    // VERIFICAÇÃO JWT OBRIGATÓRIA
    // O token é assinado pelo servidor - não pode ser forjado.
    // Sem JWT válido = sem acesso, mesmo que moque outras respostas.
    // ============================================
    const sessionResult = await verifySessionWithServer();
    if (!sessionResult.valid) {
        // Tentar renovar o token
        const refreshed = await tryRefreshSession();
        if (!refreshed) {
            // JWT inválido/expirado - forçar novo login
            await chrome.storage.local.remove([
                'isAuthenticated', 'licenseKey', 'authTimestamp', 'userData',
                'lovable_token', 'deviceFingerprint', 'firebaseDatabaseURL',
                'sessionToken', 'refreshToken', 'sessionExpiresAt'
            ]);
            alert('Sessão expirada: ' + (sessionResult.message || 'Faça login novamente.'));
            window.location.href = 'auth.html';
            return;
        }
    }

    // Helper: Update UI when token is found
    function updateTokenDisplay(token) {
        if (token) {
            statusBadge.innerHTML = '<span class="status-dot"></span> Ativo';
            statusBadge.style.color = '#10b981';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
            statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
            statusBadge.innerHTML = '<span class="status-dot" style="background:#a1a1aa;box-shadow:none;"></span> Desconectado';
            statusBadge.style.color = '#a1a1aa';
            statusBadge.style.background = 'rgba(161, 161, 170, 0.1)';
            statusBadge.style.borderColor = 'rgba(161, 161, 170, 0.2)';
        }
    }

    // ----- Chat storage (per project) -----
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
        } catch (e) {}
    }

    async function saveCurrentSession(projectId) {
        if (!projectId) return;
        try {
            const result = await chrome.storage.local.get([CHAT_STORAGE_KEY]);
            const root = result[CHAT_STORAGE_KEY] || {};
            if (!root[projectId]) root[projectId] = { current: [], histories: [] };
            root[projectId].current = currentSessionMessages.slice();
            await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: root });
        } catch (e) {}
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
        } catch (e) {}
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
            
            // Botão de copiar para mensagens do usuário
            if (msg.type === 'user' && msg.text) {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'message-copy-btn';
                copyBtn.title = 'Copiar prompt';
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(msg.text);
                        copyBtn.classList.add('copied');
                        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        setTimeout(() => {
                            copyBtn.classList.remove('copied');
                            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        }, 1500);
                    } catch (_) {}
                });
                messageDiv.appendChild(copyBtn);
            }
            
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
        
        // Botão de copiar para mensagens do usuário
        if (type === 'user' && text) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-copy-btn';
            copyBtn.title = 'Copiar prompt';
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    }, 1500);
                } catch (_) {}
            });
            messageDiv.appendChild(copyBtn);
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        currentSessionMessages.push({ text: text, type: type });
        if (config.projectId) saveCurrentSession(config.projectId);
    }

    function addSystemMessage(text) {
        addMessage(text, 'system');
    }

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

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

    function showPreviewForFile(file, dataUrl = null) {
        if (!file && !dataUrl) return;
        filePreviewContainer.style.display = 'flex';
        filePreviewContainer.innerHTML = '';
        
        const isImage = file ? file.type.startsWith('image/') : !!dataUrl;
        const chip = document.createElement('div');
        chip.className = 'file-preview-chip' + (isImage ? ' has-thumbnail' : '');
        
        if (isImage) {
            // Cria miniatura da imagem
            const thumbnail = document.createElement('div');
            thumbnail.className = 'file-thumbnail';
            const img = document.createElement('img');
            
            if (dataUrl) {
                img.src = dataUrl;
            } else {
                // Lê o arquivo para criar preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
            
            img.alt = file ? file.name : 'Screenshot';
            thumbnail.appendChild(img);
            chip.appendChild(thumbnail);
        } else {
            // Ícone de arquivo para não-imagens
            const iconSpan = document.createElement('span');
            iconSpan.className = 'file-icon';
            iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;
            chip.appendChild(iconSpan);
        }
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file ? file.name : 'Screenshot do preview';
        chip.appendChild(nameSpan);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file-btn';
        removeBtn.title = 'Remover';
        removeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        removeBtn.addEventListener('click', () => {
            clearFile();
        });
        chip.appendChild(removeBtn);
        
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

    // Colar imagem (Ctrl+V)
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

    // Envio de mensagem (lógica do PROMPTXV2 que funciona)
    async function sendMessage() {
        const text = messageInput.value.trim();
        const file = currentAttachedFile;

        if (!text && !file) return;

        if (!config.token) {
            const freshStore = await chrome.storage.local.get(['lovable_token']);
            if (freshStore.lovable_token) {
                config.token = freshStore.lovable_token;
                updateTokenDisplay(config.token);
            }
        }

        await captureData();

        if (!config.token || !config.projectId) {
            addSystemMessage('Alerta: Token ou ID do projeto ausentes. Dê um refresh na página.');
            return;
        }

        addMessage(text + (file ? ` [Imagem]` : ''), 'user');
        messageInput.value = '';
        messageInput.style.height = 'auto';
        updateSendButtonState();

        let fileData = null;
        if (file) {
            fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        clearFile();

        try {
            const timeRef = Math.floor(Date.now() / 60000);
            const signature = btoa(timeRef + SECRET_SALT + stored.licenseKey + HWID).slice(0, 20);

            const basicPayload = {
                message: text,
                projectId: config.projectId,
                token: config.token,
                source: 'PX-EXT',
                license: stored.licenseKey,
                hwid: HWID,
                signature: signature
            };

            const scramble = (s, k) => s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i % k.length))).join('');
            const jsonStr = unescape(encodeURIComponent(JSON.stringify(basicPayload)));
            const packed = btoa(scramble(jsonStr, SCRAMBLE_KEY));

            chrome.runtime.sendMessage({
                action: "sendWebhookWithFile",
                url: config.webhookUrl,
                payload: { p: packed },
                file: fileData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    addSystemMessage("Erro: " + chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    const json = response.data || {};
                    if (json.reply) addSystemMessage(json.reply);
                    else addSystemMessage('Enviado com sucesso!');
                } else {
                    addSystemMessage(`Falha: ${response.error || 'Erro interno'}`);
                }
            });
        } catch (error) {
            addSystemMessage(`Erro: ${error.message}`);
        }
    }

    // Limpar histórico da conversa
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
        // Arquiva a conversa atual e limpa o chat (sem confirmação para fluidez)
        await clearChatHistory();
    });

    // Sair: limpar licença/sessão e voltar para a tela de ativação
    logoutBtn.addEventListener('click', async () => {
        if (!confirm('Deseja sair e desativar a licença neste navegador?')) return;
        await chrome.storage.local.remove([
            'isAuthenticated', 'licenseKey', 'authTimestamp', 'userData',
            'deviceFingerprint', 'firebaseDatabaseURL', 'lovable_token',
            'sessionToken', 'refreshToken', 'sessionExpiresAt'
        ]);
        window.location.href = 'auth.html';
    });

    // Screenshot do preview do Lovable
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', async () => {
            // Verifica se está no Lovable com projeto aberto
            if (!config.projectId) {
                addSystemMessage('Abra um projeto no Lovable para capturar o preview.');
                return;
            }

            screenshotBtn.disabled = true;
            screenshotBtn.classList.add('loading');
            
            try {
                const devicePixelRatio = window.devicePixelRatio || 1;
                
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: "capturePreviewScreenshot",
                        devicePixelRatio: devicePixelRatio
                    }, resolve);
                });

                if (response && response.success && response.dataUrl) {
                    // Converte dataUrl para File
                    const res = await fetch(response.dataUrl);
                    const blob = await res.blob();
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    currentAttachedFile = new File([blob], `preview-${timestamp}.png`, { type: 'image/png' });
                    
                    showPreviewForFile(currentAttachedFile, response.dataUrl);
                    updateSendButtonState();
                    addSystemMessage('Screenshot capturado! Envie com sua mensagem.');
                } else {
                    addSystemMessage(response?.error || 'Não foi possível capturar o preview.');
                }
            } catch (error) {
                addSystemMessage('Erro ao capturar: ' + (error.message || 'desconhecido'));
            } finally {
                screenshotBtn.disabled = false;
                screenshotBtn.classList.remove('loading');
            }
        });
    }

    // Download do projeto (beta) – por enquanto apenas esqueleto
    async function downloadProject() {
        // Garante que estamos em um projeto do Lovable e com token
        await captureData();
        if (!config.projectId) {
            addSystemMessage('Abra um projeto no Lovable para baixar o código.');
            return;
        }
        if (!config.token) {
            addSystemMessage('Token do Lovable não encontrado. Recarregue a página do projeto.');
            return;
        }

        if (!downloadProjectBtn) return;
        downloadProjectBtn.disabled = true;
        downloadProjectBtn.classList.add('loading');

        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "downloadProject",
                    projectId: config.projectId,
                    token: config.token
                }, resolve);
            });

            if (response && response.success) {
                addSystemMessage(response.message || 'Download do projeto iniciado!');
            } else {
                addSystemMessage(response?.error || 'Erro ao baixar projeto.');
            }
        } catch (e) {
            addSystemMessage('Erro ao iniciar download do projeto: ' + (e.message || 'desconhecido'));
        } finally {
            downloadProjectBtn.disabled = false;
            downloadProjectBtn.classList.remove('loading');
        }
    }

    // Melhorar prompt: stream da API, texto aparece no input em tempo real
    if (improvePromptBtn) {
        improvePromptBtn.addEventListener('click', async () => {
            const text = messageInput.value.trim();
            if (!text) {
                messageInput.focus();
                return;
            }
            const endpoint = (typeof CONFIG !== 'undefined' && CONFIG.IMPROVE_PROMPT_ENDPOINT) ? CONFIG.IMPROVE_PROMPT_ENDPOINT : '';
            if (!endpoint) {
                addSystemMessage('Melhorador de prompt não configurado.');
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
            
            try {
                // Envia JWT no header para o endpoint seguro
                const _sessionToken = typeof getSessionToken === 'function' ? await getSessionToken() : null;
                const _headers = { 'Content-Type': 'application/json' };
                if (_sessionToken) _headers['Authorization'] = 'Bearer ' + _sessionToken;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: _headers,
                    body: JSON.stringify({ text: text, stream: false })
                });
                
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    addSystemMessage(errData.error || response.statusText || 'Erro ao melhorar prompt.');
                    return;
                }
                
                const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
                const isJson = contentType.includes('application/json');
                let fullText = '';
                
                if (isJson) {
                    const json = await response.json();
                    if (json.error) {
                        addSystemMessage(json.error);
                        return;
                    }
                    const msg = json.text ?? json.choices?.[0]?.message?.content ?? json.message ?? '';
                    fullText = typeof msg === 'string' ? msg.trim() : '';
                } else {
                    // Stream SSE
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    messageInput.value = '';
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n\n');
                        buffer = parts.pop() || '';
                        for (const part of parts) {
                            if (part.startsWith('data: ')) {
                                const payload = part.slice(6).trim();
                                if (payload === '[DONE]') continue;
                                try {
                                    const data = JSON.parse(payload);
                                    const content = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content;
                                    if (content) {
                                        messageInput.value += content;
                                        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                    fullText = messageInput.value;
                }
                
                if (fullText) {
                    messageInput.value = fullText;
                    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    messageInput.scrollTop = messageInput.scrollHeight;
                    updateSendButtonState();
                }
                messageInput.focus();
            } catch (e) {
                addSystemMessage('Erro: ' + (e.message || 'desconhecido'));
            } finally {
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
    }

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    if (downloadProjectBtn) {
        downloadProjectBtn.addEventListener('click', downloadProject);
    }

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
        const projectMatch = tab.url.match(/projects\/([a-zA-Z0-9-]+)/);
        if (projectMatch && projectMatch[1]) {
            config.projectId = projectMatch[1];
        } else {
            config.projectId = '';
        }
        if (!config.token) {
            const freshStore = await chrome.storage.local.get(['lovable_token']);
            if (freshStore.lovable_token) {
                config.token = freshStore.lovable_token;
                updateTokenDisplay(config.token);
            }
        }
    }

    // Atualiza overlay baseado no estado atual
    function updateOverlayState() {
        if (!lovableRequiredOverlay) return;
        
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tab = tabs && tabs[0];
            const url = tab?.url || '';
            const onLovable = isOnLovableTab(url);
            const hasProject = !!config.projectId;
            
            if (!onLovable) {
                // Fora do Lovable completamente
                lovableRequiredOverlay.innerHTML = `
                    <p class="lovable-required-text">Abra o Lovable.dev para usar a extensão.</p>
                    <p class="lovable-required-hint">A extensão só funciona em abas de projeto do Lovable.</p>
                `;
                lovableRequiredOverlay.style.display = 'flex';
            } else if (!hasProject) {
                // No Lovable, mas sem projeto aberto
                lovableRequiredOverlay.innerHTML = `
                    <p class="lovable-required-text">Acesse um projeto para começar</p>
                    <p class="lovable-required-hint">Selecione ou crie um projeto no Lovable para editar.</p>
                `;
                lovableRequiredOverlay.style.display = 'flex';
            } else {
                // No Lovable com projeto aberto
                lovableRequiredOverlay.style.display = 'none';
            }
        });
    }

    // Captura dados e carrega histórico no carregamento inicial
    let currentProjectId = '';
    
    async function initializeForCurrentTab() {
        await captureData();
        
        // Se mudou de projeto, recarrega o histórico
        if (config.projectId !== currentProjectId) {
            currentProjectId = config.projectId;
            currentSessionMessages = [];
            chatContainer.replaceChildren();
            
            if (config.projectId) {
                await loadChatState(config.projectId);
            }
        }
        
        updateOverlayState();
    }
    
    // Inicialização
    await initializeForCurrentTab();
    
    // Detecta quando a aba atualiza (navegação, refresh)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        // Só processa se a URL mudou e o carregamento completou
        if (changeInfo.status === 'complete' && tab.active) {
            await initializeForCurrentTab();
        }
    });
    
    // Detecta quando o usuário troca de aba
    chrome.tabs.onActivated.addListener(async () => {
        await initializeForCurrentTab();
    });

    // Listen for storage changes in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.lovable_token) {
            config.token = changes.lovable_token.newValue;
            updateTokenDisplay(config.token);
        }
    });

    // Initial state check
    updateSendButtonState();
});
