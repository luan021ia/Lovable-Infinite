@echo off
echo ============================================
echo  OFUSCADOR DE EXTENSAO CHROME
echo ============================================
echo.

REM Verificar se o javascript-obfuscator está instalado
where javascript-obfuscator >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] javascript-obfuscator nao encontrado!
    echo [*] Instalando...
    npm install -g javascript-obfuscator
    echo.
)

REM Criar pasta de saída
if not exist "obfuscated" mkdir obfuscated
if not exist "obfuscated\ICONS" mkdir obfuscated\ICONS

echo [*] Ofuscando arquivos JavaScript...
echo.

REM Ofuscar config.js
echo [1/4] Ofuscando config.js...
javascript-obfuscator config.js ^
    --output obfuscated/config.js ^
    --compact true ^
    --control-flow-flattening true ^
    --control-flow-flattening-threshold 0.75 ^
    --dead-code-injection true ^
    --dead-code-injection-threshold 0.4 ^
    --string-array true ^
    --string-array-encoding base64 ^
    --string-array-threshold 0.75 ^
    --unicode-escape-sequence true

REM Ofuscar auth.js
echo [2/4] Ofuscando auth.js...
javascript-obfuscator auth.js ^
    --output obfuscated/auth.js ^
    --compact true ^
    --control-flow-flattening true ^
    --control-flow-flattening-threshold 0.75 ^
    --dead-code-injection true ^
    --dead-code-injection-threshold 0.4 ^
    --string-array true ^
    --string-array-encoding base64 ^
    --string-array-threshold 0.75 ^
    --unicode-escape-sequence true

REM Ofuscar popup.js
echo [3/4] Ofuscando popup.js...
javascript-obfuscator popup.js ^
    --output obfuscated/popup.js ^
    --compact true ^
    --control-flow-flattening true ^
    --control-flow-flattening-threshold 0.75 ^
    --dead-code-injection true ^
    --dead-code-injection-threshold 0.4 ^
    --string-array true ^
    --string-array-encoding base64 ^
    --string-array-threshold 0.75 ^
    --unicode-escape-sequence true

REM Ofuscar background.js
echo [4/4] Ofuscando background.js...
javascript-obfuscator background.js ^
    --output obfuscated/background.js ^
    --compact true ^
    --control-flow-flattening true ^
    --control-flow-flattening-threshold 0.75 ^
    --dead-code-injection true ^
    --dead-code-injection-threshold 0.4 ^
    --string-array true ^
    --string-array-encoding base64 ^
    --string-array-threshold 0.75 ^
    --unicode-escape-sequence true

echo.
echo [*] Copiando arquivos nao-JavaScript...

REM Copiar arquivos HTML
copy auth.html obfuscated\ >nul
copy popup.html obfuscated\ >nul

REM Copiar CSS
copy styles.css obfuscated\ >nul

REM Copiar manifest
copy manifest.json obfuscated\ >nul

REM Copiar content.js (geralmente não precisa ofuscar muito)
copy content.js obfuscated\ >nul

REM Copiar ícones
xcopy ICONS obfuscated\ICONS\ /E /I /Y >nul

echo.
echo ============================================
echo  CONCLUIDO!
echo ============================================
echo.
echo [+] Extensao ofuscada criada em: obfuscated\
echo [+] Carregue a pasta 'obfuscated' no Chrome
echo.
echo IMPORTANTE:
echo - Teste a extensao antes de distribuir
echo - Mantenha o codigo original em local seguro
echo - A ofuscacao dificulta, mas nao impede 100%%
echo.
pause
