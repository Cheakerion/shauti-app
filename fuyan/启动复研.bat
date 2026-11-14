@echo off
rem ============================================================
rem  Fuyan MedReview launcher
rem  Keep this file ASCII-only: cmd.exe mis-parses UTF-8 batch files.
rem ============================================================
setlocal
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if not defined NODE_EXE (
  if exist "C:\Users\29866\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_EXE=C:\Users\29866\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  )
)
if not defined NODE_EXE (
  echo [fuyan] Node.js 18+ was not found.
  echo         Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

echo [fuyan] starting MedReview ...
"%NODE_EXE%" server.js %*
if errorlevel 1 (
  echo.
  echo [fuyan] server exited with an error. Copy the message above when reporting.
  pause
)
