@echo off
title KAMIA POS - Desinstalador de Print Bridge
color 0C
cls

echo ======================================================================
echo           KAMIA POS - DESINSTALADOR DE PRINT BRIDGE (NODE.JS)
echo ======================================================================
echo.

echo   [1/3] Deteniendo procesos de Print Bridge en ejecucion...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 8088 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}; try { Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*PrintBridge*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}"

echo   [2/3] Eliminando inicio automatico con Windows...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_PATH=%STARTUP_FOLDER%\KAMIA_PrintBridge.vbs"
if exist "%VBS_PATH%" (
    del /f /q "%VBS_PATH%"
    echo   [OK] Acceso de inicio automatico eliminado.
)

echo   [3/3] Eliminando archivos de instalacion...
set "TARGET_DIR=%LOCALAPPDATA%\GastrosPOS\PrintBridge"
if exist "%TARGET_DIR%" (
    rmdir /s /q "%TARGET_DIR%"
    echo   [OK] Carpeta eliminada de AppData.
)

echo.
echo ======================================================================
echo    PRINT BRIDGE DESINSTALADO EXITOSAMENTE
echo ======================================================================
echo.
echo Presiona cualquier tecla para cerrar...
pause >nul
