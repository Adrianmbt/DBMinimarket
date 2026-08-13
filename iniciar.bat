@echo off
setlocal
cd /d "%~dp0"
title Don Beni Minimarket

rem Lanza el sistema de forma oculta. No muestra ventanas de consola de
rem uvicorn ni de Vite; abre la interfaz en un navegador aislado y apaga los
rem servidores cuando se cierra esa ventana.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
endlocal