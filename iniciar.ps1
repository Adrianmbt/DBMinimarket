param(
    [switch]$ModoConsola
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir 'sistema.log'

function Log([string]$m) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

$py = Join-Path $root 'venv\Scripts\python.exe'
$backendUrl = 'http://127.0.0.1:8000'
$frontendUrl = 'http://localhost:5173'
$b = $null
$front = $null

try {
    Log '========================================'
    Log '  Iniciando Sistema Don Beni Minimarket'
    Log '========================================'

    if (-not (Test-Path $py)) { Log 'ERROR: no existe venv\Scripts\python.exe. Ejecuta instalar.bat.'; exit 1 }

    # ---------- 1. Backend (uvicorn, oculto) ----------
    $b = Start-Process -FilePath $py -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000' `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'backend_out.log') `
        -RedirectStandardError  (Join-Path $logDir 'backend_err.log')
    Log ("Backend iniciado (PID " + $b.Id + ") en " + $backendUrl)

    # Esperar a que el backend responda
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "$backendUrl/api/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 1000
    }
    if (-not $ok) { Log 'ADVERTENCIA: el backend no respondio a /api/health a tiempo.' }

    # ---------- 2. Frontend (Vite, oculto) ----------
    $front = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm','run','dev' `
        -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'frontend_out.log') `
        -RedirectStandardError  (Join-Path $logDir 'frontend_err.log')
    Log ("Frontend iniciado (PID " + $front.Id + ") en " + $frontendUrl)

    # ---------- 3. Abrir navegador aislado ----------
    $edge   = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    $edge64 = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
    $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if (-not (Test-Path $edge))   { $edge = $edge64 }
    $profile = Join-Path $env:LOCALAPPDATA 'SistemaDonBeni_Browser'
    New-Item -ItemType Directory -Path $profile -Force | Out-Null

    $browser = $null
    if (Test-Path $edge) {
        $browser = Start-Process -FilePath $edge -ArgumentList "--user-data-dir=`"$profile`"", "--new-window", $frontendUrl -PassThru
        Log ("Edge abierto (PID " + $browser.Id + ") modo aislado.")
    } elseif (Test-Path $chrome) {
        $browser = Start-Process -FilePath $chrome -ArgumentList "--user-data-dir=`"$profile`"", "--new-window", $frontendUrl -PassThru
        Log ("Chrome abierto (PID " + $browser.Id + ") modo aislado.")
    } else {
        Log 'No se encontro Edge ni Chrome. Abriendo con el navegador por defecto.'
        Start-Process $frontendUrl
    }

    # ---------- 4. Esperar a que se cierre el navegador ----------
    if ($browser) {
        Log 'Esperando que cierres la ventana del navegador...'
        $browser.WaitForExit()
        Log 'Navegador cerrado. Apagando servidores...'
    } else {
        Start-Sleep -Seconds 2147480
    }
}
finally {
    # ---------- 5. Detener backend y frontend ----------
    if ($b)     { & taskkill.exe /PID $b.Id     /T /F 2>$null | Out-Null; Log "Backend detenido." }
    if ($front) { & taskkill.exe /PID $front.Id /T /F 2>$null | Out-Null; Log "Frontend detenido." }
    Log 'Sistema apagado correctamente.'
}