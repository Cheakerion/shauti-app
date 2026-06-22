# Inline JS+CSS into single HTML for WebView
param(
    [string]$DistDir = "dist"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DistPath = "$ProjectDir\$DistDir"
$HtmlFile = "$DistPath\index.html"
$OutputPath = "$DistPath\inline.html"

$html = Get-Content $HtmlFile -Raw -Encoding UTF8

# Find JS references and inline them
$html = [regex]::Replace($html, '<script[^>]*src="([^"]*\.js)"[^>]*></script>', {
    param($m)
    $jsFile = "$DistPath\$($m.Groups[1].Value)"
    if (Test-Path $jsFile) {
        $js = Get-Content $jsFile -Raw -Encoding UTF8
        return "<script>$js</script>"
    }
    return $m.Value
})

# Find CSS references and inline them
$html = [regex]::Replace($html, '<link[^>]*href="([^"]*\.css)"[^>]*>', {
    param($m)
    $cssFile = "$DistPath\$($m.Groups[1].Value)"
    if (Test-Path $cssFile) {
        $css = Get-Content $cssFile -Raw -Encoding UTF8
        return "<style>$css</style>"
    }
    return $m.Value
})

# Remove service worker registration scripts
$html = $html -replace '<script[^>]*registerSW[^>]*></script>', ''
$html = $html -replace '<link rel="manifest"[^>]*>', ''

Set-Content $OutputPath $html -Encoding UTF8
Write-Host "Inline HTML: $((Get-Item $OutputPath).Length) bytes"
