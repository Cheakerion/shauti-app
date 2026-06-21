# Quiz App - Test Runner
# Usage: powershell -ExecutionPolicy Bypass -File test.ps1
#   or:  powershell -ExecutionPolicy Bypass -File test.ps1 -Watch
param(
    [switch]$Watch
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = "D:\hermes\node\node.exe"
$VitestMjs = "$ScriptDir\node_modules\vitest\vitest.mjs"

if (-not (Test-Path $NodeExe)) {
    Write-Host "[ERROR] node.exe not found: $NodeExe" -ForegroundColor Red
    exit 1
}

$env:PATH = "D:\hermes\node;" + $env:PATH
Push-Location $ScriptDir

try {
    if ($Watch) {
        Write-Host "[WATCH MODE] auto-rerun on file change..." -ForegroundColor Yellow
        & $NodeExe $VitestMjs
    } else {
        Write-Host "[RUN] Running all tests..." -ForegroundColor Yellow
        & $NodeExe $VitestMjs run
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] All tests passed!" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Some tests failed. See output above." -ForegroundColor Red
    }
} finally {
    Pop-Location
}
