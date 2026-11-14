param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Zip
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Src)) { throw "目录不存在: $Src" }
$parent = Split-Path -Parent $Zip
if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
Compress-Archive -Path (Join-Path $Src '*') -DestinationPath $Zip -Force
