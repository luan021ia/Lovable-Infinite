# Lovable Infinity

Extensão Chrome (side panel) para Lovable.dev + painel administrativo de licenças.

**Versão da extensão:** ver `version` em [package.json](package.json). O build propaga essa versão para `extension/manifest.json` e para o painel (ver [Versionamento](#versionamento)).

---

## ⚠️ EXTENSÃO QUEBROU? CHEGOU ATUALIZAÇÃO EXTERNA?

**→ [CLIQUE AQUI: Protocolo de Emergência](docs/EMERGENCIA_ATUALIZACAO_EXTERNA.md)**

Use quando receber uma nova versão externa com a comunicação funcionando e precisar integrar na nossa extensão mantendo todas as funcionalidades.

---

## 🔧 Histórico de Correções / Troubleshooting

### v3.2.1 (Fev/2025) - Correção: "Erro ao ativar licença"

**Problema:** Ao tentar ativar uma licença gerada no painel, a extensão mostrava "Erro ao ativar licença. Tente novamente." e no console aparecia erro **401 (Unauthorized)** ao tentar escrever no Firebase.

**Causa:** As regras do Firebase Realtime Database (`database.rules.json`) exigem autenticação para escrita:
```json
"licenses": {
  ".read": true,
  ".write": "auth != null"  // Precisa estar autenticado
}
```
A extensão conseguia **ler** a licença (`.read: true`), mas ao tentar **atualizar** para vincular ao dispositivo, falhava por não ter autenticação.

**Solução:** A extensão agora usa a API do Vercel (`/api/validateLicense`) em vez de acessar o Firebase diretamente. Essa API usa o **Firebase Admin SDK** que tem permissão total de leitura/escrita.

**Arquivos alterados:**
- `extension/config.js` - Adicionado `VALIDATE_LICENSE_ENDPOINT` e função `validateKeySecure()` agora chama a API Vercel

**Se o problema voltar a acontecer:**
1. Verificar se a API Vercel está funcionando: `https://lovable-infinity-api.vercel.app/api/validateLicense`
2. Verificar se o `FIREBASE_SERVICE_ACCOUNT_JSON` está configurado no Vercel
3. Verificar os logs da API no dashboard do Vercel

---

## Versionamento

- **Fonte única:** A versão da extensão fica em **package.json** (campo `version`).
- **Build:** Ao rodar `npm run build`, a versão é copiada para `extension/manifest.json` e para a pasta de build. Nunca altere a versão manualmente no manifest — altere em `package.json` e rode o build.
- **Antes de cada release:** Atualize `version` em `package.json` (ex.: `3.1` → `3.2`), rode `npm run build` e, no painel (aba Administração), publique a nova versão para os usuários verem o aviso.

## Estrutura do projeto

```
Master_Lovable_Infinity/
├── extension/          # Extensão Chrome (carregar esta pasta no Chrome)
│   ├── manifest.json
│   ├── popup.html, popup.js
│   ├── auth.html, auth.js
│   ├── background.js, content.js
│   ├── config.js, firebase-config.js, license-manager.js
│   ├── styles.css
│   ├── ICONS/
│   └── ...
├── admin/              # Painel admin (Firebase Hosting publica esta pasta)
│   ├── index.html
│   ├── admin.js
│   ├── firebase-config.js, license-manager.js, styles.css
│   └── ...
├── docs/               # Documentação
├── scripts/            # Scripts de build / utilitários
│   ├── build.bat       # Build da extensão (ofusca e gera extension/build/)
│   └── mock-extension.js
├── firebase.json       # Hosting: public = "admin"
├── .firebaserc
└── package.json
```

- **Extensão:** em Chrome, ir em `chrome://extensions` → Carregar sem compactação → escolher a pasta `extension`.
- **Admin:** `firebase deploy` publica o conteúdo da pasta `admin`.
- **Build:** executar `npm run build` (ou `scripts\build.bat`). Gera `extension\build`, ZIP na raiz, cópia em `admin\downloads\` e **faz deploy no Firebase Hosting** automaticamente.

## Documentação

Ver pasta [docs/](docs/): FIREBASE_SETUP.md, DEPLOY.md, README.md.
