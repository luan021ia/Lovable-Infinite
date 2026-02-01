@echo off
title Build - Lovable Infinity
REM Unico script de build do projeto. Fica em scripts/ (estrutura modular).
cd /d "%~dp0.."

echo.
echo ============================================
echo   BUILD DA EXTENSAO - Lovable Infinity
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Instale o Node.js em: https://nodejs.org/
    echo Depois execute este script novamente.
    echo.
    pause
    exit /b 1
)

echo [*] Instalando dependencias (se necessario)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
)

echo.
echo [*] Executando build...
echo.
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Build falhou.
    pause
    exit /b 1
)

echo.
echo Pressione qualquer tecla para fechar.
pause >nul
