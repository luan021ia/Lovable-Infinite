# Colocando no ar e vendendo licenças – Lovable Infinity

**Importante:** O projeto está **desconectado** do Firebase antigo. Antes de publicar, configure seu **novo** projeto Firebase do zero. Siga o guia **FIREBASE_SETUP.md** (nesta pasta).

---

## Resumo: melhor forma de fazer funcionar

**Recomendação: usar Firebase como "fonte única da verdade" e hospedar o painel admin.**

- **Extensão** → já valida licença consultando o Firebase (nada muda).
- **Gerador de licenças (admin)** → você coloca no ar (Firebase Hosting) e acessa de qualquer lugar; cada licença gerada **já é salva no Firebase** automaticamente.
- **Sincronização** → não precisa "sincronizar" manualmente: quem gera é o admin, quem lê é a extensão; os dois usam o mesmo Firebase. Está tudo sincronizado por padrão.

Não é necessário criar uma "versão comercial" separada nem outro backend: o Firebase que você já usa resolve.

---

## Build da extensão (para produção)

Antes de distribuir a extensão, é preciso gerar o **build** (ofuscar o código e montar a pasta pronta para o Chrome).

### Como fazer o build (Windows)

1. **Duplo clique** no arquivo **`scripts\build.bat`** (ou pelo terminal, na raiz do projeto: `scripts\build.bat`).  
   - O script instala as dependências (se faltar algo), roda o build e mostra o resultado.  
   - Se aparecer erro de "Node.js não encontrado", instale em: https://nodejs.org/

2. **Ou pelo terminal** (na raiz do projeto):
   ```bash
   npm install
   npm run build
   ```

O build é criado em **`extension\build\`**. Essa pasta é a que você:
- carrega no Chrome em `chrome://extensions` → "Carregar sem compactação" (para testar);
- ou compacta em ZIP para publicar na Chrome Web Store.

**Importante:** Use sempre o conteúdo de `extension\build\` para distribuir. Não distribua a pasta `extension\` inteira (ela contém o código sem ofuscar).

---

## Arquitetura atual (já correta)

```
┌─────────────────────────────────────────────────────────────────┐
│  SEU FIREBASE (novo projeto – configure em firebase-config.js)   │
│  Realtime Database: https://SEU-PROJECT-ID-.../                   │
│  /licenses/{chave}  → dados da licença                            │
│  /admin/password    → senha do painel admin                       │
└─────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ salva ao gerar                     │ lê ao validar
         │                                    │
┌────────┴────────┐                ┌─────────┴────────┐
│  PAINEL ADMIN   │                │  EXTENSÃO        │
│  (gerador)      │                │  (cliente)       │
│  - Gera licença │                │  - Usuário cola  │
│  - saveLicense  │                │    a chave       │
│    ToCloud()    │                │  - getLicense     │
│  - Ver/editar   │                │    FromCloud()    │
└─────────────────┘                └──────────────────┘
```

- **Admin**: ao gerar uma licença, `license-manager.js` chama `saveLicenseToCloud()` (definido em `firebase-config.js`). A licença vai direto para o Firebase.
- **Extensão**: ao validar, `config.js` chama `getLicenseFromCloud()` e lê do mesmo Firebase.

Ou seja: **extensão e gerador já estão "sincronizados" via Firebase.** O que falta é você acessar o gerador de qualquer lugar – por isso colocamos o admin no ar.

---

## O que fazer na prática

### 1. Colocar o admin no ar (Firebase Hosting)

Assim você acessa o gerador de licenças de qualquer PC/celular, com a mesma senha que já usa.

- No projeto foi adicionado:
  - `firebase.json` → configuração do Hosting (pasta a ser publicada).
  - `.firebaserc` → projeto Firebase (preencha com o ID do seu projeto).

**Antes:** preencha `firebase-config.js` (em `admin/` e em `extension/`) e `.firebaserc` na raiz (veja **FIREBASE_SETUP.md** nesta pasta).

**Estrutura:** O painel admin está na pasta `admin/`. O `firebase.json` está configurado com `"public": "admin"`, então só essa pasta é publicada.

**Comandos (na raiz do projeto):**

```bash
# Instalar CLI do Firebase (uma vez)
npm install -g firebase-tools

# Login (uma vez)
firebase login

# Publicar o admin (use o mesmo projectId do .firebaserc)
firebase deploy
```

Depois do deploy, o admin fica em:

- **https://SEU-PROJECT-ID.web.app/**

(Substitua `SEU-PROJECT_ID` pelo ID do seu novo projeto Firebase. O Hosting serve a pasta `admin/`, cuja página inicial é `index.html`.)

Na primeira vez que abrir essa URL, defina a senha do admin (como já faz localmente). A senha fica salva no Firebase (`/admin/password`), então vale para o admin local e para o admin no ar.

### 2. Segurança do Firebase (Realtime Database)

No [Console do Firebase](https://console.firebase.google.com) → seu projeto → Realtime Database → **Regras**:

- Para **começar a vender** sem complicar, você pode deixar leitura e escrita liberadas (como hoje), mas **nunca** exponha chaves secretas (API keys do Firebase em front são aceitáveis).
- Quando quiser apertar a segurança:
  - Recurso recomendado: **Firebase App Check** para limitar quem pode ler/escrever (só sua extensão e seu site).
  - Opcional: no futuro, mover a "ativação" (update da licença no Firebase) para uma **Cloud Function** chamada pela extensão; aí nas regras você pode restringir escrita só ao backend.

Por enquanto, manter como está e só acessar o admin com senha forte já é um bom começo.

### 3. Fluxo de venda

1. Você (ou seu time) abre o admin no ar: `https://SEU-PROJECT-ID.web.app/`.
2. Faz login com a senha do admin.
3. Gera a licença (nome, telefone, validade, etc.) → **já é salva no Firebase**.
4. Copia a chave e envia para o cliente (e-mail, WhatsApp, etc.).
5. O cliente instala a extensão, cola a chave → a extensão valida no Firebase e ativa no dispositivo.

Não é necessário "sincronizar" nada à parte: gerador e extensão usam o mesmo Firebase.

### 4. Usar só o admin "no ar" (opcional)

Se quiser usar **só** o admin hospedado (e não mais o `admin.html` local):

- Acesse sempre pelo link do Hosting.
- As licenças continuam sendo criadas e salvas no Firebase; a extensão continua validando normalmente.

O admin local e o admin no ar são o mesmo código e o mesmo Firebase; a diferença é só onde você abre a página.

---

## Resumo das respostas diretas

| Pergunta | Resposta |
|----------|----------|
| Preciso colocar algo "no ar" para validar? | Só o que já está: o Firebase. Não precisa de outro servidor. |
| Preciso "sincronizar" extensão e gerador? | Não. Eles já usam o mesmo Firebase: o gerador grava, a extensão lê. |
| Melhor usar "versão comercial" ou Firebase? | Firebase já resolve: gerador no ar + mesmo Firebase = pronto para vender. |
| O que falta fazer? | Colocar o admin no ar com `firebase deploy` e, quando quiser, apertar as regras do Realtime Database (e depois App Check / Cloud Functions). |
