@echo off
title KAMIA POS - Desinstalar Agente de Impresion
color 0C
cls
echo ======================================================================
echo           KAMIA POS - DESINSTALADOR DEL PRINT BRIDGE
echo ======================================================================
echo.

echo Deteniendo servicio en puerto 8182...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8182" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo Eliminando acceso directo de inicio automatico...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\KAMIA_Print_Bridge.lnk" >nul 2>nul

echo Eliminando archivos instalados...
rmdir /S /Q "%LOCALAPPDATA%\KAMIA_Print_Bridge" >nul 2>nul

echo.
echo [OK] El Print Bridge ha sido desinstalado correctamente de este equipo.
echo.
pause
