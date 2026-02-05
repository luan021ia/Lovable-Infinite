# Estrutura do projeto e regras de trabalho – Lovable Infinity

Este documento descreve **o que foi feito** na reorganização da pasta do projeto, **como** foi feito e as **regras de trabalho** que devem ser seguidas daqui em diante. Tudo foi escrito para que você possa entender e orientar o trabalho, mesmo sem programar: **todo o código e as alterações no projeto são feitos pela assistência (IA)**; você só precisa pedir o que quer e acompanhar.

---

## 1. O que foi feito (resumo das alterações)

Antes, tudo ficava misturado na mesma pasta: arquivos da extensão Chrome, do painel administrativo, do Firebase e scripts. Agora o projeto está organizado em pastas separadas:

- **extension/** – Tudo que é a extensão Chrome (o que o usuário instala no navegador e usa no Lovable).
- **admin/** – Tudo que é o painel administrativo (geração de licenças, lista de licenças, senha do admin). É isso que sobe para a internet quando você faz o deploy no Firebase.
- **docs/** – Toda a documentação (este arquivo, guias de Firebase, deploy, etc.).
- **scripts/** – Ferramentas auxiliares (por exemplo, o script que "ofusca" a extensão antes de distribuir).

Na raiz do projeto ficam **apenas** arquivos de configuração (Firebase, Git, npm, .cursorrules) e o README. Assim fica claro onde está cada coisa e mais fácil manter o código limpo.

**Limpeza de duplicados na raiz:** Em fev/2025 foram removidos da raiz os arquivos que eram cópias/sobras da reorganização (admin.html, auth.html, background.js, config.js, content.js, firebase-config.js, manifest.json, popup.html, popup.js, styles.css). Eles já existem em **extension/** ou **admin/**; os da raiz eram duplicatas e geravam bagunça. Não recriar esses arquivos na raiz.

---

## 2. Como foi feito (detalhes técnicos para referência)

- Os arquivos da **extensão** (manifest, popup, auth, background, content, config, firebase-config, license-manager, estilos, ícones, etc.) foram movidos para a pasta **extension/**.
- Os arquivos do **painel admin** (que antes era admin.html e admin.js na raiz) foram movidos para **admin/**. O arquivo principal do admin foi renomeado para **index.html** para ser a página inicial quando alguém acessa o site publicado.
- Dentro de **admin/** foram colocadas **cópias** dos arquivos que o admin precisa para funcionar: firebase-config.js, license-manager.js e styles.css. Isso é necessário porque o Firebase Hosting publica só a pasta admin; ele não enxerga arquivos que estejam fora dela.
- O **firebase.json** foi ajustado para que o "public" seja a pasta **admin**. Assim, ao rodar o comando de deploy, só o conteúdo de admin/ é enviado para a internet.
- O script de build (**build.bat**) fica em **scripts/** e, ao ser executado, entra na pasta **extension/** e gera a versão pronta para distribuir em **extension/build/** (código ofuscado + cópias dos demais arquivos).
- O **.gitignore** foi atualizado para ignorar a pasta de build (extension/build/) e a pasta de cache do Firebase (.firebase/).
- Foi criado um **README.md** na raiz explicando a estrutura e como carregar a extensão, fazer deploy e ofuscar.
- Os guias em **docs/** (DEPLOY.md, FIREBASE_SETUP.md) foram atualizados para falar da nova estrutura e da URL do admin (agora a página inicial é index.html, então o endereço é só o domínio, sem /admin.html).

Nenhuma lógica da extensão ou do admin foi alterada; só a organização dos arquivos e as referências de onde cada coisa fica.

---

## 3. Regras de trabalho e fluxo do projeto

Estas regras servem para **qualquer pessoa ou assistência** que for mexer no projeto. Seguir elas evita quebrar a extensão ou o admin e mantém tudo consistente.

### 3.1. Onde cada coisa vive

- **Extensão Chrome** – Todo código e recursos da extensão ficam em **extension/**.
- **Painel administrativo** – Todo código e recursos do painel (páginas, estilos, scripts do admin) ficam em **admin/**.
- **Documentação** – Tudo que for guia, regra ou explicação do projeto fica em **docs/**.
- **Scripts de build / utilitários** – Ficam em **scripts/** (ex.: **build.bat**, **build.js**). O **único** script de build do projeto é **scripts/build.bat**; não criar outro na raiz nem duplicar.

Não misturar arquivos da extensão com os do admin; cada um na sua pasta.

### 3.1.1. Raiz do projeto limpa

- Na raiz ficam **apenas** arquivos de configuração (package.json, firebase.json, .firebaserc, .gitignore, .cursorrules) e README.
- **Nada** na raiz sem necessidade: não criar arquivos duplicados (ex.: build.bat, popup.html, etc.) na raiz; tudo que é da extensão fica em **extension/**, o que é script/ferramenta fica em **scripts/**, o que é admin fica em **admin/**.
- Manter a aplicação **modular e organizada**: uma única fonte para cada coisa, sem duplicação.

### 3.2. Arquivos que existem em dois lugares (obrigatório manter iguais)

Os arquivos abaixo existem **tanto em extension/ quanto em admin/** porque os dois precisam deles, e o Firebase só publica a pasta admin:

- **firebase-config.js** – Configuração do projeto Firebase (URL do banco, etc.).
- **license-manager.js** – Lógica de licenças (gerar, validar, salvar no Firebase).

**Regra obrigatória:**  
Sempre que for feita **qualquer alteração** em um desses arquivos (em extension/ ou em admin/), a **mesma alteração** deve ser feita no outro.  
Exemplo: se mudar algo em `extension/firebase-config.js`, é preciso mudar igual em `admin/firebase-config.js`.  
Quem for fazer a alteração (hoje a assistência) deve tratar isso como um único "bloco": alterar os dois e conferir que ficaram iguais.

O **styles.css** também está nos dois lugares (extension e admin). Se no futuro for definido que o visual do admin deve divergir do da extensão, aí pode haver arquivos de estilo diferentes; até lá, manter sincronizados quando mudar algo que os dois usam.

### 3.3. Carregar a extensão no Chrome

A extensão que o Chrome carrega é a pasta **extension/** (e não a raiz do projeto).  
Em `chrome://extensions` → "Carregar sem compactação" → escolher a pasta **extension**.  
Se um dia a estrutura mudar, a documentação (por exemplo o README na raiz) deve ser atualizada para refletir qual pasta carregar.

### 3.4. Deploy do painel admin

O deploy no Firebase publica **somente** a pasta **admin/**.  
O `firebase.json` na raiz está configurado com `"public": "admin"`.  
Não mudar isso sem intenção de mudar a forma de publicar o admin; senão o site pode quebrar ou publicar a pasta errada.

### 3.4.1. Painel = produção (obrigatório)

**Tudo que for alterado no painel (admin/) já é em produção.** Não existe fluxo de "subir manual" ou ambiente separado. Qualquer alteração no painel deve ser feita com: build (se aplicável), deploy, commit e push. O agente (IA) deve sempre executar o deploy após alterações no painel — nunca deixar para o usuário subir manual. A tarja de download da extensão (nome, versão, data, botão) é exibida igual para todos os usuários; os dados vêm do build (version.json) e do deploy. Nada de publicação manual no painel.

### 3.5. Build da extensão

O **único** script de build é **scripts/build.bat**. Ele sobe para a raiz do projeto, instala dependências (npm install) e executa o build (npm run build), que usa **scripts/build.js** para: (1) propagar a versão de **package.json** para **extension/manifest.json**; (2) ofuscar os JS da pasta **extension/** e gerar **extension/build/**; (3) compactar em ZIP na raiz e copiar para **admin/downloads/**; (4) executar **firebase deploy --only hosting** ao final (painel + ZIP ficam no ar).  
Na build, **firebase-config.js** e **license-manager.js** são ofuscados e gravados com **nomes neutros** (c1.js e c2.js); os HTML da build referenciam c1.js e c2.js.  
Para distribuir a extensão, usar a pasta **extension/build** no Chrome (ou empacotar essa pasta).  
Não commitar **extension/build/** no Git (já está no .gitignore).  
Não criar outro build.bat na raiz nem duplicar o script de build; manter tudo em **scripts/**.

### 3.5.1. Versionamento da extensão (obrigatório)

A **versão** da extensão tem **uma única fonte**: o campo **version** em **package.json** (na raiz).  
**Nunca** alterar a versão manualmente em **extension/manifest.json**.  
Ao fazer alterações que caracterizem nova versão: (1) atualizar **version** em **package.json** (ex.: de `3.1` para `3.2`); (2) rodar o build (npm run build); o script copia essa versão para **extension/manifest.json** e para o build.  
O README na raiz e o .cursorrules descrevem essa regra; mantê-la evita esquecer de atualizar o manifest ou o README.

### 3.6. Não quebrar o que já funciona

- **extension/** – Não alterar a lógica de licença, token, envio ao webhook ou fluxo de autenticação sem planejamento e sem seguir o que está documentado (por exemplo no plano de histórico por projeto).
- **admin/** – Não alterar a forma como o admin se conecta ao Firebase nem as funções de licença sem garantir que extension e admin continuem usando a mesma "fonte da verdade" (Firebase).
- **Chaves de armazenamento** – O código usa chaves específicas no storage do navegador (por exemplo para token, licença, histórico de chat). Não criar novas funcionalidades que sobrescrevam ou misturem essas chaves com as que já existem; novas funcionalidades devem usar chaves novas e isoladas (como já foi feito para o histórico de chat).

### 3.6.1. Arquitetura de validação de licenças (IMPORTANTE)

A **validação e ativação de licenças** na extensão **NÃO** acessa o Firebase diretamente para escrita. Ela usa a **API do Vercel** (`/api/validateLicense`).

**Por quê?** As regras do Firebase (`database.rules.json`) exigem autenticação para escrita:
```json
"licenses": {
  ".read": true,
  ".write": "auth != null"
}
```

A extensão consegue **ler** licenças diretamente do Firebase, mas para **escrever** (ativar, vincular dispositivo, atualizar sessão) precisa passar pela API Vercel que usa o **Firebase Admin SDK** com permissão total.

**Fluxo atual:**
1. Usuário digita a licença na extensão
2. Extensão chama `POST /api/validateLicense` (Vercel) com `{ licenseKey, deviceFingerprint }`
3. API Vercel usa Firebase Admin SDK para ler/escrever na licença
4. API retorna `{ valid, message, license, userData }`
5. Extensão salva os dados localmente se válida

**Se precisar alterar a validação de licenças:**
- Alterar a API em `api/validateLicense.js` (lógica de validação)
- Alterar `extension/config.js` (como a extensão chama a API)
- **NÃO** fazer a extensão escrever diretamente no Firebase – vai dar erro 401

**Arquivos envolvidos:**
- `api/validateLicense.js` - API Vercel (Firebase Admin SDK)
- `api/lib/firebaseAdmin.js` - Configuração do Admin SDK
- `extension/config.js` - Função `validateKeySecure()` que chama a API
- `database.rules.json` - Regras de permissão do Firebase

### 3.7. Documentar mudanças importantes

Quando forem feitas alterações que mudem estrutura, fluxo ou regras (por exemplo: nova pasta, nova regra de "manter dois arquivos iguais", mudança na forma de deploy ou de carregar a extensão), isso deve ser registrado na documentação em **docs/**, incluindo atualizações neste arquivo (ESTRUTURA_E_REGRAS_DO_PROJETO.md) quando fizer sentido.

---

## 4. Quem faz o quê (contexto do projeto)

- **Você (dono do projeto)** – Define o que quer (funcionalidades, comportamento, textos, organização). Pode pedir explicações, guias passo a passo e revisão do que foi feito. Não precisa programar.
- **Assistência (IA)** – Faz todas as alterações de código, reorganização de pastas, criação e atualização de documentação técnica, sempre seguindo as regras deste documento e dos outros em docs/.

Por isso, as "regras de projeto" acima servem tanto para você (para saber como o projeto está organizado e o que deve ser mantido) quanto para a assistência (para que cada alteração respeite a estrutura e os fluxos definidos).

---

## 5. Índice rápido da documentação

| Arquivo | Conteúdo |
|--------|----------|
| **ESTRUTURA_E_REGRAS_DO_PROJETO.md** (este) | Estrutura das pastas, o que foi feito na reorganização e regras de trabalho. |
| **FIREBASE_SETUP.md** | Conectar um novo projeto Firebase (credenciais, Realtime Database). |
| **DEPLOY.md** | Colocar o admin no ar, arquitetura de licenças e fluxo de venda. |
| **README.md** (em docs/) | Índice da documentação. |

O **README.md** na **raiz** do projeto descreve a estrutura em árvore e como carregar a extensão, fazer deploy e ofuscar.

---

*Última atualização: fevereiro de 2025 – correção v3.2.1 (validação de licenças via API Vercel).*
