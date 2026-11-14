@echo off
rem ============================================================
rem  Fuyan MedReview launcher (debug: keeps the console)
rem  Keep this file ASCII-only: cmd.exe mis-parses UTF-8 batch files.
rem ============================================================
setlocal
cd /d "%~dp0"

set "NODE_EXE="
if exist "runtime\node\node.exe" set "NODE_EXE=%CD%\runtime\node\node.exe"

if not defined NODE_EXE (
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\ensure-node.ps1"
  if errorlevel 1 (
    echo [fuyan] Node.js 18+ was not found, and the portable download did not finish.
    echo         Install Node.js from https://nodejs.org/ and run this file again.
    pause
    exit /b 1
  )
  if exist "runtime\node\node.exe" (set "NODE_EXE=%CD%\runtime\node\node.exe") else (set "NODE_EXE=node")
)

echo [fuyan] starting MedReview ...
"%NODE_EXE%" server.js %*
if errorlevel 1 (
  echo.
  echo [fuyan] server exited with an error. Copy the message above when reporting.
  pause
)