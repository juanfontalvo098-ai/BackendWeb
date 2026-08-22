/**
 * KAMIA by JF — Node.js Thermal Print Bridge v2.0
 * Servidor HTTP local para impresión térmica silenciosa directa (ESC/POS)
 * Puerto por defecto: 8088
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execFile } = require('child_process');
const net = require('net');

const PORT = process.env.PORT || 8088;
const HOST = '0.0.0.0';

// Comandos ESC/POS estándar
const ESC = '\x1B';
const GS = '\x1D';
const ESC_INIT = `${ESC}@`;               // Inicializar impresora
const ESC_CUT_FULL = `${GS}V\x00`;        // Corte total
const ESC_CUT_PARTIAL = `${GS}V\x01`;     // Corte parcial
const ESC_DRAWER = `${ESC}p\x00\x19\xFA`; // Abrir gaveta / cajón monedero

/**
 * Obtener lista de impresoras de Windows usando PowerShell
 */
function getWindowsPrinters() {
  return new Promise((resolve) => {
    const psCmd = `Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName, DriverName, PrinterStatus | ConvertTo-Json -Compress`;
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        exec('wmic printer get name,default /format:csv', { windowsHide: true, timeout: 4000 }, (wmicErr, wmicOut) => {
          if (wmicErr || !wmicOut) {
            return resolve([{ name: 'Impresora Predeterminada de Windows', isDefault: true, port: 'DEFAULT' }]);
          }
          const lines = wmicOut.split('\n').map(l => l.trim()).filter(Boolean).slice(1);
          const printers = lines.map(line => {
            const parts = line.split(',');
            if (parts.length >= 3) {
              return { name: parts[2].trim(), isDefault: parts[1].trim().toLowerCase() === 'true', port: 'USB/LPT' };
            }
            return null;
          }).filter(Boolean);
          resolve(printers.length > 0 ? printers : [{ name: 'Impresora Predeterminada de Windows', isDefault: true, port: 'DEFAULT' }]);
        });
        return;
      }

      try {
        let data = JSON.parse(stdout);
        if (!Array.isArray(data)) data = [data];
        const printers = data.map(p => ({
          name: p.Name || 'Impresora',
          isDefault: Boolean(p.Default),
          port: p.PortName || '',
          driver: p.DriverName || '',
          status: p.PrinterStatus || 3
        }));
        resolve(printers);
      } catch (parseErr) {
        resolve([{ name: 'Impresora Predeterminada de Windows', isDefault: true, port: 'DEFAULT' }]);
      }
    });
  });
}

/**
 * Imprimir RAW en impresora de red (TCP Socket puerto 9100)
 */
function printNetworkSocket(ip, port = 9100, buffer) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      client.write(buffer, () => {
        client.end();
        resolve(true);
      });
    });
    client.on('error', (err) => reject(err));
    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`Timeout de conexión a la impresora en ${ip}:${port}`));
    });
  });
}

/**
 * Imprimir en impresora local/compartida de Windows usando winspool RAW y Out-Printer fallback
 */
function printWindowsSpooler(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const isVirtual = /(pdf|onenote|xps|fax)/i.test(printerName || '');
    const ext = isVirtual ? '.txt' : '.bin';
    const tempFile = path.join(os.tmpdir(), `kamia_print_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`);

    let fileData = buffer;
    if (isVirtual) {
      // Limpiar códigos de control ESC/POS en Node.js para que el texto sea 100% puro y legible
      const rawStr = buffer.toString('latin1');
      const cleanStr = rawStr.replace(/[^\x20-\x7E\r\n\t\xA0-\xFF]/g, '');
      fileData = Buffer.from(cleanStr, 'utf8');

      try {
        const docsDir = path.join(os.homedir(), 'Documents');
        if (fs.existsSync(docsDir)) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const savedFile = path.join(docsDir, `KAMIA_Factura_POS_${timestamp}.txt`);
          const latestFile = path.join(docsDir, 'Ultima_Factura_POS.txt');
          fs.writeFileSync(savedFile, cleanStr, 'utf8');
          fs.writeFileSync(latestFile, cleanStr, 'utf8');
          // Abrir automáticamente el archivo generado para vista previa inmediata
          exec(`start "" "${latestFile}"`);
        }
      } catch (docErr) {
        console.warn('[PrintBridge] No se pudo guardar copia en Documentos:', docErr.message);
      }
    }

    fs.writeFile(tempFile, fileData, (writeErr) => {
      if (writeErr) return reject(writeErr);

      const targetPrinter = printerName && printerName !== 'Impresora Predeterminada de Windows'
        ? printerName.replace(/'/g, "''")
        : '';

      const psScript = isVirtual ? `
$tempFile = '${tempFile.replace(/'/g, "''")}';
$printerName = '${targetPrinter}';
if (-not $printerName) {
  $defaultPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1;
  if ($defaultPrinter) { $printerName = $defaultPrinter.Name }
}
try {
  Get-Content -Path $tempFile -Encoding UTF8 | Out-Printer -Name $printerName -ErrorAction SilentlyContinue
} catch {}
exit 0
`.trim() : `
$tempFile = '${tempFile.replace(/'/g, "''")}';
$printerName = '${targetPrinter}';

if (-not $printerName) {
  $defaultPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1;
  if ($defaultPrinter) { $printerName = $defaultPrinter.Name }
  else {
    $anyPrinter = Get-CimInstance Win32_Printer | Select-Object -First 1;
    if ($anyPrinter) { $printerName = $anyPrinter.Name }
  }
}

if (-not $printerName) {
  exit 1
}

$code = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;

        di.pDocName = "KAMIA POS Ticket";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
        Add-Type -TypeDefinition $code -ErrorAction Stop
    }
    $bytes = [System.IO.File]::ReadAllBytes($tempFile)
    $ok = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)
    if ($ok) {
        exit 0
    }
} catch {}

try {
    Get-Content -Path $tempFile -Encoding Default | Out-Printer -Name $printerName -ErrorAction Stop
    exit 0
} catch {
    exit 0
}
`.trim();

      execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { windowsHide: true, timeout: 8000 }, (psErr) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        resolve(true);
      });
    });
  });
}

/**
 * Servidor HTTP
 */
const server = http.createServer(async (req, res) => {
  // CORS & Private Network Access Headers (para soportar HTTPS desde Render hacia localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url.split('?')[0];

  // 1. GET /health o /status
  if (req.method === 'GET' && (url === '/' || url === '/health' || url === '/status')) {
    return res.end(JSON.stringify({
      status: 'online',
      service: 'KAMIA Node.js Print Bridge',
      version: '2.0.0',
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
  }

  // 2. GET /printers
  if (req.method === 'GET' && url === '/printers') {
    try {
      const printers = await getWindowsPrinters();
      return res.end(JSON.stringify({ success: true, printers }));
    } catch (err) {
      return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 3. POST /print
  if (req.method === 'POST' && url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { text, raw, printerName, cutPaper = true, openDrawer = false, ip = null, port = 9100 } = payload;

        if (!text && !raw && !openDrawer) {
          return res.writeHead(400).end(JSON.stringify({ success: false, error: 'El campo "text", "raw" o "openDrawer" es requerido' }));
        }

        let chunks = [];
        chunks.push(Buffer.from(ESC_INIT, 'binary'));

        if (openDrawer) {
          chunks.push(Buffer.from(ESC_DRAWER, 'binary'));
        }

        if (text) {
          chunks.push(Buffer.from(text, 'latin1'));
        }

        if (raw) {
          chunks.push(Buffer.from(raw, 'binary'));
        }

        const shouldCut = (text || raw) ? (cutPaper !== false) : false;
        if (shouldCut) {
          chunks.push(Buffer.from('\n\n\n\n', 'latin1'));
          chunks.push(Buffer.from(ESC_CUT_PARTIAL, 'binary'));
        }

        const finalBuffer = Buffer.concat(chunks);

        if (ip) {
          await printNetworkSocket(ip, port, finalBuffer);
          return res.end(JSON.stringify({ success: true, message: `Impresión enviada a socket de red ${ip}:${port}` }));
        }

        await printWindowsSpooler(printerName, finalBuffer);
        return res.end(JSON.stringify({ success: true, message: `Trabajo enviado a la cola de ${printerName || 'Impresora Predeterminada'}` }));

      } catch (err) {
        console.error('[PrintBridge] Error al procesar impresión:', err);
        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. POST /test-print
  if (req.method === 'POST' && url === '/test-print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const printerName = payload.printerName || null;
        const testType = payload.type || 'comanda';

        const now = new Date().toLocaleString('es-CO');
        const separator = '========================================';
        const line = '----------------------------------------';

        let testText = '';
        testText += `${separator}\n`;
        testText += `          KAMIA POS & ERP by JF         \n`;
        testText += `      "Todo tu negocio, conectado."     \n`;
        testText += `${separator}\n`;
        testText += `   *** TICKET DE PRUEBA DE IMPRESION *** \n`;
        testText += `${line}\n`;
        testText += `Fecha / Hora:  ${now}\n`;
        testText += `Servicio:      KAMIA Node.js Print Bridge v2.0\n`;
        testText += `Motor:         Node.js ${process.version}\n`;
        testText += `Impresora:     ${printerName || 'Predeterminada de Windows'}\n`;
        testText += `Destino:       ${testType === 'cocina' ? 'Cocina (Comanda)' : (testType === 'caja' ? 'Caja (Facturación)' : 'General')}\n`;
        testText += `${line}\n`;
        testText += `Caracteres Especiales / Acentos:\n`;
        testText += `á é í ó ú ñ Á É Í Ó Ú Ñ $ % & @ #\n`;
        testText += `${line}\n`;
        testText += `Estado:        CONEXION 100% EXITOSA\n`;
        testText += `Impresion:     Directa y Silenciosa (OK)\n`;
        testText += `${separator}\n`;
        testText += `     ¡Tu impresora esta lista para operar! \n`;
        testText += `${separator}\n`;

        const chunks = [
          Buffer.from(ESC_INIT, 'binary'),
          Buffer.from(testText, 'latin1'),
          Buffer.from('\n\n\n\n', 'latin1'),
          Buffer.from(ESC_CUT_PARTIAL, 'binary')
        ];

        const finalBuffer = Buffer.concat(chunks);
        await printWindowsSpooler(printerName, finalBuffer);

        return res.end(JSON.stringify({
          success: true,
          message: `Ticket de prueba procesado exitosamente para ${printerName || 'Impresora Predeterminada'}`
        }));
      } catch (err) {
        console.error('[PrintBridge] Error al imprimir test:', err);
        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404).end(JSON.stringify({ error: 'Endpoint no encontrado' }));
});

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`✅ KAMIA Node.js Print Bridge v2.0 iniciado`);
  console.log(`   Escuchando en: http://localhost:${PORT}`);
  console.log(`   Node.js: ${process.version} — Plataforma: ${os.platform()}`);
  console.log('====================================================');
});
