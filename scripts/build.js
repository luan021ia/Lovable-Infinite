/**
 * Build automatizado da extensão Chrome - Lovable Infinity
 * Ofusca os JS, copia arquivos e ajusta referências nos HTML.
 * Ao final, compacta a pasta build em LOVABLE_INFINITY.zip.
 * 
 * VERSIONAMENTO SEMÂNTICO (SemVer):
 * - MAJOR (X.0.0): Mudanças grandes, breaking changes, redesigns
 * - MINOR (0.X.0): Novas funcionalidades, features
 * - PATCH (0.0.X): Correções de bugs, ajustes pequenos
 * 
 * Uso: npm run build (na raiz do projeto)
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const readline = require('readline');

// Raiz do projeto = pasta acima de scripts/
const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const BUILD = path.join(EXT, 'build');
const ZIP_NAME = 'LOVABLE_INFINITY.zip';
// ZIP na raiz do projeto; o conteúdo é sempre a pasta build (produção)
const ZIP_PATH = path.join(ROOT, ZIP_NAME);
// Nome da pasta dentro do ZIP: ao descompactar, o usuário terá "Lovable Infinity" com a extensão pronta
const ZIP_FOLDER_NAME = 'Lovable Infinity';

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: true,
};

// Arquivos a ofuscar: [origem, destino no build]
// Nomes ofuscados: c1=firebase-config, c2=license-manager, c3=zip-utils
const OBFUSCATE_LIST = [
  ['config.js', 'config.js'],
  ['auth.js', 'auth.js'],
  ['popup.js', 'popup.js'],
  ['background.js', 'background.js'],
  ['content.js', 'content.js'],
  ['firebase-config.js', 'c1.js'],
  ['license-manager.js', 'c2.js'],
  ['zip-utils.js', 'c3.js'],
];

// Arquivos a copiar (sem ofuscar)
const COPY_FILES = ['auth.html', 'popup.html', 'styles.css', 'manifest.json'];

function log(msg) {
  console.log(msg);
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

function copyFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
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

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  replacements.forEach(([from, to]) => {
    content = content.split(from).join(to);
  });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Pergunta ao usuário qual tipo de mudança foi feita
 * @returns {Promise<string>} 'major', 'minor', 'patch' ou 'skip'
 */
function askVersionType() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    log('\n┌─────────────────────────────────────────────────────────┐');
    log('│           VERSIONAMENTO SEMÂNTICO (SemVer)              │');
    log('├─────────────────────────────────────────────────────────┤');
    log('│  [1] PATCH  - Correções de bugs, ajustes pequenos       │');
    log('│  [2] MINOR  - Novas funcionalidades, features           │');
    log('│  [3] MAJOR  - Mudanças grandes, breaking changes        │');
    log('│  [0] SKIP   - Manter versão atual (sem incremento)      │');
    log('└─────────────────────────────────────────────────────────┘\n');

    rl.question('Qual tipo de mudança? [1/2/3/0]: ', (answer) => {
      rl.close();
      const choice = answer.trim();
      if (choice === '1') resolve('patch');
      else if (choice === '2') resolve('minor');
      else if (choice === '3') resolve('major');
      else if (choice === '0') resolve('skip');
      else {
        log('[!] Opção inválida. Assumindo PATCH (correção pequena).');
        resolve('patch');
      }
    });
  });
}

/**
 * Incrementa a versão de acordo com o tipo de mudança
 * @param {string} currentVersion - Versão atual (ex: "3.1.2")
 * @param {string} type - Tipo de mudança: 'major', 'minor', 'patch'
 * @returns {string} Nova versão
 */
function incrementVersion(currentVersion, type) {
  const parts = currentVersion.split('.').map(Number);
  let [major, minor, patch] = parts;
  
  // Garantir valores válidos
  major = isNaN(major) ? 1 : major;
  minor = isNaN(minor) ? 0 : minor;
  patch = isNaN(patch) ? 0 : patch;

  switch (type) {
    case 'major':
      major++;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor++;
      patch = 0;
      break;
    case 'patch':
    default:
      patch++;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

async function main() {
  log('============================================');
  log(' BUILD DA EXTENSÃO CHROME - Lovable Infinity');
  log('============================================');

  // 0) Ler versão atual e perguntar sobre versionamento
  const pkgPath = path.join(ROOT, 'package.json');
  const manifestPath = path.join(EXT, 'manifest.json');
  
  let currentVersion = '1.0.0';
  let pkg = {};
  
  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    currentVersion = (pkg.version && String(pkg.version).trim()) || '1.0.0';
  }

  log(`\nVersão atual: ${currentVersion}`);

  // Perguntar tipo de mudança
  const versionType = await askVersionType();
  
  let newVersion = currentVersion;
  if (versionType !== 'skip') {
    newVersion = incrementVersion(currentVersion, versionType);
    
    // Atualizar package.json
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4), 'utf8');
    log(`[*] Versão atualizada: ${currentVersion} → ${newVersion} (${versionType.toUpperCase()})\n`);
  } else {
    log(`[*] Mantendo versão atual: ${currentVersion}\n`);
  }

  // Propagar versão para extension/manifest.json
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), 'utf8');
    log('[*] Versão propagada para extension/manifest.json: ' + newVersion + '\n');
  }

  // 1) Carregar ofuscador
  let JavaScriptObfuscator;
  try {
    JavaScriptObfuscator = require('javascript-obfuscator');
  } catch (e) {
    log('[ERRO] Pacote javascript-obfuscator não encontrado.');
    log('Execute na raiz do projeto: npm install');
    log('(O script adiciona javascript-obfuscator como dependência de desenvolvimento.)\n');
    process.exit(1);
  }

  // 2) Limpar build anterior
  if (fs.existsSync(BUILD)) {
    log('[*] Limpando pasta build anterior...');
    rimraf(BUILD);
    log('[*] Pasta build removida.\n');
  }

  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(path.join(BUILD, 'ICONS'), { recursive: true });

  // 3) Ofuscar cada arquivo
  log('[*] Ofuscando arquivos JavaScript...\n');
  for (let i = 0; i < OBFUSCATE_LIST.length; i++) {
    const [srcName, destName] = OBFUSCATE_LIST[i];
    const srcPath = path.join(EXT, srcName);
    const destPath = path.join(BUILD, destName);
    if (!fs.existsSync(srcPath)) {
      log(`[ERRO] Arquivo não encontrado: ${srcName}`);
      process.exit(1);
    }
    log(`[${i + 1}/${OBFUSCATE_LIST.length}] Ofuscando ${srcName} ${destName !== srcName ? '-> ' + destName : ''}...`);
    try {
      const code = fs.readFileSync(srcPath, 'utf8');
      const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
      fs.writeFileSync(destPath, result.getObfuscatedCode(), 'utf8');
    } catch (err) {
      log(`[ERRO] Falha ao ofuscar ${srcName}: ${err.message}`);
      process.exit(1);
    }
  }

  // 4) Copiar arquivos não-JS
  log('\n[*] Copiando arquivos (HTML, CSS, manifest)...');
  COPY_FILES.forEach((name) => {
    const src = path.join(EXT, name);
    const dest = path.join(BUILD, name);
    if (!fs.existsSync(src)) {
      log(`[AVISO] Arquivo não encontrado: ${name}`);
      return;
    }
    copyFileSync(src, dest);
  });

  // 5) Ajustar referências nos HTML (firebase-config.js -> c1.js, license-manager.js -> c2.js)
  const replacements = [
    ['firebase-config.js', 'c1.js'],
    ['license-manager.js', 'c2.js'],
  ];
  replaceInFile(path.join(BUILD, 'popup.html'), replacements);
  replaceInFile(path.join(BUILD, 'auth.html'), replacements);

  // 6) Copiar ícones
  log('[*] Copiando ícones...');
  const iconsSrc = path.join(EXT, 'ICONS');
  const iconsDest = path.join(BUILD, 'ICONS');
  copyDirSync(iconsSrc, iconsDest);

  // 7) Compactar a pasta build em LOVABLE_INFINITY.zip (ZIP na raiz do projeto)
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
    log('[*] ZIP anterior removido.');
  }
  log('\n[*] Criando ' + ZIP_NAME + ' (conteúdo: pasta build)...');
  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(ZIP_PATH);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      output.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(BUILD, ZIP_FOLDER_NAME);
      archive.finalize();
    });
  } catch (err) {
    log('[ERRO] Falha ao compactar: ' + err.message);
    process.exit(1);
  }

  // 8) Copiar ZIP para admin/downloads (servido pelo Firebase Hosting no painel)
  const adminDownloads = path.join(ROOT, 'admin', 'downloads');
  fs.mkdirSync(adminDownloads, { recursive: true });
  const zipDest = path.join(adminDownloads, ZIP_NAME);
  copyFileSync(ZIP_PATH, zipDest);
  log('[*] ZIP copiado para admin/downloads/ (para deploy no painel).');

  // 8b) Gerar admin/version.json (versão + data do deploy para a barra do painel)
  const versionPath = path.join(ROOT, 'admin', 'version.json');
  const versionPayload = { version: newVersion, publishedAt: Date.now() };
  fs.writeFileSync(versionPath, JSON.stringify(versionPayload, null, 0), 'utf8');
  log('[*] admin/version.json gerado (versão ' + newVersion + ', publishedAt: ' + versionPayload.publishedAt + ').');

  // 9) Deploy no Firebase Hosting (painel + ZIP disponível)
  log('\n[*] Executando deploy no Firebase (hosting)...');
  try {
    const { execSync } = require('child_process');
    execSync('npx firebase deploy --only hosting', { stdio: 'inherit', cwd: ROOT });
    log('[*] Deploy Firebase concluído.');
  } catch (err) {
    log('[AVISO] Deploy Firebase falhou. Execute manualmente: firebase deploy --only hosting');
  }

  log('\n============================================');
  log(' CONCLUÍDO COM SUCESSO');
  log('============================================\n');
  log(`[+] Versão: ${newVersion}`);
  log(`[+] Build criado em: extension\\build\\`);
  log('[+] ZIP gerado na raiz: ' + ZIP_NAME);
  log('[+] ZIP copiado em: admin\\downloads\\' + ZIP_NAME);
  log('[+] Ao descompactar o ZIP, o usuário terá a pasta "' + ZIP_FOLDER_NAME + '" pronta para carregar no Chrome.\n');
}

main();
