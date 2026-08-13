# Crea en el escritorio el acceso directo "Sistema Don Beni" que lanza iniciar.bat
# con el icono DonBeni.ico. Se ejecuta desde instalar.bat o manualmente.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Asegurar que existe el icono
$icoPath = Join-Path $root 'DonBeni.ico'
if (-not (Test-Path $icoPath)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'crear-icono.ps1')
}

$sh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Sistema Don Beni.lnk'
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $root 'iniciar.bat'
$lnk.WorkingDirectory = $root
$lnk.Description = 'Don Beni Minimarket'
if (Test-Path $icoPath) { $lnk.IconLocation = "$icoPath,0" }
$lnk.Save()

Write-Host "Acceso directo creado: $lnkPath"