@echo off
chcp 65001 >nul
title Preparacao para o socio - Lovable Infinity
REM Gera a pasta extension-para-socio (codigo aberto, sem seu Firebase) e o ZIP.
cd /d "%~dp0.."

echo.
echo ============================================
echo   PREPARACAO PARA O SOCIO - Lovable Infinity
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
echo [*] Gerando pasta e ZIP...
echo.
call npm run preparacao-para-o-socio
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao preparar pacote.
    pause
    exit /b 1
)

echo.
echo Pressione qualquer tecla para fechar.
pause >nul
