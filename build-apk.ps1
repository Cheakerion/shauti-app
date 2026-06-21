# ============================================================
# 刷题 APK 构建脚本 (v2 — 已验证可用)
# 用法: powershell -ExecutionPolicy Bypass -File build-apk.ps1
# 前提: npm run build 已完成，SDK 36 已安装
# ============================================================
param(
    [string]$ApkName = "刷题",
    [string]$KeystorePass = "quiz123456",
    [string]$KeystoreAlias = "quiz"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 确保 node/npm 在 PATH 中
$env:PATH = "D:\hermes\node;" + $env:PATH
$NpmExe = "D:\hermes\node\npm.cmd"
$NodeExe = "D:\hermes\node\node.exe"

Set-Location $ScriptDir

$SdkDir = "D:\android-sdk"
$Aapt = "$SdkDir\build-tools\34.0.0\aapt.exe"
$BuildTools36 = "$SdkDir\build-tools\36.0.0"
$AndroidJar = "$SdkDir\platforms\android-36\android.jar"
$ApkBuildDir = "$ScriptDir\apk-build"
$DistDir = "$ScriptDir\dist"
$Keystore = "$ApkBuildDir\quiz.keystore"

# ============================================================
# Step 1: Build web app
# ============================================================
Write-Host "[1/5] Building web app..." -ForegroundColor Yellow
& $NpmExe run build
if ($LASTEXITCODE -ne 0) { throw "npm build failed" }

# ============================================================
# Step 2: Copy assets to apk-build
# ============================================================
Write-Host "[2/5] Copying assets..." -ForegroundColor Yellow
$AssetsDir = "$ApkBuildDir\assets"
if (Test-Path $AssetsDir) { Remove-Item -Recurse -Force $AssetsDir }
Copy-Item -Recurse "$DistDir\*" $AssetsDir

# ============================================================
# Step 3: Compile Java -> DEX + Package base APK with aapt
# ============================================================
Write-Host "[3/5] Building APK..." -ForegroundColor Yellow

# Clean
$ClassesDir = "$ApkBuildDir\classes"; $ObjDir = "$ApkBuildDir\obj"
if (Test-Path $ClassesDir) { Remove-Item -Recurse -Force $ClassesDir }
if (Test-Path $ObjDir) { Remove-Item -Recurse -Force $ObjDir }
New-Item -ItemType Directory -Force -Path $ClassesDir | Out-Null
New-Item -ItemType Directory -Force -Path $ObjDir | Out-Null

# Compile Java
$JavaSrc = "$ApkBuildDir\src\com\quiz\app\MainActivity.java"
& javac -encoding UTF-8 -d $ClassesDir -cp $AndroidJar $JavaSrc
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

# Convert to DEX (pass all .class files — 内部类数量可能变化)
$ClassFiles = Get-ChildItem "$ClassesDir\com\quiz\app" -Filter "*.class" | ForEach-Object { $_.FullName }
& "$BuildTools36\d8.bat" --lib $AndroidJar --output $ObjDir @ClassFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

# Package base APK (aapt v1, needs res/values/strings.xml)
$BaseApk = "$ApkBuildDir\base.apk"
& $Aapt package -f -M "$ApkBuildDir\AndroidManifest.xml" -I $AndroidJar -S "$ApkBuildDir\res" -F $BaseApk
if ($LASTEXITCODE -ne 0) { throw "aapt failed" }

# Add classes.dex + assets using Python
$WithDexApk = "$ApkBuildDir\with-dex.apk"
Copy-Item $BaseApk $WithDexApk -Force

$PythonScript = @"
import zipfile, os
z = zipfile.ZipFile(r'$WithDexApk', 'a', zipfile.ZIP_DEFLATED)
z.write(r'$ObjDir\classes.dex', 'classes.dex')
for root, dirs, files in os.walk(r'$AssetsDir'):
    for f in files:
        fp = os.path.join(root, f)
        rel = os.path.relpath(fp, r'$AssetsDir')
        z.write(fp, 'assets/' + rel.replace(os.sep, '/'))
z.close()
apk_path = r'$WithDexApk'
print(f'APK size: {os.path.getsize(apk_path)} bytes')
"@
python -c $PythonScript
if ($LASTEXITCODE -ne 0) { throw "Failed to add dex/assets" }

# ============================================================
# Step 4: Align (MUST be before signing!)
# ============================================================
Write-Host "[4/5] Aligning APK..." -ForegroundColor Yellow
$AlignedApk = "$ApkBuildDir\aligned.apk"
& "$BuildTools36\zipalign.exe" -f 4 $WithDexApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

# ============================================================
# Step 5: Sign APK (MUST be last!)
# ============================================================
Write-Host "[5/5] Signing APK..." -ForegroundColor Yellow
$OutApk = "$ScriptDir\$ApkName.apk"
& "$BuildTools36\apksigner.bat" sign --ks $Keystore --ks-pass pass:$KeystorePass --ks-key-alias $KeystoreAlias --out $OutApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

# Copy to releases
$ReleasesDir = "$ScriptDir\releases"
if (-not (Test-Path $ReleasesDir)) { New-Item -ItemType Directory -Force $ReleasesDir | Out-Null }
Copy-Item $OutApk "$ReleasesDir\$ApkName.apk" -Force

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "BUILD SUCCESS!" -ForegroundColor Green
Write-Host "Output: $OutApk" -ForegroundColor Green
Write-Host "Size: $((Get-Item $OutApk).Length) bytes" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Cleanup
Remove-Item -Recurse -Force $ClassesDir, $ObjDir, $BaseApk, $WithDexApk, $AlignedApk -ErrorAction SilentlyContinue
