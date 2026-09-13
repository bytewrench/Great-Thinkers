@echo off
title Great Thinkers
cd /d "%~dp0Great_Thinkers_UI"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this launcher again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
echo Open http://127.0.0.1:3001 in your browser.
echo Keep this window open while using Great Thinkers. Press Ctrl+C to stop.
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Great Thinkers could not start. If it is already running, open http://127.0.0.1:3001.
pause
exit /b 1
