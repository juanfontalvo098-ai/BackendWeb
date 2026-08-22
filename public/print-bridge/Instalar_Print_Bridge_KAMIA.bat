@echo off
setlocal EnableDelayedExpansion
title KAMIA POS - Instalador del Agente de Impresion Termica Directa (Puerto 8182)
color 0A
cls

echo ======================================================================
echo           KAMIA POS - INSTALADOR DE IMPRESION TERMICA SILENCIOSA
echo ======================================================================
echo.
echo   Este instalador configurara el Agente de Impresion en este computador.
echo   - Puerto: 8182 (ESC/POS directo a impresoras USB/Red/Windows)
echo   - Corte automatico de papel y apertura de cajon monedero
echo   - Inicio automatico con Windows (Segundo plano)
echo.
echo ======================================================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\KAMIA_Print_Bridge"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [1/4] Instalando archivos del servidor en:
echo       %INSTALL_DIR%
echo.

:: 1. Copiar bridge.js si existe en la misma carpeta o descargarlo
if exist "%~dp0bridge.js" (
    copy /Y "%~dp0bridge.js" "%INSTALL_DIR%\bridge.js" >nul
) else if exist "%~dp0print-bridge\bridge.js" (
    copy /Y "%~dp0print-bridge\bridge.js" "%INSTALL_DIR%\bridge.js" >nul
)

:: 2. Copiar bridge.ps1 si existe
if exist "%~dp0bridge.ps1" (
    copy /Y "%~dp0bridge.ps1" "%INSTALL_DIR%\bridge.ps1" >nul
) else if exist "%~dp0print-bridge\bridge.ps1" (
    copy /Y "%~dp0print-bridge\bridge.ps1" "%INSTALL_DIR%\bridge.ps1" >nul
)

:: Si no se encontraron los archivos locales, descargarlos desde el servidor Web
if not exist "%INSTALL_DIR%\bridge.js" (
    echo [INFO] Descargando archivos actualizados desde el servidor POS...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://sistemapos-backend.onrender.com/print-bridge/bridge.js' -OutFile '%INSTALL_DIR%\bridge.js' -UseBasicParsing" 2>nul
    if not exist "%INSTALL_DIR%\bridge.js" (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'http://localhost:4000/print-bridge/bridge.js' -OutFile '%INSTALL_DIR%\bridge.js' -UseBasicParsing" 2>nul
    )
)

if not exist "%INSTALL_DIR%\bridge.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://sistemapos-backend.onrender.com/print-bridge/bridge.ps1' -OutFile '%INSTALL_DIR%\bridge.ps1' -UseBasicParsing" 2>nul
)

:: 3. Crear script de inicio en la carpeta de instalacion
echo [2/4] Configurando script de ejecucion...
(
echo @echo off
echo title KAMIA Print Bridge Service
echo color 0A
echo cls
echo ======================================================================
echo           KAMIA POS - SERVIDOR LOCAL DE IMPRESION (PUERTO 8182)
echo ======================================================================
echo.
echo where node ^>nul 2^>nul
echo if %%ERRORLEVEL%% EQU 0 ^(
echo     if exist "%INSTALL_DIR%\bridge.js" ^(
echo         echo [OK] Iniciando con Node.js en puerto 8182...
echo         node "%INSTALL_DIR%\bridge.js"
echo         goto :end
echo     ^)
echo ^)
echo echo [OK] Iniciando con Motor Nativo PowerShell en puerto 8182...
echo powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\bridge.ps1"
echo :end
) > "%INSTALL_DIR%\Iniciar_Servicio.bat"

:: 4. Crear lanzador en segundo plano (VBScript invisible)
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run chr^(34^) ^& "%INSTALL_DIR%\Iniciar_Servicio.bat" ^& Chr^(34^), 0
echo Set WshShell = Nothing
) > "%INSTALL_DIR%\Iniciar_Oculto.vbs"

:: 5. Agregar al Inicio automatico de Windows
echo [3/4] Configurando inicio automatico con Windows...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%STARTUP_FOLDER%\KAMIA_Print_Bridge.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%INSTALL_DIR%\Iniciar_Oculto.vbs"
echo oLink.WorkingDirectory = "%INSTALL_DIR%"
echo oLink.Description = "KAMIA POS Thermal Print Bridge"
echo oLink.Save
) > "%INSTALL_DIR%\crear_acceso.vbs"

cscript //nologo "%INSTALL_DIR%\crear_acceso.vbs"
del "%INSTALL_DIR%\crear_acceso.vbs" >nul 2>nul

:: 6. Iniciar el servicio ahora mismo
echo [4/4] Iniciando el servicio en puerto 8182...

:: Cerrar posibles procesos previos en el puerto 8182
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8182" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

wscript "%INSTALL_DIR%\Iniciar_Oculto.vbs"
timeout /t 2 >nul

echo.
echo ======================================================================
echo   [OK] !INSTALACION COMPLETADA CON EXITO!
echo.
echo   - El Print Bridge ya esta activo en: http://localhost:8182
echo   - Se iniciara automaticamente cada vez que enciendas este computador.
echo.
echo   Regresa a tu navegador y haz clic en "Verificar Estado" en la pagina
echo   de Configuracion de Impresion del POS.
echo ======================================================================
echo.
pause
