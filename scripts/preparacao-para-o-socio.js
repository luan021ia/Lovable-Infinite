/**
 * Prepara o pacote da extensão PARA O SÓCIO:
 * - Código aberto (sem build/ofuscação)
 * - SEM conexão com seu Firebase (config em branco para ele preencher)
 * - Gera ZIP dentro da pasta (extension-para-socio.zip)
 *
 * Uso: node scripts/preparacao-para-o-socio.js  ou  npm run preparacao-para-o-socio
 * Saída: pasta extension-para-socio/ + extension-para-socio/extension-para-socio.zip
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'extension-para-socio');

const FIREBASE_CONFIG_TEMPLATE = `/**
 * Configuração do Firebase - Lovable Infinity
 * Sistema de Licenças na Nuvem
 *
 * CONFIGURE SEU FIREBASE AQUI (dados do Console Firebase).
 *
 * Passos:
 * 1. Acesse https://console.firebase.google.com
 * 2. Crie um novo projeto (ou use um existente)
 * 3. Ative o Realtime Database (crie o banco se pedir)
 * 4. Em Configurações do projeto > Geral > Seus apps > adicione um app Web
 * 5. Copie o objeto firebaseConfig e preencha FIREBASE_CONFIG abaixo
 * 6. A databaseURL deve ser algo como: https://SEU-PROJECT-ID-default-rtdb.firebaseio.com
 *
 * Guia completo: docs/FIREBASE_SETUP.md (na raiz do projeto, se tiver)
 */

const FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let firebaseApp = null;
let firebaseDb = null;
let firebaseInitialized = false;

async function initializeFirebase() {
    return new Promise((resolve) => {
        if (firebaseInitialized) {
            console.log('[Firebase] Já inicializado');
            resolve(true);
            return;
        }

        if (!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL === "") {
            console.warn('[Firebase] databaseURL não configurado. Configure FIREBASE_CONFIG em firebase-config.js');
            resolve(false);
            return;
        }

        try {
            firebaseInitialized = true;
            console.log('[Firebase] Inicializado com sucesso!');
            console.log('[Firebase] Database URL:', FIREBASE_CONFIG.databaseURL);
            resolve(true);
        } catch (error) {
            console.error('[Firebase] Erro ao inicializar:', error);
            resolve(false);
        }
    });
}

async function firebaseRequest(path, method = 'GET', data = null) {
    if (!FIREBASE_CONFIG.databaseURL) {
        throw new Error('Firebase não configurado. Preencha FIREBASE_CONFIG em firebase-config.js');
    }

    try {
        const url = \`\${FIREBASE_CONFIG.databaseURL}\${path}.json\`;

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('[Firebase] Erro na requisição:', error);
        throw error;
    }
}

async function testFirebaseConnection() {
    try {
        console.log('[Firebase] Testando conexão...');
        const result = await firebaseRequest('/licenses');
        console.log('[Firebase] Conexão OK - Dados acessíveis');
        return { success: true, message: 'Conexão com Firebase OK' };
    } catch (error) {
        console.error('[Firebase] Erro na conexão:', error);
        return { success: false, message: 'Erro: ' + error.message };
    }
}

async function saveLicenseToCloud(license) {
    try {
        console.log('[Firebase] Salvando licença:', license.key);
        const path = \`/licenses/\${license.key}\`;
        const data = {
            key: license.key,
            userName: license.userName || '',
            userPhone: license.userPhone || '',
            created: license.created,
            expiryDate: license.expiryDate,
            active: license.active,
            activated: license.activated || false,
            activatedDate: license.activatedDate || null,
            maxUses: license.maxUses || null,
            uses: license.uses || 0,
            activatedDevices: license.activatedDevices || [],
            timestamp: new Date().toISOString()
        };
        await firebaseRequest(path, 'PUT', data);
        console.log('[Firebase] Licença salva com sucesso:', license.key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar licença:', error);
        return false;
    }
}

async function getLicenseFromCloud(key) {
    try {
        console.log('[Firebase] Carregando licença:', key);
        const path = \`/licenses/\${key}\`;
        const result = await firebaseRequest(path);
        if (result && result.key) {
            console.log('[Firebase] Licença encontrada:', key);
            return result;
        }
        console.log('[Firebase] Licença não encontrada:', key);
        return null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar licença:', error);
        return null;
    }
}

async function getAllLicensesFromCloud() {
    try {
        console.log('[Firebase] Carregando todas as licenças...');
        const result = await firebaseRequest('/licenses');
        if (result && typeof result === 'object') {
            const licenses = Object.values(result).filter(l => l && l.key);
            console.log('[Firebase] Carregadas ' + licenses.length + ' licenças');
            return licenses;
        }
        return [];
    } catch (error) {
        console.error('[Firebase] Erro ao carregar licenças:', error);
        return [];
    }
}

async function updateLicenseInCloud(key, updates) {
    try {
        console.log('[Firebase] Atualizando licença:', key);
        const path = \`/licenses/\${key}\`;
        const current = await getLicenseFromCloud(key);
        if (!current) {
            console.error('[Firebase] Licença não encontrada para atualizar');
            return false;
        }
        const updated = { ...current, ...updates, timestamp: new Date().toISOString() };
        await firebaseRequest(path, 'PUT', updated);
        console.log('[Firebase] Licença atualizada com sucesso:', key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao atualizar licença:', error);
        return false;
    }
}

async function deleteLicenseFromCloud(key) {
    try {
        console.log('[Firebase] Deletando licença:', key);
        await firebaseRequest(\`/licenses/\${key}\`, 'DELETE');
        console.log('[Firebase] Licença deletada com sucesso:', key);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao deletar licença:', error);
        return false;
    }
}

async function syncLicensesWithCloud() {
    try {
        console.log('[Firebase] Iniciando sincronização...');
        const localLicenses = await licenseManager.getAllLicenses();
        console.log('[Firebase] Sincronizando ' + localLicenses.length + ' licenças...');
        let saved = 0;
        for (const license of localLicenses) {
            const result = await saveLicenseToCloud(license);
            if (result) saved++;
        }
        console.log('[Firebase] Sincronização concluída: ' + saved + '/' + localLicenses.length);
        return { success: true, message: 'Sincronizadas ' + saved + ' licenças' };
    } catch (error) {
        console.error('[Firebase] Erro ao sincronizar:', error);
        return { success: false, message: 'Erro: ' + error.message };
    }
}

console.log('[Firebase] Carregando configuração...');
initializeFirebase();

async function saveAdminPasswordToCloud(passwordHash) {
    try {
        await firebaseRequest('/admin/password', 'PUT', passwordHash);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar senha:', error);
        return false;
    }
}

async function getAdminPasswordFromCloud() {
    try {
        const result = await firebaseRequest('/admin/password');
        return result || null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar senha:', error);
        return null;
    }
}

async function getAdminUsernameFromCloud() {
    try {
        const result = await firebaseRequest('/admin/username');
        return result || null;
    } catch (error) {
        console.error('[Firebase] Erro ao carregar usuário:', error);
        return null;
    }
}

async function saveAdminUsernameToCloud(username) {
    try {
        await firebaseRequest('/admin/username', 'PUT', username);
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao salvar usuário:', error);
        return false;
    }
}

async function deleteAdminPasswordFromCloud() {
    try {
        await firebaseRequest('/admin/password', 'DELETE');
        return true;
    } catch (error) {
        console.error('[Firebase] Erro ao deletar senha:', error);
        return false;
    }
}
`;

// config.js: ler o original e só trocar FIREBASE_URL e opcionalmente DEV_LICENSE_KEY
function getConfigJsPartner() {
    const origPath = path.join(EXT, 'config.js');
    let content = fs.readFileSync(origPath, 'utf8');
    // Remove sua databaseURL e deixa em branco para o sócio preencher
    content = content.replace(
        /FIREBASE_URL:\s*'[^']*'/,
        "FIREBASE_URL: ''  // Preencha com a mesma databaseURL do firebase-config.js (seu Firebase)"
    );
    content = content.replace(
        /DEV_LICENSE_KEY:\s*'[^']*'/,
        "DEV_LICENSE_KEY: ''  // Opcional: chave para testar sem Firebase (ex: MLI-DEV-30DIAS-TESTE)"
    );
    // Garantir vírgula após FIREBASE_URL e DEV_LICENSE_KEY (o replace pode tê-la removido)
    content = content.replace(
        /(FIREBASE_URL:\s*''[^,\n]*)(\n\s*CACHE_DURATION)/,
        '$1,\n    $2'
    );
    content = content.replace(
        /(DEV_LICENSE_KEY:\s*''[^,\n]*)(\n\s*DEV_LICENSE_DAYS)/,
        '$1,\n    $2'
    );
    return content;
}

function rimraf(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((entry) => {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) rimraf(full);
        else fs.unlinkSync(full);
    });
  fs.rmdirSync(dir);
}

function copyDirSync(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  fs.readdirSync(srcDir).forEach((entry) => {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

const README_PARTNER = `# Extensão Lovable Infinity – Versão para seu painel

Esta pasta contém o **código fonte atualizado** da extensão, **sem build** e **sem conexão com o Firebase de terceiros**.  
Você deve configurar **seu próprio Firebase** e, se quiser, fazer seu próprio build depois.

## O que fazer

1. **Configurar o Firebase**
   - Abra \`firebase-config.js\` e preencha o objeto \`FIREBASE_CONFIG\` com os dados do **seu** projeto no [Firebase Console](https://console.firebase.google.com).
   - O campo obrigatório é \`databaseURL\` (URL do Realtime Database).

2. **Config.js (opcional)**
   - Se existir \`FIREBASE_URL\` em \`config.js\`, use a mesma \`databaseURL\` do passo 1.

3. **Painel admin**
   - Use o painel admin que você já tem, com a **mesma** \`databaseURL\` no \`firebase-config.js\` do admin, para que licenças e extensão falem com o mesmo Firebase.

4. **Carregar no Chrome**
   - No Chrome: \`chrome://extensions\` → Ativar "Modo do desenvolvedor" → "Carregar sem compactação" → selecione esta pasta (\`extension-para-socio\`).
   - Não é necessário rodar build; esta é a versão em código aberto.

5. **Build (opcional)**
   - Se no seu projeto existir um script de build (ex.: \`npm run build\`), você pode usá-lo para gerar uma pasta ofuscada a partir desta. O importante é que o \`firebase-config.js\` e o \`config.js\` continuem apontando para **seu** Firebase.

## Resumo

- **Código aberto**: pode editar e integrar ao seu fluxo.
- **Sem Firebase alheio**: nenhuma URL ou projeto de terceiros; você preenche o seu.
- **Atualizado**: inclui as últimas alterações da extensão (licenças, device fingerprint, etc.).
`;

async function main() {
  console.log('============================================');
  console.log(' PREPARAÇÃO PARA O SÓCIO - Lovable Infinity');
  console.log('============================================\n');

  if (!fs.existsSync(EXT)) {
    console.error('[ERRO] Pasta extension/ não encontrada.');
    process.exit(1);
  }

  if (fs.existsSync(OUT)) {
    console.log('[*] Removendo pasta extension-para-socio anterior...');
    rimraf(OUT);
  }

  console.log('[*] Copiando extensão (código aberto)...');
  copyDirSync(EXT, OUT);

  console.log('[*] Inserindo firebase-config.js sem sua conexão...');
  fs.writeFileSync(path.join(OUT, 'firebase-config.js'), FIREBASE_CONFIG_TEMPLATE, 'utf8');

  console.log('[*] Ajustando config.js (FIREBASE_URL em branco)...');
  fs.writeFileSync(path.join(OUT, 'config.js'), getConfigJsPartner(), 'utf8');

  console.log('[*] Criando README-PARA-SOCIO.md...');
  fs.writeFileSync(path.join(OUT, 'README-PARA-SOCIO.md'), README_PARTNER, 'utf8');

  console.log('[*] Criando ZIP (extension-para-socio.zip dentro da pasta)...');
  const zipPathInFolder = path.join(OUT, 'extension-para-socio.zip');
  const zipTemp = path.join(ROOT, 'extension-para-socio-temp.zip');
  await createZip(OUT, zipTemp);
  fs.renameSync(zipTemp, zipPathInFolder);

  console.log('\n============================================');
  console.log(' CONCLUÍDO');
  console.log('============================================\n');
  console.log('Pasta gerada: extension-para-socio\\');
  console.log('ZIP gerado: extension-para-socio\\extension-para-socio.zip');
  console.log('Envie o ZIP (ou a pasta) para o sócio.');
  console.log('Ele deve preencher firebase-config.js e config.js com o Firebase dele.\n');
}

function createZip(sourceDir, destZipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

main().catch((err) => {
  console.error('[ERRO]', err);
  process.exit(1);
});
