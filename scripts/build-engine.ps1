$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$engineSource = Join-Path $repoRoot "schema_batch_engine.py"
$requirementsFile = Join-Path $repoRoot "requirements.txt"
$outputDir = Join-Path $repoRoot "src-tauri\binaries"
$outputExe = Join-Path $outputDir "schema-batch-engine.exe"
$pyInstallerWorkDir = Join-Path $repoRoot ".pyinstaller"
$pyInstallerDistDir = Join-Path $repoRoot "dist-python"
$pyInstallerSpecDir = Join-Path $repoRoot "build"

if (-not (Test-Path $engineSource)) {
  throw "未找到 Python 引擎脚本: $engineSource"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $pyInstallerWorkDir | Out-Null
New-Item -ItemType Directory -Force -Path $pyInstallerDistDir | Out-Null
New-Item -ItemType Directory -Force -Path $pyInstallerSpecDir | Out-Null

Write-Host "== Build Engine =="
python --version

Write-Host ""
Write-Host "== Install Python build deps =="
python -m pip install --upgrade pip
python -m pip install -r $requirementsFile pyinstaller

Write-Host ""
Write-Host "== Package engine exe =="
python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name "schema-batch-engine" `
  --distpath $pyInstallerDistDir `
  --workpath $pyInstallerWorkDir `
  --specpath $pyInstallerSpecDir `
  $engineSource

$generatedExe = Join-Path $pyInstallerDistDir "schema-batch-engine.exe"
if (-not (Test-Path $generatedExe)) {
  throw "PyInstaller 构建完成后未找到 exe: $generatedExe"
}

Copy-Item -Force $generatedExe $outputExe

Write-Host ""
Write-Host "== Done =="
Write-Host "Engine output: $outputExe"
