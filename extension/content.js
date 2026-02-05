// ============================================
// CONTENT SCRIPT - Lovable Infinity
// ============================================

// Listener para mensagens do background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Backup method: try to read token from LocalStorage
  if (request.action === "getToken") {
    let token = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        // Procura por token no localStorage
        if (val && val.includes("ey") && val.includes("access_token")) {
          try {
            const parsed = JSON.parse(val);
            if (parsed.access_token || parsed.session?.access_token) {
              token = parsed.access_token || parsed.session.access_token;
              break;
            }
          } catch (e) { }
        }
      }
    } catch (e) { }
    sendResponse({ token: token });
  }

  // Ping (verificação de script injetado)
  if (request.action === "ping") {
    sendResponse("pong");
  }

  // Token encontrado (Apenas log no console, sem UI)
  if (request.action === "tokenFound") {
    console.log("[Lovable Assistant] Token capturado com sucesso.");
  }

  // Captura screenshot do iframe de preview do Lovable
  if (request.action === "capturePreview") {
    (async () => {
      try {
        // Tenta encontrar o iframe de preview do Lovable
        // O Lovable usa um iframe para mostrar o preview da aplicação
        const previewSelectors = [
          'iframe[title*="preview"]',
          'iframe[title*="Preview"]',
          'iframe[src*="webcontainer"]',
          'iframe[class*="preview"]',
          '[data-testid="preview"] iframe',
          '.preview-container iframe',
          '[class*="PreviewFrame"] iframe',
          'iframe'
        ];

        let previewIframe = null;
        let previewElement = null;

        // Tenta encontrar o iframe específico do preview
        for (const selector of previewSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            // Verifica se o iframe tem dimensões razoáveis (não é um tracker/ad)
            const rect = el.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 200) {
              // Prioriza iframes que parecem ser de preview (maiores, à direita)
              if (!previewIframe || rect.width > previewIframe.getBoundingClientRect().width) {
                previewIframe = el;
              }
            }
          }
          if (previewIframe) break;
        }

        // Se não encontrou iframe, tenta capturar a área de preview diretamente
        if (!previewIframe) {
          const previewAreaSelectors = [
            '[data-testid="preview"]',
            '.preview-container',
            '[class*="Preview"]',
            '[class*="preview"]',
            'main > div:last-child' // Área direita geralmente é o preview
          ];

          for (const selector of previewAreaSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 200 && rect.height > 200) {
                previewElement = el;
                break;
              }
            }
          }
        }

        if (!previewIframe && !previewElement) {
          sendResponse({ success: false, error: 'Preview não encontrado. Abra um projeto com preview.' });
          return;
        }

        // Obtém as coordenadas do elemento para captura
        const targetEl = previewIframe || previewElement;
        const rect = targetEl.getBoundingClientRect();

        // Solicita captura da aba visível ao background
        sendResponse({ 
          success: true, 
          needsCapture: true,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });

      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indica resposta assíncrona
  }
});
