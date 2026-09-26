@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title video-yt - empaquetar para otra PC

rem Se ejecuta en la PC de ORIGEN. Argumentos opcionales:
rem   --proyectos              incluye tus proyectos y clips (zip grande)
rem   --drive assets=ENLACE    guarda el enlace de Drive del zip de recursos
rem   --comprobar-urls         comprueba que todas las descargas responden
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" "setup\empaquetar.py" %*
) else (
  py -3 "setup\empaquetar.py" %*
)
echo.
pause
