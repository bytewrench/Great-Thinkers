@echo off
title Great Thinkers
cd /d "%~dp0"
docker info >nul 2>nul
if errorlevel 1 (
  echo Start Docker Desktop, then run this launcher again.
  pause
  exit /b 1
)
docker compose up -d --build
if errorlevel 1 (
  echo Great Thinkers could not start. Review Docker Desktop for details.
  pause
  exit /b 1
)
echo Great Thinkers is running at http://127.0.0.1:3001
start "" http://127.0.0.1:3001
