# Conectar Firebase do zero – Lovable Infinity

O projeto está **desconectado** do Firebase antigo. Use este guia para conectar um **novo** projeto Firebase, com total independência do que existia antes.

---

## 1. Criar um novo projeto no Firebase

1. Acesse **[Firebase Console](https://console.firebase.google.com)**.
2. Clique em **Adicionar projeto** (ou **Criar projeto**).
3. Dê um nome (ex: `lovable-infinity-vendas`) e siga o assistente.
4. Opcional: desative o Google Analytics se não for usar.
5. Clique em **Criar projeto**.

---

## 2. Ativar o Realtime Database

1. No menu lateral, vá em **Criar** > **Realtime Database** (ou **Build** > **Realtime Database**).
2. Clique em **Criar banco de dados**.
3. Escolha a região (ex: `southamerica-east1`).
4. Em **Regras de segurança**, escolha **Modo de teste** por enquanto (permite leitura/escrita para testar). Depois você ajusta as regras para produção.
5. Clique em **Ativar**.

A **URL do banco** será algo como:
`https://SEU-PROJECT-ID-default-rtdb.firebaseio.com`  
(ou `https://SEU-PROJECT-ID-default-rtdb.REGIAO.firebasedatabase.app` em projetos novos.)

Anote essa URL; você vai usar como `databaseURL`.

---

## 3. Obter as credenciais do projeto (config do app Web)

1. No Firebase Console, clique no **ícone de engrenagem** ao lado de "Visão geral do projeto" > **Configurações do projeto**.
2. Role até **Seus apps**.
3. Clique no ícone **Web** `</>` para adicionar um app (se ainda não tiver).
4. Dê um apelido (ex: "Admin e Extensão") e não marque Firebase Hosting por enquanto.
5. Clique em **Registrar app**.
6. Copie o objeto **firebaseConfig** que aparecer. Será algo como:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "seu-projeto.firebaseapp.com",
  databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

---

## 4. Colar no projeto (firebase-config.js)

1. Abra o arquivo **`firebase-config.js`** em **`extension/`** e em **`admin/`** (mantenha os dois iguais).
2. Substitua o objeto **`FIREBASE_CONFIG`** pelos dados do seu novo projeto. Exemplo:

```javascript
const FIREBASE_CONFIG = {
    apiKey: "AIzaSy...",                    // do Firebase Console
    authDomain: "seu-projeto.firebaseapp.com",
    databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",  // obrigatório
    projectId: "seu-projeto",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc..."
};
```

O mais importante é o **`databaseURL`**: deve ser exatamente a URL do Realtime Database que você ativou no passo 2.

---

## 5. config.js (opcional)

Se no seu código existir uso de **`CONFIG.FIREBASE_URL`** em **`config.js`**, preencha com a mesma **databaseURL**:

```javascript
FIREBASE_URL: 'https://seu-projeto-default-rtdb.firebaseio.com',
```

(Use o mesmo valor que colocou em `FIREBASE_CONFIG.databaseURL`.)

---

## 6. Deploy do admin (Firebase Hosting)

Se for publicar o painel admin com `firebase deploy`:

1. Abra **`.firebaserc`** na raiz do projeto.
2. Troque **`SEU_PROJECT_ID`** pelo **ID do seu projeto** (o mesmo de `projectId` no firebase-config):

```json
{
  "projects": {
    "default": "seu-projeto"
  }
}
```

3. No terminal, na pasta do projeto:

```bash
firebase login
firebase deploy
```

O admin ficará em: `https://seu-projeto.web.app/admin.html`

---

## 7. Regras do Realtime Database (produção)

No Firebase Console > Realtime Database > **Regras**, para começar a vender com um mínimo de segurança você pode usar regras que permitem leitura e escrita (só para testar). Depois, recomenda-se restringir:

- **Leitura**: quem precisar validar licença (ex.: sua extensão ou seu backend).
- **Escrita**: só seu admin ou um backend autenticado.

Exemplo de regras mais abertas (só para desenvolvimento/teste):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Para produção, use regras mais restritas ou Firebase App Check + Auth. Veja a documentação do Firebase sobre [regras do Realtime Database](https://firebase.google.com/docs/database/security).

---

## Resumo

| Onde | O que fazer |
|------|-------------|
| **firebase-config.js** | Preencher `FIREBASE_CONFIG` com os dados do **novo** projeto (principalmente `databaseURL`). |
| **config.js** | Se usar `FIREBASE_URL`, preencher com a mesma `databaseURL`. |
| **.firebaserc** | Trocar `SEU_PROJECT_ID` pelo `projectId` do novo projeto (para `firebase deploy`). |

Depois disso, o gerador de licenças (admin) e a extensão passam a usar **somente** o novo Firebase, sem nenhuma dependência do projeto antigo.
