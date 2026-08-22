@echo off
setlocal EnableDelayedExpansion
title KAMIA POS - Instalador del Agente de Impresion Termica Directa (Puerto 8182)
color 0A
cls

echo ======================================================================
echo           KAMIA POS - INSTALADOR DE IMPRESION TERMICA SILENCIOSA
echo ======================================================================
echo.
echo   Configurando Agente de Impresion Local en este computador...
echo   - Puerto: 8182 (ESC/POS directo a impresoras USB/Red/Windows)
echo   - Corte automatico de papel y apertura de cajon monedero
echo   - Inicio automatico con Windows (Segundo plano)
echo.
echo ======================================================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\KAMIA_Print_Bridge"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [1/4] Extrayendo archivos del servidor de impresion...

:: 1. Extraer bridge.js de forma 100%% offline e instantanea mediante certutil
certutil -decode "%~f0" "%INSTALL_DIR%\bridge.js" >nul 2>nul

:: 2. Crear bridge.ps1 para respaldo nativo de Windows si no hay Node.js
(
echo # KAMIA POS - Print Bridge Nativo de Windows (PowerShell^)
echo $ErrorActionPreference = 'SilentlyContinue'
echo $port = 8182
echo $listener = New-Object System.Net.HttpListener
echo $listener.Prefixes.Add^("http://localhost:$port/"^)
echo $listener.Prefixes.Add^("http://127.0.0.1:$port/"^)
echo try { $listener.Start^(^); Write-Host "[OK] Print Bridge activo en puerto $port" -ForegroundColor Green } catch { exit 0 }
echo while ^($true^) {
echo   try {
echo     $context = $listener.GetContext^(^)
echo     $req = $context.Request; $res = $context.Response
echo     $res.Headers.Add^('Access-Control-Allow-Origin', '*'^)
echo     $res.Headers.Add^('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'^)
echo     $res.Headers.Add^('Access-Control-Allow-Headers', '*'^)
echo     $res.Headers.Add^('Access-Control-Allow-Private-Network', 'true'^)
echo     if ^($req.HttpMethod -eq 'OPTIONS'^) { $res.StatusCode = 204; $res.Close^(^); continue }
echo     $path = $req.Url.AbsolutePath
echo     if ^($path -eq '/health' -or $path -eq '/' -or $path -eq '/status'^) {
echo       $json = '{"status":"online","service":"KAMIA PowerShell Print Bridge","port":8182,"version":"2.0.0"}'
echo       $buf = [System.Text.Encoding]::UTF8.GetBytes^($json^)
echo       $res.ContentType = 'application/json; charset=utf-8'; $res.ContentLength64 = $buf.Length
echo       $res.OutputStream.Write^($buf, 0, $buf.Length^); $res.Close^(^); continue
echo     }
echo     if ^($path -eq '/printers'^) {
echo       $pList = @^(^)
echo       try {
echo         $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue ^| Select-Object Name, Default, PortName, DriverName
echo         foreach ^($p in $printers^) { $pList += @{ name = [string]$p.Name; isDefault = [bool]$p.Default; port = [string]$p.PortName; driver = [string]$p.DriverName } }
echo       } catch {}
echo       $json = ConvertTo-Json @{ success = $true; printers = $pList }
echo       $buf = [System.Text.Encoding]::UTF8.GetBytes^($json^)
echo       $res.ContentType = 'application/json; charset=utf-8'; $res.ContentLength64 = $buf.Length
echo       $res.OutputStream.Write^($buf, 0, $buf.Length^); $res.Close^(^); continue
echo     }
echo     if ^($path -eq '/print' -or $path -eq '/test-print'^) {
echo       $reader = New-Object System.IO.StreamReader^($req.InputStream, [System.Text.Encoding]::UTF8^)
echo       $payload = ConvertFrom-Json $reader.ReadToEnd^(^)
echo       $textToPrint = $payload.text
echo       $printerName = $payload.printerName
echo       if ^($path -eq '/test-print'^) {
echo         $textToPrint = "========================================`r`n          KAMIA POS by JF         `r`n   *** TICKET DE PRUEBA EXITOSO ***`r`n----------------------------------------`r`nFecha: " + ^(Get-Date -Format "yyyy-MM-dd HH:mm:ss"^) + "`r`nMotor: PowerShell Nativo`r`nPuerto: 8182`r`n========================================`r`n`r`n`r`n`r`n"
echo       }
echo       if ^(![string]::IsNullOrWhiteSpace^($textToPrint^)^) {
echo         $tempFile = [System.IO.Path]::Combine^([System.IO.Path]::GetTempPath^(^), "pos_ticket_$([System.Guid]::NewGuid^(^).ToString^('N'^)).txt"^)
echo         [System.IO.File]::WriteAllText^($tempFile, $textToPrint + "`r`n`r`n`r`n`r`n", [System.Text.Encoding]::Default^)
echo         try {
echo           if ^(![string]::IsNullOrWhiteSpace^($printerName^)^) { Get-Content -Path $tempFile -Encoding Default ^| Out-Printer -Name $printerName.Trim^(^) }
echo           else { Get-Content -Path $tempFile -Encoding Default ^| Out-Printer }
echo           Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
echo         } catch { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
echo       }
echo       $buf = [System.Text.Encoding]::UTF8.GetBytes^('{"success":true,"message":"Impresion enviada"}'^)
echo       $res.ContentType = 'application/json; charset=utf-8'; $res.ContentLength64 = $buf.Length
echo       $res.OutputStream.Write^($buf, 0, $buf.Length^); $res.Close^(^); continue
echo     }
echo     $res.StatusCode = 404; $res.Close^(^)
echo   } catch { try { $res.Close^(^) } catch {} }
echo }
) > "%INSTALL_DIR%\bridge.ps1"

echo [2/4] Configurando script de ejecucion...
(
echo @echo off
echo title KAMIA Print Bridge Service
echo color 0A
echo cls
echo ======================================================================
echo           KAMIA POS - SERVIDOR LOCAL DE IMPRESION (PUERTO 8182^)
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

:: 3. Crear lanzador en segundo plano (VBScript invisible)
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run chr^(34^) ^& "%INSTALL_DIR%\Iniciar_Servicio.bat" ^& Chr^(34^), 0
echo Set WshShell = Nothing
) > "%INSTALL_DIR%\Iniciar_Oculto.vbs"

:: 4. Agregar al Inicio automatico de Windows
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

:: 5. Iniciar el servicio ahora mismo
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
exit /b 0

:: ======================================================================
:: DATOS DEL SERVIDOR (NO MODIFICAR)
:: ======================================================================
-----BEGIN CERTIFICATE-----
LyoqCiAqIEtBTUlBIGJ5IEpGIOKAlCBOb2RlLmpzIFRoZXJtYWwgUHJpbnQgQnJp
ZGdlIHYyLjAKICogU2Vydmlkb3IgSFRUUCBsb2NhbCBwYXJhIGltcHJlc2nDs24g
dMOpcm1pY2Egc2lsZW5jaW9zYSBkaXJlY3RhIChFU0MvUE9TKQogKiBQdWVydG8g
cG9yIGRlZmVjdG86IDgxODIKICovCgpjb25zdCBodHRwID0gcmVxdWlyZSgnaHR0
cCcpOwpjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7CmNvbnN0IHBhdGggPSByZXF1
aXJlKCdwYXRoJyk7CmNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTsKY29uc3QgeyBl
eGVjLCBleGVjRmlsZSB9ID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpOwpjb25z
dCBuZXQgPSByZXF1aXJlKCduZXQnKTsKCmNvbnN0IFBPUlQgPSBwcm9jZXNzLmVu
di5QT1JUIHx8IDgxODI7CmNvbnN0IEhPU1QgPSAnMC4wLjAuMCc7CgovLyBDb21h
bmRvcyBFU0MvUE9TIGVzdMOhbmRhcgpjb25zdCBFU0MgPSAnXHgxQic7CmNvbnN0
IEdTID0gJ1x4MUQnOwpjb25zdCBFU0NfSU5JVCA9IGAke0VTQ31AYDsgICAgICAg
ICAgICAgICAvLyBJbmljaWFsaXphciBpbXByZXNvcmEKY29uc3QgRVNDX0NVVF9G
VUxMID0gYCR7R1N9Vlx4MDBgOyAgICAgICAgLy8gQ29ydGUgdG90YWwKY29uc3Qg
RVNDX0NVVF9QQVJUSUFMID0gYCR7R1N9Vlx4MDFgOyAgICAgLy8gQ29ydGUgcGFy
Y2lhbApjb25zdCBFU0NfRFJBV0VSID0gYCR7RVNDfXBceDAwXHgxOVx4RkFgOyAv
LyBBYnJpciBnYXZldGEgLyBjYWrDs24gbW9uZWRlcm8KCi8qKgogKiBPYnRlbmVy
IGxpc3RhIGRlIGltcHJlc29yYXMgZGUgV2luZG93cyB1c2FuZG8gUG93ZXJTaGVs
bAogKi8KZnVuY3Rpb24gZ2V0V2luZG93c1ByaW50ZXJzKCkgewogIHJldHVybiBu
ZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gewogICAgY29uc3QgcHNDbWQgPSBgR2V0
LUNpbUluc3RhbmNlIFdpbjMyX1ByaW50ZXIgfCBTZWxlY3QtT2JqZWN0IE5hbWUs
IERlZmF1bHQsIFBvcnROYW1lLCBEcml2ZXJOYW1lLCBQcmludGVyU3RhdHVzIHwg
Q29udmVydFRvLUpzb24gLUNvbXByZXNzYDsKICAgIGV4ZWNGaWxlKCdwb3dlcnNo
ZWxsJywgWyctTm9Qcm9maWxlJywgJy1FeGVjdXRpb25Qb2xpY3knLCAnQnlwYXNz
JywgJy1Db21tYW5kJywgcHNDbWRdLCB7IHdpbmRvd3NIaWRlOiB0cnVlLCB0aW1l
b3V0OiA2MDAwIH0sIChlcnIsIHN0ZG91dCkgPT4gewogICAgICBpZiAoZXJyIHx8
ICFzdGRvdXQudHJpbSgpKSB7CiAgICAgICAgZXhlYygnd21pYyBwcmludGVyIGdl
dCBuYW1lLGRlZmF1bHQgL2Zvcm1hdDpjc3YnLCB7IHdpbmRvd3NIaWRlOiB0cnVl
LCB0aW1lb3V0OiA0MDAwIH0sICh3bWljRXJyLCB3bWljT3V0KSA9PiB7CiAgICAg
ICAgICBpZiAod21pY0VyciB8fCAhd21pY091dCkgewogICAgICAgICAgICByZXR1
cm4gcmVzb2x2ZShbeyBuYW1lOiAnSW1wcmVzb3JhIFByZWRldGVybWluYWRhIGRl
IFdpbmRvd3MnLCBpc0RlZmF1bHQ6IHRydWUsIHBvcnQ6ICdERUZBVUxUJyB9XSk7
CiAgICAgICAgICB9CiAgICAgICAgICBjb25zdCBsaW5lcyA9IHdtaWNPdXQuc3Bs
aXQoJ1xuJykubWFwKGwgPT4gbC50cmltKCkpLmZpbHRlcihCb29sZWFuKS5zbGlj
ZSgxKTsKICAgICAgICAgIGNvbnN0IHByaW50ZXJzID0gbGluZXMubWFwKGxpbmUg
PT4gewogICAgICAgICAgICBjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoJywnKTsK
ICAgICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+PSAzKSB7CiAgICAgICAgICAg
ICAgcmV0dXJuIHsgbmFtZTogcGFydHNbMl0udHJpbSgpLCBpc0RlZmF1bHQ6IHBh
cnRzWzFdLnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZScsIHBvcnQ6ICdV
U0IvTFBUJyB9OwogICAgICAgICAgICB9CiAgICAgICAgICAgIHJldHVybiBudWxs
OwogICAgICAgICAgfSkuZmlsdGVyKEJvb2xlYW4pOwogICAgICAgICAgcmVzb2x2
ZShwcmludGVycy5sZW5ndGggPiAwID8gcHJpbnRlcnMgOiBbeyBuYW1lOiAnSW1w
cmVzb3JhIFByZWRldGVybWluYWRhIGRlIFdpbmRvd3MnLCBpc0RlZmF1bHQ6IHRy
dWUsIHBvcnQ6ICdERUZBVUxUJyB9XSk7CiAgICAgICAgfSk7CiAgICAgICAgcmV0
dXJuOwogICAgICB9CgogICAgICB0cnkgewogICAgICAgIGxldCBkYXRhID0gSlNP
Ti5wYXJzZShzdGRvdXQpOwogICAgICAgIGlmICghQXJyYXkuaXNBcnJheShkYXRh
KSkgZGF0YSA9IFtkYXRhXTsKICAgICAgICBjb25zdCBwcmludGVycyA9IGRhdGEu
bWFwKHAgPT4gKHsKICAgICAgICAgIG5hbWU6IHAuTmFtZSB8fCAnSW1wcmVzb3Jh
JywKICAgICAgICAgIGlzRGVmYXVsdDogQm9vbGVhbihwLkRlZmF1bHQpLAogICAg
ICAgICAgcG9ydDogcC5Qb3J0TmFtZSB8fCAnJywKICAgICAgICAgIGRyaXZlcjog
cC5Ecml2ZXJOYW1lIHx8ICcnLAogICAgICAgICAgc3RhdHVzOiBwLlByaW50ZXJT
dGF0dXMgfHwgMwogICAgICAgIH0pKTsKICAgICAgICByZXNvbHZlKHByaW50ZXJz
KTsKICAgICAgfSBjYXRjaCAocGFyc2VFcnIpIHsKICAgICAgICByZXNvbHZlKFt7
IG5hbWU6ICdJbXByZXNvcmEgUHJlZGV0ZXJtaW5hZGEgZGUgV2luZG93cycsIGlz
RGVmYXVsdDogdHJ1ZSwgcG9ydDogJ0RFRkFVTFQnIH1dKTsKICAgICAgfQogICAg
fSk7CiAgfSk7Cn0KCi8qKgogKiBJbXByaW1pciBSQVcgZW4gaW1wcmVzb3JhIGRl
IHJlZCAoVENQIFNvY2tldCBwdWVydG8gOTEwMCkKICovCmZ1bmN0aW9uIHByaW50
TmV0d29ya1NvY2tldChpcCwgcG9ydCA9IDkxMDAsIGJ1ZmZlcikgewogIHJldHVy
biBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7CiAgICBjb25zdCBj
bGllbnQgPSBuZXcgbmV0LlNvY2tldCgpOwogICAgY2xpZW50LnNldFRpbWVvdXQo
NTAwMCk7CiAgICBjbGllbnQuY29ubmVjdChwb3J0LCBpcCwgKCkgPT4gewogICAg
ICBjbGllbnQud3JpdGUoYnVmZmVyLCAoKSA9PiB7CiAgICAgICAgY2xpZW50LmVu
ZCgpOwogICAgICAgIHJlc29sdmUodHJ1ZSk7CiAgICAgIH0pOwogICAgfSk7CiAg
ICBjbGllbnQub24oJ2Vycm9yJywgKGVycikgPT4gcmVqZWN0KGVycikpOwogICAg
Y2xpZW50Lm9uKCd0aW1lb3V0JywgKCkgPT4gewogICAgICBjbGllbnQuZGVzdHJv
eSgpOwogICAgICByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IGRlIGNvbmV4acOz
biBhIGxhIGltcHJlc29yYSBlbiAke2lwfToke3BvcnR9YCkpOwogICAgfSk7CiAg
fSk7Cn0KCi8qKgogKiBJbXByaW1pciBlbiBpbXByZXNvcmEgbG9jYWwvY29tcGFy
dGlkYSBkZSBXaW5kb3dzIHVzYW5kbyB3aW5zcG9vbCBSQVcgeSBPdXQtUHJpbnRl
ciBmYWxsYmFjawogKi8KZnVuY3Rpb24gcHJpbnRXaW5kb3dzU3Bvb2xlcihwcmlu
dGVyTmFtZSwgYnVmZmVyKSB7CiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZl
LCByZWplY3QpID0+IHsKICAgIGNvbnN0IHRlbXBEaXIgPSBvcy50bXBkaXIoKTsK
ICAgIGNvbnN0IHRlbXBGaWxlID0gcGF0aC5qb2luKHRlbXBEaXIsIGBrYW1pYV9w
cmludF8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNiku
c3Vic3RyaW5nKDIsIDcpfS5iaW5gKTsKCiAgICBmcy53cml0ZUZpbGUodGVtcEZp
bGUsIGJ1ZmZlciwgKHdyaXRlRXJyKSA9PiB7CiAgICAgIGlmICh3cml0ZUVycikg
cmV0dXJuIHJlamVjdCh3cml0ZUVycik7CgogICAgICBjb25zdCB0YXJnZXRQcmlu
dGVyID0gKHByaW50ZXJOYW1lICYmIHByaW50ZXJOYW1lLnRyaW0oKSkgPyBwcmlu
dGVyTmFtZS50cmltKCkgOiAnJzsKCiAgICAgIC8vIFNjcmlwdCBQb3dlclNoZWxs
IGNvbiBQL0ludm9rZSBhIHdpbnNwb29sLkRydiBwYXJhIGVudsOtbyBSQVcgMTAw
JSBwdXJvIHkgc2lsZW5jaW9zbwogICAgICBjb25zdCBwc1NjcmlwdCA9IGAKJEVy
cm9yQWN0aW9uUHJlZmVyZW5jZSA9ICdTdG9wJwokcHJpbnRlck5hbWUgPSAiJHt0
YXJnZXRQcmludGVyLnJlcGxhY2UoLyIvZywgJ2AiJyl9IgokZmlsZVBhdGggPSAi
JHt0ZW1wRmlsZS5yZXBsYWNlKC9cXC9nLCAnXFxcXCcpfSIKCmlmIChbc3RyaW5n
XTo6SXNOdWxsT3JXaGl0ZVNwYWNlKCRwcmludGVyTmFtZSkpIHsKICAgICRkZWYg
PSBHZXQtQ2ltSW5zdGFuY2UgV2luMzJfUHJpbnRlciAtRmlsdGVyICJEZWZhdWx0
ID0gVHJ1ZSIgLUVycm9yQWN0aW9uIFNpbGVudGx5Q29udGludWUKICAgIGlmICgk
ZGVmKSB7ICRwcmludGVyTmFtZSA9ICRkZWYuTmFtZSB9Cn0KCiRyYXdUeXBlID0g
QCIKdXNpbmcgU3lzdGVtOwp1c2luZyBTeXN0ZW0uSU87CnVzaW5nIFN5c3RlbS5S
dW50aW1lLkludGVyb3BTZXJ2aWNlczsKCnB1YmxpYyBjbGFzcyBSYXdQcmludGVy
SGVscGVyIHsKICAgIFtTdHJ1Y3RMYXlvdXQoTGF5b3V0S2luZC5TZXF1ZW50aWFs
LCBDaGFyU2V0ID0gQ2hhclNldC5BbnNpKV0KICAgIHB1YmxpYyBjbGFzcyBET0NJ
TkZPQSB7CiAgICAgICAgW01hcnNoYWxBcyhVbm1hbmFnZWRUeXBlLkxQU3RyKV0g
cHVibGljIHN0cmluZyBwRG9jTmFtZTsKICAgICAgICBbTWFyc2hhbEFzKFVubWFu
YWdlZFR5cGUuTFBTdHIpXSBwdWJsaWMgc3RyaW5nIHBPdXRwdXRGaWxlOwogICAg
ICAgIFtNYXJzaGFsQXMoVW5tYW5hZ2VkVHlwZS5MUFN0cildIHB1YmxpYyBzdHJp
bmcgcERhdGFUeXBlOwogICAgfQoKICAgIFtEbGxJbXBvcnQoIndpbnNwb29sLkRy
diIsIEVudHJ5UG9pbnQgPSAiT3BlblByaW50ZXJBIiwgU2V0TGFzdEVycm9yID0g
dHJ1ZSwgQ2hhclNldCA9IENoYXJTZXQuQW5zaSwgRXhhY3RTcGVsbGluZyA9IHRy
dWUsIENhbGxpbmdDb252ZW50aW9uID0gQ2FsbGluZ0NvbnZlbnRpb24uU3RkQ2Fs
bCldCiAgICBwdWJsaWMgc3RhdGljIGV4dGVybiBib29sIE9wZW5QcmludGVyKFtN
YXJzaGFsQXMoVW5tYW5hZ2VkVHlwZS5MUFN0cildIHN0cmluZyBzelByaW50ZXIs
IG91dCBJbnRQdHIgaFByaW50ZXIsIEludFB0ciBwZCk7CgogICAgW0RsbEltcG9y
dCgid2luc3Bvb2wuRHJ2IiwgRW50cnlQb2ludCA9ICJDbG9zZVByaW50ZXIiLCBT
ZXRMYXN0RXJyb3IgPSB0cnVlLCBFeGFjdFNwZWxsaW5nID0gdHJ1ZSwgQ2FsbGlu
Z0NvbnZlbnRpb24gPSBDYWxsaW5nQ29udmVudGlvbi5TdGRDYWxsKV0KICAgIHB1
YmxpYyBzdGF0aWMgZXh0ZXJuIGJvb2wgQ2xvc2VQcmludGVyKEludFB0ciBoUHJp
bnRlcik7CgogICAgW0RsbEltcG9ydCgid2luc3Bvb2wuRHJ2IiwgRW50cnlQb2lu
dCA9ICJTdGFydERvY1ByaW50ZXJBIiwgU2V0TGFzdEVycm9yID0gdHJ1ZSwgQ2hh
clNldCA9IENoYXJTZXQuQW5zaSwgRXhhY3RTcGVsbGluZyA9IHRydWUsIENhbGxp
bmdDb252ZW50aW9uID0gQ2FsbGluZ0NvbnZlbnRpb24uU3RkQ2FsbCldCiAgICBw
dWJsaWMgc3RhdGljIGV4dGVybiBib29sIFN0YXJ0RG9jUHJpbnRlcihJbnRQdHIg
aFByaW50ZXIsIEludDMyIGxldmVsLCBbSW4sIE1hcnNoYWxBcyhVbm1hbmFnZWRU
eXBlLkxQU3RydWN0KV0gRE9DSU5GT0EgZGkpOwoKICAgIFtEbGxJbXBvcnQoIndp
bnNwb29sLkRydiIsIEVudHJ5UG9pbnQgPSAiRW5kRG9jUHJpbnRlciIsIFNldExh
c3RFcnJvciA9IHRydWUsIEV4YWN0U3BlbGxpbmcgPSB0cnVlLCBDYWxsaW5nQ29u
dmVudGlvbiA9IENhbGxpbmdDb252ZW50aW9uLlN0ZENhbGwpXQogICAgcHVibGlj
IHN0YXRpYyBleHRlcm4gYm9vbCBFbmREb2NQcmludGVyKEludFB0ciBoUHJpbnRl
cik7CgogICAgW0RsbEltcG9ydCgid2luc3Bvb2wuRHJ2IiwgRW50cnlQb2ludCA9
ICJTdGFydFBhZ2VQcmludGVyIiwgU2V0TGFzdEVycm9yID0gdHJ1ZSwgRXhhY3RT
cGVsbGluZyA9IHRydWUsIENhbGxpbmdDb252ZW50aW9uID0gQ2FsbGluZ0NvbnZl
bnRpb24uU3RkQ2FsbCldCiAgICBwdWJsaWMgc3RhdGljIGV4dGVybiBib29sIFN0
YXJ0UGFnZVByaW50ZXIoSW50UHRyIGhQcmludGVyKTsKCiAgICBbRGxsSW1wb3J0
KCJ3aW5zcG9vbC5EcnYiLCBFbnRyeVBvaW50ID0gIkVuZFBhZ2VQcmludGVyIiwg
U2V0TGFzdEVycm9yID0gdHJ1ZSwgRXhhY3RTcGVsbGluZyA9IHRydWUsIENhbGxp
bmdDb252ZW50aW9uID0gQ2FsbGluZ0NvbnZlbnRpb24uU3RkQ2FsbCldCiAgICBw
dWJsaWMgc3RhdGljIGV4dGVybiBib29sIEVuZFBhZ2VQcmludGVyKEludFB0ciBo
UHJpbnRlcik7CgogICAgW0RsbEltcG9ydCgid2luc3Bvb2wuRHJ2IiwgRW50cnlQ
b2ludCA9ICJXcml0ZVByaW50ZXIiLCBTZXRMYXN0RXJyb3IgPSB0cnVlLCBFeGFj
dFNwZWxsaW5nID0gdHJ1ZSwgQ2FsbGluZ0NvbnZlbnRpb24gPSBDYWxsaW5nQ29u
dmVudGlvbi5TdGRDYWxsKV0KICAgIHB1YmxpYyBzdGF0aWMgZXh0ZXJuIGJvb2wg
V3JpdGVQcmludGVyKEludFB0ciBoUHJpbnRlciwgSW50UHRyIHBCeXRlcywgSW50
MzIgZHdDb3VudCwgb3V0IEludDMyIGR3V3JpdHRlbik7CgogICAgcHVibGljIHN0
YXRpYyBib29sIFNlbmRCeXRlc1RvUHJpbnRlcihzdHJpbmcgc3pQcmludGVyTmFt
ZSwgYnl0ZVtdIGJ5dGVzKSB7CiAgICAgICAgSW50UHRyIGhQcmludGVyID0gbmV3
IEludFB0cigwKTsKICAgICAgICBET0NJTkZPQSBkaSA9IG5ldyBET0NJTkZPQSgp
OwogICAgICAgIGRpLnBEb2NOYW1lID0gIktBTUlBIFBPUyBUaGVybWFsIERvY3Vt
ZW50IjsKICAgICAgICBkaS5wRGF0YVR5cGUgPSAiUkFXIjsKCiAgICAgICAgaWYg
KE9wZW5QcmludGVyKHN6UHJpbnRlck5hbWUuTm9ybWFsaXplKCksIG91dCBoUHJp
bnRlciwgSW50UHRyLlplcm8pKSB7CiAgICAgICAgICAgIGlmIChTdGFydERvY1By
aW50ZXIoaFByaW50ZXIsIDEsIGRpKSkgewogICAgICAgICAgICAgICAgaWYgKFN0
YXJ0UGFnZVByaW50ZXIoaFByaW50ZXIpKSB7CiAgICAgICAgICAgICAgICAgICAg
SW50UHRyIHBVbm1hbmFnZWRCeXRlcyA9IE1hcnNoYWwuQWxsb2NDb1Rhc2tNZW0o
Ynl0ZXMuTGVuZ3RoKTsKICAgICAgICAgICAgICAgICAgICBNYXJzaGFsLkNvcHko
Ynl0ZXMsIDAsIHBVbm1hbmFnZWRCeXRlcywgYnl0ZXMuTGVuZ3RoKTsKICAgICAg
ICAgICAgICAgICAgICBpbnQgZHdXcml0dGVuID0gMDsKICAgICAgICAgICAgICAg
ICAgICBib29sIGJTdWNjZXNzID0gV3JpdGVQcmludGVyKGhQcmludGVyLCBwVW5t
YW5hZ2VkQnl0ZXMsIGJ5dGVzLkxlbmd0aCwgb3V0IGR3V3JpdHRlbik7CiAgICAg
ICAgICAgICAgICAgICAgTWFyc2hhbC5GcmVlQ29UYXNrTWVtKHBVbm1hbmFnZWRC
eXRlcyk7CiAgICAgICAgICAgICAgICAgICAgRW5kUGFnZVByaW50ZXIoaFByaW50
ZXIpOwogICAgICAgICAgICAgICAgICAgIEVuZERvY1ByaW50ZXIoaFByaW50ZXIp
OwogICAgICAgICAgICAgICAgICAgIENsb3NlUHJpbnRlcihoUHJpbnRlcik7CiAg
ICAgICAgICAgICAgICAgICAgcmV0dXJuIGJTdWNjZXNzOwogICAgICAgICAgICAg
ICAgfQogICAgICAgICAgICAgICAgRW5kRG9jUHJpbnRlcihoUHJpbnRlcik7CiAg
ICAgICAgICAgIH0KICAgICAgICAgICAgQ2xvc2VQcmludGVyKGhQcmludGVyKTsK
ICAgICAgICB9CiAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgfQp9CiJACgp0cnkg
ewogICAgQWRkLVR5cGUgLVR5cGVEZWZpbml0aW9uICRyYXdUeXBlIC1FcnJvckFj
dGlvbiBTaWxlbnRseUNvbnRpbnVlCiAgICAkYnl0ZXMgPSBbU3lzdGVtLklPLkZp
bGVdOjpSZWFkQWxsQnl0ZXMoJGZpbGVQYXRoKQogICAgJG9rID0gW1Jhd1ByaW50
ZXJIZWxwZXJdOjpTZW5kQnl0ZXNUb1ByaW50ZXIoJHByaW50ZXJOYW1lLCAkYnl0
ZXMpCiAgICBpZiAoLW5vdCAkb2spIHsgdGhyb3cgIldpblNwb29sIE9wZW5Qcmlu
dGVyIGZhaWxlZCBmb3IgJyRwcmludGVyTmFtZSciIH0KICAgIFdyaXRlLU91dHB1
dCAiT0tfV0lOU1BPT0wiCn0gY2F0Y2ggewogICAgIyBGYWxsYmFjayBzaSBmYWxs
YSBQL0ludm9rZTogT3V0LVByaW50ZXIgbyBDb3B5IC9iIGEgcHVlcnRvCiAgICB0
cnkgewogICAgICAgIGlmIChbc3RyaW5nXTo6SXNOdWxsT3JXaGl0ZVNwYWNlKCRw
cmludGVyTmFtZSkpIHsKICAgICAgICAgICAgR2V0LUNvbnRlbnQgLVBhdGggJGZp
bGVQYXRoIC1FbmNvZGluZyBCeXRlIC1SYXcgfCBPdXQtUHJpbnRlcgogICAgICAg
IH0gZWxzZSB7CiAgICAgICAgICAgIEdldC1Db250ZW50IC1QYXRoICRmaWxlUGF0
aCAtRW5jb2RpbmcgQnl0ZSAtUmF3IHwgT3V0LVByaW50ZXIgLU5hbWUgJHByaW50
ZXJOYW1lCiAgICAgICAgfQogICAgICAgIFdyaXRlLU91dHB1dCAiT0tfRkFMTEJB
Q0siCiAgICB9IGNhdGNoIHsKICAgICAgICB0aHJvdyAkXwogICAgfQp9CmA7Cgog
ICAgICBleGVjRmlsZSgncG93ZXJzaGVsbCcsIFsnLU5vUHJvZmlsZScsICctRXhl
Y3V0aW9uUG9saWN5JywgJ0J5cGFzcycsICctQ29tbWFuZCcsIHBzU2NyaXB0XSwg
eyB3aW5kb3dzSGlkZTogdHJ1ZSwgdGltZW91dDogODAwMCB9LCAocHNFcnIsIHBz
U3Rkb3V0LCBwc1N0ZGVycikgPT4gewogICAgICAgIGZzLnVubGluayh0ZW1wRmls
ZSwgKCkgPT4ge30pOwogICAgICAgIGlmIChwc0VycikgewogICAgICAgICAgY29u
c29sZS53YXJuKGBbUHJpbnRCcmlkZ2VdIEVycm9yIGVuIHNwb29sZXI6YCwgcHNT
dGRlcnIgfHwgcHNFcnIubWVzc2FnZSk7CiAgICAgICAgICByZXR1cm4gcmVqZWN0
KG5ldyBFcnJvcihwc1N0ZGVyciB8fCBwc0Vyci5tZXNzYWdlKSk7CiAgICAgICAg
fQogICAgICAgIHJlc29sdmUodHJ1ZSk7CiAgICAgIH0pOwogICAgfSk7CiAgfSk7
Cn0KCi8qKgogKiBTZXJ2aWRvciBIVFRQCiAqLwpjb25zdCBzZXJ2ZXIgPSBodHRw
LmNyZWF0ZVNlcnZlcihhc3luYyAocmVxLCByZXMpID0+IHsKICAvLyBDT1JTICYg
UHJpdmF0ZSBOZXR3b3JrIEFjY2VzcyBIZWFkZXJzIChwYXJhIHNvcG9ydGFyIEhU
VFBTIGRlc2RlIFJlbmRlciBvIElQcyBsb2NhbGVzIGhhY2lhIGxvY2FsaG9zdCkK
ICByZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAn
KicpOwogIHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhv
ZHMnLCAnR0VULCBQT1NULCBQVVQsIERFTEVURSwgT1BUSU9OUycpOwogIHJlcy5z
ZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCAnKicpOwog
IHJlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LVByaXZhdGUtTmV0
d29yaycsICd0cnVlJyk7CiAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wt
TWF4LUFnZScsICc4NjQwMCcpOwogIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlw
ZScsICdhcHBsaWNhdGlvbi9qc29uOyBjaGFyc2V0PXV0Zi04Jyk7CgogIGlmIChy
ZXEubWV0aG9kID09PSAnT1BUSU9OUycpIHsKICAgIHJlcy53cml0ZUhlYWQoMjA0
KTsKICAgIHJldHVybiByZXMuZW5kKCk7CiAgfQoKICBjb25zdCB1cmwgPSByZXEu
dXJsLnNwbGl0KCc/JylbMF07CgogIC8vIDEuIEdFVCAvaGVhbHRoIG8gL3N0YXR1
cwogIGlmIChyZXEubWV0aG9kID09PSAnR0VUJyAmJiAodXJsID09PSAnLycgfHwg
dXJsID09PSAnL2hlYWx0aCcgfHwgdXJsID09PSAnL3N0YXR1cycpKSB7CiAgICBy
ZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7CiAgICAgIHN0YXR1czogJ29u
bGluZScsCiAgICAgIHNlcnZpY2U6ICdLQU1JQSBOb2RlLmpzIFByaW50IEJyaWRn
ZScsCiAgICAgIHZlcnNpb246ICcyLjAuMCcsCiAgICAgIG5vZGVWZXJzaW9uOiBw
cm9jZXNzLnZlcnNpb24sCiAgICAgIHBsYXRmb3JtOiBvcy5wbGF0Zm9ybSgpLAog
ICAgICBhcmNoOiBvcy5hcmNoKCksCiAgICAgIGhvc3RuYW1lOiBvcy5ob3N0bmFt
ZSgpLAogICAgICB1cHRpbWVTZWNvbmRzOiBNYXRoLmZsb29yKHByb2Nlc3MudXB0
aW1lKCkpLAogICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmco
KQogICAgfSkpOwogIH0KCiAgLy8gMi4gR0VUIC9wcmludGVycwogIGlmIChyZXEu
bWV0aG9kID09PSAnR0VUJyAmJiB1cmwgPT09ICcvcHJpbnRlcnMnKSB7CiAgICB0
cnkgewogICAgICBjb25zdCBwcmludGVycyA9IGF3YWl0IGdldFdpbmRvd3NQcmlu
dGVycygpOwogICAgICByZXR1cm4gcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1
Y2Nlc3M6IHRydWUsIHByaW50ZXJzIH0pKTsKICAgIH0gY2F0Y2ggKGVycikgewog
ICAgICByZXR1cm4gcmVzLndyaXRlSGVhZCg1MDApLmVuZChKU09OLnN0cmluZ2lm
eSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSkpOwogICAg
fQogIH0KCiAgLy8gMy4gUE9TVCAvcHJpbnQKICBpZiAocmVxLm1ldGhvZCA9PT0g
J1BPU1QnICYmIHVybCA9PT0gJy9wcmludCcpIHsKICAgIGxldCBib2R5ID0gJyc7
CiAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiB7IGJvZHkgKz0gY2h1bms7IH0p
OwogICAgcmVxLm9uKCdlbmQnLCBhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAg
ICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoYm9keSB8fCAne30nKTsK
ICAgICAgICBjb25zdCB7IHRleHQsIHJhdywgcHJpbnRlck5hbWUsIGN1dFBhcGVy
ID0gdHJ1ZSwgb3BlbkRyYXdlciA9IGZhbHNlLCBpcCA9IG51bGwsIHBvcnQgPSA5
MTAwIH0gPSBwYXlsb2FkOwoKICAgICAgICBpZiAoIXRleHQgJiYgIXJhdyAmJiAh
b3BlbkRyYXdlcikgewogICAgICAgICAgcmV0dXJuIHJlcy53cml0ZUhlYWQoNDAw
KS5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdF
bCBjYW1wbyAidGV4dCIsICJyYXciIG8gIm9wZW5EcmF3ZXIiIGVzIHJlcXVlcmlk
bycgfSkpOwogICAgICAgIH0KCiAgICAgICAgbGV0IGNodW5rcyA9IFtdOwogICAg
ICAgIGNodW5rcy5wdXNoKEJ1ZmZlci5mcm9tKEVTQ19JTklULCAnYmluYXJ5Jykp
OwoKICAgICAgICBpZiAob3BlbkRyYXdlcikgewogICAgICAgICAgY2h1bmtzLnB1
c2goQnVmZmVyLmZyb20oRVNDX0RSQVdFUiwgJ2JpbmFyeScpKTsKICAgICAgICB9
CgogICAgICAgIGlmICh0ZXh0KSB7CiAgICAgICAgICBjaHVua3MucHVzaChCdWZm
ZXIuZnJvbSh0ZXh0LCAnbGF0aW4xJykpOwogICAgICAgIH0KCiAgICAgICAgaWYg
KHJhdykgewogICAgICAgICAgY2h1bmtzLnB1c2goQnVmZmVyLmZyb20ocmF3LCAn
YmluYXJ5JykpOwogICAgICAgIH0KCiAgICAgICAgY29uc3Qgc2hvdWxkQ3V0ID0g
KHRleHQgfHwgcmF3KSA/IChjdXRQYXBlciAhPT0gZmFsc2UpIDogZmFsc2U7CiAg
ICAgICAgaWYgKHNob3VsZEN1dCkgewogICAgICAgICAgY2h1bmtzLnB1c2goQnVm
ZmVyLmZyb20oJ1xuXG5cblxuJywgJ2xhdGluMScpKTsKICAgICAgICAgIGNodW5r
cy5wdXNoKEJ1ZmZlci5mcm9tKEVTQ19DVVRfUEFSVElBTCwgJ2JpbmFyeScpKTsK
ICAgICAgICB9CgogICAgICAgIGNvbnN0IGZpbmFsQnVmZmVyID0gQnVmZmVyLmNv
bmNhdChjaHVua3MpOwoKICAgICAgICBpZiAoaXApIHsKICAgICAgICAgIGF3YWl0
IHByaW50TmV0d29ya1NvY2tldChpcCwgcG9ydCwgZmluYWxCdWZmZXIpOwogICAg
ICAgICAgcmV0dXJuIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0
cnVlLCBtZXNzYWdlOiBgSW1wcmVzacOzbiBlbnZpYWRhIGEgc29ja2V0IGRlIHJl
ZCAke2lwfToke3BvcnR9YCB9KSk7CiAgICAgICAgfQoKICAgICAgICBhd2FpdCBw
cmludFdpbmRvd3NTcG9vbGVyKHByaW50ZXJOYW1lLCBmaW5hbEJ1ZmZlcik7CiAg
ICAgICAgcmV0dXJuIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBzdWNjZXNzOiB0
cnVlLCBtZXNzYWdlOiBgVHJhYmFqbyBlbnZpYWRvIGEgbGEgY29sYSBkZSAke3By
aW50ZXJOYW1lIHx8ICdJbXByZXNvcmEgUHJlZGV0ZXJtaW5hZGEnfWAgfSkpOwoK
ICAgICAgfSBjYXRjaCAoZXJyKSB7CiAgICAgICAgY29uc29sZS5lcnJvcignW1By
aW50QnJpZGdlXSBFcnJvciBhbCBwcm9jZXNhciBpbXByZXNpw7NuOicsIGVycik7
CiAgICAgICAgcmV0dXJuIHJlcy53cml0ZUhlYWQoNTAwKS5lbmQoSlNPTi5zdHJp
bmdpZnkoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyci5tZXNzYWdlIH0pKTsK
ICAgICAgfQogICAgfSk7CiAgICByZXR1cm47CiAgfQoKICAvLyA0LiBQT1NUIC90
ZXN0LXByaW50CiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiB1cmwgPT09
ICcvdGVzdC1wcmludCcpIHsKICAgIGxldCBib2R5ID0gJyc7CiAgICByZXEub24o
J2RhdGEnLCBjaHVuayA9PiB7IGJvZHkgKz0gY2h1bms7IH0pOwogICAgcmVxLm9u
KCdlbmQnLCBhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3Qg
cGF5bG9hZCA9IEpTT04ucGFyc2UoYm9keSB8fCAne30nKTsKICAgICAgICBjb25z
dCBwcmludGVyTmFtZSA9IHBheWxvYWQucHJpbnRlck5hbWUgfHwgbnVsbDsKICAg
ICAgICBjb25zdCB0ZXN0VHlwZSA9IHBheWxvYWQudHlwZSB8fCAnY29tYW5kYSc7
CgogICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmco
J2VzLUNPJyk7CiAgICAgICAgY29uc3Qgc2VwYXJhdG9yID0gJz09PT09PT09PT09
PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0nOwogICAgICAgIGNvbnN0IGxp
bmUgPSAnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSc7
CgogICAgICAgIGxldCB0ZXN0VGV4dCA9ICcnOwogICAgICAgIHRlc3RUZXh0ICs9
IGAke3NlcGFyYXRvcn1cbmA7CiAgICAgICAgdGVzdFRleHQgKz0gYCAgICAgICAg
ICBLQU1JQSBQT1MgJiBFUlAgYnkgSkYgICAgICAgICBcbmA7CiAgICAgICAgdGVz
dFRleHQgKz0gYCAgICAgICJUb2RvIHR1IG5lZ29jaW8sIGNvbmVjdGFkby4iICAg
ICBcbmA7CiAgICAgICAgdGVzdFRleHQgKz0gYCR7c2VwYXJhdG9yfVxuYDsKICAg
ICAgICB0ZXN0VGV4dCArPSBgICAgKioqIFRJQ0tFVCBERSBQUlVFQkEgREUgSU1Q
UkVTSU9OICoqKiBcbmA7CiAgICAgICAgdGVzdFRleHQgKz0gYCR7bGluZX1cbmA7
CiAgICAgICAgdGVzdFRleHQgKz0gYEZlY2hhIC8gSG9yYTogICR7bm93fVxuYDsK
ICAgICAgICB0ZXN0VGV4dCArPSBgU2VydmljaW86ICAgICAgS0FNSUEgTm9kZS5q
cyBQcmludCBCcmlkZ2UgdjIuMFxuYDsKICAgICAgICB0ZXN0VGV4dCArPSBgTW90
b3I6ICAgICAgICAgTm9kZS5qcyAke3Byb2Nlc3MudmVyc2lvbn1cbmA7CiAgICAg
ICAgdGVzdFRleHQgKz0gYEltcHJlc29yYTogICAgICR7cHJpbnRlck5hbWUgfHwg
J1ByZWRldGVybWluYWRhIGRlIFdpbmRvd3MnfVxuYDsKICAgICAgICB0ZXN0VGV4
dCArPSBgRGVzdGlubzogICAgICAgJHt0ZXN0VHlwZSA9PT0gJ2NvY2luYScgPyAn
Q29jaW5hIChDb21hbmRhKScgOiAodGVzdFR5cGUgPT09ICdjYWphJyA/ICdDYWph
IChGYWN0dXJhY2nDs24pJyA6ICdHZW5lcmFsJyl9XG5gOwogICAgICAgIHRlc3RU
ZXh0ICs9IGAke2xpbmV9XG5gOwogICAgICAgIHRlc3RUZXh0ICs9IGBDYXJhY3Rl
cmVzIEVzcGVjaWFsZXMgLyBBY2VudG9zOlxuYDsKICAgICAgICB0ZXN0VGV4dCAr
PSBgw6Egw6kgw60gw7Mgw7ogw7Egw4Egw4kgw40gw5Mgw5ogw5EgJCAlICYgQCAj
XG5gOwogICAgICAgIHRlc3RUZXh0ICs9IGAke2xpbmV9XG5gOwogICAgICAgIHRl
c3RUZXh0ICs9IGBFc3RhZG86ICAgICAgICBDT05FWElPTiAxMDAlIEVYSVRPU0Fc
bmA7CiAgICAgICAgdGVzdFRleHQgKz0gYEltcHJlc2lvbjogICAgIERpcmVjdGEg
eSBTaWxlbmNpb3NhIChPSylcbmA7CiAgICAgICAgdGVzdFRleHQgKz0gYCR7c2Vw
YXJhdG9yfVxuYDsKICAgICAgICB0ZXN0VGV4dCArPSBgICAgICDCoVR1IGltcHJl
c29yYSBlc3RhIGxpc3RhIHBhcmEgb3BlcmFyISBcbmA7CiAgICAgICAgdGVzdFRl
eHQgKz0gYCR7c2VwYXJhdG9yfVxuYDsKCiAgICAgICAgY29uc3QgY2h1bmtzID0g
WwogICAgICAgICAgQnVmZmVyLmZyb20oRVNDX0lOSVQsICdiaW5hcnknKSwKICAg
ICAgICAgIEJ1ZmZlci5mcm9tKHRlc3RUZXh0LCAnbGF0aW4xJyksCiAgICAgICAg
ICBCdWZmZXIuZnJvbSgnXG5cblxuXG4nLCAnbGF0aW4xJyksCiAgICAgICAgICBC
dWZmZXIuZnJvbShFU0NfQ1VUX1BBUlRJQUwsICdiaW5hcnknKQogICAgICAgIF07
CgogICAgICAgIGNvbnN0IGZpbmFsQnVmZmVyID0gQnVmZmVyLmNvbmNhdChjaHVu
a3MpOwogICAgICAgIGF3YWl0IHByaW50V2luZG93c1Nwb29sZXIocHJpbnRlck5h
bWUsIGZpbmFsQnVmZmVyKTsKCiAgICAgICAgcmV0dXJuIHJlcy5lbmQoSlNPTi5z
dHJpbmdpZnkoewogICAgICAgICAgc3VjY2VzczogdHJ1ZSwKICAgICAgICAgIG1l
c3NhZ2U6IGBUaWNrZXQgZGUgcHJ1ZWJhIHByb2Nlc2FkbyBleGl0b3NhbWVudGUg
cGFyYSAke3ByaW50ZXJOYW1lIHx8ICdJbXByZXNvcmEgUHJlZGV0ZXJtaW5hZGEn
fWAKICAgICAgICB9KSk7CiAgICAgIH0gY2F0Y2ggKGVycikgewogICAgICAgIGNv
bnNvbGUuZXJyb3IoJ1tQcmludEJyaWRnZV0gRXJyb3IgYWwgaW1wcmltaXIgdGVz
dDonLCBlcnIpOwogICAgICAgIHJldHVybiByZXMud3JpdGVIZWFkKDUwMCkuZW5k
KEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVz
c2FnZSB9KSk7CiAgICAgIH0KICAgIH0pOwogICAgcmV0dXJuOwogIH0KCiAgLy8g
NDA0CiAgcmVzLndyaXRlSGVhZCg0MDQpLmVuZChKU09OLnN0cmluZ2lmeSh7IGVy
cm9yOiAnRW5kcG9pbnQgbm8gZW5jb250cmFkbycgfSkpOwp9KTsKCnNlcnZlci5s
aXN0ZW4oUE9SVCwgSE9TVCwgKCkgPT4gewogIGNvbnNvbGUubG9nKCc9PT09PT09
PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Jyk7
CiAgY29uc29sZS5sb2coYOKchSBLQU1JQSBOb2RlLmpzIFByaW50IEJyaWRnZSB2
Mi4wIGluaWNpYWRvYCk7CiAgY29uc29sZS5sb2coYCAgIEVzY3VjaGFuZG8gZW46
IGh0dHA6Ly9sb2NhbGhvc3Q6JHtQT1JUfWApOwogIGNvbnNvbGUubG9nKGAgICBO
b2RlLmpzOiAke3Byb2Nlc3MudmVyc2lvbn0g4oCUIFBsYXRhZm9ybWE6ICR7b3Mu
cGxhdGZvcm0oKX1gKTsKICBjb25zb2xlLmxvZygnPT09PT09PT09PT09PT09PT09
PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PScpOwp9KTsK
-----END CERTIFICATE-----
