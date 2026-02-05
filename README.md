# Lovable Infinity

Extensão Chrome (side panel) para Lovable.dev + painel administrativo de licenças.

**Versão da extensão:** ver `version` em [package.json](package.json). O build propaga essa versão para `extension/manifest.json` e para o painel (ver [Versionamento](#versionamento)).

---

## ⚠️ EXTENSÃO QUEBROU? CHEGOU ATUALIZAÇÃO EXTERNA?

**→ [CLIQUE AQUI: Protocolo de Emergência](docs/EMERGENCIA_ATUALIZACAO_EXTERNA.md)**

Use quando receber uma nova versão externa com a comunicação funcionando e precisar integrar na nossa extensão mantendo todas as funcionalidades.

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
