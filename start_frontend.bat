@echo off
title ONCE AI - Election Oversight Portal (Vite)
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ==============================================================
echo [ONCE AI] Starting Frontend Voting Portal on http://localhost:5174
echo ==============================================================
npm run dev -- --port 5174 --host
pause
