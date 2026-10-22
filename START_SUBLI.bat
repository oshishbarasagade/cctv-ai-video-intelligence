@echo off
title Subli Launcher
echo ============================================
echo    Starting Subli (CCTV AI Platform)...
echo ============================================
echo.

REM --- Start the backend (FastAPI on port 8000) ---
start "Subli Backend" /d "D:\GERMANY PLAN 2028\Project\backend" cmd /k "set ""PYTHONIOENCODING=utf-8"" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM --- Start the frontend (Vite on port 5173) ---
start "Subli Frontend" /d "D:\GERMANY PLAN 2028\Project\frontend" cmd /k "npm run dev"

echo Backend  : http://127.0.0.1:8000
echo Frontend : http://localhost:5173
echo.
echo Waiting ~12 seconds for servers to warm up, then opening the app...
timeout /t 12 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo ============================================
echo  Subli is RUNNING.
echo  Keep the two black windows OPEN during use.
echo  To STOP: close those two windows.
echo ============================================
echo.
echo You can close THIS window now.
pause >nul
