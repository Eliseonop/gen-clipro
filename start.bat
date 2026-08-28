@echo off
chcp 65001 >nul
cd /d "%~dp0"
title video-yt launcher

echo ============================================
echo   video-yt  -  arrancando...
echo ============================================
echo.

if not exist "frontend\node_modules" (
  echo Primera vez: instalando dependencias del frontend...
  cmd /c "cd frontend && npm install"
  echo.
)

echo Abriendo backend  (http://127.0.0.1:8000)...
start "video-yt backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload"

echo Abriendo frontend (http://localhost:5173)...
start "video-yt frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Esperando a que arranquen los servidores...
timeout /t 6 >nul

echo Abriendo el navegador...
start "" http://localhost:5173

echo.
echo ============================================
echo   Listo. Se abrieron dos ventanas:
echo     - backend
echo     - frontend
echo   Cierra esas dos ventanas para detener todo.
echo ============================================
echo.
echo Puedes cerrar ESTA ventana.
timeout /t 4 >nul
