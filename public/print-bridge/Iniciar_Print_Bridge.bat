@echo off
title KAMIA POS - Servidor de Impresion Termica Directa (Puerto 8182)
color 0A
cls
echo ======================================================================
echo           KAMIA POS - SERVIDOR DE IMPRESION DIRECTA Y SILENCIOSA
echo ======================================================================
echo.
echo   [OK] Iniciando Print Bridge en segundo plano (Puerto: 8182)...
echo   [OK] Las comandas y facturas saldran directo a la impresora termica
echo        sin abrir ventanas de Windows ni pedir confirmacion.
echo.
echo   Minimiza esta ventana mientras uses el punto de venta.
echo ======================================================================
echo.

:: 1. Comprobar si Node.js está disponible
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Modo: Node.js Detectado
    if exist "%~dp0bridge.js" (
        node "%~dp0bridge.js"
        goto :end
    )
    if exist "%~dp0print-bridge\bridge.js" (
        node "%~dp0print-bridge\bridge.js"
        goto :end
    )
)

:: 2. Si no hay Node.js, usar el motor nativo de Windows (PowerShell) sin dependencias
echo [OK] Modo: Motor Nativo de Windows (PowerShell) - Sin dependencias
if exist "%~dp0bridge.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge.ps1"
) else if exist "%~dp0print-bridge\bridge.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-bridge\bridge.ps1"
)

:end
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] El servicio se ha detenido.
    pause
)
