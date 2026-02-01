# Análise da Extensão Leigos Academy V4

**Documento de análise** — Funcionalidades do chat, lógica e operação.  
*Gerado a partir da análise do código em `LeigosAcademyV4`. Nenhum código foi alterado.*

---

## 1. Visão geral

- **Nome:** Leigos Academy  
- **Versão:** 4.0.0  
- **Alvo:** Lovable.dev (extensão otimizada para essa plataforma)  
- **Manifest:** V3  
- **Interface:** Side Panel (popup.html como painel lateral padrão)

A extensão exige ativação por licença antes de liberar o chat. Após ativar, o usuário vê um chat integrado com créditos, envio de texto/áudio/imagem, modo “apenas conversar”, “melhorar prompt com IA”, novo projeto, publicar e auto-publicar.

---

## 2. Arquitetura

| Componente      | Arquivo(s)        | Papel |
|----------------|--------------------|--------|
| **Background** | `background.js`    | Service worker: intercepta token, roteia mensagens (sendMessage, getCredits, createNewProject, publishProject, checkLicense, etc.) e chama funções de `license.js`. |
| **Licença**    | `license.js`       | Lógica de licença, créditos e processamento de mensagens (`processMessageSend`, `handleGetCredits`, `handleCreateNewProject`, `handlePublishProject`, `handleCheckLicense`). Código ofuscado. |
| **UI do chat** | `popup.html` + `popup.js` | Side panel: tela de licença, tela de chat, barra de ferramentas, input, histórico. `popup.js` ofuscado. |
| **Página**     | `content.js`       | Content script em `https://*.lovable.dev/*`, `run_at: document_start`. Código ofuscado; atua na página do Lovable. |
| **Ativação**   | `activation.js`    | Ofuscado; não referenciado no `popup.html` (possível uso em outro fluxo ou legado). |
| **Diálogos**   | `sweetalert2.min.js` | Alertas/confirmações na UI. |

**Permissões:** `storage`, `tabs`, `scripting`, `webRequest`, `sidePanel`  
**Hosts:** `https://*.lovable.dev/*`, `https://api.leigosacademy.site/*`

O **background** é o hub: o popup e possivelmente o content script falam com ele via `chrome.runtime.sendMessage` (ação + dados); o background chama `license.js` (importado com `importScripts('license.js')`) e devolve a resposta.

---

## 3. Fluxo de licença

1. **Tela inicial:** `#licenseScreen` ativa; usuário vê logo, título “Leigos Academy” e campo de chave (`#licenseInput`, formato XXXX-XXXX-XXXX-XXXX).
2. **Ativação:** Botão “Ativar Licença” (`#activateBtn`) envia a chave; a validação e o armazenamento são feitos via background (ação `checkLicense` ou equivalente) e funções em `license.js`.
3. **Após ativar:** `#licenseScreen` é ocultada e `#chatScreen` é exibida; o subtítulo da licença aparece no header (`#licenseSubtitle`).

A persistência usa `chrome.storage` (background/handlers como `handleSaveToken`, `handleGetToken` em `license.js`).

---

## 4. Funcionalidades do chat (como aparecem na UI e no background)

### 4.1 Header

- **Título:** Logo + “Leigos Academy” + subtítulo da licença.
- **Limpar histórico:** `#clearHistoryBtn` (ícone lixeira).
- **Créditos:** `#creditsDisplay` com:
  - Créditos normais: `#normalCreditsCount` (ícone moedas).
  - Créditos diários (bônus): `#dailyCreditsCount` (ícone presente).
- **Status:** `#status` — “OFFLINE” / “ONLINE” (estilo e classe `.online`), atualizado conforme conexão/API.

### 4.2 Área de mensagens

- **Container:** `#chatArea` — lista de mensagens, scroll vertical.
- **Mensagens:**
  - `.message.sent` — usuário (alinhado à direita, estilo “enviado”).
  - `.message.received` — resposta/sistema (esquerda).
  - Suporte a blocos de código (`.message pre/code`, `.code-block-wrapper`) e botão “Copiar” (`.copy-code-btn`).
  - Ticks de confirmação (`.message-tick`) nas enviadas.
- **Anexos nas mensagens:** `.message-attachment` (link/ícone) e `.message-images-container` / `.message-image-preview` para imagens.

Quando não há projeto aberto no Lovable, é exibida uma caixa de informação: “Abra um projeto no Lovable.dev para conectar”.

### 4.3 Preview de arquivos

- **Container:** `#filePreview` (inicialmente oculto).
- **Conteúdo:** `#fileGallery` (miniaturas), `#fileCount`, botão “Remover todas” (`#removeFileBtn`).
- **Itens:** `.file-preview-item` com imagem e botão `.remove-single` para remover uma por uma.
- **Input de arquivo:** `#fileInput` (accept: `.jpg,.jpeg,.png,.gif,.webp`, multiple).
- Uso: anexar imagens antes de enviar; há suporte visual a drag-and-drop (classe `.drag-active` no `.input-wrapper` com texto “Solte a imagem aqui”).

### 4.4 Barra de ferramentas (`.tools-bar`)

| Elemento              | ID / classe              | Função (por título/placeholder) |
|----------------------|--------------------------|-----------------------------------|
| Tema                 | `#themeToggleBtn`        | Alternar tema claro/escuro (ícone lua). |
| Novo projeto         | `#newProjectBtn`         | Iniciar novo projeto no Lovable. |
| Áudio                | `#voiceBtn`              | Gravar áudio; `#voiceIndicator` exibe “Ouvindo...” durante gravação. |
| Anexar               | `#attachBtn`             | Anexar documento/imagem (abre `#fileInput` ou similar). |
| Melhorar com IA      | `#improveBtn` (`.ai-btn`)| Melhorar o texto do prompt com IA. |
| Modo chat            | `#chatModeBtn` + `#chatModeLabel` | Alternar “Modo Normal” vs “Modo Chat” (apenas conversar, sem editar). |
| Auto publicar        | `#autoPublishToggle`     | Switch: publicar automaticamente quando a IA finalizar. |
| Publicar             | `#publishBtn`            | Publicar projeto. |

**Nota sobre “Modo Plano”:** Na versão V4 analisada não existe botão ou texto “Modo Plano” em `popup.html` nem a string “plano” nos arquivos da extensão. Os únicos modos visíveis na barra são **Modo Normal** (label) e **Modo Chat** (botão com ícone de comentários). Se houve “Modo Plano” em alguma versão anterior ou em outra extensão, ele não está presente neste código.

Estados visuais: `.recording` no botão de áudio, `.improving` no botão de melhorar (animação de loading).

### 4.5 Input e envio

- **Texto:** `#messageInput` (textarea, placeholder “Digite sua mensagem...”).
- **Enviar:** `#sendBtn` (ícone avião + “Enviar”).

A lógica exata de envio (validação, formatação, uso de créditos, anexos, áudio) está em `popup.js` e `license.js` (ofuscados). O que se sabe é que o background expõe a ação **`sendMessage`**, que chama **`processMessageSend(request.data)`** em `license.js` e devolve a resposta ao popup.

---

## 5. Lógica de operação (inferida)

### 5.1 Envio de mensagem

1. Usuário escreve em `#messageInput`, opcionalmente anexa imagens e/ou usa “Melhorar com IA”.
2. Ao clicar em Enviar (ou atalho), o popup monta um objeto com texto, anexos, modo chat, etc. e envia ao background:  
   `chrome.runtime.sendMessage({ action: 'sendMessage', data: ... })`.
3. Background chama `processMessageSend(request.data)` (em `license.js`).
4. `license.js` deve:
   - validar licença/créditos,
   - eventualmente usar o token interceptado de `api.lovable.dev`,
   - enviar a mensagem à API (Lovable e/ou `api.leigosacademy.site`),
   - devolver sucesso/erro e possivelmente atualizar créditos.
5. O popup atualiza a UI (mensagem “enviada”, resposta na área de mensagens, atualização de créditos).

### 5.2 Créditos

- **Leitura:** ação `getCredits` → `handleGetCredits()` no background.
- **Exibição:** `#normalCreditsCount` e `#dailyCreditsCount` no header.
- Consumo de créditos provavelmente ocorre dentro de `processMessageSend` ou em chamadas à API da Leigos Academy.

### 5.3 Novo projeto e publicar

- **Novo projeto:** ação `createNewProject` → `handleCreateNewProject(request.data)`.
- **Publicar:** ação `publishProject` → `handlePublishProject(request.data)`.

Ambos são tratados no background e implementados em `license.js` (possivelmente chamando APIs do Lovable e/ou da Leigos Academy).

### 5.4 Token e API Lovable

- O background intercepta requisições para `https://api.lovable.dev/*` com `chrome.webRequest.onBeforeSendHeaders`.
- Extrai o header `Authorization` (Bearer), armazena em `chrome.storage.local` como `authToken` e `lovable_token`.
- Esse token é usado para autenticar chamadas feitas em nome do usuário (mensagens, novo projeto, publicar).

Há ainda `setupRequestInterceptor` chamado no background se existir em `license.js` (interceptação adicional).

### 5.5 Webhook com arquivo

- Ação **`sendWebhookWithFile`**: o background recebe `url`, `payload` e opcionalmente `file` (objeto com `name`, `type`, `data` em Data URL).
- Se houver `file`, monta `FormData`, anexa o blob e os campos do payload e envia POST; senão envia JSON.
- Usado para envio de arquivos (ex.: imagens) para um endpoint configurado (ex.: API Leigos Academy).

---

## 6. Temas e UX

- **Tema escuro (padrão)** e **tema claro** (`body.light-theme`) com variáveis CSS (`--accent-color`, `--message-sent-bg`, etc.).
- Cores principais: verde (#00ff88 no escuro, #00897b no claro).
- Side panel responsivo: estilos para `body:not(.popout)` reduzem tamanhos de fonte e padding quando não está em janela pop-out.
- Onboarding: existe `#onboardingOverlay` e estilos `.onboarding-highlight` (destaque pulsante), sugerindo um fluxo de “primeira vez” (ex.: destacar um botão).

---

## 7. Resumo das funcionalidades do chat

| Funcionalidade        | Onde aparece                    | Lógica (resumo) |
|-----------------------|----------------------------------|------------------|
| Enviar mensagem       | Input + Send                     | Popup → background `sendMessage` → `processMessageSend` em license.js; uso de token e créditos. |
| Créditos (normal/diário) | Header                          | `getCredits` → `handleGetCredits`; exibição no popup. |
| Modo Chat vs Normal   | Toggle na tools-bar              | Flag enviada no payload para “apenas conversar” vs editar no Lovable. |
| Melhorar prompt com IA | Botão “IA”                      | Provável chamada a API de melhoria de texto antes de enviar; estado `.improving`. |
| Áudio                 | Botão microfone                 | Gravação e envio como anexo ou transcrição; indicador “Ouvindo...”. |
| Anexos (imagens)      | Anexar + file preview           | Seleção/drag-and-drop; envio via `sendWebhookWithFile` ou dentro de `sendMessage`. |
| Novo projeto          | Botão “+”                       | `createNewProject` → `handleCreateNewProject`. |
| Publicar / Auto       | Botão e switch                  | `publishProject` → `handlePublishProject`; auto = publicar ao final da resposta da IA. |
| Limpar histórico      | Header                          | Limpa mensagens locais (e possivelmente estado no storage). |
| Tema                  | Botão lua/sol                   | Alterna `.light-theme` no `body`. |
| Código nas respostas  | Área de mensagens               | Blocos com botão copiar; suporte a `pre`/`code`. |

---

## 8. Observação sobre ofuscação

Os arquivos **`popup.js`**, **`content.js`**, **`license.js`** e **`activation.js`** estão ofuscados (nomes de variáveis e funções transformados). Por isso:

- A análise das **funcionalidades** e da **lógica** baseou-se em:
  - **popup.html** (estrutura, IDs, classes, títulos, placeholders).
  - **background.js** (ações e handlers legíveis).
  - **manifest.json** (permissões e hosts).
- Detalhes internos (ex.: formato exato do payload de `sendMessage`, como “melhorar com IA” chama a API, como o áudio é codificado) não puderam ser extraídos do código; apenas inferidos pela arquitetura e pelos pontos de entrada do background.

Para replicar ou aprofundar alguma funcionalidade no Master_Lovable_Infinity, seria necessário desofuscar ou obter versão legível desses scripts, ou reimplementar a lógica a partir desta análise e da documentação das APIs (Lovable e Leigos Academy).

---

*Fim do documento de análise.*
