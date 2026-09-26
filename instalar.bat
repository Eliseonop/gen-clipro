@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title video-yt - instalador

echo ============================================
echo   video-yt  -  instalador / verificacion
echo ============================================
echo.

rem Busca un Python 3.11+ de SISTEMA (no el .venv, que puede venir roto de otra PC).
rem Preferimos 3.14: es la version con la que se fijaron las librerias.
set "PY="
call :try py -3.14
if not defined PY call :try py -3
if not defined PY call :try python
if not defined PY call :try "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
if defined PY goto run

echo No se encontro Python 3.11 o superior.
where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo winget no esta disponible. Instala Python 3.14 desde https://www.python.org/downloads/
  echo marcando "Add python.exe to PATH" y vuelve a ejecutar este archivo.
  start "" https://www.python.org/downloads/
  pause
  exit /b 1
)
echo Instalando Python 3.14 con winget ^(puede pedir permiso^)...
winget install -e --id Python.Python.3.14 --scope user --accept-package-agreements --accept-source-agreements
if errorlevel 1 winget install -e --id Python.Python.3.14 --accept-package-agreements --accept-source-agreements
call :try "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
if not defined PY call :try "%ProgramFiles%\Python314\python.exe"
if not defined PY call :try "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" -3.14
if not defined PY call :try "%SystemRoot%\py.exe" -3.14
if defined PY goto run
echo.
echo Python se instalo pero esta ventana no lo ve todavia.
echo Cierra esta ventana y vuelve a abrir instalar.bat.
pause
exit /b 1

:run
echo Usando: %PY%
echo.
%PY% "setup\instalador.py" %*
if errorlevel 1 (
  echo.
  echo El instalador termino con errores. Registro: setup\_descargas\instalador.log
  pause
)
exit /b

rem --- :try <comando python...>  -> define PY si arranca y es 3.11+ ---------
:try
%* -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=%*"
exit /b
