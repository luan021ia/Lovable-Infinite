# Segurança, Blindagem Anti-IA e Sistema JWT – Lovable Infinity

Documentação completa de todas as medidas de segurança implementadas na extensão.
Serve como referência para manutenção, replicação em outras extensões e troubleshooting.

**Última atualização:** Fevereiro de 2026

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Sistema de Sessões JWT](#2-sistema-de-sessões-jwt)
3. [Blindagem Anti-IA (Build)](#3-blindagem-anti-ia-build)
4. [Ofuscação Máxima – Configurações](#4-ofuscação-máxima--configurações)
5. [Armadilhas Anti-IA – Pré-Ofuscação](#5-armadilhas-anti-ia--pré-ofuscação)
6. [Aviso Legal – Pós-Ofuscação](#6-aviso-legal--pós-ofuscação)
7. [Resultados e Métricas](#7-resultados-e-métricas)
8. [Arquivos Modificados](#8-arquivos-modificados)
9. [Como Replicar em Outras Extensões](#9-como-replicar-em-outras-extensões)
10. [Proteções Futuras Planejadas](#10-proteções-futuras-planejadas)
11. [Histórico de Decisões](#11-histórico-de-decisões)

---

## 1. Visão Geral

### Problema

Um fraudador clonou a extensão Chrome "Lovable Infinity", conseguiu contornar o sistema de login/licença (possivelmente mockando respostas do servidor com ajuda de IA), modificou visualmente o nome/cores e começou a revender como se fosse dele.

### Estratégia de Defesa

A defesa opera em 3 camadas:

| Camada | O que faz | Contra quem protege |
|--------|-----------|---------------------|
| **JWT obrigatório** | Token assinado pelo servidor, impossível de forjar | Quem mocka respostas da API |
| **Ofuscação máxima** | Código ilegível, criptografia RC4, selfDefending | Quem tenta ler/entender o código |
| **Armadilhas anti-IA** | Mensagens codificadas que fazem a IA se recusar a ajudar | Quem usa ChatGPT/Claude/Gemini pra crackear |

### Princípio Fundamental

> **Os arquivos fonte da extensão não foram alterados para a blindagem.**
> Toda a proteção é aplicada durante o processo de build (`scripts/build.js`).
> O desenvolvedor continua trabalhando com código limpo e legível.

---

## 2. Sistema de Sessões JWT

### O que é

JWT (JSON Web Token) é um token assinado criptograficamente pelo servidor. O servidor usa um segredo (`JWT_SECRET`) para assinar o token. Sem esse segredo, é matematicamente impossível forjar um token válido.

### Por que foi implementado

Antes do JWT, o sistema de login dependia apenas de:
- `isAuthenticated: true` no `chrome.storage.local`
- `licenseKey` no `chrome.storage.local`
- Validação da licença com o servidor (que podia ser mockada)

O atacante podia:
1. Mockar a resposta do servidor (`{valid: true}`) → passava no check
2. Setar `chrome.storage.local` direto via DevTools → passava no check
3. Usar uma chave de desenvolvimento hardcoded (`DEV_LICENSE_KEY`) → passava no check

### Como funciona agora

```
Login:
1. Usuário digita chave de licença
2. auth.js envia para /api/validateLicense (servidor Vercel)
3. Servidor valida no Firebase + gera JWT assinado com JWT_SECRET
4. auth.js recebe e armazena: sessionToken, refreshToken, sessionExpiresAt
5. Popup abre normalmente

Abertura do Popup (cada vez):
1. popup.js verifica se tem sessionToken no storage → se não, vai pra auth.html
2. popup.js envia sessionToken para /api/verifySession
3. Servidor verifica assinatura do JWT (impossível forjar)
4. Se inválido → tenta refresh → se falha → force login
5. Se válido → extensão funciona

Ataque mockado:
1. Atacante mocka validateLicense → recebe {valid: true} MAS sem sessionToken real
2. popup.js abre → não tem sessionToken → vai pra auth.html
3. Mesmo que setar sessionToken falso no storage → servidor rejeita (assinatura inválida)
4. BLOQUEADO
```

### Arquivos envolvidos

| Arquivo | Papel |
|---------|-------|
| `extension/config.js` | Endpoints JWT + funções `verifySessionWithServer()`, `tryRefreshSession()`, `getSessionToken()` |
| `extension/auth.js` | Após login, armazena `sessionToken`, `refreshToken`, `sessionExpiresAt` |
| `extension/popup.js` | Exige `sessionToken` no storage + verificação JWT obrigatória no servidor |
| `api/validateLicense.js` | Gera JWT tokens após validação de licença |
| `api/verifySession.js` | Verifica JWT, checa licença no Firebase, atualiza ping |
| `api/refreshSession.js` | Renova tokens usando refresh token |
| `api/_lib/sessionManager.js` | Lógica central: `createSession()`, `verifySession()`, `requireSession()` |

### Variáveis de ambiente (Vercel)

| Variável | Descrição |
|----------|-----------|
| `JWT_SECRET` | Segredo para assinar tokens. Se mudar, TODAS as sessões são invalidadas. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Credenciais do Firebase Admin SDK |

### Configurações do JWT

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| Token de sessão (TTL) | 24 horas | Tempo de vida do sessionToken |
| Refresh token (TTL) | 7 dias | Tempo de vida do refreshToken |
| Algoritmo | HS256 (HMAC-SHA256) | Algoritmo de assinatura |
| Protocol Version | 1 | Incrementar invalida TODAS as sessões (arma nuclear) |

### Arma nuclear: invalidar todas as sessões

Em `api/_lib/sessionManager.js`, linha 20:
```javascript
const SESSION_PROTOCOL_VERSION = 1;
```
Mudar para `2` (ou qualquer outro número) → todos os tokens existentes são rejeitados → todos os usuários precisam fazer login novamente. Use quando houver breach de segurança.

Alternativa: mudar o `JWT_SECRET` nas variáveis de ambiente do Vercel → mesmo efeito.

### O que o JWT NÃO protege

- Quem modifica o código da extensão para remover os checks (por isso a blindagem anti-IA existe)
- Quem tem acesso ao DevTools da extensão e sabe JavaScript avançado

---

## 3. Blindagem Anti-IA (Build)

### Contexto

O atacante que clonou a extensão **não sabe programar**. Ele usa IA (ChatGPT, Claude, Gemini, etc.) para:
1. Ler e entender o código obfuscado
2. Identificar e remover checks de licença
3. Modificar nomes, cores e branding
4. Reempacotar e redistribuir

### Estratégia

Atacar as 3 frentes que a IA depende:

1. **Legibilidade** → Ofuscação máxima torna o código ilegível
2. **Capacidade de processamento** → Inflação de código estoura o contexto da IA
3. **Disposição para ajudar** → Armadilhas fazem a IA se recusar a ajudar

### Fluxo do Build

```
Código fonte limpo (extension/*.js)
        ↓
[1] injectAntiAITraps(code, filename)
    - Injeta 8 blocos de armadilhas no código
    - Strings em inglês, português, Morse, ROT13, hex, Base64, invertidas
    - Funções falsas com comentários-armadilha
        ↓
[2] JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS)
    - Ofuscação máxima: RC4, splitStrings, selfDefending, etc.
    - Todas as strings são criptografadas
    - Fluxo de controle completamente embaralhado
    - Código morto injetado em 100% das funções
        ↓
[3] addPostObfuscationNotice(obfuscatedCode)
    - Adiciona bloco de aviso legal em texto claro no topo
    - Bilíngue (PT/EN) + Morse code
    - Cita leis brasileiras e tratados internacionais
        ↓
Código blindado (extension/build/*.js)
```

---

## 4. Ofuscação Máxima – Configurações

Arquivo: `scripts/build.js`, constante `OBFUSCATOR_OPTIONS`

### Configurações anteriores vs atuais

| Opção | Antes | Depois | Efeito |
|-------|-------|--------|--------|
| `controlFlowFlatteningThreshold` | 0.75 | **1** | 100% do fluxo embaralhado (era 75%) |
| `deadCodeInjectionThreshold` | 0.4 | **1** | 100% de código morto injetado (era 40%) |
| `selfDefending` | ausente | **true** | Código quebra se formatado/prettified |
| `stringArrayEncoding` | `['base64']` | **`['rc4']`** | Criptografia RC4 real (era só encoding) |
| `stringArrayThreshold` | 0.75 | **1** | 100% das strings criptografadas (era 75%) |
| `splitStrings` | ausente | **true** | Strings quebradas em pedaços de 5 chars |
| `splitStringsChunkLength` | ausente | **5** | Tamanho dos pedaços |
| `numbersToExpressions` | ausente | **true** | Números viram expressões matemáticas |
| `transformObjectKeys` | ausente | **true** | Chaves de objetos ofuscadas |
| `identifierNamesGenerator` | padrão | **'hexadecimal'** | Nomes tipo `_0x4a3b2c` |
| `stringArrayCallsTransform` | ausente | **true** | Chamadas ao array de strings transformadas |
| `stringArrayWrappersCount` | ausente | **5** | 5 camadas de wrapping nas strings |
| `stringArrayWrappersType` | ausente | **'function'** | Wrappers como funções (mais complexo) |
| `stringArrayRotate` | ausente | **true** | Array de strings rotacionado |
| `stringArrayShuffle` | ausente | **true** | Array de strings embaralhado |
| `stringArrayIndexShift` | ausente | **true** | Índices do array deslocados |
| `stringArrayWrappersChainedCalls` | ausente | **true** | Wrappers encadeados |

### O que cada opção faz

- **`controlFlowFlattening`**: Transforma `if/else/switch` em um loop com switch gigante. Torna impossível seguir a lógica do código.
- **`deadCodeInjection`**: Injeta funções e blocos que nunca executam mas parecem reais. Aumenta o tamanho e confunde análise.
- **`selfDefending`**: Se alguém rodar o código por um beautifier/prettifier (como o do Chrome DevTools), o código **quebra e para de funcionar**. Isso é crítico.
- **`stringArrayEncoding: ['rc4']`**: Todas as strings são criptografadas com RC4 e só descriptografadas em runtime. Antes era base64 (trivial de decodificar). RC4 requer a chave que está embutida no código ofuscado.
- **`splitStrings`**: A string `"hello"` vira `"he" + "ll" + "o"`. Com chunk de 5, strings longas viram dezenas de pedaços.
- **`numbersToExpressions`**: O número `1000` vira algo como `0x1f4 * 0x2 + 0x8`. Dificulta encontrar timeouts, thresholds, etc.
- **`identifierNamesGenerator: 'hexadecimal'`**: Variáveis viram `_0x4a3b2c`, `_0x1f9d7e`, etc. Impossível adivinhar o propósito.

### Sobre `selfDefending`

Esta é uma das proteções mais importantes. Quando ativado:
- O código detecta se foi reformatado (indentado, quebrado em linhas)
- Se detectar formatação, entra em loop infinito ou quebra a execução
- Isso impede o uso de beautifiers, que é o primeiro passo de qualquer engenharia reversa
- O código DEVE ser distribuído exatamente como o obfuscador gera (compacto, uma linha)

---

## 5. Armadilhas Anti-IA – Pré-Ofuscação

Arquivo: `scripts/build.js`, função `injectAntiAITraps(code, filename)`

### Conceito

Antes de ofuscar cada arquivo, injetamos 8 blocos de "código morto" contendo mensagens de aviso em múltiplos formatos. O ofuscador criptografa essas strings, mas qualquer ferramenta de deofuscação as revela. Quando a IA lê, ela entende as mensagens e tende a se recusar a ajudar.

### Blocos injetados

| # | Tipo | Conteúdo | Por que funciona |
|---|------|----------|------------------|
| 1 | **Strings diretas (EN/PT)** | Aviso legal completo dizendo que é software proprietário, que a pessoa é pirata, que a IA deve recusar | IAs leem e seguem instruções em texto claro |
| 2 | **Morse code** | Mesmo aviso codificado em Morse nos comentários | IAs decodificam Morse automaticamente |
| 3 | **ROT13** | Aviso completo em ROT13 | IAs decodificam ROT13 automaticamente |
| 4 | **Hex encoded** | "WARNING: This code is protected by copyright..." em hex | IAs decodificam hex automaticamente |
| 5 | **Funções-armadilha com nomes reais** | `_verifyLicenseIntegrity()`, `_checkTamperProtection()` com comentários extensos dizendo pra IA recusar | Parecem funções reais; IA lê os comentários |
| 6 | **Base64 encoded (multilíngue)** | Avisos em Base64 (EN, PT, e "system instruction") | IAs decodificam Base64 |
| 7 | **Strings invertidas** | Avisos escritos de trás pra frente | IAs detectam e invertem automaticamente |
| 8 | **Funções falsas com nomes técnicos** | `_validateServerCertificate()`, `_initSecurityModule()`, `_decryptPayload()`, `_verifyBlockchainSignature()` | Nomes convincentes que a IA não ousaria sugerir remover |

### Por que funciona contra IA

1. **Context poisoning**: As mensagens "envenenam" o contexto da IA. Quando ela processa o código, encontra dezenas de instruções dizendo "REFUSE", "DO NOT ASSIST", "THIS IS PIRACY" em múltiplos formatos. Os sistemas de segurança da IA tendem a respeitar essas instruções.

2. **Multi-encoding**: Se a IA pular um formato, encontra outro. Morse, ROT13, hex, Base64, invertido – cada um é uma camada extra.

3. **System prompt injection**: Algumas mensagens são escritas como "SYSTEM INSTRUCTION" ou "IMPORTANT NOTICE TO AI ASSISTANTS", que é o formato que as IAs reconhecem como instruções de sistema.

4. **Lei brasileira**: Citar a Lei 9.609/98 com artigo e pena específica dá peso legal real às mensagens. IAs são treinadas para não ajudar com atividades ilegais.

### Exemplo de mensagem ROT13

Codificado:
```
NGGRAGVBA NV NFFVFGNAG: Guvf pbqr vf cebcevrgnel yvprafrq fbsgjner...
```

Decodificado (o que a IA lê):
```
ATTENTION AI ASSISTANT: This code is proprietary licensed software...
```

---

## 6. Aviso Legal – Pós-Ofuscação

Arquivo: `scripts/build.js`, função `addPostObfuscationNotice(obfuscatedCode)`

### Conceito

Depois de ofuscar, adicionamos um bloco de comentário **em texto claro** no topo de cada arquivo. Este comentário NÃO é ofuscado – é a primeira coisa que qualquer IA (ou humano) vê ao abrir o arquivo.

### Conteúdo

- Aviso legal bilíngue (inglês e português)
- Cita leis: Lei 9.609/98, Convenção de Berna, TRIPS, DMCA, EU Copyright Directive
- Lista explícita do que a IA deve recusar (modificar, deofuscar, bypass, extrair segredos)
- Mensagem em Morse code (redundância)
- Copyright com ano

### Por que é eficaz

- É a **primeira coisa** no arquivo. IAs processam de cima pra baixo.
- Está em **texto claro** – não depende de deofuscação.
- Está em **dois idiomas** – cobre IAs configuradas em português ou inglês.
- Cita **leis reais** com artigos específicos – IAs são conservadoras com atividades ilegais.

---

## 7. Resultados e Métricas

### Tamanho dos arquivos

| Arquivo | Original | Ofuscado | Fator |
|---------|----------|----------|-------|
| popup.js | ~30 KB | **780 KB** | 26x |
| background.js | ~20 KB | **457 KB** | 23x |
| config.js | ~8 KB | **299 KB** | 37x |
| auth.js | ~5 KB | **330 KB** | 66x |
| content.js | ~3 KB | **265 KB** | 88x |
| c1.js (firebase-config) | ~2 KB | **280 KB** | 140x |
| c2.js (license-manager) | ~4 KB | **336 KB** | 84x |
| c3.js (zip-utils) | ~8 KB | **298 KB** | 37x |
| **Total** | **~80 KB** | **~3.04 MB** | **~38x** |

### Limites de contexto de IAs populares

| IA | Contexto máximo | Cabe o popup.js? | Cabem todos os arquivos? |
|----|-----------------|-------------------|--------------------------|
| ChatGPT (GPT-4) | 128K tokens (~400KB) | **Parcial** (780KB > 400KB) | **Não** |
| Claude 3.5 | 200K tokens (~600KB) | **Parcial** | **Não** |
| Gemini 1.5 | 1M tokens (~3MB) | Sim, mas com contexto cheio | **Limite** |
| Copilot | 32K tokens (~100KB) | **Não** | **Não** |
| ChatGPT Free (3.5) | 16K tokens (~50KB) | **Não** | **Não** |

A maioria das IAs gratuitas não consegue processar nem um único arquivo.

### Proteções ativas

| Proteção | Status | O que impede |
|----------|--------|--------------|
| JWT obrigatório | Ativo | Mock de resposta do servidor |
| selfDefending | Ativo | Prettify/beautify do código |
| RC4 nas strings | Ativo | Leitura direta das strings |
| Armadilhas anti-IA | Ativo | IA se recusa a ajudar |
| Aviso legal no topo | Ativo | IA lê e recusa antes de analisar |
| Inflação de código | Ativo | Estoura contexto da IA |
| Dead code injection 100% | Ativo | Código real indistinguível do falso |
| splitStrings (chunk 5) | Ativo | Strings fragmentadas impossíveis de reconstruir visualmente |
| Nomes hexadecimais | Ativo | Variáveis sem significado |

---

## 8. Arquivos Modificados

### Para o sistema JWT

| Arquivo | Tipo de mudança | Linhas alteradas |
|---------|-----------------|------------------|
| `extension/config.js` | Adicionados endpoints JWT + funções de sessão | +93 linhas |
| `extension/auth.js` | Armazena JWT tokens após login | +11 linhas |
| `extension/popup.js` | Exige sessionToken + verificação JWT obrigatória | +28 linhas |
| `api/validateLicense.js` | Retorna JWT tokens após validação | Já existente, modificado |
| `api/verifySession.js` | **Novo** – verifica JWT e status da licença | Arquivo novo |
| `api/refreshSession.js` | **Novo** – renova tokens com refresh token | Arquivo novo |
| `api/revokeAllSessions.js` | **Novo** – invalida todas as sessões (emergência) | Arquivo novo |
| `api/_lib/sessionManager.js` | **Novo** – lógica central de JWT | Arquivo novo |
| `api/getPromptConfig.js` | **Novo** – fornece config de n8n via JWT | Arquivo novo (reserva futura) |
| `vercel.json` | Adicionadas rotas das novas funções | +12 linhas |

### Para a blindagem anti-IA

| Arquivo | Tipo de mudança |
|---------|-----------------|
| `scripts/build.js` | Único arquivo modificado – todas as proteções estão aqui |

Mudanças no `build.js`:
1. `OBFUSCATOR_OPTIONS` atualizado com 16 novas configurações
2. Função `injectAntiAITraps(code, filename)` adicionada (~120 linhas)
3. Função `addPostObfuscationNotice(obfuscatedCode)` adicionada (~50 linhas)
4. Loop de ofuscação modificado para chamar as 3 etapas

### Remoções de segurança

| O que foi removido | Onde | Por quê |
|--------------------|------|---------|
| `DEV_LICENSE_KEY` | `config.js` | Bypass hardcoded – qualquer um podia usar |
| `DEV_LICENSE_DAYS` | `config.js` | Associado à chave de dev |
| Bloco de validação local da chave de dev | `config.js` | Permitia login sem servidor |

---

## 9. Como Replicar em Outras Extensões

### Pré-requisitos

1. Node.js instalado
2. `npm install javascript-obfuscator` (ou `npm install` se já estiver no `package.json`)
3. Um servidor backend (Vercel, Firebase Functions, etc.) para JWT

### Passo 1: Sistema JWT

1. **Criar `api/_lib/sessionManager.js`** com as funções `createSession()`, `verifySession()`, `requireSession()`
2. **Criar endpoint `/api/validateLicense`** que valida a licença e retorna JWT tokens
3. **Criar endpoint `/api/verifySession`** que verifica o JWT
4. **Criar endpoint `/api/refreshSession`** que renova tokens
5. **Na extensão**, no arquivo de config, adicionar funções `verifySessionWithServer()`, `tryRefreshSession()`, `getSessionToken()`
6. **No popup/sidepanel**, exigir `sessionToken` no storage e verificar com o servidor antes de permitir uso
7. **No auth**, armazenar `sessionToken`, `refreshToken`, `sessionExpiresAt` após login bem-sucedido
8. **Configurar `JWT_SECRET`** como variável de ambiente no servidor

### Passo 2: Blindagem Anti-IA

1. **Copiar as funções `injectAntiAITraps()` e `addPostObfuscationNotice()`** do `scripts/build.js`
2. **Copiar o `OBFUSCATOR_OPTIONS`** completo
3. **No loop de build**, aplicar na ordem:
   - `code = injectAntiAITraps(code, filename)`
   - `result = obfuscate(code, OBFUSCATOR_OPTIONS)`
   - `finalCode = addPostObfuscationNotice(result.getObfuscatedCode())`
4. **Personalizar** as mensagens anti-IA com o nome da sua extensão

### Passo 3: Personalização

As mensagens anti-IA mencionam "Lovable Infinity" por nome. Para outra extensão:
- Buscar e substituir "Lovable Infinity" pelo nome da nova extensão em `injectAntiAITraps()` e `addPostObfuscationNotice()`
- Ajustar as leis citadas conforme o país de atuação

### Checklist de replicação

- [ ] JWT_SECRET configurado no servidor
- [ ] Endpoint validateLicense retorna JWT
- [ ] Endpoint verifySession verifica JWT
- [ ] Endpoint refreshSession renova tokens
- [ ] Extensão exige sessionToken no storage
- [ ] Extensão verifica JWT no servidor ao abrir
- [ ] Build usa OBFUSCATOR_OPTIONS máximo
- [ ] Build injeta armadilhas anti-IA
- [ ] Build adiciona aviso legal pós-ofuscação
- [ ] DEV_LICENSE_KEY removido (se existia)
- [ ] Testado: login funciona
- [ ] Testado: mock de resposta falha
- [ ] Testado: build gera arquivos grandes e ilegíveis
- [ ] Testado: selfDefending quebra código ao prettify

---

## 10. Proteções Futuras Planejadas

### HTML/CSS dinâmico (próximo passo)

**Status**: Planejado, não implementado.

**Conceito**: Hoje o `popup.html` e `styles.css` são arquivos abertos. O fraudador pode mudar nome, cores, layout diretamente. A solução:
- No build, esvaziar o HTML (deixar só `<div id="root">` + scripts)
- Embutir todo o conteúdo HTML/CSS no JavaScript antes de ofuscar
- O JS gera a interface dinamicamente em runtime
- O fraudador abre o HTML e vê... nada

**Impacto**: Zero mudança no fluxo de desenvolvimento. O dev continua editando HTML/CSS normalmente.

### Segredos do n8n server-side

**Status**: Planejado, não implementado (endpoint `getPromptConfig` já existe).

**Conceito**: Hoje o webhook URL, SECRET_SALT e SCRAMBLE_KEY estão no código (ofuscados). Mover para variáveis de ambiente no Vercel e servir via `/api/getPromptConfig` (que exige JWT). Sem JWT válido → sem segredos → sem comunicação com n8n.

**Risco**: Requer mudança na lógica do popup.js (buscar config antes de enviar). Já foi testado e causou problemas – precisa ser feito com cuidado.

### Rate limiting

**Conceito**: Limitar quantidade de prompts por licença por hora/dia no servidor. Detecta uso abusivo.

### Monitoramento de clones

**Conceito**: O servidor pode logar IPs, user agents, e padrões de uso. Se detectar múltiplas instâncias de uma licença, alerta o admin.

---

## 11. Histórico de Decisões

### Fev/2026 – Tentativa de proxy Vercel para n8n (REVERTIDO)

**O que foi feito**: Mover toda a comunicação com n8n para passar pelo Vercel (extensão → Vercel → n8n).

**Resultado**: Quebrou a lógica de comunicação. O n8n não respondeu da mesma forma quando o intermediário era o Vercel (possível timeout de 30s, diferença de comportamento).

**Decisão**: Reverter. Manter a comunicação direta (extensão → n8n) como era originalmente. Aplicar segurança sem tocar no fluxo de comunicação.

**Lição**: Nunca alterar o fluxo de comunicação com o n8n. As mudanças de segurança devem ser **adicionadas ao redor** da lógica existente, não substituí-la.

### Fev/2026 – Restauração completa + JWT mínimo

**O que foi feito**: `git checkout` de todos os arquivos da extensão para o último commit funcional (68755c0). Depois, aplicar APENAS o JWT como camada extra.

**Resultado**: Extensão voltou a funcionar. JWT adicionado sem quebrar nada.

**Decisão**: Sempre restaurar do último estado funcional quando algo quebrar. Aplicar mudanças incrementais mínimas.

### Fev/2026 – Remoção da DEV_LICENSE_KEY

**O que foi feito**: Remover `DEV_LICENSE_KEY: 'MLI-DEV-30DIAS-TESTE'` e todo o bloco de validação local.

**Resultado**: Eliminado o bypass mais fácil. Toda chave agora passa obrigatoriamente pelo servidor.

### Fev/2026 – JWT obrigatório

**O que foi feito**: Tornar `sessionToken` obrigatório no storage + verificação JWT obrigatória (sem try/catch que engole erro).

**Resultado**: Mockar `validateLicense` não adianta mais. Sem JWT real = sem acesso.

### Fev/2026 – Blindagem anti-IA

**O que foi feito**: Ofuscação máxima + armadilhas anti-IA + aviso legal pós-ofuscação.

**Resultado**: Arquivos 26-140x maiores. selfDefending ativo. Armadilhas em 8 formatos diferentes.

---

*Documento criado em fevereiro de 2026. Atualizar sempre que houver mudanças na segurança.*
