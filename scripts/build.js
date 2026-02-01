/**
 * Build automatizado da extensão Chrome - Lovable Infinity
 * Ofusca os JS, copia arquivos e ajusta referências nos HTML.
 * Uso: npm run build (na raiz do projeto)
 */

const fs = require('fs');
const path = require('path');

// Raiz do projeto = pasta acima de scripts/
const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const BUILD = path.join(EXT, 'build');

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
const OBFUSCATE_LIST = [
  ['config.js', 'config.js'],
  ['auth.js', 'auth.js'],
  ['popup.js', 'popup.js'],
  ['background.js', 'background.js'],
  ['firebase-config.js', 'c1.js'],
  ['license-manager.js', 'c2.js'],
];

// Arquivos a copiar (sem ofuscar)
const COPY_FILES = ['auth.html', 'popup.html', 'styles.css', 'manifest.json', 'content.js'];

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

function main() {
  log('============================================');
  log(' BUILD DA EXTENSÃO CHROME - Lovable Infinity');
  log('============================================\n');

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
  log('\n[*] Copiando arquivos (HTML, CSS, manifest, content.js)...');
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

  log('\n============================================');
  log(' CONCLUÍDO COM SUCESSO');
  log('============================================\n');
  log(`[+] Build criado em: extension\\build\\`);
  log('[+] Carregue a pasta "extension\\build" no Chrome para testar ou distribuir.\n');
}

main();
