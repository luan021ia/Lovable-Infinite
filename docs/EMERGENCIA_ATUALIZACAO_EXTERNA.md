# EMERGÊNCIA: Integração de Atualização Externa

> **QUANDO USAR**: Quando receber uma nova versão da extensão base (ex: PromptX, ou qualquer outra fonte) que tem a lógica de comunicação funcionando, mas precisamos manter nosso visual, licenciamento e funcionalidades.

---

## CONTEXTO DO PROBLEMA

Nossa extensão **Lovable Infinity** é composta por duas partes:

1. **LÓGICA DE COMUNICAÇÃO** (webhook, envio de mensagens ao Lovable)
   - Pode quebrar quando o Lovable muda algo na API
   - Geralmente vem corrigida em uma "extensão externa" atualizada

2. **NOSSA CAMADA** (visual, licenciamento, funcionalidades)
   - Design visual (Side Panel, cores, layout)
   - Sistema de licenciamento Firebase
   - Melhorador de prompt
   - Histórico por projeto
   - Screenshot do preview
   - Etc.

**O problema**: Quando a comunicação quebra, recebemos uma versão externa funcionando, mas ela não tem nossas customizações.

**A solução**: Pegar a lógica que funciona da externa e injetar nossas customizações nela.

---

## ARQUIVOS CRÍTICOS - O QUE CADA UM FAZ

### Da extensão EXTERNA (lógica de comunicação):
```
background.js    → Intercepta token, envia webhooks
content.js       → Captura dados da página do Lovable
popup.js         → APENAS a parte de envio de mensagem (função sendMessage, config do webhook)
```

### Da NOSSA extensão (manter intacto):
```
auth.html/js           → Tela de ativação de licença
config.js              → Configurações + validação de licença Firebase
firebase-config.js     → Conexão com Firebase
license-manager.js     → Gerenciamento de licença
styles.css             → Todo o visual
popup.html             → Estrutura do Side Panel
manifest.json          → Permissões e configuração (NOSSO, não o externo)
ICONS/                 → Nossos ícones
```

---

## PROTOCOLO DE INTEGRAÇÃO (PASSO A PASSO)

### FASE 1: Preparação
1. Colocar a extensão externa em uma pasta temporária no workspace
2. Testar se a externa realmente funciona (carregar no Chrome, enviar mensagem)
3. Identificar qual é o segredo dela (geralmente está em `background.js` ou `popup.js`)

### FASE 2: Extração da Lógica
Extrair da extensão externa APENAS:

**background.js** - Copiar:
- Listener `chrome.webRequest.onBeforeSendHeaders` (intercepta token)
- Handler `sendWebhook` e `sendWebhookWithFile`
- Qualquer nova lógica de comunicação

**popup.js** - Copiar:
- Variáveis de webhook (`_w`, `_getW`, `SECRET_SALT`, `SCRAMBLE_KEY`)
- Função `sendMessage()` completa
- Qualquer lógica de scramble/encode do payload

**content.js** - Avaliar:
- Geralmente é simples, mas verificar se há algo novo

### FASE 3: Integração
1. **NÃO substituir arquivos inteiros** - fazer merge manual
2. No `popup.js` da nossa extensão:
   - Substituir as variáveis de webhook pela nova
   - Substituir a função `sendMessage()` pela nova
   - MANTER todo o resto (licenciamento, histórico, UI, etc.)
3. No `background.js`:
   - Atualizar os handlers de webhook
   - MANTER a lógica do Side Panel
4. Testar extensivamente

### FASE 4: Validação
- [ ] Envio de mensagem funciona
- [ ] Anexo de imagem funciona
- [ ] Licenciamento funciona
- [ ] Histórico por projeto funciona
- [ ] Side Panel abre só no Lovable
- [ ] Screenshot do preview funciona
- [ ] Melhorador de prompt funciona
- [ ] Logout funciona

---

## CHECKLIST DE FUNCIONALIDADES NOSSAS (não perder)

```
[ ] Sistema de licenciamento Firebase (config.js, firebase-config.js, license-manager.js)
[ ] Tela de autenticação (auth.html, auth.js)
[ ] Side Panel (manifest.json, popup.html)
[ ] Visual/Design (styles.css)
[ ] Histórico por projeto (popup.js - loadChatState, saveCurrentSession)
[ ] Melhorador de prompt (popup.js - improvePromptBtn listener)
[ ] Screenshot do preview (popup.js, background.js, content.js)
[ ] Botão de copiar prompt (popup.js - addMessage, renderMessagesToChat)
[ ] Miniatura de imagem anexada (popup.js - showPreviewForFile)
[ ] Dias restantes da licença (popup.js - updateLicenseDaysDisplay)
[ ] Validação de licença na abertura (popup.js - validateLicenseOnce)
[ ] Logout (popup.js - logoutBtn listener)
[ ] Limpar conversa (popup.js - clearHistoryBtn listener)
[ ] Detecção de troca de projeto (popup.js - chrome.tabs.onUpdated/onActivated)
```

---

## COMANDO PARA O AGENTE (COPIAR E COLAR)

Quando precisar fazer a integração, anexe este documento e a pasta da extensão externa, depois envie:

```
@EMERGENCIA_ATUALIZACAO_EXTERNA.md @[pasta-da-extensao-externa]

Execute o protocolo de integração de atualização externa.

A extensão externa está em: [caminho da pasta]

Faça:
1. Analise a extensão externa e identifique a lógica de comunicação
2. Compare com nossa extensão atual em Github-Lovable_Infinity/extension
3. Extraia APENAS a lógica de comunicação (webhook, token, sendMessage)
4. Integre na nossa extensão MANTENDO todas as nossas funcionalidades
5. Valide usando o checklist do documento
6. Me informe o que foi alterado
```

---

## HISTÓRICO DE INTEGRAÇÕES

| Data | Extensão Externa | O que foi integrado | Versão resultante |
|------|------------------|---------------------|-------------------|
| 2026-02 | PromptXV2 | Webhook, token interceptor, sendMessage | 3.1.x |

---

## NOTAS TÉCNICAS

### Webhook atual (ofuscado):
```javascript
const _w = ['aHR0cHM6Ly9jbGVhbnBpZy1uOG4uY2xvdWRmeS5saXZlLw==', 'd2ViaG9vay9jY25vaGFsbGNvZGVzeGxveXU='];
const _getW = () => atob(_w[0]) + atob(_w[1]);
// Decodificado: https://cleanpig-n8n.cloudfy.live/webhook/ccnohallcodesxloyu
```

### Payload scramble:
```javascript
const SECRET_SALT = atob('UFgtVjMtSEFORFNIQUtFLUAjJA=='); // PX-V3-HANDSHAKE-@#$
const SCRAMBLE_KEY = atob('UFJPTVBUWC1MT0NLRUQtOTk=');    // PROMPTX-LOCKED-99
```

### Estrutura do payload:
```javascript
{
  message: texto,
  projectId: id do projeto,
  token: token do Lovable,
  source: 'PX-EXT',
  license: chave de licença,
  hwid: fingerprint do dispositivo,
  signature: assinatura baseada em tempo
}
```

---

## CONTATO DE EMERGÊNCIA

Se a integração falhar ou houver dúvidas sobre o processo, o histórico completo da primeira integração está documentado no transcript do agente de 2026-02-05.
