@echo off
title ONCE AI - Biometric Backend Service (FastAPI)
cd /d "%~dp0biometric-service"
echo ==============================================================
echo [ONCE AI] Starting Biometric Service on http://127.0.0.1:8000
echo ePLDT Sovereign Cloud Intake Node
echo ==============================================================
where python >nul 2>nul
if %errorlevel% equ 0 (
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else (
    py -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
)
pause
