# Build del sistema "Don Beni Minimarket" como ejecutable autocontenido.
# Genera la carpeta  dist\DonBeniMinimarket\  con el .exe y las librerías.
#
# Requisitos en la MÁQUINA DE BUILD (no en la PC destino):
#   - Python 3.12/3.13 con un venv que tenga: fastapi, uvicorn, sqlalchemy,
#     pydantic, reportlab, PyJWT, bcrypt, greenlet, httpx, requests y pyinstaller.
#   - Node.js (para compilar la interfaz con Vite).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root 'venv\Scripts\python.exe'

# 1) Compilar la interfaz (React + Vite) -> frontend/dist
Push-Location (Join-Path $root 'frontend')
Write-Host "==> npm install"
& npm install
Write-Host "==> npm run build"
& npm run build
Pop-Location

# 2) Empaquetar con PyInstaller (spec + folder con .exe + libs)
Push-Location $root
Write-Host "==> PyInstaller build"
& $py -m PyInstaller --noconfirm --clean --specpath packaging packaging\MinimarketDB.spec
Pop-Location

if ($LASTEXITCODE -ne 0) { throw "Fallo el build de PyInstaller" }

$exe = Join-Path $root 'dist\DonBeniMinimarket\DonBeniMinimarket.exe'
if (-not (Test-Path $exe)) { throw "No se generó el .exe" }
Write-Host ""
Write-Host "Listo => $exe"
Write-Host "Distribuye la carpeta  dist\DonBeniMinimarket\  a la PC destino"
Write-Host "junto con scripts\Detener.bat"