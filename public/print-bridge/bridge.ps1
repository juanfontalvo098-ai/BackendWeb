# KAMIA POS - Print Bridge Nativo de Windows (PowerShell)
# Puerto por defecto: 8182
$ErrorActionPreference = 'SilentlyContinue'

$port = 8182
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")

try {
    $listener.Start()
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "[OK] KAMIA PowerShell Print Bridge activo en puerto $port" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} catch {
    # Fallback to localhost if http://+ requires admin
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Prefixes.Add("http://127.0.0.1:$port/")
        $listener.Start()
        Write-Host "[OK] KAMIA PowerShell Print Bridge activo en http://localhost:$port/" -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] Puerto $port ya activo o en uso." -ForegroundColor Yellow
        exit 0
    }
}

while ($true) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        $res.Headers.Add('Access-Control-Allow-Origin', '*')
        $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        $res.Headers.Add('Access-Control-Allow-Headers', '*')
        $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')
        $res.Headers.Add('Access-Control-Max-Age', '86400')

        if ($req.HttpMethod -eq 'OPTIONS') {
            $res.StatusCode = 204
            $res.Close()
            continue
        }

        $path = $req.Url.AbsolutePath

        if ($req.HttpMethod -eq 'GET' -and ($path -eq '/health' -or $path -eq '/' -or $path -eq '/status')) {
            $json = '{"status":"online","service":"KAMIA PowerShell Print Bridge","port":8182,"version":"2.0.0"}'
            $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($req.HttpMethod -eq 'GET' -and $path -eq '/printers') {
            $pList = @()
            try {
                $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, Default, PortName, DriverName
                foreach ($p in $printers) {
                    $pList += @{
                        name = [string]$p.Name
                        isDefault = [bool]$p.Default
                        port = [string]$p.PortName
                        driver = [string]$p.DriverName
                    }
                }
            } catch {}
            $jsonObj = @{ success = $true; printers = $pList }
            $json = ConvertTo-Json $jsonObj
            $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        if ($req.HttpMethod -eq 'POST' -and ($path -eq '/print' -or $path -eq '/test-print')) {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = ConvertFrom-Json $body
            $textToPrint = $payload.text
            $printerName = $payload.printerName

            if ($path -eq '/test-print') {
                $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                $textToPrint = "========================================`r`n          KAMIA POS by JF         `r`n   *** TICKET DE PRUEBA EXITOSO ***`r`n----------------------------------------`r`nFecha: $now`r`nMotor: PowerShell Nativo de Windows`r`nPuerto: 8182`r`nImpresion Silenciosa OK`r`n========================================`r`n`r`n`r`n`r`n"
            }

            if (![string]::IsNullOrWhiteSpace($textToPrint)) {
                $tempFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "pos_ticket_$([System.Guid]::NewGuid().ToString('N')).txt")
                [System.IO.File]::WriteAllText($tempFile, $textToPrint + "`r`n`r`n`r`n`r`n", [System.Text.Encoding]::Default)
                try {
                    if (![string]::IsNullOrWhiteSpace($printerName)) {
                        Get-Content -Path $tempFile -Encoding Default | Out-Printer -Name $printerName.Trim()
                    } else {
                        Get-Content -Path $tempFile -Encoding Default | Out-Printer
                    }
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                } catch {
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                }
            }

            $buf = [System.Text.Encoding]::UTF8.GetBytes('{"success":true,"message":"Impresion enviada"}')
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $buf.Length
            $res.OutputStream.Write($buf, 0, $buf.Length)
            $res.Close()
            continue
        }

        $res.StatusCode = 404
        $res.Close()
    } catch {
        try { $res.Close() } catch {}
    }
}
