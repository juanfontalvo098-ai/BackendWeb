@echo off
title KAMIA POS - Instalador de Print Bridge (Servicio en Segundo Plano)
color 0B
cls

echo ======================================================================
echo           KAMIA POS - INSTALADOR DE SERVICIO PRINT BRIDGE (NODE.JS)
echo ======================================================================
echo.

:: 1. Verificar si Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js no esta instalado.
    echo Node.js es OBLIGATORIO para el Print Bridge.
    echo.
    echo Descargando e iniciando instalador de Node.js...
    set "NODE_MSI=%TEMP%\node_installer.msi"
    curl -L -o "%NODE_MSI%" https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    if exist "%NODE_MSI%" (
        msiexec /i "%NODE_MSI%"
        echo Completa la instalacion y vuelve a ejecutar este instalador.
    ) else (
        start https://nodejs.org/
    )
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo   [1/4] Node.js verificado: %NODE_VERSION%

:: 2. Crear carpeta en AppData
set "TARGET_DIR=%LOCALAPPDATA%\GastrosPOS\PrintBridge"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
echo   [2/4] Copiando archivos del puente a: %TARGET_DIR%

copy /y "%~dp0bridge.js" "%TARGET_DIR%\bridge.js" >nul
copy /y "%~dp0package.json" "%TARGET_DIR%\package.json" >nul

:: 3. Detener procesos anteriores en el puerto 8088
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 8088 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}"

:: 4. Crear script VBS de inicio silencioso en Startup de Windows
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_PATH=%STARTUP_FOLDER%\KAMIA_PrintBridge.vbs"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_PATH%"
echo WshShell.Run "node """ ^& "%TARGET_DIR%\bridge.js"""", 0, False >> "%VBS_PATH%"

echo   [3/4] Acceso de inicio automatico registrado en:
echo         %VBS_PATH%

:: 5. Iniciar inmediatamente el servicio en segundo plano
echo   [4/4] Iniciando Print Bridge en segundo plano...
wscript "%VBS_PATH%"

echo.
echo ======================================================================
echo    INSTALACION COMPLETADA EXITOSAMENTE
echo ======================================================================
echo.
echo   [OK] El Print Bridge Node.js ya esta activo en http://localhost:8088
echo   [OK] Se iniciara automaticamente cada vez que enciendas Windows.
echo   [OK] Ya puedes imprimir silenciosamente sin ventanas de dialogo.
echo.
echo ======================================================================
echo Presiona cualquier tecla para cerrar...
pause >nul
