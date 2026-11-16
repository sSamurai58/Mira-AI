# Called from NSIS customInit before Mira.exe is replaced.
$ErrorActionPreference = "SilentlyContinue"

$ud = Join-Path $env:APPDATA "Mira"
$dir = Join-Path $ud "launcher"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$lock = Join-Path $ud "mira-updating.lock"
Set-Content -LiteralPath $lock -Value "nsis" -Encoding UTF8

$srcRoot = $PSScriptRoot
if (-not $srcRoot) { $srcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }

# Prefer files shipped next to this script (copied into installer resources).
$ps1Src = Join-Path $srcRoot "updating.ps1"
$vbsSrc = Join-Path $srcRoot "Mira.vbs"
$ps1Dst = Join-Path $dir "updating.ps1"
$vbsDst = Join-Path $dir "Mira.vbs"

if (Test-Path -LiteralPath $ps1Src) {
  Copy-Item -LiteralPath $ps1Src -Destination $ps1Dst -Force
}
if (Test-Path -LiteralPath $vbsSrc) {
  Copy-Item -LiteralPath $vbsSrc -Destination $vbsDst -Force
}

$exeFile = Join-Path $ud "install-exe.path"
if (-not (Test-Path -LiteralPath $exeFile)) {
  $guess = Join-Path $env:LOCALAPPDATA "Programs\Mira\Mira.exe"
  Set-Content -LiteralPath $exeFile -Value $guess -Encoding UTF8
}

$ws = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path $env:USERPROFILE "Desktop\Mira.lnk"),
  (Join-Path $env:USERPROFILE "OneDrive\Desktop\Mira.lnk"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Mira.lnk")
)
foreach ($t in $targets) {
  if (Test-Path -LiteralPath $t) {
    $sc = $ws.CreateShortcut($t)
    $sc.TargetPath = $vbsDst
    $sc.Description = "Mira"
    $sc.Save()
  }
}

if (Test-Path -LiteralPath $ps1Dst) {
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $ps1Dst
  ) -WindowStyle Hidden
}
