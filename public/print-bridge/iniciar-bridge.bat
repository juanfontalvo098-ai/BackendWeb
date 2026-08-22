@echo off
title KAMIA POS - Print Bridge Node.js
color 0A
cls

echo ======================================================================
echo           KAMIA POS - SERVIDOR DE IMPRESION DIRECTA (NODE.JS)
echo ======================================================================
echo.

:: 1. Verificar si Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ALERTA] Node.js no esta instalado en este computador.
    echo.
    echo Node.js es OBLIGATORIO para el funcionamiento del Print Bridge.
    echo.
    echo Deseas descargar e instalar Node.js LTS automaticamente ahora? (S/N)
    set /p INSTALAR_NODE="Opcion [S/N]: "
    if /i "%INSTALAR_NODE%"=="S" (
        echo.
        echo [1/2] Descargando instalador oficial de Node.js LTS (64 bits)...
        set "NODE_MSI=%TEMP%\node_installer.msi"
        curl -L -o "%NODE_MSI%" https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
        if exist "%NODE_MSI%" (
            echo.
            echo [2/2] Abriendo el instalador de Node.js...
            echo Sigue los pasos en pantalla haciendo clic en "Siguiente / Next".
            msiexec /i "%NODE_MSI%"
            echo.
            echo Una vez completada la instalacion de Node.js, presiona cualquier
            echo tecla para continuar...
            pause >nul
        ) else (
            echo [ERROR] No se pudo descargar el instalador automaticamente.
            echo Abriendo pagina oficial de Node.js...
            start https://nodejs.org/
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo Instalacion cancelada. Por favor instala Node.js desde https://nodejs.org/
        pause
        exit /b 1
    )
)

:: 2. Confirmar version de Node.js
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
color 0A
echo [OK] Node.js detectado: %NODE_VERSION%

:: 3. Asegurar carpeta y archivo bridge.js en AppData
set "TARGET_DIR=%LOCALAPPDATA%\GastrosPOS\PrintBridge"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
set "BRIDGE_FILE=%TARGET_DIR%\bridge.js"

if exist "%~dp0bridge.js" (
    copy /y "%~dp0bridge.js" "%BRIDGE_FILE%" >nul
) else (
    :: Si se ejecuta desde Descargas o Escritorio sin bridge.js al lado, se extrae automaticamente
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$b64 = '/**\r\n * KAMIA by JF — Node.js Thermal Print Bridge v2.0\r\n * Servidor HTTP local para impresion termica silenciosa directa (ESC/POS)\r\n * Puerto: 8088\r\n */\r\nconst http = require(\"http\");\r\nconst fs = require(\"fs\");\r\nconst path = require(\"path\");\r\nconst os = require(\"os\");\r\nconst { exec, execFile } = require(\"child_process\");\r\nconst net = require(\"net\");\r\n\r\nconst PORT = process.env.PORT || 8088;\r\nconst HOST = \"0.0.0.0\";\r\n\r\nconst ESC = \"\\x1B\";\r\nconst GS = \"\\x1D\";\r\nconst ESC_INIT = `${ESC}@`;\r\nconst ESC_CUT_PARTIAL = `${GS}V\\x01`;\r\nconst ESC_DRAWER = `${ESC}p\\x00\\x19\\xFA`;\r\n\r\nfunction getWindowsPrinters() {\r\n  return new Promise((resolve) => {\r\n    const psCmd = `Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress`;\r\n    execFile(\"powershell\", [\"-NoProfile\", \"-ExecutionPolicy\", \"Bypass\", \"-Command\", psCmd], { windowsHide: true, timeout: 6000 }, (err, stdout) => {\r\n      if (err || !stdout.trim()) {\r\n        return resolve([{ name: \"Impresora Predeterminada de Windows\", isDefault: true, port: \"DEFAULT\" }]);\r\n      }\r\n      try {\r\n        let data = JSON.parse(stdout);\r\n        if (!Array.isArray(data)) data = [data];\r\n        resolve(data.map(p => ({ name: p.Name || \"Impresora\", isDefault: Boolean(p.Default), port: p.PortName || \"\" })));\r\n      } catch (e) {\r\n        resolve([{ name: \"Impresora Predeterminada de Windows\", isDefault: true, port: \"DEFAULT\" }]);\r\n      }\r\n    });\r\n  });\r\n}\r\n\r\nfunction printWindowsSpooler(printerName, buffer) {\r\n  return new Promise((resolve, reject) => {\r\n    const tempFile = path.join(os.tmpdir(), `kamia_print_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.bin`);\r\n    fs.writeFile(tempFile, buffer, (writeErr) => {\r\n      if (writeErr) return reject(writeErr);\r\n      const targetPrinter = printerName && printerName !== \"Impresora Predeterminada de Windows\" ? printerName.replace(/'/g, \"''\") : \"\";\r\n      const psScript = `\r\n$tempFile = ''${tempFile.replace(/'/g, \"''\")}''\r\n$printerName = ''${targetPrinter}''\r\nif (-not $printerName) {\r\n  $defaultPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1\r\n  if ($defaultPrinter) { $printerName = $defaultPrinter.Name }\r\n  else {\r\n    $anyPrinter = Get-CimInstance Win32_Printer | Select-Object -First 1\r\n    if ($anyPrinter) { $printerName = $anyPrinter.Name }\r\n  }\r\n}\r\nif (-not $printerName) { exit 1 }\r\ntry {\r\n  Get-Content -Path $tempFile -Encoding Default | Out-Printer -Name $printerName -ErrorAction Stop\r\n  exit 0\r\n} catch {\r\n  try {\r\n    [System.IO.File]::ReadAllText($tempFile) | Out-Printer -Name $printerName -ErrorAction Stop\r\n    exit 0\r\n  } catch {\r\n    Write-Error $_.Exception.Message\r\n    exit 1\r\n  }\r\n}\r\n`.trim();\r\n      execFile(\"powershell\", [\"-NoProfile\", \"-ExecutionPolicy\", \"Bypass\", \"-Command\", psScript], { windowsHide: true, timeout: 8000 }, (psErr) => {\r\n        try { fs.unlinkSync(tempFile); } catch (e) {}\r\n        if (psErr) return reject(new Error(`Error al enviar trabajo: ${psErr.message}`));\r\n        resolve(true);\r\n      });\r\n    });\r\n  });\r\n}\r\n\r\nconst server = http.createServer(async (req, res) => {\r\n  res.setHeader(\"Access-Control-Allow-Origin\", \"*\");\r\n  res.setHeader(\"Access-Control-Allow-Methods\", \"GET, POST, OPTIONS\");\r\n  res.setHeader(\"Access-Control-Allow-Headers\", \"Content-Type, Authorization\");\r\n  res.setHeader(\"Content-Type\", \"application/json; charset=utf-8\");\r\n  if (req.method === \"OPTIONS\") { res.writeHead(200); return res.end(); }\r\n  const url = req.url.split(\"?\")[0];\r\n  if (req.method === \"GET\" && (url === \"/\" || url === \"/health\" || url === \"/status\")) {\r\n    return res.end(JSON.stringify({ status: \"online\", service: \"KAMIA Node.js Print Bridge\", version: \"2.0.0\", nodeVersion: process.version, uptimeSeconds: Math.floor(process.uptime()) }));\r\n  }\r\n  if (req.method === \"GET\" && url === \"/printers\") {\r\n    const printers = await getWindowsPrinters();\r\n    return res.end(JSON.stringify({ success: true, printers }));\r\n  }\r\n  if (req.method === \"POST\" && url === \"/print\") {\r\n    let body = \"\";\r\n    req.on(\"data\", chunk => { body += chunk; });\r\n    req.on(\"end\", async () => {\r\n      try {\r\n        const payload = JSON.parse(body || \"{}\");\r\n        const { text, raw, printerName, cutPaper = true, openDrawer = false } = payload;\r\n        let chunks = [Buffer.from(ESC_INIT, \"binary\")];\r\n        if (openDrawer) chunks.push(Buffer.from(ESC_DRAWER, \"binary\"));\r\n        if (text) chunks.push(Buffer.from(text, \"latin1\"));\r\n        if (raw) chunks.push(Buffer.from(raw, \"binary\"));\r\n        if (cutPaper !== false) {\r\n          chunks.push(Buffer.from(\"\\n\\n\\n\\n\", \"latin1\"));\r\n          chunks.push(Buffer.from(ESC_CUT_PARTIAL, \"binary\"));\r\n        }\r\n        await printWindowsSpooler(printerName, Buffer.concat(chunks));\r\n        return res.end(JSON.stringify({ success: true, message: \"Impresion enviada\" }));\r\n      } catch (err) {\r\n        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));\r\n      }\r\n    });\r\n    return;\r\n  }\r\n  if (req.method === \"POST\" && url === \"/test-print\") {\r\n    let body = \"\";\r\n    req.on(\"data\", chunk => { body += chunk; });\r\n    req.on(\"end\", async () => {\r\n      try {\r\n        const payload = JSON.parse(body || \"{}\");\r\n        const now = new Date().toLocaleString(\"es-CO\");\r\n        const testText = \"========================================\\n          KAMIA POS & ERP by JF         \\n      Todo tu negocio, conectado.     \\n========================================\\n   *** TICKET DE PRUEBA DE IMPRESION *** \\n----------------------------------------\\nFecha / Hora:  \" + now + \"\\nServicio:      KAMIA Node.js Print Bridge v2.0\\nMotor:         Node.js \" + process.version + \"\\nImpresora:     \" + (payload.printerName || \"Predeterminada de Windows\") + \"\\n----------------------------------------\\nCaracteres:    a e i o u n A E I O U N $ % &\\nEstado:        CONEXION 100% EXITOSA\\nImpresion:     Directa y Silenciosa (OK)\\n========================================\\n     Tu impresora esta lista! \\n========================================\\n\";\r\n        const chunks = [Buffer.from(ESC_INIT, \"binary\"), Buffer.from(testText, \"latin1\"), Buffer.from(\"\\n\\n\\n\\n\", \"latin1\"), Buffer.from(ESC_CUT_PARTIAL, \"binary\")];\r\n        await printWindowsSpooler(payload.printerName, Buffer.concat(chunks));\r\n        return res.end(JSON.stringify({ success: true, message: \"Ticket de prueba impreso exitosamente\" }));\r\n      } catch (err) {\r\n        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));\r\n      }\r\n    });\r\n    return;\r\n  }\r\n  res.writeHead(404).end(JSON.stringify({ error: \"Endpoint no encontrado\" }));\r\n});\r\nserver.listen(PORT, HOST, () => {\r\n  console.log(`[OK] KAMIA Print Bridge activo en http://localhost:${PORT}`);\r\n});\r\n'; [System.IO.File]::WriteAllText('$env:LOCALAPPDATA\\GastrosPOS\\PrintBridge\\bridge.js', $b64, [System.Text.Encoding]::UTF8)"
)

echo [OK] Iniciando KAMIA Print Bridge en http://localhost:8088...
echo.

cd /d "%TARGET_DIR%"
node bridge.js
pause
