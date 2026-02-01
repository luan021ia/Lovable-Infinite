# Lovable Infinity

Extensão Chrome (side panel) para Lovable.dev + painel administrativo de licenças.

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
- **Build:** executar `scripts\build.bat`; a saída fica em `extension\build` (use essa pasta para distribuir).

## Documentação

Ver pasta [docs/](docs/): FIREBASE_SETUP.md, DEPLOY.md, README.md.
