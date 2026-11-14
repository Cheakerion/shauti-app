param(
  [Parameter(Mandatory=$true)][string]$Zip,
  [Parameter(Mandatory=$true)][string]$Dest
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Zip)) { throw "压缩包不存在: $Zip" }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force
