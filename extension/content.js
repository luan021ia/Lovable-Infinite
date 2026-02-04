/**
 * Content Script - Lovable Infinity
 * Captura token do Lovable interceptando requisições de rede
 */
(function(){ var n=function(){}; if(typeof console!=='undefined'){ console.log=n; console.info=n; console.debug=n; console.warn=n; console.error=n; } })();

// ============================================
// INTERCEPTAÇÃO DE FETCH PARA CAPTURAR TOKEN
// ============================================

// Guardar a fetch original
const originalFetch = window.fetch;

// Interceptar todas as requisições
window.fetch = function(...args) {
    const [resource, config] = args;
    
    // Se for uma requisição para api.lovable.dev com Authorization header
    if (config && config.headers && config.headers['Authorization']) {
        const authHeader = config.headers['Authorization'];
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '').trim();
            if (token.length > 20) {
                console.log('[Content] Token capturado da requisição:', token.substring(0, 20) + '...');
                // Salvar no storage da extensão
                chrome.storage.local.set({ lovable_token: token });
            }
        }
    }
    
    // Chamar fetch original
    return originalFetch.apply(this, args);
};

// ============================================
// LISTENER DE MENSAGENS DO BACKGROUND
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        console.log('[Content] Ping recebido');
        sendResponse("pong");
        return true;
    }
    
    if (request.action === "getToken") {
        let token = null;
        try {
            // Tenta pegar o token do localStorage (múltiplas chaves possíveis)
            const possibleKeys = [
                'lovable_token',
                'auth_token',
                'access_token',
                'token',
                'session_token'
            ];
            
            for (const key of possibleKeys) {
                const val = localStorage.getItem(key);
                if (val && val.startsWith('ey')) {
                    token = val;
                    console.log('[Content] Token encontrado em localStorage:', key);
                    break;
                }
            }
            
            // Se não encontrar em localStorage, procura em sessionStorage
            if (!token) {
                for (const key of possibleKeys) {
                    const val = sessionStorage.getItem(key);
                    if (val && val.startsWith('ey')) {
                        token = val;
                        console.log('[Content] Token encontrado em sessionStorage:', key);
                        break;
                    }
                }
            }
            
            // Se não encontrar, procura em qualquer chave que contenha "token" ou "auth"
            if (!token) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.includes('token') || key.includes('auth'))) {
                        const val = localStorage.getItem(key);
                        if (val && val.startsWith('ey')) {
                            token = val;
                            console.log('[Content] Token encontrado em localStorage:', key);
                            break;
                        }
                    }
                }
            }
            
            console.log('[Content] getToken respondendo com:', token ? token.substring(0, 20) + '...' : 'null');
            sendResponse({ token: token });
            
            // Salvar no storage da extensão se encontrou
            if (token) {
                chrome.storage.local.set({ lovable_token: token });
            }
        } catch (error) {
            console.error('[Content] Erro ao capturar token:', error);
            sendResponse({ token: null });
        }
        return true;
    }
});

/**
 * Capturar ID do projeto da URL
 */
function captureProjectId() {
    try {
        const url = window.location.href;
        const match = url.match(/projects\/([a-zA-Z0-9-]+)/);
        if (match && match[1]) {
            console.log('[Content] Project ID capturado:', match[1]);
            return match[1];
        }
        console.log('[Content] Project ID não encontrado na URL');
        return null;
    } catch (error) {
        console.error('[Content] Erro ao capturar project ID:', error);
        return null;
    }
}

/**
 * Inicializar
 */
function initialize() {
    console.log('[Content] Inicializando...');
    
    // Capturar ID do projeto
    captureProjectId();
    
    console.log('[Content] Inicialização concluída');
}

// Iniciar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Também executar imediatamente
initialize();

console.log('[Content] Content script pronto para capturar dados');
