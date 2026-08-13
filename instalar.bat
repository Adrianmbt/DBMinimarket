@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Instalando MinimarketDB (Don Beni)...

echo ============================================================
echo   INSTALACION de MinimarketDB en esta PC
echo ============================================================
echo.

echo =^> 1. Comprobando Python...
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
if not defined PY_VER goto no_python
echo [OK] Python: %PY_VER%
goto check_node

:no_python
echo [ERROR] No se encontro Python. Instala Python 3.12 o 3.13 y marca "Add Python to PATH".
goto error

:check_node
echo.
echo =^> 2. Comprobando Node.js...
where node >nul 2>&1
if errorlevel 1 goto no_node
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [OK] Node.js: %NODE_VER%
goto check_venv

:no_node
echo [ERROR] No se encontro Node.js. Instala Node.js LTS.
goto error

:check_venv
echo.
if exist "venv\Scripts\python.exe" goto venv_ok
echo =^> Creando entorno virtual (venv)...
python -m venv venv
if errorlevel 1 goto err_venv
goto install_pip

:venv_ok
echo =^> venv ya existe.

:install_pip
echo.
echo =^> 3. Instalando dependencias de Python...
call "venv\Scripts\activate.bat"
python -m pip install --upgrade pip >nul

if exist requeriments.txt (
    pip install -r requeriments.txt
) else (
    pip install -r requirements.txt
)
if errorlevel 1 goto err_pip

echo.
echo =^> 4. Limpiando e instalando dependencias del Frontend (npm install)...
cd frontend

if exist node_modules (
    echo Eliminando node_modules antiguo para rearmar binarios nativos...
    rmdir /s /q node_modules
)
if exist package-lock.json (
    del /f /q package-lock.json
)

call npm install
if errorlevel 1 goto err_npm
cd ..

echo.
echo =^> 5. Cargando datos iniciales...
python seed_data.py
if errorlevel 1 goto err_seed

call deactivate

echo.
echo =^> 6. Creando accesos directos...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-icono.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-acceso-directo.ps1"

echo.
echo ============================================================
echo   Instalacion completada con exito.
echo ============================================================
echo.
pause
exit /b 0

:err_venv
echo [ERROR] No se pudo crear el entorno virtual venv.
goto error

:err_pip
echo [ERROR] Fallo la instalacion de dependencias de Python.
call deactivate
goto error

:err_npm
echo [ERROR] Fallo npm install en el frontend.
cd ..
call deactivate
goto error

:err_seed
echo [ERROR] Fallo la carga de la semilla de datos.
call deactivate
goto error

:error
echo.
echo [ERROR] La instalacion se detuvo por un fallo.
echo.
pause
exit /b 1