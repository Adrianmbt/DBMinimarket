@echo off
rem Cierra el servicio Don Beni Minimarket (que corre en segundo plano sin ventana).
rem Como no hay consola ni bandeja, se termina el proceso por su nombre.
taskkill /IM DonBeniMinimarket.exe /F >nul 2>&1
if %errorlevel%==0 (
  echo Sistema cerrado.
) else (
  echo No se encontro el proceso DonBeniMinimarket.exe (tal vez no esta en ejecucion).
)
pause