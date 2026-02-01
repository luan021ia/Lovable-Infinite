# Segurança e ofuscação – Lovable Infinity

Este documento registra o que a ofuscação faz hoje, suas limitações e o que pode ser feito no futuro para deixar a extensão mais segura. Serve para estudo e planejamento; por enquanto a extensão usa só a ofuscação atual (build) para comercialização.

---

## 1. O que a ofuscação faz hoje

- O **scripts/build.bat** gera a pasta **extension/build/** com:
  - Arquivos JavaScript **ofuscados** (config.js, auth.js, popup.js, background.js, firebase-config.js, license-manager.js) via javascript-obfuscator (control-flow-flattening, dead-code-injection, string-array, etc.).
  - **firebase-config.js** e **license-manager.js** são ofuscados e gravados na build com **nomes neutros** (c1.js e c2.js), para não expor no nome do arquivo que se trata de licenciamento/Firebase. Os HTML da build (popup.html, auth.html) são ajustados para referenciar c1.js e c2.js.
  - Cópias dos demais arquivos (HTML após ajuste de referências, CSS, manifest, content.js, ícones) sem alteração.

- **Objetivo:** dificultar leitura e cópia do código por quem baixa ou inspeciona a extensão. Ajuda a desencorajar uso não autorizado e engenharia reversa casual.

- **O que NÃO faz:** não torna o código “inviolável”. Quem tiver a pasta da extensão (ou o pacote descompactado) ainda pode, com tempo e ferramentas, analisar e extrair lógica e textos. Ofuscação **aumenta a barreira**, não elimina o risco.

---

## 2. Limitações (para ter em mente)

- **Extensão Chrome é “aberta”:** o usuário carrega os arquivos; qualquer um com a pasta ou o .crx descompactado pode acessá-los. Não dá para esconder segredos de forma definitiva dentro da extensão.

- **Dados sensíveis na extensão:** hoje a URL do webhook (e possivelmente outras strings) está no código da extensão (ex.: popup.js, em base64). A ofuscação dificulta achar, mas quem inspecionar a extensão ainda pode descobrir. O ideal, no futuro, é **não guardar segredos na extensão** e usar um backend que guarde e use esses dados.

- **Validação de licença:** já está do lado “seguro”: a extensão consulta o Firebase (e device fingerprint); a regra de negócio e os dados ficam no servidor. Isso é o mais importante para evitar pirataria.

---

## 3. O que pode ser feito no futuro (modo segurança)

Ideias para quando quiser evoluir a segurança (não implementado por enquanto):

1. **Não guardar segredos na extensão**
   - Tirar a URL do webhook (e qualquer chave/URL sensível) do código da extensão.
   - A extensão só chama **um backend seu** (ex.: Firebase Function ou API própria); o backend é que chama o webhook e guarda as credenciais. Assim a extensão nunca expõe o webhook.

2. **Proteger a lógica no backend**
   - Manter validação de licença e regras no Firebase (e device fingerprint).
   - Revisar regras do Realtime Database e, se fizer sentido, usar **Firebase App Check** para limitar quem pode chamar a API.

3. **Integridade do código**
   - Já existe **verifyIntegrity()** (hash do config.js) para detectar se alguém alterou arquivos da extensão. Manter e, se quiser, estender para outros arquivos críticos.

4. **Ofuscação (ajustes opcionais)**
   - **content.js** continua só copiado (não ofuscado) no build. Se quiser, pode ser incluído no processo de ofuscação no futuro. Ganho é marginal.

5. **Distribuição**
   - Publicar na Chrome Web Store adiciona termos de uso e pode desencorajar redistribuição não autorizada; o pacote ainda pode ser analisado por quem baixar.

---

## 4. Decisão atual

- **Comercialização:** usar a **build** atual (extension/build), gerada pelo **scripts/build.bat**, com a ofuscação como está. Essa é a versão para distribuir e comercializar.
- **Segurança avançada:** deixar para estudar e implementar depois (backend para webhook, App Check, etc.), com base neste documento.

---

## 5. Uma sessão ativa por licença (implementado)

Para evitar que mais de um usuário use a mesma licença ao mesmo tempo (compartilhamento de acesso):

- **No Firebase** cada licença pode ter um campo `activeSession`: `{ deviceFingerprint, lastPingAt }`.
- **Na validação (config.js):** se existir `activeSession` de **outro** dispositivo e `lastPingAt` tiver menos de **15 minutos**, a validação falha com: *"Esta licença está em uso em outro dispositivo no momento. Tente novamente mais tarde."* Se não houver sessão ativa ou a sessão tiver expirado (15 min sem ping), o acesso é permitido e a sessão atual é registrada.
- **Heartbeat (background.js):** a extensão envia um “ping” a cada **5 minutos** (alarme) atualizando `activeSession.lastPingAt` no Firebase. Assim, enquanto o usuário estiver com a extensão/navegador em uso, a sessão continua ativa. Se fechar o navegador e ninguém enviar ping por **15 minutos**, a sessão expira e outro dispositivo pode usar a licença.
- **Logout:** ao desativar/sair, a licença é removida do storage e o alarme de ping é cancelado.

Resumo: **uma licença = uma sessão ativa por vez**; sessão expira 15 min sem uso; heartbeat a cada 5 min.

---

*Documento criado em fevereiro de 2025 para referência futura. Atualizado com sessão única por licença.*
