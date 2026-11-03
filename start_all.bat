@echo off
title ONCE AI - Full Stack Launcher
echo ==============================================================
echo Launching ONCE AI Centralized Anti-Flying Voter System...
echo ==============================================================

start "ONCE AI Backend" cmd /k "%~dp0start_backend.bat"
timeout /t 3 /nobreak >nul
start "ONCE AI Frontend" cmd /k "%~dp0start_frontend.bat"

echo.
echo Both services launched!
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5174
echo.
pause
