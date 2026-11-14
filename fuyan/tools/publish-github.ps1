# 复研 · 发布到 GitHub（一条命令）
#
#   # 先登录（只需要一次）：
#   gh auth login --hostname github.com --git-protocol https
#
#   # 打包 + 生成在线存档清单（不联网，只出 dist/）：
#   .\tools\publish-github.ps1 -Repo makainuo/fuyan -DryRun
#
#   # 真正推送（会建仓库、push、打 Release）：
#   .\tools\publish-github.ps1 -Repo makainuo/fuyan -Tag v0.1.0
#
param(
  [string]$Repo = "makainuo/fuyan",
  [string]$Tag = "",
  [switch]$DryRun,
  [switch]$Private
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Find-Gh {
  $p = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $p) { return $p }
  return "gh"
}
$gh = Find-Gh

# 版本号
$ver = (Get-Content (Join-Path $root "version.json") -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (-not $Tag) { $Tag = "v$ver" }
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Write-Host "== 1/5 打包软件 ==" -ForegroundColor Cyan
$stage = Join-Path $env:TEMP ("fuyan-pack-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$items = @("server.js", "lib", "web", "tools", "docs", "assets", "README.md", "package.json",
           "version.json", "启动复研.bat", "启动复研.vbs", ".gitignore", ".gitattributes")
foreach ($i in $items) {
  $p = Join-Path $root $i
  if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $stage -Recurse -Force }
}
# 不带存档、不带用户数据、不带 node_modules；截图也不进安装包（省体积）
Remove-Item (Join-Path $stage "data") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $stage "docs\screens") -Recurse -Force -ErrorAction SilentlyContinue
$zip = Join-Path $dist ("fuyan-v$ver.zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force
Write-Host "   $zip  ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
# 安全检查：安装包里绝不能带用户数据（批注 / 对话 / 进度 / 配置）
Add-Type -AssemblyName System.IO.Compression.FileSystem
$za = [System.IO.Compression.ZipFile]::OpenRead($zip)
$names = $za.Entries | ForEach-Object { $_.FullName }
$za.Dispose()
$leak = $names | Where-Object { $_ -match '(^|/)(data|node_modules)/' -or $_ -match 'annotations\.json|ai-threads\.json|progress\.json|config\.json' }
if ($leak) { throw "安装包里发现用户数据，已中止：$($leak -join ', ')" }
Write-Host "   检查：无批注 / 对话 / 配置等用户数据" -ForegroundColor DarkGray

Write-Host "== 2/5 生成在线存档清单 ==" -ForegroundColor Cyan
$env:PYTHONIOENCODING = "utf-8"
& node (Join-Path $root "tools\make-catalog.mjs") --repo $Repo --out $dist
if ($LASTEXITCODE -ne 0) { throw "生成 archives.json 失败" }

if ($DryRun) {
  Write-Host "`n[DryRun] dist/ 已生成，没有联网。" -ForegroundColor Yellow
  Get-ChildItem $dist | Select-Object Name, Length
  exit 0
}

Write-Host "== 3/5 检查 GitHub 登录 ==" -ForegroundColor Cyan
& $gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "gh 未登录。先运行：gh auth login --hostname github.com --git-protocol https"
}

Write-Host "== 4/5 建仓库 / 提交 / 推送 ==" -ForegroundColor Cyan
& $gh repo view $Repo 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  $vis = if ($Private) { "--private" } else { "--public" }
  & $gh repo create $Repo $vis --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw "建仓库失败" }
} else {
  $hasRemote = (git remote) -contains "origin"
  if (-not $hasRemote) { git remote add origin "https://github.com/$Repo.git" }
  git add -A
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { git commit -m "release $Tag" | Out-Null }
  git push -u origin HEAD
  if ($LASTEXITCODE -ne 0) { throw "推送失败（网络或权限）" }
}

Write-Host "== 5/5 打 Release ==" -ForegroundColor Cyan
$notes = "复研 MedReview $Tag · 软件包 + 在线存档清单"
$assets = @($zip, (Join-Path $dist "archives.json")) + (Get-ChildItem $dist -Filter "*.zip" | Where-Object { $_.FullName -ne $zip } | ForEach-Object { $_.FullName })
& $gh release create $Tag --repo $Repo --title "复研 MedReview $Tag" --notes $notes @assets
if ($LASTEXITCODE -ne 0) { Write-Host "  Release 创建失败（可能已存在），不影响仓库内的文件" -ForegroundColor Yellow }

Write-Host "`n完成。把下面两行填进「设置」：" -ForegroundColor Green
Write-Host ("  软件更新 → GitHub 仓库： " + $Repo)
Write-Host ("  在线存档库： https://cdn.jsdelivr.net/gh/$Repo@main/dist/archives.json")
